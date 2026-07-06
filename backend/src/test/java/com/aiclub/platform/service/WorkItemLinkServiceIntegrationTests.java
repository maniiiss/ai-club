package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.domain.model.DocumentAssetEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.RoleEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.ProjectSummary;
import com.aiclub.platform.dto.TaskLinksSummary;
import com.aiclub.platform.dto.TaskSummary;
import com.aiclub.platform.dto.request.ProjectRequest;
import com.aiclub.platform.dto.request.TaskLinkRequest;
import com.aiclub.platform.dto.request.TaskRequest;
import com.aiclub.platform.repository.DocumentAssetRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.RoleRepository;
import com.aiclub.platform.repository.TestCaseRepository;
import com.aiclub.platform.repository.TestPlanRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * 覆盖工作项子项、普通关联、测试用例和附件关系，确保工作项详情页签的事实源稳定。
 */
@SpringBootTest
@Transactional
class WorkItemLinkServiceIntegrationTests {

    @Autowired
    private PlatformStoreService platformStoreService;

    @Autowired
    private WorkItemLinkService workItemLinkService;

    @Autowired
    private ProjectRepository projectRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RoleRepository roleRepository;

    @Autowired
    private TestPlanRepository testPlanRepository;

    @Autowired
    private TestCaseRepository testCaseRepository;

    @Autowired
    private DocumentAssetRepository documentAssetRepository;

    @MockBean
    private DocumentAssetStorageService documentAssetStorageService;

    @AfterEach
    void clearAuthContext() {
        AuthContextHolder.clear();
    }

    @Test
    void shouldManageAllLinkTypesForAnyWorkItemType() {
        UserEntity creator = createUser("links-creator-a", "关联创建人甲");
        ProjectEntity project = createProjectAs(creator, "工作项关联项目A");
        loginAs(creator);
        mockAttachmentStorage("需求附件.txt", "text/plain", "hello".getBytes());
        TaskSummary requirement = createWorkItem(project.getId(), "需求", "关联需求A");
        TaskSummary task = createWorkItem(project.getId(), "任务", "关联任务A");
        TaskSummary defect = createWorkItem(project.getId(), "缺陷", "关联缺陷A");
        TestCaseEntity testCase = createTestCase(project, "登录失败提示用例");

        workItemLinkService.addChild(requirement.id(), new TaskLinkRequest(task.id()));
        workItemLinkService.addRelatedWorkItem(requirement.id(), new TaskLinkRequest(defect.id()));
        workItemLinkService.addTestCase(requirement.id(), new TaskLinkRequest(testCase.getId()));
        workItemLinkService.uploadAttachment(requirement.id(), new MockMultipartFile(
                "file",
                "需求附件.txt",
                "text/plain",
                "hello".getBytes()
        ));

        TaskLinksSummary links = workItemLinkService.getLinks(requirement.id());

        assertThat(links.children()).extracting(TaskSummary::id).containsExactly(task.id());
        assertThat(links.relatedWorkItems()).extracting(TaskSummary::id).containsExactly(defect.id());
        assertThat(links.testCases()).extracting(TaskLinksSummary.LinkedTestCaseSummary::id).containsExactly(testCase.getId());
        assertThat(links.attachments()).extracting(TaskLinksSummary.TaskAttachmentSummary::fileName).containsExactly("需求附件.txt");
    }

