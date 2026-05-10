import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = process.argv[2]

if (!sourceRoot) {
  console.error('Usage: node apply-aiclub-branding.mjs <yaade-source-root>')
  process.exit(1)
}

function replaceRequired(content, file, from, to) {
  if (!content.includes(from)) {
    throw new Error(`Expected snippet not found in ${file}: ${from}`)
  }
  return content.replaceAll(from, to)
}

function patchFile(rootDir, { file, replacements }) {
  const fullPath = path.join(rootDir, file)
  let content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n')
  for (const [from, to] of replacements) {
    content = replaceRequired(content, file, from, to)
  }
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log(`patched ${file}`)
}

const platformThemeBridge = `<script>
      (() => {
        const themeStorageKey = 'git-ai-club:theme'
        const defaultTheme = 'sunset-orange'
        const supportedThemes = new Set(['sunset-orange', 'ocean-blue', 'forest-green'])
        const normalizeTheme = (themeId) => supportedThemes.has(themeId) ? themeId : defaultTheme
        const forceLightMode = () => {
          try {
            window.localStorage.setItem('chakra-ui-color-mode', 'light')
          } catch {
            // Yaade 嵌入平台时统一使用浅色基底，避免独立工作台黑底和平台导航割裂。
          }
          document.documentElement.style.colorScheme = 'light'
        }
        const applyTheme = (themeId) => {
          forceLightMode()
          document.documentElement.dataset.aiclubTheme = normalizeTheme(themeId)
        }
        const syncEmbeddedMode = () => {
          try {
            const params = new URLSearchParams(window.location.search)
            document.documentElement.dataset.aiclubEmbedded = params.get('aiclubEmbedded') === '1' ? 'true' : 'false'
          } catch {
            document.documentElement.dataset.aiclubEmbedded = 'false'
          }
        }
        const readTheme = () => {
          try {
            const params = new URLSearchParams(window.location.search)
            return normalizeTheme(params.get('aiclubTheme') || window.localStorage.getItem(themeStorageKey))
          } catch {
            return defaultTheme
          }
        }

        syncEmbeddedMode()
        applyTheme(readTheme())
        window.addEventListener('storage', (event) => {
          if (event.key === themeStorageKey) {
            applyTheme(event.newValue)
          }
        })
        window.addEventListener('message', (event) => {
          const data = event.data
          if (!data || typeof data !== 'object') {
            return
          }
          if (data.type === 'AI_CLUB_THEME_CHANGED' || data.type === themeStorageKey) {
            applyTheme(data.themeId)
          }
        })
      })()
    </script>`

const chakraThemeReplacement = `  colors: {
    green: {
      50: 'var(--aiclub-primary-fixed)',
      100: 'var(--aiclub-primary-fixed)',
      200: 'var(--aiclub-primary-fixed-dim)',
      300: 'var(--aiclub-primary-light-7)',
      400: 'var(--aiclub-primary-light-5)',
      500: 'var(--aiclub-primary-container)',
      600: 'var(--aiclub-primary-light-3)',
      700: 'var(--aiclub-primary)',
      800: 'var(--aiclub-primary-dark-2)',
      900: 'var(--aiclub-ink)',
    },
    aiclub: {
      primary: 'var(--aiclub-primary)',
      primaryContainer: 'var(--aiclub-primary-container)',
      primaryDark: 'var(--aiclub-primary-dark-2)',
      tertiary: 'var(--aiclub-tertiary)',
      ink: 'var(--aiclub-ink)',
      panel: 'var(--aiclub-panel)',
      header: 'var(--aiclub-header-bg)',
    },
  },
  semanticTokens: {
    colors: {
      panelBg: {
        default: 'aiclub.panel',
        _dark: 'aiclub.panel',
      },
      headerBg: {
        default: 'aiclub.header',
        _dark: 'aiclub.header',
      },
    },
  },`

