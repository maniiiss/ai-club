package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * GitLab OAuth 回调时由前端转发给后端的授权码与 state。
 */
public record GitlabUserOauthCallbackRequest(
        @NotBlank(message = "授权码不能为空")
        @Size(max = 1000, message = "授权码长度不能超过1000")
        String code,
        @NotBlank(message = "state 不能为空")
        @Size(max = 2000, message = "state 长度不能超过2000")
        String state
) {
}
