package com.nadjide.sureau.asset.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record AssetEventResponse(
    long id,
    OffsetDateTime occurredAt,
    String action,
    Actor actor,
    List<Change> changes
) {
    /** The account as it is named today; null when the author was not recorded. */
    public record Actor(String username, String displayName) {}

    /** One field before and after the event; null stands for an empty value. */
    public record Change(String field, String from, String to) {}
}
