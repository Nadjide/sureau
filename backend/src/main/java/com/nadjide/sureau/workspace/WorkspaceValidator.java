package com.nadjide.sureau.workspace;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Component
public class WorkspaceValidator {
    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private static final int WORKSPACE_SIZE_LIMIT = 2_000_000;
    private static final int PLAN_SIZE_LIMIT = 256_000;
    private static final Pattern FLOOR_ID = Pattern.compile("floor-[a-z0-9-]{2,80}");
    private static final Pattern ROOM_ID = Pattern.compile("room-[a-z0-9-]{2,80}");
    private static final Pattern DESK_ID = Pattern.compile("desk-[a-z0-9-]{2,80}");
    private static final Pattern FURNITURE_ID = Pattern.compile("furniture-[a-z0-9-]{2,80}");
    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private static final Set<String> FURNITURE_KINDS = Set.of("table", "cabinet", "plant", "partition", "sofa");
    private final ObjectMapper mapper;

    public WorkspaceValidator(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    WorkspaceSave validate(JsonNode request) {
        object(request, "request", "expectedRevision", "workspace", "locations");
        long revision = integer(request.get("expectedRevision"), 0, MAX_SAFE_INTEGER - 1, "expectedRevision");
        JsonNode workspace = request.get("workspace").deepCopy();
        JsonNode locations = request.get("locations");
        if (mapper.writeValueAsBytes(workspace).length > WORKSPACE_SIZE_LIMIT) {
            throw new WorkspaceException(HttpStatus.CONTENT_TOO_LARGE, "WORKSPACE_TOO_LARGE",
                    "The workspace document exceeds the 2 MB limit.");
        }
        validateWorkspace(workspace);
        validateLocations(locations);
        return new WorkspaceSave(revision, workspace, locations.deepCopy());
    }

    private void validateWorkspace(JsonNode workspace) {
        object(workspace, "workspace", "version", "id", "name", "floors", "rooms");
        literalNumber(workspace.get("version"), 1, "workspace.version");
        literalText(workspace.get("id"), "workspace-local", "workspace.id");
        name(workspace, "name", "workspace.name");
        array(workspace.get("floors"), 1, 8, "workspace.floors");
        array(workspace.get("rooms"), 1, 32, "workspace.rooms");
        Set<String> floorIds = new HashSet<>();
        for (JsonNode floor : workspace.get("floors")) {
            object(floor, "floor", "id", "name");
            String id = identifier(floor.get("id"), FLOOR_ID, "floor.id");
            if (!floorIds.add(id)) invalid("Floor identifiers must be unique.");
            name(floor, "name", "floor.name");
        }
        Set<String> roomIds = new HashSet<>();
        Set<String> itemIds = new HashSet<>();
        for (JsonNode room : workspace.get("rooms")) {
            object(room, "room", "floorId", "plan");
            String floorId = identifier(room.get("floorId"), FLOOR_ID, "room.floorId");
            if (!floorIds.contains(floorId)) invalid("Every room must reference an existing floor.");
            validatePlan(room.get("plan"), roomIds, itemIds);
        }
    }

    private void validatePlan(JsonNode plan, Set<String> roomIds, Set<String> itemIds) {
        object(plan, "plan", "version", "id", "name", "width", "depth", "colors", "display", "workstations", "furniture");
        if (mapper.writeValueAsBytes(plan).length > PLAN_SIZE_LIMIT) {
            invalid("A room plan exceeds the 256 KB limit.");
        }
        literalNumber(plan.get("version"), 1, "plan.version");
        String roomId = text(plan.get("id"), "plan.id");
        if (!roomId.equals("plateau-a") && !ROOM_ID.matcher(roomId).matches()) invalid("Invalid room identifier.");
        if (!roomIds.add(roomId)) invalid("Room identifiers must be unique.");
        name(plan, "name", "plan.name");
        double width = number(plan.get("width"), 6, 50, "plan.width");
        double depth = number(plan.get("depth"), 6, 50, "plan.depth");
        JsonNode colors = plan.get("colors");
        object(colors, "plan.colors", "floor", "wall", "desk", "accent");
        for (String field : colors.propertyNames()) identifier(colors.get(field), COLOR, "plan.colors." + field);
        JsonNode display = plan.get("display");
        object(display, "plan.display", "walls", "decor");
        for (String field : display.propertyNames()) {
            if (!display.get(field).isBoolean()) invalid("Display preferences must be booleans.");
        }
        array(plan.get("workstations"), 0, 64, "plan.workstations");
        array(plan.get("furniture"), 0, 64, "plan.furniture");
        for (JsonNode workstation : plan.get("workstations")) validateItem(workstation, false, width, depth, itemIds);
        for (JsonNode furniture : plan.get("furniture")) validateItem(furniture, true, width, depth, itemIds);
    }

    private void validateItem(JsonNode item, boolean furniture, double roomWidth, double roomDepth, Set<String> itemIds) {
        if (furniture) {
            object(item, "furniture", "id", "kind", "label", "position", "rotation", "width", "depth", "height", "color");
            if (!FURNITURE_KINDS.contains(text(item.get("kind"), "furniture.kind"))) invalid("Invalid furniture kind.");
            number(item.get("height"), 0.15, 3.5, "furniture.height");
        } else {
            object(item, "workstation", "id", "label", "position", "rotation", "width", "depth", "color");
        }
        String id = identifier(item.get("id"), furniture ? FURNITURE_ID : DESK_ID, "item.id");
        if (!itemIds.add(id)) invalid("Object identifiers must be unique across all rooms.");
        name(item, "label", "item.label");
        if (furniture || !item.get("color").isNull()) identifier(item.get("color"), COLOR, "item.color");
        double width = number(item.get("width"), furniture ? 0.2 : 0.8, furniture ? 6 : 3, "item.width");
        double depth = number(item.get("depth"), furniture ? 0.08 : 0.5, furniture ? 4 : 1.5, "item.depth");
        double rotation = number(item.get("rotation"), 0, Math.PI * 2, "item.rotation");
        JsonNode position = item.get("position");
        array(position, 3, 3, "item.position");
        double x = number(position.get(0), -Double.MAX_VALUE, Double.MAX_VALUE, "item.position.x");
        literalNumber(position.get(1), 0, "item.position.y");
        double z = number(position.get(2), -Double.MAX_VALUE, Double.MAX_VALUE, "item.position.z");
        validateFootprint(roomWidth, roomDepth, width, depth, rotation, x, z, furniture);
    }

    private void validateFootprint(double roomWidth, double roomDepth, double width, double depth, double rotation,
                                   double x, double z, boolean furniture) {
        double normalizedRotation = rotation == Math.PI * 2 ? 0 : rotation;
        double sine = Math.sin(normalizedRotation);
        double cosine = Math.cos(normalizedRotation);
        // Same envelope as plan-geometry.ts: workstation footprints include the chair.
        double offset = furniture ? 0 : depth * 0.4;
        double halfDepth = depth * (furniture ? 0.5 : 0.9);
        double xRadius = Math.abs(cosine) * width / 2 + Math.abs(sine) * halfDepth;
        double zRadius = Math.abs(sine) * width / 2 + Math.abs(cosine) * halfDepth;
        if (xRadius * 2 > roomWidth + 1e-7 || zRadius * 2 > roomDepth + 1e-7) {
            invalid("An object does not fit within its room.");
        }
        double centerX = x + sine * offset;
        double centerZ = z + cosine * offset;
        double boundedX = Math.max(-roomWidth / 2 + xRadius, Math.min(roomWidth / 2 - xRadius, centerX));
        double boundedZ = Math.max(-roomDepth / 2 + zRadius, Math.min(roomDepth / 2 - zRadius, centerZ));
        double nextX = boundedX == centerX ? x : boundedX - sine * offset;
        double nextZ = boundedZ == centerZ ? z : boundedZ - cosine * offset;
        if (Math.abs(nextX - x) > 1e-6 || Math.abs(nextZ - z) > 1e-6) {
            invalid("An object or its chair extends beyond the room boundaries.");
        }
    }

    private void validateLocations(JsonNode locations) {
        if (locations == null || !locations.isObject() || locations.size() > 20_000) {
            invalid("Locations must be an object containing at most 20000 associations.");
        }
        for (var association : locations.properties()) {
            String assetId = association.getKey();
            if (!assetId.matches("[1-9][0-9]{0,15}")) invalid("Location asset identifiers must be canonical positive integers.");
            try {
                if (Long.parseLong(assetId) > MAX_SAFE_INTEGER) invalid("A location asset identifier exceeds the safe integer limit.");
            } catch (NumberFormatException exception) {
                invalid("Invalid location asset identifier.");
            }
            identifier(association.getValue(), DESK_ID, "locations.workstationId");
        }
        // Missing assets and removed desks stay recoverable; associations never change business status.
    }

    private void object(JsonNode node, String path, String... fields) {
        if (node == null || !node.isObject() || !new HashSet<>(node.propertyNames()).equals(Set.copyOf(Arrays.asList(fields)))) {
            invalid(path + " must contain exactly the expected properties.");
        }
    }

    private void array(JsonNode node, int minimum, int maximum, String path) {
        if (node == null || !node.isArray() || node.size() < minimum || node.size() > maximum) invalid("Invalid " + path + " array size.");
    }

    private String text(JsonNode node, String path) {
        if (node == null || !node.isString()) invalid(path + " must be a string.");
        return node.stringValue();
    }

    private String identifier(JsonNode node, Pattern pattern, String path) {
        String value = text(node, path);
        if (!pattern.matcher(value).matches()) invalid("Invalid " + path + ".");
        return value;
    }

    private void literalText(JsonNode node, String expected, String path) {
        if (!text(node, path).equals(expected)) invalid("Invalid " + path + ".");
    }

    private void literalNumber(JsonNode node, double expected, String path) {
        if (node == null || !node.isNumber() || node.doubleValue() != expected) invalid("Invalid " + path + ".");
    }

    private double number(JsonNode node, double minimum, double maximum, String path) {
        if (node == null || !node.isNumber()) invalid(path + " must be numeric.");
        double value = node.doubleValue();
        if (!Double.isFinite(value) || value < minimum || value > maximum) invalid("Invalid " + path + " range.");
        return value;
    }

    private long integer(JsonNode node, long minimum, long maximum, String path) {
        if (node == null || !node.isNumber() || !Double.isFinite(node.doubleValue())) invalid(path + " must be an integer.");
        BigDecimal value = node.decimalValue();
        if (value.stripTrailingZeros().scale() > 0 || value.compareTo(BigDecimal.valueOf(minimum)) < 0
                || value.compareTo(BigDecimal.valueOf(maximum)) > 0) invalid("Invalid " + path + " range.");
        return value.longValueExact();
    }

    private void name(JsonNode object, String field, String path) {
        String raw = text(object.get(field), path);
        for (int index = 0; index < raw.length(); index++) {
            char character = raw.charAt(index);
            if (character == 0 || Character.isLowSurrogate(character)) invalid(path + " contains an invalid Unicode character.");
            if (Character.isHighSurrogate(character)) {
                if (index + 1 >= raw.length() || !Character.isLowSurrogate(raw.charAt(index + 1))) {
                    invalid(path + " contains an invalid Unicode character.");
                }
                index++;
            }
        }
        int start = 0;
        int end = raw.length();
        while (start < end && javascriptWhitespace(raw.charAt(start))) start++;
        while (end > start && javascriptWhitespace(raw.charAt(end - 1))) end--;
        String normalized = raw.substring(start, end);
        if (normalized.isEmpty() || normalized.length() > 60) invalid(path + " must contain between 1 and 60 characters.");
        ((ObjectNode) object).put(field, normalized);
    }

    private boolean javascriptWhitespace(char character) {
        return character >= 0x0009 && character <= 0x000D || character == ' ' || character == '\u00A0'
                || character == '\u1680' || character >= '\u2000' && character <= '\u200A'
                || character == '\u2028' || character == '\u2029' || character == '\u202F'
                || character == '\u205F' || character == '\u3000' || character == '\uFEFF';
    }

    private void invalid(String detail) {
        throw new WorkspaceException(HttpStatus.BAD_REQUEST, "WORKSPACE_INVALID", detail);
    }
}
