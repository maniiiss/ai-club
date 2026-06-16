package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ModelBenchmarkConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

/**
 * 模型对比测试配置仓库。配置维度的 CRUD 与列表分页都走这里。
 */
public interface ModelBenchmarkConfigRepository
        extends JpaRepository<ModelBenchmarkConfigEntity, Long>,
                JpaSpecificationExecutor<ModelBenchmarkConfigEntity> {
}
