package com.nadjide.sureau.workspace;

import com.nadjide.sureau.asset.service.AssetHistoryService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

@Service
public class WorkspaceService {
    private final WorkspaceRepository repository;
    private final WorkspaceValidator validator;
    private final AssetHistoryService history;

    public WorkspaceService(WorkspaceRepository repository, WorkspaceValidator validator, AssetHistoryService history) {
        this.repository = repository;
        this.validator = validator;
        this.history = history;
    }

    public WorkspaceSnapshot get() {
        return repository.find().orElseThrow(() -> new WorkspaceException(HttpStatus.NOT_FOUND,
                "WORKSPACE_NOT_INITIALIZED", "The shared workspace has not been initialized."));
    }

    @Transactional
    public WorkspaceSnapshot save(JsonNode request) {
        WorkspaceSave save = validator.validate(request);
        // Only the version this save replaces is compared: with any other version, the save fails below.
        WorkspaceSnapshot previous = repository.find()
                .filter(snapshot -> snapshot.revision() == save.expectedRevision()).orElse(null);
        WorkspaceSnapshot saved = repository.save(save).orElseThrow(() -> new WorkspaceException(HttpStatus.CONFLICT,
                "WORKSPACE_CONFLICT", "The shared workspace has changed. Reload it before saving again."));
        history.recordLocations(previous == null ? null : previous.workspace(),
                previous == null ? null : previous.locations(), saved.workspace(), saved.locations());
        return saved;
    }
}
