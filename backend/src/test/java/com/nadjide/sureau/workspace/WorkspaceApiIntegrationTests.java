package com.nadjide.sureau.workspace;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

import jakarta.servlet.ServletContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.SmartRequestBuilder;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@WithMockUser(roles = "EDITOR")
class WorkspaceApiIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clearIsolatedWorkspace() {
        jdbc.update("DELETE FROM workspace_documents");
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void readingAnUninitializedWorkspaceDoesNotCreateDataOrInventALayout() throws Exception {
        mvc.perform(get("/api/workspace"))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("WORKSPACE_NOT_INITIALIZED"));
        assertThat(workspaceCount()).isZero();
        mvc.perform(get("/api/workspace"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("WORKSPACE_NOT_INITIALIZED"));
        assertThat(workspaceCount()).isZero();
    }

    @Test
    void savesAndReloadsTheExactLayoutAndStableAssetAssociations() throws Exception {
        ObjectNode request = payload(0);
        ((ObjectNode) request.path("locations")).put("17", "desk-02").put("3", "desk-01");
        String saved = save(request).andExpect(status().isOk())
                .andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.workspace.rooms[0].plan.workstations[1].id").value("desk-02"))
                .andExpect(jsonPath("$.locations['17']").value("desk-02"))
                .andReturn().getResponse().getContentAsString();
        JsonNode snapshot = mapper.readTree(saved);
        assertThat(OffsetDateTime.parse(snapshot.path("updatedAt").asString())).isNotNull();

        String loaded = mvc.perform(get("/api/workspace").with(user("another-editor").roles("EDITOR")))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(mapper.readTree(loaded)).isEqualTo(snapshot);
        assertThat(snapshot.path("workspace")).isEqualTo(request.path("workspace"));
        assertThat(snapshot.path("locations")).isEqualTo(request.path("locations"));
        assertThat(workspaceCount()).isOne();
    }

