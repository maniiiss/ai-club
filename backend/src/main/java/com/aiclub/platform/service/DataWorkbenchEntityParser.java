package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityDraft;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityParseResult;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchFieldItem;
import com.aiclub.platform.util.NamingCaseUtils;
import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.Modifier;
import com.github.javaparser.ast.body.ClassOrInterfaceDeclaration;
import com.github.javaparser.ast.body.FieldDeclaration;
import com.github.javaparser.ast.body.VariableDeclarator;
import com.github.javaparser.ast.expr.AnnotationExpr;
import com.github.javaparser.ast.expr.NormalAnnotationExpr;
import com.github.javaparser.ast.expr.SingleMemberAnnotationExpr;
import com.github.javaparser.ast.expr.StringLiteralExpr;
import com.github.javaparser.ast.type.Type;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.create.table.ColDataType;
import net.sf.jsqlparser.statement.create.table.ColumnDefinition;
import net.sf.jsqlparser.statement.create.table.CreateTable;
import net.sf.jsqlparser.statement.create.table.Index;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 数据工作台实体解析服务。
 * 业务意图：管理端粘贴 CREATE TABLE 或 Java 实体类源码时，后端解析出实体骨架 + 字段列表，
 * 返回给前端做“合并回填”，减少手动录入。
 * <p>
 * 本 service 是无状态解析器门面，不落库、不改动其它数据；解析异常统一转成 IllegalArgumentException。
 */
@Service
public class DataWorkbenchEntityParser {

