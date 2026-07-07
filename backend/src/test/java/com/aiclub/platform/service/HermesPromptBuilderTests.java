package com.aiclub.platform.service;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.service.hermes.prompt.ExecutionTaskQueryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.IterationReleaseSummaryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.HermesPromptResourceLoader;
import com.aiclub.platform.service.hermes.prompt.PersonalFileLibraryHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.RepoScanHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WikiQaHermesPromptSkill;
import com.aiclub.platform.service.hermes.prompt.WorkItemCreateHermesPromptSkill;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 验证 Hermes Prompt 已切换到“基础规则 + Slash 显式 Skill”的装配模式。
 */
class HermesPromptBuilderTests {

    /**
     * Wiki 页面场景应命中 wiki-qa Skill，并继续保留基础安全规则。
     */
    @Test
    void shouldIncludeWikiSkillAndBaseRulesForSlashWikiCommand() {
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
                new HermesChatRequest("帮我总结当前页", "wiki-space-page", null, null, null, null, 8L, 15L, "client-1", null, false, "/wiki"),
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
    void shouldMatchWorkItemCreateSkillOnlyForSlashCommand() {
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
                new HermesChatRequest("帮我创建一个需求并指派给张三", "project-iterations", 12L, null, null, null, null, null, "client-2", null, false, "/需求"),
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
    void shouldMatchRepoScanSkillOnlyForSlashCommand() {
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
                new HermesChatRequest("帮我用默认规则集扫描这个仓库", "project-iterations", 12L, null, null, null, null, null, "client-3", null, false, "/仓库扫描"),
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
    void shouldMatchExecutionTaskQuerySkillOnlyForSlashCommand() {
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
                new HermesChatRequest("帮我看一下刚才那个扫描结果和执行日志", "project-iterations", 12L, null, null, null, null, null, "client-4", null, false, "/执行任务"),
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
     * 个人文件库类问题应命中文件库 Skill，引导 Hermes 优先读取已上传文档证据。
     */
    @Test
    void shouldMatchPersonalFileLibrarySkillForSlashCommandAndPersonalDocumentQuestion() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt slashPrompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "CRM 项目", "/projects/12/iterations")),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("我的年终述职报告有哪些内容", "project-iterations", 12L, null, null, null, null, null, "client-file-1", null, false, "/文件库"),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(slashPrompt.systemPrompt())
                .contains("### Skill: personal-file-library")
                .contains("优先依据“个人文件库证据”回答");

        HermesPromptBuilder.HermesPrompt implicitPrompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "CRM 项目", "/projects/12/iterations")),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("我的简历里写了什么", "project-iterations", 12L, null, null, null, null, null, "client-file-2", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(implicitPrompt.systemPrompt())
                .contains("### Skill: personal-file-library")
                .contains("不要因为当前页面绑定了项目，就转去搜索项目工作项或 Wiki");
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
     * 普通问题即使包含业务关键词，也不能自动注入平台业务 Skill；必须由 Slash 命令显式唤起。
     */
    @Test
    void shouldNotAutoMatchBusinessSkillWithoutSlashCommand() {
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
                new HermesChatRequest("帮我创建一个需求并用默认规则集扫描仓库", "project-iterations", 12L, null, null, null, null, null, "client-plain", null, false),
                HermesGroundingState.empty().withBoundSlot(
                        "gitlabBinding",
                        new HermesGroundingTarget("gitlabBinding", "GITLAB_BINDING", 31L, "git-ai-club/backend", "", 12L, "TEST", Map.of())
                ),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("当前未命中额外业务 Skill")
                .doesNotContain("### Skill: work-item-create")
                .doesNotContain("### Skill: repo-scan")
                .doesNotContain("### Skill: execution-task-query")
                .doesNotContain("### Skill: wiki-qa");
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
     * 基础 Prompt 应明确项目、迭代、工作项是逐级定位链，避免集合查询误弹工作项确认。
     */
    @Test
    void shouldDescribeProjectIterationWorkItemConfirmationBoundary() {
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
                new HermesChatRequest("现在还有几个任务在进行中", "project-iterations", 12L, null, 35L, null, null, null, "client-7b", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("项目 → 迭代 → 工作项")
                .contains("只在当前缺失或存在歧义的那一级生成候选确认")
                .contains("查询工作项数量、状态、列表或汇总时不要再要求用户确认单个工作项");
    }

    /**
     * 基础 Prompt 应约束 Hermes 生成可被前端 Markdown 解析器稳定渲染的内容。
     */
    @Test
    void shouldIncludeMarkdownOutputContractInBasePrompt() {
        HermesPromptBuilder promptBuilder = createPromptBuilder();

        HermesPromptBuilder.HermesPrompt prompt = promptBuilder.buildConversationPrompt(
                currentUser(),
                new HermesContextAssembler.HermesConversationContext(
                        "project",
                        12L,
                        null,
                        "项目经理",
                        List.of(new HermesReferenceSummary("PROJECT", 12L, "CRM项目", "/projects/12/iterations")),
                        List.of(),
                        "项目上下文"
                ),
                new HermesChatRequest("帮我分析项目风险", "project", 12L, null, null, null, null, null, "client-markdown", null, false),
                HermesGroundingState.empty(),
                "hcs_test_token"
        );

        assertThat(prompt.systemPrompt())
                .contains("Markdown 输出契约")
                .contains("加粗标记 `**` 必须成对出现在同一行内")
                .contains("不要输出孤立的 `*` 或 `**`")
                .contains("表格单元格内优先使用纯文本");
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
                new HermesChatRequest("帮我总结当前迭代发版内容，修复了多少缺陷，开发了哪些需求", "project-iterations", 12L, null, 35L, null, null, null, "client-8", null, false, "/执行任务"),
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
                        new PersonalFileLibraryHermesPromptSkill(resourceLoader),
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
                List.of("hermes:chat", "wiki:view", "project:view", "task:view", "task:manage"),
                List.of()
        );
    }
}
