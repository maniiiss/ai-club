package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectPipelineBindingEntity;
import com.aiclub.platform.dto.JenkinsServerSummary;
import com.aiclub.platform.dto.ProjectPipelineBindingSummary;
import com.aiclub.platform.dto.request.JenkinsServerRequest;
import com.aiclub.platform.dto.request.ProjectPipelineBindingRequest;
import com.aiclub.platform.repository.ProjectPipelineBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@SpringBootTest
@Transactional
class CicdManagementServiceTests {

    @Autowired
    private CicdManagementService cicdManagementService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private ProjectPipelineBindingRepository projectPipelineBindingRepository;

    @MockBean
    private JenkinsApiService jenkinsApiService;

    /**
     * 验证同一个业务项目可以同时绑定多条 Jenkins 流水线。
     */
    @Test
    void shouldAllowMultipleJenkinsBindingsForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("多流水线项目", "王五", "进行中", "验证一个项目支持多条 Jenkins 绑定"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("job-one");
        mockFetchJob("job-two");

        ProjectPipelineBindingSummary firstBinding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-one",
                "main",
                "{\"ENV\":\"test\"}",
                true
        ));
        ProjectPipelineBindingSummary secondBinding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-two",
                "develop",
                "{\"ENV\":\"prod\"}",
                true
        ));

        assertThat(firstBinding.projectId()).isEqualTo(project.getId());
        assertThat(secondBinding.projectId()).isEqualTo(project.getId());
        assertThat(projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(project.getId()))
                .extracting(ProjectPipelineBindingEntity::getJobName)
                .containsExactly("job-one", "job-two");
    }

    /**
     * 验证项目级触发会遍历同一项目下的全部 Jenkins 绑定，而不是只触发首条记录。
     */
    @Test
    void shouldTriggerAllBindingsForSameProject() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("批量触发项目", "赵六", "进行中", "验证项目级 Jenkins 多绑定触发"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("job-one");
        mockFetchJob("job-two");
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("job-one"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/1", "已提交 Jenkins 构建请求"));
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("job-two"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/2", "已提交 Jenkins 构建请求"));

        cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-one",
                "main",
                "{\"ENV\":\"test\"}",
                true
        ));
        cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "job-two",
                "develop",
                "{\"ENV\":\"prod\"}",
                true
        ));

        CicdManagementService.PipelineTriggerOutcome outcome = cicdManagementService.tryTriggerProjectPipeline(
                project.getId(),
                "release",
                "测试触发"
        );

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.message()).isEqualTo("已触发 2 条 Jenkins 流水线");
        assertThat(outcome.bindingOutcomes())
                .extracting(CicdManagementService.PipelineBindingOutcome::jobName)
                .containsExactly("job-one", "job-two");
        assertThat(projectPipelineBindingRepository.findByProject_IdOrderByIdAsc(project.getId()))
                .extracting(ProjectPipelineBindingEntity::getLastTriggerStatus)
                .containsExactly("QUEUED", "QUEUED");
        verify(jenkinsApiService, times(2)).triggerJob(anyString(), anyString(), anyString(), anyString(), anyMap());
    }

    /**
     * 验证默认分支不会被强行注入到未声明 branch 参数的 Jenkins Job 中，
     * 避免普通 Job 被误判为参数化构建后触发 500。
     */
    @Test
    void shouldNotInjectDefaultBranchForJobWithoutBranchParameter() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("默认分支回退项目", "钱七", "进行中", "验证普通 Job 不自动注入 branch 参数"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("plain-job");
        ProjectPipelineBindingSummary binding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "plain-job",
                "main",
                "",
                true
        ));
        clearInvocations(jenkinsApiService);
        mockFetchJob("plain-job");
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("plain-job"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/plain-job", "已提交 Jenkins 构建请求"));

        cicdManagementService.triggerPipelineBuild(binding.id());

        ArgumentCaptor<java.util.Map<String, String>> parameterCaptor = ArgumentCaptor.forClass(java.util.Map.class);
        verify(jenkinsApiService).triggerJob(anyString(), anyString(), anyString(), eq("plain-job"), parameterCaptor.capture());
        assertThat(parameterCaptor.getValue()).isEmpty();
    }

    /**
     * 验证当 Jenkins Job 显式声明了 BRANCH 参数时，平台会把默认分支注入到对应参数名中。
     */
    @Test
    void shouldInjectDefaultBranchIntoDeclaredBranchParameter() {
        ProjectEntity project = projectRepository.save(new ProjectEntity("参数化分支项目", "孙八", "进行中", "验证 branch 参数自动映射"));
        JenkinsServerSummary server = createJenkinsServer();

        mockFetchJob("branch-job", java.util.List.of("BRANCH"));
        ProjectPipelineBindingSummary binding = cicdManagementService.createPipelineBinding(new ProjectPipelineBindingRequest(
                project.getId(),
                server.id(),
                "branch-job",
                "release",
                "",
                true
        ));
        clearInvocations(jenkinsApiService);
        mockFetchJob("branch-job", java.util.List.of("BRANCH"));
        when(jenkinsApiService.triggerJob(anyString(), anyString(), anyString(), eq("branch-job"), anyMap()))
                .thenReturn(new JenkinsApiService.JenkinsTriggerResult("http://jenkins.example.com/queue/branch-job", "已提交 Jenkins 构建请求"));

        cicdManagementService.triggerPipelineBuild(binding.id());

        ArgumentCaptor<java.util.Map<String, String>> parameterCaptor = ArgumentCaptor.forClass(java.util.Map.class);
        verify(jenkinsApiService).triggerJob(anyString(), anyString(), anyString(), eq("branch-job"), parameterCaptor.capture());
        assertThat(parameterCaptor.getValue()).containsExactlyEntriesOf(java.util.Map.of("BRANCH", "release"));
    }

    /**
     * 创建测试用 Jenkins 服务，复用真实的加密与持久化流程。
     */
    private JenkinsServerSummary createJenkinsServer() {
        return cicdManagementService.createJenkinsServer(new JenkinsServerRequest(
                "测试 Jenkins",
                "http://jenkins.example.com",
                "tester",
                "token-value",
                "测试 Jenkins 服务",
                true
        ));
    }

    /**
     * 模拟 Jenkins 查询 Job 详情，避免测试依赖外部 Jenkins 服务。
     */
    private void mockFetchJob(String jobName) {
        mockFetchJob(jobName, java.util.List.of());
    }

    /**
     * 模拟 Jenkins 查询 Job 详情，并按需返回参数定义。
     */
    private void mockFetchJob(String jobName, java.util.List<String> parameterNames) {
        when(jenkinsApiService.fetchJob(anyString(), anyString(), anyString(), eq(jobName)))
                .thenReturn(new JenkinsApiService.JenkinsJob(
                        jobName,
                        jobName,
                        "http://jenkins.example.com/job/" + jobName,
                        "blue",
                        null,
                        parameterNames
                ));
    }
}
