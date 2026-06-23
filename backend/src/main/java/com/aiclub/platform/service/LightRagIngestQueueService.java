package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.LightRagIngestQueueEntity;
import com.aiclub.platform.domain.model.WikiLightragIndexStateEntity;
import com.aiclub.platform.repository.LightRagIngestQueueRepository;
import com.aiclub.platform.repository.WikiLightragIndexStateRepository;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

/**
 * LightRAG 索引队列服务。
 * 业务意图：承接 Wiki 页面保存/删除时的同事务入队，以及 code-processing 消费者的抢占式轮询与回执。
 * 入队与页面保存在同一事务，保证「页面存了、入队前宕机」不丢消息（PG outbox 语义）。
 */
@Service
public class LightRagIngestQueueService {

    private static final Logger log = LoggerFactory.getLogger(LightRagIngestQueueService.class);
    private static final String OP_UPSERT = "UPSERT";
    private static final String OP_DELETE = "DELETE";
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_PROCESSING = "PROCESSING";
    private static final String STATUS_DONE = "DONE";
    private static final String STATUS_FAILED = "FAILED";
    private static final String STATUS_DEAD = "DEAD";
    private static final long LOCK_MINUTES = 5L;

    private final LightRagIngestQueueRepository queueRepository;
    private final WikiLightragIndexStateRepository stateRepository;
    private final WikiPageV2Repository wikiPageV2Repository;
    private final LightRagProperties lightRagProperties;

    public LightRagIngestQueueService(LightRagIngestQueueRepository queueRepository,
                                      WikiLightragIndexStateRepository stateRepository,
                                      WikiPageV2Repository wikiPageV2Repository,
                                      LightRagProperties lightRagProperties) {
        this.queueRepository = queueRepository;
        this.stateRepository = stateRepository;
        this.wikiPageV2Repository = wikiPageV2Repository;
        this.lightRagProperties = lightRagProperties;
    }

    /**
     * Wiki 页面保存/更新后入队（同事务调用）。
     */
    @Transactional
    public void enqueueUpsert(WikiPageV2Entity page) {
        if (page == null || page.getId() == null || page.getSpace() == null) {
            return;
        }
        String namespace = namespaceForSpace(page.getSpace().getId());
        LightRagIngestQueueEntity task = new LightRagIngestQueueEntity();
        task.setNamespace(namespace);
        task.setPageId(page.getId());
        task.setPageVersion(page.getCurrentVersionNumber());
        task.setOp(OP_UPSERT);
        task.setStatus(STATUS_PENDING);
        task.setRetryCount(0);
        queueRepository.save(task);
        upsertIndexState(page.getId(), namespace, page.getCurrentVersionNumber(), STATUS_PENDING, null);
    }

    /**
     * Wiki 页面删除后入队（同事务调用，页面实体删除前调用以保留 pageId）。
     */
    @Transactional
    public void enqueueDelete(Long spaceId, Long pageId) {
        if (spaceId == null || pageId == null) {
            return;
        }
        String namespace = namespaceForSpace(spaceId);
        LightRagIngestQueueEntity task = new LightRagIngestQueueEntity();
        task.setNamespace(namespace);
        task.setPageId(pageId);
        task.setPageVersion(null);
        task.setOp(OP_DELETE);
        task.setStatus(STATUS_PENDING);
        task.setRetryCount(0);
        queueRepository.save(task);
    }

    /**
     * 抢占式轮询待处理记录，供 code-processing 消费者通过内部接口调用。
     */
    @Transactional
    public List<LightRagIngestQueueEntity> pollPending(int batchSize) {
        LocalDateTime now = LocalDateTime.now();
        List<LightRagIngestQueueEntity> pending = queueRepository.findPendingForPoll(now, PageRequest.ofSize(Math.max(1, batchSize)));
        LocalDateTime lockUntil = now.plusMinutes(LOCK_MINUTES);
        for (LightRagIngestQueueEntity task : pending) {
            queueRepository.updateStatus(task.getId(), STATUS_PROCESSING, lockUntil, 0, task.getLastError());
            task.setStatus(STATUS_PROCESSING);
            task.setLockedUntil(lockUntil);
        }
        return pending;
    }

    /**
     * 消费成功回执：DONE + 更新索引状态表。
     */
    @Transactional
    public void ack(Long taskId, Integer pageVersion) {
        LightRagIngestQueueEntity task = queueRepository.findById(taskId).orElse(null);
        if (task == null) {
            return;
        }
        queueRepository.updateStatus(taskId, STATUS_DONE, null, 0, null);
        if (OP_UPSERT.equals(task.getOp())) {
            upsertIndexState(task.getPageId(), task.getNamespace(), pageVersion, "INDEXED", null);
        } else if (OP_DELETE.equals(task.getOp())) {
            stateRepository.deleteById(task.getPageId());
        }
    }

