package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 当前用户切换界面主题的请求载荷。 */
public record UpdateThemeRequest(
        @NotBlank(message = "Theme id cannot be blank")
        @Size(max = 40, message = "Theme id length must be <= 40")
        String themeId
) {
}
