CREATE TABLE workspace_documents (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    revision BIGINT NOT NULL,
    workspace JSONB NOT NULL,
    locations JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_workspace_documents_singleton CHECK (id = 1),
    CONSTRAINT chk_workspace_documents_revision CHECK (revision BETWEEN 1 AND 9007199254740991),
    CONSTRAINT chk_workspace_documents_objects CHECK (
        jsonb_typeof(workspace) = 'object' AND jsonb_typeof(locations) = 'object'
    )
);
