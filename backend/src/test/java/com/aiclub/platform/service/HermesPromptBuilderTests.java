package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.service.hermes.prompt.ExecutionTaskQueryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.IterationReleaseSummaryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.HermesPromptResourceLoader;
import com.aiclub.platform.service.hermes.prompt.RepoScanHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WikiQaHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WorkItemCreateHermesPromptSkill;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 验证 Hermes Prompt 已切换到“基础规则 + 按需 Skill”的装配模式。
 */
class HermesPromptBuilderTests {

    /**
     * Wiki 页面场景应命中 wiki-qa Skill，并继续保留基础安全规则。
     */
    @Test
    void shouldIncludeWikiSkillAndBaseRulesForWikiScene() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "wiki-space-page",
                null,
                null,
                8L,
                15L,
                "知识管理员",
                List.of(
                        new HermesReferenceSummary("WIKI_SPACE", 8L, "平台知识库", "/wiki/spaces/8"),
                        new HermesReferenceSummary("WIKI_PAGE", 15L, "登录说明", "/wiki/spaces/8/pages/15")
                ),
                List.of("帮我总结当前 Wiki 页面"),
                "Wiki 页面上下文"
        );

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                context,
                new HermesChatRequest("帮我总结当前页", "wiki-space-page", null, null, null, null, 8L, 15L, "client-1", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("当前轮唯一有效的 `system_session_token` 是：`hcs_test_token`")
                .contains("## 当前已启用 Skills")
                .contains("### Skill: wiki-qa")
                .contains("不要直接声称平台不支持访问 Wiki");
        assertThat(prompt.userPrompt())
                .contains("当前路由：wiki-space-page")
                .contains("Wiki 页面上下文");
    }

    /**
     * 创建需求类问题应命中工作项创建 Skill，指导模型优先走项目/成员解析与草稿创建流程。
     */
    @Test
    void shouldMatchWorkItemCreateSkillForCreateQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();
        HermesContextAssembler.HermesConversationContext context = new HermesContextAssembler.HermesConversationContext(
                "project",
                12L,
                null,
                "项目经理",
                List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                List.of(),
                "项目上下文"
        );

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                context,
                new HermesChatRequest("帮我创建一个需求并指派给张三", "project-iterations", 12L, null, null, null, null, null, "client-2", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("### Skill: work-item-create")
                .contains("若项目未绑定，先调用 `mcp_git_ai_club_project_search` 搜索项目")
                .contains("调用 `mcp_git_ai_club_work_item_create_draft` 生成草稿");
    }

    /**
     * 仓库扫描请求应命中 repo-scan Skill，保留规则集确认与默认规则集约束。
     */
    @Test
    void shouldMatchRepoScanSkillForScanQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("帮我用默认规则集扫描这个仓库", "project-iterations", 12L, null, null, null, null, null, "client-3", null, false),
                HermesGroundingState.empty().withBoundSlot(
                        "gitlabBinding",
                        new HermesGroundingTarget("gitlabBinding", "GITLAB_BINDING", 31L, "git-ai-club/backend", "", 12L, "TEST", Map.of())
                ),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("### Skill: repo-scan")
                .contains("如果规则集还不明确，先列出规则集或追问确认")
                .contains("用户明确说“使用默认规则集”");
    }

    /**
     * 执行任务结果查询应命中 execution-task-query Skill。
     */
    @Test
    void shouldMatchExecutionTaskQuerySkillForExecutionQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("帮我看一下刚才那个扫描结果和执行日志", "project-iterations", 12L, null, null, null, null, null, "client-4", null, false),
                HermesGroundingState.empty().withBoundSlot(
                        "executionTask",
                        new HermesGroundingTarget("executionTask", "EXECUTION_TASK", 88L, "后端规范扫描", "", 12L, "TEST", Map.of())
                ),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("### Skill: execution-task-query")
                .contains("优先组合使用 `repo_scan.search`、`execution_task.search` 和 `execution_task.get_detail`");
    }

    /**
     * 普通泛问答不应误命中业务 Skill，但基础规则与空 Skill 提示仍应保留。
     */
    @Test
    void shouldKeepBasePromptOnlyForGenericQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "dashboard",
                        null,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("GLOBAL", null, "全局工作台", "/dashboard")),
                        List.of(),
                        "首页上下文"
                ),
                new HermesChatRequest("我今天最该推进什么", "dashboard", null, null, null, null, null, null, "client-5", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("回答和思考都必须使用中文。")
                .contains("需要展示思考过程时，必须用 `<think>...</think>` 包裹")
                .contains("当前未命中额外业务 Skill")
                .doesNotContain("### Skill: wiki-qa")
                .doesNotContain("### Skill: work-item-create")
                .doesNotContain("### Skill: repo-scan")
                .doesNotContain("### Skill: execution-task-query");
    }

    /**
     * 当上层已经召回到记忆与 Wiki 证据时，PromptBuilder 应把这段上下文和当前轮输入一起注入 user prompt。
     */
    @Test
    void shouldIncludeHindsightMemoryAndCurrentTurnContentInUserPrompt() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("继续分析这个项目的发布风险", "project-iterations", 12L, null, null, null, null, null, "client-6", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token",
                "继续分析这个项目的发布风险\n\n请重点关注巴黎和柏林的讨论记录。",
                "### Hindsight 记忆\n- 你之前提过巴黎和柏林需要一起评估发布时间。\n\n### Wiki 知识证据\n- Paris and Berlin are often discussed together.（来源：Wiki 知识库）"
        );

        assertThat(prompt.userPrompt())
                .contains("当前可参考的记忆与 Wiki 知识证据")
                .contains("Paris and Berlin are often discussed together.")
                .contains("用户当前输入：")
                .contains("请重点关注巴黎和柏林的讨论记录。");
    }

    /**
     * 当前路由已锚定迭代时，user prompt 应显式告诉 Hermes “当前迭代”就是这个 iterationId。
     */
    @Test
    void shouldIncludeIterationAnchorInUserPrompt() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project-iterations",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations")),
                        List.of(),
                        "迭代上下文"
                ),
                new HermesChatRequest("帮我总结当前迭代发版内容", "project-iterations", 12L, null, 35L, null, null, null, "client-7", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.userPrompt())
                .contains("iterationId：35")
                .contains("如果用户说“当前迭代 / 这个迭代 / 本迭代”")
                .contains("不要再次搜索确认当前迭代");
    }

    /**
     * 当前迭代发版总结问题应命中迭代汇总 Skill，引导模型优先读取当前迭代集合事实而不是单工作项详情。
     */
    @Test
    void shouldMatchIterationReleaseSummarySkillForIterationSummaryQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project-iterations",
                        12L,
                        null,
                        "项目经理",
                        List.of(
                                new HermesReferenceSummary("PROJECT", 12L, "支付项目", "/projects/12/iterations"),
                                new HermesReferenceSummary("ITERATION", 35L, "2026.04 发版迭代", "/projects/12/iterations?iterationId=35")
                        ),
                        List.of(),
                        "迭代上下文"
                ),
                new HermesChatRequest("帮我总结当前迭代发版内容，修复了多少缺陷，开发了哪些需求", "project-iterations", 12L, null, 35L, null, null, null, "client-8", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("### Skill: iteration-release-summary")
                .contains("优先调用 `project.get_iteration_detail`")
                .contains("不要把“当前迭代工作项集合”误判成需要用户确认单个对象");
    }

    /**
     * 资源文件缺失时应直接失败，避免运行时无感知地丢失关键 Prompt 片段。
     */
    @Test
    void shouldFailWhenPromptResourceMissing() {
        HermesPromptResourceLoader resourceLoader = new HermesPromptResourceLoader();

        assertThatThrownBy(() -> resourceLoader.readRequiredMarkdown("prompts/hermes/skills/not-exists.md"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Hermes Prompt 资源不存在");
    }

    private HermesPromptBuilder createPromptBuilder() {
        HermesPromptResourceLoader resourceLoader = new HermesPromptResourceLoader();
        return new HermesPromptBuilder(
                resourceLoader,
                List.of(
                        new WikiQaHermesPromptSkill(resourceLoader),
                        new IterationReleaseSummaryHermesPromptSkill(resourceLoader),
                        new WorkItemCreateHermesPromptSkill(resourceLoader),
                        new RepoScanHermesPromptSkill(resourceLoader),
                        new ExecutionTaskQueryHermesPromptSkill(resourceLoader)
                )
        );
    }

    private CurrentUserInfo currentUser() {
        return new CurrentUserInfo(
                1L,
                "wiki-user",
                "知识管理员",
                "wiki@example.com",
                "",
                "wiki-user",
                "",
                true,
                List.of("SUPER_ADMIN"),
                List.of("超级管理员"),
                List.of("hermes:chat", "wiki:view", "project:view", "task:view", "task:manage")
        );
    }
}
