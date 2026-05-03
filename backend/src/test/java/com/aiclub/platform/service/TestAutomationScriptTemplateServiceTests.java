package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectEntity;
import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestCaseStepEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TestAutomationScriptTemplateServiceTests {

    @Test
    void shouldGenerateSpaFriendlyPlaywrightAssetsWithStableArtifactPaths() {
        TestAutomationProfileService profileService = new TestAutomationProfileService(new ObjectMapper());
        TestAutomationScriptTemplateService templateService = new TestAutomationScriptTemplateService(new ObjectMapper(), profileService);

        ProjectEntity project = new ProjectEntity();
        project.setId(11L);

        TestPlanEntity plan = new TestPlanEntity();
        plan.setId(1L);
        plan.setName("自动化模板测试计划");
        plan.setProject(project);

        ProjectGitlabBindingEntity binding = new ProjectGitlabBindingEntity();
        binding.setId(2L);
        binding.setGitlabProjectRef("group/demo");
        binding.setGitlabProjectPath("group/demo");

        TestCaseStepEntity step = new TestCaseStepEntity();
        step.setStepNo(1);
        step.setAction("打开首页");
        step.setExpectedResult("页面成功展示");

        TestCaseEntity testCase = new TestCaseEntity();
        testCase.setId(31L);
        testCase.setTitle("示例自动化用例");
        testCase.setModuleName("项目团队");
        testCase.setPriority("P0");
        testCase.setSteps(List.of(step));

        TestAutomationScriptTemplateService.GeneratedScriptBundle bundle = templateService.generate(
                plan,
                binding,
                new TestAutomationProfileService.AutomationProfile("FRONTEND", "frontend", "pnpm", "pnpm dev", "", "body", List.of("/")),
                "deploy",
                "ai-club/test-automation/plan-1-run-1",
                List.of(testCase)
        );

        String configText = bundle.files().get(bundle.configPath());
        String specText = bundle.files().get(bundle.specPath());

        assertThat(configText).contains("const artifactRoot = path.resolve(process.cwd(), '.ai-club/automation/playwright')");
        assertThat(configText).contains("path.join(artifactRoot, 'results', `${planSlug}.json`)");
        assertThat(configText).contains("path.join(artifactRoot, 'reports', planSlug)");
        assertThat(configText).contains("path.join(artifactRoot, 'test-results', planSlug)");
        assertThat(specText).contains("waitUntil: 'domcontentloaded'");
        assertThat(specText).contains("timeout: 60_000");
    }
}
