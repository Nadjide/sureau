package com.nadjide.sureau.auth;

import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PasswordApiIntegrationTests {
    private static final String PASSWORD = "Sureau-password-integration-42!";
    private static final String NEW_PASSWORD = "Sureau-new-password-84!";
    private static volatile String fixtureHash;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder passwordEncoder;
    @MockitoSpyBean UserRepository users;

    @BeforeEach
    @AfterEach
    void clearIsolatedTestData() {
        jdbc.update("DELETE FROM spring_session");
        jdbc.update("DELETE FROM app_users");
        jdbc.update("DELETE FROM workspace_documents");
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void administratorResetRevokesEveryTargetSessionAndOnlyTheNewPasswordWorks() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "EDITOR");
        Browser first = login("member", PASSWORD);
        Browser second = login("member", PASSWORD);
        Cookie[] oldFirst = first.cookies();
        Cookie[] oldSecond = second.cookies();
        assertThat(sessionCount("member")).isEqualTo(2);
        admin.jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isNoContent());
        assertThat(authenticationVersion("member")).isOne();
        assertThat(sessionCount("member")).isZero();
        assertThat(passwordEncoder.matches(NEW_PASSWORD, passwordHash("member"))).isTrue();
        assertThat(passwordEncoder.matches(PASSWORD, passwordHash("member"))).isFalse();
        new Browser(oldFirst).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        new Browser(oldSecond).perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        new Browser().login("member", PASSWORD).andExpect(status().isUnauthorized());
        login("member", NEW_PASSWORD).perform(get("/api/assets")).andExpect(status().isOk());
        admin.perform(get("/api/users")).andExpect(status().isOk());
    }

    @Test
    void aViewerCanChangeTheirOwnPasswordAndEveryOldSessionIsRevoked() throws Exception {
        seedUser("viewer", "VIEWER");
        Browser first = login("viewer", PASSWORD);
        Browser second = login("viewer", PASSWORD);
        Cookie[] oldFirst = first.cookies();
        Cookie[] oldSecond = second.cookies();
        first.jsonPost("/api/auth/password", ownPayload(PASSWORD, NEW_PASSWORD)).andExpect(status().isNoContent());
        assertThat(authenticationVersion("viewer")).isOne();
        assertThat(sessionCount("viewer")).isZero();
        new Browser(oldFirst).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        new Browser(oldSecond).perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        new Browser().login("viewer", PASSWORD).andExpect(status().isUnauthorized());
        Browser fresh = login("viewer", NEW_PASSWORD);
        fresh.perform(get("/api/assets")).andExpect(status().isOk());
        fresh.perform(get("/api/users")).andExpect(status().isForbidden());
    }

    @Test
    void editorsAndAdministratorsAlsoChangeTheirOwnPasswordWithoutChangingTheirRole() throws Exception {
        for (String role : List.of("EDITOR", "ADMIN")) {
            String username = role.toLowerCase(Locale.ROOT) + "-personal";
            seedUser(username, role);
            Browser browser = login(username, PASSWORD);
            browser.jsonPost("/api/auth/password", ownPayload(PASSWORD, NEW_PASSWORD)).andExpect(status().isNoContent());
            browser.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
            login(username, NEW_PASSWORD).perform(get("/api/auth/me"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.role").value(role));
            assertThat(authenticationVersion(username)).isOne();
        }
    }

    @Test
    void administrativeResetRequiresAnAdministratorAndAValidTarget() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        seedUser("editor", "EDITOR");
        new Browser().jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isUnauthorized());
        new Browser().jsonPost("/api/auth/password", ownPayload(PASSWORD, NEW_PASSWORD)).andExpect(status().isUnauthorized());
        for (String username : List.of("member", "editor")) {
            login(username, PASSWORD).jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isForbidden());
        }
        admin.jsonPost(resetPath(Long.MAX_VALUE), resetPayload(NEW_PASSWORD)).andExpect(status().isNotFound());
        admin.jsonPost(resetPath(0), resetPayload(NEW_PASSWORD)).andExpect(status().isBadRequest());
        assertThat(authenticationVersion("member")).isZero();
        assertThat(passwordEncoder.matches(PASSWORD, passwordHash("member"))).isTrue();
    }

    @Test
    void bothPasswordOperationsRequireCsrfForAuthenticatedUsers() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        Browser member = login("member", PASSWORD);
        admin.perform(post(resetPath(id)).contentType(MediaType.APPLICATION_JSON).content(resetPayload(NEW_PASSWORD)))
                .andExpect(status().isForbidden());
        member.perform(post("/api/auth/password").contentType(MediaType.APPLICATION_JSON).content(ownPayload(PASSWORD, NEW_PASSWORD)))
                .andExpect(status().isForbidden());
        admin.perform(get("/api/users")).andExpect(status().isOk());
        member.perform(get("/api/auth/me")).andExpect(status().isOk());
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isOne();
    }

    @Test
    void aWrongCurrentPasswordReturnsAValidationErrorWithoutExpiringAnySession() throws Exception {
        seedUser("member", "VIEWER");
        Browser first = login("member", PASSWORD);
        Browser second = login("member", PASSWORD);
        String hash = passwordHash("member");
        String cookie = first.sessionCookie();
        first.jsonPost("/api/auth/password", ownPayload("Incorrect-current-password", NEW_PASSWORD))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CURRENT_PASSWORD_INVALID"));
        assertThat(passwordHash("member")).isEqualTo(hash);
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isEqualTo(2);
        first.perform(get("/api/auth/me")).andExpect(status().isOk());
        second.perform(get("/api/assets")).andExpect(status().isOk());
        assertThat(first.sessionCookie()).isEqualTo(cookie);
    }

    @Test
    void invalidNewPasswordsNeverChangeTheHashVersionOrSessions() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        Browser member = login("member", PASSWORD);
        String hash = passwordHash("member");
        for (String invalid : List.of("short", " ".repeat(12), "a".repeat(65), "é".repeat(37))) {
            admin.jsonPost(resetPath(id), resetPayload(invalid)).andExpect(status().isBadRequest());
            member.jsonPost("/api/auth/password", ownPayload(PASSWORD, invalid)).andExpect(status().isBadRequest());
        }
        admin.jsonPost(resetPath(id), "{}").andExpect(status().isBadRequest());
        member.jsonPost("/api/auth/password", "{\"currentPassword\":\"missing-new-password\"}").andExpect(status().isBadRequest());
        assertThat(passwordHash("member")).isEqualTo(hash);
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isOne();
        member.perform(get("/api/auth/me")).andExpect(status().isOk());
    }

    @Test
    void utf8BoundaryAndSignificantSpacesSurviveResetAndPersonalChange() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        String boundary = "é".repeat(35) + "  ";
        admin.jsonPost(resetPath(id), resetPayload(boundary)).andExpect(status().isNoContent());
        new Browser().login("member", boundary.trim()).andExpect(status().isUnauthorized());
        Browser member = login("member", boundary);
        String spaced = "  Another-unique-password-42!  ";
        member.jsonPost("/api/auth/password", ownPayload(boundary, spaced)).andExpect(status().isNoContent());
        login("member", spaced).perform(get("/api/auth/me")).andExpect(status().isOk());
        new Browser().login("member", spaced.trim()).andExpect(status().isUnauthorized());
        assertThat(authenticationVersion("member")).isEqualTo(2);
    }

    @Test
    void resettingADisabledAccountDoesNotEnableIt() throws Exception {
        Browser admin = administrator();
        long id = seedUser("disabled-member", "EDITOR");
        jdbc.update("UPDATE app_users SET enabled = false WHERE id = ?", id);
        admin.jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT enabled FROM app_users WHERE id = ?", Boolean.class, id)).isFalse();
        assertThat(authenticationVersion("disabled-member")).isOne();
        assertThat(passwordEncoder.matches(NEW_PASSWORD, passwordHash("disabled-member"))).isTrue();
        new Browser().login("disabled-member", NEW_PASSWORD).andExpect(status().isUnauthorized());
        new Browser().login("disabled-member", PASSWORD).andExpect(status().isUnauthorized());
    }

    @Test
    void theLastAdministratorCanResetTheirOwnPasswordAndMustSignInAgain() throws Exception {
        Browser admin = administrator();
        Browser second = login("admin", PASSWORD);
        Cookie[] oldFirst = admin.cookies();
        Cookie[] oldSecond = second.cookies();
        admin.jsonPost(resetPath(idOf("admin")), resetPayload(NEW_PASSWORD)).andExpect(status().isNoContent());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE role = 'ADMIN' AND enabled = true", Long.class)).isOne();
        assertThat(sessionCount("admin")).isZero();
        new Browser(oldFirst).perform(get("/api/users")).andExpect(status().isUnauthorized());
        new Browser(oldSecond).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        login("admin", NEW_PASSWORD).perform(get("/api/users")).andExpect(status().isOk());
    }

    @Test
    void revocationFailureRollsBackHashAndVersionForBothPasswordOperations() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        Browser member = login("member", PASSWORD);
        String original = passwordHash("member");
        doThrow(new DataIntegrityViolationException("Forced session-revocation failure for transaction verification."))
                .when(users).revokeSessions("member");
        admin.jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isInternalServerError());
        assertThat(passwordHash("member")).isEqualTo(original);
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isOne();
        member.perform(get("/api/auth/me")).andExpect(status().isOk());
        member.jsonPost("/api/auth/password", ownPayload(PASSWORD, NEW_PASSWORD)).andExpect(status().isInternalServerError());
        assertThat(passwordHash("member")).isEqualTo(original);
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isOne();
        member.perform(get("/api/assets")).andExpect(status().isOk());
    }

    @Test
    void credentialsReadBeforeResetCannotCreateAUsableSessionAfterThePasswordChanged() throws Exception {
        Browser admin = administrator();
        long id = seedUser("racing-member", "EDITOR");
        Browser loginBrowser = new Browser();
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch finishLogin = new CountDownLatch(1);
        AtomicReference<Thread> loginThread = new AtomicReference<>();
        AtomicBoolean captured = new AtomicBoolean();
        doAnswer(invocation -> {
            Object account = invocation.callRealMethod();
            if (Thread.currentThread() == loginThread.get() && captured.compareAndSet(false, true)) {
                loaded.countDown();
                if (!finishLogin.await(20, TimeUnit.SECONDS)) throw new AssertionError("Credential-read barrier was not released.");
            }
            return account;
        }).when(users).findByUsername("racing-member");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var login = executor.submit(() -> {
                loginThread.set(Thread.currentThread());
                return loginBrowser.login("racing-member", PASSWORD).andReturn().getResponse().getStatus();
            });
            try {
                assertThat(loaded.await(15, TimeUnit.SECONDS)).isTrue();
                admin.jsonPost(resetPath(id), resetPayload(NEW_PASSWORD)).andExpect(status().isNoContent());
                finishLogin.countDown();
                assertThat(login.get(30, TimeUnit.SECONDS)).isEqualTo(204);
            } finally { finishLogin.countDown(); }
        }
        loginBrowser.perform(get("/api/assets")).andExpect(status().isUnauthorized());
        assertThat(sessionCount("racing-member")).isZero();
        new Browser().login("racing-member", PASSWORD).andExpect(status().isUnauthorized());
        login("racing-member", NEW_PASSWORD).perform(get("/api/assets")).andExpect(status().isOk());
    }

    private Browser administrator() throws Exception { seedUser("admin", "ADMIN"); return login("admin", PASSWORD); }
    private Browser login(String username, String password) throws Exception {
        Browser browser = new Browser();
        browser.login(username, password).andExpect(status().isNoContent());
        return browser;
    }
    private long seedUser(String username, String role) {
        if (fixtureHash == null) fixtureHash = passwordEncoder.encode(PASSWORD);
        return jdbc.queryForObject("INSERT INTO app_users (username, display_name, password_hash, role) VALUES (?, ?, ?, ?) RETURNING id",
                Long.class, username, "Compte " + username, fixtureHash, role);
    }
    private long idOf(String username) { return jdbc.queryForObject("SELECT id FROM app_users WHERE username = ?", Long.class, username); }
    private long authenticationVersion(String username) { return jdbc.queryForObject("SELECT auth_version FROM app_users WHERE username = ?", Long.class, username); }
    private long sessionCount(String username) { return jdbc.queryForObject("SELECT COUNT(*) FROM spring_session WHERE principal_name = ?", Long.class, username); }
    private String passwordHash(String username) { return jdbc.queryForObject("SELECT password_hash FROM app_users WHERE username = ?", String.class, username); }
    private String resetPath(long id) { return "/api/users/" + id + "/password"; }
    private String resetPayload(String password) { return mapper.writeValueAsString(Map.of("password", password)); }
    private String ownPayload(String currentPassword, String newPassword) {
        return mapper.writeValueAsString(Map.of("currentPassword", currentPassword, "newPassword", newPassword));
    }

    private final class Browser {
        private final Map<String, Cookie> jar = new LinkedHashMap<>();
        Browser(Cookie... cookies) { Arrays.stream(cookies).forEach(cookie -> jar.put(cookie.getName(), cookie)); }
        Cookie[] cookies() { return jar.values().toArray(Cookie[]::new); }
        String sessionCookie() { Cookie cookie = jar.get("SESSION"); return cookie == null ? null : cookie.getValue(); }
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
            JsonNode token = mapper.readTree(perform(get("/api/auth/csrf")).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString());
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
