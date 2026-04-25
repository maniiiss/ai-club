package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.JenkinsBuildLogDetail;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.dto.JenkinsBuildTriggerResult;
import com.aiclub.platform.dto.JenkinsJobSummary;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.request.JenkinsServerRequest;
import com.aiclub.platform.dto.request.ProjectPipelineBindingRequest;
import com.aiclub.platform.service.CicdManagementService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/cicd")
public class CicdController {

    private final CicdManagementService cicdManagementService;

    public CicdController(CicdManagementService cicdManagementService) {
        this.cicdManagementService = cicdManagementService;
    }

    @GetMapping("/jenkins-servers")
    @RequirePermission("cicd:view")
    public ApiResponse<PageResponse<JenkinsServerSummary>> pageJenkinsServers(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(cicdManagementService.pageJenkinsServers(page, size, keyword, enabled));
    }

    @GetMapping("/jenkins-servers/options")
    @RequirePermission("cicd:view")
    public ApiResponse<List<JenkinsServerSummary>> jenkinsServerOptions() {
        return ApiResponse.success(cicdManagementService.listJenkinsServerOptions());
    }

    @PostMapping("/jenkins-servers")
    @RequirePermission("cicd:manage")
    public ApiResponse<JenkinsServerSummary> createJenkinsServer(@Valid @RequestBody JenkinsServerRequest request) {
        return ApiResponse.success(cicdManagementService.createJenkinsServer(request));
    }

    @PutMapping("/jenkins-servers/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<JenkinsServerSummary> updateJenkinsServer(@PathVariable Long id,
                                                                 @Valid @RequestBody JenkinsServerRequest request) {
        return ApiResponse.success(cicdManagementService.updateJenkinsServer(id, request));
    }

    @DeleteMapping("/jenkins-servers/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<Void> deleteJenkinsServer(@PathVariable Long id) {
        cicdManagementService.deleteJenkinsServer(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/jenkins-servers/{id}/test")
    @RequirePermission("cicd:manage")
    public ApiResponse<JenkinsServerSummary> testJenkinsServer(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.testJenkinsServer(id));
    }

    @GetMapping("/jenkins-servers/{id}/jobs")
    @RequirePermission("cicd:view")
    public ApiResponse<List<JenkinsJobSummary>> listJenkinsJobs(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.listJenkinsJobs(id));
    }

    @PostMapping("/jenkins-servers/{id}/jobs/trigger")
    @RequirePermission("cicd:build")
    public ApiResponse<JenkinsBuildTriggerResult> triggerJenkinsJob(@PathVariable Long id,
                                                                    @RequestParam String jobName) {
        return ApiResponse.success(cicdManagementService.triggerJenkinsJob(id, jobName));
    }

    @GetMapping("/pipeline-bindings")
    @RequirePermission("cicd:view")
    public ApiResponse<PageResponse<ProjectPipelineBindingSummary>> pagePipelineBindings(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long serverId,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(cicdManagementService.pagePipelineBindings(page, size, keyword, serverId, enabled));
    }

    @PostMapping("/pipeline-bindings")
    @RequirePermission("cicd:manage")
    public ApiResponse<ProjectPipelineBindingSummary> createPipelineBinding(@Valid @RequestBody ProjectPipelineBindingRequest request) {
        return ApiResponse.success(cicdManagementService.createPipelineBinding(request));
    }

    @GetMapping("/pipeline-bindings/{id}/builds")
    @RequirePermission("cicd:view")
    public ApiResponse<List<JenkinsBuildSummary>> listPipelineBuilds(@PathVariable Long id,
                                                                     @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.success(cicdManagementService.listPipelineBuilds(id, limit));
    }

    @GetMapping("/pipeline-bindings/{id}/builds/{buildNumber}/log")
    @RequirePermission("cicd:view")
    public ApiResponse<JenkinsBuildLogDetail> getPipelineBuildLog(@PathVariable Long id,
                                                                  @PathVariable int buildNumber) {
        return ApiResponse.success(cicdManagementService.getPipelineBuildLog(id, buildNumber));
    }

    @PutMapping("/pipeline-bindings/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<ProjectPipelineBindingSummary> updatePipelineBinding(@PathVariable Long id,
                                                                            @Valid @RequestBody ProjectPipelineBindingRequest request) {
        return ApiResponse.success(cicdManagementService.updatePipelineBinding(id, request));
    }

    @DeleteMapping("/pipeline-bindings/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<Void> deletePipelineBinding(@PathVariable Long id) {
        cicdManagementService.deletePipelineBinding(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/pipeline-bindings/{id}/trigger")
    @RequirePermission("cicd:build")
    public ApiResponse<JenkinsBuildTriggerResult> triggerPipelineBuild(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.triggerPipelineBuild(id));
    }
}
