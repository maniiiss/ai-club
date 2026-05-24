package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

/**
 * 服务器终端会话初始化请求。
 */
public record ServerTerminalSessionCreateRequest(
        @Min(value = 40, message = "终端列数不能小于 40")
        @Max(value = 400, message = "终端列数不能大于 400")
        Integer cols,
        @Min(value = 10, message = "终端行数不能小于 10")
        @Max(value = 200, message = "终端行数不能大于 200")
        Integer rows
) {
}
