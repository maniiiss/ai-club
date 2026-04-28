package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabProductBranchEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface GitlabProductBranchRepository extends JpaRepository<GitlabProductBranchEntity, Long> {

    List<GitlabProductBranchEntity> findAllByBinding_IdOrderByIdAsc(Long bindingId);

    boolean existsByBinding_IdAndLineCodeIgnoreCase(Long bindingId, String lineCode);

    boolean existsByBinding_IdAndLineCodeIgnoreCaseAndIdNot(Long bindingId, String lineCode, Long id);

    boolean existsByBinding_IdAndBranchNameIgnoreCase(Long bindingId, String branchName);

    boolean existsByBinding_IdAndBranchNameIgnoreCaseAndIdNot(Long bindingId, String branchName, Long id);
}
