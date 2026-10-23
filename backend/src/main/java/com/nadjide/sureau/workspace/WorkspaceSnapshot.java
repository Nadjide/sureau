package com.nadjide.sureau.workspace;

import java.time.OffsetDateTime;
import tools.jackson.databind.JsonNode;

public record WorkspaceSnapshot(long revision, JsonNode workspace, JsonNode locations, OffsetDateTime updatedAt) {}
