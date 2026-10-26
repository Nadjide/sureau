package com.nadjide.sureau.asset.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** The person holding an assigned asset; they need no Sureau account. */
public record Assignee(
    @NotBlank @Size(max = 150)
    String name,

    @Email @Size(max = 254)
    String email,

    @Size(max = 100)
    String department
) {
    public Assignee {
        name = name == null ? null : name.trim();
        email = optional(email);
        department = optional(department);
    }

    private static String optional(String value) {
        String normalized = value == null ? null : value.trim();
        return normalized == null || normalized.isEmpty() ? null : normalized;
    }
}
