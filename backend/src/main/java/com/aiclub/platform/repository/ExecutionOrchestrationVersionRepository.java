package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface ExecutionOrchestrationVersionRepository extends JpaRepository<ExecutionOrchestrationVersionEntity,Long>{
 List<ExecutionOrchestrationVersionEntity> findAllByProfile_IdOrderByVersionNoDesc(Long profileId);
 long countByProfile_Id(Long profileId);
}
