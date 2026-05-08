package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.PlatformYaadeProjectBindingEntity;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.repository.PlatformYaadeProjectBindingRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class YaadeProjectSyncServiceTests {

    @Mock
    private ProjectRepository projectRepository;

    @Mock
    private PlatformYaadeProjectBindingRepository projectBindingRepository;

    @Mock
    private ProjectDataPermissionService projectDataPermissionService;

    @Mock
    private YaadeClientService yaadeClientService;

    private YaadeProjectSyncService yaadeProjectSyncService;

    @BeforeEach
    void setUp() {
        yaadeProjectSyncService = new YaadeProjectSyncService(
                projectRepository,
                projectBindingRepository,
                projectDataPermissionService,
                yaadeClientService,
                new YaadeProperties(
                        "http://localhost:9339/api/yaade/proxy",
                        "admin",
                        "admin-password",
                        "default-password",
                        "未关联项目",
                        120
                ),
                new ObjectMapper()
        );
    }

    @Test
    void shouldCreateProjectBindingWhenMissing() {
        ProjectEntity project = buildProject(7L, "项目A");
        YaadeClientService.YaadeSession adminSession = new YaadeClientService.YaadeSession("admin-cookie");
        YaadeClientService.YaadeRemoteCollection collection = createCollection(51L, "项目A", List.of("aiclub-project-7"));

        doNothing().when(projectDataPermissionService).requireProjectVisible(project);
        when(yaadeClientService.loginAdmin()).thenReturn(adminSession);
        when(projectBindingRepository.findByProjectId(7L)).thenReturn(Optional.empty());
        when(yaadeClientService.listCollections(adminSession)).thenReturn(List.of());
        when(yaadeClientService.createCollection(adminSession, "项目A", List.of("aiclub-project-7"))).thenReturn(collection);
        when(projectBindingRepository.save(any(PlatformYaadeProjectBindingEntity.class))).thenAnswer(invocation -> {
            PlatformYaadeProjectBindingEntity entity = invocation.getArgument(0);
            entity.setId(1L);
            return entity;
        });

        YaadeProjectSyncService.EnsureProjectBindingResult result = yaadeProjectSyncService.ensureProjectBinding(project);

        assertThat(result.created()).isTrue();
        assertThat(result.summary().projectId()).isEqualTo(7L);
        assertThat(result.summary().collectionName()).isEqualTo("项目A");
        assertThat(result.summary().yaadeGroupName()).isEqualTo("aiclub-project-7");
    }

    @Test
    void shouldArchiveBindingWhenDeletingProject() {
        PlatformYaadeProjectBindingEntity binding = new PlatformYaadeProjectBindingEntity();
        binding.setId(9L);
        binding.setProjectId(7L);
        binding.setYaadeCollectionId(51L);
        binding.setYaadeGroupName("aiclub-project-7");
        binding.setStatus(YaadeProjectSyncService.STATUS_ACTIVE);
        YaadeClientService.YaadeSession adminSession = new YaadeClientService.YaadeSession("admin-cookie");

        when(projectBindingRepository.findByProjectId(7L)).thenReturn(Optional.of(binding));
        when(yaadeClientService.loginAdmin()).thenReturn(adminSession);
        when(yaadeClientService.findCollectionById(adminSession, 51L)).thenThrow(new NoSuchElementException("missing"));
        when(projectBindingRepository.save(any(PlatformYaadeProjectBindingEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        yaadeProjectSyncService.archiveProjectBinding(7L, "项目A");

        assertThat(binding.getStatus()).isEqualTo(YaadeProjectSyncService.STATUS_ARCHIVED);
        assertThat(binding.getArchivedName()).isEqualTo("已归档-7-项目A");
        verify(projectBindingRepository).save(binding);
    }

    private ProjectEntity buildProject(Long id, String name) {
        ProjectEntity project = new ProjectEntity();
        project.setId(id);
        project.setName(name);
        project.setOwner("负责人");
        project.setStatus("进行中");
        project.setDescription(name + " 描述");
        return project;
    }

    private YaadeClientService.YaadeRemoteCollection createCollection(Long id, String name, List<String> groups) {
        ObjectMapper objectMapper = new ObjectMapper();
        var raw = objectMapper.createObjectNode()
                .put("id", id)
                .put("ownerId", 1L)
                .put("version", "1.0.0");
        var data = objectMapper.createObjectNode()
                .put("name", name)
                .put("rank", 0);
        var groupArray = data.putArray("groups");
        groups.forEach(groupArray::add);
        raw.set("data", data);
        raw.putArray("requests");
        raw.putArray("scripts");
        return new YaadeClientService.YaadeRemoteCollection(id, 1L, "1.0.0", name, null, 0, groups, raw);
    }
}
