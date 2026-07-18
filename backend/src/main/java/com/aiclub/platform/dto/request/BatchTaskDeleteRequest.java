package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 工作项批量删除请求，保持单次操作与公众端当前页上限一致。 */
public record BatchTaskDeleteRequest(
        @NotEmpty(message = "工作项不能为空")
        @Size(max = 20, message = "一次最多删除20个工作项")
        List<@NotNull(message = "工作项ID不能为空") Long> taskIds
) {
}
