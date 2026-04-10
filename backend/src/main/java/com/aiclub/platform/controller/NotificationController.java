package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.NotificationItem;
import com.aiclub.platform.dto.NotificationUnreadSummary;
import com.aiclub.platform.dto.PageResponse;
import com.aiclub.platform.dto.request.SystemAnnouncementRequest;
import com.aiclub.platform.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ApiResponse<PageResponse<NotificationItem>> pageNotifications(@RequestParam int page,
                                                                         @RequestParam int size,
                                                                         @RequestParam(required = false) Boolean unreadOnly,
                                                                         @RequestParam(required = false) String type) {
        return ApiResponse.success(notificationService.pageCurrentUserNotifications(page, size, unreadOnly, type));
    }

    @GetMapping("/unread-count")
    public ApiResponse<NotificationUnreadSummary> unreadCount() {
        return ApiResponse.success(notificationService.currentUserUnreadSummary());
    }

    @PostMapping("/{id}/read")
    public ApiResponse<NotificationItem> markRead(@PathVariable Long id) {
        return ApiResponse.success(notificationService.markCurrentUserRead(id));
    }

    @PostMapping("/read-all")
    public ApiResponse<NotificationUnreadSummary> markReadAll() {
        return ApiResponse.success(notificationService.markCurrentUserReadAll());
    }

    @PostMapping("/announcements")
    @RequirePermission("system:user:manage")
    public ApiResponse<Void> publishAnnouncement(@Valid @RequestBody SystemAnnouncementRequest request) {
        notificationService.publishSystemAnnouncement(request);
        return new ApiResponse<>(true, "ok", null);
    }
}
