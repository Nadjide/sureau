package com.nadjide.sureau.asset;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.test.context.support.TestExecutionEvent;
import org.springframework.security.test.context.support.WithUserDetails;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.jdbc.Sql;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql("/test-users.sql")
@WithUserDetails(value = "test-editor", setupBefore = TestExecutionEvent.TEST_EXECUTION)
class AssetHistoryIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserDetailsService users;

    @BeforeEach
    @AfterEach
    void clearInventoryAndWorkspace() {
        jdbc.update("DELETE FROM workspace_documents");
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void recordsCreationEachChangedFieldAndRetirementWithTheirAuthorNewestFirst() throws Exception {
        long id = create("""
                {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"}
                """);
        mvc.perform(put("/api/assets/{id}", id).with(user(users.loadUserByUsername("test-editor-2"))).with(csrf())
                        .header("If-Match", "\"0\"").contentType(MediaType.APPLICATION_JSON).content("""
                        {"assetTag":"PC-01","name":"Portable de direction","brand":"Lenovo","category":"COMPUTER",
                         "status":"MAINTENANCE","purchaseDate":"2026-03-02"}
                        """))
                .andExpect(status().isOk());
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header("If-Match", "\"1\"")).andExpect(status().isOk());

        JsonNode history = history(id);
        assertThat(history).hasSize(3);
        assertThat(history.path(0).path("action").asString()).isEqualTo("RETIRED");
        assertThat(history.path(0).path("changes")).isEqualTo(changes("""
                [{"field":"status","from":"MAINTENANCE","to":"RETIRED"}]"""));
        assertThat(history.path(0).path("actor").path("username").asString()).isEqualTo("test-editor");

        assertThat(history.path(1).path("action").asString()).isEqualTo("UPDATED");
        assertThat(history.path(1).path("changes")).isEqualTo(changes("""
                [{"field":"name","from":"Portable","to":"Portable de direction"},
                 {"field":"brand","from":null,"to":"Lenovo"},
                 {"field":"status","from":"AVAILABLE","to":"MAINTENANCE"},
                 {"field":"purchaseDate","from":null,"to":"2026-03-02"}]"""));
        assertThat(history.path(1).path("actor").path("displayName").asString()).isEqualTo("Deuxième éditeur de test");

        assertThat(history.path(2).path("action").asString()).isEqualTo("CREATED");
        assertThat(history.path(2).path("changes")).isEqualTo(changes("""
                [{"field":"assetTag","from":null,"to":"PC-01"},{"field":"name","from":null,"to":"Portable"},
                 {"field":"category","from":null,"to":"COMPUTER"},{"field":"status","from":null,"to":"AVAILABLE"}]"""));
    }

    @Test
    void anUnchangedSaveOrARefusedChangeLeavesNoTrace() throws Exception {
        String body = """
                {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"}
                """;
        long id = create(body);
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header("If-Match", "\"0\"")
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk());
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header("If-Match", "\"7\"")
                .contentType(MediaType.APPLICATION_JSON).content(body.replace("Portable", "Autre")))
                .andExpect(status().isPreconditionFailed());

        assertThat(history(id)).hasSize(1);
        assertThat(history(id).path(0).path("action").asString()).isEqualTo("CREATED");
    }

    @Test
    void recordsEachMoveBetweenNamedWorkstationsButNeverARejectedSave() throws Exception {
        long id = create("""
                {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"}
                """);
        ObjectNode request = workspace(0);
        // An association with an unknown asset is kept by the workspace, but has no history of its own.
        locations(request).put(Long.toString(id), "desk-01").put("999999", "desk-02");
        saveWorkspace(request).andExpect(status().isOk());

        request.put("expectedRevision", 1);
        locations(request).put(Long.toString(id), "desk-02");
        saveWorkspace(request).andExpect(status().isOk());

        // A stale save is refused, and so is its move.
        locations(request).remove(Long.toString(id));
        saveWorkspace(request).andExpect(status().isConflict());

        request.put("expectedRevision", 2);
        saveWorkspace(request).andExpect(status().isOk());

        JsonNode history = history(id);
        assertThat(history).hasSize(4);
        assertThat(history.path(0).path("changes")).isEqualTo(changes("""
                [{"field":"location","from":"Poste 2 · Atelier · Rez-de-chaussée","to":null}]"""));
        assertThat(history.path(1).path("changes")).isEqualTo(changes("""
                [{"field":"location","from":"Poste 1 · Atelier · Rez-de-chaussée","to":"Poste 2 · Atelier · Rez-de-chaussée"}]"""));
        assertThat(history.path(2).path("changes")).isEqualTo(changes("""
                [{"field":"location","from":null,"to":"Poste 1 · Atelier · Rez-de-chaussée"}]"""));
        assertThat(history.path(0).path("action").asString()).isEqualTo("LOCATED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM asset_events WHERE asset_id <> ?", Long.class, id)).isZero();
    }

    @Test
    void anyAccountCanReadAHistoryButNotAnonymously() throws Exception {
        long id = create("""
                {"assetTag":"PC-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"}
                """);
        mvc.perform(get("/api/assets/{id}/history", id).with(user(users.loadUserByUsername("test-viewer"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].action").value("CREATED"));
        mvc.perform(get("/api/assets/{id}/history", id).with(anonymous())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/assets/{id}/history", id + 1000)).andExpect(status().isNotFound());
    }

    private long create(String body) throws Exception {
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asLong();
    }

    private JsonNode history(long id) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/assets/{id}/history", id)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode changes(String json) {
        return mapper.readTree(json);
    }

    private ResultActions saveWorkspace(ObjectNode payload) throws Exception {
        return mvc.perform(put("/api/workspace").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload.toString()));
    }

    private static ObjectNode locations(ObjectNode payload) {
        return (ObjectNode) payload.path("locations");
    }

    private ObjectNode workspace(long revision) {
        return (ObjectNode) mapper.readTree("""
                {"expectedRevision":%d,"workspace":{"version":1,"id":"workspace-local","name":"Atelier Sureau",
                 "floors":[{"id":"floor-01","name":"Rez-de-chaussée"}],
                 "rooms":[{"floorId":"floor-01","plan":{"version":1,"id":"room-test","name":"Atelier",
                  "width":10,"depth":8,"colors":{"floor":"#e6e7e5","wall":"#e4e8ed","desk":"#d4b38c","accent":"#447cde"},
                  "display":{"walls":true,"decor":true},"workstations":[
                   {"id":"desk-01","label":"Poste 1","position":[-2,0,0],"rotation":0,"width":2,"depth":1,"color":null},
                   {"id":"desk-02","label":"Poste 2","position":[2,0,0],"rotation":0,"width":2,"depth":1,"color":null}],
                  "furniture":[]}}]},"locations":{}}
                """.formatted(revision));
    }
}
