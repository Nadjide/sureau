package com.nadjide.sureau.asset.controller;

import com.nadjide.sureau.asset.dto.AssetEventResponse;
import com.nadjide.sureau.asset.dto.AssetImportRequest;
import com.nadjide.sureau.asset.dto.AssetImportResponse;
import com.nadjide.sureau.asset.dto.AssetRequest;
import com.nadjide.sureau.asset.dto.AssetResponse;
import com.nadjide.sureau.asset.service.AssetService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
    public ResponseEntity<AssetResponse> getAssetById(@PathVariable Long id) {
        return response(HttpStatus.OK, assetService.getAssetById(id));
    }

    @GetMapping("/{id}/history")
    public List<AssetEventResponse> getAssetHistory(@PathVariable Long id) {
        return assetService.getAssetHistory(id);
    }

    @PostMapping
    public ResponseEntity<AssetResponse> createAsset(
            @Valid @RequestBody AssetRequest request
    ) {
        return response(HttpStatus.CREATED, assetService.createAsset(request));
    }

    @PostMapping("/import")
    @ResponseStatus(HttpStatus.CREATED)
    public AssetImportResponse importAssets(@Valid @RequestBody AssetImportRequest request) {
        return assetService.importAssets(request.assets());
    }

    @PutMapping("/{id}")
    public ResponseEntity<AssetResponse> updateAsset(
            @PathVariable Long id,
            @Valid @RequestBody AssetRequest request,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch
    ) {
        return response(HttpStatus.OK, assetService.updateAsset(id, request, parseRevision(ifMatch)));
    }

    @PatchMapping("/{id}/retire")
    public ResponseEntity<AssetResponse> retireAsset(
            @PathVariable Long id,
            @RequestHeader(name = HttpHeaders.IF_MATCH, required = false) String ifMatch
    ) {
        return response(HttpStatus.OK, assetService.retireAsset(id, parseRevision(ifMatch)));
    }

    private static ResponseEntity<AssetResponse> response(HttpStatus status, AssetResponse asset) {
        return ResponseEntity.status(status).eTag("\"" + asset.revision() + "\"").body(asset);
    }

    private static Long parseRevision(String ifMatch) {
        if (ifMatch == null) {
            return null;
        }
        String value = ifMatch.trim();
        if (value.matches("\"(0|[1-9][0-9]{0,15})\"")) {
            long revision = Long.parseLong(value.substring(1, value.length() - 1));
            if (revision <= 9_007_199_254_740_991L) {
                return revision;
            }
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "If-Match must contain one quoted non-negative safe integer revision.");
    }
}
