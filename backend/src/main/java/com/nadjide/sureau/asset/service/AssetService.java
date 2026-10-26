package com.nadjide.sureau.asset.service;

import com.nadjide.sureau.asset.dto.AssetEventResponse;
import com.nadjide.sureau.asset.dto.AssetRequest;
import com.nadjide.sureau.asset.dto.AssetResponse;
import com.nadjide.sureau.asset.entity.Asset;
import com.nadjide.sureau.asset.entity.AssetStatus;
import com.nadjide.sureau.asset.repository.AssetRepository;

import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@Service
public class AssetService {

    private final AssetRepository assetRepository;
    private final AssetHistoryService history;

    public AssetService(AssetRepository assetRepository, AssetHistoryService history) {
        this.assetRepository = assetRepository;
        this.history = history;
    }

    @Transactional(readOnly = true)
    public List<AssetResponse> getAllAssets() {
        return assetRepository.findAll(Sort.by(Sort.Direction.ASC, "id"))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional(readOnly = true)
    public AssetResponse getAssetById(Long id) {
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Asset not found: " + id
                ));

        return toResponse(asset);
    }

    @Transactional
    public AssetResponse createAsset(AssetRequest request) {

        if (assetRepository.existsByAssetTag(request.assetTag())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Asset tag already exists"
            );
        }

        if (request.serialNumber() != null &&
                assetRepository.existsBySerialNumber(request.serialNumber())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Serial number already exists"
            );
        }

        Asset asset = new Asset();

        asset.setAssetTag(request.assetTag());
        asset.setSerialNumber(request.serialNumber());
        asset.setName(request.name());
        asset.setBrand(request.brand());
        asset.setModel(request.model());
        asset.setCategory(request.category());
        asset.setStatus(request.status());
        asset.setPurchaseDate(request.purchaseDate());

        Asset saved = assetRepository.saveAndFlush(asset);
        history.recordCreated(saved);
        return toResponse(saved);
    }

    @Transactional
    public AssetResponse updateAsset(Long id, AssetRequest request, Long expectedRevision) {

        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Asset not found: " + id
                ));

        requireRevision(asset, expectedRevision);

        if (asset.getStatus() == AssetStatus.ASSIGNED && request.status() == AssetStatus.RETIRED) {
            throw new AssetStatusConflictException("Assigned asset cannot be retired");
        }

        if (!asset.getAssetTag().equals(request.assetTag())
                && assetRepository.existsByAssetTag(request.assetTag())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Asset tag already exists"
            );
        }

        if (request.serialNumber() != null
                && !request.serialNumber().equals(asset.getSerialNumber())
                && assetRepository.existsBySerialNumber(request.serialNumber())) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Serial number already exists"
            );
        }

        Map<String, String> before = AssetHistoryService.fields(asset);
        asset.setAssetTag(request.assetTag());
        asset.setSerialNumber(request.serialNumber());
        asset.setName(request.name());
        asset.setBrand(request.brand());
        asset.setModel(request.model());
        asset.setCategory(request.category());
        asset.setStatus(request.status());
        asset.setPurchaseDate(request.purchaseDate());

        Asset saved = assetRepository.saveAndFlush(asset);
        history.recordUpdated(saved, before);
        return toResponse(saved);
    }

    @Transactional
    public AssetResponse retireAsset(Long id, Long expectedRevision) {

        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Asset not found: " + id
                ));

        requireRevision(asset, expectedRevision);

        if (asset.getStatus() == AssetStatus.RETIRED) {
            throw new AssetStatusConflictException("Asset is already retired");
        }

        if (asset.getStatus() == AssetStatus.ASSIGNED) {
            throw new AssetStatusConflictException("Assigned asset cannot be retired");
        }

        Map<String, String> before = AssetHistoryService.fields(asset);
        asset.setStatus(AssetStatus.RETIRED);

        Asset saved = assetRepository.saveAndFlush(asset);
        history.recordRetired(saved, before);
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<AssetEventResponse> getAssetHistory(Long id) {
        if (!assetRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset not found: " + id);
        }
        return history.history(id);
    }

    private static void requireRevision(Asset asset, Long expectedRevision) {
        if (expectedRevision != null && !expectedRevision.equals(asset.getRevision())) {
            throw new ResponseStatusException(HttpStatus.PRECONDITION_FAILED,
                    "The asset changed since it was loaded. Reload it before saving.");
        }
    }

    private AssetResponse toResponse(Asset asset) {
        return new AssetResponse(
                asset.getId(),
                asset.getAssetTag(),
                asset.getSerialNumber(),
                asset.getName(),
                asset.getBrand(),
                asset.getModel(),
                asset.getCategory(),
                asset.getStatus(),
                asset.getPurchaseDate(),
                asset.getCreatedAt(),
                asset.getUpdatedAt(),
                asset.getRevision()
        );
    }
}
