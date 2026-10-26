package com.nadjide.sureau.asset.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Validation errors name the row as `assets[index].field`, counted from zero. */
public record AssetImportRequest(
    @NotNull @Size(min = 1, max = 1000)
    List<@Valid @NotNull AssetRequest> assets
) {}
