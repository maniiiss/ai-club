package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.AiClubPipelineConfigCompleteResult;
import com.aiclub.platform.dto.AiClubPipelineConfigEditContextResult;
import com.aiclub.platform.dto.AiClubPipelineConfigPreviewResult;
import com.aiclub.platform.dto.AiClubPipelineConfigStatusItem;
import com.aiclub.platform.dto.AiClubPipelineConfigTemplateItem;
import com.aiclub.platform.dto.AiClubPipelineCallbackWebhookSummary;
import com.aiclub.platform.dto.AiClubPipelineCronSummary;
import com.aiclub.platform.dto.AiClubPipelineRunLogDetail;
import com.aiclub.platform.dto.AiClubPipelineRunSummary;
import com.aiclub.platform.dto.AiClubPipelineSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerWebhookSummary;
import com.aiclub.platform.dto.AiClubPipelineTriggerResult;
import com.aiclub.platform.dto.JenkinsBuildLogDetail;
import com.aiclub.platform.dto.JenkinsBuildSummary;
import com.aiclub.platform.dto.JenkinsBuildTriggerResult;
import com.aiclub.platform.dto.JenkinsJobSummary;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.PipelineCenterEntrySummary;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.ProjectRuntimeInstanceSummary;
import com.aiclub.platform.dto.WoodpeckerHealthSummary;
import com.aiclub.platform.dto.request.AiClubPipelineConfigCompleteRequest;
import com.aiclub.platform.dto.request.AiClubPipelineConfigPreviewRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCallbackWebhookRequest;
import com.aiclub.platform.dto.request.AiClubPipelineCronRequest;
import com.aiclub.platform.dto.request.AiClubPipelineRequest;
import com.aiclub.platform.dto.request.AiClubPipelineTriggerWebhookRequest;
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

    @GetMapping("/woodpecker/health")
    @RequirePermission("cicd:view")
    public ApiResponse<WoodpeckerHealthSummary> getWoodpeckerHealth() {
        return ApiResponse.success(cicdManagementService.getWoodpeckerHealth());
    }

    @GetMapping("/pipeline-config-templates")
    @RequirePermission("cicd:view")
    public ApiResponse<List<AiClubPipelineConfigTemplateItem>> listAiClubPipelineConfigTemplates() {
        return ApiResponse.success(cicdManagementService.listAiClubPipelineConfigTemplates());
    }

    @GetMapping("/pipelines/{id}/config/templates")
    @RequirePermission("cicd:view")
    public ApiResponse<List<AiClubPipelineConfigTemplateItem>> listAiClubPipelineConfigTemplates(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.listAiClubPipelineConfigTemplates(id));
    }

    @GetMapping("/pipelines")
    @RequirePermission("cicd:view")
    public ApiResponse<PageResponse<AiClubPipelineSummary>> pageAiClubPipelines(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Boolean enabled
    ) {
        return ApiResponse.success(cicdManagementService.pageAiClubPipelines(page, size, keyword, projectId, enabled));
    }

    @GetMapping("/pipeline-center/entries")
    @RequirePermission("cicd:view")
    public ApiResponse<PageResponse<PipelineCenterEntrySummary>> pagePipelineCenterEntries(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long projectId,
            @RequestParam(required = false) Boolean enabled,
            @RequestParam(required = false) String entryType
    ) {
        return ApiResponse.success(cicdManagementService.pagePipelineCenterEntries(page, size, keyword, projectId, enabled, entryType));
    }

    @GetMapping("/pipelines/{id}")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineSummary> getAiClubPipeline(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getAiClubPipeline(id));
    }

    @PostMapping("/pipelines")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineSummary> createAiClubPipeline(@Valid @RequestBody AiClubPipelineRequest request) {
        return ApiResponse.success(cicdManagementService.createAiClubPipeline(request));
    }

    @PutMapping("/pipelines/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineSummary> updateAiClubPipeline(@PathVariable Long id,
                                                                   @Valid @RequestBody AiClubPipelineRequest request) {
        return ApiResponse.success(cicdManagementService.updateAiClubPipeline(id, request));
    }

    @DeleteMapping("/pipelines/{id}")
    @RequirePermission("cicd:manage")
    public ApiResponse<Void> deleteAiClubPipeline(@PathVariable Long id) {
        cicdManagementService.deleteAiClubPipeline(id);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @PostMapping("/pipelines/{id}/sync-repository")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineSummary> syncAiClubPipelineRepository(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.syncAiClubPipelineRepository(id));
    }

    @PostMapping("/pipelines/{id}/trigger")
    @RequirePermission("cicd:build")
    public ApiResponse<AiClubPipelineTriggerResult> triggerAiClubPipeline(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.triggerAiClubPipeline(id));
    }

    @GetMapping("/pipelines/{id}/config/status")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineConfigStatusItem> getAiClubPipelineConfigStatus(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getAiClubPipelineConfigStatus(id));
    }

    @GetMapping("/pipelines/{id}/config/edit-context")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineConfigEditContextResult> getAiClubPipelineConfigEditContext(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getAiClubPipelineConfigEditContext(id));
    }

    @PostMapping("/pipelines/{id}/config/preview")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineConfigPreviewResult> previewAiClubPipelineConfig(@PathVariable Long id,
                                                                                     @Valid @RequestBody AiClubPipelineConfigPreviewRequest request) {
        return ApiResponse.success(cicdManagementService.previewAiClubPipelineConfig(id, request));
    }

    @PostMapping("/pipelines/{id}/config/complete")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineConfigCompleteResult> completeAiClubPipelineConfig(@PathVariable Long id,
                                                                                       @Valid @RequestBody AiClubPipelineConfigCompleteRequest request) {
        return ApiResponse.success(cicdManagementService.completeAiClubPipelineConfig(id, request));
    }

    @GetMapping("/pipelines/{id}/runs")
    @RequirePermission("cicd:view")
    public ApiResponse<List<AiClubPipelineRunSummary>> listAiClubPipelineRuns(@PathVariable Long id,
                                                                              @RequestParam(defaultValue = "20") int limit) {
        return ApiResponse.success(cicdManagementService.listAiClubPipelineRuns(id, limit));
    }

    @GetMapping("/pipelines/{id}/runs/{runNumber}/log")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineRunLogDetail> getAiClubPipelineRunLog(@PathVariable Long id,
                                                                           @PathVariable int runNumber) {
        return ApiResponse.success(cicdManagementService.getAiClubPipelineRunLog(id, runNumber));
    }

    @GetMapping("/pipelines/{id}/cron-jobs")
    @RequirePermission("cicd:view")
    public ApiResponse<List<AiClubPipelineCronSummary>> listAiClubPipelineCronJobs(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.listAiClubPipelineCronJobs(id));
    }

    @PostMapping("/pipelines/{id}/cron-jobs")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineCronSummary> createAiClubPipelineCronJob(@PathVariable Long id,
                                                                              @Valid @RequestBody AiClubPipelineCronRequest request) {
        return ApiResponse.success(cicdManagementService.createAiClubPipelineCronJob(id, request));
    }

    @PutMapping("/pipelines/{id}/cron-jobs/{cronJobId}")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineCronSummary> updateAiClubPipelineCronJob(@PathVariable Long id,
                                                                              @PathVariable Long cronJobId,
                                                                              @Valid @RequestBody AiClubPipelineCronRequest request) {
        return ApiResponse.success(cicdManagementService.updateAiClubPipelineCronJob(id, cronJobId, request));
    }

    @DeleteMapping("/pipelines/{id}/cron-jobs/{cronJobId}")
    @RequirePermission("cicd:manage")
    public ApiResponse<Void> deleteAiClubPipelineCronJob(@PathVariable Long id, @PathVariable Long cronJobId) {
        cicdManagementService.deleteAiClubPipelineCronJob(id, cronJobId);
        return new ApiResponse<>(true, "Deleted successfully", null);
    }

    @GetMapping("/pipelines/{id}/trigger-webhook")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineTriggerWebhookSummary> getAiClubPipelineTriggerWebhook(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getAiClubPipelineTriggerWebhook(id));
    }

    @PutMapping("/pipelines/{id}/trigger-webhook")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineTriggerWebhookSummary> updateAiClubPipelineTriggerWebhook(@PathVariable Long id,
                                                                                                @Valid @RequestBody AiClubPipelineTriggerWebhookRequest request) {
        return ApiResponse.success(cicdManagementService.updateAiClubPipelineTriggerWebhook(id, request));
    }

    @GetMapping("/pipelines/{id}/callback-webhook")
    @RequirePermission("cicd:view")
    public ApiResponse<AiClubPipelineCallbackWebhookSummary> getAiClubPipelineCallbackWebhook(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getAiClubPipelineCallbackWebhook(id));
    }

    @PutMapping("/pipelines/{id}/callback-webhook")
    @RequirePermission("cicd:manage")
    public ApiResponse<AiClubPipelineCallbackWebhookSummary> updateAiClubPipelineCallbackWebhook(@PathVariable Long id,
                                                                                                  @Valid @RequestBody AiClubPipelineCallbackWebhookRequest request) {
        return ApiResponse.success(cicdManagementService.updateAiClubPipelineCallbackWebhook(id, request));
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

    @GetMapping("/pipeline-bindings/{id}")
    @RequirePermission("cicd:view")
    public ApiResponse<ProjectPipelineBindingSummary> getPipelineBinding(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.getPipelineBinding(id));
    }

    @GetMapping("/pipeline-bindings/{id}/runtime-instances")
    @RequirePermission("cicd:view")
    public ApiResponse<List<ProjectRuntimeInstanceSummary>> listPipelineBindingRuntimeInstances(@PathVariable Long id) {
        return ApiResponse.success(cicdManagementService.listPipelineBindingRuntimeInstances(id));
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
