package com.nadjide.sureau.common;

import java.time.Duration;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Lets browsers keep the compiled interface. Vite names every file under /assets after its
 * content, so a new version always gets new names and a cached file can never be stale. Other
 * responses, index.html included, keep Spring Security's no-store default: a deployment is
 * picked up on the next visit.
 */
@Configuration
class StaticResourceConfiguration implements WebMvcConfigurer {
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/assets/**")
                .addResourceLocations("classpath:/static/assets/")
                .setCacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable());
    }
}
