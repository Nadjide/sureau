package com.nadjide.sureau.auth;

import java.io.IOException;
import java.net.ServerSocket;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// The application starts and keeps password sign-in although its provider cannot be reached.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class OidcProviderUnavailableIntegrationTests {
    @Autowired MockMvc mvc;

    @DynamicPropertySource
    static void unreachableProvider(DynamicPropertyRegistry registry) throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        registry.add("sureau.oidc.issuer", () -> "http://127.0.0.1:" + closedPort + "/realms/sureau");
        registry.add("sureau.oidc.client-id", () -> "sureau-test");
    }

    @Test
    void sendsThePersonBackToTheSignInPage() throws Exception {
        mvc.perform(get("/api/auth/status")).andExpect(status().isOk()).andExpect(jsonPath("$.sso").exists());
        mvc.perform(get("/oauth2/authorization/oidc"))
                .andExpect(status().is3xxRedirection())
                .andExpect(redirectedUrl("/?sso=unavailable"));
    }
}
