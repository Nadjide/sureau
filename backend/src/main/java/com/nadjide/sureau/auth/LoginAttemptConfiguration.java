package com.nadjide.sureau.auth;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import tools.jackson.databind.ObjectMapper;

@Configuration
class LoginAttemptConfiguration {
    @Bean
    FilterRegistrationBean<LoginAttemptFilter> loginAttemptFilter(LoginAttemptGuard guard, ObjectMapper mapper) {
        FilterRegistrationBean<LoginAttemptFilter> registration =
                new FilterRegistrationBean<>(new LoginAttemptFilter(guard, mapper));
        registration.addUrlPatterns(LoginAttemptFilter.LOGIN, LoginAttemptFilter.SETUP);
        // Spring Security's filter chain is registered at order -100: refuse before it runs.
        registration.setOrder(-101);
        return registration;
    }
}
