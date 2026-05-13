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

function writeGeneratedFile(rootDir, { file, content }) {
  const fullPath = path.join(rootDir, file)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content.replace(/\r\n/g, '\n'), 'utf8')
  console.log(`generated ${file}`)
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

const projectFirstReplacements = [
  {
    file: 'client/src/components/sidebar/Sidebar.tsx',
    replacements: [
      [
        `import api from '../../api';`,
        `import api from '../../api';
import { useAiclubProjectContext } from '../../aiclub/projectContext';`
      ],
      [
        `  const { isOpen, onOpen, onClose } = useDisclosure();`,
        `  const { isOpen, onOpen, onClose } = useDisclosure();
  const { currentProject, currentProjectId, projects, changeCurrentProject, isEmbedded } =
    useAiclubProjectContext();`
      ],
      [
        `  const [state, setState] = useState<StateProps>({
    clickedCollectionId: -1,
    name: '',
    groups: user?.data?.groups ?? [],
    searchTerm: '',
    uploadFile: undefined,
    basePath: '',
    selectedImport: 'openapi',
  });`,
        `  const [state, setState] = useState<StateProps>({
    clickedCollectionId: -1,
    name: '',
    groups:
      isEmbedded && currentProject ? [currentProject.yaadeGroupName] : user?.data?.groups ?? [],
    searchTerm: '',
    uploadFile: undefined,
    basePath: '',
    selectedImport: 'openapi',
  });`
      ],
      [
        `  const { colorMode } = useColorMode();
  const initialRef = useRef(null);`,
        `  const { colorMode } = useColorMode();
  const initialRef = useRef(null);

  React.useEffect(() => {
    if (!isEmbedded || !currentProject) {
      return;
    }
    setState((currentState) => ({
      ...currentState,
      groups: [currentProject.yaadeGroupName],
    }));
  }, [currentProject?.projectId, isEmbedded]);`
      ],
      [
        `  function onCloseClear() {
    setState({
      ...state,
      name: '',
      groups: user?.data?.groups ?? [],
      uploadFile: undefined,
      basePath: '',
      selectedImport: 'openapi',
    });
    onClose();
  }`,
        `  function onCloseClear() {
    setState({
      ...state,
      name: '',
      groups:
        isEmbedded && currentProject ? [currentProject.yaadeGroupName] : user?.data?.groups ?? [],
      uploadFile: undefined,
      basePath: '',
      selectedImport: 'openapi',
    });
    onClose();
  }`
      ],
      [
        `  return (
    <Box className={styles.box} bg="panelBg" h="100%" w="100%">
      <div className={cn(styles, 'searchContainer', [colorMode])}>`,
        `  return (
    <Box className={styles.box} bg="panelBg" h="100%" w="100%">
      {isEmbedded && projects.length > 0 ? (
        <Box px="3" pt="3">
          <Select
            size="sm"
            borderRadius="16px"
            backgroundColor={colorMode === 'light' ? 'white' : undefined}
            value={currentProjectId ? String(currentProjectId) : ''}
            onChange={(e) => changeCurrentProject(Number(e.target.value))}
          >
            {projects.map((project) => (
              <option key={'aiclub-project-option-' + project.projectId} value={project.projectId}>
                {project.projectName}
              </option>
            ))}
          </Select>
        </Box>
      ) : null}
      <div className={cn(styles, 'searchContainer', [colorMode])}>`
      ]
    ]
  },
  {
    file: 'client/src/pages/dashboard/Dashboard.tsx',
    replacements: [
      [
        `import api from '../../api';`,
        `import api from '../../api';
import {
  filterCollectionsForProject,
  isCollectionVisibleForProject,
  useAiclubProjectContext,
} from '../../aiclub/projectContext';`
      ],
      [
        `  const toast = useToast();
  const sidebarCollections: SidebarCollection[] = useMemo(() => {
    return collections.map((col, i) => mapCollectionToSidebarCollection(col, i));
  }, [collections]);`,
        `  const toast = useToast();
  const { currentProject, isEmbedded } = useAiclubProjectContext();
  const visibleCollections = useMemo(() => {
    return isEmbedded ? filterCollectionsForProject(collections, currentProject) : collections;
  }, [collections, currentProject, isEmbedded]);
  const sidebarCollections: SidebarCollection[] = useMemo(() => {
    return visibleCollections.map((col, i) => mapCollectionToSidebarCollection(col, i));
  }, [visibleCollections]);`
      ],
      [
        `  useEffect(() => {
    selectScriptRef.current = selectScript;
  }, [selectScript]);

  const renameRequest = useCallback(`,
        `  useEffect(() => {
    selectScriptRef.current = selectScript;
  }, [selectScript]);

  useEffect(() => {
    if (!isEmbedded || !currentProject) {
      return;
    }
    const rootCollection = visibleCollections[0];
    if (!rootCollection) {
      return;
    }
    const currentCollectionVisible = currentCollection
      ? isCollectionVisibleForProject(collections, currentCollection.id, currentProject)
      : false;
    const currentRequestVisible = currentRequest
      ? isCollectionVisibleForProject(collections, currentRequest.collectionId, currentProject)
      : false;
    const currentScriptVisible = currentScript
      ? isCollectionVisibleForProject(collections, currentScript.collectionId, currentProject)
      : false;
    if (currentCollectionVisible || currentRequestVisible || currentScriptVisible) {
      return;
    }
    navigate('/' + rootCollection.id);
    dispatchCurrentCollection({
      type: CurrentCollectionActionType.SET,
      collection: rootCollection,
    });
    dispatchCurrentRequest({
      type: CurrentRequestActionType.UNSET,
    });
    dispatchCurrentScript({
      type: CurrentScriptActionType.UNSET,
    });
  }, [
    collections,
    currentCollection,
    currentProject,
    currentRequest,
    currentScript,
    isEmbedded,
    navigate,
    visibleCollections,
  ]);

  const renameRequest = useCallback(`
      ],
      [
        `  let panel = <div>请选择请求或集合</div>;`,
        `  let panel = (
    <div>
      {isEmbedded && !currentProject
        ? '请先选择项目'
        : isEmbedded && visibleCollections.length === 0
          ? '当前项目暂无集合或接口'
          : '请选择请求或集合'}
    </div>
  );`
      ]
    ]
  },
  {
    file: 'client/src/components/collectionPanel/CollectionSettingsTab/CollectionSettingsTab.tsx',
    replacements: [['<div>可见组</div>', '<div>所属项目</div>']]
  }
]

