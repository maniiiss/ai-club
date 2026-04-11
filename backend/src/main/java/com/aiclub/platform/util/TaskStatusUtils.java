package com.aiclub.platform.util;

import java.time.LocalDate;

/**
 * 工作项状态工具，统一沉淀“完成态”和“逾期态”的判定规则。
 */
public final class TaskStatusUtils {

    private TaskStatusUtils() {
    }

    /**
     * 判断当前状态是否属于完成态。
     */
    public static boolean isCompletedStatus(String status) {
        String normalized = defaultString(status).trim();
        return "已完成".equals(normalized) || "完成".equals(normalized);
    }

    /**
     * 判断工作项是否已经进入逾期周期。
     */
    public static boolean isOverdue(LocalDate planEndDate, String status, LocalDate today) {
        if (planEndDate == null || today == null) {
            return false;
        }
        if (!planEndDate.isBefore(today)) {
            return false;
        }
        return !isCompletedStatus(status);
    }

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }
}
