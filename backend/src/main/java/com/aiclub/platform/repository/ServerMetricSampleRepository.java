package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.ServerMetricSampleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

public interface ServerMetricSampleRepository extends JpaRepository<ServerMetricSampleEntity, Long> {

    List<ServerMetricSampleEntity> findAllByServer_IdAndSampledAtAfterOrderBySampledAtAsc(Long serverId, LocalDateTime sampledAt);

    @Transactional
    void deleteAllBySampledAtBefore(LocalDateTime sampledAt);
}
