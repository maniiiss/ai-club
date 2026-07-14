package com.aiclub.platform.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequirePermission {

    String value();

    /** 兼容权限迁移期间允许的备用权限编码，任意一个拥有即可通过。 */
    String[] anyOf() default {};
}
