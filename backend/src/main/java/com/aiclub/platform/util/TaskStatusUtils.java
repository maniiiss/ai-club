package com.aiclub.platform.util;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 工作项状态工具，统一沉淀“完成态”和“逾期态”的判定规则。
 */
public final class TaskStatusUtils {

    public static final String WORK_ITEM_TYPE_REQUIREMENT = "需求";
    public static final String WORK_ITEM_TYPE_TASK = "任务";
    public static final String WORK_ITEM_TYPE_DEFECT = "缺陷";

    private static final List<String> REQUIREMENT_STATUSES = List.of("草稿", "待开始", "进行中", "已完成", "已阻塞", "通过");
    private static final List<String> TASK_STATUSES = List.of("待开始", "进行中", "已阻塞", "已完成");
    private static final List<String> DEFECT_STATUSES = List.of("已拒绝", "待开始", "进行中", "已完成", "通过", "延期解决");

    private TaskStatusUtils() {
    }

    /**
     * 判断当前状态是否属于完成态。
     */
    public static boolean isCompletedStatus(String workItemType, String status) {
        String normalizedType = normalizeWorkItemType(workItemType);
        String normalizedStatus = normalizeStatus(normalizedType, status);
        if (WORK_ITEM_TYPE_REQUIREMENT.equals(normalizedType)) {
            return "通过".equals(normalizedStatus);
        }
        if (WORK_ITEM_TYPE_DEFECT.equals(normalizedType)) {
            return "通过".equals(normalizedStatus);
        }
        return "已完成".equals(normalizedStatus);
    }

    /**
     * 判断当前状态是否符合指定工作项类型的最新状态定义。
     */
    public static boolean isValidStatus(String workItemType, String status) {
        String normalizedType = normalizeWorkItemType(workItemType);
        String normalizedStatus = normalizeStatus(normalizedType, status);
        return allowedStatuses(normalizedType).contains(normalizedStatus);
    }

    /**
     * 返回某个工作项类型支持的主状态列表，供校验和错误提示复用。
     */
    public static String describeAllowedStatuses(String workItemType) {
        return String.join("、", allowedStatuses(normalizeWorkItemType(workItemType)));
    }

    /**
     * 统一兼容历史状态别名，并将已废弃的旧值折算到新的主状态上。
     */
    public static String normalizeStatus(String workItemType, String status) {
        String normalizedType = normalizeWorkItemType(workItemType);
        String normalizedStatus = defaultString(status).trim();
        if (normalizedStatus.isBlank()) {
            return normalizedStatus;
        }
        if ("草稿（评审通过）".equals(normalizedStatus)) {
            normalizedStatus = "草稿";
        }
        if ("处理中".equals(normalizedStatus) || "开发中".equals(normalizedStatus)) {
            normalizedStatus = "进行中";
        } else if ("完成".equals(normalizedStatus)) {
            normalizedStatus = "已完成";
        } else if ("阻塞".equals(normalizedStatus)) {
            normalizedStatus = "已阻塞";
        }
        if ((WORK_ITEM_TYPE_TASK.equals(normalizedType) || WORK_ITEM_TYPE_DEFECT.equals(normalizedType))
                && "草稿".equals(normalizedStatus)) {
            return "待开始";
        }
        return normalizedStatus;
    }

    /**
     * 构建数据库查询状态条件时，尽量兼容历史别名，减少状态体系切换后的可见性抖动。
     */
    public static Set<String> candidateStatusesForQuery(String workItemType, String status) {
        String normalizedType = normalizeWorkItemType(workItemType);
        String normalizedStatus = defaultString(status).trim();
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        if (normalizedStatus.isBlank()) {
            return candidates;
        }
        if ("草稿（评审通过）".equals(normalizedStatus)) {
            normalizedStatus = "草稿";
        }
        if ("处理中".equals(normalizedStatus) || "开发中".equals(normalizedStatus)) {
            normalizedStatus = "进行中";
        } else if ("完成".equals(normalizedStatus)) {
            normalizedStatus = "已完成";
        } else if ("阻塞".equals(normalizedStatus)) {
            normalizedStatus = "已阻塞";
        }
        candidates.add(normalizedStatus);
        if ("进行中".equals(normalizedStatus)) {
            candidates.add("处理中");
            candidates.add("开发中");
        } else if ("已完成".equals(normalizedStatus)) {
            candidates.add("完成");
        } else if ("已阻塞".equals(normalizedStatus)) {
            candidates.add("阻塞");
        } else if ("待开始".equals(normalizedStatus) && !defaultString(workItemType).trim().isBlank()) {
            if (!WORK_ITEM_TYPE_REQUIREMENT.equals(normalizedType)
                    && !"全部".equals(normalizedType)
                    && !"所有".equals(normalizedType)) {
                candidates.add("草稿");
            }
        }
        return candidates;
    }

    /**
     * 判断工作项是否已经进入逾期周期。
     */
    public static boolean isOverdue(LocalDate planEndDate, String workItemType, String status, LocalDate today) {
        if (planEndDate == null || today == null) {
            return false;
        }
        if (!planEndDate.isBefore(today)) {
            return false;
        }
        return !isCompletedStatus(workItemType, status);
    }

    /**
     * 工作项类型只允许这三类；状态工具内部默认把空值回退到“任务”，方便兼容历史调用。
     */
    private static String normalizeWorkItemType(String workItemType) {
        String normalizedType = defaultString(workItemType).trim();
        if (normalizedType.isBlank()) {
            return WORK_ITEM_TYPE_TASK;
        }
        return normalizedType;
    }

    private static List<String> allowedStatuses(String workItemType) {
        return switch (workItemType) {
            case WORK_ITEM_TYPE_REQUIREMENT -> REQUIREMENT_STATUSES;
            case WORK_ITEM_TYPE_DEFECT -> DEFECT_STATUSES;
            default -> TASK_STATUSES;
        };
    }

    private static String defaultString(String value) {
        return value == null ? "" : value;
    }
}
