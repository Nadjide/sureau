package com.nadjide.sureau.auth;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class UserEmailIntegrationTests {
    private static final String PASSWORD = "Sureau-email-integration-42!";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserDetailsService accounts;

    @BeforeEach
    @AfterEach
    void seedAdministrator() {
        jdbc.update("DELETE FROM spring_session");
        jdbc.update("DELETE FROM app_users");
        jdbc.update("INSERT INTO app_users (username, display_name, password_hash, role) VALUES ('admin', 'Admin', 'hash', 'ADMIN')");
    }

    @Test
    void storesAnOptionalAddressThatOnlyOneAccountMayUse() throws Exception {
        as(post("/api/users").content("""
                {"username":"camille","displayName":"Camille","password":"%s","role":"EDITOR","email":" Camille@Exemple.fr "}
                """.formatted(PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("Camille@Exemple.fr"));
        as(post("/api/users").content("""
                {"username":"sans-email","displayName":"Sans e-mail","password":"%s","role":"VIEWER","email":"  "}
                """.formatted(PASSWORD)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").isEmpty());
        as(post("/api/users").content("""
                {"username":"doublon","displayName":"Doublon","password":"%s","role":"VIEWER","email":"camille@exemple.FR"}
                """.formatted(PASSWORD)))
                .andExpect(status().isConflict());
        as(post("/api/users").content("""
                {"username":"invalide","displayName":"Invalide","password":"%s","role":"VIEWER","email":"pas-une-adresse"}
                """.formatted(PASSWORD)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("email"));
        mvc.perform(get("/api/users").with(user(accounts.loadUserByUsername("admin"))))
                .andExpect(jsonPath("$[?(@.username == 'camille')].email").value("Camille@Exemple.fr"));
    }

    @Test
    void changingTheAddressClosesTheAccountSessions() throws Exception {
        long id = jdbc.queryForObject("""
                INSERT INTO app_users (username, display_name, password_hash, role, email)
                VALUES ('camille', 'Camille', 'hash', 'EDITOR', 'camille@exemple.fr') RETURNING id
                """, Long.class);
        String update = """
                {"displayName":"Camille","role":"EDITOR","enabled":true,"email":"%s"}
                """;
        as(put("/api/users/{id}", id).content(update.formatted("CAMILLE@exemple.fr"))).andExpect(status().isOk());
        assertThat(authVersion(id)).as("same address, other case").isZero();
        as(put("/api/users/{id}", id).content(update.formatted("camille.bernard@exemple.fr"))).andExpect(status().isOk());
        assertThat(authVersion(id)).isOne();
    }

    private ResultActions as(MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.with(user(accounts.loadUserByUsername("admin"))).with(csrf()).contentType(MediaType.APPLICATION_JSON));
    }

    private long authVersion(long id) {
        return jdbc.queryForObject("SELECT auth_version FROM app_users WHERE id = ?", Long.class, id);
    }
}
