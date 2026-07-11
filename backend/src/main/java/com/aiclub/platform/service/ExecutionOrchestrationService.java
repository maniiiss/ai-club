package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.AgentEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationProfileEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationStepBindingEntity;
import com.aiclub.platform.domain.model.ExecutionOrchestrationVersionEntity;
import com.aiclub.platform.dto.request.ExecutionAgentBindingRequest;
import com.aiclub.platform.dto.ExecutionOrchestrationProfileSummary;
import com.aiclub.platform.dto.ExecutionOrchestrationScenarioSummary;
import com.aiclub.platform.dto.ExecutionOrchestrationVersionSummary;
import com.aiclub.platform.dto.request.UpdateExecutionOrchestrationVersionRequest;
import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.repository.AgentRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationProfileRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationStepBindingRepository;
import com.aiclub.platform.repository.ExecutionOrchestrationVersionRepository;
import com.aiclub.platform.repository.ProjectRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import com.aiclub.platform.exception.ForbiddenException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.Set;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;

/**
 * 执行编排领域服务。创建任务只读取已发布版本，并按项目完整覆盖优先、平台默认回退解析逻辑绑定。
 */
@Service
@Transactional(readOnly = true)
public class ExecutionOrchestrationService {
    public static final String SCOPE_PLATFORM = "PLATFORM";
    public static final String SCOPE_PROJECT = "PROJECT";

    private final ExecutionOrchestrationProfileRepository profileRepository;
    private final ExecutionOrchestrationVersionRepository versionRepository;
    private final ExecutionOrchestrationStepBindingRepository stepBindingRepository;
    private final AgentRepository agentRepository;
    private final ProjectDataPermissionService projectDataPermissionService;
    private final ProjectRepository projectRepository;
    private final UserRepository userRepository;

    public ExecutionOrchestrationService(ExecutionOrchestrationProfileRepository profileRepository,
                                         ExecutionOrchestrationVersionRepository versionRepository,
                                         ExecutionOrchestrationStepBindingRepository stepBindingRepository,
                                         AgentRepository agentRepository,
                                         ProjectDataPermissionService projectDataPermissionService) {
        this(profileRepository, versionRepository, stepBindingRepository, agentRepository,
                projectDataPermissionService, null, null);
    }

    @Autowired
    public ExecutionOrchestrationService(ExecutionOrchestrationProfileRepository profileRepository,
                                         ExecutionOrchestrationVersionRepository versionRepository,
                                         ExecutionOrchestrationStepBindingRepository stepBindingRepository,
                                         AgentRepository agentRepository,
                                         ProjectDataPermissionService projectDataPermissionService,
                                         ProjectRepository projectRepository,
                                         UserRepository userRepository) {
        this.profileRepository = profileRepository;
        this.versionRepository = versionRepository;
        this.stepBindingRepository = stepBindingRepository;
        this.agentRepository = agentRepository;
        this.projectDataPermissionService = projectDataPermissionService;
        this.projectRepository = projectRepository;
        this.userRepository = userRepository;
    }

    public boolean isManagedScenario(String scenarioCode) {
        String normalized = normalize(scenarioCode);
        return ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equals(normalized)
                || ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equals(normalized);
    }

