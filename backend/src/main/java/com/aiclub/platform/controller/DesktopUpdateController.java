package com.aiclub.platform.controller;

import com.aiclub.platform.dto.DesktopUpdateManifest;
import com.aiclub.platform.service.DesktopReleaseService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/** Tauri 2 updater 动态清单接口，保持公开和无 ApiResponse 包装。 */
@RestController
@RequestMapping("/api/desktop-updates")
public class DesktopUpdateController {

    private final DesktopReleaseService releaseService;

    public DesktopUpdateController(DesktopReleaseService releaseService) {
        this.releaseService = releaseService;
    }

    @GetMapping("/{platform}/{arch}/{bundleType}/{currentVersion}")
    public ResponseEntity<DesktopUpdateManifest> check(
            @PathVariable String platform,
            @PathVariable String arch,
            @PathVariable String bundleType,
            @PathVariable String currentVersion) {
        return releaseService.updateManifest(platform, arch, bundleType, currentVersion)
                .map(manifest -> ResponseEntity.ok()
                        .cacheControl(CacheControl.noCache())
                        .body(manifest))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NO_CONTENT).build());
    }
}
