
package com.nadjide.sureau.asset.dto;

import com.nadjide.sureau.asset.entity.AssetCategory;
import com.nadjide.sureau.asset.entity.AssetStatus;

import java.time.LocalDate;
import java.time.OffsetDateTime;

public record AssetResponse(
    Long id,
    String assetTag,
    String serialNumber,
    String name,
    String brand,
    String model,
    AssetCategory category,
    AssetStatus status,
    LocalDate purchaseDate,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt,
    long revision,
    Assignee assignee
) {}
