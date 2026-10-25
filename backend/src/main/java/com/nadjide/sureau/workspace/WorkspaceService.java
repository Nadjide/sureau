package com.nadjide.sureau.workspace;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class WorkspaceService {
    private final WorkspaceRepository repository;
    private final WorkspaceValidator validator;

    public WorkspaceService(WorkspaceRepository repository, WorkspaceValidator validator) {
        this.repository = repository;
        this.validator = validator;
    }

    public WorkspaceSnapshot get() {
        return repository.find().orElseThrow(() -> new WorkspaceException(HttpStatus.NOT_FOUND,
                "WORKSPACE_NOT_INITIALIZED", "The shared workspace has not been initialized."));
    }

    @Transactional
    public WorkspaceSnapshot save(JsonNode request) {
        WorkspaceSave save = validator.validate(request);
        return repository.save(save).orElseThrow(() -> new WorkspaceException(HttpStatus.CONFLICT,
                "WORKSPACE_CONFLICT", "The shared workspace has changed. Reload it before saving again."));
    }
}
