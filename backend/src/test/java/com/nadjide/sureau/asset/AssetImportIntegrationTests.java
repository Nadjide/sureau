package com.nadjide.sureau.asset;

import java.util.Collections;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Sql("/test-users.sql")
@WithUserDetails(value = "test-editor", setupBefore = TestExecutionEvent.TEST_EXECUTION)
class AssetImportIntegrationTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserDetailsService users;

    @BeforeEach
    @AfterEach
    void clearInventory() {
        jdbc.update("DELETE FROM assets");
    }

    @Test
    void importsEveryRowAtOnceAndRecordsTheirOrigin() throws Exception {
        String response = importRows("""
                {"assetTag":" IMP-01 ","name":"Portable","category":"COMPUTER","status":"AVAILABLE","serialNumber":"SN-1"},
                {"assetTag":"IMP-02","name":"Écran","category":"MONITOR","status":"ASSIGNED",
                 "assignee":{"name":"Camille Bernard","email":"camille@exemple.fr"}},
                {"assetTag":"IMP-03","name":"Ancien serveur","category":"SERVER","status":"RETIRED","purchaseDate":"2019-04-01"}
                """)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.created").value(3))
                .andExpect(jsonPath("$.assets[0].assetTag").value("IMP-01"))
                .andExpect(jsonPath("$.assets[1].assignee.name").value("Camille Bernard"))
                .andReturn().getResponse().getContentAsString();
        assertThat(count()).isEqualTo(3);

        long id = mapper.readTree(response).path("assets").path(1).path("id").asLong();
        JsonNode history = mapper.readTree(mvc.perform(get("/api/assets/{id}/history", id))
                .andReturn().getResponse().getContentAsString());
        assertThat(history).hasSize(1);
        assertThat(history.path(0).path("action").asString()).isEqualTo("IMPORTED");
        assertThat(history.path(0).path("actor").path("username").asString()).isEqualTo("test-editor");
    }

    @Test
    void reportsInvalidFieldsRowByRowAndImportsNothing() throws Exception {
        importRows("""
                {"assetTag":"IMP-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE"},
                {"assetTag":"IMP-02","name":"  ","category":"COMPUTER","status":"AVAILABLE"},
                {"assetTag":"IMP-03","name":"Écran","category":"MONITOR","status":"ASSIGNED",
                 "assignee":{"name":"Camille","email":"pas-une-adresse"}}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors[0].field").value("assets[1].name"))
                .andExpect(jsonPath("$.errors[1].field").value("assets[2].assignee.email"));
        assertThat(count()).isZero();
    }

    @Test
    void refusesDuplicatesInTheFileOrInTheInventoryAndHoldersOfUnassignedAssets() throws Exception {
        mvc.perform(post("/api/assets").with(csrf()).contentType(MediaType.APPLICATION_JSON).content("""
                {"assetTag":"EXISTING","serialNumber":"SN-EXISTING","name":"Déjà là","category":"OTHER","status":"AVAILABLE"}
                """)).andExpect(status().isCreated());

        importRows("""
                {"assetTag":"IMP-01","name":"Portable","category":"COMPUTER","status":"AVAILABLE",
                 "assignee":{"name":"Camille"}},
                {"assetTag":"EXISTING","name":"Doublon de l'inventaire","category":"OTHER","status":"AVAILABLE"},
                {"assetTag":"IMP-01","name":"Doublon du fichier","category":"OTHER","status":"AVAILABLE"},
                {"assetTag":"IMP-04","serialNumber":"SN-EXISTING","name":"Série déjà utilisée","category":"OTHER","status":"AVAILABLE"}
                """)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.errors.length()").value(4))
                .andExpect(jsonPath("$.errors[0].field").value("assets[0].assignee"))
                .andExpect(jsonPath("$.errors[1].field").value("assets[2].assetTag"))
                .andExpect(jsonPath("$.errors[1].message").value("is repeated in this import (row 1)"))
                .andExpect(jsonPath("$.errors[2].field").value("assets[1].assetTag"))
                .andExpect(jsonPath("$.errors[2].message").value("is already used by an existing asset"))
                .andExpect(jsonPath("$.errors[3].field").value("assets[3].serialNumber"));
        assertThat(count()).isOne();
    }

    @Test
    void boundsTheImportAndKeepsItForEditors() throws Exception {
        importRows("").andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("assets"));
        String row = """
                {"assetTag":"T","name":"N","category":"OTHER","status":"AVAILABLE"}""";
        importRows(String.join(",", Collections.nCopies(1001, row)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors[0].field").value("assets"));

        String padded = "{\"assets\":[" + row + "],\"padding\":\"" + "x".repeat(2_200_000) + "\"}";
        mvc.perform(post("/api/assets/import").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(padded))
                .andExpect(status().isContentTooLarge())
                .andExpect(jsonPath("$.code").value("PAYLOAD_TOO_LARGE"))
                .andExpect(jsonPath("$.instance").value("/api/assets/import"));

        mvc.perform(post("/api/assets/import").with(user(users.loadUserByUsername("test-viewer"))).with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"assets\":[" + row + "]}"))
                .andExpect(status().isForbidden());
        assertThat(count()).isZero();
    }

    private ResultActions importRows(String rows) throws Exception {
        return mvc.perform(post("/api/assets/import").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"assets\":[" + rows + "]}"));
    }

    private long count() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM assets", Long.class);
    }
}
