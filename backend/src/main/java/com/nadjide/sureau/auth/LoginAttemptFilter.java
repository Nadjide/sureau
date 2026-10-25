package com.nadjide.sureau.auth;

import java.io.IOException;
import java.time.Duration;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/**
 * Refuses login and setup attempts while their account or client is locked by
 * {@link LoginAttemptGuard}, before any password is checked, then counts the outcome from the
 * response: 204 and 401 for a login, 403 (invalid token) for the initial setup.
 */
class LoginAttemptFilter extends OncePerRequestFilter {
    static final String LOGIN = "/api/auth/login";
    static final String SETUP = "/api/auth/setup";

    private final LoginAttemptGuard guard;
    private final ObjectMapper mapper;

    LoginAttemptFilter(LoginAttemptGuard guard, ObjectMapper mapper) {
        this.guard = guard;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        boolean login = LOGIN.equals(request.getRequestURI());
        String username = login ? request.getParameter("username") : null;
        String client = request.getRemoteAddr();
        Duration wait = guard.retryAfter(username, client);
        if (!wait.isZero()) {
            long seconds = Math.max(1, (wait.toMillis() + 999) / 1000);
            response.setHeader("Retry-After", Long.toString(seconds));
            SecurityConfiguration.writeProblem(mapper, request, response, HttpStatus.TOO_MANY_REQUESTS,
                    "TOO_MANY_ATTEMPTS", "Too many failed attempts. Try again later.");
            return;
        }
        chain.doFilter(request, response);
        int status = response.getStatus();
        if (login && status == HttpStatus.NO_CONTENT.value()) guard.succeeded(username);
        else if (login && status == HttpStatus.UNAUTHORIZED.value()) guard.failed(username, client);
        // An invalid setup token is answered with 403; the account does not exist yet.
        else if (!login && status == HttpStatus.FORBIDDEN.value()) guard.failed(null, client);
    }
}
