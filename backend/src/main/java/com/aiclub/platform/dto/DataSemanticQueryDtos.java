package com.aiclub.platform.dto;

import java.util.List;
import java.util.Map;

/** DataWorkbench 语义查询协议；物理表列只留在服务端已发布定义中。 */
public final class DataSemanticQueryDtos {
    private DataSemanticQueryDtos() { }
    /** 扫描快照的只读表结构；物理列不可在平台修改，只能用于创建逻辑映射。 */
    public record SchemaTableItem(String schema, String table, List<String> columns) { }
    public record DataSourceItem(Long id, String name, String allowedSchemas, boolean enabled, boolean credentialsConfigured, String scannedAt, List<SchemaTableItem> tables) { }
    public record SemanticModelItem(Long id, Long dataSourceId, String name, int versionNo, String status, Long modelConfigId, String draftDefinitionJson, String publishedDefinitionJson) { }
    public record SemanticQueryDsl(String version, Long semanticModelId, List<String> measures, List<String> dimensions, Map<String, Object> filters, int limit) { }
    public record QueryInterpretation(Long requestId, String status, List<String> normalizedTerms, List<String> usedConcepts, List<String> clarifications, SemanticQueryDsl dsl) { }
    public record QueryPreview(Long requestId, String previewToken, SemanticQueryDsl dsl, String sqlSummary, List<String> usedDefinitions, List<String> clarifications) { }
    public record QueryExecution(Long requestId, String status, List<Map<String, Object>> rows, String summary, String sqlSummary) { }
}
