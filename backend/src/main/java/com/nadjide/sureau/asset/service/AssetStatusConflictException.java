package com.nadjide.sureau.asset.service;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class AssetStatusConflictException extends ResponseStatusException {

    public AssetStatusConflictException(String reason) {
        super(HttpStatus.CONFLICT, reason);
    }
}
