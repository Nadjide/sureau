package com.nadjide.sureau.auth;

import java.util.Arrays;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Own context with an instance-specific cookie name, as the deployment files configure it.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@TestPropertySource(properties = "sureau.session.cookie-name=SUREAU_SESSION_test-instance")
class SessionCookieNameIntegrationTests {
    private static final String COOKIE = "SUREAU_SESSION_test-instance";
    private static final String PASSWORD = "Sureau-integration-42!";

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
    void signsInSignsOutAndIgnoresAnotherInstancesCookieName() throws Exception {
        jdbc.update("INSERT INTO app_users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)",
                "admin", "Administrateur", passwordEncoder.encode(PASSWORD), "ADMIN");

        Cookie anonymous = cookie(mvc.perform(get("/api/auth/csrf")).andReturn().getResponse());
        Cookie session = cookie(mvc.perform(withCsrf(anonymous, post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("username", "admin").param("password", PASSWORD)))
                .andExpect(status().isNoContent()).andReturn().getResponse());
        assertThat(session.isHttpOnly()).isTrue();
        assertThat(session.getPath()).isEqualTo("/");

        mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isOk());
        // The same session under the default name is what another instance would receive: ignored.
        mvc.perform(get("/api/auth/me").cookie(new Cookie("SESSION", session.getValue())))
                .andExpect(status().isUnauthorized());

        MockHttpServletResponse logout = mvc.perform(withCsrf(session, post("/api/auth/logout")))
                .andExpect(status().isNoContent()).andReturn().getResponse();
        assertThat(logout.getCookie(COOKIE)).isNotNull().extracting(Cookie::getMaxAge).isEqualTo(0);
        mvc.perform(get("/api/auth/me").cookie(session)).andExpect(status().isUnauthorized());
    }

    @Test
    void refusesANameThatCannotBeACookieName() {
        assertThat(SecurityConfiguration.sessionCookieName("SUREAU_SESSION_8080")).isEqualTo("SUREAU_SESSION_8080");
        for (String invalid : new String[] {"", "SESSION; Path=/", "SUREAU SESSION", "x".repeat(129)}) {
            assertThatThrownBy(() -> SecurityConfiguration.sessionCookieName(invalid))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    private Cookie cookie(MockHttpServletResponse response) {
        assertThat(Arrays.stream(response.getCookies()).map(Cookie::getName)).doesNotContain("SESSION");
        Cookie cookie = response.getCookie(COOKIE);
        assertThat(cookie).as("session cookie").isNotNull();
        return cookie;
    }

    private MockHttpServletRequestBuilder withCsrf(Cookie session, MockHttpServletRequestBuilder request) throws Exception {
        JsonNode token = mapper.readTree(mvc.perform(get("/api/auth/csrf").cookie(session))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        return request.cookie(session).header(token.path("headerName").asString(), token.path("token").asString());
    }
}
