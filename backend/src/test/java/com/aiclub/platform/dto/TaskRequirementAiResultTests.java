package com.aiclub.platform.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TaskRequirementAiResultTests {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldSerializeImageMetadataAndReadLegacyResultWithoutImages() throws Exception {
        TaskRequirementAiResult result = new TaskRequirementAiResult(
                "STANDARDIZE",
                "标准化需求",
                "![单行展示](https://example.com/demo.png)",
                9L,
                "主模型",
                List.of(),
                List.of(),
                List.of(new RequirementAiResultImage(
                        501L,
                        "image/png",
                        "单行展示",
                        "demo.png",
                        1,
                        "原型参考",
                        "/api/common/public-files/501?inline=true"
                ))
        );

        String json = objectMapper.writeValueAsString(result);
        assertThat(json).contains("\"images\"").contains("\"assetId\":501");

        TaskRequirementAiResult legacy = objectMapper.readValue("""
                {"action":"STANDARDIZE","title":"标准化需求","markdown":"# 旧结果",
                 "modelConfigId":9,"modelConfigName":"主模型","taskSuggestions":[],"testCaseSuggestions":[]}
                """, TaskRequirementAiResult.class);
        assertThat(legacy.images()).isEmpty();
    }
}
