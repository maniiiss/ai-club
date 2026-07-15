package com.aiclub.platform.service;

import com.aiclub.platform.dto.AssistantConversationContextState;
import com.aiclub.platform.dto.AssistantConversationTurn;
import com.aiclub.platform.runtime.CompactionStrategy;
import com.aiclub.platform.runtime.RuntimeContextProfile;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** 验证 GitPilot 长对话预算、摘要和结构化确认事实不会互相覆盖。 */
class AssistantConversationContextServiceTests {

    private final AssistantConversationContextService service = new AssistantConversationContextService();

    @Test
    void compactsOldTurnsAndKeepsRecentMessages() {
        String longContext = " CRM项目 代码扫描上下文 ".repeat(80);
        List<AssistantConversationTurn> transcript = List.of(
                AssistantConversationTurn.user("第一轮讨论 CRM 项目" + longContext),
                AssistantConversationTurn.assistant("项目候选是 CRM项目和 Agent Ops" + longContext),
                AssistantConversationTurn.user("第二轮确认分支 deploy" + longContext),
                AssistantConversationTurn.assistant("已记录 deploy 分支" + longContext),
                AssistantConversationTurn.user("继续查看仓库" + longContext),
                AssistantConversationTurn.assistant("请确认具体仓库" + longContext),
                AssistantConversationTurn.user("补充仓库背景信息一" + longContext),
                AssistantConversationTurn.assistant("仓库背景信息一" + longContext),
                AssistantConversationTurn.user("补充仓库背景信息二" + longContext),
                AssistantConversationTurn.assistant("仓库背景信息二" + longContext)
        );
        RuntimeContextProfile profile = new RuntimeContextProfile(180, 40, 80, CompactionStrategy.BACKEND_FALLBACK);

        AssistantConversationContextService.ContextPreparation result = service.prepare(
                transcript, AssistantConversationContextState.empty(), profile);

        assertThat(result.state().summary()).contains("CRM");
        assertThat(result.outboundTranscript()).isNotEmpty();
        assertThat(result.state().version()).isEqualTo(1);
    }

    @Test
    void extractsBranchAndProjectCandidatesFromNaturalLanguageConfirmation() {
        AssistantConversationContextState result = service.updateAfterTurn(
                AssistantConversationContextState.empty(),
                "需要 deploy 分支",
                "目前可选项目：\n1. CRM项目（ID: 4）\n2. Agent Ops（ID: 1）\n请确认项目和分支",
                4L,
                "CRM项目"
        );

        assertThat(result.facts()).containsEntry("projectId", 4L).containsEntry("branch", "deploy");
        assertThat(result.facts()).containsKey("projectCandidates");
        assertThat(result.pendingClarification()).contains("请确认项目和分支");
    }
}
