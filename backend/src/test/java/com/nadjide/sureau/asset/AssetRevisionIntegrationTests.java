package com.nadjide.sureau.asset;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.nadjide.sureau.asset.entity.Asset;
import com.nadjide.sureau.asset.repository.AssetRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@WithMockUser(roles = "EDITOR")
class AssetRevisionIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @MockitoSpyBean AssetRepository repository;
    @Autowired JdbcTemplate jdbc;
    @PersistenceContext EntityManager entityManager;

    @BeforeEach
    void clearTestData() {
        jdbc.update("DELETE FROM workspace_documents");
        repository.deleteAll();
    }

    @Test
    void exposesTheInitialRevisionOnCreationDetailAndTheStableInventoryArray() throws Exception {
        long firstId = create("PC-01", "Poste accueil", "AVAILABLE");
        long secondId = create("PC-02", "Poste étage", "AVAILABLE");

        mvc.perform(get("/api/assets/{id}", firstId))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
                .andExpect(jsonPath("$.revision").value(0));
        mvc.perform(get("/api/assets"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(firstId)).andExpect(jsonPath("$[0].revision").value(0))
                .andExpect(jsonPath("$[1].id").value(secondId)).andExpect(jsonPath("$[1].revision").value(0));
    }

    @Test
    void advancesTheRevisionAndEtagForEachCommittedEditAndRetirement() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");

        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Poste modifié", "AVAILABLE")))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"1\""))
                .andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.name").value("Poste modifié"));
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"1\""))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"2\""))
                .andExpect(jsonPath("$.revision").value(2)).andExpect(jsonPath("$.status").value("RETIRED"));
        mvc.perform(get("/api/assets/{id}", id))
                .andExpect(status().isOk()).andExpect(header().string(HttpHeaders.ETAG, "\"2\""))
                .andExpect(jsonPath("$.name").value("Poste modifié")).andExpect(jsonPath("$.revision").value(2));
    }

    @Test
    void keepsExistingClientsCompatibleWhenIfMatchIsAbsent() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");

        mvc.perform(put("/api/assets/{id}", id).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(payload("PC-01", "Ancien client", "AVAILABLE")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(2));
    }

    @Test
    void rejectsAStaleEditWithoutOverwritingTheSavedRecord() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Version sauvegardée", "MAINTENANCE")))
                .andExpect(status().isOk());

        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Brouillon périmé", "LOST")))
                .andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("ASSET_CONFLICT"));
        mvc.perform(get("/api/assets/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Version sauvegardée"))
                .andExpect(jsonPath("$.status").value("MAINTENANCE")).andExpect(jsonPath("$.revision").value(1));
    }

    @Test
    void rejectsAStaleRetirementWithoutChangingTheBusinessStatus() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Nouveau nom", "AVAILABLE")))
                .andExpect(status().isOk());

        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\""))
                .andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("ASSET_CONFLICT"));
        mvc.perform(get("/api/assets/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE")).andExpect(jsonPath("$.revision").value(1));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", " ", "0", "W/\"0\"", "*", "\"0\", \"1\"", "\"-1\"", "\"1.5\"", "\"01\"", "\"9007199254740992\""})
    void rejectsAmbiguousOrMalformedPreconditionsBeforeApplyingEitherWrite(String ifMatch) throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");

        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, ifMatch)
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Ne doit pas passer", "LOST")))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header(HttpHeaders.IF_MATCH, ifMatch))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.name").value("Poste accueil"))
                .andExpect(jsonPath("$.status").value("AVAILABLE")).andExpect(jsonPath("$.revision").value(0));
    }

    @Test
    void acceptsOuterWhitespaceAndDistinguishesAValidButStaleLargeRevision() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "  \"0\"  ")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Modification", "AVAILABLE")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1));
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"9007199254740991\""))
                .andExpect(status().isPreconditionFailed()).andExpect(jsonPath("$.code").value("ASSET_CONFLICT"));
    }

    @Test
    void preventsBypassingTheAssignedRetirementRuleUsingTheGeneralUpdateEndpoint() throws Exception {
        long id = create("PC-01", "Poste attribué", "ASSIGNED");

        mvc.perform(put("/api/assets/{id}", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\"")
                        .contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "Retrait interdit", "RETIRED")))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSET_STATUS_CONFLICT"));
        mvc.perform(patch("/api/assets/{id}/retire", id).with(csrf()).header(HttpHeaders.IF_MATCH, "\"0\""))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ASSET_STATUS_CONFLICT"));
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.name").value("Poste attribué"))
                .andExpect(jsonPath("$.status").value("ASSIGNED")).andExpect(jsonPath("$.revision").value(0));
    }

    @Test
    void spatialAssociationDoesNotAlterAnAssetsBusinessStatusOrRevision() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");
        String workspace = """
                {"expectedRevision":0,"workspace":{"version":1,"id":"workspace-local","name":"Atelier",
                 "floors":[{"id":"floor-01","name":"Étage 1"}],"rooms":[{"floorId":"floor-01","plan":{
                  "version":1,"id":"room-test","name":"Salle","width":10,"depth":8,
                  "colors":{"floor":"#e6e7e5","wall":"#e4e8ed","desk":"#d4b38c","accent":"#447cde"},
                  "display":{"walls":true,"decor":true},"workstations":[{"id":"desk-01","label":"Poste 1",
                   "position":[0,0,0],"rotation":0,"width":2,"depth":1,"color":null}],"furniture":[]}}]},
                 "locations":{"%d":"desk-01"}}
                """.formatted(id);

        mvc.perform(put("/api/workspace").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(workspace))
                .andExpect(status().isOk());
        mvc.perform(get("/api/assets/{id}", id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("AVAILABLE")).andExpect(jsonPath("$.revision").value(0));
    }

    @Test
    void concurrentEditsWithTheSameRevisionSaveExactlyOneCoherentResult() throws Exception {
        long id = create("PC-01", "Poste accueil", "AVAILABLE");
        CountDownLatch loaded = new CountDownLatch(2);
        // Keep both real database reads ahead of either flush, so this exercises @Version,
        // rather than passing only because the second request notices a stale If-Match.
        doAnswer(invocation -> {
            // Spring Data's interface cannot callRealMethod; use its actual JPA read
            // against the transaction-bound persistence context instead.
            var result = Optional.ofNullable(entityManager.find(Asset.class, invocation.getArgument(0, Long.class)));
            loaded.countDown();
            if (!loaded.await(10, TimeUnit.SECONDS)) throw new AssertionError("Both edits must load the same revision.");
            return result;
        }).when(repository).findById(id);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        List<MvcResult> results;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var requests = List.of(1, 2).stream().map(index -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent edit did not start.");
                return mvc.perform(put("/api/assets/{id}", id).with(user("editor-" + index).roles("EDITOR")).with(csrf())
                                .header(HttpHeaders.IF_MATCH, "\"0\"").contentType(MediaType.APPLICATION_JSON)
                                .content(payload("PC-01", "Édition " + index, "AVAILABLE")))
                        .andReturn();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            results = List.of(requests.get(0).get(30, TimeUnit.SECONDS), requests.get(1).get(30, TimeUnit.SECONDS));
        } finally {
            start.countDown();
        }
        assertThat(results.stream().map(result -> result.getResponse().getStatus()).toList())
                .containsExactlyInAnyOrder(200, 412);
        MvcResult winner = results.stream().filter(result -> result.getResponse().getStatus() == 200).findFirst().orElseThrow();
        MvcResult loser = results.stream().filter(result -> result.getResponse().getStatus() == 412).findFirst().orElseThrow();
        String savedName = mapper.readTree(winner.getResponse().getContentAsString()).path("name").asText();
        assertThat(mapper.readTree(loser.getResponse().getContentAsString()).path("code").asText()).isEqualTo("ASSET_CONFLICT");
        assertThat(winner.getResponse().getHeader(HttpHeaders.ETAG)).isEqualTo("\"1\"");
        mvc.perform(get("/api/assets/{id}", id)).andExpect(jsonPath("$.name").value(savedName))
                .andExpect(jsonPath("$.revision").value(1)).andExpect(header().string(HttpHeaders.ETAG, "\"1\""));
    }

    private long create(String tag, String name, String businessStatus) throws Exception {
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(tag, name, businessStatus)))
                .andExpect(status().isCreated()).andExpect(header().string(HttpHeaders.ETAG, "\"0\""))
                .andExpect(jsonPath("$.revision").value(0)).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asLong();
    }

    private String payload(String tag, String name, String businessStatus) {
        return """
                {"assetTag":"%s","serialNumber":null,"name":"%s","brand":null,"model":null,
                 "category":"COMPUTER","status":"%s","purchaseDate":null}
                """.formatted(tag, name, businessStatus);
    }
}
