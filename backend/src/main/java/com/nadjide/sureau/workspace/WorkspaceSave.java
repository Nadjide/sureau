package com.nadjide.sureau.workspace;

import tools.jackson.databind.JsonNode;

record WorkspaceSave(long expectedRevision, JsonNode workspace, JsonNode locations) {}
