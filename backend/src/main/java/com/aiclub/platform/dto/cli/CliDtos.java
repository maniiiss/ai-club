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
            String openaiApiMode
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
}
