package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * 平台工具配置更新请求。
 */
public record PlatformToolConfigRequest(
        /**
         * 展示名称覆盖。
         */
        @Size(max = 120, message = "展示名称长度不能超过120")
        String displayName,
        /**
         * 描述覆盖。
         */
        @Size(max = 1000, message = "描述长度不能超过1000")
        String descriptionOverride,
        /**
         * 是否启用。
         */
        @NotNull(message = "启用状态不能为空")
        Boolean enabled,
        /**
         * 是否允许自动执行。
         */
        @NotNull(message = "自动执行开关不能为空")
        Boolean allowAutoExecute
) {
}
