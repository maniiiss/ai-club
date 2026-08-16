package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.design.DesignVersionDtos;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.GitPilotDesignVersionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Web 项目内的 Design 时间线、激活与恢复入口。 */
@RestController
@RequestMapping("/api/projects/{projectId}/design-versions")
public class ProjectDesignVersionController {

    private final GitPilotDesignVersionService designVersionService;

    public ProjectDesignVersionController(GitPilotDesignVersionService designVersionService) {
        this.designVersionService = designVersionService;
    }

    @GetMapping
    public ApiResponse<DesignVersionDtos.DesignVersionList> list(@PathVariable Long projectId) {
        return ApiResponse.success(designVersionService.list(projectId));
    }

    @GetMapping("/{versionId}")
    public ApiResponse<DesignVersionDtos.DesignVersionDetail> detail(@PathVariable Long projectId,
                                                                      @PathVariable Long versionId) {
        return ApiResponse.success(designVersionService.get(projectId, versionId));
    }

    @PostMapping("/{versionId}/activate")
    public ApiResponse<DesignVersionDtos.DesignVersionDetail> activate(@PathVariable Long projectId,
                                                                         @PathVariable Long versionId) {
        return ApiResponse.success(designVersionService.activate(projectId, versionId));
    }

    @PostMapping("/{versionId}/restore")
    public ApiResponse<DesignVersionDtos.DesignVersionDetail> restore(@PathVariable Long projectId,
                                                                        @PathVariable Long versionId) {
        Long userId = AuthContextHolder.get().orElseThrow().userId();
        return ApiResponse.success(designVersionService.restore(projectId, versionId, userId));
    }
}
