package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.AssistantMcpServerEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

/** GitPilot 用户 MCP 服务配置仓储。 */
public interface AssistantMcpServerRepository extends JpaRepository<AssistantMcpServerEntity, Long> {

    /** 按用户读取服务，防止个人配置串到其他用户。 */
    List<AssistantMcpServerEntity> findByUser_IdOrderByIdAsc(Long userId);

    /** 按用户和名称判断是否重复。 */
    Optional<AssistantMcpServerEntity> findByUser_IdAndName(Long userId, String name);

    /** 只读取用户已启用的服务。 */
    List<AssistantMcpServerEntity> findByUser_IdAndEnabledTrueOrderByIdAsc(Long userId);

    /** 按用户读取单个服务。 */
    Optional<AssistantMcpServerEntity> findByIdAndUser_Id(Long id, Long userId);
}
