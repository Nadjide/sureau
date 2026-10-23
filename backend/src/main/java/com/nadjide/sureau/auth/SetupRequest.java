package com.nadjide.sureau.auth;

import java.util.Locale;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SetupRequest(
        @NotBlank @Size(max = 512) String setupToken,
        @NotBlank @Pattern(regexp = "[a-z0-9][a-z0-9._-]{2,49}") String username,
        @NotBlank @Size(max = 80) String displayName,
        @NotBlank @Size(min = 12, max = 64) String password
) {
    public SetupRequest {
        username = normalizeUsername(username);
        displayName = displayName == null ? null : displayName.trim();
    }

    static String normalizeUsername(String username) {
        return username == null ? null : username.trim().toLowerCase(Locale.ROOT);
    }
}
