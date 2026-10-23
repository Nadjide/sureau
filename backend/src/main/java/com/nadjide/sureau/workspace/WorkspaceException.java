package com.nadjide.sureau.workspace;

import org.springframework.http.HttpStatus;

public class WorkspaceException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public WorkspaceException(HttpStatus status, String code, String detail) {
        super(detail);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
