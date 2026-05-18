package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ProjectGitlabBindingEntity;
import com.aiclub.platform.domain.model.TestCaseEntity;
import com.aiclub.platform.domain.model.TestCaseStepEntity;
import com.aiclub.platform.domain.model.TestPlanEntity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * V1 脚本生成走模板主线：
 * 平台根据测试计划中的可自动化用例生成固定目录下的 Playwright 资产，
 * 后续如果宿主环境接入 Playwright MCP，再增强页面理解与 locator 修复能力。
 */
@Service
public class TestAutomationScriptTemplateService {

    /**
     * 业务意图：模板生成与 RUN_ONLY 前置校验需要使用同一组仓库路径，
     * 抽出常量后避免两边路径漂移导致脚本生成位置和校验位置不一致。
     */
    public static final String AUTOMATION_ROOT = ".ai-club/automation/playwright";
    public static final String CONFIG_PATH = AUTOMATION_ROOT + "/playwright.config.ts";
    public static final String MANIFEST_PATH = AUTOMATION_ROOT + "/ai-club.manifest.json";

    /**
     * 当前测试计划在仓库内对应的 spec 路径，命名规则与生成脚本保持一致。
     */
    public static String specPathFor(Long planId) {
        return AUTOMATION_ROOT + "/plans/" + planSlugFor(planId) + ".spec.ts";
    }

    public static String planSlugFor(Long planId) {
        return "test-plan-" + planId;
    }

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper objectMapper;
    private final TestAutomationProfileService profileService;

    public TestAutomationScriptTemplateService(ObjectMapper objectMapper,
                                               TestAutomationProfileService profileService) {
        this.objectMapper = objectMapper;
        this.profileService = profileService;
    }

    public GeneratedScriptBundle generate(TestPlanEntity plan,
                                          ProjectGitlabBindingEntity binding,
                                          TestAutomationProfileService.AutomationProfile profile,
                                          String targetBranch,
                                          String generatedBranch,
                                          List<TestCaseEntity> automatedCases) {
        if (automatedCases.isEmpty()) {
            throw new IllegalArgumentException("当前测试计划没有可自动化的 Playwright 用例");
        }

        String planSlug = planSlugFor(plan.getId());
        String configPath = CONFIG_PATH;
        String specPath = specPathFor(plan.getId());
        String manifestPath = MANIFEST_PATH;

        Map<String, String> files = new LinkedHashMap<>();
        files.put(configPath, buildPlaywrightConfig());
        files.put(specPath, buildSpecFile(plan, profile, automatedCases));
        files.put(manifestPath, buildManifest(plan, binding, automatedCases, targetBranch, generatedBranch, planSlug, configPath, specPath));
        return new GeneratedScriptBundle(planSlug, configPath, specPath, manifestPath, files, automatedCases.size());
    }

    private String buildPlaywrightConfig() {
        return """
                import { defineConfig } from '@playwright/test'
                import path from 'node:path'

                const planSlug = process.env.AI_CLUB_TEST_PLAN_SLUG || 'default'
                const artifactRoot = path.resolve(process.cwd(), '.ai-club/automation/playwright')

                export default defineConfig({
                  timeout: 30_000,
                  testDir: '.',
                  outputDir: path.join(artifactRoot, 'test-results', planSlug),
                  reporter: [
                    ['line'],
                    ['json', { outputFile: path.join(artifactRoot, 'results', `${planSlug}.json`) }],
                    ['html', { outputFolder: path.join(artifactRoot, 'reports', planSlug), open: 'never' }]
                  ],
                  use: {
                    baseURL: process.env.AI_CLUB_BASE_URL || 'http://127.0.0.1:3000',
                    trace: 'retain-on-failure',
                    screenshot: 'only-on-failure',
                    video: 'off'
                  }
                })
                """;
    }

