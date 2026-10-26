package com.nadjide.sureau.asset.service;

import java.util.List;

import com.nadjide.sureau.common.ApiExceptionHandler.FieldError;

/** Rows that cannot be imported; reported like field validation, and nothing is saved. */
public class AssetImportException extends RuntimeException {
    private final transient List<FieldError> errors;

    public AssetImportException(List<FieldError> errors) {
        super("The import contains invalid rows.");
        this.errors = List.copyOf(errors);
    }

    public List<FieldError> errors() {
        return errors;
    }
}
