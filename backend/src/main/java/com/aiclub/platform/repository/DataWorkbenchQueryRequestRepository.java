package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.DataWorkbenchQueryRequestEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface DataWorkbenchQueryRequestRepository extends JpaRepository<DataWorkbenchQueryRequestEntity, Long> { Optional<DataWorkbenchQueryRequestEntity> findByIdAndProject_Id(Long id, Long projectId); }
