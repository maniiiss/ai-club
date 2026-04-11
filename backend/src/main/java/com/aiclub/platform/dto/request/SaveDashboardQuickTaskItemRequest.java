package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 快捷任务保存请求里的单条项目。
 */
public record SaveDashboardQuickTaskItemRequest(
        /**
         * 已存在快捷任务ID；新增时传空。
         */
        Long id,
        /**
         * 前端本地草稿唯一键，用于把保存结果回写到对应行。
         */
        @Size(max = 80, message = "快捷任务本地键长度不能超过80")
        String clientKey,
        /**
         * 用户填写的快捷任务内容。
         */
        @NotBlank(message = "快捷任务内容不能为空")
        @Size(max = 200, message = "快捷任务内容长度不能超过200")
        String content,
        /**
         * 是否勾选完成。
         */
        Boolean checked
) {
}
