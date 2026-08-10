package com.aiclub.platform.service;

import com.aiclub.platform.config.GitPilotWorkResearchProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;

import static org.junit.jupiter.api.Assertions.assertThrows;

class GitPilotWorkResearchServiceTest {

    @Test
    void rejectsBlankQueryBeforeCallingExternalResearchProvider() {
        var service = new GitPilotWorkResearchService(
                new GitPilotWorkResearchProperties(false, "https://api.tavily.com/search", "", 15, 5),
                new StringRedisTemplate(),
                new ObjectMapper());

        assertThrows(IllegalArgumentException.class, () -> service.search(1L, " "));
    }

    @Test
    void keepsResearchClosedUntilAdministratorConfiguresProvider() {
        var service = new GitPilotWorkResearchService(
                new GitPilotWorkResearchProperties(false, "https://api.tavily.com/search", "", 15, 5),
                new StringRedisTemplate(),
                new ObjectMapper());

        assertThrows(IllegalStateException.class, () -> service.search(1L, "AI 工作流"));
    }
}
