package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.RuntimeEventEntity;
import org.springframework.data.jpa.repository.JpaRepository;

/** Runtime 事件幂等仓库。 */
public interface RuntimeEventRepository extends JpaRepository<RuntimeEventEntity, String> {
}
