package com.aiclub.platform.service;

import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelBreakdown;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelOptionItem;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelOverview;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelTrendPoint;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelUsageOptions;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ModelUsageQueryRequest;
import com.aiclub.platform.dto.ModelUsageStatsDtos.OptionItem;
import com.aiclub.platform.dto.ModelUsageStatsDtos.ProviderBreakdown;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * 平台模型调用量统计聚合服务。
 *
 * <p>以「模型」为中心聚合 {@code agent_invocation_log}，聚合键为 {@code (model_name, provider)}，
 * 覆盖 {@code ai_model_config} 表内模型、env 配置的 Hermes 模型与 code-processing 回传模型。
 * 与 {@link AgentUsageStatsService}（按智能体/用户维度）互补，不改动其逻辑。
 *
 * <p>实现风格与 {@link AgentUsageStatsService} 一致：native SQL + EntityManager，
 * 强制 {@code created_at} 时间范围，最大允许 90 天。
 */
@Service
@Transactional(readOnly = true)
public class ModelUsageStatsService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final long MAX_QUERY_WINDOW_DAYS = 90L;
    private static final long DEFAULT_WINDOW_DAYS = 7L;
    private static final int DEFAULT_TOP_LIMIT = 20;
    private static final int MAX_TOP_LIMIT = 200;
    private static final int OPTIONS_LIMIT = 200;
    /** 模型明细里独立用户名称列表的最大展示长度，超出截断并标注。 */
    private static final int MAX_USER_NAMES_LENGTH = 200;

    @PersistenceContext
    private EntityManager entityManager;

    // ---------- options ----------

    @SuppressWarnings("unchecked")
    public ModelUsageOptions getOptions() {
        // 模型下拉：取历史出现过的 (model_name, provider)，按模型名排序，限 200 条避免大表全扫。
        String modelSql = "SELECT DISTINCT model_name, provider FROM agent_invocation_log "
                + "WHERE model_name IS NOT NULL AND model_name <> '' "
                + "ORDER BY model_name LIMIT " + OPTIONS_LIMIT;
        List<Object[]> modelRows = entityManager.createNativeQuery(modelSql).getResultList();
        List<ModelOptionItem> models = new ArrayList<>();
        for (Object[] r : modelRows) {
            models.add(new ModelOptionItem((String) r[0], (String) r[1]));
        }

        String providerSql = "SELECT DISTINCT provider FROM agent_invocation_log "
                + "WHERE provider IS NOT NULL AND provider <> '' "
                + "ORDER BY provider LIMIT 50";
        // 单列查询返回标量 List<String>，不能按 Object[] 处理，否则触发 ClassCastException。
        @SuppressWarnings("unchecked")
        List<String> providerCodes = entityManager.createNativeQuery(providerSql).getResultList();
        List<OptionItem> providers = new ArrayList<>();
        for (String code : providerCodes) {
            providers.add(new OptionItem(code, code));
        }
        return new ModelUsageOptions(models, providers);
    }

    // ---------- overview ----------

    public ModelOverview getOverview(ModelUsageQueryRequest request) {
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
                "  COUNT(DISTINCT CASE WHEN model_name IS NOT NULL AND model_name <> '' THEN model_name END) AS active_models, " +
                "  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS distinct_users, " +
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
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
        long activeModels = toLong(row[9]);
        long distinctUsers = toLong(row[10]);
        long cachedTokens = toLong(row[11]);
        Double cacheHitRate = row[12] == null ? null : ((Number) row[12]).doubleValue();
        double successRate = total == 0 ? 0.0 : (double) success / total;
        double tokenCoverage = total == 0 ? 0.0 : (double) tokenCount / total;

        return new ModelOverview(
                total, success, failure, round(successRate),
                totalPrompt, totalCompletion, totalTotal, round(tokenCoverage),
                round(avgDuration), p95Duration, activeModels, distinctUsers,
                cachedTokens, cacheHitRate);
    }

    // ---------- by-model ----------

    @SuppressWarnings("unchecked")
    public List<ModelBreakdown> getByModel(ModelUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);
        int limit = request.limit() == null ? DEFAULT_TOP_LIMIT : Math.max(1, Math.min(request.limit(), MAX_TOP_LIMIT));

        // 聚合键 (model_name, provider)，COALESCE 把空串/null 归为 <unknown>，
        // 让 env 配置的 Hermes 模型与 code-processing 回传模型也能正确聚合。
        String modelNameExpr = "COALESCE(NULLIF(model_name, ''), '<unknown>')";
        String providerExpr = "COALESCE(NULLIF(provider, ''), '<unknown>')";
        String sql = "SELECT " + modelNameExpr + " AS model_name, " +
                "  " + providerExpr + " AS provider, " +
                "  MAX(model_config_id) AS model_config_id, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure, " +
                "  COALESCE(SUM(prompt_tokens), 0) AS input_tokens, " +
                "  COALESCE(SUM(completion_tokens), 0) AS output_tokens, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms), 0) AS p95, " +
                "  COUNT(DISTINCT user_id) AS unique_users, " +
                "  COALESCE(string_agg(DISTINCT NULLIF(nickname_snapshot, ''), ', '), '') AS unique_user_names, " +
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY " + modelNameExpr + ", " + providerExpr +
                " ORDER BY total DESC LIMIT " + limit;
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<ModelBreakdown> result = new ArrayList<>();
        for (Object[] r : rows) {
            long total = toLong(r[3]);
            long success = toLong(r[4]);
            long failure = toLong(r[5]);
            double successRate = total == 0 ? 0.0 : (double) success / total;
            result.add(new ModelBreakdown(
                    (String) r[0], (String) r[1],
                    r[2] == null ? null : ((Number) r[2]).longValue(),
                    total, success, failure, round(successRate),
                    toLong(r[6]), toLong(r[7]), toLong(r[8]),
                    round(toDouble(r[9])), toLong(r[10]), toLong(r[11]),
                    truncateUserNames((String) r[12]),
                    toLong(r[13]),
                    r[14] == null ? null : ((Number) r[14]).doubleValue()));
        }
        return result;
    }

    // ---------- trend ----------

    @SuppressWarnings("unchecked")
    public List<ModelTrendPoint> getTrend(ModelUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);
        String granularity = resolveGranularity(request.granularity());
        String dateTrunc = "date_trunc('" + granularity + "', created_at)";

        String sql = "SELECT " + dateTrunc + " AS bucket, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY bucket ORDER BY bucket ASC";
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<ModelTrendPoint> result = new ArrayList<>();
        for (Object[] r : rows) {
            result.add(new ModelTrendPoint(toTime(r[0]), toLong(r[1]), toLong(r[2]), toLong(r[3]), toLong(r[4]), round(toDouble(r[5])), toLong(r[6]), r[7] == null ? null : ((Number) r[7]).doubleValue()));
        }
        return result;
    }

    // ---------- by-provider ----------

    @SuppressWarnings("unchecked")
    public List<ProviderBreakdown> getByProvider(ModelUsageQueryRequest request) {
        TimeWindow window = resolveWindow(request);
        WhereClause where = buildWhere(request, window);

        String providerExpr = "COALESCE(NULLIF(provider, ''), '<unknown>')";
        String sql = "SELECT " + providerExpr + " AS provider, " +
                "  COUNT(*) AS total, " +
                "  SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success, " +
                "  SUM(CASE WHEN status <> 'SUCCESS' THEN 1 ELSE 0 END) AS failure, " +
                "  COALESCE(SUM(total_tokens), 0) AS total_tokens, " +
                "  COALESCE(AVG(duration_ms), 0) AS avg_duration, " +
                "  COALESCE(SUM(cached_tokens), 0) AS cached_tokens, " +
                "  CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate " +
                "FROM agent_invocation_log " + where.sql() +
                " GROUP BY " + providerExpr + " ORDER BY total DESC";
        Query q = entityManager.createNativeQuery(sql);
        where.applyParams(q);
        List<Object[]> rows = q.getResultList();
        List<ProviderBreakdown> result = new ArrayList<>();
        for (Object[] r : rows) {
            long total = toLong(r[1]);
            long success = toLong(r[2]);
            long failure = toLong(r[3]);
            double successRate = total == 0 ? 0.0 : (double) success / total;
            result.add(new ProviderBreakdown(
                    (String) r[0], total, success, failure, round(successRate),
                    toLong(r[4]), round(toDouble(r[5])), toLong(r[6]), r[7] == null ? null : ((Number) r[7]).doubleValue()));
        }
        return result;
    }

    // ---------- helpers ----------

    private record TimeWindow(LocalDateTime start, LocalDateTime end) {
    }

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

    private TimeWindow resolveWindow(ModelUsageQueryRequest request) {
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

    private static LocalDateTime parseDateTime(String value, LocalDateTime fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        try {
            return LocalDateTime.parse(value, TIME_FORMATTER);
        } catch (Exception ignored) {
            return LocalDateTime.parse(value);
        }
    }

    private WhereClause buildWhere(ModelUsageQueryRequest request, TimeWindow window) {
        StringBuilder sb = new StringBuilder("WHERE created_at >= :startTime AND created_at <= :endTime ");
        List<Object[]> params = new ArrayList<>();
        params.add(new Object[]{"startTime", window.start()});
        params.add(new Object[]{"endTime", window.end()});

        if (request.modelNames() != null && !request.modelNames().isEmpty()) {
            sb.append("AND model_name IN (:modelNames) ");
            params.add(new Object[]{"modelNames", request.modelNames()});
        }
        if (request.providers() != null && !request.providers().isEmpty()) {
            sb.append("AND provider IN (:providers) ");
            params.add(new Object[]{"providers", request.providers()});
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

    /**
     * 截断独立用户名称列表，避免单模型用户过多导致单元格过长。
     * 空值归为空串；超长时保留前 N 字符并标注省略。
     */
    private static String truncateUserNames(String names) {
        if (names == null || names.isBlank()) {
            return "";
        }
        if (names.length() <= MAX_USER_NAMES_LENGTH) {
            return names;
        }
        return names.substring(0, MAX_USER_NAMES_LENGTH) + "…";
    }

    private static String toTime(Object o) {
        if (o == null) return null;
        if (o instanceof java.sql.Timestamp ts) return ts.toLocalDateTime().format(TIME_FORMATTER);
        if (o instanceof LocalDateTime ldt) return ldt.format(TIME_FORMATTER);
        return o.toString();
    }
}
