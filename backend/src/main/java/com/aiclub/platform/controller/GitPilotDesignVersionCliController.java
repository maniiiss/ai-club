package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.design.DesignVersionDtos;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.GitPilotDesignVersionService;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** CLI 专用 Design 上传入口：gpt_ Token scope 与 Web 登录态权限均需满足。 */
@RestController
@RequestMapping("/api/cli/projects")
public class GitPilotDesignVersionCliController {

    private final GitPilotCliService cliService;
    private final GitPilotDesignVersionService designVersionService;

    public GitPilotDesignVersionCliController(GitPilotCliService cliService,
                                              GitPilotDesignVersionService designVersionService) {
        this.cliService = cliService;
        this.designVersionService = designVersionService;
    }

    @PostMapping("/{projectId}/design-versions")
    public ApiResponse<DesignVersionDtos.DesignVersionSummary> upload(
            @PathVariable Long projectId,
            @RequestBody DesignVersionDtos.CreateDesignVersionRequest request) {
        var context = AuthContextHolder.get().orElseThrow();
        cliService.requireScope(context.token(), GitPilotCliService.SCOPE_DESIGN_WRITE);
        return ApiResponse.success(designVersionService.upload(projectId, request, context.userId()));
    }
}
