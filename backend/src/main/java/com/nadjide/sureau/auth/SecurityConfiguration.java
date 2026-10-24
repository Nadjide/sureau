package com.nadjide.sureau.auth;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.csrf.XorCsrfTokenRequestAttributeHandler;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;
import tools.jackson.databind.ObjectMapper;

@Configuration
public class SecurityConfiguration {
    @Bean
    CookieSerializer sessionCookieSerializer(@Value("${server.servlet.session.cookie.secure:false}") boolean secure) {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("SESSION");
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setSameSite("Lax");
        serializer.setUseSecureCookie(secure);
        return serializer;
    }

    @Bean
    UserDetailsService userDetailsService(UserRepository users) {
        return suppliedUsername -> {
            String username = SetupRequest.normalizeUsername(suppliedUsername);
            if (username == null || !username.matches("[a-z0-9][a-z0-9._-]{2,49}")) {
                throw new UsernameNotFoundException("Invalid username or password.");
            }
            UserAccount account = users.findByUsername(username).orElseThrow(() ->
                    new UsernameNotFoundException("Invalid username or password."));
            return new SessionPrincipal(account);
        };
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(12);
        return new PasswordEncoder() {
            @Override
            public String encode(CharSequence rawPassword) {
                return bcrypt.encode(rawPassword);
            }

            @Override
            public boolean matches(CharSequence rawPassword, String encodedPassword) {
                // BCrypt is limited by UTF-8 bytes, rather than Java character count.
                return rawPassword != null && rawPassword.length() <= 64
                        && rawPassword.toString().getBytes(StandardCharsets.UTF_8).length <= 72
                        && bcrypt.matches(rawPassword, encodedPassword);
            }
        };
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, ObjectMapper mapper, UserRepository users) throws Exception {
        http
                .csrf(csrf -> csrf
                        .csrfTokenRepository(new HttpSessionCsrfTokenRepository())
                        .csrfTokenRequestHandler(new XorCsrfTokenRequestAttributeHandler()))
                .requestCache(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers("/error", "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/actuator/**").denyAll()
                        .requestMatchers(HttpMethod.GET, "/api/auth/status", "/api/auth/csrf").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/setup", "/api/auth/login").permitAll()
                        .requestMatchers("/api/users/**").hasRole("ADMIN")
                        .requestMatchers(HttpMethod.GET, "/api/**").authenticated()
                        .requestMatchers(HttpMethod.HEAD, "/api/**").authenticated()
                        .requestMatchers("/api/**").hasAnyRole("ADMIN", "EDITOR")
                        .anyRequest().permitAll())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) ->
                                writeProblem(mapper, request, response, HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED",
                                        "Authentication is required."))
                        .accessDeniedHandler((request, response, exception) ->
                                writeProblem(mapper, request, response, HttpStatus.FORBIDDEN, "ACCESS_DENIED",
                                        "Access is denied or the CSRF token is missing or invalid.")))
                .formLogin(form -> form
                        .loginPage("/")
                        .loginProcessingUrl("/api/auth/login")
                        .successHandler((request, response, authentication) -> response.setStatus(HttpServletResponse.SC_NO_CONTENT))
                        .failureHandler((request, response, exception) ->
                                writeProblem(mapper, request, response, HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS",
                                        "Invalid username or password.")))
                .logout(logout -> logout
                        .logoutUrl("/api/auth/logout")
                        .deleteCookies("SESSION")
                        .logoutSuccessHandler((request, response, authentication) -> response.setStatus(HttpServletResponse.SC_NO_CONTENT))
                        .permitAll())
                .addFilterBefore(new AccountSessionFilter(users, mapper), AuthorizationFilter.class);
        return http.build();
    }

    static void writeProblem(ObjectMapper mapper, HttpServletRequest request, HttpServletResponse response,
                                     HttpStatus status, String code, String detail) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        mapper.writeValue(response.getOutputStream(), Map.of(
                "type", "about:blank", "title", status.getReasonPhrase(), "status", status.value(),
                "detail", detail, "instance", request.getRequestURI(), "code", code));
    }
}
