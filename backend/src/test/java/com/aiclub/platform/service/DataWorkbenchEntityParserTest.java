package com.aiclub.platform.service;

import com.aiclub.platform.common.DataPermissionScopeType;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchEntityParseResult;
import com.aiclub.platform.dto.DataWorkbenchDtos.DataWorkbenchFieldItem;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * DataWorkbench 实体解析器测试。
 * 覆盖 DDL、JPA 注解、MyBatis-Plus 注解、无注解字段推断以及异常路径。
 */
class DataWorkbenchEntityParserTest {

    private final DataWorkbenchEntityParser parser = new DataWorkbenchEntityParser();

    @Test
    void parseDdlExtractsPrimaryKeyAndProjectColumn() {
        String ddl = "CREATE TABLE project (" +
                "  id BIGINT PRIMARY KEY," +
                "  project_id BIGINT NOT NULL," +
                "  project_code VARCHAR(64)," +
                "  qualification_required BOOLEAN DEFAULT FALSE," +
                "  created_at TIMESTAMP" +
                ")";

        DataWorkbenchEntityParseResult result = parser.parse("DDL", ddl);

        assertThat(result.draft().tableName()).isEqualTo("project");
        assertThat(result.draft().entityCode()).isEqualTo("project");
        assertThat(result.draft().primaryKeyColumn()).isEqualTo("id");
        // platformProjectId 由管理员在表单里显式选择平台项目，解析器不推断。
        assertThat(result.draft().platformProjectId()).isNull();
        assertThat(result.warnings()).noneMatch(w -> w.contains("项目列"));
        assertThat(result.draft().maxAffectedRows()).isEqualTo(1);
        assertThat(result.draft().requestScope()).isEqualTo(DataPermissionScopeType.PROJECT_PARTICIPANT);
        assertThat(result.draft().executeScope()).isEqualTo(DataPermissionScopeType.OWNER_OR_CREATOR);
        assertThat(result.draft().rollbackScope()).isEqualTo(DataPermissionScopeType.OWNER_OR_CREATOR);
        assertThat(result.draft().enabled()).isTrue();

        Map<String, String> types = result.draft().fields().stream()
                .collect(java.util.stream.Collectors.toMap(DataWorkbenchFieldItem::columnName, DataWorkbenchFieldItem::dataType));
        assertThat(types).containsEntry("id", "LONG");
        assertThat(types).containsEntry("project_id", "LONG");
        assertThat(types).containsEntry("project_code", "STRING");
        assertThat(types).containsEntry("qualification_required", "BOOLEAN");
        assertThat(types).containsEntry("created_at", "STRING");

        // 字段编码应回填成 camelCase，updatable 默认 false 由管理员再勾选。
        DataWorkbenchFieldItem qualification = result.draft().fields().stream()
                .filter(f -> "qualification_required".equals(f.columnName()))
                .findFirst().orElseThrow();
        assertThat(qualification.fieldCode()).isEqualTo("qualificationRequired");
        assertThat(qualification.updatable()).isFalse();
        assertThat(qualification.enabled()).isTrue();
    }

    @Test
    void parseDdlDetectsTableLevelPrimaryKey() {
        String ddl = "CREATE TABLE project_member (" +
                "  member_id BIGINT NOT NULL," +
                "  project_id BIGINT NOT NULL," +
                "  role VARCHAR(32)," +
                "  PRIMARY KEY (member_id)" +
                ")";

        DataWorkbenchEntityParseResult result = parser.parse("DDL", ddl);

        assertThat(result.draft().primaryKeyColumn()).isEqualTo("member_id");
        assertThat(result.draft().platformProjectId()).isNull();
        assertThat(result.warnings()).isEmpty();
    }