    @Test
    void rejectsStaleRevisionsWithoutOverwritingTheSavedWorkspace() throws Exception {
        save(payload(0)).andExpect(status().isOk());
        ObjectNode changed = payload(1);
        ((ObjectNode) changed.path("workspace")).put("name", "Nouvelle implantation");
        save(changed).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));

        save(payload(1)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WORKSPACE_CONFLICT"));
        save(payload(0)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WORKSPACE_CONFLICT"));
        mvc.perform(get("/api/workspace"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2))
                .andExpect(jsonPath("$.workspace.name").value("Nouvelle implantation"));
    }

    @Test
    void anUpdateCannotImplicitlyCreateAWorkspaceWithANonzeroRevision() throws Exception {
        save(payload(7)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("WORKSPACE_CONFLICT"));
        assertThat(workspaceCount()).isZero();
    }

    @Test
    void concurrentInitializationAndUpdatesEachAllowExactlyOneWriter() throws Exception {
        assertConcurrentWriters(0);
        assertThat(workspaceCount()).isOne();
        mvc.perform(get("/api/workspace")).andExpect(jsonPath("$.revision").value(1));
        assertConcurrentWriters(1);
        mvc.perform(get("/api/workspace")).andExpect(jsonPath("$.revision").value(2));
    }

    @Test
    void rejectsInvalidGeometryIncludingTheChairEnvelopeAndRotatedFurniture() throws Exception {
        List<Consumer<ObjectNode>> invalid = List.of(
                body -> plan(body).put("width", 5.99),
                body -> station(body).put("width", 0.79),
                body -> station(body).put("rotation", Math.PI * 2 + 0.01),
                body -> position(station(body)).set(1, mapper.getNodeFactory().numberNode(0.1)),
                body -> position(station(body)).set(0, mapper.getNodeFactory().numberNode(100)),
                body -> position(station(body)).set(2, mapper.getNodeFactory().numberNode(3.0)),
                body -> {
                    station(body).put("rotation", Math.PI / 2);
                    position(station(body)).set(0, mapper.getNodeFactory().numberNode(3.9));
                },
                body -> position(furniture(body)).set(0, mapper.getNodeFactory().numberNode(4.9)),
                body -> furniture(body).put("height", 3.51),
                body -> furniture(body).put("rotation", -0.01),
                body -> station(body).put("color", "#fff"),
                body -> ((ObjectNode) plan(body).path("colors")).put("floor", "red"),
                body -> furniture(body).put("kind", "script"));
        assertInvalidCandidates(invalid);
        String nonFiniteRevision = payload(0).toString().replace("\"expectedRevision\":0", "\"expectedRevision\":1e400");
        mvc.perform(put("/api/workspace").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(nonFiniteRevision))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WORKSPACE_INVALID"));
        assertThat(workspaceCount()).isZero();
    }

    @Test
    void rejectsBrokenReferencesDuplicateGlobalIdsAndUnsupportedFields() throws Exception {
        List<Consumer<ObjectNode>> invalid = List.of(
                body -> ((ObjectNode) body.path("workspace")).put("id", "another-workspace"),
                body -> ((ObjectNode) body.path("workspace")).put("version", 2),
                body -> ((ObjectNode) room(body)).put("floorId", "floor-missing"),
                body -> floors(body).add(floors(body).get(0).deepCopy()),
                body -> rooms(body).add(rooms(body).get(0).deepCopy()),
                body -> ((ObjectNode) plan(body).path("workstations").get(1)).put("id", "desk-01"),
                body -> {
                    ObjectNode second = room(body).deepCopy();
                    ((ObjectNode) second.path("plan")).put("id", "room-second");
                    rooms(body).add(second);
                },
                body -> station(body).put("id", "desk-A"),
                body -> ((ObjectNode) body.path("workspace")).put("unsupported", true),
                body -> plan(body).put("unsupported", true),
                body -> station(body).put("assetId", 1),
                body -> body.put("unsupported", true),
                body -> body.put("expectedRevision", -1),
                body -> body.put("expectedRevision", 0.5),
                body -> body.put("expectedRevision", 9_007_199_254_740_992L));
        assertInvalidCandidates(invalid);
    }

    @Test
    void enforcesRoomFloorAndObjectLimitsBeforeCreatingAnyData() throws Exception {
        List<Consumer<ObjectNode>> invalid = List.of(
                body -> floors(body).removeAll(),
                body -> rooms(body).removeAll(),
                body -> {
                    for (int index = 2; index <= 9; index++) floors(body).addObject()
                            .put("id", "floor-" + index).put("name", "Étage " + index);
                },
                body -> {
                    for (int index = 2; index <= 33; index++) {
                        ObjectNode next = room(body).deepCopy();
                        ObjectNode nextPlan = (ObjectNode) next.path("plan");
                        nextPlan.put("id", "room-" + index);
                        ((ArrayNode) nextPlan.path("workstations")).removeAll();
                        ((ArrayNode) nextPlan.path("furniture")).removeAll();
                        rooms(body).add(next);
                    }
                },
                body -> {
                    ArrayNode stations = (ArrayNode) plan(body).path("workstations");
                    for (int index = 3; index <= 65; index++) {
                        ObjectNode next = station(body).deepCopy();
                        next.put("id", "desk-limit-" + index);
                        stations.add(next);
                    }
                });
        assertInvalidCandidates(invalid);
    }

    @Test
    void rejectsNoncanonicalOrUnsafeLocationKeysAndInvalidStationIds() throws Exception {
        for (String key : List.of("0", "-1", "01", "1e2", "9007199254740992", "__proto__")) {
            ObjectNode request = payload(0);
            ((ObjectNode) request.path("locations")).put(key, "desk-01");
            save(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WORKSPACE_INVALID"));
        }
        for (String stationId : List.of("desk-a", "furniture-01", "desk-UPPER", "<script>")) {
            ObjectNode request = payload(0);
            ((ObjectNode) request.path("locations")).put("1", stationId);
            save(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WORKSPACE_INVALID"));
        }
        ObjectNode request = payload(0);
        ((ObjectNode) request.path("locations")).putNull("1");
        save(request).andExpect(status().isBadRequest());
        assertThat(workspaceCount()).isZero();
    }

    @Test
    void preservesOrphanAssociationsForLaterRecoveryAndAllowsTheMaximumSafeAssetId() throws Exception {
        ObjectNode request = payload(0);
        ((ObjectNode) request.path("locations")).put("9007199254740991", "desk-removed").put("42", "desk-01");
        save(request).andExpect(status().isOk());
        ObjectNode changed = payload(1);
        changed.set("locations", request.path("locations").deepCopy());
        ((ArrayNode) plan(changed).path("workstations")).removeAll();
        save(changed).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
        mvc.perform(get("/api/workspace"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.locations['9007199254740991']").value("desk-removed"))
                .andExpect(jsonPath("$.locations['42']").value("desk-01"));
    }

    @Test
    void locationChangesDoNotChangeAnAssetsBusinessStatus() throws Exception {
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                        {"assetTag":"WORKSPACE-PC","name":"Ordinateur","category":"COMPUTER","status":"MAINTENANCE"}
                        """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long id = mapper.readTree(response).path("id").asLong();
        ObjectNode request = payload(0);
        ((ObjectNode) request.path("locations")).put(Long.toString(id), "desk-01");
        save(request).andExpect(status().isOk());
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.status").value("MAINTENANCE"));
        request.put("expectedRevision", 1);
        ((ObjectNode) request.path("locations")).removeAll();
        save(request).andExpect(status().isOk());
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.status").value("MAINTENANCE"));
    }

    @Test
    void viewerCanReadButCannotInitializeOrReplaceTheWorkspace() throws Exception {
        mvc.perform(put("/api/workspace").with(user("viewer").roles("VIEWER")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(payload(0).toString()))
                .andExpect(status().isForbidden());
        assertThat(workspaceCount()).isZero();
        save(payload(0)).andExpect(status().isOk());
        mvc.perform(get("/api/workspace").with(user("viewer").roles("VIEWER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(put("/api/workspace").with(user("viewer").roles("VIEWER")).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content(payload(1).toString()))
                .andExpect(status().isForbidden());
    }

    @Test
    void rejectsTooManyAssociationsWithoutOverwritingAnExistingSnapshot() throws Exception {
        save(payload(0)).andExpect(status().isOk());
        ObjectNode request = payload(1);
        ObjectNode locations = (ObjectNode) request.path("locations");
        for (int index = 1; index <= 20_001; index++) locations.put(Integer.toString(index), "desk-01");
        save(request).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("WORKSPACE_INVALID"));
        mvc.perform(get("/api/workspace")).andExpect(jsonPath("$.revision").value(1))
                .andExpect(jsonPath("$.locations.length()").value(0));
    }

    @Test
    void rejectsOversizedBodiesEvenWhenTheClientOmitsOrLiesAboutContentLength() throws Exception {
        save(payload(0)).andExpect(status().isOk());
        byte[] oversized = (payload(1).toString() + " ".repeat(2_100_001)).getBytes(StandardCharsets.UTF_8);
        mvc.perform(put("/api/workspace").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(oversized))
                .andExpect(status().is(413)).andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
        mvc.perform(rawPutWithDeclaredLength(oversized, -1))
                .andExpect(status().is(413)).andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
        mvc.perform(rawPutWithDeclaredLength(oversized, 16))
                .andExpect(status().is(413)).andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"));
        mvc.perform(get("/api/workspace")).andExpect(jsonPath("$.revision").value(1));
    }

    @Test
    void enforcesTheWorkspaceUtf8SizeLimitSeparatelyFromTheCompleteBodyLimit() throws Exception {
        ObjectNode request = payload(0);
        ((ObjectNode) request.path("workspace")).put("name", "é".repeat(1_000_000));
        assertThat(request.toString().getBytes(StandardCharsets.UTF_8).length).isLessThan(2_100_000);
        save(request).andExpect(status().is(413))
                .andExpect(jsonPath("$.code").value("WORKSPACE_TOO_LARGE"));
        assertThat(workspaceCount()).isZero();
    }

    private RequestBuilder rawPutWithDeclaredLength(byte[] body, int declaredLength) {
        MockHttpServletRequestBuilder authentication = put("/api/workspace")
                .with(user("editor").roles("EDITOR")).with(csrf());
        return new SmartRequestBuilder() {
            @Override
            public MockHttpServletRequest buildRequest(ServletContext servletContext) {
                MockHttpServletRequest request = new MockHttpServletRequest(servletContext, "PUT", "/api/workspace") {
                    @Override public int getContentLength() { return declaredLength; }
                    @Override public long getContentLengthLong() { return declaredLength; }
                };
                request.setContentType(MediaType.APPLICATION_JSON_VALUE);
                request.setContent(body);
                request.addHeader("Transfer-Encoding", "chunked");
                return request;
            }

            @Override
            public MockHttpServletRequest postProcessRequest(MockHttpServletRequest request) {
                return authentication.postProcessRequest(request);
            }
        };
    }

    private void assertConcurrentWriters(long revision) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var requests = List.of(1, 2).stream().map(index -> executor.submit(() -> {
                ObjectNode request = payload(revision);
                ((ObjectNode) request.path("workspace")).put("name", "Édition " + index);
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent workspace update did not start.");
                return mvc.perform(put("/api/workspace").with(user("editor-" + index).roles("EDITOR")).with(csrf())
                                .contentType(MediaType.APPLICATION_JSON).content(request.toString()))
                        .andReturn().getResponse().getStatus();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(requests.get(0).get(30, TimeUnit.SECONDS), requests.get(1).get(30, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        } finally {
            start.countDown();
        }
    }

    private void assertInvalidCandidates(List<Consumer<ObjectNode>> candidates) throws Exception {
        for (Consumer<ObjectNode> mutate : candidates) {
            ObjectNode candidate = payload(0);
            mutate.accept(candidate);
            save(candidate).andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("WORKSPACE_INVALID"));
        }
        assertThat(workspaceCount()).isZero();
    }

    private ResultActions save(ObjectNode payload) throws Exception {
        return mvc.perform(put("/api/workspace").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload.toString()));
    }

    private long workspaceCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM workspace_documents", Long.class);
    }

    private ObjectNode payload(long revision) {
        return (ObjectNode) mapper.readTree("""
                {"expectedRevision":%d,"workspace":{"version":1,"id":"workspace-local","name":"Atelier Sureau",
                 "floors":[{"id":"floor-01","name":"Rez-de-chaussée"}],
                 "rooms":[{"floorId":"floor-01","plan":{"version":1,"id":"room-test","name":"Atelier",
                  "width":10,"depth":8,"colors":{"floor":"#e6e7e5","wall":"#e4e8ed","desk":"#d4b38c","accent":"#447cde"},
                  "display":{"walls":true,"decor":true},"workstations":[
                   {"id":"desk-01","label":"Poste 1","position":[-2,0,0],"rotation":0,"width":2,"depth":1,"color":null},
                   {"id":"desk-02","label":"Poste 2","position":[2,0,0],"rotation":0,"width":2,"depth":1,"color":"#447cde"}],
                  "furniture":[{"id":"furniture-01","kind":"table","label":"Table","position":[0,0,-2],
                   "rotation":0,"width":1,"depth":1,"height":0.75,"color":"#d4b38c"}]}}]},"locations":{}}
                """.formatted(revision));
    }

    private ArrayNode floors(ObjectNode body) { return (ArrayNode) body.path("workspace").path("floors"); }
    private ArrayNode rooms(ObjectNode body) { return (ArrayNode) body.path("workspace").path("rooms"); }
    private ObjectNode room(ObjectNode body) { return (ObjectNode) rooms(body).get(0); }
    private ObjectNode plan(ObjectNode body) { return (ObjectNode) room(body).path("plan"); }
    private ObjectNode station(ObjectNode body) { return (ObjectNode) plan(body).path("workstations").get(0); }
    private ObjectNode furniture(ObjectNode body) { return (ObjectNode) plan(body).path("furniture").get(0); }
    private ArrayNode position(ObjectNode item) { return (ArrayNode) item.path("position"); }
}
