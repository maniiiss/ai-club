package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

/**
 * 触发对比测试运行的请求体。
 *
 * <p>nameSuffix 可选：当传入时，run 的快照 name = config.name + nameSuffix，
 * 便于用户在历史中标记一次性场景（如"-上线前"、"-压测对照"）。空时直接使用 config.name。</p>
 */
public record ModelBenchmarkRunTriggerRequest(
        @Size(max = 64, message = "name 后缀最长 64 字符") String nameSuffix
) {
}
