package com.nadjide.sureau.asset.repository;

import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.nadjide.sureau.asset.dto.AssetEventResponse;
import com.nadjide.sureau.asset.dto.AssetEventResponse.Actor;
import com.nadjide.sureau.asset.dto.AssetEventResponse.Change;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

@Repository
public class AssetEventRepository {
    private static final TypeReference<List<Change>> CHANGES = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper mapper;

    public AssetEventRepository(JdbcTemplate jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public void insert(long assetId, Long actorId, String action, List<Change> changes) {
        jdbc.update("INSERT INTO asset_events (asset_id, actor_id, action, changes) VALUES (?, ?, ?, CAST(? AS jsonb))",
                assetId, actorId, action, mapper.writeValueAsString(changes));
    }

    /** Most recent first, with the author's current account names. */
    public List<AssetEventResponse> findByAssetId(long assetId, int limit) {
        return jdbc.query("""
                SELECT e.id, e.occurred_at, e.action, e.changes, u.username, u.display_name
                FROM asset_events e LEFT JOIN app_users u ON u.id = e.actor_id
                WHERE e.asset_id = ?
                ORDER BY e.occurred_at DESC, e.id DESC
                LIMIT ?
                """, (row, rowNumber) -> new AssetEventResponse(row.getLong("id"),
                row.getObject("occurred_at", OffsetDateTime.class), row.getString("action"),
                row.getString("username") == null ? null : new Actor(row.getString("username"), row.getString("display_name")),
                mapper.readValue(row.getString("changes"), CHANGES)), assetId, limit);
    }

    public Set<Long> existingAssetIds(Collection<Long> ids) {
        if (ids.isEmpty()) return Set.of();
        return jdbc.queryForList("SELECT id FROM assets WHERE id = ANY (?)", Long.class, (Object) ids.toArray(Long[]::new))
                .stream().collect(Collectors.toSet());
    }
}
