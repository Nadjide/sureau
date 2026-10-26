package com.nadjide.sureau.common;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** Bounds the large documents (workspace snapshot, asset import) before JSON parsing, including chunked requests. */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 10)
public class RequestBodyLimitFilter extends OncePerRequestFilter {
    public static final int MAX_BODY_BYTES = 2_100_000;
    private static final Map<String, String> LIMITED = Map.of(
            "PUT /api/workspace", "The complete workspace snapshot exceeds 2.1 MB.",
            "POST /api/assets/import", "The complete import exceeds 2.1 MB.");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !LIMITED.containsKey(route(request));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        if (request.getContentLengthLong() > MAX_BODY_BYTES) {
            tooLarge(response, route(request));
            return;
        }
        byte[] body = request.getInputStream().readNBytes(MAX_BODY_BYTES + 1);
        if (body.length > MAX_BODY_BYTES) {
            tooLarge(response, route(request));
            return;
        }
        chain.doFilter(new HttpServletRequestWrapper(request) {
            @Override
            public ServletInputStream getInputStream() {
                ByteArrayInputStream input = new ByteArrayInputStream(body);
                return new ServletInputStream() {
                    @Override public int read() { return input.read(); }
                    @Override public int read(byte[] bytes, int offset, int length) {
                        return input.read(bytes, offset, length);
                    }
                    @Override public boolean isFinished() { return input.available() == 0; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) {
                        throw new IllegalStateException("Asynchronous request reading is not supported.");
                    }
                };
            }

            @Override
            public BufferedReader getReader() {
                return new BufferedReader(new InputStreamReader(getInputStream(), StandardCharsets.UTF_8));
            }
        }, response);
    }

    private static String route(HttpServletRequest request) {
        return request.getMethod() + " " + request.getRequestURI().substring(request.getContextPath().length());
    }

    private static void tooLarge(HttpServletResponse response, String route) throws IOException {
        response.setStatus(413);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("""
                {"type":"about:blank","title":"Payload Too Large","status":413,
                 "code":"PAYLOAD_TOO_LARGE","detail":"%s",
                 "instance":"%s"}
                """.formatted(LIMITED.get(route), route.substring(route.indexOf(' ') + 1)));
    }
}
