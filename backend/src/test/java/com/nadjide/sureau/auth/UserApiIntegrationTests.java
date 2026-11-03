package com.nadjide.sureau.auth;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.util.Arrays;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.session.Session;
import org.springframework.session.jdbc.JdbcIndexedSessionRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.util.SerializationUtils;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserApiIntegrationTests {
    private static final String PASSWORD = "Sureau-users-integration-42!";
    private static volatile String fixtureHash;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired PasswordEncoder passwordEncoder;
    @Autowired JdbcIndexedSessionRepository sessions;
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
    void administratorCreatesNormalizedAccountsAndNeverReceivesSecretsOrAuthenticationVersions() throws Exception {
        Browser admin = administrator();
        JsonNode created = body(admin.jsonPost("/api/users", creation("  Elise.Test  ", "  Inès Moreau  ", PASSWORD, "EDITOR"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.username").value("elise.test"))
                .andExpect(jsonPath("$.displayName").value("Inès Moreau"))
                .andExpect(jsonPath("$.role").value("EDITOR"))
                .andExpect(jsonPath("$.enabled").value(true)));
        assertThat(created.propertyNames()).containsExactlyInAnyOrder("id", "username", "displayName", "role", "enabled", "email");
        String hash = jdbc.queryForObject("SELECT password_hash FROM app_users WHERE username = 'elise.test'", String.class);
        assertThat(hash).isNotEqualTo(PASSWORD);
        assertThat(passwordEncoder.matches(PASSWORD, hash)).isTrue();
        for (JsonNode account : body(admin.perform(get("/api/users")).andExpect(status().isOk()))) {
            assertThat(account.propertyNames()).containsExactlyInAnyOrder("id", "username", "displayName", "role", "enabled", "email");
        }
        new Browser().login("elise.test", PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void rejectsInvalidCreationIncludingUtf8PasswordsWithoutCreatingPartialAccounts() throws Exception {
        Browser admin = administrator();
        var invalid = List.of(
                creation("ab", "Nom", PASSWORD, "EDITOR"), creation("not an account", "Nom", PASSWORD, "VIEWER"),
                creation("a".repeat(51), "Nom", PASSWORD, "VIEWER"), creation("member", " ", PASSWORD, "VIEWER"),
                creation("member", "N".repeat(81), PASSWORD, "VIEWER"), creation("member", "Nom", "short", "VIEWER"),
                creation("member", "Nom", "a".repeat(65), "VIEWER"), creation("member", "Nom", "é".repeat(37), "VIEWER"),
                creation("member", "Nom", PASSWORD, "ROOT"), "{\"username\":\"member\"}");
        for (String payload : invalid) admin.jsonPost("/api/users", payload).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class)).isOne();
    }

    @Test
    void acceptsTheExactUtf8PasswordBoundaryAndKeepsSignificantSpaces() throws Exception {
        Browser admin = administrator();
        String boundary = "é".repeat(35) + "  ";
        admin.jsonPost("/api/users", creation("boundary", "Mot de passe Unicode", boundary, "VIEWER"))
                .andExpect(status().isCreated());
        new Browser().login("boundary", boundary).andExpect(status().isNoContent());
        new Browser().login("boundary", boundary.trim()).andExpect(status().isUnauthorized());
    }

    @Test
    void duplicateNormalizedUsernamesReturnConflictAndPreserveTheOriginalAccount() throws Exception {
        Browser admin = administrator();
        admin.jsonPost("/api/users", creation("ADMIN", "Autre compte", PASSWORD, "VIEWER"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("DUPLICATE_RESOURCE"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT role FROM app_users WHERE username = 'admin'", String.class)).isEqualTo("ADMIN");
    }

    @Test
    void onlyAnAdministratorCanReadCreateOrUpdateAccounts() throws Exception {
        long id = seedUser("admin", "ADMIN");
        seedUser("editor", "EDITOR");
        seedUser("viewer", "VIEWER");
        Browser anonymous = new Browser();
        anonymous.perform(get("/api/users")).andExpect(status().isUnauthorized());
        anonymous.jsonPost("/api/users", creation("forbidden", "Interdit", PASSWORD, "ADMIN")).andExpect(status().isUnauthorized());
        anonymous.jsonPut("/api/users/" + id, update("Administrateur", "VIEWER", true)).andExpect(status().isUnauthorized());
        for (String username : List.of("editor", "viewer")) {
            Browser browser = new Browser();
            browser.login(username, PASSWORD).andExpect(status().isNoContent());
            browser.perform(get("/api/users")).andExpect(status().isForbidden());
            browser.jsonPost("/api/users", creation("forbidden", "Interdit", PASSWORD, "ADMIN")).andExpect(status().isForbidden());
            browser.jsonPut("/api/users/" + id, update("Administrateur", "VIEWER", true)).andExpect(status().isForbidden());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users", Long.class)).isEqualTo(3);
        assertThat(enabledAdministratorCount()).isOne();
    }

    @Test
    void accountMutationsRequireCsrfEvenForAnAdministrator() throws Exception {
        Browser admin = administrator();
        long id = idOf("admin");
        admin.perform(post("/api/users").contentType(MediaType.APPLICATION_JSON)
                .content(creation("member", "Nom", PASSWORD, "VIEWER"))).andExpect(status().isForbidden());
        admin.perform(put("/api/users/" + id).contentType(MediaType.APPLICATION_JSON)
                .content(update("Autre nom", "ADMIN", true))).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, id)).isEqualTo("Compte admin");
    }

    @Test
    void changingOnlyADisplayNamePreservesExistingSessionsAndAuthenticationVersion() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "EDITOR");
        Browser member = new Browser();
        member.login("member", PASSWORD).andExpect(status().isNoContent());
        Cookie[] cookies = member.cookies();
        String sessionCookie = member.sessionCookie();
        String sessionId = new String(Base64.getDecoder().decode(sessionCookie), StandardCharsets.UTF_8);
        Session stored = sessions.findById(sessionId);
        SecurityContext security = stored.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertThat(security.getAuthentication().getCredentials()).isNull();
        assertThat(security.getAuthentication().getPrincipal()).isInstanceOf(SessionPrincipal.class);
        SessionPrincipal principal = (SessionPrincipal) security.getAuthentication().getPrincipal();
        assertThat(principal.getPassword()).isNull();
        assertThat(principal.getId()).isEqualTo(id);
        assertThat(principal.getAuthVersion()).isZero();
        admin.jsonPut("/api/users/" + id, update("  Nouveau nom  ", "EDITOR", true))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Nouveau nom"))
                .andExpect(jsonPath("$.username").value("member"));
        assertThat(authenticationVersion("member")).isZero();
        assertThat(sessionCount("member")).isOne();
        new Browser(cookies).perform(get("/api/auth/me")).andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("Nouveau nom"));
        member.perform(get("/api/assets")).andExpect(status().isOk());
        assertThat(member.sessionCookie()).isEqualTo(sessionCookie);
    }

    @Test
    void disablingRevokesAllSessionsAndReenablingNeverRevivesOldCookies() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "EDITOR");
        Browser first = new Browser();
        Browser second = new Browser();
        first.login("member", PASSWORD).andExpect(status().isNoContent());
        second.login("member", PASSWORD).andExpect(status().isNoContent());
        Cookie[] firstCookies = first.cookies();
        Cookie[] secondCookies = second.cookies();
        assertThat(sessionCount("member")).isEqualTo(2);
        admin.jsonPut("/api/users/" + id, update("Compte member", "EDITOR", false))
                .andExpect(status().isOk()).andExpect(jsonPath("$.enabled").value(false));
        assertThat(authenticationVersion("member")).isOne();
        assertThat(sessionCount("member")).isZero();
        new Browser(firstCookies).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        new Browser().login("member", PASSWORD).andExpect(status().isUnauthorized());
        admin.jsonPut("/api/users/" + id, update("Compte member", "EDITOR", true)).andExpect(status().isOk());
        assertThat(authenticationVersion("member")).isEqualTo(2);
        new Browser(firstCookies).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        new Browser(secondCookies).perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        new Browser().login("member", PASSWORD).andExpect(status().isNoContent());
    }

    @Test
    void demotionRevokesOldAdministratorSessionsAndNewLoginsUseTheReducedRole() throws Exception {
        Browser admin = administrator();
        long id = seedUser("second-admin", "ADMIN");
        Browser second = new Browser();
        second.login("second-admin", PASSWORD).andExpect(status().isNoContent());
        second.perform(get("/api/users")).andExpect(status().isOk());
        Cookie[] oldCookies = second.cookies();
        admin.jsonPut("/api/users/" + id, update("Second administrateur", "VIEWER", true)).andExpect(status().isOk());
        assertThat(sessionCount("second-admin")).isZero();
        new Browser(oldCookies).perform(get("/api/users")).andExpect(status().isUnauthorized());
        second.login("second-admin", PASSWORD).andExpect(status().isNoContent());
        second.perform(get("/api/assets")).andExpect(status().isOk());
        second.perform(get("/api/users")).andExpect(status().isForbidden());
    }

    @Test
    void theLastEnabledAdministratorCannotBeDisabledOrDemoted() throws Exception {
        Browser admin = administrator();
        long id = idOf("admin");
        seedUser("disabled-admin", "ADMIN");
        jdbc.update("UPDATE app_users SET enabled = false WHERE username = 'disabled-admin'");
        admin.jsonPut("/api/users/" + id, update("Administrateur", "VIEWER", true))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_ADMIN_REQUIRED"));
        admin.jsonPut("/api/users/" + id, update("Administrateur", "ADMIN", false))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("LAST_ADMIN_REQUIRED"));
        assertThat(enabledAdministratorCount()).isOne();
        assertThat(authenticationVersion("admin")).isZero();
        admin.perform(get("/api/users")).andExpect(status().isOk());
    }

    @Test
    void anAdministratorCanDemoteThemselvesWhenAnotherEnabledAdministratorRemains() throws Exception {
        Browser admin = administrator();
        seedUser("other-admin", "ADMIN");
        Cookie[] oldCookies = admin.cookies();
        admin.jsonPut("/api/users/" + idOf("admin"), update("Compte admin", "EDITOR", true)).andExpect(status().isOk());
        new Browser(oldCookies).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        assertThat(enabledAdministratorCount()).isOne();
    }

    @Test
    void rejectsInvalidUpdatesAndMissingAccountsWithoutChangingUsers() throws Exception {
        Browser admin = administrator();
        long id = seedUser("member", "VIEWER");
        for (String payload : List.of(update(" ", "VIEWER", true), update("N".repeat(81), "VIEWER", true),
                update("Nom", "ROOT", true), "{\"displayName\":\"Nom\",\"role\":\"VIEWER\"}",
                "{\"displayName\":\"Nom\",\"role\":null,\"enabled\":true}")) {
            admin.jsonPut("/api/users/" + id, payload).andExpect(status().isBadRequest());
        }
        admin.jsonPut("/api/users/9223372036854775807", update("Nom", "VIEWER", true)).andExpect(status().isNotFound());
        assertThat(authenticationVersion("member")).isZero();
        assertThat(jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, id)).isEqualTo("Compte member");
    }

    @Test
    void aVersionBumpRejectsAStoredPrincipalEvenWithoutDeletingItsJdbcSession() throws Exception {
        seedUser("member", "VIEWER");
        Browser member = new Browser();
        member.login("member", PASSWORD).andExpect(status().isNoContent());
        Cookie[] stale = member.cookies();
        jdbc.update("UPDATE app_users SET auth_version = auth_version + 1 WHERE username = 'member'");
        assertThat(sessionCount("member")).isOne();
        new Browser(stale).perform(get("/api/assets")).andExpect(status().isUnauthorized());
        assertThat(sessionCount("member")).isZero();
        member.login("member", PASSWORD).andExpect(status().isNoContent());
        member.perform(get("/api/assets")).andExpect(status().isOk());
    }

    @Test
    void legacyUnversionedPrincipalsRequireFreshAuthentication() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        browser.login("admin", PASSWORD).andExpect(status().isNoContent());
        String sessionId = new String(Base64.getDecoder().decode(browser.sessionCookie()), StandardCharsets.UTF_8);
        var principal = User.withUsername("admin").password("unused-legacy-hash").roles("ADMIN").build();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities()));
        assertThat(jdbc.update("""
                UPDATE spring_session_attributes attributes SET attribute_bytes = ?
                FROM spring_session session
                WHERE attributes.session_primary_id = session.primary_id
                  AND session.session_id = ? AND attributes.attribute_name = ?
                """, SerializationUtils.serialize(context), sessionId,
                HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)).isOne();
        browser.perform(get("/api/users")).andExpect(status().isUnauthorized());
        assertThat((Session) sessions.findById(sessionId)).isNull();
        browser.login("admin", PASSWORD).andExpect(status().isNoContent());
        browser.perform(get("/api/users")).andExpect(status().isOk());
    }

    @Test
    void simultaneousSelfDemotionsLeaveExactlyOneEnabledAdministrator() throws Exception {
        long firstId = seedUser("admin-one", "ADMIN");
        long secondId = seedUser("admin-two", "ADMIN");
        Browser first = new Browser();
        Browser second = new Browser();
        first.login("admin-one", PASSWORD).andExpect(status().isNoContent());
        second.login("admin-two", PASSWORD).andExpect(status().isNoContent());
        var firstRequest = first.withCsrf(put("/api/users/" + firstId).contentType(MediaType.APPLICATION_JSON).content(update("Premier", "VIEWER", true)));
        var secondRequest = second.withCsrf(put("/api/users/" + secondId).contentType(MediaType.APPLICATION_JSON).content(update("Deuxième", "VIEWER", true)));
        CountDownLatch entered = new CountDownLatch(2);
        doAnswer(invocation -> { entered.countDown(); return invocation.callRealMethod(); }).when(users).lockAccounts();
        try (Connection lock = dataSource.getConnection(); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            lock.setAutoCommit(false);
            lock.createStatement().execute("SELECT pg_advisory_xact_lock(736873021)");
            var one = executor.submit(() -> first.perform(firstRequest).andReturn().getResponse().getStatus());
            var two = executor.submit(() -> second.perform(secondRequest).andReturn().getResponse().getStatus());
            try {
                assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
                lock.commit();
                assertThat(List.of(one.get(30, TimeUnit.SECONDS), two.get(30, TimeUnit.SECONDS)))
                        .containsExactlyInAnyOrder(200, 409);
            } finally { lock.rollback(); }
        }
        assertThat(enabledAdministratorCount()).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE role = 'VIEWER'", Long.class)).isOne();
    }

    @Test
    void anActorDemotedWhileWaitingForTheAccountLockCannotFinishAnAdministrativeWrite() throws Exception {
        Browser admin = administrator();
        long targetId = seedUser("member", "VIEWER");
        var request = admin.withCsrf(put("/api/users/" + targetId).contentType(MediaType.APPLICATION_JSON)
                .content(update("Modification interdite", "ADMIN", true)));
        CountDownLatch entered = new CountDownLatch(1);
        doAnswer(invocation -> { entered.countDown(); return invocation.callRealMethod(); }).when(users).lockAccounts();
        try (Connection lock = dataSource.getConnection(); var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            lock.setAutoCommit(false);
            lock.createStatement().execute("SELECT pg_advisory_xact_lock(736873021)");
            var updating = executor.submit(() -> admin.perform(request).andReturn().getResponse().getStatus());
            try {
                assertThat(entered.await(15, TimeUnit.SECONDS)).isTrue();
                lock.createStatement().executeUpdate("UPDATE app_users SET role = 'VIEWER', auth_version = auth_version + 1 WHERE username = 'admin'");
                lock.commit();
                assertThat(updating.get(30, TimeUnit.SECONDS)).isIn(401, 403);
            } finally { lock.rollback(); }
        }
        assertThat(jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, targetId)).isEqualTo("Compte member");
        assertThat(jdbc.queryForObject("SELECT role FROM app_users WHERE id = ?", String.class, targetId)).isEqualTo("VIEWER");
    }

    @Test
    void credentialsReadBeforeDemotionCannotCreateAUsableOldAdministratorSessionAfterRevocation() throws Exception {
        Browser admin = administrator();
        long targetId = seedUser("racing-admin", "ADMIN");
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
        }).when(users).findByUsername("racing-admin");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var login = executor.submit(() -> {
                loginThread.set(Thread.currentThread());
                return loginBrowser.login("racing-admin", PASSWORD).andReturn().getResponse().getStatus();
            });
            try {
                assertThat(loaded.await(15, TimeUnit.SECONDS)).isTrue();
                admin.jsonPut("/api/users/" + targetId, update("Administrateur rétrogradé", "VIEWER", true)).andExpect(status().isOk());
                finishLogin.countDown();
                assertThat(login.get(30, TimeUnit.SECONDS)).isEqualTo(204);
            } finally { finishLogin.countDown(); }
        }
        loginBrowser.perform(get("/api/users")).andExpect(status().isUnauthorized());
        assertThat(sessionCount("racing-admin")).isZero();
        loginBrowser.login("racing-admin", PASSWORD).andExpect(status().isNoContent());
        loginBrowser.perform(get("/api/assets")).andExpect(status().isOk());
        loginBrowser.perform(get("/api/users")).andExpect(status().isForbidden());
    }

    private Browser administrator() throws Exception {
        seedUser("admin", "ADMIN");
        Browser browser = new Browser();
        browser.login("admin", PASSWORD).andExpect(status().isNoContent());
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
    private long enabledAdministratorCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM app_users WHERE enabled = true AND role = 'ADMIN'", Long.class); }
    private JsonNode body(ResultActions result) throws Exception { return mapper.readTree(result.andReturn().getResponse().getContentAsString()); }
    private String creation(String username, String displayName, String password, String role) {
        return mapper.writeValueAsString(Map.of("username", username, "displayName", displayName, "password", password, "role", role));
    }
    private String update(String displayName, String role, boolean enabled) {
        return mapper.writeValueAsString(Map.of("displayName", displayName, "role", role, "enabled", enabled));
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
            JsonNode token = body(perform(get("/api/auth/csrf")).andExpect(status().isOk()));
            return request.header(token.path("headerName").asString(), token.path("token").asString());
        }
        ResultActions jsonPost(String path, String payload) throws Exception {
            return perform(withCsrf(post(path).contentType(MediaType.APPLICATION_JSON).content(payload)));
        }
        ResultActions jsonPut(String path, String payload) throws Exception {
            return perform(withCsrf(put(path).contentType(MediaType.APPLICATION_JSON).content(payload)));
        }
        ResultActions login(String username, String password) throws Exception {
            return perform(withCsrf(post("/api/auth/login").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .param("username", username).param("password", password)));
        }
    }
}
