package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeWebhookEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/**
 * GitLab 自动合并外发 Webhook 配置仓库。
 */
public interface GitlabAutoMergeWebhookRepository extends JpaRepository<GitlabAutoMergeWebhookEntity, Long> {

    /** 列出指定自动合并配置下的全部 Webhook，按 id 升序展示。 */
    List<GitlabAutoMergeWebhookEntity> findByConfig_IdOrderByIdAsc(Long configId);

    /** 列出指定自动合并配置下启用中的 Webhook，用于实际投递。 */
    List<GitlabAutoMergeWebhookEntity> findByConfig_IdAndEnabledTrueOrderByIdAsc(Long configId);

    /** 校验同一配置下名称唯一性。 */
    Optional<GitlabAutoMergeWebhookEntity> findByConfig_IdAndName(Long configId, String name);

    /** 配置删除时一并清理。 */
    void deleteByConfig_Id(Long configId);
}