    @Test
    void parseDdlDoesNotGuessProjectColumn() {
        String ddl = "CREATE TABLE audit_log (" +
                "  log_id BIGINT PRIMARY KEY," +
                "  message VARCHAR(255)" +
                ")";

        DataWorkbenchEntityParseResult result = parser.parse("DDL", ddl);

        assertThat(result.draft().platformProjectId()).isNull();
        assertThat(result.warnings()).noneMatch(w -> w.contains("项目列"));
    }

    @Test
    void parseJpaEntity() {
        String java = """
                package com.example;

                import jakarta.persistence.Column;
                import jakarta.persistence.Entity;
                import jakarta.persistence.Id;
                import jakarta.persistence.Table;

                @Entity
                @Table(name = "project")
                public class ProjectEntity {

                    @Id
                    private Long id;

                    @Column(name = "project_id")
                    private Long projectId;

                    @Column(name = "project_code")
                    private String projectCode;

                    private Boolean qualificationRequired;

                    private transient String skipMe;
                }
                """;

        DataWorkbenchEntityParseResult result = parser.parse("JAVA", java);

        assertThat(result.draft().entityName()).isEqualTo("ProjectEntity");
        assertThat(result.draft().tableName()).isEqualTo("project");
        assertThat(result.draft().primaryKeyColumn()).isEqualTo("id");
        // platformProjectId 由管理员在弹窗里选择，解析器不做推断。
        assertThat(result.draft().platformProjectId()).isNull();

        List<String> columnNames = result.draft().fields().stream()
                .map(DataWorkbenchFieldItem::columnName)
                .toList();
        assertThat(columnNames)
                .containsExactly("id", "project_id", "project_code", "qualification_required");
        DataWorkbenchFieldItem qualification = result.draft().fields().stream()
                .filter(f -> "qualification_required".equals(f.columnName()))
                .findFirst().orElseThrow();
        assertThat(qualification.dataType()).isEqualTo("BOOLEAN");
        assertThat(qualification.fieldCode()).isEqualTo("qualificationRequired");
    }

    @Test
    void parseMybatisPlusEntity() {
        String java = """
                import com.baomidou.mybatisplus.annotation.TableField;
                import com.baomidou.mybatisplus.annotation.TableId;
                import com.baomidou.mybatisplus.annotation.TableName;

                @TableName("project")
                public class Project {
                    @TableId
                    private Long id;
                    @TableField("project_id")
                    private Long projectId;
                    private String projectCode;
                    @TableField(exist = false)
                    private String virtualField;
                }
                """;

        DataWorkbenchEntityParseResult result = parser.parse("JAVA", java);

        assertThat(result.draft().tableName()).isEqualTo("project");
        assertThat(result.draft().primaryKeyColumn()).isEqualTo("id");
        assertThat(result.draft().platformProjectId()).isNull();
        List<String> columns = result.draft().fields().stream()
                .map(DataWorkbenchFieldItem::columnName).toList();
        assertThat(columns).containsExactly("id", "project_id", "project_code");
        assertThat(columns).doesNotContain("virtual_field");
    }

    @Test
    void parseLombokEntityWithoutAnnotations() {
        String java = """
                import lombok.Data;

                @Data
                public class OrderRecord {
                    private Long id;
                    private Long projectId;
                    private String customerName;
                    private Integer amount;
                }
                """;

        DataWorkbenchEntityParseResult result = parser.parse("JAVA", java);

        assertThat(result.draft().entityCode()).isEqualTo("orderRecord");
        assertThat(result.draft().tableName()).isEqualTo("order_record");
        assertThat(result.draft().primaryKeyColumn()).isEqualTo("id");
        assertThat(result.draft().platformProjectId()).isNull();
        assertThat(result.warnings()).anyMatch(w -> w.contains("主键"));

        DataWorkbenchFieldItem amount = result.draft().fields().stream()
                .filter(f -> "amount".equals(f.fieldCode()))
                .findFirst().orElseThrow();
        assertThat(amount.dataType()).isEqualTo("INTEGER");
        assertThat(amount.columnName()).isEqualTo("amount");
    }

