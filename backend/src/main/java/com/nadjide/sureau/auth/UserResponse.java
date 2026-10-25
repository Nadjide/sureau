package com.nadjide.sureau.auth;

public record UserResponse(long id, String username, String displayName, UserRole role) {}
