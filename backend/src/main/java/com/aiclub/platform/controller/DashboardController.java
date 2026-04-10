package com.aiclub.platform.controller;

import com.aiclub.platform.annotation.RequirePermission;
import com.aiclub.platform.common.api.ApiResponse;
import com.aiclub.platform.dto.DashboardOverview;
import com.aiclub.platform.service.PlatformStoreService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private final PlatformStoreService platformStoreService;

    public DashboardController(PlatformStoreService platformStoreService) {
        this.platformStoreService = platformStoreService;
    }

    @GetMapping("/overview")
    @RequirePermission("dashboard:view")
    public ApiResponse<DashboardOverview> overview() {
        return ApiResponse.success(platformStoreService.getDashboardOverview());
    }
}