    /** 解析任务创建时应固化的版本和逻辑步骤 Agent 绑定。 */
    public ResolvedOrchestration resolve(Long projectId, String scenarioCode) {
        String normalized = normalize(scenarioCode);
        if (!isManagedScenario(normalized)) {
            return new ResolvedOrchestration(null, List.of());
        }
        ExecutionOrchestrationProfileEntity profile = profileRepository
                .findByScopeTypeAndProject_IdAndScenarioCode(SCOPE_PROJECT, projectId, normalized)
                .filter(item -> item.getPublishedVersion() != null)
                .orElseGet(() -> profileRepository.findByScopeTypeAndScenarioCode(SCOPE_PLATFORM, normalized)
                        .filter(item -> item.getPublishedVersion() != null)
                        .orElseThrow(() -> new ExecutionOrchestrationNotReadyException("场景尚未发布可用编排: " + normalized)));
        ExecutionOrchestrationVersionEntity version = profile.getPublishedVersion();
        List<ExecutionOrchestrationStepBindingEntity> storedBindings = stepBindingRepository.findAllByVersion_IdOrderByIdAsc(version.getId());
        Set<String> expectedSteps = scenarioDefinitions().get(normalized).stream()
                .filter(ExecutionOrchestrationScenarioSummary.Step::agentRequired)
                .map(ExecutionOrchestrationScenarioSummary.Step::stepCode).collect(java.util.stream.Collectors.toSet());
        Set<String> storedSteps = storedBindings.stream().map(item -> normalize(item.getStepCode()))
                .collect(java.util.stream.Collectors.toSet());
        if (!storedSteps.equals(expectedSteps) || storedBindings.size() != expectedSteps.size()) {
            throw new ExecutionOrchestrationNotReadyException("已发布编排步骤与当前场景目录不一致，请重新发布");
        }
        List<ExecutionAgentBindingRequest> bindings = storedBindings.stream()
                .map(binding -> {
                    if (binding.getAgent() == null) {
                        throw new ExecutionOrchestrationNotReadyException("编排绑定的 Agent 已删除: " + binding.getAgentNameSnapshot());
                    }
                    AgentEntity currentAgent = agentRepository.findById(binding.getAgent().getId())
                            .orElseThrow(() -> new ExecutionOrchestrationNotReadyException("编排绑定的 Agent 已不存在"));
                    validateAgentStillAvailable(profile, currentAgent, binding.getStepCode());
                    return new ExecutionAgentBindingRequest(binding.getStepCode(), currentAgent.getId(), binding.getTimeoutSeconds());
                })
                .toList();
        return new ResolvedOrchestration(version.getId(), bindings);
    }