    private String buildSpecFile(TestPlanEntity plan,
                                 TestAutomationProfileService.AutomationProfile profile,
                                 List<TestCaseEntity> automatedCases) {
        List<Map<String, Object>> casePayload = new ArrayList<>();
        String defaultReadySelector = profileService.resolveReadySelector(profile);
        String defaultPath = profileService.resolveDefaultPath(profile);
        for (TestCaseEntity testCase : automatedCases) {
            Map<String, String> hintMap = parseAutomationHint(testCase.getAutomationHint());
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("id", testCase.getId());
            item.put("title", defaultString(testCase.getTitle()).trim());
            item.put("moduleName", defaultString(testCase.getModuleName()).trim());
            item.put("priority", defaultString(testCase.getPriority()).trim());
            item.put("path", resolveHintValue(hintMap, defaultPath, "path", "页面路径", "路径"));
            item.put("readySelector", resolveHintValue(hintMap, defaultReadySelector, "readySelector", "就绪选择器", "页面就绪选择器"));
            item.put("assertText", resolveHintValue(hintMap, "", "assertText", "断言文本", "断言内容"));
            item.put("precondition", defaultString(testCase.getPrecondition()).trim());
            item.put("automationHint", defaultString(testCase.getAutomationHint()).trim());
            List<Map<String, Object>> stepPayload = new ArrayList<>();
            for (TestCaseStepEntity step : testCase.getSteps()) {
                stepPayload.add(Map.of(
                        "stepNo", step.getStepNo(),
                        "action", defaultString(step.getAction()).trim(),
                        "expectedResult", defaultString(step.getExpectedResult()).trim()
                ));
            }
            item.put("steps", stepPayload);
            casePayload.add(item);
        }

        try {
            return """
                    import { test, expect } from '@playwright/test'

                    const generatedCases = %s as Array<{
                      id: number | null
                      title: string
                      moduleName: string
                      priority: string
                      path: string
                      readySelector: string
                      assertText: string
                      precondition: string
                      automationHint: string
                      steps: Array<{ stepNo: number; action: string; expectedResult: string }>
                    }>

                    test.describe(%s, () => {
                      for (const item of generatedCases) {
                        test(`[用例#${item.id ?? 'draft'}] ${item.title}`, async ({ page }) => {
                          // 业务意图：平台模板生成的是仓库级占位自动化脚本，
                          // 对 SPA 项目优先等到 DOM 就绪即可，避免首页资源长连接把 load 事件无限拖长。
                          await page.goto(item.path || '/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

                          if (item.readySelector) {
                            await page.locator(item.readySelector).first().waitFor({ state: 'visible' })
                          }

                          if (item.assertText) {
                            await expect(page.getByText(item.assertText, { exact: false })).toBeVisible()
                          }

                          test.info().annotations.push(
                            { type: 'module', description: item.moduleName || '-' },
                            { type: 'priority', description: item.priority || '-' },
                            { type: 'precondition', description: item.precondition || '-' },
                            { type: 'automationHint', description: item.automationHint || '-' },
                            { type: 'steps', description: item.steps.map((step) => `${step.stepNo}. ${step.action} => ${step.expectedResult}`).join(' | ') || '-' }
                          )
                        })
                      }
                    })
                    """.formatted(
                    objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(casePayload),
                    toJavascriptString(defaultString(plan.getName()).trim())
            );
        } catch (Exception exception) {
            throw new IllegalStateException("生成 Playwright 测试脚本失败", exception);
        }
    }

    private String buildManifest(TestPlanEntity plan,
                                 ProjectGitlabBindingEntity binding,
                                 List<TestCaseEntity> automatedCases,
                                 String targetBranch,
                                 String generatedBranch,
                                 String planSlug,
                                 String configPath,
                                 String specPath) {
        List<Map<String, Object>> cases = new ArrayList<>();
        for (TestCaseEntity item : automatedCases) {
            cases.add(Map.of(
                    "id", item.getId(),
                    "title", defaultString(item.getTitle()).trim(),
                    "moduleName", defaultString(item.getModuleName()).trim(),
                    "automationHint", defaultString(item.getAutomationHint()).trim()
            ));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("version", 1);
        payload.put("generatedAt", TIME_FORMATTER.format(LocalDateTime.now()));
        payload.put("planId", plan.getId());
        payload.put("planName", defaultString(plan.getName()).trim());
        payload.put("projectId", plan.getProject().getId());
        payload.put("bindingId", binding.getId());
        payload.put("gitlabProjectRef", binding.getGitlabProjectRef());
        payload.put("gitlabProjectPath", binding.getGitlabProjectPath());
        payload.put("targetBranch", targetBranch);
        payload.put("generatedBranch", generatedBranch);
        payload.put("planSlug", planSlug);
        payload.put("configPath", configPath);
        payload.put("specPath", specPath);
        payload.put("cases", cases);
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(payload);
        } catch (Exception exception) {
            throw new IllegalStateException("生成自动化清单失败", exception);
        }
    }

    /**
     * V1 的 automationHint 支持中英文两套简单键值对：
     * 页面路径/path、就绪选择器/readySelector、断言文本/assertText。
     */
    private Map<String, String> parseAutomationHint(String rawHint) {
        Map<String, String> values = new LinkedHashMap<>();
        for (String line : defaultString(rawHint).split("\\R")) {
            String normalized = line.trim();
            if (normalized.isEmpty()) {
                continue;
            }
            int delimiterIndex = normalized.indexOf(':');
            if (delimiterIndex < 0) {
                delimiterIndex = normalized.indexOf('=');
            }
            if (delimiterIndex < 0) {
                continue;
            }
            String key = normalized.substring(0, delimiterIndex).trim();
            String value = normalized.substring(delimiterIndex + 1).trim();
            if (key.isEmpty() || value.isEmpty()) {
                continue;
            }
            values.put(key, value);
        }
        return values;
    }

    private String resolveHintValue(Map<String, String> values, String fallback, String... keys) {
        for (String key : keys) {
            String value = values.get(key);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return fallback;
    }

    private String toJavascriptString(String value) {
        return "'" + defaultString(value)
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r", "\\r")
                .replace("\n", "\\n") + "'";
    }

    private String defaultString(String value) {
        return value == null ? "" : value;
    }

    public record GeneratedScriptBundle(
            String planSlug,
            String configPath,
            String specPath,
            String manifestPath,
            Map<String, String> files,
            int automatedCaseCount
    ) {
    }
}
