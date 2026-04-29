package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 统一解析 GitLab 绑定里的自动化测试配置。
 * V1 只支持面向 Web 前端项目的 Playwright 自动化，因此这里会拦截纯 BACKEND 配置。
 */
@Service
public class TestAutomationProfileService {

    private final ObjectMapper objectMapper;

    public TestAutomationProfileService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public AutomationProfile resolveProfile(ProjectGitlabBindingEntity binding) {
        if (binding == null) {
            throw new IllegalArgumentException("自动化测试缺少 GitLab 仓库绑定");
        }
        try {
            JsonNode root = hasText(binding.getTestProfileJson())
                    ? objectMapper.readTree(binding.getTestProfileJson())
                    : objectMapper.createObjectNode();
            String repoKind = normalizeRepoKind(root.path("repoKind").asText(""));
            if ("BACKEND".equals(repoKind)) {
                throw new IllegalArgumentException("当前仓库绑定仅声明为 BACKEND，暂不支持 Playwright 项目自动化");
            }
            return new AutomationProfile(
                    repoKind,
                    trimToNull(root.path("workingDir").asText("")),
                    trimToNull(root.path("packageManager").asText("")),
                    trimToNull(root.path("startCommand").asText("")),
                    trimToNull(root.path("baseUrl").asText("")),
                    trimToNull(root.path("readySelector").asText("")),
                    readStringList(root.path("smokePaths"))
            );
        } catch (IllegalArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalArgumentException("GitLab 绑定中的 testProfileJson 不是合法 JSON", exception);
        }
    }

    public String resolveReadySelector(AutomationProfile profile) {
        return hasText(profile.readySelector()) ? profile.readySelector().trim() : "body";
    }

    public String resolveDefaultPath(AutomationProfile profile) {
        if (profile.smokePaths() != null) {
            for (String item : profile.smokePaths()) {
                String normalized = trimToNull(item);
                if (normalized != null) {
                    return normalized;
                }
            }
        }
        return "/";
    }

    private List<String> readStringList(JsonNode node) {
        List<String> values = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return values;
        }
        for (JsonNode item : node) {
            String normalized = trimToNull(item.asText(""));
            if (normalized != null) {
                values.add(normalized);
            }
        }
        return values;
    }

    private String normalizeRepoKind(String value) {
        String normalized = trimToNull(value);
        return normalized == null ? "" : normalized.toUpperCase();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    public record AutomationProfile(
            String repoKind,
            String workingDir,
            String packageManager,
            String startCommand,
            String baseUrl,
            String readySelector,
            List<String> smokePaths
    ) {
    }
}
