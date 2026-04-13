package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * 个人中心发起 GitLab OAuth 授权时提交的请求体。
 */
public record GitlabUserOauthAuthorizeRequest(
        @Size(max = 255, message = "GitLab API 地址长度不能超过255")
        String apiBaseUrl
) {
}
