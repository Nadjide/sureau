package com.nadjide.sureau.asset.service;

import com.nadjide.sureau.asset.dto.AssetRequest;
import com.nadjide.sureau.asset.dto.AssetResponse;
import com.nadjide.sureau.asset.entity.Asset;
import com.nadjide.sureau.asset.entity.AssetStatus;
import com.nadjide.sureau.asset.repository.AssetRepository;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@Service
public class AssetService {

    private final AssetRepository assetRepository;

    public AssetService(AssetRepository assetRepository) {
        this.assetRepository = assetRepository;
    }

    @Transactional(readOnly = true)
    public List<AssetResponse> getAllAssets() {
        return assetRepository.findAll()
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

        return toResponse(assetRepository.save(asset));
    }

    @Transactional
    public AssetResponse updateAsset(Long id, AssetRequest request) {

        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Asset not found: " + id
                ));

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

        asset.setAssetTag(request.assetTag());
        asset.setSerialNumber(request.serialNumber());
        asset.setName(request.name());
        asset.setBrand(request.brand());
        asset.setModel(request.model());
        asset.setCategory(request.category());
        asset.setStatus(request.status());
        asset.setPurchaseDate(request.purchaseDate());

        return toResponse(assetRepository.saveAndFlush(asset));
    }

    @Transactional
    public AssetResponse retireAsset(Long id) {

        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Asset not found: " + id
                ));

        if (asset.getStatus() == AssetStatus.RETIRED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Asset is already retired"
            );
        }

        if (asset.getStatus() == AssetStatus.ASSIGNED) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Assigned asset cannot be retired"
            );
        }

        asset.setStatus(AssetStatus.RETIRED);

        return toResponse(assetRepository.saveAndFlush(asset));
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
                asset.getUpdatedAt()
        );
    }
}