    @Test
    void shouldRejectInvalidWorkItemRelations() {
        UserEntity creator = createUser("links-creator-b", "关联创建人乙");
        ProjectEntity firstProject = createProjectAs(creator, "工作项关联项目B1");
        ProjectEntity secondProject = createProjectAs(creator, "工作项关联项目B2");
        loginAs(creator);
        TaskSummary parent = createWorkItem(firstProject.getId(), "需求", "父需求B");
        TaskSummary child = createWorkItem(firstProject.getId(), "任务", "子任务B");
        TaskSummary grandChild = createWorkItem(firstProject.getId(), "缺陷", "孙缺陷B");
        TaskSummary external = createWorkItem(secondProject.getId(), "任务", "跨项目任务B");

        assertThatThrownBy(() -> workItemLinkService.addRelatedWorkItem(parent.id(), new TaskLinkRequest(parent.id())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("工作项不能关联自身");
        assertThatThrownBy(() -> workItemLinkService.addRelatedWorkItem(parent.id(), new TaskLinkRequest(external.id())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("关联工作项必须属于同一项目");

        workItemLinkService.addChild(parent.id(), new TaskLinkRequest(child.id()));
        assertThatThrownBy(() -> workItemLinkService.addChild(parent.id(), new TaskLinkRequest(child.id())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("工作项关系已存在");

        workItemLinkService.addChild(child.id(), new TaskLinkRequest(grandChild.id()));
        assertThatThrownBy(() -> workItemLinkService.addChild(grandChild.id(), new TaskLinkRequest(parent.id())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("子工作项不能形成循环");
    }

    @Test
    void shouldRejectCrossProjectTestCases() {
        UserEntity creator = createUser("links-creator-c", "关联创建人丙");
        ProjectEntity firstProject = createProjectAs(creator, "工作项关联项目C1");
        ProjectEntity secondProject = createProjectAs(creator, "工作项关联项目C2");
        loginAs(creator);
        TaskSummary task = createWorkItem(firstProject.getId(), "任务", "任务C");
        TestCaseEntity externalCase = createTestCase(secondProject, "跨项目用例C");

        assertThatThrownBy(() -> workItemLinkService.addTestCase(task.id(), new TaskLinkRequest(externalCase.getId())))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("测试用例必须属于同一项目");
    }

    @Test
    void shouldExposeLegacyRequirementTaskAsRelatedWorkItem() {
        UserEntity creator = createUser("links-creator-d", "关联创建人丁");
        ProjectEntity project = createProjectAs(creator, "工作项关联项目D");
        loginAs(creator);
        TaskSummary requirement = createWorkItem(project.getId(), "需求", "旧关联需求D");
        TaskSummary task = platformStoreService.createTask(new TaskRequest(
                "旧关联任务D",
                "任务",
                "待开始",
                "中",
                "",
                null,
                List.of(),
                "旧关联任务描述",
                "",
                "",
                "",
                false,
                false,
                null,
                "开发任务",
                null,
                null,
                project.getId(),
                null,
                null,
                requirement.id()
        ));

        TaskLinksSummary links = workItemLinkService.getLinks(task.id());

        assertThat(links.relatedWorkItems()).extracting(TaskSummary::id).contains(requirement.id());
    }

    @Test
    void shouldDownloadOnlyAttachmentsBoundToCurrentTask() {
        UserEntity creator = createUser("links-creator-e", "关联创建人戊");
        ProjectEntity project = createProjectAs(creator, "工作项关联项目E");
        loginAs(creator);
        mockAttachmentStorage("缺陷附件.txt", "text/plain", "defect".getBytes());
        TaskSummary task = createWorkItem(project.getId(), "缺陷", "缺陷E");
        TaskSummary otherTask = createWorkItem(project.getId(), "任务", "任务E");
        var attachment = workItemLinkService.uploadAttachment(task.id(), new MockMultipartFile(
                "file",
                "缺陷附件.txt",
                "text/plain",
                "defect".getBytes()
        ));

        assertThatThrownBy(() -> workItemLinkService.downloadAttachment(otherTask.id(), attachment.id()))
                .isInstanceOf(java.util.NoSuchElementException.class)
                .hasMessage("工作项附件不存在");
    }

    private void mockAttachmentStorage(String fileName, String contentType, byte[] bytes) {
        when(documentAssetStorageService.storeAnyFile(any(), anyString()))
                .thenReturn(new DocumentAssetStorageService.StoredDocumentAsset(
                        "task-attachments/test-" + fileName,
                        fileName,
                        contentType,
                        bytes.length,
                        "TXT"
                ));
        when(documentAssetStorageService.load(anyString()))
                .thenReturn(new DocumentAssetStorageService.StoredDocumentContent(bytes, contentType));
    }

    private TaskSummary createWorkItem(Long projectId, String type, String name) {
        return platformStoreService.createTask(new TaskRequest(
                name,
                type,
                "需求".equals(type) ? "草稿" : "待开始",
                "中",
                "",
                null,
                List.of(),
                name + " 描述",
                "需求".equals(type) ? "# 用户故事\n\n" + name + "\n\n# 需求描述\n\n描述\n\n# 验收标准\n\n通过" : "",
                "",
                "需求".equals(type) ? "默认模块" : "",
                false,
                false,
                null,
                "任务".equals(type) ? "开发任务" : null,
                null,
                null,
                projectId,
                null,
                null,
                null
        ));
    }

    private TestCaseEntity createTestCase(ProjectEntity project, String title) {
        TestPlanEntity plan = new TestPlanEntity();
        plan.setName(title + "计划");
        plan.setProject(project);
        plan.setStatus("草稿");
        plan.setDescription("");
        TestPlanEntity savedPlan = testPlanRepository.save(plan);

        TestCaseEntity testCase = new TestCaseEntity();
        testCase.setTestPlan(savedPlan);
        testCase.setTitle(title);
        testCase.setModuleName("登录");
        testCase.setCaseType("功能测试");
        testCase.setPriority("P1");
        testCase.setPrecondition("");
        testCase.setRemarks("");
        return testCaseRepository.save(testCase);
    }

    private UserEntity createUser(String username, String nickname) {
        RoleEntity defaultRole = createRole("ROLE_" + username.toUpperCase());
        UserEntity user = new UserEntity();
        user.setUsername(username);
        user.setNickname(nickname);
        user.setPasswordHash("test-password-hash");
        user.setEnabled(true);
        user.setRoles(new LinkedHashSet<>(List.of(defaultRole)));
        return userRepository.save(user);
    }

    private RoleEntity createRole(String code) {
        RoleEntity role = new RoleEntity();
        role.setName(code);
        role.setCode(code);
        role.setEnabled(true);
        role.setDescription(code + " 描述");
        role.setProjectVisibilityScope(DataPermissionScopeType.PROJECT_PARTICIPANT);
        role.setProjectManageScope(DataPermissionScopeType.OWNER_OR_CREATOR);
        role.setIterationDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        role.setTaskDeleteScope(DataPermissionScopeType.CREATOR_ONLY);
        return roleRepository.save(role);
    }

    private void loginAs(UserEntity user) {
        AuthContextHolder.set(new AuthContext(
                user.getId(),
                user.getUsername(),
                user.getNickname(),
                user.getRoles().stream().map(RoleEntity::getCode).collect(Collectors.toSet()),
                Set.of()
        ));
    }

    private ProjectEntity createProjectAs(UserEntity creator, String name) {
        loginAs(creator);
        ProjectSummary summary = platformStoreService.createProject(new ProjectRequest(
                name,
                "",
                creator.getId(),
                List.of(),
                "进行中",
                name + " 的描述"
        ));
        return projectRepository.findById(summary.id()).orElseThrow();
    }
}
