package com.aiclub.platform.service;

/**
 * 监听后台环境变量管理的运行时更新事件。
 * 服务器管理这类高风险模块会依赖该通知做即时停用与资源释放。
 */
public interface PlatformEnvVarChangeListener {

    void onEnvVarUpdated(String envKey);
}
