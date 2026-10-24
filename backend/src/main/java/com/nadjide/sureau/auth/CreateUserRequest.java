package com.nadjide.sureau.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(
        @NotBlank @Pattern(regexp = "[a-z0-9][a-z0-9._-]{2,49}") String username,
        @NotBlank @Size(max = 80) String displayName,
        @NotBlank @Size(min = 12, max = 64) String password,
        @NotNull UserRole role
) {
    public CreateUserRequest {
        username = SetupRequest.normalizeUsername(username);
        displayName = displayName == null ? null : displayName.trim();
    }
}