const globalThemeCss = `:root,
:root[data-aiclub-theme='sunset-orange'] {
  --aiclub-page-accent-a-rgb: 255, 140, 0;
  --aiclub-page-accent-b-rgb: 0, 101, 143;
  --aiclub-page-gradient-start: #f8f9fa;
  --aiclub-page-gradient-end: #eef0f1;
  --aiclub-primary-rgb: 144, 77, 0;
  --aiclub-primary-container-rgb: 255, 140, 0;
  --aiclub-tertiary-rgb: 0, 101, 143;
  --aiclub-outline-rgb: 137, 115, 98;
  --aiclub-primary: #904d00;
  --aiclub-primary-container: #ff8c00;
  --aiclub-primary-fixed: #ffdcc3;
  --aiclub-primary-fixed-dim: #ffb77d;
  --aiclub-primary-light-3: #af7531;
  --aiclub-primary-light-5: #c69157;
  --aiclub-primary-light-7: #deb986;
  --aiclub-primary-dark-2: #6e3900;
  --aiclub-tertiary: #00658f;
  --aiclub-ink: #17212b;
  --aiclub-panel: #f8f9fa;
  --aiclub-muted: rgba(23, 33, 43, 0.62);
  --aiclub-header-bg: rgba(255, 255, 255, 0.94);
}

:root[data-aiclub-theme='ocean-blue'] {
  --aiclub-page-accent-a-rgb: 46, 167, 255;
  --aiclub-page-accent-b-rgb: 26, 127, 114;
  --aiclub-page-gradient-start: #f5fbff;
  --aiclub-page-gradient-end: #edf5fb;
  --aiclub-primary-rgb: 15, 93, 145;
  --aiclub-primary-container-rgb: 46, 167, 255;
  --aiclub-tertiary-rgb: 26, 127, 114;
  --aiclub-outline-rgb: 95, 118, 134;
  --aiclub-primary: #0f5d91;
  --aiclub-primary-container: #2ea7ff;
  --aiclub-primary-fixed: #cdeaff;
  --aiclub-primary-fixed-dim: #82caff;
  --aiclub-primary-light-3: #4a86b5;
  --aiclub-primary-light-5: #74a4c8;
  --aiclub-primary-light-7: #a1c4de;
  --aiclub-primary-dark-2: #0b456c;
  --aiclub-tertiary: #1a7f72;
  --aiclub-ink: #122331;
  --aiclub-panel: #f5fbff;
  --aiclub-muted: rgba(18, 35, 49, 0.62);
  --aiclub-header-bg: rgba(255, 255, 255, 0.94);
}

:root[data-aiclub-theme='forest-green'] {
  --aiclub-page-accent-a-rgb: 84, 178, 106;
  --aiclub-page-accent-b-rgb: 143, 92, 18;
  --aiclub-page-gradient-start: #f6fbf6;
  --aiclub-page-gradient-end: #edf4ed;
  --aiclub-primary-rgb: 47, 111, 56;
  --aiclub-primary-container-rgb: 84, 178, 106;
  --aiclub-tertiary-rgb: 143, 92, 18;
  --aiclub-outline-rgb: 109, 123, 96;
  --aiclub-primary: #2f6f38;
  --aiclub-primary-container: #54b26a;
  --aiclub-primary-fixed: #d8f0d4;
  --aiclub-primary-fixed-dim: #a8d9b2;
  --aiclub-primary-light-3: #5e9365;
  --aiclub-primary-light-5: #83b089;
  --aiclub-primary-light-7: #afcdb2;
  --aiclub-primary-dark-2: #23532a;
  --aiclub-tertiary: #8f5c12;
  --aiclub-ink: #142414;
  --aiclub-panel: #f6fbf6;
  --aiclub-muted: rgba(20, 36, 20, 0.62);
  --aiclub-header-bg: rgba(255, 255, 255, 0.94);
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Roboto', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background:
    radial-gradient(circle at 8% 0%, rgba(var(--aiclub-page-accent-a-rgb), 0.18), transparent 28%),
    radial-gradient(circle at 92% 6%, rgba(var(--aiclub-page-accent-b-rgb), 0.16), transparent 30%),
    linear-gradient(180deg, var(--aiclub-page-gradient-start) 0%, var(--aiclub-page-gradient-end) 100%);
}

:root[data-aiclub-embedded='true'] {
  --aiclub-yaade-header-height: 0px;
}`

