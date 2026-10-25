package com.nadjide.sureau.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class SecurityHeadersIntegrationTests {
    @Autowired MockMvc mvc;

    @Test
    void publicAndRefusedResponsesCarryTheBrowserProtections() throws Exception {
        expectProtections(mvc.perform(get("/api/auth/status")).andExpect(status().isOk()));
        expectProtections(mvc.perform(get("/api/assets")).andExpect(status().isUnauthorized()));
    }

    @Test
    void announcesStrictTransportSecurityOnlyOverHttps() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(header().doesNotExist("Strict-Transport-Security"));
        mvc.perform(get("/api/auth/status").secure(true))
                .andExpect(header().string("Strict-Transport-Security", containsString("max-age=")));
    }

    private static void expectProtections(ResultActions result) throws Exception {
        result.andExpect(header().string("Content-Security-Policy", SecurityConfiguration.CONTENT_SECURITY_POLICY))
                .andExpect(header().string("Content-Security-Policy", containsString("script-src 'self';")))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
                .andExpect(header().string("Referrer-Policy", "same-origin"))
                .andExpect(header().string("Permissions-Policy", SecurityConfiguration.PERMISSIONS_POLICY))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }
}
