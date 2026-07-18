package com.aiclub.platform.repository;
import com.aiclub.platform.domain.model.DataWorkbenchDataSourceEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List; import java.util.Optional;
public interface DataWorkbenchDataSourceRepository extends JpaRepository<DataWorkbenchDataSourceEntity, Long> { List<DataWorkbenchDataSourceEntity> findAllByProject_IdOrderByIdAsc(Long projectId); Optional<DataWorkbenchDataSourceEntity> findByIdAndProject_Id(Long id, Long projectId); }
