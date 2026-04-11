package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.TaskEntity;
import com.aiclub.platform.repository.TaskRepository;
import com.aiclub.platform.util.TaskStatusUtils;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * 每天固定扫描一次逾期工作项，并对当前负责人发送首次逾期提醒。
 */
@Component
public class TaskOverdueNotificationScheduler {

    private final TaskRepository taskRepository;
    private final TaskNotificationService taskNotificationService;
    private final AtomicBoolean running = new AtomicBoolean(false);

    public TaskOverdueNotificationScheduler(TaskRepository taskRepository,
                                           TaskNotificationService taskNotificationService) {
        this.taskRepository = taskRepository;
        this.taskNotificationService = taskNotificationService;
    }

    /**
     * 每天上午九点扫描一次逾期工作项。
     */
    @Scheduled(cron = "0 0 9 * * *")
    @Transactional
    public void execute() {
        if (!running.compareAndSet(false, true)) {
            return;
        }
        try {
            notifyOverdueTasks();
        } finally {
            running.set(false);
        }
    }

    /**
     * 只从数据库取出“尚未记录逾期通知时间”的候选，再在内存中过滤完成态，
     * 这样既能保持 SQL 简单，也能复用统一的完成态判定规则。
     */
    void notifyOverdueTasks() {
        LocalDate today = LocalDate.now();
        LocalDateTime now = LocalDateTime.now();
        List<TaskEntity> updatedTasks = new ArrayList<>();
        for (TaskEntity task : taskRepository.findAllByPlanEndDateBeforeAndAssigneeUserIsNotNullAndOverdueNotifiedAtIsNullOrderByPlanEndDateAscIdAsc(today)) {
            if (!TaskStatusUtils.isOverdue(task.getPlanEndDate(), task.getStatus(), today)) {
                continue;
            }
            if (!task.getAssigneeUser().isEnabled()) {
                continue;
            }
            taskNotificationService.notifyTaskOverdue(task);
            task.setOverdueNotifiedAt(now);
            updatedTasks.add(task);
        }
        if (!updatedTasks.isEmpty()) {
            taskRepository.saveAll(updatedTasks);
        }
    }
}