    private void validateAgentStillAvailable(ExecutionOrchestrationProfileEntity profile, AgentEntity agent, String stepCode) {
        if (!Boolean.TRUE.equals(agent.getEnabled())) {
            throw new ExecutionOrchestrationNotReadyException("编排绑定的 Agent 已停用: " + agent.getId());
        }
        Long agentProjectId = agent.getProject() == null ? null : agent.getProject().getId();
        if (SCOPE_PLATFORM.equals(profile.getScopeType()) && agentProjectId != null) {
            throw new ExecutionOrchestrationNotReadyException("平台编排不能使用项目级 Agent");
        }
        if (SCOPE_PROJECT.equals(profile.getScopeType()) && agentProjectId != null
                && !agentProjectId.equals(profile.getProject().getId())) {
            throw new ExecutionOrchestrationNotReadyException("项目编排绑定了其他项目的 Agent");
        }
        if (ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equals(profile.getScenarioCode())
                && (!AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType())
                || !(AgentExecutionService.RUNTIME_CODEX_CLI.equalsIgnoreCase(agent.getRuntimeType())
                || AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI.equalsIgnoreCase(agent.getRuntimeType())))) {
            throw new ExecutionOrchestrationNotReadyException(stepCode + " 的 Runtime 已不兼容");
        }
        String step = normalize(stepCode);
        if (ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equals(profile.getScenarioCode())
                && (ExecutionWorkflowService.STEP_IMPLEMENT.equals(step) || ExecutionWorkflowService.STEP_TEST.equals(step))
                && !(AgentExecutionService.ACCESS_HTTP_API.equalsIgnoreCase(agent.getAccessType())
                || AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType()))) {
            throw new ExecutionOrchestrationNotReadyException(stepCode + " 的 Agent 已不具备执行能力");
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
    }

    public record ResolvedOrchestration(Long versionId, List<ExecutionAgentBindingRequest> agentBindings) {}

    /** 普通登录用户可读取场景就绪状态；指定项目时仍强制项目可见。 */
    public List<ExecutionOrchestrationScenarioSummary> listScenarios(Long projectId) {
        if (projectId != null) projectDataPermissionService.requireProjectVisible(requireProject(projectId));
        return scenarioDefinitions().entrySet().stream().map(entry -> {
            ExecutionOrchestrationProfileEntity profile = effectiveProfile(projectId, entry.getKey());
            boolean ready = false;
            String invalidReason = null;
            if (profile != null && profile.getPublishedVersion() != null) {
                try { resolve(projectId, entry.getKey()); ready = true; }
                catch (ExecutionOrchestrationNotReadyException exception) { invalidReason = exception.getMessage(); }
            } else {
                invalidReason = "ORCHESTRATION_NOT_READY: 场景尚未发布可用编排";
            }
            return new ExecutionOrchestrationScenarioSummary(entry.getKey(), scenarioName(entry.getKey()), entry.getValue(), ready,
                    profile == null ? null : profile.getScopeType(),
                    profile == null || profile.getPublishedVersion() == null ? null : profile.getPublishedVersion().getId(), invalidReason);
        }).toList();
    }

    /** 管理列表会按代码场景目录补齐空 Profile，但不会生成或发布默认 Agent 绑定。 */
    @Transactional
    public List<ExecutionOrchestrationProfileSummary> listProfiles(String scopeType, Long projectId) {
        String scope = normalizeScope(scopeType);
        requireManage(scope, projectId);
        ProjectEntity project = SCOPE_PROJECT.equals(scope) ? requireProject(projectId) : null;
        List<ExecutionOrchestrationProfileEntity> existing = SCOPE_PLATFORM.equals(scope)
                ? profileRepository.findAllByScopeTypeOrderByScenarioCodeAsc(scope)
                : profileRepository.findAllByScopeTypeAndProject_IdOrderByScenarioCodeAsc(scope, projectId);
        Map<String, ExecutionOrchestrationProfileEntity> byScenario = new LinkedHashMap<>();
        existing.forEach(item -> byScenario.put(item.getScenarioCode(), item));
        for (String scenario : scenarioDefinitions().keySet()) {
            byScenario.computeIfAbsent(scenario, ignored -> {
                ExecutionOrchestrationProfileEntity profile = new ExecutionOrchestrationProfileEntity();
                profile.setScopeType(scope); profile.setProject(project); profile.setScenarioCode(scenario);
                return profileRepository.save(profile);
            });
        }
        return byScenario.values().stream().map(this::toProfileSummary).toList();
    }

    /** 从当前有效版本创建新草稿；项目首次覆盖时复制当时的平台发布快照。 */
    @Transactional
    public ExecutionOrchestrationVersionSummary createDraft(Long profileId, Long sourceVersionId) {
        ExecutionOrchestrationProfileEntity profile = requireProfile(profileId);
        requireManage(profile.getScopeType(), profile.getProject() == null ? null : profile.getProject().getId());
        if (profile.getDraftVersion() != null) throw new IllegalArgumentException("当前编排已有草稿");
        ExecutionOrchestrationVersionEntity source = sourceVersionId == null ? draftSource(profile) : requireVersion(sourceVersionId);
        validateDraftSource(profile, source);
        ExecutionOrchestrationVersionEntity draft = new ExecutionOrchestrationVersionEntity();
        draft.setProfile(profile); draft.setVersionNo((int) versionRepository.countByProfile_Id(profileId) + 1);
        draft.setStatus("DRAFT"); draft.setSourceVersion(source); draft.setCreatedByUser(currentUser());
        draft = versionRepository.save(draft);
        if (source != null) cloneBindings(source.getId(), draft);
        profile.setDraftVersion(draft); profileRepository.save(profile);
        return toVersionSummary(draft);
    }

    /** 用完整步骤集合替换草稿，revision 不一致时拒绝覆盖其他管理员修改。 */
    @Transactional
    public ExecutionOrchestrationVersionSummary updateDraft(Long versionId, UpdateExecutionOrchestrationVersionRequest request) {
        ExecutionOrchestrationVersionEntity version = requireVersion(versionId); requireDraft(version);
        requireManage(version.getProfile().getScopeType(), projectId(version.getProfile()));
        if (!version.getRevision().equals(request.revision())) throw new IllegalStateException("编排草稿已被其他用户修改，请刷新后重试");
        stepBindingRepository.deleteAllByVersion_Id(versionId);
        // 完整替换会重新插入相同 step_code，必须先把旧绑定 DELETE 落库，避免 PostgreSQL 唯一键在 INSERT 阶段仍看到旧行。
        stepBindingRepository.flush();
        for (UpdateExecutionOrchestrationVersionRequest.StepBinding item : request.stepBindings()) {
            AgentEntity agent = agentRepository.findById(item.agentId()).orElseThrow(() -> new NoSuchElementException("Agent 不存在: " + item.agentId()));
            validateAgentScope(version.getProfile(), agent);
            ExecutionOrchestrationStepBindingEntity binding = new ExecutionOrchestrationStepBindingEntity();
            binding.setVersion(version); binding.setStepCode(normalize(item.stepCode())); binding.setAgent(agent);
            binding.setTimeoutSeconds(item.timeoutSeconds()); snapshot(binding, agent); stepBindingRepository.save(binding);
        }
        version.setUpdatedAt(LocalDateTime.now());
        versionRepository.saveAndFlush(version);
        return toVersionSummary(version);
    }

    /** 发布前做完整场景、Agent 范围、启用状态与 Runtime 兼容性校验，并原子归档旧发布版本。 */
    @Transactional
    public ExecutionOrchestrationVersionSummary publish(Long versionId) {
        ExecutionOrchestrationVersionEntity version = requireVersion(versionId); requireDraft(version);
        ExecutionOrchestrationProfileEntity profile = version.getProfile(); requireManage(profile.getScopeType(), projectId(profile));
        List<ExecutionOrchestrationStepBindingEntity> bindings = stepBindingRepository.findAllByVersion_IdOrderByIdAsc(versionId);
        validatePublish(profile, bindings);
        if (profile.getPublishedVersion() != null) {
            profile.getPublishedVersion().setStatus("ARCHIVED"); versionRepository.save(profile.getPublishedVersion());
        }
        version.setStatus("PUBLISHED"); version.setPublishedAt(LocalDateTime.now()); version.setPublishedByUser(currentUser());
        profile.setPublishedVersion(version); profile.setDraftVersion(null);
        versionRepository.save(version); profileRepository.save(profile); return toVersionSummary(version);
    }

    @Transactional
    public void deleteDraft(Long versionId) {
        ExecutionOrchestrationVersionEntity version = requireVersion(versionId); requireDraft(version);
        ExecutionOrchestrationProfileEntity profile = version.getProfile(); requireManage(profile.getScopeType(), projectId(profile));
        if (profile.getDraftVersion() != null && profile.getDraftVersion().getId().equals(versionId)) {
            profile.setDraftVersion(null); profileRepository.save(profile);
        }
        versionRepository.delete(version);
    }

    /** 放弃项目覆盖只清除生效指针并归档版本，历史记录仍可用于重新创建草稿。 */
    @Transactional
    public ExecutionOrchestrationProfileSummary abandonProjectOverride(Long profileId) {
        ExecutionOrchestrationProfileEntity profile = requireProfile(profileId);
        if (!SCOPE_PROJECT.equals(profile.getScopeType())) throw new IllegalArgumentException("只有项目编排可以放弃覆盖");
        requireManage(SCOPE_PROJECT, projectId(profile));
        if (profile.getPublishedVersion() != null) {
            profile.getPublishedVersion().setStatus("ARCHIVED");
            versionRepository.save(profile.getPublishedVersion());
            profile.setPublishedVersion(null);
        }
        return toProfileSummary(profileRepository.save(profile));
    }

    private void validatePublish(ExecutionOrchestrationProfileEntity profile, List<ExecutionOrchestrationStepBindingEntity> bindings) {
        Set<String> expected = scenarioDefinitions().get(profile.getScenarioCode()).stream().filter(ExecutionOrchestrationScenarioSummary.Step::agentRequired)
                .map(ExecutionOrchestrationScenarioSummary.Step::stepCode).collect(java.util.stream.Collectors.toSet());
        Set<String> actual = bindings.stream().map(item -> normalize(item.getStepCode())).collect(java.util.stream.Collectors.toSet());
        if (!actual.equals(expected) || bindings.size() != expected.size()) throw new IllegalArgumentException("步骤集合必须与场景目录完全一致");
        for (ExecutionOrchestrationStepBindingEntity binding : bindings) {
            if (binding.getAgent() == null) throw new IllegalArgumentException(binding.getStepCode() + " 绑定的 Agent 已删除");
            AgentEntity agent = agentRepository.findById(binding.getAgent().getId()).orElseThrow(() -> new IllegalArgumentException("Agent 已不存在"));
            validateAgentScope(profile, agent);
            if (!Boolean.TRUE.equals(agent.getEnabled())) throw new IllegalArgumentException("Agent 已停用: " + agent.getId());
            String step = normalize(binding.getStepCode());
            if (ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equals(profile.getScenarioCode())) {
                if (!AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType())
                        || !(AgentExecutionService.RUNTIME_CODEX_CLI.equalsIgnoreCase(agent.getRuntimeType())
                        || AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI.equalsIgnoreCase(agent.getRuntimeType())))
                    throw new IllegalArgumentException(step + " 仅支持 Codex/Claude CLI Runtime");
            } else if ((ExecutionWorkflowService.STEP_IMPLEMENT.equals(step) || ExecutionWorkflowService.STEP_TEST.equals(step))
                    && !(AgentExecutionService.ACCESS_HTTP_API.equalsIgnoreCase(agent.getAccessType())
                    || AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType()))) {
                throw new IllegalArgumentException(step + " 必须绑定可真实执行的 Agent");
            }
            snapshot(binding, agent); stepBindingRepository.save(binding);
        }
    }

    private void validateAgentScope(ExecutionOrchestrationProfileEntity profile, AgentEntity agent) {
        Long agentProject = agent.getProject() == null ? null : agent.getProject().getId();
        if (SCOPE_PLATFORM.equals(profile.getScopeType()) && agentProject != null) throw new IllegalArgumentException("平台编排只能绑定平台级 Agent");
        if (SCOPE_PROJECT.equals(profile.getScopeType()) && agentProject != null && !agentProject.equals(profile.getProject().getId()))
            throw new IllegalArgumentException("项目编排只能绑定平台 Agent 或同项目 Agent");
    }

    private Map<String,List<ExecutionOrchestrationScenarioSummary.Step>> scenarioDefinitions() {
        Map<String,List<ExecutionOrchestrationScenarioSummary.Step>> result = new LinkedHashMap<>();
        result.put(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION, List.of(
                new ExecutionOrchestrationScenarioSummary.Step("REPO_STRUCTURING","仓库结构化",false),
                new ExecutionOrchestrationScenarioSummary.Step("PLAN","执行规划",true),
                new ExecutionOrchestrationScenarioSummary.Step("IMPLEMENT","开发实现",true),
                new ExecutionOrchestrationScenarioSummary.Step("TEST","执行测试",true),
                new ExecutionOrchestrationScenarioSummary.Step("REPORT","交付报告",true)));
        result.put(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING, List.of(
                new ExecutionOrchestrationScenarioSummary.Step("CODE_CONTEXT","代码理解",true),
                new ExecutionOrchestrationScenarioSummary.Step("DESIGN_DRAFT","方案生成",true),
                new ExecutionOrchestrationScenarioSummary.Step("DESIGN_REVIEW","设计自检",true)));
        return result;
    }

    private String scenarioName(String code){return ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equals(code)?"开发执行":"技术设计生成";}
    private ExecutionOrchestrationProfileEntity effectiveProfile(Long projectId,String scenario){
        if(projectId!=null){var project=profileRepository.findByScopeTypeAndProject_IdAndScenarioCode(SCOPE_PROJECT,projectId,scenario).filter(p->p.getPublishedVersion()!=null);if(project.isPresent())return project.get();}
        return profileRepository.findByScopeTypeAndScenarioCode(SCOPE_PLATFORM,scenario).filter(p->p.getPublishedVersion()!=null).orElse(null);
    }
    private ExecutionOrchestrationVersionEntity draftSource(ExecutionOrchestrationProfileEntity p){if(p.getPublishedVersion()!=null)return p.getPublishedVersion();if(SCOPE_PROJECT.equals(p.getScopeType()))return effectiveProfile(null,p.getScenarioCode())==null?null:effectiveProfile(null,p.getScenarioCode()).getPublishedVersion();return null;}
    private void validateDraftSource(ExecutionOrchestrationProfileEntity target,ExecutionOrchestrationVersionEntity source){
        if(source==null)return;
        ExecutionOrchestrationProfileEntity sourceProfile=source.getProfile();
        if(!sourceProfile.getScenarioCode().equals(target.getScenarioCode()))throw new IllegalArgumentException("来源版本必须属于同一场景");
        if(sourceProfile.getId().equals(target.getId()))return;
        if(SCOPE_PROJECT.equals(target.getScopeType())&&SCOPE_PLATFORM.equals(sourceProfile.getScopeType())
                && "PUBLISHED".equals(source.getStatus()) && sourceProfile.getPublishedVersion()!=null
                && sourceProfile.getPublishedVersion().getId().equals(source.getId()))return;
        if(SCOPE_PROJECT.equals(target.getScopeType())&&SCOPE_PLATFORM.equals(sourceProfile.getScopeType()))
            throw new IllegalArgumentException("项目草稿只能复制平台同场景当前发布版本");
        throw new IllegalArgumentException("来源版本只能选择当前配置历史或同场景平台版本");
    }
    private void cloneBindings(Long sourceId,ExecutionOrchestrationVersionEntity target){for(var old:stepBindingRepository.findAllByVersion_IdOrderByIdAsc(sourceId)){var n=new ExecutionOrchestrationStepBindingEntity();n.setVersion(target);n.setStepCode(old.getStepCode());n.setAgent(old.getAgent());n.setTimeoutSeconds(old.getTimeoutSeconds());n.setAgentNameSnapshot(old.getAgentNameSnapshot());n.setAccessTypeSnapshot(old.getAccessTypeSnapshot());n.setRuntimeTypeSnapshot(old.getRuntimeTypeSnapshot());stepBindingRepository.save(n);}}
    private void snapshot(ExecutionOrchestrationStepBindingEntity b,AgentEntity a){b.setAgentNameSnapshot(a.getName()==null?"":a.getName());b.setAccessTypeSnapshot(a.getAccessType()==null?"":a.getAccessType());b.setRuntimeTypeSnapshot(a.getRuntimeType());}
    private ExecutionOrchestrationProfileSummary toProfileSummary(ExecutionOrchestrationProfileEntity p){return new ExecutionOrchestrationProfileSummary(p.getId(),p.getScopeType(),projectId(p),p.getScenarioCode(),p.getDraftVersion()==null?null:p.getDraftVersion().getId(),p.getPublishedVersion()==null?null:p.getPublishedVersion().getId(),versionRepository.findAllByProfile_IdOrderByVersionNoDesc(p.getId()).stream().map(this::toVersionSummary).toList());}
    private ExecutionOrchestrationVersionSummary toVersionSummary(ExecutionOrchestrationVersionEntity v){return new ExecutionOrchestrationVersionSummary(v.getId(),v.getProfile().getId(),v.getVersionNo(),v.getStatus(),v.getSourceVersion()==null?null:v.getSourceVersion().getId(),v.getRevision(),v.getCreatedAt(),v.getPublishedAt(),stepBindingRepository.findAllByVersion_IdOrderByIdAsc(v.getId()).stream().map(b->{String reason=bindingInvalidReason(v.getProfile(),b);return new ExecutionOrchestrationVersionSummary.StepBinding(b.getStepCode(),b.getAgent()==null?null:b.getAgent().getId(),b.getTimeoutSeconds(),b.getAgentNameSnapshot(),b.getAccessTypeSnapshot(),b.getRuntimeTypeSnapshot(),reason==null,reason);}).toList());}
    private String bindingInvalidReason(ExecutionOrchestrationProfileEntity profile,ExecutionOrchestrationStepBindingEntity binding){
        AgentEntity agent=binding.getAgent();
        if(agent==null)return "Agent 已删除";
        if(!Boolean.TRUE.equals(agent.getEnabled()))return "Agent 已停用";
        Long agentProject=agent.getProject()==null?null:agent.getProject().getId();
        if(SCOPE_PLATFORM.equals(profile.getScopeType())&&agentProject!=null)return "平台编排只能绑定平台级 Agent";
        if(SCOPE_PROJECT.equals(profile.getScopeType())&&agentProject!=null&&!agentProject.equals(profile.getProject().getId()))return "项目编排只能绑定平台 Agent 或同项目 Agent";
        String step=normalize(binding.getStepCode());
        if(ExecutionWorkflowService.SCENARIO_TECHNICAL_DESIGN_AUTHORING.equals(profile.getScenarioCode())
                &&(!AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType())
                ||!(AgentExecutionService.RUNTIME_CODEX_CLI.equalsIgnoreCase(agent.getRuntimeType())
                ||AgentExecutionService.RUNTIME_CLAUDE_CODE_CLI.equalsIgnoreCase(agent.getRuntimeType()))))return step+" 仅支持 Codex/Claude CLI Runtime";
        if(ExecutionWorkflowService.SCENARIO_DEVELOPMENT_IMPLEMENTATION.equals(profile.getScenarioCode())
                &&(ExecutionWorkflowService.STEP_IMPLEMENT.equals(step)||ExecutionWorkflowService.STEP_TEST.equals(step))
                &&!(AgentExecutionService.ACCESS_HTTP_API.equalsIgnoreCase(agent.getAccessType())
                ||AgentExecutionService.ACCESS_AGENT_RUNTIME.equalsIgnoreCase(agent.getAccessType())))return step+" 必须绑定可真实执行的 Agent";
        return null;
    }
    private ExecutionOrchestrationProfileEntity requireProfile(Long id){return profileRepository.findById(id).orElseThrow(()->new NoSuchElementException("编排配置不存在: "+id));}
    private ExecutionOrchestrationVersionEntity requireVersion(Long id){return versionRepository.findById(id).orElseThrow(()->new NoSuchElementException("编排版本不存在: "+id));}
    private void requireDraft(ExecutionOrchestrationVersionEntity v){if(!"DRAFT".equals(v.getStatus()))throw new IllegalArgumentException("只有草稿版本允许修改或删除");}
    private ProjectEntity requireProject(Long id){if(projectRepository==null)throw new IllegalStateException("项目仓库未配置");return projectRepository.findById(id).orElseThrow(()->new NoSuchElementException("项目不存在: "+id));}
    private UserEntity currentUser(){if(userRepository==null)return null;Long id=AuthContextHolder.get().map(AuthContext::userId).orElse(null);return id==null?null:userRepository.findById(id).orElse(null);}
    private Long projectId(ExecutionOrchestrationProfileEntity p){return p.getProject()==null?null:p.getProject().getId();}
    private String normalizeScope(String scope){String value=normalize(scope);if(!SCOPE_PLATFORM.equals(value)&&!SCOPE_PROJECT.equals(value))throw new IllegalArgumentException("scopeType 仅支持 PLATFORM 或 PROJECT");return value;}
    private void requireManage(String scope,Long projectId){AuthContext auth=AuthContextHolder.get().orElseThrow(()->new ForbiddenException("未登录"));if(auth.hasPermission("execution:orchestration:manage"))return;if(SCOPE_PROJECT.equals(scope)&&auth.hasPermission("project:manage")){projectDataPermissionService.requireProjectEditable(requireProject(projectId));return;}throw new ForbiddenException("无权维护执行编排");}
}
