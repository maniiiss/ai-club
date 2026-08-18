package com.aiclub.platform.dto;

/** Tauri 2 动态 updater 清单，字段名称必须保持 Tauri 协议兼容。 */
public record DesktopUpdateManifest(
        String version,
        String notes,
        String pub_date,
        String url,
        String signature
) {
}
