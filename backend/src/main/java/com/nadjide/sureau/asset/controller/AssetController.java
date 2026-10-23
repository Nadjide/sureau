package com.nadjide.sureau.asset.controller;

import com.nadjide.sureau.asset.dto.AssetRequest;
import com.nadjide.sureau.asset.dto.AssetResponse;
import com.nadjide.sureau.asset.service.AssetService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
public class AssetController {

    private final AssetService assetService;

    public AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    @GetMapping
    public List<AssetResponse> getAllAssets() {
        return assetService.getAllAssets();
    }

    @GetMapping("/{id}")
    public AssetResponse getAssetById(@PathVariable Long id) {
        return assetService.getAssetById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AssetResponse createAsset(
            @Valid @RequestBody AssetRequest request
    ) {
        return assetService.createAsset(request);
    }

    @PutMapping("/{id}")
    public AssetResponse updateAsset(
            @PathVariable Long id,
            @Valid @RequestBody AssetRequest request
    ) {
        return assetService.updateAsset(id, request);
    }

    @PatchMapping("/{id}/retire")
    public AssetResponse retireAsset(@PathVariable Long id) {
        return assetService.retireAsset(id);
    }
}
