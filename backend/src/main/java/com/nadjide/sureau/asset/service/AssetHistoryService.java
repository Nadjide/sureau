package com.nadjide.sureau.asset.service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import com.nadjide.sureau.asset.dto.AssetEventResponse;
import com.nadjide.sureau.asset.dto.AssetEventResponse.Change;
import com.nadjide.sureau.asset.entity.Asset;
import com.nadjide.sureau.asset.repository.AssetEventRepository;
import com.nadjide.sureau.auth.SessionPrincipal;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;

/** Records each change to an asset in the caller's transaction, so that history and data never diverge. */
@Service
public class AssetHistoryService {
    static final int HISTORY_LIMIT = 200;

    private final AssetEventRepository events;

    public AssetHistoryService(AssetEventRepository events) {
        this.events = events;
    }

    public List<AssetEventResponse> history(long assetId) {
        return events.findByAssetId(assetId, HISTORY_LIMIT);
    }

    void recordCreated(Asset asset) {
        record(asset.getId(), "CREATED", diff(Map.of(), fields(asset)));
    }

    /** Records nothing when no field changed. */
    void recordUpdated(Asset asset, Map<String, String> before) {
        List<Change> changes = diff(before, fields(asset));
        if (!changes.isEmpty()) record(asset.getId(), "UPDATED", changes);
    }

    void recordRetired(Asset asset, Map<String, String> before) {
        record(asset.getId(), "RETIRED", diff(before, fields(asset)));
    }

    /**
     * Records a placement change for every known asset whose workstation changed between two versions of the
     * shared workspace. Workstations are described by their names at the time, as people knew them.
     */
    public void recordLocations(JsonNode beforeWorkspace, JsonNode beforeLocations, JsonNode afterWorkspace,
                                JsonNode afterLocations) {
        Map<String, String> beforeNames = stationNames(beforeWorkspace);
        Map<String, String> afterNames = stationNames(afterWorkspace);
        Map<Long, Change> moved = new LinkedHashMap<>();
        Set<String> keys = new HashSet<>(afterLocations.propertyNames());
        if (beforeLocations != null) keys.addAll(beforeLocations.propertyNames());
        for (String key : keys) {
            String from = station(beforeLocations, key);
            String to = station(afterLocations, key);
            if (Objects.equals(from, to)) continue;
            moved.put(Long.parseLong(key), new Change("location",
                    from == null ? null : beforeNames.getOrDefault(from, from),
                    to == null ? null : afterNames.getOrDefault(to, to)));
        }
        Set<Long> known = events.existingAssetIds(moved.keySet());
        moved.forEach((assetId, change) -> {
            if (known.contains(assetId)) record(assetId, "LOCATED", List.of(change));
        });
    }

    static Map<String, String> fields(Asset asset) {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("assetTag", asset.getAssetTag());
        fields.put("serialNumber", asset.getSerialNumber());
        fields.put("name", asset.getName());
        fields.put("brand", asset.getBrand());
        fields.put("model", asset.getModel());
        fields.put("category", asset.getCategory() == null ? null : asset.getCategory().name());
        fields.put("status", asset.getStatus() == null ? null : asset.getStatus().name());
        fields.put("purchaseDate", asset.getPurchaseDate() == null ? null : asset.getPurchaseDate().toString());
        fields.put("assigneeName", asset.getAssigneeName());
        fields.put("assigneeEmail", asset.getAssigneeEmail());
        fields.put("assigneeDepartment", asset.getAssigneeDepartment());
        return fields;
    }

    private static List<Change> diff(Map<String, String> before, Map<String, String> after) {
        List<Change> changes = new ArrayList<>();
        after.forEach((field, value) -> {
            String previous = before.get(field);
            if (!Objects.equals(previous, value)) changes.add(new Change(field, previous, value));
        });
        return changes;
    }

    private static String station(JsonNode locations, String key) {
        JsonNode value = locations == null ? null : locations.get(key);
        return value == null || !value.isString() || value.asString().isEmpty() ? null : value.asString();
    }

    private static Map<String, String> stationNames(JsonNode workspace) {
        Map<String, String> names = new HashMap<>();
        if (workspace == null) return names;
        Map<String, String> floors = new HashMap<>();
        for (JsonNode floor : workspace.path("floors")) floors.put(floor.path("id").asString(), floor.path("name").asString());
        for (JsonNode room : workspace.path("rooms")) {
            JsonNode plan = room.path("plan");
            String place = plan.path("name").asString() + " · " + floors.getOrDefault(room.path("floorId").asString(), "");
            for (JsonNode station : plan.path("workstations")) {
                names.put(station.path("id").asString(), station.path("label").asString() + " · " + place);
            }
        }
        return names;
    }

    private void record(long assetId, String action, List<Change> changes) {
        events.insert(assetId, currentAccountId(), action, changes);
    }

    private static Long currentAccountId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.getPrincipal() instanceof SessionPrincipal principal
                ? principal.getId() : null;
    }
}
