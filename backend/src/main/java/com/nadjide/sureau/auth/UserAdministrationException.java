package com.nadjide.sureau.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class UserAdministrationException extends ResponseStatusException {
    private final String code;

    UserAdministrationException(HttpStatus status, String code, String reason) {
        super(status, reason);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
