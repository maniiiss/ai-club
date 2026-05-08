package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * PR 评审统计查询请求。
 */
public record PrReviewStatsQueryRequest(
        @NotBlank(message = "开始时间不能为空")
        @Size(max = 32, message = "开始时间长度不能超过32")
        String startTime,

        @NotBlank(message = "结束时间不能为空")
        @Size(max = 32, message = "结束时间长度不能超过32")
        String endTime,

        @NotBlank(message = "userId不能为空")
        @Size(max = 100, message = "userId长度不能超过100")
        String userId,

        @NotBlank(message = "token不能为空")
        @Size(max = 255, message = "token长度不能超过255")
        String token,

        @NotNull(message = "开发组ID不能为空")
        Long groupId,

        @Size(max = 120, message = "开发组名称长度不能超过120")
        String groupName
) {
}
