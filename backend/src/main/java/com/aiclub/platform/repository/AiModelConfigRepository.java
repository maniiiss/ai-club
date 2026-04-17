package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AiModelConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface AiModelConfigRepository extends JpaRepository<AiModelConfigEntity, Long>, JpaSpecificationExecutor<AiModelConfigEntity> {

    List<AiModelConfigEntity> findAllByEnabledTrueOrderByIdAsc();

    List<AiModelConfigEntity> findAllByEnabledTrueAndModelTypeOrderByIdAsc(String modelType);
}
