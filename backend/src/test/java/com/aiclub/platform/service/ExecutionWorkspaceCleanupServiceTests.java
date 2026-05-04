package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.ExecutionWorkspaceCleanupEntity;
import com.aiclub.platform.repository.ExecutionWorkspaceCleanupRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.transaction.annotation.Transactional;

import javax.sql.DataSource;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 工作区清理持久化底座需要同时验证服务层生命周期规则与真实数据库约束，
 * 避免后续清理调度接入时才暴露 JPA 映射、派生查询或 SQL 迁移的不一致问题。
 */
@SpringBootTest
@Transactional
class ExecutionWorkspaceCleanupServiceTests {

    @Autowired
    private ExecutionWorkspaceCleanupService executionWorkspaceCleanupService;

    @Autowired
    private ExecutionWorkspaceCleanupRepository executionWorkspaceCleanupRepository;

    /**
     * 同一次 run 下，同一个工作区根目录只能登记一条清理记录；
     * 如果该记录已经进入 SCHEDULED 等后续生命周期，重复登记只能刷新链路关联，不能把状态回滚成 ACTIVE。
     */
    @Test
    void shouldRegisterWorkspaceRootOncePerRun() {
        ExecutionWorkspaceCleanupEntity created = executionWorkspaceCleanupService.registerWorkspace(
                101L,
                202L,
                11L,
                "session-old",
                "C:/tmp/run-202/workspace-a"
        );

        LocalDateTime scheduledAt = LocalDateTime.of(2026, 5, 4, 10, 15, 0);
        created.setStatus(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        created.setExecutionResultStatus("SUCCESS");
        created.setScheduledAt(scheduledAt);
        created.setExpiresAt(scheduledAt.plusHours(24));
        created.setDeleteErrorMessage("等待异步删除");
        executionWorkspaceCleanupRepository.saveAndFlush(created);

        ExecutionWorkspaceCleanupEntity saved = executionWorkspaceCleanupService.registerWorkspace(
                101L,
                202L,
                12L,
                "session-new",
                "C:/tmp/run-202/workspace-a"
        );

        assertThat(saved.getId()).isEqualTo(created.getId());
        assertThat(saved.getExecutionTaskId()).isEqualTo(101L);
        assertThat(saved.getExecutionRunId()).isEqualTo(202L);
        assertThat(saved.getExecutionStepId()).isEqualTo(12L);
        assertThat(saved.getRunnerSessionId()).isEqualTo("session-new");
        assertThat(saved.getWorkspaceRoot()).isEqualTo("C:/tmp/run-202/workspace-a");
        assertThat(saved.getStatus()).isEqualTo(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        assertThat(saved.getExecutionResultStatus()).isEqualTo("SUCCESS");
        assertThat(saved.getScheduledAt()).isEqualTo(scheduledAt);
        assertThat(saved.getExpiresAt()).isEqualTo(scheduledAt.plusHours(24));
        assertThat(saved.getDeleteErrorMessage()).isEqualTo("等待异步删除");

        List<ExecutionWorkspaceCleanupEntity> allRecords = executionWorkspaceCleanupRepository.findAll();
        assertThat(allRecords).hasSize(1);
        assertThat(executionWorkspaceCleanupRepository.findByExecutionRunIdAndWorkspaceRoot(
                202L,
                "C:/tmp/run-202/workspace-a"
        )).hasValueSatisfying(entity -> assertThat(entity.getId()).isEqualTo(created.getId()));
    }

    /**
     * 运行结束后只应调度 ACTIVE 工作区，
     * 已经进入后续生命周期的记录不能被重复计算到本次调度结果里。
     */
    @Test
    void shouldScheduleActiveWorkspacesAfterRunFinishes() {
        LocalDateTime scheduledAt = LocalDateTime.of(2026, 5, 4, 9, 30, 0);

        executionWorkspaceCleanupService.registerWorkspace(
                900L,
                300L,
                901L,
                "session-1",
                "C:/tmp/run-300/workspace-a"
        );
        executionWorkspaceCleanupService.registerWorkspace(
                900L,
                300L,
                902L,
                "session-2",
                "C:/tmp/run-300/workspace-b"
        );

        ExecutionWorkspaceCleanupEntity scheduled = new ExecutionWorkspaceCleanupEntity();
        scheduled.setExecutionTaskId(900L);
        scheduled.setExecutionRunId(300L);
        scheduled.setExecutionStepId(903L);
        scheduled.setRunnerSessionId("session-3");
        scheduled.setWorkspaceRoot("C:/tmp/run-300/workspace-c");
        scheduled.setStatus(ExecutionWorkspaceCleanupService.STATUS_SCHEDULED);
        scheduled.setExecutionResultStatus("FAILED");
        scheduled.setScheduledAt(scheduledAt.minusHours(1));
        scheduled.setExpiresAt(scheduledAt.plusHours(23));
        scheduled.setDeleteErrorMessage("已在队列中");
        executionWorkspaceCleanupRepository.saveAndFlush(scheduled);

        int scheduledCount = executionWorkspaceCleanupService.scheduleCleanupForRun(300L, "FAILED", scheduledAt);

        assertThat(scheduledCount).isEqualTo(2);

        List<ExecutionWorkspaceCleanupEntity> scheduledRecords =
                executionWorkspaceCleanupRepository.findAllByExecutionRunIdAndStatusOrderByIdAsc(
                        300L,
                        ExecutionWorkspaceCleanupService.STATUS_SCHEDULED
                );
        assertThat(scheduledRecords).hasSize(3);
        assertThat(scheduledRecords)
                .filteredOn(entity -> entity.getWorkspaceRoot().endsWith("workspace-a") || entity.getWorkspaceRoot().endsWith("workspace-b"))
                .allSatisfy(entity -> {
                    assertThat(entity.getExecutionResultStatus()).isEqualTo("FAILED");
                    assertThat(entity.getScheduledAt()).isEqualTo(scheduledAt);
                    assertThat(entity.getExpiresAt()).isEqualTo(scheduledAt.plusHours(24));
                    assertThat(entity.getDeleteErrorMessage()).isNull();
                });
        assertThat(scheduledRecords)
                .filteredOn(entity -> entity.getWorkspaceRoot().endsWith("workspace-c"))
                .singleElement()
                .satisfies(entity -> {
                    assertThat(entity.getExecutionResultStatus()).isEqualTo("FAILED");
                    assertThat(entity.getScheduledAt()).isEqualTo(scheduledAt.minusHours(1));
                    assertThat(entity.getExpiresAt()).isEqualTo(scheduledAt.plusHours(23));
                    assertThat(entity.getDeleteErrorMessage()).isEqualTo("已在队列中");
                });
    }

    /**
     * 到期扫描只能返回已经排期且真正到期的记录，并且要受批量大小限制，
     * 避免调度器一次性拉全表导致长事务或把未到期目录提前删除。
     */
    @Test
    void shouldFindExpiredScheduledWorkspacesInBatchOrder() {
        LocalDateTime now = LocalDateTime.of(2026, 5, 4, 12, 0, 0);

        executionWorkspaceCleanupRepository.save(buildCleanupRecord(
                401L,
                "C:/tmp/run-401/workspace-a",
                ExecutionWorkspaceCleanupService.STATUS_SCHEDULED,
                now.minusMinutes(20)
        ));
        executionWorkspaceCleanupRepository.save(buildCleanupRecord(
                402L,
                "C:/tmp/run-402/workspace-b",
                ExecutionWorkspaceCleanupService.STATUS_SCHEDULED,
                now.minusMinutes(10)
        ));
        executionWorkspaceCleanupRepository.save(buildCleanupRecord(
                403L,
                "C:/tmp/run-403/workspace-c",
                ExecutionWorkspaceCleanupService.STATUS_SCHEDULED,
                now.plusMinutes(10)
        ));
        executionWorkspaceCleanupRepository.save(buildCleanupRecord(
                404L,
                "C:/tmp/run-404/workspace-d",
                ExecutionWorkspaceCleanupService.STATUS_ACTIVE,
                now.minusMinutes(30)
        ));
        executionWorkspaceCleanupRepository.flush();

        List<ExecutionWorkspaceCleanupEntity> expired =
                executionWorkspaceCleanupService.findExpiredScheduledWorkspaces(now, 1);

        assertThat(expired)
                .extracting(ExecutionWorkspaceCleanupEntity::getWorkspaceRoot)
                .containsExactly("C:/tmp/run-401/workspace-a");
    }

    /**
     * 删除成功后需要把生命周期切到 DELETED，并清空失败态遗留字段，
     * 否则执行详情会同时看到“已删除”和历史失败原因，造成状态歧义。
     */
    @Test
    void shouldMarkWorkspaceDeletedAndClearFailureState() {
        ExecutionWorkspaceCleanupEntity entity = buildCleanupRecord(
                501L,
                "C:/tmp/run-501/workspace-a",
                "DELETE_FAILED",
                LocalDateTime.of(2026, 5, 4, 8, 0, 0)
        );
        entity.setDeleteFailedAt(LocalDateTime.of(2026, 5, 4, 9, 0, 0));
        entity.setDeleteErrorMessage("目录被占用");
        ExecutionWorkspaceCleanupEntity saved = executionWorkspaceCleanupRepository.saveAndFlush(entity);

        LocalDateTime deletedAt = LocalDateTime.of(2026, 5, 4, 10, 0, 0);
        executionWorkspaceCleanupService.markDeleted(saved.getId(), deletedAt);

        ExecutionWorkspaceCleanupEntity refreshed = executionWorkspaceCleanupRepository.findById(saved.getId()).orElseThrow();
        assertThat(refreshed.getStatus()).isEqualTo("DELETED");
        assertThat(refreshed.getDeletedAt()).isEqualTo(deletedAt);
        assertThat(refreshed.getDeleteFailedAt()).isNull();
        assertThat(refreshed.getDeleteErrorMessage()).isNull();
    }

    /**
     * 删除失败时需要保留失败原因和失败时间，
     * 让后续排障能知道当前记录为什么停在 DELETE_FAILED。
     */
    @Test
    void shouldMarkWorkspaceDeleteFailedWithErrorMessage() {
        ExecutionWorkspaceCleanupEntity entity = executionWorkspaceCleanupRepository.saveAndFlush(buildCleanupRecord(
                601L,
                "C:/tmp/run-601/workspace-a",
                ExecutionWorkspaceCleanupService.STATUS_SCHEDULED,
                LocalDateTime.of(2026, 5, 4, 8, 0, 0)
        ));

        LocalDateTime failedAt = LocalDateTime.of(2026, 5, 4, 10, 30, 0);
        executionWorkspaceCleanupService.markDeleteFailed(savedId(entity), failedAt, "目录被占用");

        ExecutionWorkspaceCleanupEntity refreshed = executionWorkspaceCleanupRepository.findById(entity.getId()).orElseThrow();
        assertThat(refreshed.getStatus()).isEqualTo("DELETE_FAILED");
        assertThat(refreshed.getDeletedAt()).isNull();
        assertThat(refreshed.getDeleteFailedAt()).isEqualTo(failedAt);
        assertThat(refreshed.getDeleteErrorMessage()).isEqualTo("目录被占用");
    }

    /**
     * 迁移脚本必须能在真实数据库里创建出唯一约束，
     * 否则服务层“先查后写”的复用逻辑在并发下无法兜底。
     */
    @Test
    void shouldApplyMigrationAndEnforceUniqueConstraintInDatabase() {
        DataSource dataSource = createMigrationTestDataSource();
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);

        jdbcTemplate.execute("CREATE TABLE execution_task (id BIGINT PRIMARY KEY)");
        jdbcTemplate.execute("CREATE TABLE execution_run (id BIGINT PRIMARY KEY)");
        jdbcTemplate.execute("CREATE TABLE execution_step (id BIGINT PRIMARY KEY)");
        new ResourceDatabasePopulator(false, false, StandardCharsets.UTF_8.name(),
                new ClassPathResource("db/migration/V58__execution_workspace_cleanup.sql"),
                new ClassPathResource("db/migration/V59__execution_workspace_cleanup_deletion_state.sql"))
                .execute(dataSource);

        jdbcTemplate.update("INSERT INTO execution_task (id) VALUES (?)", 1L);
        jdbcTemplate.update("INSERT INTO execution_run (id) VALUES (?)", 2L);
        jdbcTemplate.update("INSERT INTO execution_step (id) VALUES (?)", 3L);
        jdbcTemplate.update("""
                INSERT INTO execution_workspace_cleanup
                    (execution_task_id, execution_run_id, execution_step_id, runner_session_id, workspace_root,
                     status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, 1L, 2L, 3L, "session-1", "C:/tmp/run-2/workspace-a", "ACTIVE");

        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO execution_workspace_cleanup
                    (execution_task_id, execution_run_id, execution_step_id, runner_session_id, workspace_root,
                     status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, 1L, 2L, 3L, "session-2", "C:/tmp/run-2/workspace-a", "ACTIVE"))
                .isInstanceOf(Exception.class);

        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM execution_workspace_cleanup WHERE execution_run_id = ?",
                Integer.class,
                2L
        );
        assertThat(count).isEqualTo(1);
    }

    private DataSource createMigrationTestDataSource() {
        return DataSourceBuilder.create()
                .driverClassName("org.h2.Driver")
                .url("jdbc:h2:mem:workspace_cleanup_migration_" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE")
                .username("sa")
                .password("")
                .build();
    }

    private ExecutionWorkspaceCleanupEntity buildCleanupRecord(Long runId,
                                                               String workspaceRoot,
                                                               String status,
                                                               LocalDateTime expiresAt) {
        ExecutionWorkspaceCleanupEntity entity = new ExecutionWorkspaceCleanupEntity();
        entity.setExecutionTaskId(runId + 1000);
        entity.setExecutionRunId(runId);
        entity.setExecutionStepId(runId + 2000);
        entity.setRunnerSessionId("session-" + runId);
        entity.setWorkspaceRoot(workspaceRoot);
        entity.setStatus(status);
        entity.setExecutionResultStatus("SUCCESS");
        entity.setScheduledAt(expiresAt.minusHours(24));
        entity.setExpiresAt(expiresAt);
        return entity;
    }

    private Long savedId(ExecutionWorkspaceCleanupEntity entity) {
        return entity.getId();
    }
}
