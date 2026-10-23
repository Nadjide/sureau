package com.nadjide.sureau.auth;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AuthApiIntegrationTests {
    private static final String SETUP_TOKEN = "integration-setup-token";
    private static final String PASSWORD = "Sureau-integration-42!";
    private static final String ASSET = """
            {"assetTag":"AUTH-PC-01","name":"Poste authentifié","category":"COMPUTER","status":"AVAILABLE"}
            """;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwordEncoder;

    @BeforeEach
    @AfterEach
    void clearIsolatedTestData() {
        jdbc.update("DELETE FROM spring_session");
        jdbc.update("DELETE FROM app_users");
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void exposesOnlyBootstrapAndHealthToAnonymousClients() throws Exception {
        Browser browser = new Browser();
        browser.perform(get("/api/auth/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.setupRequired").value(true));
        browser.perform(get("/api/auth/csrf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.headerName").isNotEmpty());
        browser.perform(get("/actuator/health")).andExpect(status().isOk());
        browser.perform(get("/api/assets"))
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void bootstrapRequiresBothCsrfAndTheInstallationToken() throws Exception {
        Browser browser = new Browser();
        browser.perform(post("/api/auth/setup").contentType(MediaType.APPLICATION_JSON)
                        .content(setupPayload(SETUP_TOKEN, "admin", "Administrateur", PASSWORD)))
                .andExpect(status().isForbidden());
        browser.jsonPost("/api/auth/setup", setupPayload("incorrect-token", "admin", "Administrateur", PASSWORD))
                .andExpect(status().isForbidden());
        assertThat(userCount()).isZero();
        browser.perform(get("/api/auth/status"))
                .andExpect(jsonPath("$.setupRequired").value(true));
    }

    @Test
    void bootstrapNormalizesTheAdministratorAndStoresOnlyAPasswordHash() throws Exception {
        Browser browser = new Browser();
        browser.jsonPost("/api/auth/setup", setupPayload(SETUP_TOKEN, "  Admin.Test  ", "  Nadjide Omar  ", PASSWORD))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.username").value("admin.test"))
                .andExpect(jsonPath("$.displayName").value("Nadjide Omar"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.setupToken").doesNotExist());
        String hash = jdbc.queryForObject("SELECT password_hash FROM app_users WHERE username = ?", String.class, "admin.test");
        assertThat(hash).isNotEqualTo(PASSWORD);
        assertThat(passwordEncoder.matches(PASSWORD, hash)).isTrue();
        browser.perform(get("/api/auth/status"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.setupRequired").value(false));
        browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void bootstrapCannotCreateASecondAdministrator() throws Exception {
        Browser first = new Browser();
        first.jsonPost("/api/auth/setup", setupPayload(SETUP_TOKEN, "admin", "Premier", PASSWORD))
                .andExpect(status().isCreated());
        new Browser().jsonPost("/api/auth/setup", setupPayload(SETUP_TOKEN, "second", "Deuxième", PASSWORD))
                .andExpect(status().isConflict());
        assertThat(userCount()).isOne();
        assertThat(jdbc.queryForObject("SELECT username FROM app_users", String.class)).isEqualTo("admin");
    }

    @Test
    void concurrentBootstrapRequestsCreateExactlyOneAdministrator() throws Exception {
        Browser first = new Browser();
        Browser second = new Browser();
        var requests = List.of(
                first.withCsrf(post("/api/auth/setup").contentType(MediaType.APPLICATION_JSON)
                        .content(setupPayload(SETUP_TOKEN, "admin-one", "Premier", PASSWORD))),
                second.withCsrf(post("/api/auth/setup").contentType(MediaType.APPLICATION_JSON)
                        .content(setupPayload(SETUP_TOKEN, "admin-two", "Deuxième", PASSWORD))));
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = List.of(0, 1).stream().map(index -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent bootstrap did not start.");
                return (index == 0 ? first : second).perform(requests.get(index))
                        .andReturn().getResponse().getStatus();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(futures.get(0).get(30, TimeUnit.SECONDS), futures.get(1).get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        } finally {
            start.countDown();
        }
        assertThat(userCount()).isOne();
    }

    @Test
    void rejectsInvalidBootstrapFieldsIncludingPasswordsExceedingTheUtf8Limit() throws Exception {
        var invalid = List.of(
                setupPayload(SETUP_TOKEN, "ab", "Administrateur", PASSWORD),
                setupPayload(SETUP_TOKEN, "not an account", "Administrateur", PASSWORD),
                setupPayload(SETUP_TOKEN, "a".repeat(51), "Administrateur", PASSWORD),
                setupPayload(SETUP_TOKEN, "admin", " ", PASSWORD),
                setupPayload(SETUP_TOKEN, "admin", "N".repeat(81), PASSWORD),
                setupPayload(SETUP_TOKEN, "admin", "Administrateur", "short"),
                setupPayload(SETUP_TOKEN, "admin", "Administrateur", "a".repeat(65)),
                setupPayload(SETUP_TOKEN, "admin", "Administrateur", "é".repeat(37)));
        Browser browser = new Browser();
        for (String payload : invalid) {
            browser.jsonPost("/api/auth/setup", payload)
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        }
        assertThat(userCount()).isZero();
    }

    @Test
    void acceptsAPasswordAtTheUtf8BoundaryAndDoesNotTrimIt() throws Exception {
        String boundary = "é".repeat(35) + "  ";
        Browser browser = new Browser();
        browser.jsonPost("/api/auth/setup", setupPayload(SETUP_TOKEN, "admin", "Administrateur", boundary))
                .andExpect(status().isCreated());
        browser.login("admin", boundary).andExpect(status().isNoContent());
        browser.perform(get("/api/auth/me")).andExpect(status().isOk());
        new Browser().login("admin", boundary.trim()).andExpect(status().isUnauthorized());
    }

    @Test
    void loginRequiresCsrfAndBadCredentialsDoNotCreateAnAuthenticatedSession() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        browser.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "admin").param("password", PASSWORD))
                .andExpect(status().isForbidden());
        browser.login("admin", "wrong-password")
                .andExpect(status().isUnauthorized())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        assertThat(authenticatedSessionCount("admin")).isZero();
        browser.login("unknown-user", PASSWORD).andExpect(status().isUnauthorized());
        browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void loginRotatesTheSessionAndPersistsAuthenticationInPostgresql() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        browser.perform(get("/api/auth/csrf")).andExpect(status().isOk());
        String anonymousSession = browser.sessionCookie();
        var staleWrite = browser.withCsrf(post("/api/assets").contentType(MediaType.APPLICATION_JSON).content(ASSET));
        var login = browser.login("  ADMIN  ", PASSWORD).andExpect(status().isNoContent()).andReturn();
        assertThat(login.getResponse().getHeaders("Set-Cookie"))
                .anySatisfy(header -> assertThat(header).contains("HttpOnly", "SameSite=Lax"));
        assertThat(browser.sessionCookie()).isNotBlank().isNotEqualTo(anonymousSession);
        assertThat(authenticatedSessionCount("admin")).isOne();
        browser.perform(staleWrite).andExpect(status().isForbidden());

        // Only the cookie crosses requests: no MockHttpSession or mock SecurityContext is supplied.
        Browser anotherServletRequest = new Browser(browser.cookies());
        anotherServletRequest.perform(get("/api/auth/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.displayName").value("Compte admin"))
                .andExpect(jsonPath("$.role").value("ADMIN"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void authenticatedWritesAndLogoutRequireCsrfAndLogoutInvalidatesTheStoredSession() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        browser.login("admin", PASSWORD).andExpect(status().isNoContent());
        browser.perform(post("/api/assets").contentType(MediaType.APPLICATION_JSON).content(ASSET))
                .andExpect(status().isForbidden());
        browser.perform(post("/api/assets").header("X-CSRF-TOKEN", "incorrect-token")
                        .contentType(MediaType.APPLICATION_JSON).content(ASSET))
                .andExpect(status().isForbidden());
        browser.jsonPost("/api/assets", ASSET).andExpect(status().isCreated());
        browser.perform(post("/api/auth/logout")).andExpect(status().isForbidden());
        browser.perform(get("/api/auth/me")).andExpect(status().isOk());

        Cookie[] oldCookies = browser.cookies();
        browser.perform(browser.withCsrf(post("/api/auth/logout"))).andExpect(status().isNoContent());
        assertThat(authenticatedSessionCount("admin")).isZero();
        browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        new Browser(oldCookies).perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assets", Long.class)).isOne();
    }

    @Test
    void viewerCanReadButCannotWriteOrAccessAdministration() throws Exception {
        seedUser("viewer", "VIEWER");
        Browser browser = new Browser();
        browser.login("viewer", PASSWORD).andExpect(status().isNoContent());
        browser.perform(get("/api/assets")).andExpect(status().isOk());
        browser.jsonPost("/api/assets", ASSET).andExpect(status().isForbidden());
        browser.perform(get("/api/users")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM assets", Long.class)).isZero();
    }

    @Test
    void editorCanWriteInventoryButCannotAccessAdministration() throws Exception {
        seedUser("editor", "EDITOR");
        Browser browser = new Browser();
        browser.login("editor", PASSWORD).andExpect(status().isNoContent());
        browser.jsonPost("/api/assets", ASSET).andExpect(status().isCreated());
        browser.perform(get("/api/users")).andExpect(status().isForbidden());
    }

    private void seedUser(String username, String role) {
        jdbc.update("INSERT INTO app_users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
                username, "Compte " + username, passwordEncoder.encode(PASSWORD), role);
    }

    private long userCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class);
    }

    private long authenticatedSessionCount(String username) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM spring_session WHERE principal_name = ?", Long.class, username);
    }

    private String setupPayload(String token, String username, String displayName, String password) {
        return mapper.writeValueAsString(Map.of("setupToken", token, "username", username,
                "displayName", displayName, "password", password));
    }

    private final class Browser {
        private final Map<String, Cookie> jar = new LinkedHashMap<>();

        Browser(Cookie... cookies) {
            Arrays.stream(cookies).forEach(cookie -> jar.put(cookie.getName(), cookie));
        }

        Cookie[] cookies() {
            return jar.values().toArray(Cookie[]::new);
        }

        String sessionCookie() {
            Cookie cookie = jar.get("SESSION");
            return cookie == null ? null : cookie.getValue();
        }

        ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
            Cookie[] cookies = cookies();
            if (cookies.length > 0) request.cookie(cookies);
            ResultActions result = mvc.perform(request);
            for (Cookie cookie : result.andReturn().getResponse().getCookies()) {
                if (cookie.getMaxAge() == 0) jar.remove(cookie.getName());
                else jar.put(cookie.getName(), cookie);
            }
            return result;
        }

        MockHttpServletRequestBuilder withCsrf(MockHttpServletRequestBuilder request) throws Exception {
            String response = perform(get("/api/auth/csrf")).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            JsonNode token = mapper.readTree(response);
            return request.header(token.path("headerName").asString(), token.path("token").asString());
        }

        ResultActions jsonPost(String path, String payload) throws Exception {
            return perform(withCsrf(post(path).contentType(MediaType.APPLICATION_JSON).content(payload)));
        }

        ResultActions login(String username, String password) throws Exception {
            return perform(withCsrf(post("/api/auth/login").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("username", username).param("password", password)));
        }
    }
}
