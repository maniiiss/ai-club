package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitPilotDesignVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** Design 版本按项目和本地 designId 分组，修订唯一键用于 CLI 重试幂等。 */
public interface GitPilotDesignVersionRepository extends JpaRepository<GitPilotDesignVersionEntity, Long> {
    List<GitPilotDesignVersionEntity> findByProjectIdOrderByCreatedAtDescIdDesc(Long projectId);
    List<GitPilotDesignVersionEntity> findByProjectIdAndDesignIdOrderByVersionNoDescIdDesc(Long projectId, String designId);
    Optional<GitPilotDesignVersionEntity> findByProjectIdAndDesignIdAndRevisionId(Long projectId, String designId, String revisionId);
    Optional<GitPilotDesignVersionEntity> findFirstByProjectIdAndDesignIdOrderByVersionNoDesc(Long projectId, String designId);
    List<GitPilotDesignVersionEntity> findByProjectIdAndDesignIdAndStatus(Long projectId, String designId, String status);
}
