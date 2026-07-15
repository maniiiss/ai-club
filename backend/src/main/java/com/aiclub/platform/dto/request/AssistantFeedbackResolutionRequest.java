package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;

/** 管理员提交反馈处理结论和复盘数据集标记的请求。 */
public record AssistantFeedbackResolutionRequest(
        /** 目标终态。 */
        @NotBlank(message = "请选择处理结论")
        String status,
        /** 处理结论编码。 */
        @NotBlank(message = "请选择处理结论类型")
        String resolutionCode,
        /** 面向用户和复盘人员的处理说明。 */
        @Size(max = 4000, message = "处理说明不能超过4000字")
        String resolutionNote,
        /** 改进标签。 */
        @Size(max = 12, message = "改进标签最多12项")
        List<String> improvementTags,
        /** 数据集状态。 */
        @NotBlank(message = "请选择数据集状态")
        String datasetStatus
) {
}
