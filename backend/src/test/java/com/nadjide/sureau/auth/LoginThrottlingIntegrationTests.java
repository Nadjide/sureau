package com.nadjide.sureau.auth;

import java.util.LinkedHashMap;
import java.util.Map;

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
import org.springframework.test.context.TestPropertySource;
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

// Own context with a low client threshold: the shared test context relaxes it for the whole suite.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "sureau.login.client-threshold=8")
class LoginThrottlingIntegrationTests {
    private static final String PASSWORD = "Sureau-integration-42!";
    private static final String SETUP_TOKEN = "integration-setup-token";

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired LoginAttemptGuard guard;

    @BeforeEach
    @AfterEach
    void reset() {
        guard.clear();
        jdbc.update("DELETE FROM spring_session");
        jdbc.update("DELETE FROM app_users");
    }

    @Test
    void locksAnAccountBeforeCheckingItsPasswordAndLeavesOtherAccountsAlone() throws Exception {
        seedUser("admin", "ADMIN");
        seedUser("editor", "EDITOR");
        Browser attacker = new Browser();
        for (int i = 0; i < 5; i++) attacker.login("admin", "not-the-password").andExpect(status().isUnauthorized());

        ResultActions locked = new Browser().login("admin", PASSWORD)
                .andExpect(status().isTooManyRequests())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"));
        String retryAfter = locked.andReturn().getResponse().getHeader("Retry-After");
        assertThat(Integer.parseInt(retryAfter)).isBetween(1, 30);

        new Browser().login("editor", PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void aSuccessfulLoginResetsTheAccountCounter() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        for (int i = 0; i < 4; i++) browser.login("admin", "not-the-password").andExpect(status().isUnauthorized());
        browser.login("admin", PASSWORD).andExpect(status().isNoContent());
        // Without the reset the account would count 7 failures; the client stays below its threshold of 8.
        for (int i = 0; i < 3; i++) browser.login("Admin", "not-the-password").andExpect(status().isUnauthorized());
        new Browser().login("admin", PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void locksAClientThatTriesManyAccounts() throws Exception {
        seedUser("admin", "ADMIN");
        Browser attacker = new Browser();
        for (int i = 0; i < 8; i++) attacker.login("guess-" + i, "not-the-password").andExpect(status().isUnauthorized());
        attacker.login("admin", PASSWORD).andExpect(status().isTooManyRequests());
    }

    @Test
    void locksSetupTokenGuessing() throws Exception {
        Browser attacker = new Browser();
        for (int i = 0; i < 8; i++) {
            attacker.jsonPost("/api/auth/setup", setupPayload("wrong-token-" + i)).andExpect(status().isForbidden());
        }
        attacker.jsonPost("/api/auth/setup", setupPayload(SETUP_TOKEN)).andExpect(status().isTooManyRequests());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class)).isZero();
    }

    private void seedUser(String username, String role) {
        jdbc.update("INSERT INTO app_users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
                username, "Compte " + username, passwordEncoder.encode(PASSWORD), role);
    }

    private String setupPayload(String token) {
        return mapper.writeValueAsString(Map.of("setupToken", token, "username", "admin",
                "displayName", "Administrateur", "password", PASSWORD));
    }

    private final class Browser {
        private final Map<String, Cookie> jar = new LinkedHashMap<>();

        ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
            if (!jar.isEmpty()) request.cookie(jar.values().toArray(Cookie[]::new));
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
