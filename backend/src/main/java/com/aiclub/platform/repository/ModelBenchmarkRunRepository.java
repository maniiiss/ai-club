package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ModelBenchmarkRunEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * 模型对比测试运行记录仓库。按 config 维度提供子资源查询。
 */
public interface ModelBenchmarkRunRepository extends JpaRepository<ModelBenchmarkRunEntity, Long>, JpaSpecificationExecutor<ModelBenchmarkRunEntity> {

    /** 取该配置下最近一次 run，用于配置列表行的"最近运行摘要"。 */
    Optional<ModelBenchmarkRunEntity> findFirstByConfigIdOrderByCreatedAtDescIdDesc(Long configId);

    /** 详情抽屉的运行记录 Tab 用：按时间倒序列出该 config 的全部 run。 */
    List<ModelBenchmarkRunEntity> findAllByConfigIdOrderByCreatedAtDescIdDesc(Long configId);

    /** 配置维度的运行次数，列表行展示。 */
    long countByConfigId(Long configId);

    /** 是否存在 active run（PENDING/RUNNING），决定能否再次触发 / 编辑 / 删除 config。 */
    boolean existsByConfigIdAndStatusIn(Long configId, Collection<String> statuses);

    /** 删除 config 时一并删除其全部 run。 */
    long deleteAllByConfigId(Long configId);
}
