package com.nadjide.sureau.asset.repository;

import java.util.Collection;
import java.util.List;

import com.nadjide.sureau.asset.entity.Asset;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AssetRepository extends JpaRepository<Asset, Long> {

    boolean existsByAssetTag(String assetTag);

    boolean existsBySerialNumber(String serialNumber);

    @Query("SELECT a.assetTag FROM Asset a WHERE a.assetTag IN :assetTags")
    List<String> findExistingAssetTags(Collection<String> assetTags);

    @Query("SELECT a.serialNumber FROM Asset a WHERE a.serialNumber IN :serialNumbers")
    List<String> findExistingSerialNumbers(Collection<String> serialNumbers);
}
