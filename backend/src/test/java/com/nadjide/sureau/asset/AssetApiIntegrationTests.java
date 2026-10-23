package com.nadjide.sureau.asset;

import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import com.nadjide.sureau.asset.repository.AssetRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@WithMockUser(roles = "EDITOR")
class AssetApiIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired AssetRepository repository;

    @BeforeEach
    void clearTestInventory() {
        repository.deleteAll();
    }

    @Test
    void normalizesFieldsAndPersistsOptionalBlanksAsNull() throws Exception {
        String body = """
                {"assetTag":"  PC-01  ","name":"  Poste accueil  ","serialNumber":"  ",
                 "brand":"  Lenovo  ","model":"  ","category":"COMPUTER","status":"AVAILABLE"}
                """;
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.assetTag").value("PC-01"))
                .andExpect(jsonPath("$.name").value("Poste accueil"))
                .andExpect(jsonPath("$.serialNumber").isEmpty())
                .andExpect(jsonPath("$.brand").value("Lenovo"))
                .andExpect(jsonPath("$.model").isEmpty())
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.updatedAt").isNotEmpty())
                .andReturn().getResponse().getContentAsString();
        long id = mapper.readTree(response).path("id").asLong();
        mvc.perform(get("/api/assets/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Poste accueil"));
        assertThat(repository.findById(id).orElseThrow().getSerialNumber()).isNull();
    }

    @Test
    void allowsSeveralAssetsWithNoSerialNumber() throws Exception {
        create("PC-01", "");
        create("PC-02", "  ");
        assertThat(repository.findAll()).hasSize(2).allSatisfy(asset -> assertThat(asset.getSerialNumber()).isNull());
    }

    @Test
    void returnsStructuredFieldValidationAndDoesNotSaveInvalidAsset() throws Exception {
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"assetTag":"  ","name":"  ","category":"COMPUTER","status":"AVAILABLE"}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.instance").value("/api/assets"))
                .andExpect(jsonPath("$.errors[0].field").value("assetTag"))
                .andExpect(jsonPath("$.errors[1].field").value("name"));
        assertThat(repository.count()).isZero();
    }

    @Test
    void rejectsInvalidEnumsAndMalformedJsonWithoutInternalDetails() throws Exception {
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"assetTag":"PC-01","name":"Poste","category":"INVALID","status":"AVAILABLE"}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"))
                .andExpect(jsonPath("$.exception").doesNotExist());
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("{"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }

    @Test
    void rejectsDuplicateNormalizedTagAndSerialNumber() throws Exception {
        create("PC-01", "SN-01");
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload(" PC-01 ", "SN-02")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload("PC-02", " SN-01 ")))
                .andExpect(status().isConflict())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
        assertThat(repository.count()).isOne();
    }

    @Test
    void updatesAnAssetWithoutConflictingWithItsOwnIdentifiers() throws Exception {
        long id = create("PC-01", "SN-01");
        mvc.perform(put("/api/assets/{id}", id).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(payload(" PC-01 ", " SN-01 ").replace("Poste", "  Nouveau nom  ")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Nouveau nom"));
    }

    @Test
    void aConflictingUpdatePreservesTheOriginalAsset() throws Exception {
        create("PC-01", "SN-01");
        long secondId = create("PC-02", "SN-02");
        mvc.perform(put("/api/assets/{id}", secondId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload("PC-01", "SN-02")))
                .andExpect(status().isConflict());
        mvc.perform(get("/api/assets/{id}", secondId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assetTag").value("PC-02"))
                .andExpect(jsonPath("$.serialNumber").value("SN-02"));
    }

    @Test
    void returnsAnInventoryArrayInStableIdOrderAfterUpdates() throws Exception {
        long firstId = create("ZZ-01", "SN-01");
        long secondId = create("AA-02", "SN-02");
        mvc.perform(put("/api/assets/{id}", firstId).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload("ZZ-01", "SN-01")))
                .andExpect(status().isOk());
        mvc.perform(get("/api/assets"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(firstId))
                .andExpect(jsonPath("$[1].id").value(secondId));
    }

    @Test
    void preservesAssignedAssetsAndOnlyRetiresEligibleAssetsOnce() throws Exception {
        String assigned = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(payload("PC-01", "SN-01").replace("AVAILABLE", "ASSIGNED")))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        long assignedId = mapper.readTree(assigned).path("id").asLong();
        mvc.perform(patch("/api/assets/{id}/retire", assignedId).with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ASSET_STATUS_CONFLICT"));
        assertThat(repository.findById(assignedId).orElseThrow().getStatus().name()).isEqualTo("ASSIGNED");

        long availableId = create("PC-02", "SN-02");
        mvc.perform(patch("/api/assets/{id}/retire", availableId).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RETIRED"));
        mvc.perform(patch("/api/assets/{id}/retire", availableId).with(csrf())).andExpect(status().isConflict());
    }

    @Test
    void missingAndMalformedIdentifiersHaveStableProblemResponses() throws Exception {
        mvc.perform(get("/api/assets/{id}", Long.MAX_VALUE))
                .andExpect(status().isNotFound())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
        mvc.perform(get("/api/assets/not-an-id"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAMETER"));
    }

    @Test
    void concurrentDuplicateCreationSavesExactlyOneAssetAndReturnsConflict() throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var requests = List.of(1, 2).stream().map(index -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent request did not start.");
                return mvc.perform(post("/api/assets").with(user("editor").roles("EDITOR")).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                                .content(payload("PC-CONCURRENT", "SN-" + index)))
                        .andReturn().getResponse().getStatus();
            })).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(List.of(requests.get(0).get(20, TimeUnit.SECONDS), requests.get(1).get(20, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(201, 409);
        } finally {
            start.countDown();
        }
        assertThat(repository.count()).isOne();
    }

    private long create(String tag, String serial) throws Exception {
        String response = mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(payload(tag, serial)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(response).path("id").asLong();
    }

    private String payload(String tag, String serial) {
        return """
                {"assetTag":"%s","serialNumber":"%s","name":"Poste","category":"COMPUTER","status":"AVAILABLE"}
                """.formatted(tag, serial);
    }
}