    /**
     * 消费失败回执：重试计数 +1，超阈值置 DEAD。
     */
    @Transactional
    public void nack(Long taskId, String errorMessage) {
        LightRagIngestQueueEntity task = queueRepository.findById(taskId).orElse(null);
        if (task == null) {
            return;
        }
        int newRetry = task.getRetryCount() + 1;
        boolean dead = newRetry >= lightRagProperties.getIngestRetryMax();
        String nextStatus = dead ? STATUS_DEAD : STATUS_PENDING;
        queueRepository.updateStatus(taskId, nextStatus, null, 1, abbreviateError(errorMessage));
        if (OP_UPSERT.equals(task.getOp())) {
            upsertIndexState(task.getPageId(), task.getNamespace(), task.getPageVersion(), STATUS_FAILED, abbreviateError(errorMessage));
        }
    }

    /**
     * 定时兜底扫描：找出索引状态落后的页面补入队，覆盖消费者宕机/事件丢失等漏网情况。
     */
    @Transactional
    public int scanStaleAndEnqueue(int batchSize) {
        int processed = 0;
        // 先处理 PENDING / FAILED 状态的页面
        List<WikiLightragIndexStateEntity> stale = stateRepository.findAllByStatusInOrderByPageIdAsc(List.of(STATUS_PENDING, STATUS_FAILED));
        for (WikiLightragIndexStateEntity state : stale) {
            if (processed >= batchSize) {
                break;
            }
            WikiPageV2Entity page = wikiPageV2Repository.findById(state.getPageId()).orElse(null);
            if (page == null) {
                // 页面已删除但状态表残留，清理即可。
                stateRepository.deleteById(state.getPageId());
                continue;
            }
            enqueueIfMissing(state.getNamespace(), page.getId(), page.getCurrentVersionNumber(), OP_UPSERT);
            processed++;
        }
        // 再处理 INDEXED 但版本落后的页面
        if (processed < batchSize) {
            // 全量扫一遍 INDEXED 状态，找版本落后的。数据量不大时可行。
            for (WikiLightragIndexStateEntity state : stateRepository.findAll()) {
                if (processed >= batchSize) {
                    break;
                }
                if (!"INDEXED".equals(state.getStatus())) {
                    continue;
                }
                WikiPageV2Entity page = wikiPageV2Repository.findById(state.getPageId()).orElse(null);
                if (page == null) {
                    stateRepository.deleteById(state.getPageId());
                    continue;
                }
                if (state.getIndexedVersion() == null || state.getIndexedVersion() < page.getCurrentVersionNumber()) {
                    enqueueIfMissing(state.getNamespace(), page.getId(), page.getCurrentVersionNumber(), OP_UPSERT);
                    processed++;
                }
            }
        }
        return processed;
    }

    private void enqueueIfMissing(String namespace, Long pageId, Integer pageVersion, String op) {
        // 幂等：同 pageId 已有 PENDING 任务则不重复入队。
        List<LightRagIngestQueueEntity> existing = queueRepository.findAllByNamespaceAndPageIdAndStatusOrderByIdAsc(namespace, pageId, STATUS_PENDING);
        if (!existing.isEmpty()) {
            return;
        }
        LightRagIngestQueueEntity task = new LightRagIngestQueueEntity();
        task.setNamespace(namespace);
        task.setPageId(pageId);
        task.setPageVersion(pageVersion);
        task.setOp(op);
        task.setStatus(STATUS_PENDING);
        task.setRetryCount(0);
        queueRepository.save(task);
    }

    private void upsertIndexState(Long pageId, String namespace, Integer version, String status, String lastError) {
        WikiLightragIndexStateEntity state = stateRepository.findById(pageId).orElse(null);
        if (state == null) {
            state = new WikiLightragIndexStateEntity();
            state.setPageId(pageId);
            state.setNamespace(namespace);
        }
        if ("INDEXED".equals(status)) {
            state.setIndexedVersion(version);
            state.setIndexedAt(LocalDateTime.now());
        }
        state.setStatus(status);
        state.setLastError(lastError);
        stateRepository.save(state);
    }

    private String namespaceForSpace(Long spaceId) {
        return "space:" + spaceId;
    }

    private String abbreviateError(String message) {
        if (message == null) {
            return null;
        }
        String trimmed = message.trim();
        return trimmed.length() > 4000 ? trimmed.substring(0, 4000) : trimmed;
    }
}
