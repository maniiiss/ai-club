package com.aiclub.platform.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * 自动合并日志中的"单条审查问题"。
 *
 * 设计要点：
 * - id 用 UUID 字符串，仅在持久化阶段分配，保证同一条问题在多次日志里有稳定标识，方便前端逐条挂反馈、
 *   后续 LLM 复盘智能体按 id 聚合所有反馈。
 * - text 保留原始问题描述，UI 展示与 issueSemanticKey 比对都基于 text。
 * - 该 record 仅用于持久化（review_issues_json 等列）与对外 API 渲染层；
 *   {@link CodeReviewResult} 内部仍维持 List&lt;String&gt;，避免对 Python code-processing 服务的 wire format 造成破坏。
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReviewIssueItem(String id, String text) {
}