const generatedFiles = [
  {
    file: 'client/src/aiclub/projectContext.ts',
    content: `import { useEffect, useMemo, useState } from 'react';

import Collection from '../model/Collection';

export type AiclubProjectContextItem = {
  projectId: number;
  projectName: string;
  yaadeCollectionId: number;
  yaadeGroupName: string;
};

type AiclubProjectContextSnapshot = {
  currentProjectId: number | null;
  projects: AiclubProjectContextItem[];
};

const STORAGE_KEY = 'git-ai-club:yaade-project-context';
const PROJECT_CONTEXT_TYPE = 'AI_CLUB_PROJECT_CONTEXT';
const PROJECT_CONTEXT_REQUEST_TYPE = 'AI_CLUB_PROJECT_CONTEXT_REQUEST';
const PROJECT_CHANGED_TYPE = 'AI_CLUB_PROJECT_CHANGED';

let snapshot: AiclubProjectContextSnapshot = readStoredSnapshot();
let listenerRegistered = false;
const listeners = new Set<() => void>();

function isNumberLike(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeProject(raw: unknown): AiclubProjectContextItem | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const value = raw as Record<string, unknown>;
  const projectId = Number(value.projectId ?? 0);
  const yaadeCollectionId = Number(value.yaadeCollectionId ?? 0);
  const projectName = String(value.projectName ?? '').trim();
  const yaadeGroupName = String(value.yaadeGroupName ?? '').trim();
  if (!isNumberLike(projectId) || !isNumberLike(yaadeCollectionId) || !projectName || !yaadeGroupName) {
    return null;
  }
  return {
    projectId,
    projectName,
    yaadeCollectionId,
    yaadeGroupName,
  };
}

function normalizeSnapshot(raw: { currentProjectId?: unknown; projects?: unknown }) {
  const projects = Array.isArray(raw.projects)
    ? raw.projects.map(normalizeProject).filter(Boolean) as AiclubProjectContextItem[]
    : [];
  const requestedProjectId = Number(raw.currentProjectId ?? 0);
  const currentProjectId = projects.some((item) => item.projectId === requestedProjectId)
    ? requestedProjectId
    : (projects[0]?.projectId ?? null);
  return {
    currentProjectId,
    projects,
  } as AiclubProjectContextSnapshot;
}

function readStoredSnapshot(): AiclubProjectContextSnapshot {
  if (typeof window === 'undefined') {
    return { currentProjectId: null, projects: [] };
  }
  try {
    const querySnapshot = readQuerySnapshot();
    if (querySnapshot.projects.length > 0) {
      return querySnapshot;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { currentProjectId: null, projects: [] };
    }
    return normalizeSnapshot(JSON.parse(raw));
  } catch {
    return { currentProjectId: null, projects: [] };
  }
}

function readQuerySnapshot(): AiclubProjectContextSnapshot {
  if (typeof window === 'undefined') {
    return { currentProjectId: null, projects: [] };
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const contextFromQuery = params.get('aiclubProjectContext');
    if (!contextFromQuery) {
      return { currentProjectId: null, projects: [] };
    }
    return normalizeSnapshot(JSON.parse(contextFromQuery));
  } catch {
    return { currentProjectId: null, projects: [] };
  }
}

function persistSnapshot() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage failures in embedded mode
  }
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

function commitSnapshot(next: { currentProjectId?: unknown; projects?: unknown }) {
  snapshot = normalizeSnapshot({
    currentProjectId: next.currentProjectId ?? snapshot.currentProjectId,
    projects: next.projects ?? snapshot.projects,
  });
  persistSnapshot();
  notifyListeners();
}

function handleProjectContextMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    return;
  }
  if ((data as { type?: string }).type !== PROJECT_CONTEXT_TYPE) {
    return;
  }
  commitSnapshot({
    currentProjectId: Number((data as { currentProjectId?: number }).currentProjectId ?? 0) || null,
    projects: Array.isArray((data as { projects?: unknown[] }).projects)
      ? (data as { projects?: unknown[] }).projects ?? []
      : [],
  });
}

export function isAiclubEmbedded() {
  return typeof document !== 'undefined' && document.documentElement.dataset.aiclubEmbedded === 'true';
}

function ensureProjectContextListener() {
  if (typeof window === 'undefined' || listenerRegistered) {
    return;
  }
  listenerRegistered = true;
  window.addEventListener('message', handleProjectContextMessage);
  if (isAiclubEmbedded()) {
    window.parent?.postMessage({ type: PROJECT_CONTEXT_REQUEST_TYPE }, '*');
  }
}

export function useAiclubProjectContext() {
  const [state, setState] = useState<AiclubProjectContextSnapshot>(snapshot);
  const querySnapshot = useMemo(() => readQuerySnapshot(), []);
  const effectiveProjects = state.projects.length > 0 ? state.projects : querySnapshot.projects;
  const effectiveCurrentProjectId =
    state.currentProjectId ?? querySnapshot.currentProjectId;

  useEffect(() => {
    ensureProjectContextListener();
    const listener = () => setState({ ...snapshot, projects: [...snapshot.projects] });
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const currentProject = useMemo(() => {
    return effectiveProjects.find((item) => item.projectId === effectiveCurrentProjectId) ?? null;
  }, [effectiveCurrentProjectId, effectiveProjects]);

  function changeCurrentProject(projectId: number) {
    if (!effectiveProjects.some((item) => item.projectId === projectId)) {
      return;
    }
    if (effectiveCurrentProjectId === projectId) {
      return;
    }
    commitSnapshot({ currentProjectId: projectId });
    if (typeof window !== 'undefined') {
      window.parent?.postMessage({ type: PROJECT_CHANGED_TYPE, projectId }, '*');
    }
  }

  return {
    currentProject,
    currentProjectId: effectiveCurrentProjectId,
    projects: effectiveProjects,
    changeCurrentProject,
    isEmbedded: isAiclubEmbedded(),
  };
}

export function resolveProjectForGroups(
  projects: AiclubProjectContextItem[],
  groups: string[] | undefined,
) {
  if (!groups || groups.length !== 1) {
    return null;
  }
  return projects.find((item) => item.yaadeGroupName === groups[0]) ?? null;
}

export function normalizeProjectGroups(project: AiclubProjectContextItem | null | undefined) {
  return project ? [project.yaadeGroupName] : [];
}

export function projectGroupMatches(
  groups: string[] | undefined,
  project: AiclubProjectContextItem | null | undefined,
) {
  return !!project && Array.isArray(groups) && groups.includes(project.yaadeGroupName);
}

export function filterCollectionsForProject(
  collections: Collection[],
  project: AiclubProjectContextItem | null | undefined,
) {
  if (!project) {
    return [];
  }
  const rootCollection =
    collections.find((collection) => collection.id === project.yaadeCollectionId) ??
    collections.find(
      (collection) =>
        !collection.data.parentId && projectGroupMatches(collection.data.groups, project),
    );
  return rootCollection ? [rootCollection] : [];
}

function containsCollectionId(collections: Collection[], collectionId: number) {
  for (const collection of collections) {
    if (collection.id === collectionId) {
      return true;
    }
    if (containsCollectionId(collection.children ?? [], collectionId)) {
      return true;
    }
  }
  return false;
}

export function isCollectionVisibleForProject(
  collections: Collection[],
  collectionId: number | undefined,
  project: AiclubProjectContextItem | null | undefined,
) {
  if (!collectionId || !project) {
    return false;
  }
  return containsCollectionId(filterCollectionsForProject(collections, project), collectionId);
}
`
  },
  {
    file: 'client/src/components/groupsInput/GroupsInput.tsx',
    content: `import { Input, Select, useColorMode, VStack } from '@chakra-ui/react';
import { FunctionComponent, useEffect, useMemo, useState } from 'react';

import {
  normalizeProjectGroups,
  resolveProjectForGroups,
  useAiclubProjectContext,
} from '../../aiclub/projectContext';

type GroupsInputProps = {
  groups: string[];
  setGroups: (groups: string[]) => void;
  isRounded?: boolean;
  className?: string;
};

const GroupsInput: FunctionComponent<GroupsInputProps> = ({
  groups,
  setGroups,
  isRounded,
  className,
}) => {
  const [newGroup, setNewGroup] = useState('');
  const { colorMode } = useColorMode();
  const { currentProject, currentProjectId, isEmbedded, projects } = useAiclubProjectContext();

  const selectedProject = useMemo(() => {
    return resolveProjectForGroups(projects, groups);
  }, [groups, projects]);

  useEffect(() => {
    if (!isEmbedded || !currentProject) {
      return;
    }
    if (selectedProject) {
      return;
    }
    setGroups(normalizeProjectGroups(currentProject));
  }, [currentProject, isEmbedded, selectedProject, setGroups]);

  function setNewGroupInput(value: string, force = false) {
    if (value.endsWith(' ') || force) {
      const removedDuplicates = Array.from(new Set([...groups, value.trim()]));
      if (value !== ' ') {
        setGroups(removedDuplicates);
      }
      setNewGroup('');
    } else {
      setNewGroup(value);
    }
  }

  if (isEmbedded && projects.length > 0) {
    return (
      <VStack alignItems="start" width="100%" className={className}>
        <Select
          size={isRounded ? 'md' : 'sm'}
          borderRadius={isRounded ? '20px' : undefined}
          placeholder="选择所属项目"
          value={
            selectedProject?.projectId
              ? String(selectedProject.projectId)
              : currentProjectId
                ? String(currentProjectId)
                : ''
          }
          backgroundColor={colorMode === 'light' ? 'white' : undefined}
          onChange={(event) => {
            const nextProject = projects.find(
              (project) => project.projectId === Number(event.target.value),
            );
            setGroups(normalizeProjectGroups(nextProject ?? currentProject));
          }}
        >
          {projects.map((project) => (
            <option
              key={'collection-project-option-' + project.projectId}
              value={project.projectId}
            >
              {project.projectName}
            </option>
          ))}
        </Select>
      </VStack>
    );
  }

  return (
    <VStack alignItems="start" width="100%" className={className}>
      <Input
        size={isRounded ? 'md' : 'sm'}
        borderRadius={isRounded ? '20px' : undefined}
        placeholder="分组"
        value={newGroup}
        onChange={(e) => setNewGroupInput(e.target.value)}
        backgroundColor={colorMode === 'light' ? 'white' : undefined}
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            setNewGroupInput(newGroup, true);
          }
        }}
      />
    </VStack>
  );
};

export default GroupsInput;
`
  }
]

// 品牌补丁只负责 AI Club 标识和主题色，不承载中文翻译，便于后续独立升级和回滚。
for (const entry of fileReplacements) {
  patchFile(sourceRoot, entry)
}
for (const entry of projectFirstReplacements) {
  patchFile(sourceRoot, entry)
}
for (const entry of generatedFiles) {
  writeGeneratedFile(sourceRoot, entry)
}
