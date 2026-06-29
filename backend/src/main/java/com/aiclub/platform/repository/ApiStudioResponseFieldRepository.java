package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ApiStudioResponseFieldEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * 原生 API 工作台 - 响应字段仓储。
 */
public interface ApiStudioResponseFieldRepository extends JpaRepository<ApiStudioResponseFieldEntity, Long> {

    List<ApiStudioResponseFieldEntity> findByResponseIdOrderByParentIdAscSortOrderAscIdAsc(Long responseId);

    void deleteByResponseId(Long responseId);
}
