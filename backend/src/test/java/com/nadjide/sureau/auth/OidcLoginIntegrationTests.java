package com.nadjide.sureau.auth;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Own context with enterprise sign-in pointing at a local provider that only answers discovery.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OidcLoginIntegrationTests {
    private static final HttpServer PROVIDER = provider();
    private static final String ISSUER = "http://127.0.0.1:" + PROVIDER.getAddress().getPort() + "/realms/sureau";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired OidcLogin oidc;

    @DynamicPropertySource
    static void enterpriseSignIn(DynamicPropertyRegistry registry) {
        registry.add("sureau.oidc.issuer", () -> ISSUER);
        registry.add("sureau.oidc.client-id", () -> "sureau-test");
        registry.add("sureau.oidc.client-secret", () -> "test-secret");
        registry.add("sureau.oidc.name", () -> "Annuaire de test");
    }

    @AfterAll
    static void stopProvider() {
        PROVIDER.stop(0);
    }

    @BeforeEach
    void seedAccounts() {
        jdbc.update("DELETE FROM spring_session");
        jdbc.update("DELETE FROM app_users");
        jdbc.update("""
                INSERT INTO app_users (username, display_name, password_hash, role, enabled, email) VALUES
                ('camille', 'Camille Bernard', 'not-a-password-hash', 'EDITOR', true, 'Camille.Bernard@exemple.fr'),
                ('ancien', 'Ancien compte', 'not-a-password-hash', 'VIEWER', false, 'ancien@exemple.fr')
                """);
    }

    @Test
    void announcesEnterpriseSignInAndSendsThePersonToTheProvider() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(jsonPath("$.sso.name").value("Annuaire de test"));

        String location = mvc.perform(get("/oauth2/authorization/oidc"))
                .andExpect(status().is3xxRedirection())
                .andReturn().getResponse().getRedirectedUrl();
        URI redirect = URI.create(location);
        assertThat(location).startsWith(ISSUER + "/protocol/openid-connect/auth?");
        assertThat(redirect.getQuery()).contains("response_type=code", "client_id=sureau-test", "scope=openid profile email",
                "redirect_uri=http://localhost/login/oauth2/code/oidc", "state=", "nonce=");
    }

    @Test
    void opensTheEnabledAccountWithTheSameEmailWithoutRegardToCase() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpSession session = new MockHttpSession();
        request.setSession(session);
        MockHttpServletResponse response = new MockHttpServletResponse();

        oidc.signIn(request, response, identity(Map.of("email", "camille.bernard@EXEMPLE.fr", "email_verified", true)));

        assertThat(response.getRedirectedUrl()).isEqualTo("/");
        mvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("camille"))
                .andExpect(jsonPath("$.role").value("EDITOR"));
    }

    @Test
    void neverOpensAnUnknownDisabledOrUnverifiedIdentity() throws Exception {
        for (Map<String, Object> claims : List.<Map<String, Object>>of(
                Map.of("email", "inconnu@exemple.fr", "email_verified", true),
                Map.of("email", "ancien@exemple.fr", "email_verified", true),
                Map.of("email", "camille.bernard@exemple.fr", "email_verified", false),
                Map.of("preferred_username", "camille"))) {
            MockHttpServletRequest request = new MockHttpServletRequest();
            MockHttpSession session = new MockHttpSession();
            request.setSession(session);
            MockHttpServletResponse response = new MockHttpServletResponse();

            oidc.signIn(request, response, identity(claims));

            assertThat(response.getRedirectedUrl()).as(claims.toString()).isEqualTo("/?sso=no-account");
            assertThat(session.isInvalid()).as(claims.toString()).isTrue();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class)).isEqualTo(2);
    }

    private static OAuth2AuthenticationToken identity(Map<String, Object> claims) {
        Map<String, Object> all = new java.util.HashMap<>(claims);
        all.put("sub", "subject-1");
        all.put("iss", ISSUER);
        OidcIdToken token = new OidcIdToken("id-token", Instant.now(), Instant.now().plusSeconds(60), all);
        DefaultOidcUser user = new DefaultOidcUser(AuthorityUtils.createAuthorityList("OIDC_USER"), token, "sub");
        return new OAuth2AuthenticationToken(user, user.getAuthorities(), OidcLogin.REGISTRATION_ID);
    }

    private static HttpServer provider() {
        try {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/realms/sureau/.well-known/openid-configuration", exchange -> {
                String issuer = "http://127.0.0.1:" + server.getAddress().getPort() + "/realms/sureau";
                byte[] body = """
                        {"issuer":"%1$s","authorization_endpoint":"%1$s/protocol/openid-connect/auth",
                         "token_endpoint":"%1$s/protocol/openid-connect/token","jwks_uri":"%1$s/protocol/openid-connect/certs",
                         "response_types_supported":["code"],"subject_types_supported":["public"],
                         "id_token_signing_alg_values_supported":["RS256"]}
                        """.formatted(issuer).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
                exchange.close();
            });
            server.start();
            return server;
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
