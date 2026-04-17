package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.WikiPageAccessEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/**
 * Wiki 页面指定用户访问控制仓储。
 */
public interface WikiPageAccessRepository extends JpaRepository<WikiPageAccessEntity, Long> {

    /** 读取页面全部指定用户授权。 */
    List<WikiPageAccessEntity> findAllByPage_Id(Long pageId);

    /** 读取指定用户在页面上的授权。 */
    List<WikiPageAccessEntity> findAllByPage_IdAndUser_Id(Long pageId, Long userId);

    /** 覆盖访问控制前清理旧授权。 */
    void deleteAllByPage_Id(Long pageId);
}
