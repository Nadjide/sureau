package com.nadjide.sureau.auth;

record UserAccount(long id, String username, String displayName, String passwordHash, UserRole role) {
    UserResponse response() {
        return new UserResponse(id, username, displayName, role);
    }
}
