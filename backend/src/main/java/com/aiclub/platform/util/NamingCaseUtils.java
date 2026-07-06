package com.aiclub.platform.util;

import java.util.Locale;

/**
 * 命名风格转换工具类。
 * 业务意图：数据工作台实体解析在 Java 字段 (camelCase) 与数据库列 (snake_case) 之间来回映射时使用；
 * 同时提供简单的 Java 类型到 DataWorkbench 内部字段类型 (STRING/BOOLEAN/LONG/INTEGER) 的推断。
 */
public final class NamingCaseUtils {

    private NamingCaseUtils() {
    }

    /**
     * 将 camelCase / PascalCase 转成 snake_case。
     * 例如：qualificationRequired -&gt; qualification_required，UserId -&gt; user_id。
     * 输入为空时原样返回，避免调用方另加空判断。
     */
    public static String toSnakeCase(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        StringBuilder builder = new StringBuilder(value.length() + 8);
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (Character.isUpperCase(ch)) {
                if (i > 0 && builder.charAt(builder.length() - 1) != '_') {
                    builder.append('_');
                }
                builder.append(Character.toLowerCase(ch));
            } else {
                builder.append(ch);
            }
        }
        return builder.toString();
    }

    /**
     * 将 snake_case / kebab-case 转成 lowerCamelCase。
     * 例如：qualification_required -&gt; qualificationRequired。
     * 连续下划线会被忽略。
     */
    public static String toCamelCase(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        StringBuilder builder = new StringBuilder(value.length());
        boolean upperNext = false;
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch == '_' || ch == '-') {
                upperNext = builder.length() > 0;
                continue;
            }
            if (upperNext) {
                builder.append(Character.toUpperCase(ch));
                upperNext = false;
            } else {
                builder.append(Character.toLowerCase(ch));
            }
        }
        return builder.toString();
    }

    /**
     * 将首字母大写，形成 PascalCase 显示名称。
     */
    public static String capitalize(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return Character.toUpperCase(value.charAt(0)) + value.substring(1);
    }

    /**
     * 根据 Java 字段类型简单类名推断 DataWorkbench 支持的字段类型。
     * 未识别类型返回 STRING，避免解析中断；调用方负责在需要时上报 warning。
     */
    public static String guessDataTypeFromJava(String javaSimpleType) {
        if (javaSimpleType == null || javaSimpleType.isBlank()) {
            return "STRING";
        }
        String type = stripGenerics(javaSimpleType).trim().toLowerCase(Locale.ROOT);
        return switch (type) {
            case "boolean", "java.lang.boolean" -> "BOOLEAN";
            case "long", "java.lang.long" -> "LONG";
            case "int", "integer", "short", "byte", "java.lang.integer", "java.lang.short", "java.lang.byte" -> "INTEGER";
            default -> "STRING";
        };
    }

    /**
     * 根据 SQL 列类型名（不含长度参数）推断 DataWorkbench 字段类型。
     * 未识别的类型返回 STRING，调用方决定是否补 warning。
     */
    public static String guessDataTypeFromSql(String sqlTypeName) {
        if (sqlTypeName == null || sqlTypeName.isBlank()) {
            return "STRING";
        }
        String type = sqlTypeName.trim().toUpperCase(Locale.ROOT);
        return switch (type) {
            case "BOOLEAN", "BOOL", "BIT" -> "BOOLEAN";
            case "BIGINT", "INT8", "SERIAL8", "BIGSERIAL" -> "LONG";
            case "INT", "INTEGER", "INT4", "SMALLINT", "TINYINT", "SERIAL", "MEDIUMINT" -> "INTEGER";
            default -> "STRING";
        };
    }

    /**
     * 去掉泛型部分，例如 List&lt;String&gt; -&gt; List。
     */
    private static String stripGenerics(String type) {
        int idx = type.indexOf('<');
        return idx > 0 ? type.substring(0, idx) : type;
    }
}
