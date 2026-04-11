export const THEME_STORAGE_KEY = 'git-ai-club:theme';
export const DEFAULT_THEME_ID = 'sunset-orange';
export const THEME_PRESETS = [
    {
        id: 'sunset-orange',
        name: '暖阳橙',
        description: '延续当前的橙色工作台，适合强调节奏和执行感。',
        primary: '#904d00',
        accent: '#00658f',
        surface: '#f3f4f5',
        previewBackground: 'linear-gradient(135deg, rgba(255, 140, 0, 0.14) 0%, rgba(255, 255, 255, 0.92) 52%, rgba(0, 101, 143, 0.12) 100%)',
        variables: {
            '--app-page-accent-a': 'rgba(255, 140, 0, 0.08)',
            '--app-page-accent-b': 'rgba(0, 101, 143, 0.06)',
            '--app-page-gradient-start': '#f8f9fa',
            '--app-page-gradient-end': '#eef0f1',
            '--app-primary-rgb': '144, 77, 0',
            '--app-primary-container-rgb': '255, 140, 0',
            '--app-secondary-rgb': '134, 82, 36',
            '--app-tertiary-rgb': '0, 101, 143',
            '--app-outline-rgb': '137, 115, 98',
            '--app-primary': '#904d00',
            '--app-primary-container': '#ff8c00',
            '--app-primary-fixed': '#ffdcc3',
            '--app-primary-fixed-dim': '#ffb77d',
            '--app-primary-light-3': '#af7531',
            '--app-primary-light-5': '#c69157',
            '--app-primary-light-7': '#deb986',
            '--app-primary-light-8': '#e9cfad',
            '--app-primary-light-9': '#f4e5d3',
            '--app-primary-dark-2': '#6e3900',
            '--app-primary-hover-start': '#ff9d21',
            '--app-primary-hover-end': '#a35a06',
            '--app-secondary': '#865224',
            '--app-tertiary': '#00658f'
        }
    },
    {
        id: 'ocean-blue',
        name: '深海蓝',
        description: '更冷静的蓝色界面，适合信息密集和长时间浏览。',
        primary: '#0f5d91',
        accent: '#1a7f72',
        surface: '#eef5fb',
        previewBackground: 'linear-gradient(135deg, rgba(46, 167, 255, 0.16) 0%, rgba(255, 255, 255, 0.94) 48%, rgba(26, 127, 114, 0.12) 100%)',
        variables: {
            '--app-page-accent-a': 'rgba(46, 167, 255, 0.1)',
            '--app-page-accent-b': 'rgba(26, 127, 114, 0.08)',
            '--app-page-gradient-start': '#f5fbff',
            '--app-page-gradient-end': '#edf5fb',
            '--app-primary-rgb': '15, 93, 145',
            '--app-primary-container-rgb': '46, 167, 255',
            '--app-secondary-rgb': '42, 105, 135',
            '--app-tertiary-rgb': '26, 127, 114',
            '--app-outline-rgb': '95, 118, 134',
            '--app-primary': '#0f5d91',
            '--app-primary-container': '#2ea7ff',
            '--app-primary-fixed': '#cdeaff',
            '--app-primary-fixed-dim': '#82caff',
            '--app-primary-light-3': '#4a86b5',
            '--app-primary-light-5': '#74a4c8',
            '--app-primary-light-7': '#a1c4de',
            '--app-primary-light-8': '#bfd8eb',
            '--app-primary-light-9': '#dcecf6',
            '--app-primary-dark-2': '#0b456c',
            '--app-primary-hover-start': '#4bb6ff',
            '--app-primary-hover-end': '#156ea8',
            '--app-secondary': '#2a6987',
            '--app-tertiary': '#1a7f72'
        }
    },
    {
        id: 'forest-green',
        name: '青松绿',
        description: '更柔和的绿色界面，观感轻松，适合稳定协作氛围。',
        primary: '#2f6f38',
        accent: '#8f5c12',
        surface: '#eef5ee',
        previewBackground: 'linear-gradient(135deg, rgba(84, 178, 106, 0.16) 0%, rgba(255, 255, 255, 0.94) 52%, rgba(143, 92, 18, 0.1) 100%)',
        variables: {
            '--app-page-accent-a': 'rgba(84, 178, 106, 0.1)',
            '--app-page-accent-b': 'rgba(143, 92, 18, 0.08)',
            '--app-page-gradient-start': '#f6fbf6',
            '--app-page-gradient-end': '#edf4ed',
            '--app-primary-rgb': '47, 111, 56',
            '--app-primary-container-rgb': '84, 178, 106',
            '--app-secondary-rgb': '84, 124, 66',
            '--app-tertiary-rgb': '143, 92, 18',
            '--app-outline-rgb': '109, 123, 96',
            '--app-primary': '#2f6f38',
            '--app-primary-container': '#54b26a',
            '--app-primary-fixed': '#d8f0d4',
            '--app-primary-fixed-dim': '#a8d9b2',
            '--app-primary-light-3': '#5e9365',
            '--app-primary-light-5': '#83b089',
            '--app-primary-light-7': '#afcdb2',
            '--app-primary-light-8': '#c8ddca',
            '--app-primary-light-9': '#e0eee2',
            '--app-primary-dark-2': '#23532a',
            '--app-primary-hover-start': '#67c57d',
            '--app-primary-hover-end': '#376b3c',
            '--app-secondary': '#547c42',
            '--app-tertiary': '#8f5c12'
        }
    }
];
export function resolveThemePreset(themeId) {
    return THEME_PRESETS.find((item) => item.id === themeId) || THEME_PRESETS[0];
}
export function readStoredThemeId() {
    if (typeof window === 'undefined') {
        return DEFAULT_THEME_ID;
    }
    return resolveThemePreset(window.localStorage.getItem(THEME_STORAGE_KEY)).id;
}
export function applyThemePreset(themeId) {
    if (typeof document === 'undefined') {
        return resolveThemePreset(themeId);
    }
    // 将主题变量逐项写入根节点，保证所有页面都能立即响应风格切换。
    const preset = resolveThemePreset(themeId);
    const root = document.documentElement;
    root.dataset.theme = preset.id;
    Object.entries(preset.variables).forEach(([name, value]) => {
        root.style.setProperty(name, value);
    });
    return preset;
}
//# sourceMappingURL=theme.js.map