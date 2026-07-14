package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.RuntimeRegistryEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Runtime 注册项持久化入口。 */
public interface RuntimeRegistryRepository extends JpaRepository<RuntimeRegistryEntity, String> {
    List<RuntimeRegistryEntity> findAllByOrderByRuntimeCodeAsc();
}
