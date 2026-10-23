package com.nadjide.sureau.workspace;

import java.time.OffsetDateTime;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

@Repository
public class WorkspaceRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;
    private final RowMapper<WorkspaceSnapshot> rowMapper;

    public WorkspaceRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.rowMapper = (row, rowNumber) -> new WorkspaceSnapshot(row.getLong("revision"),
                mapper.readTree(row.getString("workspace")), mapper.readTree(row.getString("locations")),
                row.getObject("updated_at", OffsetDateTime.class));
    }

    Optional<WorkspaceSnapshot> find() {
        return jdbc.query("SELECT revision, workspace, locations, updated_at FROM workspace_documents WHERE id = 1", rowMapper)
                .stream().findFirst();
    }

    Optional<WorkspaceSnapshot> save(WorkspaceSave save) {
        String workspace = mapper.writeValueAsString(save.workspace());
        String locations = mapper.writeValueAsString(save.locations());
        if (save.expectedRevision() == 0) {
            return jdbc.query("""
                    INSERT INTO workspace_documents (id, revision, workspace, locations)
                    VALUES (1, 1, CAST(? AS jsonb), CAST(? AS jsonb))
                    ON CONFLICT (id) DO NOTHING
                    RETURNING revision, workspace, locations, updated_at
                    """, rowMapper, workspace, locations).stream().findFirst();
        }
        return jdbc.query("""
                UPDATE workspace_documents
                SET workspace = CAST(? AS jsonb), locations = CAST(? AS jsonb), revision = revision + 1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1 AND revision = ? AND revision < 9007199254740991
                RETURNING revision, workspace, locations, updated_at
                """, rowMapper, workspace, locations, save.expectedRevision()).stream().findFirst();
    }
}