const fileReplacements = [
  {
    file: 'client/index.html',
    replacements: [
      ['<html lang="en">', '<html lang="zh-CN">'],
      ['<title>Yaade</title>', `<title>AI Club 接口工作台</title>
    ${platformThemeBridge}`]
    ]
  },
  {
    file: 'client/src/theme.tsx',
    replacements: [
      ["  initialColorMode: 'dark',", "  initialColorMode: 'light',"],
      [
        `  semanticTokens: {
    colors: {
      panelBg: {
        default: 'gray.100',
        _dark: 'gray.900',
      },
      headerBg: {
        default: 'gray.100',
        _dark: 'gray.900',
      },
    },
  },`,
        chakraThemeReplacement
      ]
    ]
  },
  {
    file: 'client/src/index.css',
    replacements: [
      [
        `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu',
    'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #090c10;
}`,
        globalThemeCss
      ],
      ['  outline: 1px solid var(--chakra-colors-green-500) !important;', '  outline: 1px solid var(--aiclub-primary-container) !important;']
    ]
  },
  {
    file: 'client/src/components/header/Header.tsx',
    replacements: [
      [
        `      <img className={styles.img} src="yaade-icon.png" alt="yaade icon" />
      <Heading as="h1" size="md" ml="2">
        YAADE
      </Heading>`,
        `      <Box className={styles.navTitleGroup}>
        <Heading as="h1" className={styles.navTitle}>
          API 管理
        </Heading>
        <Box className={styles.navSubtitle}>接口工作台 · Powered by Yaade</Box>
      </Box>`
      ]
    ]
  },
  {
    file: 'client/src/components/header/Header.module.css',
    replacements: [
      [
        `.container {
  padding-left: 16px;
  padding-right: 16px;
  display: flex;
  align-items: center;
  height: 48px;
}`,
        `.container {
  min-height: 64px;
  padding: 10px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  background: var(--aiclub-header-bg);
  backdrop-filter: blur(18px);
}`
      ],
      [
        `.img {
  height: 32px;
}`,
        `.img {
  height: 32px;
}

.navTitleGroup {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.navTitle {
  margin: 0;
  color: var(--aiclub-ink);
  font-size: 20px !important;
  font-weight: 800 !important;
  line-height: 1 !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.navSubtitle {
  color: var(--aiclub-muted);
  font-size: 11px;
  font-weight: 700;
}

.buttons {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
}

.buttons :global(button) {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  color: #64748b;
}

.buttons :global(button:hover) {
  background: rgba(226, 232, 240, 0.55);
  color: var(--aiclub-primary);
}

:global(:root[data-aiclub-embedded='true']) .container {
  display: none;
}`
      ]
    ]
  },
  {
    file: 'client/src/pages/dashboard/Dashboard.module.css',
    replacements: [
      [
        `.allotment {
  height: calc(100% - 48px);
}`,
        `.allotment {
  height: calc(100% - var(--aiclub-yaade-header-height, 64px));
}`
      ]
    ]
  },
  {
    file: 'client/src/pages/login/Login.tsx',
    replacements: [
      [
        `  loginProviders: Provider[];
};`,
        `  loginProviders: Provider[];
  autoLoginPending: boolean;
};`
      ],
      [
        `function Login() {
  const toast = useToast();`,
        `function isAiclubEmbedded() {
  // 嵌入平台时先等待代理单点登录确认，失败后才展示 Yaade 原生登录表单。
  return document.documentElement.dataset.aiclubEmbedded === 'true';
}

function Login() {
  const embedded = isAiclubEmbedded();
  const toast = useToast();`
      ],
      [
        `    loading: false,
    loginProviders: [],`,
        `    loading: embedded,
    autoLoginPending: embedded,
    loginProviders: [],`
      ],
      [
        `        setState((state) => ({ ...state, loading: true }));`,
        `        setState((state) => ({ ...state, loading: true, autoLoginPending: embedded }));`
      ],
      [
        `        setState((state) => ({ ...state, loading: false }));`,
        `        setState((state) => ({ ...state, loading: false, autoLoginPending: false }));`
      ],
      [
        `        setState({ ...state, loginProviders });`,
        `        setState((state) => ({ ...state, loginProviders }));`
      ],
      [
        `  return (
    <div className={styles.root}>
      <Box className={styles.container} bg="panelBg">`,
        `  if (state.autoLoginPending) {
    return (
      <div className={styles.root}>
        <Box className={styles.loadingContainer} bg="panelBg">
          <div className={styles.loadingSpinner} aria-hidden="true" />
          <Text className={styles.loadingTitle}>正在进入接口工作台</Text>
          <Text className={styles.loadingSubtitle}>正在校验平台单点登录状态</Text>
        </Box>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <Box className={styles.container} bg="panelBg">`
      ],
      [
        `        <div className={styles.heading}>
          <img className={styles.yaadeIcon} src="yaade-icon.png" alt="yaade icon" />
          <Heading as="h1" size="lg">
            Yaade
          </Heading>
        </div>`,
        `        <div className={styles.heading}>
          <div className={styles.brandMark}>AI</div>
          <Heading as="h1" size="lg">
            AI Club 接口工作台
          </Heading>
          <Text className={styles.subtitle}>由 Yaade 提供接口资产管理能力</Text>
        </div>`
      ]
    ]
  },
  {
    file: 'client/src/pages/login/Login.module.css',
    replacements: [
      [
        `.root {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
}`,
        `.root {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background:
    radial-gradient(circle at 12% 12%, rgba(var(--aiclub-page-accent-a-rgb), 0.22), transparent 30%),
    radial-gradient(circle at 88% 18%, rgba(var(--aiclub-page-accent-b-rgb), 0.2), transparent 34%),
    linear-gradient(180deg, var(--aiclub-page-gradient-start) 0%, var(--aiclub-page-gradient-end) 100%);
}`
      ],
      [
        `.container {
  width: 500px;
  border-radius: 20px;
  padding: 1rem 3rem 2rem 3rem;
}`,
        `.container {
  width: 500px;
  border: 1px solid rgba(var(--aiclub-outline-rgb), 0.18);
  border-radius: 18px;
  padding: 2rem 3rem 2.4rem 3rem;
  box-shadow: 0 24px 60px rgba(var(--aiclub-primary-rgb), 0.16);
}`
      ],
      [
        `.yaadeIcon {
  height: 100px;
}`,
        `.yaadeIcon {
  height: 100px;
}

.brandMark {
  width: 70px;
  height: 70px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--aiclub-primary-container), var(--aiclub-primary-dark-2));
  color: #fff;
  font-size: 24px;
  font-weight: 900;
  box-shadow: 0 16px 30px rgba(var(--aiclub-primary-container-rgb), 0.28);
}

.subtitle {
  margin-top: 8px;
  color: var(--aiclub-muted);
  font-size: 13px;
}

.loadingContainer {
  width: min(420px, calc(100vw - 48px));
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid rgba(var(--aiclub-outline-rgb), 0.16);
  border-radius: 18px;
  padding: 34px 32px 32px;
  box-shadow: 0 24px 60px rgba(var(--aiclub-primary-rgb), 0.12);
}

.loadingSpinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(var(--aiclub-primary-rgb), 0.18);
  border-top-color: var(--aiclub-primary-container);
  border-radius: 999px;
  animation: aiclubSpin 0.8s linear infinite;
}

.loadingTitle {
  margin-top: 18px;
  color: var(--aiclub-ink);
  font-size: 16px;
  font-weight: 800;
}

.loadingSubtitle {
  margin-top: 8px;
  color: var(--aiclub-muted);
  font-size: 13px;
}

@keyframes aiclubSpin {
  to {
    transform: rotate(360deg);
  }
}`
      ]
    ]
  }
]

// 品牌补丁只负责 AI Club 标识和主题色，不承载中文翻译，便于后续独立升级和回滚。
for (const entry of fileReplacements) {
  patchFile(sourceRoot, entry)
}
