package com.nadjide.sureau.asset.service;

import com.nadjide.sureau.asset.dto.AssetEventResponse;
import com.nadjide.sureau.asset.dto.AssetImportResponse;
import com.nadjide.sureau.asset.dto.Assignee;
import com.nadjide.sureau.asset.dto.AssetRequest;
import com.nadjide.sureau.asset.dto.AssetResponse;
import com.nadjide.sureau.asset.entity.Asset;
import com.nadjide.sureau.asset.entity.AssetStatus;
import com.nadjide.sureau.asset.repository.AssetRepository;
import com.nadjide.sureau.common.ApiExceptionHandler.FieldError;

import org.springframework.http.HttpStatus;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

        requireAssigneeAllowed(request);

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
        apply(asset, request);

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
        requireAssigneeAllowed(request);

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
        apply(asset, request);

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

    /**
     * Creates every asset or none. Each refused row is reported as {@code assets[index].field}, like the
     * request validation, so that all problems of a file can be fixed at once.
     */
    @Transactional
    public AssetImportResponse importAssets(List<AssetRequest> requests) {
        List<FieldError> errors = new ArrayList<>();
        Map<String, Integer> tags = new HashMap<>();
        Map<String, Integer> serials = new HashMap<>();
        for (int row = 0; row < requests.size(); row++) {
            AssetRequest request = requests.get(row);
            if (request.assignee() != null && request.status() != AssetStatus.ASSIGNED) {
                errors.add(rowError(row, "assignee", "only an assigned asset can name its holder"));
            }
            Integer firstTag = tags.putIfAbsent(request.assetTag(), row);
            if (firstTag != null) errors.add(rowError(row, "assetTag", "is repeated in this import (row " + (firstTag + 1) + ")"));
            if (request.serialNumber() != null) {
                Integer firstSerial = serials.putIfAbsent(request.serialNumber(), row);
                if (firstSerial != null) {
                    errors.add(rowError(row, "serialNumber", "is repeated in this import (row " + (firstSerial + 1) + ")"));
                }
            }
        }
        Set<String> existingTags = new HashSet<>(assetRepository.findExistingAssetTags(tags.keySet()));
        Set<String> existingSerials = serials.isEmpty() ? Set.of()
                : new HashSet<>(assetRepository.findExistingSerialNumbers(serials.keySet()));
        for (int row = 0; row < requests.size(); row++) {
            AssetRequest request = requests.get(row);
            if (existingTags.contains(request.assetTag())) {
                errors.add(rowError(row, "assetTag", "is already used by an existing asset"));
            }
            if (request.serialNumber() != null && existingSerials.contains(request.serialNumber())) {
                errors.add(rowError(row, "serialNumber", "is already used by an existing asset"));
            }
        }
        if (!errors.isEmpty()) {
            throw new AssetImportException(errors);
        }

        List<Asset> assets = requests.stream().map(request -> {
            Asset asset = new Asset();
            apply(asset, request);
            return asset;
        }).toList();
        List<Asset> saved = assetRepository.saveAllAndFlush(assets);
        saved.forEach(history::recordImported);
        return new AssetImportResponse(saved.size(), saved.stream().map(this::toResponse).toList());
    }

    private static FieldError rowError(int row, String field, String message) {
        return new FieldError("assets[" + row + "]." + field, message);
    }

    @Transactional(readOnly = true)
    public List<AssetEventResponse> getAssetHistory(Long id) {
        if (!assetRepository.existsById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Asset not found: " + id);
        }
        return history.history(id);
    }

    private static void apply(Asset asset, AssetRequest request) {
        asset.setAssetTag(request.assetTag());
        asset.setSerialNumber(request.serialNumber());
        asset.setName(request.name());
        asset.setBrand(request.brand());
        asset.setModel(request.model());
        asset.setCategory(request.category());
        asset.setStatus(request.status());
        asset.setPurchaseDate(request.purchaseDate());
        Assignee assignee = request.assignee();
        asset.setAssigneeName(assignee == null ? null : assignee.name());
        asset.setAssigneeEmail(assignee == null ? null : assignee.email());
        asset.setAssigneeDepartment(assignee == null ? null : assignee.department());
    }

    private static void requireAssigneeAllowed(AssetRequest request) {
        if (request.assignee() != null && request.status() != AssetStatus.ASSIGNED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only an assigned asset can name its holder.");
        }
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
                asset.getRevision(),
                asset.getAssigneeName() == null ? null
                        : new Assignee(asset.getAssigneeName(), asset.getAssigneeEmail(), asset.getAssigneeDepartment())
        );
    }
}
