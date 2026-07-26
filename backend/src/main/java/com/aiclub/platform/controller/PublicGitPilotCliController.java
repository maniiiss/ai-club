package com.aiclub.platform.controller;

import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.config.GitPilotCliProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * GitPilot CLI 公开元信息，供公众端专题页拼接一键安装命令，无需登录。
 * 业务意图：把可配置的下载基础地址暴露给公众端，避免在页面硬编码生产域名。
 */
@RestController
@RequestMapping("/api/public/gitpilot-cli")
public class PublicGitPilotCliController {

    private final GitPilotCliProperties properties;

    public PublicGitPilotCliController(GitPilotCliProperties properties) {
        this.properties = properties;
    }

    /** 返回下载基础地址（PLATFORM_GITPILOT_CLI_DOWNLOAD_BASE_URL），公众端据此拼接 install 命令；为空时前端回退到当前访问域名。 */
    @GetMapping("/info")
    public ApiResponse<GitPilotCliInfo> info() {
        return ApiResponse.success(new GitPilotCliInfo(properties.downloadBaseUrl()));
    }

    /** CLI 下载元信息。 */
    public record GitPilotCliInfo(String downloadBaseUrl) {}
}
