package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.SelfUpgradePatrolPlanEntity;
import com.aiclub.platform.domain.model.UserEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.NoSuchElementException;

/**
 * 自升级夜间巡检定时器。
 * 复用 fixed-delay 扫描 + CronExpression 命中去重的模式，避免额外引入调度中间件。
 */
@Service
public class SelfUpgradePatrolScheduler {

    private static final Logger log = LoggerFactory.getLogger(SelfUpgradePatrolScheduler.class);

    private final SelfUpgradePatrolPlanService patrolPlanService;
    private final SelfUpgradeExecutionBridgeService executionBridgeService;
    private final SelfUpgradeConfigService selfUpgradeConfigService;

    public SelfUpgradePatrolScheduler(SelfUpgradePatrolPlanService patrolPlanService,
                                      SelfUpgradeExecutionBridgeService executionBridgeService,
                                      SelfUpgradeConfigService selfUpgradeConfigService) {
        this.patrolPlanService = patrolPlanService;
        this.executionBridgeService = executionBridgeService;
        this.selfUpgradeConfigService = selfUpgradeConfigService;
    }

    @Scheduled(fixedDelay = 5000L)
    public void dispatchScheduledPatrols() {
        UserEntity botUser;
        try {
            botUser = selfUpgradeConfigService.requireSelfUpgradeBot();
        } catch (NoSuchElementException exception) {
            // 测试库或刚初始化的环境可能还未补齐内置 bot，此时直接跳过本轮巡检，避免调度线程持续报错。
            log.warn("跳过自升级夜间巡检调度: {}", exception.getMessage());
            return;
        }
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.SECONDS);
        for (SelfUpgradePatrolPlanEntity plan : patrolPlanService.listEnabledPlans()) {
            if (!plan.isSchedulerEnabled() || !plan.isEnabled()) {
                continue;
            }
            if (!shouldRunScheduled(plan, now)) {
                continue;
            }
            executionBridgeService.startPatrolRun(plan.getId(), botUser, "SCHEDULED");
        }
    }

    private boolean shouldRunScheduled(SelfUpgradePatrolPlanEntity plan, LocalDateTime now) {
        String cron = plan.getSchedulerCron();
        if (cron == null || cron.isBlank()) {
            return false;
        }
        CronExpression expression;
        try {
            expression = CronExpression.parse(cron);
        } catch (IllegalArgumentException exception) {
            patrolPlanService.markLastRun(plan.getId(), "FAILED", "调度 Cron 表达式无效", now);
            return false;
        }
        LocalDateTime checkPoint = now.minusSeconds(1);
        LocalDateTime next = expression.next(checkPoint);
        if (next == null || !next.truncatedTo(ChronoUnit.SECONDS).equals(now)) {
            return false;
        }
        return plan.getLastScheduledAt() == null
                || !plan.getLastScheduledAt().truncatedTo(ChronoUnit.SECONDS).equals(now);
    }
}
