package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.RuntimeScenarioDefaultEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** 平台场景默认 Runtime 持久化入口。 */
public interface RuntimeScenarioDefaultRepository extends JpaRepository<RuntimeScenarioDefaultEntity, String> {
    List<RuntimeScenarioDefaultEntity> findAllByOrderByScenarioCodeAsc();
}
