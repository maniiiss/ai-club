package com.aiclub.platform.exception;

/**
 * 表示当前登录用户没有访问指定项目数据的权限。
 */
public class ForbiddenException extends RuntimeException {

    public ForbiddenException(String message) {
        super(message);
    }
}
