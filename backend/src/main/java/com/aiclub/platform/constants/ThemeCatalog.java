package com.aiclub.platform.constants;

import java.util.Set;

/**
 * GitPilot 账号主题目录。
 * 主题 ID 是前后端共享的稳定契约，服务端只允许写入这里声明的值。
 */
public final class ThemeCatalog {

    public static final String DEFAULT_THEME_ID = "deep-sea";
    public static final Set<String> SUPPORTED_THEME_IDS = Set.of(
            "deep-sea",
            "ocean-mist",
            "signal-teal",
            "paper-white",
            "carbon-black"
    );

    private ThemeCatalog() {
    }

    public static boolean isSupported(String themeId) {
        return SUPPORTED_THEME_IDS.contains(themeId);
    }
}
