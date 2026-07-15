package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 管理员发布平台版本的请求。 */
public record PlatformReleaseRequest(
        /** 业务版本号。 */
        @NotBlank(message = "版本号不能为空")
        @Size(max = 50, message = "版本号不能超过50个字符")
        String version,
        /** 发布标题。 */
        @NotBlank(message = "发布标题不能为空")
        @Size(max = 200, message = "发布标题不能超过200个字符")
        String title,
        /** Markdown 格式发布内容。 */
        @NotBlank(message = "发布内容不能为空")
        @Size(max = 20000, message = "发布内容不能超过20000个字符")
        String content
) {
}
