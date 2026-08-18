package com.aiclub.platform.controller;

import com.aiclub.platform.dto.DesktopUpdateManifest;
import com.aiclub.platform.service.DesktopReleaseService;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 校验 Tauri 更新接口保持原生协议响应，不被平台 ApiResponse 包装。 */
class DesktopUpdateControllerTests {

    @Test
    void shouldReturnNoContentWhenNoManifestExists() {
        DesktopReleaseService service = mock(DesktopReleaseService.class);
        when(service.updateManifest("windows", "x86_64", "nsis", "1.0.0")).thenReturn(Optional.empty());

        var response = new DesktopUpdateController(service).check("windows", "x86_64", "nsis", "1.0.0");

        assertThat(response.getStatusCode().value()).isEqualTo(204);
        assertThat(response.getBody()).isNull();
    }

    @Test
    void shouldReturnTauriManifestWhenAvailable() {
        DesktopReleaseService service = mock(DesktopReleaseService.class);
        DesktopUpdateManifest manifest = new DesktopUpdateManifest("1.1.0", "修复", "2026-08-18T10:00:00Z", "/update", "sig");
        when(service.updateManifest("windows", "x86_64", "nsis", "1.0.0")).thenReturn(Optional.of(manifest));

        var response = new DesktopUpdateController(service).check("windows", "x86_64", "nsis", "1.0.0");

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        assertThat(response.getBody()).isEqualTo(manifest);
    }
}
