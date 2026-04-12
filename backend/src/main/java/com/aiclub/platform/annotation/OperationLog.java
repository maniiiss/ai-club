package com.aiclub.platform.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 为控制器或控制器方法补充操作日志元数据。
 */
@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface OperationLog {

    /**
     * 模块编码，用于筛选和程序化识别。
     */
    String moduleCode() default "";

    /**
     * 模块名称，用于后台页面展示。
     */
    String moduleName() default "";

    /**
     * 动作编码，用于区分同模块下的不同操作。
     */
    String actionCode() default "";

    /**
     * 动作名称，用于后台页面展示。
     */
    String actionName() default "";

    /**
     * 业务对象类型，例如 USER、PROJECT、TASK。
     */
    String bizType() default "";

    /**
     * 业务对象 ID 对应的路径变量名。
     */
    String bizIdParam() default "";

    /**
     * 是否跳过通用操作日志记录。
     */
    boolean skip() default false;
}
