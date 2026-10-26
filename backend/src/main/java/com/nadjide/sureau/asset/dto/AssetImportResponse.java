package com.nadjide.sureau.asset.dto;

import java.util.List;

public record AssetImportResponse(int created, List<AssetResponse> assets) {}
