package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.DataWorkbenchSemanticModelEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List; import java.util.Optional;
public interface DataWorkbenchSemanticModelRepository extends JpaRepository<DataWorkbenchSemanticModelEntity, Long> { List<DataWorkbenchSemanticModelEntity> findAllByProject_IdOrderByIdAsc(Long projectId); Optional<DataWorkbenchSemanticModelEntity> findByIdAndProject_Id(Long id, Long projectId); }
