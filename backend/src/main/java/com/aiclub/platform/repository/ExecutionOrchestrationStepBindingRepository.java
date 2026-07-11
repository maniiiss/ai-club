package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.ExecutionOrchestrationStepBindingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface ExecutionOrchestrationStepBindingRepository extends JpaRepository<ExecutionOrchestrationStepBindingEntity,Long>{
 List<ExecutionOrchestrationStepBindingEntity> findAllByVersion_IdOrderByIdAsc(Long versionId);
 void deleteAllByVersion_Id(Long versionId);
}
