package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 代码结构局部查询请求。
 */
public record GitlabCodeStructureQueryRequest(
        @NotBlank(message = "分支不能为空")
        @Size(max = 120, message = "分支长度不能超过 120")
        String branch,
        @NotBlank(message = "查询关键词不能为空")
        @Size(min = 2, max = 200, message = "查询关键词长度需在 2 到 200 之间")
        String query
) {
}
