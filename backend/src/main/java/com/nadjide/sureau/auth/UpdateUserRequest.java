package com.nadjide.sureau.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdateUserRequest(
        @NotBlank @Size(max = 80) String displayName,
        @NotNull UserRole role,
        @NotNull Boolean enabled
) {
    public UpdateUserRequest {
        displayName = displayName == null ? null : displayName.trim();
    }
}
