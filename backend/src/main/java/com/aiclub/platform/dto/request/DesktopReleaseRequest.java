package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 管理员创建 GitPilot Desktop 草稿的请求。 */
public record DesktopReleaseRequest(
        @NotBlank(message = "桌面版本号不能为空")
        @Size(max = 50, message = "桌面版本号不能超过50个字符")
        String version,
        @NotBlank(message = "桌面版本标题不能为空")
        @Size(max = 200, message = "桌面版本标题不能超过200个字符")
        String title,
        @Size(max = 50000, message = "桌面版本说明不能超过50000个字符")
        String releaseNotes,
        @Size(max = 20, message = "发布渠道不能超过20个字符")
        String channel
) {
}
