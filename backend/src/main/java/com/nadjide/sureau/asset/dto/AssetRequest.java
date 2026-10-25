
package com.nadjide.sureau.asset.dto;

import com.nadjide.sureau.asset.entity.AssetCategory;
import com.nadjide.sureau.asset.entity.AssetStatus;
import jakarta.validation.constraints.*;

import java.time.LocalDate;

public record AssetRequest(
    @NotBlank @Size(max = 50)
    String assetTag,

    @Size(max = 100)
    String serialNumber,

    @NotBlank @Size(max = 150)
    String name,

    @Size(max = 100)
    String brand,

    @Size(max = 100)
    String model,

    @NotNull
    AssetCategory category,

    @NotNull
    AssetStatus status,

    LocalDate purchaseDate
) {
    public AssetRequest {
        assetTag = trim(assetTag);
        name = trim(name);
        serialNumber = optional(serialNumber);
        brand = optional(brand);
        model = optional(model);
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String optional(String value) {
        String normalized = trim(value);
        return normalized == null || normalized.isEmpty() ? null : normalized;
    }
}
