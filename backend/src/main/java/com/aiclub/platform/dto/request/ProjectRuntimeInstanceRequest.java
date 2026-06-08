package com.aiclub.platform.dto.request;

import jakarta.validation.constraints.Size;

import java.util.List;

public record ProjectRuntimeInstanceRequest(
        @Size(max = 120, message = "运行实例名称长度不能超过120")
        String name,
        @Size(max = 60, message = "环境标识长度不能超过60")
        String environment,
        @Size(max = 120, message = "服务名称长度不能超过120")
        String serviceName,
        Boolean enabled,
        String serverMode,
        Long serverId,
        @Size(max = 500, message = "外部访问地址长度不能超过500")
        String externalBaseUrl,
        Boolean logEnabled,
        List<String> logPaths,
        Boolean healthEnabled,
        String healthProbeType,
        @Size(max = 500, message = "健康检查目标长度不能超过500")
        String healthTarget
) {
}
