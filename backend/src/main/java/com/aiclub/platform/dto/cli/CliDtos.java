package com.aiclub.platform.dto.cli;

import com.aiclub.platform.dto.CurrentUserInfo;

import java.util.List;

/** GitPilot CLI 设备授权、模型列表和短期模型会话的传输对象集合。 */
public final class CliDtos {
    private CliDtos() {}

    public record DeviceAuthorizationResponse(
            String deviceCode,
            String userCode,
            String verificationUri,
            int expiresInSeconds,
            int intervalSeconds
    ) {}

    public record DeviceAuthorizationRequest(String clientVersion) {}
    public record DeviceTokenRequest(String deviceCode) {}
    public record DeviceApprovalResponse(String userCode, boolean approved) {}

    public record CliTokenResponse(
            String accessToken,
            String expiresAt,
            CurrentUserInfo user,
            List<String> scopes
    ) {}

    public record CliModelSummary(
            Long id,
            String name,
            String provider,
            String modelName,
            String description,
            String openaiApiMode,
            /** 模型上下文窗口长度（token），未配置时为 null，CLI 回退默认。 */
            Integer contextLength,
            /** 模型最大输出 token 数，未配置时为 null，CLI 回退默认。 */
            Integer maxOutputTokens
    ) {}

    public record ModelSessionRequest(Long modelConfigId, String clientVersion) {}

    public record ModelSessionResponse(
            String sessionId,
            String accessToken,
            String expiresAt,
            String provider,
            String modelName,
            String proxyBaseUrl
    ) {}

    /** Work 检索结果为可追溯的裁剪摘要，不泄漏第三方供应商原始响应。 */
    public record WorkResearchRequest(String query) {}
    public record WorkResearchSource(String id, String title, String url, String snippet, String publishedAt) {}
    public record WorkResearchResponse(List<WorkResearchSource> sources) {}

    /**
     * CLI 需求列表项（精简版 TaskSummary）。
     * 业务意图：去掉 prd*、collaborator*、external* 等大/无关字段，
     * 仅保留 /requirement 命令展示与“设计+开发”指令构造所需信息。
     */
    public record CliTaskSummary(
            Long id,
            String workItemCode,
            String name,
            String status,
            String priority,
            String assignee,
            String taskType,
            Long projectId,
            String projectName,
            Long iterationId,
            String iterationName,
            String planStartDate,
            String planEndDate,
            String requirementMarkdown
    ) {}
}
