package com.nadjide.sureau.auth;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final OidcLogin oidc;

    public AuthController(AuthService auth, OidcLogin oidc) {
        this.auth = auth;
        this.oidc = oidc;
    }

    @GetMapping("/status")
    public SetupStatus status() {
        return new SetupStatus(auth.setupRequired(), oidc.enabled() ? new EnterpriseSignIn(oidc.displayName()) : null);
    }

    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) {
        return new CsrfResponse(token.getToken(), token.getHeaderName());
    }

    @PostMapping("/setup")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse setup(@Valid @RequestBody SetupRequest request) {
        return auth.setup(request);
    }

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        return auth.currentUser(authentication.getName());
    }

    @PostMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(@AuthenticationPrincipal SessionPrincipal principal,
                               @Valid @RequestBody ChangePasswordRequest request) {
        auth.changeOwnPassword(principal, request);
    }

    /** {@code sso} is null unless enterprise sign-in is configured; its name may be null too. */
    public record SetupStatus(boolean setupRequired, EnterpriseSignIn sso) {}
    public record EnterpriseSignIn(String name) {}
    public record CsrfResponse(String token, String headerName) {}
}
