package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * 模型对比测试配置更新请求。字段集与创建相同。
 *
 * <p>编辑会被 service 校验：若该 config 存在 PENDING/RUNNING 的 run，
 * 接口返回 409，提示先取消运行后再编辑，避免污染正在采样的指标。</p>
 */
public record ModelBenchmarkConfigUpdateRequest(
        @Size(max = 160) String name,

        @NotEmpty(message = "至少需要选择一个模型")
        @Size(max = 8, message = "单次对比模型数量不超过 8 个")
        List<@NotNull Long> modelIds,

        @NotNull
        @Min(value = 1, message = "并发数最小为 1")
        @Max(value = 64, message = "并发数最大为 64")
        Integer concurrency,

        @NotNull
        @Min(value = 1, message = "请求总数最小为 1")
        @Max(value = 500, message = "请求总数最大为 500")
        Integer totalRequests,

        Boolean streamEnabled,

        @Min(value = 16, message = "max_tokens 不应低于 16")
        @Max(value = 8192, message = "max_tokens 不应高于 8192")
        Integer maxTokens,

        @Size(max = 4000) String systemPrompt,

        @Size(max = 4000) String userPrompt
) {
}
