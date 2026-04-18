package com.aiclub.platform.service.hermes.prompt;

import com.aiclub.platform.dto.CurrentUserInfo;
import com.aiclub.platform.dto.HermesGroundingState;
import com.aiclub.platform.dto.HermesGroundingTarget;
import com.aiclub.platform.dto.HermesReferenceSummary;
import com.aiclub.platform.dto.request.HermesChatRequest;
import com.aiclub.platform.service.HermesContextAssembler;

import java.util.List;

/**
 * Hermes Skill 匹配与渲染时使用的只读上下文。
 * 第一版只暴露命中判断和提示词拼装必需的信息，避免 Skill 直接依赖外部服务。
 */
public record HermesSkillContext(
        CurrentUserInfo currentUser,
        HermesContextAssembler.HermesConversationContext conversationContext,
        HermesChatRequest request,
        HermesGroundingState groundingState,
        String sessionToken
) {

    /**
     * 统一返回当前场景编码，便于 Skill 结合 route/scene 做匹配。
     */
    public String sceneCode() {
        return conversationContext == null || conversationContext.sceneCode() == null
                ? ""
                : conversationContext.sceneCode().trim();
    }

    /**
     * 返回用户当前问题，默认做去空处理。
     */
    public String question() {
        return request == null || request.question() == null ? "" : request.question().trim();
    }

    /**
     * 返回上下文引用对象，供 Skill 从业务对象类型判断是否命中。
     */
    public List<HermesReferenceSummary> references() {
        return conversationContext == null || conversationContext.references() == null
                ? List.of()
                : conversationContext.references();
    }

    /**
     * 判断当前是否已有指定类型的引用对象。
     */
    public boolean hasReferenceType(String type) {
        if (type == null || type.isBlank()) {
            return false;
        }
        return references().stream().anyMatch(reference -> type.equalsIgnoreCase(reference.type()));
    }

    /**
     * 判断当前是否已有指定实体类型的 grounding 绑定。
     */
    public boolean hasGroundingEntityType(String entityType) {
        if (entityType == null || entityType.isBlank() || groundingState == null || groundingState.boundSlots().isEmpty()) {
            return false;
        }
        return groundingState.boundSlots().values().stream()
                .map(HermesGroundingTarget::entityType)
                .anyMatch(type -> entityType.equalsIgnoreCase(type));
    }
}
