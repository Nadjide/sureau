
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
) {}
