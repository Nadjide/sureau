package com.nadjide.sureau.auth;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import tools.jackson.databind.ObjectMapper;

/** Registered only inside the security chain, after the session context has been restored. */
public final class AccountSessionFilter extends OncePerRequestFilter {
    private final UserRepository users;
    private final ObjectMapper mapper;

    AccountSessionFilter(UserRepository users, ObjectMapper mapper) {
        this.users = users;
        this.mapper = mapper;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !path(request).startsWith("/api/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated() || authentication instanceof AnonymousAuthenticationToken) {
            chain.doFilter(request, response);
            return;
        }

        boolean valid;
        try {
            valid = authentication.getPrincipal() instanceof SessionPrincipal principal
                    && users.findSecurityStateById(principal.getId()).filter(account -> account.enabled()
                    && account.username().equals(principal.getUsername())
                    && account.authVersion() == principal.getAuthVersion()).isPresent();
        } catch (DataAccessException exception) {
            SecurityConfiguration.writeProblem(mapper, request, response, HttpStatus.SERVICE_UNAVAILABLE,
                    "AUTHENTICATION_UNAVAILABLE", "The account session could not be verified. Try again later.");
            return;
        }
        if (valid) {
            chain.doFilter(request, response);
            return;
        }

        SecurityContextHolder.clearContext();
        HttpSession session = request.getSession(false);
        if (session != null) {
            try { session.invalidate(); } catch (IllegalStateException ignored) { /* Already invalidated. */ }
        }
        if (publicAuthenticationRoute(request)) {
            chain.doFilter(request, response);
            return;
        }
        SecurityConfiguration.writeProblem(mapper, request, response, HttpStatus.UNAUTHORIZED,
                "AUTHENTICATION_REQUIRED", "The account session is no longer valid. Sign in again.");
    }

    private static boolean publicAuthenticationRoute(HttpServletRequest request) {
        String path = path(request);
        return "GET".equals(request.getMethod()) && (path.equals("/api/auth/status") || path.equals("/api/auth/csrf"))
                || "POST".equals(request.getMethod()) && (path.equals("/api/auth/setup") || path.equals("/api/auth/login"));
    }

    private static String path(HttpServletRequest request) {
        return request.getRequestURI().substring(request.getContextPath().length());
    }
}
