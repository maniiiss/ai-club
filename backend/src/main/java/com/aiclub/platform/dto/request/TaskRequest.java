package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record TaskRequest(
        @NotBlank(message = "任务名称不能为空")
        @Size(max = 120, message = "任务名称长度不能超过120")
        String name,
        @Size(max = 50, message = "工作项类型长度不能超过50")
        String workItemType,
        @NotBlank(message = "任务状态不能为空")
        @Size(max = 50, message = "任务状态长度不能超过50")
        String status,
        @NotBlank(message = "优先级不能为空")
        @Size(max = 30, message = "优先级长度不能超过30")
        String priority,
        @Size(max = 50, message = "执行人长度不能超过50")
        String assignee,
        Long assigneeUserId,
        List<Long> collaboratorUserIds,
        @Size(max = 20000, message = "任务描述长度不能超过20000")
        String description,
        /**
         * 需求模板 Markdown 文档。
         */
        @Size(max = 50000, message = "需求文档长度不能超过50000")
        String requirementMarkdown,
        /**
         * 原型链接。
         */
        @Size(max = 500, message = "原型链接长度不能超过500")
        String prototypeUrl,
        /**
         * 需求所属模块，供 PRD 目录归档使用。
         */
        @Size(max = 120, message = "模块名称长度不能超过120")
        String moduleName,
        /**
         * 需求开发是否通过。
         */
        Boolean devPassed,
        /**
         * 需求测试是否通过。
         */
        Boolean testPassed,
        /**
         * 任务工时，单位为小时，最大 15 小时。
         */
        @DecimalMin(value = "0.0", message = "工时不能小于0")
        @DecimalMax(value = "15.0", message = "工时不能超过15小时")
        @Digits(integer = 2, fraction = 1, message = "工时最多保留1位小数")
        BigDecimal workHours,
        /**
         * 任务细分类型，仅工作项类型为“任务”时持久化。
         */
        @Size(max = 30, message = "任务类型长度不能超过30")
        String taskType,
        /**
         * 计划开始日期，格式为 yyyy-MM-dd。
         */
        String planStartDate,
        /**
         * 计划结束日期，格式为 yyyy-MM-dd。
         */
        String planEndDate,
        @NotNull(message = "所属项目不能为空")
        Long projectId,
        Long agentId,
        Long iterationId,
        Long requirementTaskId
) {
        public TaskRequest(String name,
                           String workItemType,
                           String status,
                           String priority,
                           String assignee,
                           Long assigneeUserId,
                           List<Long> collaboratorUserIds,
                           String description,
                           String requirementMarkdown,
                           String prototypeUrl,
                           String moduleName,
                           Boolean devPassed,
                           Boolean testPassed,
                           BigDecimal workHours,
                           String planStartDate,
                           String planEndDate,
                           Long projectId,
                           Long agentId,
                           Long iterationId,
                           Long requirementTaskId) {
                this(name, workItemType, status, priority, assignee, assigneeUserId, collaboratorUserIds,
                        description, requirementMarkdown, prototypeUrl, moduleName, devPassed, testPassed,
                        workHours, null, planStartDate, planEndDate, projectId, agentId, iterationId, requirementTaskId);
        }
}
