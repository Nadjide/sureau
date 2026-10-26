package com.nadjide.sureau.auth;

import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class AccountValidation {
    private AccountValidation() {}

    /** An optional e-mail address: trimmed, and null when left empty. */
    static String email(String email) {
        String trimmed = email == null ? null : email.trim();
        return trimmed == null || trimmed.isEmpty() ? null : trimmed;
    }

    static void password(String password) {
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The password must not exceed 72 UTF-8 bytes.");
        }
    }

    static void displayName(String name) {
        for (int index = 0; index < name.length(); index++) {
            char character = name.charAt(index);
            if (character == 0 || Character.isLowSurrogate(character)) invalidName();
            if (Character.isHighSurrogate(character)) {
                if (index + 1 >= name.length() || !Character.isLowSurrogate(name.charAt(index + 1))) invalidName();
                index++;
            }
        }
    }

    private static void invalidName() {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The display name contains an invalid Unicode character.");
    }
}
