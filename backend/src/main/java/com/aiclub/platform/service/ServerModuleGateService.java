package com.aiclub.platform.service;

import com.aiclub.platform.exception.ForbiddenException;
import org.springframework.stereotype.Service;

/**
 * 服务器管理模块运行期闸门。
 * 所有 REST、WebSocket、调度与 SSH 会话入口都必须先经过这里判断模块是否已被后台停用。
 */
@Service
public class ServerModuleGateService {

    private static final String DISABLED_MESSAGE = "服务器管理模块已关闭";

    private final PlatformEnvVarResolver platformEnvVarResolver;

    public ServerModuleGateService(PlatformEnvVarResolver platformEnvVarResolver) {
        this.platformEnvVarResolver = platformEnvVarResolver;
    }

    public boolean isEnabled() {
        return Boolean.parseBoolean(platformEnvVarResolver.resolveOrDefault(
                PlatformEnvVarRegistry.KEY_SERVER_MODULE_ENABLED,
                () -> "true",
                "true"
        ));
    }

    public void requireEnabled() {
        if (!isEnabled()) {
            throw new ForbiddenException(DISABLED_MESSAGE);
        }
    }

    public String disabledMessage() {
        return DISABLED_MESSAGE;
    }
}
