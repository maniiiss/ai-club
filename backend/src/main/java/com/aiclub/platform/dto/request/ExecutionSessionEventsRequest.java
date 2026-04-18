package com.aiclub.platform.dto.request;

import java.util.List;

/**
 * runner 事件批量回调请求。
 * CLI 侧会按时间窗口批量上报，降低数据库写入与 HTTP 往返压力。
 */
public record ExecutionSessionEventsRequest(
        List<ExecutionSessionEventRequest> events
) {
}
