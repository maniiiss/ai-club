package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergePipelineTargetEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GitlabAutoMergePipelineTargetRepository extends JpaRepository<GitlabAutoMergePipelineTargetEntity, Long> {

    List<GitlabAutoMergePipelineTargetEntity> findByConfig_IdOrderByIdAsc(Long configId);

    void deleteByConfig_Id(Long configId);
}
