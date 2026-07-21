package com.aiclub.platform.controller;

import com.aiclub.platform.service.GitPilotCliService;
import com.aiclub.platform.service.GitPilotModelProxyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 仅暴露两个受控的 provider 协议路径，避免 model session 变成任意上游代理。 */
@RestController
@RequestMapping("/api/cli/model-sessions/{sessionId}")
public class GitPilotModelProxyController {

    private final GitPilotModelProxyService proxyService;
    private final GitPilotCliService cliService;

    public GitPilotModelProxyController(GitPilotModelProxyService proxyService, GitPilotCliService cliService) {
        this.proxyService = proxyService;
        this.cliService = cliService;
    }

    @PostMapping("/chat/completions")
    public void openAi(@PathVariable String sessionId,
                       @RequestBody String body,
                       HttpServletRequest request,
                       HttpServletResponse response) {
        proxyService.stream(sessionId, credential(request), "chat/completions", body, request, response);
    }

    @PostMapping("/messages")
    public void anthropic(@PathVariable String sessionId,
                          @RequestBody String body,
                          HttpServletRequest request,
                          HttpServletResponse response) {
        proxyService.stream(sessionId, credential(request), "messages", body, request, response);
    }

    private String credential(HttpServletRequest request) {
        String authorization = request.getHeader("Authorization");
        return cliService.normalizeAuthorization(authorization == null || authorization.isBlank() ? request.getHeader("x-api-key") : authorization);
    }
}
