package com.aiclub.platform.controller;

import com.aiclub.platform.domain.model.LightRagIngestQueueEntity;
import com.aiclub.platform.domain.model.WikiPageV2Entity;
import com.aiclub.platform.repository.WikiPageV2Repository;
import com.aiclub.platform.service.InternalServiceAuthenticator;
import com.aiclub.platform.service.LightRagIngestQueueService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 仅供 code-processing LightRAG 消费者回调的队列控制器。
 * 鉴权复用 InternalServiceAuthenticator，与 InternalExecutionSessionController 一致。
 */
@RestController
@RequestMapping("/internal/lightrag")
public class InternalLightRagQueueController {

    private static final int DEFAULT_POLL_BATCH = 10;

    private final InternalServiceAuthenticator internalServiceAuthenticator;
    private final LightRagIngestQueueService lightRagIngestQueueService;
    private final WikiPageV2Repository wikiPageV2Repository;

    public InternalLightRagQueueController(InternalServiceAuthenticator internalServiceAuthenticator,
                                           LightRagIngestQueueService lightRagIngestQueueService,
                                           WikiPageV2Repository wikiPageV2Repository) {
        this.internalServiceAuthenticator = internalServiceAuthenticator;
        this.lightRagIngestQueueService = lightRagIngestQueueService;
        this.wikiPageV2Repository = wikiPageV2Repository;
    }

    /**
     * 抢占式拉取待处理记录，拉取时即置 PROCESSING 并加锁。
     */
    @GetMapping("/queue/poll")
    public List<LightRagIngestQueueEntity> poll(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                                HttpServletRequest servletRequest,
                                                @RequestParam(defaultValue = "10") int batchSize) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return lightRagIngestQueueService.pollPending(Math.max(1, Math.min(batchSize, DEFAULT_POLL_BATCH)));
    }

    /**
     * 消费成功回执。
     */
    @PostMapping("/queue/{id}/ack")
    public Map<String, Object> ack(@PathVariable Long id,
                                   @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                   HttpServletRequest servletRequest,
                                   @RequestParam(required = false) Integer pageVersion) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        lightRagIngestQueueService.ack(id, pageVersion);
        return Map.of("status", "accepted");
    }

    /**
     * 消费失败回执，重试计数 +1，超阈值置 DEAD。
     */
    @PostMapping("/queue/{id}/nack")
    public Map<String, Object> nack(@PathVariable Long id,
                                    @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                    HttpServletRequest servletRequest,
                                    @RequestParam(required = false) String error) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        lightRagIngestQueueService.nack(id, error);
        return Map.of("status", "accepted");
    }

    /**
     * 供 code-processing 消费者拉取 Wiki 页面正文，避免直连业务 PG。
     */
    @GetMapping("/wiki-page-content")
    public Map<String, Object> wikiPageContent(@RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorizationHeader,
                                               HttpServletRequest servletRequest,
                                               @RequestParam String namespace,
                                               @RequestParam Long pageId) {
        internalServiceAuthenticator.requireAuthorized(authorizationHeader, servletRequest.getRemoteAddr());
        return wikiPageV2Repository.findById(pageId)
                .map(page -> Map.<String, Object>of(
                        "pageId", page.getId(),
                        "title", page.getTitle() == null ? "" : page.getTitle(),
                        "content", page.getContent() == null ? "" : page.getContent(),
                        "version", page.getCurrentVersionNumber()))
                .orElseGet(() -> Map.of("pageId", pageId, "title", "", "content", "", "version", 0));
    }
}
