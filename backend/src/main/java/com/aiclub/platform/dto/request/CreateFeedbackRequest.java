package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 提交反馈与建议的请求体。
 */
public record CreateFeedbackRequest(
        /** 反馈类型。 */
        @NotBlank(message = "请选择反馈类型")
        @Pattern(regexp = "BUG|SUGGESTION|EXPERIENCE|OTHER", message = "反馈类型不合法")
        String type,
        /** 反馈标题。 */
        @NotBlank(message = "请输入反馈标题")
        @Size(max = 100, message = "反馈标题长度不能超过100")
        String title,
        /** 反馈详细内容。 */
        @NotBlank(message = "请输入反馈内容")
        @Size(max = 2000, message = "反馈内容长度不能超过2000")
        String content
) {
}
