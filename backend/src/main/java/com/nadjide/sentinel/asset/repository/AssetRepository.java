package com.nadjide.sentinel.asset.repository;

import com.nadjide.sentinel.asset.entity.Asset;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AssetRepository extends JpaRepository<Asset, Long> {

    boolean existsByAssetTag(String assetTag);

    boolean existsBySerialNumber(String serialNumber);
}
