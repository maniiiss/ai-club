package com.aiclub.platform.service;

import com.aiclub.platform.agentusage.AgentType;
import com.aiclub.platform.agentusage.InvocationStatus;
import com.aiclub.platform.agentusage.TriggerSource;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentInvocationLogSummary;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageAgentBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageModelBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageOptions;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageOverview;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageQueryRequest;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageTrendPoint;
import com.aiclub.platform.dto.AgentUsageStatsDtos.AgentUsageUserBreakdown;
import com.aiclub.platform.dto.AgentUsageStatsDtos.OptionItem;
import com.aiclub.platform.dto.AgentUsageStatsDtos.UnknownCallSource;
import com.aiclub.platform.dto.PageResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 智能体调用统计聚合服务。
 *
 * <p>直接使用 native SQL 做 GROUP BY 聚合，避免逐行加载实体。
 * 所有查询强制 created_at 时间范围，最大允许 90 天。
 */
@Service
@Transactional(readOnly = true)
public class AgentUsageStatsService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long MAX_QUERY_WINDOW_DAYS = 90L;
    private static final long DEFAULT_WINDOW_DAYS = 7L;
    private static final int DEFAULT_TOP_LIMIT = 20;

    @PersistenceContext
    private EntityManager entityManager;

    // ---------- options ----------

    public AgentUsageOptions getOptions() {
        List<OptionItem> agentTypes = Arrays.stream(AgentType.values())
                .map(t -> new OptionItem(t.name(), t.getDisplayName()))
                .toList();
        List<OptionItem> statuses = List.of(
                new OptionItem("SUCCESS", "成功"),
                new OptionItem("FAILURE", "失败"),
                new OptionItem("TIMEOUT", "超时"),
                new OptionItem("CLIENT_DISCONNECTED", "客户端断开"),
                new OptionItem("RATE_LIMITED", "限流"),
                new OptionItem("CREDIT_DENIED", "积分不足")
        );
        List<OptionItem> triggerSources = List.of(
                new OptionItem("USER_DIRECT", "用户触发"),
                new OptionItem("AUTO", "系统自动"),
                new OptionItem("SCHEDULED", "定时调度"),
                new OptionItem("WEBHOOK", "Webhook"),
                new OptionItem("SYSTEM", "系统内部")
        );
        return new AgentUsageOptions(agentTypes, statuses, triggerSources);
    }

    // ---------- overview ----------

    public AgentUsageOverview getOverview(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);

        String sql = "SELECT " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success_count, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure_count, " +
                "  COALESCE(SUM(prompt_tokens), 0) AS total_prompt, " +
                "  COALESCE(SUM(completion_tokens), 0) AS total_completion, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_total, " +
                "  SUM(CASE WHEN total_tokens IS NOT NULL THEN 1 ELSE 0 END) AS token_count, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95_duration, " +
                "  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS distinct_users, " +
                "  SUM(CASE WHEN agent_type = 'UNKNOWN_MODEL_CALL' THEN 1 ELSE 0 END) AS unknown_count " +
                "FROM agent_invocation_log " + where.sql();
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        Object[] row = (Object[]) q.getSingleResult();

        long total = toLong(row[0]);
        long success = toLong(row[1]);
        long failure = toLong(row[2]);
        long totalPrompt = toLong(row[3]);
        long totalCompletion = toLong(row[4]);
        long totalTotal = toLong(row[5]);
        long tokenCount = toLong(row[6]);
        double avgDuration = toDouble(row[7]);
        long p95Duration = toLong(row[8]);
        long distinctUsers = toLong(row[9]);
        long unknownCount = toLong(row[10]);
        double successRate = total == 0 ? 0.0 : (double) success / total;
        double tokenCoverage = total == 0 ? 0.0 : (double) tokenCount / total;

        // UNKNOWN 来源 TOP 5
        List<UnknownCallSource> unknownSources = unknownCount > 0 ? loadUnknownSources(request, window) : List.of();

        return new AgentUsageOverview(
                total, success, failure, round(successRate),
                totalPrompt, totalCompletion, totalTotal, round(tokenCoverage),
                round(avgDuration), p95Duration, distinctUsers,
                unknownCount, unknownSources);
    }

    @SuppressWarnings("unchecked")
    private List<UnknownCallSource> loadUnknownSources(AgentUsageQueryRequest request, TimeWindow window) {
        String sql = "SELECT COALESCE(action, 'UNKNOWN') AS src, COUNT(*) AS cnt " +
                "FROM agent_invocation_log " +
                "WHERE agent_type = 'UNKNOWN_MODEL_CALL' " +
                "  AND created_at >= :startTime AND created_at <= :endTime " +
                "GROUP BY action ORDER BY cnt DESC LIMIT 5";
        Query q = entityManager.createNativeQuery(sql)
                .setParameter("startTime", window.start())
                .setParameter("endTime", window.end());
        List<Object[]> rows = q.getResultList();
        List<UnknownCallSource> result = new ArrayList<>();
        for (Object[] r : rows) {
            result.add(new UnknownCallSource(String.valueOf(r[0]), toLong(r[1])));
        }
        return result;
    }

    // ---------- trend ----------

    @SuppressWarnings("unchecked")
    public List<AgentUsageTrendPoint> getTrend(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);
        String granularity = resolveGranularity(request.granularity());
        String dateTrunc = "date_trunc('" + granularity + "', created_at)";

        String sql = "SELECT " + dateTrunc + " AS bucket, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY bucket ORDER BY bucket ASC";
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<AgentUsageTrendPoint> result = new ArrayList<>();
        for (Object[] r : rows) {
            String bucket = toTime(r[0]);
            result.add(new AgentUsageTrendPoint(bucket, toLong(r[1]), toLong(r[2]), toLong(r[3]), toLong(r[4]), round(toDouble(r[5]))));
        }
        return result;
    }

    // ---------- by-agent ----------

    @SuppressWarnings("unchecked")
    public List<AgentUsageAgentBreakdown> getByAgent(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);

        String sql = "SELECT agent_type, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY agent_type ORDER BY total DESC";
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<AgentUsageAgentBreakdown> result = new ArrayList<>();
        for (Object[] r : rows) {
            String typeCode = String.valueOf(r[0]);
            String label = resolveAgentLabel(typeCode);
            long total = toLong(r[1]);
            long success = toLong(r[2]);
            long failure = toLong(r[3]);
            double avgDuration = toDouble(r[4]);
            long totalTokens = toLong(r[5]);
            double successRate = total == 0 ? 0.0 : (double) success / total;
            result.add(new AgentUsageAgentBreakdown(typeCode, label, total, success, failure, round(successRate), round(avgDuration), totalTokens));
        }
        return result;
    }

    // ---------- by-user ----------

    @SuppressWarnings("unchecked")
    public List<AgentUsageUserBreakdown> getByUser(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);
        int limit = request.limit() == null ? DEFAULT_TOP_LIMIT : Math.max(1, Math.min(request.limit(), 200));

        String sql = "SELECT user_id, " +
                "  MAX(username_snapshot) AS username, " +
                "  MAX(nickname_snapshot) AS nickname, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  MAX(created_at) AS last_at " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY user_id ORDER BY total DESC LIMIT " + limit;
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<AgentUsageUserBreakdown> result = new ArrayList<>();
        for (Object[] r : rows) {
            Long userId = r[0] == null ? null : ((Number) r[0]).longValue();
            String username = (String) r[1];
            String nickname = (String) r[2];
            result.add(new AgentUsageUserBreakdown(userId, username, nickname,
                    toLong(r[3]), toLong(r[4]), toLong(r[5]), toTime(r[6])));
        }
        return result;
    }

    // ---------- by-model ----------

    @SuppressWarnings("unchecked")
    public List<AgentUsageModelBreakdown> getByModel(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);

        String sql = "SELECT model_config_id, " +
                "  MAX(model_name) AS model_name, " +
                "  MAX(provider) AS provider, " +
                "  COUNT(*) AS total, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95 " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY model_config_id ORDER BY total DESC";
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<AgentUsageModelBreakdown> result = new ArrayList<>();
        for (Object[] r : rows) {
            Long modelConfigId = r[0] == null ? null : ((Number) r[0]).longValue();
            result.add(new AgentUsageModelBreakdown(modelConfigId, (String) r[1], (String) r[2],
                    toLong(r[3]), toLong(r[4]), round(toDouble(r[5])), toLong(r[6])));
        }
        return result;
    }

    // ---------- logs ----------

    @SuppressWarnings("unchecked")
    public PageResponse<AgentInvocationLogSummary> getLogs(AgentUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);
        int page = request.page() == null ? 1 : Math.max(1, request.page());
        int size = request.size() == null ? 20 : Math.max(1, Math.min(request.size(), 100));
        int offset = (page - 1) * size;

        String countSql = "SELECT COUNT(*) FROM agent_invocation_log " + where.sql();
        Query countQ = entityManager.createNativeQuery(countSql);
        where.applyParams(countQ);
        long total = toLong(countQ.getSingleResult());

        String dataSql = "SELECT id, created_at, user_id, username_snapshot, nickname_snapshot, " +
                "agent_type, action, model_name, provider, status, trigger_source, duration_ms, " +
                "prompt_tokens, completion_tokens, total_tokens, input_chars, output_chars, " +
                "error_code, error_message " +
                "FROM agent_invocation_log " + where.sql() +
                " ORDER BY created_at DESC LIMIT " + size + " OFFSET " + offset;
        Query dataQ = entityManager.createNativeQuery(dataSql);
        where.applyParams(dataQ);
        List<Object[]> rows = dataQ.getResultList();
        List<AgentInvocationLogSummary> content = new ArrayList<>();
        for (Object[] r : rows) {
            String typeCode = String.valueOf(r[5]);
            content.add(new AgentInvocationLogSummary(
                    ((Number) r[0]).longValue(),
                    toTime(r[1]),
                    r[2] == null ? null : ((Number) r[2]).longValue(),
                    (String) r[3],
                    (String) r[4],
                    typeCode,
                    resolveAgentLabel(typeCode),
                    (String) r[6],
                    (String) r[7],
                    (String) r[8],
                    (String) r[9],
                    (String) r[10],
                    r[11] == null ? null : ((Number) r[11]).longValue(),
                    r[12] == null ? null : ((Number) r[12]).intValue(),
                    r[13] == null ? null : ((Number) r[13]).intValue(),
                    r[14] == null ? null : ((Number) r[14]).intValue(),
                    r[15] == null ? null : ((Number) r[15]).intValue(),
                    r[16] == null ? null : ((Number) r[16]).intValue(),
                    (String) r[17],
                    (String) r[18]
            ));
        }
        int totalPages = size == 0 ? 0 : (int) ((total + size - 1) / size);
        return new PageResponse<>(content, total, page, size, totalPages);
    }

    // ---------- helpers ----------

    private record TimeWindow(LocalDateTime start, LocalDateTime end) {
    }

    /**
     * SQL WHERE 子句构造结果，含 SQL 文本和参数 setter。
     */
    private static final class WhereClause {
        private final String sql;
        private final List<Object[]> params;

        WhereClause(String sql, List<Object[]> params) {
            this.sql = sql;
            this.params = params;
        }

        String sql() { return sql; }

        void applyParams(Query q) {
            for (Object[] p : params) {
                q.setParameter((String) p[0], p[1]);
            }
        }
    }

    private TimeWindow resolveWindow(AgentUsageQueryRequest request) {
        LocalDateTime end = parseDateTime(request.endTime(), LocalDateTime.now());
        LocalDateTime start = parseDateTime(request.startTime(), end.minusDays(DEFAULT_WINDOW_DAYS));
        if (start.isAfter(end)) {
            throw new IllegalArgumentException("开始时间不能晚于结束时间");
        }
        if (start.plusDays(MAX_QUERY_WINDOW_DAYS).isBefore(end)) {
            throw new IllegalArgumentException("查询时间范围不能超过 " + MAX_QUERY_WINDOW_DAYS + " 天");
        }
        return new TimeWindow(start, end);
    }

    /**
     * 支持 {@code yyyy-MM-dd HH:mm:ss} 与 ISO 8601 两种格式，与前端 datetimerange 输出保持兼容。
     */
    private static LocalDateTime parseDateTime(String value, LocalDateTime fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDateTime.parse(value, TIME_FORMATTER);
        } catch (Exception ignored) {
            // 兜底尝试 ISO 8601
            return LocalDateTime.parse(value);
        }
    }

    private WhereClause buildWhere(AgentUsageQueryRequest request, TimeWindow window) {
        StringBuilder sb = new StringBuilder("WHERE created_at >= :startTime AND created_at <= :endTime ");
        List<Object[]> params = new ArrayList<>();
        params.add(new Object[]{"startTime", window.start()});
        params.add(new Object[]{"endTime", window.end()});

        if (request.agentTypes() != null && !request.agentTypes().isEmpty()) {
            sb.append("AND agent_type IN (:agentTypes) ");
            params.add(new Object[]{"agentTypes", request.agentTypes()});
        }
        if (request.userIds() != null && !request.userIds().isEmpty()) {
            sb.append("AND user_id IN (:userIds) ");
            params.add(new Object[]{"userIds", request.userIds()});
        }
        if (request.modelConfigIds() != null && !request.modelConfigIds().isEmpty()) {
            sb.append("AND model_config_id IN (:modelConfigIds) ");
            params.add(new Object[]{"modelConfigIds", request.modelConfigIds()});
        }
        if (request.triggerSources() != null && !request.triggerSources().isEmpty()) {
            sb.append("AND trigger_source IN (:triggerSources) ");
            params.add(new Object[]{"triggerSources", request.triggerSources()});
        }
        if (request.projectId() != null) {
            sb.append("AND project_id = :projectId ");
            params.add(new Object[]{"projectId", request.projectId()});
        }
        return new WhereClause(sb.toString(), params);
    }

    private static String resolveGranularity(String input) {
        if (input == null) return "day";
        String lower = input.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "day", "week", "month" -> lower;
            default -> "day";
        };
    }

    private static String resolveAgentLabel(String typeCode) {
        if (typeCode == null) return "";
        try {
            return AgentType.valueOf(typeCode).getDisplayName();
        } catch (IllegalArgumentException ex) {
            return typeCode;
        }
    }

    private static long toLong(Object o) {
        if (o == null) return 0L;
        if (o instanceof Number n) return n.longValue();
        return Long.parseLong(o.toString());
    }

    private static double toDouble(Object o) {
        if (o == null) return 0.0;
        if (o instanceof Number n) return n.doubleValue();
        if (o instanceof BigDecimal bd) return bd.doubleValue();
        return Double.parseDouble(o.toString());
    }

    private static double round(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static String toTime(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().format(TIME_FORMATTER);
        if (o instanceof LocalDateTime ldt) return ldt.format(TIME_FORMATTER);
        return o.toString();
    }
}