    @Test
    void rejectsInvalidDdl() {
        assertThatThrownBy(() -> parser.parse("DDL", "this is not sql"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("CREATE TABLE");
    }

    @Test
    void rejectsUnknownSourceType() {
        assertThatThrownBy(() -> parser.parse("YAML", "content"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不支持的源类型");
    }

    @Test
    void rejectsJavaWithoutClass() {
        assertThatThrownBy(() -> parser.parse("JAVA", "package foo;"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Java");
    }

    @Test
    void parsesPostgresDumpWithSchemaCollateAndComments() {
        String ddl = """
                CREATE TABLE "prod"."project_field_config" (
                  "id" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
                  "project_type" varchar(64) COLLATE "pg_catalog"."default",
                  "module" varchar(64) COLLATE "pg_catalog"."default",
                  "field" varchar(128) COLLATE "pg_catalog"."default",
                  "field_name" varchar(128) COLLATE "pg_catalog"."default",
                  "is_configured" int4,
                  "is_edit" int4,
                  "field_type" varchar(128) COLLATE "pg_catalog"."default",
                  "remark" varchar(1024) COLLATE "pg_catalog"."default",
                  CONSTRAINT "project_field_config_pkey" PRIMARY KEY ("id")
                );

                ALTER TABLE "prod"."project_field_config" OWNER TO "admin";

                COMMENT ON COLUMN "prod"."project_field_config"."project_type" IS '项目类型';
                COMMENT ON COLUMN "prod"."project_field_config"."field_name" IS '字段名';
                COMMENT ON TABLE "prod"."project_field_config" IS '项目字段配置';
                """;

        DataWorkbenchEntityParseResult result = parser.parse("DDL", ddl);

        assertThat(result.draft().tableName()).isEqualTo("project_field_config");
        assertThat(result.draft().entityName()).isEqualTo("项目字段配置");
        assertThat(result.draft().primaryKeyColumn()).isEqualTo("id");
        List<String> columns = result.draft().fields().stream()
                .map(DataWorkbenchFieldItem::columnName).toList();
        assertThat(columns).contains("id", "project_type", "module", "field",
                "field_name", "is_configured", "is_edit", "field_type", "remark");

        DataWorkbenchFieldItem projectType = result.draft().fields().stream()
                .filter(f -> "project_type".equals(f.columnName()))
                .findFirst().orElseThrow();
        assertThat(projectType.fieldName()).isEqualTo("项目类型");
        assertThat(projectType.synonyms()).isEqualTo("项目类型");
        assertThat(projectType.dataType()).isEqualTo("STRING");

        DataWorkbenchFieldItem isConfigured = result.draft().fields().stream()
                .filter(f -> "is_configured".equals(f.columnName()))
                .findFirst().orElseThrow();
        assertThat(isConfigured.dataType()).isEqualTo("INTEGER");
    }

    @Test
    void javaUnknownTypesReportedOnceEach() {
        String java = """
                import com.baomidou.mybatisplus.annotation.TableId;
                import com.baomidou.mybatisplus.annotation.TableName;

                @TableName("agent_bidding_analysis")
                public class AgentBiddingAnalysis {
                    @TableId
                    private String id;
                    private AgentBiddingAnalysisValue projectAddress;
                    private AgentBiddingAnalysisValue projectAmount;
                    private AgentBiddingAnalysisValue biddingMode;
                    private PreTenderDocumentReviewVo review;
                }
                """;

        DataWorkbenchEntityParseResult result = parser.parse("JAVA", java);

        long addressWarnings = result.warnings().stream()
                .filter(w -> w.contains("AgentBiddingAnalysisValue")).count();
        assertThat(addressWarnings).isEqualTo(1);
        long reviewWarnings = result.warnings().stream()
                .filter(w -> w.contains("PreTenderDocumentReviewVo")).count();
        assertThat(reviewWarnings).isEqualTo(1);
    }
}
