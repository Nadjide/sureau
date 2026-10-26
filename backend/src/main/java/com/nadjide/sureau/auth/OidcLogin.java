package com.nadjide.sureau.auth;

import java.io.IOException;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.client.registration.ClientRegistration;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrations;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizedClientRepository;
import org.springframework.security.oauth2.client.OAuth2AuthorizedClient;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Enterprise sign-in through one OpenID Connect provider. The provider only proves who the person is: it opens the
 * enabled Sureau account whose e-mail address matches the verified identity, and never creates an account.
 */
@Component
public class OidcLogin {
    static final String REGISTRATION_ID = "oidc";
    private static final Logger LOG = LoggerFactory.getLogger(OidcLogin.class);

    private final String issuer;
    private final String clientId;
    private final String clientSecret;
    private final String name;
    private final UserRepository users;
    private final HttpSessionSecurityContextRepository contexts = new HttpSessionSecurityContextRepository();
    private volatile ClientRegistration registration;

    OidcLogin(@Value("${sureau.oidc.issuer:}") String issuer, @Value("${sureau.oidc.client-id:}") String clientId,
              @Value("${sureau.oidc.client-secret:}") String clientSecret, @Value("${sureau.oidc.name:}") String name,
              UserRepository users) {
        this.issuer = issuer.trim();
        this.clientId = clientId.trim();
        this.clientSecret = clientSecret.trim();
        this.name = name.trim();
        this.users = users;
    }

    public boolean enabled() {
        return !issuer.isEmpty() && !clientId.isEmpty();
    }

    /** The provider name shown on the sign-in button; null lets the interface use its generic wording. */
    public String displayName() {
        return name.isEmpty() ? null : name;
    }

    /**
     * The provider is discovered on first use and kept once found: an unreachable provider never prevents the
     * application from starting, and password sign-in keeps working meanwhile.
     */
    ClientRegistrationRepository registrations() {
        return registrationId -> REGISTRATION_ID.equals(registrationId) ? registration() : null;
    }

    private ClientRegistration registration() {
        ClientRegistration current = registration;
        if (current != null || !enabled()) return current;
        synchronized (this) {
            if (registration == null) {
                try {
                    registration = ClientRegistrations.fromIssuerLocation(issuer)
                            .registrationId(REGISTRATION_ID)
                            .clientId(clientId)
                            .clientSecret(clientSecret)
                            .clientName(name.isEmpty() ? "OpenID Connect" : name)
                            .scope("openid", "profile", "email")
                            .redirectUri("{baseUrl}/login/oauth2/code/{registrationId}")
                            .build();
                } catch (RuntimeException exception) {
                    LOG.warn("The OpenID Connect provider {} could not be discovered: {}", issuer, exception.getMessage());
                }
            }
            return registration;
        }
    }

    /** Sureau keeps its own session; the provider's tokens are not needed after sign-in. */
    static OAuth2AuthorizedClientRepository discardedTokens() {
        return new OAuth2AuthorizedClientRepository() {
            @Override
            public <T extends OAuth2AuthorizedClient> T loadAuthorizedClient(String id, Authentication principal,
                                                                             HttpServletRequest request) {
                return null;
            }

            @Override
            public void saveAuthorizedClient(OAuth2AuthorizedClient client, Authentication principal,
                                             HttpServletRequest request, HttpServletResponse response) {}

            @Override
            public void removeAuthorizedClient(String id, Authentication principal, HttpServletRequest request,
                                               HttpServletResponse response) {}
        };
    }

    /** Replaces the provider identity by the matching account, or refuses the sign-in without opening a session. */
    void signIn(HttpServletRequest request, HttpServletResponse response, Authentication authentication) throws IOException {
        Optional<UserAccount> account = authentication.getPrincipal() instanceof OidcUser user
                && user.getEmail() != null && !Boolean.FALSE.equals(user.getEmailVerified())
                ? users.findByEmail(user.getEmail()).filter(UserAccount::enabled)
                : Optional.empty();
        if (account.isEmpty()) {
            refuse(request, response, "no-account");
            return;
        }
        SessionPrincipal principal = new SessionPrincipal(account.get());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        response.sendRedirect(request.getContextPath() + "/");
    }

    static void refuse(HttpServletRequest request, HttpServletResponse response, String reason) throws IOException {
        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) session.invalidate();
        response.sendRedirect(request.getContextPath() + "/?sso=" + reason);
    }
}
