package com.aiclub.platform.dto;

/**
 * 返回给前端的 GitLab OAuth 授权跳转链接。
 */
public record GitlabUserOauthAuthorizeResult(String authorizeUrl) {
}
