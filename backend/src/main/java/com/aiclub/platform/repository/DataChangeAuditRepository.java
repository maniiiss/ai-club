package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.DataChangeAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DataChangeAuditRepository extends JpaRepository<DataChangeAuditEntity, Long> {

    List<DataChangeAuditEntity> findAllByRequest_IdOrderByIdAsc(Long requestId);
}