    /**
     * 解析入口，按 sourceType 分派。sourceType 大小写不敏感。
     */
    public DataWorkbenchEntityParseResult parse(String sourceType, String content) {
        if (sourceType == null || sourceType.isBlank()) {
            throw new IllegalArgumentException("源类型不能为空");
        }
        if (content == null || content.isBlank()) {
            throw new IllegalArgumentException("解析内容不能为空");
        }
        String normalized = sourceType.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "DDL", "SQL" -> parseDdl(content);
            case "JAVA" -> parseJava(content);
            default -> throw new IllegalArgumentException("不支持的源类型: " + sourceType);
        };
    }

    /* -------------------- DDL -------------------- */

    private static final Pattern COMMENT_ON_COLUMN = Pattern.compile(
            "COMMENT\\s+ON\\s+COLUMN\\s+([\\w\\.\\\"`]+)\\s+IS\\s+'((?:''|[^'])*)'",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern COMMENT_ON_TABLE = Pattern.compile(
            "COMMENT\\s+ON\\s+TABLE\\s+([\\w\\.\\\"`]+)\\s+IS\\s+'((?:''|[^'])*)'",
            Pattern.CASE_INSENSITIVE);

    private DataWorkbenchEntityParseResult parseDdl(String content) {
        // 多语句 PG dump（含 ALTER TABLE / COMMENT ON）不能直接 parse 单条 Statement，
        // 这里先提取出第一条 CREATE TABLE，再单独尝试 parseStatements 兜底。
        String createTableSnippet = extractCreateTable(content);
        if (createTableSnippet == null) {
            throw new IllegalArgumentException("未找到 CREATE TABLE 语句");
        }
        CreateTable createTable = parseCreateTable(createTableSnippet);
        List<String> warnings = new ArrayList<>();
        String rawTableName = createTable.getTable().getName();
        String tableName = unquote(rawTableName);
        String entityCode = NamingCaseUtils.toCamelCase(tableName);
        String entityName = NamingCaseUtils.capitalize(entityCode);
        // 收集列注释作为字段名兜底 & 同义词种子。
        var columnComments = collectColumnComments(content);
        String tableComment = collectTableComment(content);
        if (tableComment != null && !tableComment.isBlank()) {
            entityName = tableComment;
        }

        List<DataWorkbenchFieldItem> fields = new ArrayList<>();
        List<ColumnDefinition> columns = Optional.ofNullable(createTable.getColumnDefinitions()).orElseGet(List::of);
        Set<String> columnNames = new LinkedHashSet<>();
        LinkedHashSet<String> unknownSqlTypes = new LinkedHashSet<>();
        int sortOrder = 1;
        String inlinePrimaryKey = null;
        for (ColumnDefinition column : columns) {
            String columnName = unquote(column.getColumnName());
            columnNames.add(columnName);
            String sqlTypeName = Optional.ofNullable(column.getColDataType()).map(ColDataType::getDataType).orElse("");
            String dataType = NamingCaseUtils.guessDataTypeFromSql(sqlTypeName);
            if ("STRING".equals(dataType) && !isKnownStringLikeSqlType(sqlTypeName)) {
                unknownSqlTypes.add(sqlTypeName);
            }
            boolean primaryInline = column.getColumnSpecs() != null
                    && column.getColumnSpecs().stream()
                    .filter(Objects::nonNull)
                    .anyMatch(spec -> spec.toUpperCase(Locale.ROOT).contains("PRIMARY"));
            if (primaryInline) {
                inlinePrimaryKey = columnName;
            }
            fields.add(buildFieldItem(sortOrder++, columnName, dataType, columnComments.get(columnName.toLowerCase(Locale.ROOT))));
        }
        for (String unknown : unknownSqlTypes) {
            warnings.add("SQL 类型 " + unknown + " 未识别，已按 STRING 处理");
        }

        // 表级 PRIMARY KEY / UNIQUE 索引
        String primaryKeyColumn = inlinePrimaryKey;
        if (primaryKeyColumn == null && createTable.getIndexes() != null) {
            for (Index index : createTable.getIndexes()) {
                if (index == null || index.getType() == null) {
                    continue;
                }
                if (index.getType().toUpperCase(Locale.ROOT).contains("PRIMARY")
                        && index.getColumnsNames() != null
                        && !index.getColumnsNames().isEmpty()) {
                    primaryKeyColumn = unquote(index.getColumnsNames().get(0));
                    break;
                }
            }
        }
        if (primaryKeyColumn == null) {
            primaryKeyColumn = columnNames.contains("id") ? "id" : columnNames.stream().findFirst().orElse("id");
            warnings.add("未识别主键，默认使用 " + primaryKeyColumn);
        }

        // platformProjectId 由管理员在弹窗里显式选择，解析器不做推断（业务 DDL 与平台项目没有必然映射）。
        DataWorkbenchEntityDraft draft = buildDraft(entityCode, entityName, tableName,
                primaryKeyColumn, null, fields);
        return new DataWorkbenchEntityParseResult(draft, warnings);
    }

    /**
     * 从可能包含多条语句、ALTER TABLE、COMMENT ON 的 PG dump 中提取第一条 CREATE TABLE。
     */
    private String extractCreateTable(String content) {
        String stripped = content;
        int upperStart = indexOfIgnoreCase(stripped, "CREATE TABLE");
        if (upperStart < 0) {
            return null;
        }
        // 从 CREATE TABLE 位置起找配对括号，找到收尾 ) 后再跟到分号即可。
        int paren = stripped.indexOf('(', upperStart);
        if (paren < 0) {
            return null;
        }
        int depth = 0;
        int end = -1;
        for (int i = paren; i < stripped.length(); i++) {
            char ch = stripped.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth--;
                if (depth == 0) {
                    end = i;
                    break;
                }
            } else if (ch == '\'') {
                // 跳过字符串字面量。
                i = findClosingQuote(stripped, i);
                if (i < 0) {
                    return null;
                }
            }
        }
        if (end < 0) {
            return null;
        }
        // 结尾可选择带 WITH / TABLESPACE / 分号，这里直接截到收尾括号即可满足 JSqlParser。
        return stripped.substring(upperStart, end + 1);
    }

    private int findClosingQuote(String text, int start) {
        for (int i = start + 1; i < text.length(); i++) {
            if (text.charAt(i) == '\'') {
                if (i + 1 < text.length() && text.charAt(i + 1) == '\'') {
                    i++;
                    continue;
                }
                return i;
            }
        }
        return -1;
    }

    private int indexOfIgnoreCase(String haystack, String needle) {
        return haystack.toUpperCase(Locale.ROOT).indexOf(needle.toUpperCase(Locale.ROOT));
    }

    private CreateTable parseCreateTable(String snippet) {
        try {
            Statement statement = CCJSqlParserUtil.parse(snippet);
            if (statement instanceof CreateTable ct) {
                return ct;
            }
            throw new IllegalArgumentException("仅支持 CREATE TABLE 语句");
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception primary) {
            // JSqlParser 对 PG 的 COLLATE / OWNER TO 等语法可能报错，去掉 COLLATE 与引号后再试一次。
            String simplified = snippet
                    .replaceAll("(?i)COLLATE\\s+\\\"[^\\\"]+\\\"\\.\\\"[^\\\"]+\\\"", "")
                    .replaceAll("(?i)COLLATE\\s+\\\"[^\\\"]+\\\"", "")
                    .replaceAll("(?i)COLLATE\\s+[\\w\\.]+", "")
                    .replaceAll("\\\"", "");
            try {
                Statement statement = CCJSqlParserUtil.parse(simplified);
                if (statement instanceof CreateTable ct) {
                    return ct;
                }
                throw new IllegalArgumentException("仅支持 CREATE TABLE 语句");
            } catch (Exception secondary) {
                throw new IllegalArgumentException("DDL 解析失败: " + rootMessage(secondary));
            }
        }
    }

    private java.util.Map<String, String> collectColumnComments(String content) {
        java.util.Map<String, String> map = new java.util.HashMap<>();
        Matcher matcher = COMMENT_ON_COLUMN.matcher(content);
        while (matcher.find()) {
            String qualified = matcher.group(1);
            String comment = matcher.group(2).replace("''", "'");
            String[] parts = qualified.split("\\.");
            String columnName = unquote(parts[parts.length - 1]).toLowerCase(Locale.ROOT);
            map.put(columnName, comment);
        }
        return map;
    }

    private String collectTableComment(String content) {
        Matcher matcher = COMMENT_ON_TABLE.matcher(content);
        if (matcher.find()) {
            return matcher.group(2).replace("''", "'");
        }
        return null;
    }

    /* -------------------- Java -------------------- */

    private DataWorkbenchEntityParseResult parseJava(String content) {
        CompilationUnit unit;
        try {
            unit = StaticJavaParser.parse(content);
        } catch (Exception e) {
            throw new IllegalArgumentException("Java 类解析失败: " + rootMessage(e));
        }
        Optional<ClassOrInterfaceDeclaration> classOpt = unit.getTypes().stream()
                .filter(ClassOrInterfaceDeclaration.class::isInstance)
                .map(ClassOrInterfaceDeclaration.class::cast)
                .filter(decl -> !decl.isInterface())
                .findFirst();
        if (classOpt.isEmpty()) {
            throw new IllegalArgumentException("未找到可解析的 Java 类");
        }
        ClassOrInterfaceDeclaration clazz = classOpt.get();
        List<String> warnings = new ArrayList<>();
        String className = clazz.getNameAsString();
        String entityName = className;
        String entityCode = decapitalize(className);

        String tableName = findAnnotationStringValue(clazz.getAnnotations(), Set.of("Table", "TableName"), "name")
                .orElseGet(() -> NamingCaseUtils.toSnakeCase(className));

        List<DataWorkbenchFieldItem> fields = new ArrayList<>();
        Set<String> fieldCodes = new HashSet<>();
        LinkedHashSet<String> unknownJavaTypes = new LinkedHashSet<>();
        String primaryKeyColumn = null;
        int sortOrder = 1;

        for (FieldDeclaration fieldDecl : clazz.getFields()) {
            if (fieldDecl.isStatic() || isTransient(fieldDecl)) {
                continue;
            }
            for (VariableDeclarator variable : fieldDecl.getVariables()) {
                String rawFieldName = variable.getNameAsString();
                if ("serialVersionUID".equals(rawFieldName)) {
                    continue;
                }
                if (!fieldCodes.add(rawFieldName)) {
                    continue;
                }
                Type variableType = variable.getType();
                String simpleType = variableType == null ? "" : variableType.asString();
                String dataType = NamingCaseUtils.guessDataTypeFromJava(simpleType);
                if ("STRING".equals(dataType) && !isKnownStringLikeJavaType(simpleType)) {
                    unknownJavaTypes.add(simpleType);
                }
                String columnName = findAnnotationStringValue(fieldDecl.getAnnotations(),
                        Set.of("Column", "TableField"), "name")
                        .orElseGet(() -> NamingCaseUtils.toSnakeCase(rawFieldName));
                boolean isId = hasAnyAnnotation(fieldDecl.getAnnotations(), Set.of("Id", "TableId"));
                if (isId && primaryKeyColumn == null) {
                    primaryKeyColumn = columnName;
                }
                // 解析出的字段默认 updatable/locator/sensitive 都为 false，由管理员在表单里再勾选，避免误开写权限。
                DataWorkbenchFieldItem item = new DataWorkbenchFieldItem(
                        null,
                        rawFieldName,
                        rawFieldName,
                        columnName,
                        dataType,
                        "",
                        false,
                        false,
                        false,
                        true,
                        sortOrder++);
                fields.add(item);
            }
        }

        for (String unknownType : unknownJavaTypes) {
            warnings.add("Java 类型 " + unknownType + " 未识别，相关字段已按 STRING 处理");
        }

        if (primaryKeyColumn == null) {
            primaryKeyColumn = fields.stream()
                    .map(DataWorkbenchFieldItem::columnName)
                    .filter(name -> "id".equalsIgnoreCase(name))
                    .findFirst()
                    .orElseGet(() -> fields.isEmpty() ? "id" : fields.get(0).columnName());
            warnings.add("未识别主键（缺少 @Id / @TableId 注解），默认使用 " + primaryKeyColumn);
        }
        // platformProjectId 由管理员在弹窗里显式选择，解析器不做推断（业务实体本身不携带平台项目归属信息）。
        DataWorkbenchEntityDraft draft = buildDraft(entityCode, entityName, tableName,
                primaryKeyColumn, null, fields);
        return new DataWorkbenchEntityParseResult(draft, warnings);
    }

    /* -------------------- helpers -------------------- */

    private DataWorkbenchEntityDraft buildDraft(String entityCode,
                                                String entityName,
                                                String tableName,
                                                String primaryKeyColumn,
                                                Long platformProjectId,
                                                List<DataWorkbenchFieldItem> fields) {
        return new DataWorkbenchEntityDraft(
                entityCode,
                entityName,
                "",
                tableName,
                primaryKeyColumn,
                platformProjectId,
                1,
                DataPermissionScopeType.PROJECT_PARTICIPANT,
                DataPermissionScopeType.OWNER_OR_CREATOR,
                DataPermissionScopeType.OWNER_OR_CREATOR,
                Boolean.TRUE,
                fields);
    }

    private DataWorkbenchFieldItem buildFieldItem(int sortOrder,
                                                  String columnName,
                                                  String dataType,
                                                  String columnComment) {
        String fieldCode = NamingCaseUtils.toCamelCase(columnName);
        // 若数据库注释可读，优先用作 fieldName（含中文时更直观）；同义词种子也放注释。
        String fieldName = (columnComment == null || columnComment.isBlank()) ? fieldCode : columnComment.trim();
        String synonyms = (columnComment == null || columnComment.isBlank()) ? "" : columnComment.trim();
        return new DataWorkbenchFieldItem(
                null,
                fieldCode,
                fieldName,
                columnName,
                dataType,
                synonyms,
                false,
                false,
                false,
                true,
                sortOrder);
    }

    private boolean hasAnyAnnotation(List<AnnotationExpr> annotations, Set<String> targetNames) {
        if (annotations == null) {
            return false;
        }
        for (AnnotationExpr annotation : annotations) {
            if (targetNames.contains(annotation.getNameAsString())) {
                return true;
            }
        }
        return false;
    }

    /**
     * 从注解列表里找到目标注解，读取字符串成员值。
     * 支持 @Table(name="xxx")（NormalAnnotationExpr）与 @TableName("xxx")（SingleMemberAnnotationExpr）。
     */
    private Optional<String> findAnnotationStringValue(List<AnnotationExpr> annotations,
                                                       Set<String> targetNames,
                                                       String memberName) {
        if (annotations == null || annotations.isEmpty()) {
            return Optional.empty();
        }
        for (AnnotationExpr annotation : annotations) {
            if (!targetNames.contains(annotation.getNameAsString())) {
                continue;
            }
            if (annotation instanceof SingleMemberAnnotationExpr single) {
                if (single.getMemberValue() instanceof StringLiteralExpr literal) {
                    String value = literal.asString();
                    if (!value.isBlank()) {
                        return Optional.of(value);
                    }
                }
            } else if (annotation instanceof NormalAnnotationExpr normal) {
                for (var pair : normal.getPairs()) {
                    if (memberName.equals(pair.getNameAsString())
                            && pair.getValue() instanceof StringLiteralExpr literal) {
                        String value = literal.asString();
                        if (!value.isBlank()) {
                            return Optional.of(value);
                        }
                    }
                }
            }
        }
        return Optional.empty();
    }

    private boolean isTransient(FieldDeclaration fieldDecl) {
        boolean transientKeyword = fieldDecl.getModifiers().stream()
                .anyMatch(m -> m.getKeyword() == Modifier.Keyword.TRANSIENT);
        if (transientKeyword) {
            return true;
        }
        if (hasAnyAnnotation(fieldDecl.getAnnotations(), Set.of("Transient"))) {
            return true;
        }
        // MyBatis-Plus @TableField(exist = false) 也应视为非表字段。
        return fieldDecl.getAnnotations().stream()
                .filter(a -> "TableField".equals(a.getNameAsString()))
                .filter(NormalAnnotationExpr.class::isInstance)
                .map(NormalAnnotationExpr.class::cast)
                .flatMap(a -> a.getPairs().stream())
                .anyMatch(p -> "exist".equals(p.getNameAsString())
                        && "false".equalsIgnoreCase(p.getValue().toString()));
    }

    private String decapitalize(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return Character.toLowerCase(value.charAt(0)) + value.substring(1);
    }

    private String unquote(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        String trimmed = value.trim();
        if (trimmed.length() >= 2) {
            char first = trimmed.charAt(0);
            char last = trimmed.charAt(trimmed.length() - 1);
            if ((first == '`' && last == '`') || (first == '"' && last == '"') || (first == '\'' && last == '\'')) {
                return trimmed.substring(1, trimmed.length() - 1);
            }
        }
        return trimmed;
    }

    private boolean isKnownStringLikeSqlType(String sqlTypeName) {
        if (sqlTypeName == null) {
            return false;
        }
        String upper = sqlTypeName.trim().toUpperCase(Locale.ROOT);
        return upper.startsWith("VARCHAR") || upper.startsWith("CHAR") || upper.startsWith("TEXT")
                || upper.startsWith("CLOB") || upper.startsWith("DATE") || upper.startsWith("TIME")
                || upper.startsWith("TIMESTAMP") || upper.startsWith("DECIMAL") || upper.startsWith("NUMERIC")
                || upper.startsWith("DOUBLE") || upper.startsWith("FLOAT") || upper.startsWith("REAL")
                || upper.startsWith("UUID") || upper.startsWith("JSON");
    }

    private boolean isKnownStringLikeJavaType(String simpleType) {
        if (simpleType == null) {
            return false;
        }
        String type = simpleType.trim();
        int idx = type.indexOf('<');
        if (idx > 0) {
            type = type.substring(0, idx);
        }
        return switch (type) {
            case "String", "java.lang.String", "LocalDate", "LocalDateTime", "LocalTime",
                    "Instant", "OffsetDateTime", "ZonedDateTime", "Date", "Timestamp",
                    "BigDecimal", "BigInteger", "Double", "double", "Float", "float", "UUID" -> true;
            default -> false;
        };
    }

    private String rootMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? current.getClass().getSimpleName() : message;
    }
}
