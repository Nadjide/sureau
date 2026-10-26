package com.nadjide.sureau.auth;

public record AdminUserResponse(long id, String username, String displayName, UserRole role, boolean enabled,
                                String email) {}
