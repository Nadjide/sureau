package com.nadjide.sureau.auth;

record UserAccount(long id, String username, String displayName, String passwordHash, UserRole role,
                   boolean enabled, long authVersion) {
    UserResponse response() {
        return new UserResponse(id, username, displayName, role);
    }

    AdminUserResponse adminResponse() {
        return new AdminUserResponse(id, username, displayName, role, enabled);
    }
}
