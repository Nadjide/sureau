package com.nadjide.sureau.common;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class StaticResourceCachingIntegrationTests {
    @Autowired MockMvc mvc;

    @Test
    void compiledInterfaceFilesAreCachedForAYear() throws Exception {
        // src/test/resources/static/assets stands in for the Vite build.
        mvc.perform(get("/assets/cache-probe-3f9a1c.js"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control",
                        allOf(containsString("max-age=31536000"), containsString("public"), containsString("immutable"))));
    }

    @Test
    void apiResponsesAreNeverCached() throws Exception {
        mvc.perform(get("/api/auth/status"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("no-store")));
    }

    @Test
    void aMissingInterfaceFileIsNotFoundRatherThanCached() throws Exception {
        mvc.perform(get("/assets/missing-0000.js"))
                .andExpect(status().isNotFound())
                .andExpect(header().string("Cache-Control", containsString("no-store")));
    }
}
