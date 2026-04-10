package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.JenkinsServerEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface JenkinsServerRepository extends JpaRepository<JenkinsServerEntity, Long>, JpaSpecificationExecutor<JenkinsServerEntity> {

    List<JenkinsServerEntity> findAllByEnabledTrueOrderByIdAsc();
}
