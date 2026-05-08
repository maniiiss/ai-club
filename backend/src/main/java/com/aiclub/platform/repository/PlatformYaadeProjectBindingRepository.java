package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.PlatformYaadeProjectBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PlatformYaadeProjectBindingRepository extends JpaRepository<PlatformYaadeProjectBindingEntity, Long> {

    Optional<PlatformYaadeProjectBindingEntity> findByProjectId(Long projectId);

    List<PlatformYaadeProjectBindingEntity> findAllByStatusOrderByProjectIdAsc(String status);
}
