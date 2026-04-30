package com.aiclub.platform.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class RequirementDocumentUtilsTests {

    @Test
    void shouldConvertCompleteGiteeTemplateToSystemTemplate() {
        String converted = RequirementDocumentUtils.convertFromGiteeTemplate("""
                # 1  功能点

                支持用户创建需求

                # 2  流程图

                flowchart

                # 3  原型

                prototype

                # 4  非功能需求

                响应时间不超过 2 秒
                """);

        assertThat(converted).isEqualTo("""
                # 用户故事

                待补充用户故事

                # 需求描述

                ## 功能点

                支持用户创建需求

                ## 流程图

                flowchart

                ## 原型

                prototype

                ## 非功能需求

                响应时间不超过 2 秒

                # 验收标准

                待补充验收标准
                """.trim());
        assertThatCode(() -> RequirementDocumentUtils.validateForSubmit(converted)).doesNotThrowAnyException();
    }

    @Test
    void shouldUsePlaceholdersWhenGiteeTemplateSectionsAreMissing() {
        String converted = RequirementDocumentUtils.convertFromGiteeTemplate("""
                # 1  功能点

                仅保留功能点
                """);

        assertThat(converted).isEqualTo("""
                # 用户故事

                待补充用户故事

                # 需求描述

                ## 功能点

                仅保留功能点

                # 验收标准

                待补充验收标准
                """.trim());
        assertThatCode(() -> RequirementDocumentUtils.validateForSubmit(converted)).doesNotThrowAnyException();
    }

    @Test
    void shouldRecognizeGiteeTemplateHeadings() {
        assertThat(RequirementDocumentUtils.matchesGiteeTemplateHeadings("""
                # 1  功能点

                A
                """)).isTrue();
        assertThat(RequirementDocumentUtils.matchesGiteeTemplateHeadings("""
                ## 用户故事

                A
                """)).isFalse();
    }
}
