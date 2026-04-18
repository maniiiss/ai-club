package com.aiclub.platform.service.hermes.prompt;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 统一加载 Hermes Prompt 相关 Markdown 资源。
 * 资源文件缺失时直接抛错，避免生产环境静默退化回旧的硬编码提示词。
 */
@Component
public class HermesPromptResourceLoader {

    private final Map<String, String> cache = new ConcurrentHashMap<>();

    /**
     * 按 UTF-8 读取 classpath 下的 Markdown 资源，并缓存结果。
     */
    public String readRequiredMarkdown(String classpathLocation) {
        if (classpathLocation == null || classpathLocation.isBlank()) {
            throw new IllegalArgumentException("Hermes Prompt 资源路径不能为空");
        }
        return cache.computeIfAbsent(classpathLocation.trim(), this::loadMarkdown);
    }

    private String loadMarkdown(String classpathLocation) {
        ClassPathResource resource = new ClassPathResource(classpathLocation);
        if (!resource.exists()) {
            throw new IllegalStateException("Hermes Prompt 资源不存在: " + classpathLocation);
        }
        try {
            return StreamUtils.copyToString(resource.getInputStream(), StandardCharsets.UTF_8).trim();
        } catch (IOException exception) {
            throw new IllegalStateException("读取 Hermes Prompt 资源失败: " + classpathLocation, exception);
        }
    }
}
