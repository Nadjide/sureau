package com.nadjide.sureau.asset;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.TestExecutionEvent;
import org.springframework.security.test.context.support.WithUserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql("/test-users.sql")
@WithUserDetails(value = "test-editor", setupBefore = TestExecutionEvent.TEST_EXECUTION)
class AssetAssigneeIntegrationTests {
    private static final String AVAILABLE = """
            {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"}
            """;

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clearInventory() {
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void assignsAnAssetToANamedPersonThenTakesItBack() throws Exception {
        long id = create(AVAILABLE);
        update(id, 0, """
                {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"ASSIGNED",
                 "assignee":{"name":"  Camille Bernard ","email":" camille@exemple.fr ","department":"  "}}
                """)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignee.name").value("Camille Bernard"))
                .andExpect(jsonPath("$.assignee.email").value("camille@exemple.fr"))
                .andExpect(jsonPath("$.assignee.department").isEmpty());
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.assignee.name").value("Camille Bernard"));

        // Taking it back is an ordinary update: another status and no holder.
        update(id, 1, AVAILABLE).andExpect(status().isOk()).andExpect(jsonPath("$.assignee").isEmpty());

        JsonNode history = history(id);
        assertThat(history.path(0).path("changes")).isEqualTo(mapper.readTree("""
                [{"field":"status","from":"ASSIGNED","to":"AVAILABLE"},
                 {"field":"assigneeName","from":"Camille Bernard","to":null},
                 {"field":"assigneeEmail","from":"camille@exemple.fr","to":null}]"""));
        assertThat(history.path(1).path("changes")).isEqualTo(mapper.readTree("""
                [{"field":"status","from":"AVAILABLE","to":"ASSIGNED"},
                 {"field":"assigneeName","from":null,"to":"Camille Bernard"},
                 {"field":"assigneeEmail","from":null,"to":"camille@exemple.fr"}]"""));
    }

    @Test
    void onlyAnAssignedAssetNamesItsHolderButAHolderIsNotRequired() throws Exception {
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"MAINTENANCE",
                         "assignee":{"name":"Camille Bernard"}}
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        assertThat(count()).isZero();

        // Assignments recorded before this field existed have no named holder.
        create("""
                {"assetTag":"PC-02","name":"Portable","category":"COMPUTER","status":"ASSIGNED"}
                """);
        assertThat(count()).isOne();
    }

    @Test
    void validatesTheHolderFields() throws Exception {
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"ASSIGNED",
                         "assignee":{"name":"  ","email":"pas-une-adresse","department":"%s"}}
                        """.formatted("x".repeat(101))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[0].field").value("assignee.department"))
                .andExpect(jsonPath("$.errors[1].field").value("assignee.email"))
                .andExpect(jsonPath("$.errors[2].field").value("assignee.name"));
        assertThat(count()).isZero();
    }

    @Test
    void theDatabaseRefusesAHolderOnAnAssetThatIsNotAssigned() throws Exception {
        long id = create(AVAILABLE);
        assertThatThrownBy(() -> jdbc.update("UPDATE assets SET assignee_name = 'Camille' WHERE id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private long create(String body) throws Exception {
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asLong();
    }

    private ResultActions update(long id, long revision, String body) throws Exception {
        return mvc.perform(put("/api/assets/{id}", id).with(csrf()).header("If-Match", "\"" + revision + "\"")
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode history(long id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/assets/{id}/history", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private long count() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM assets", Long.class);
    }
}
