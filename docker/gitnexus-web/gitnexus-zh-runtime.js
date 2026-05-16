(() => {
  // 当前 gitnexus serve 版本没有 /api/heartbeat，页面新版心跳会误判断线；这里用 /api/repos 做兼容探活。
  const installHeartbeatEventSourceFallback = () => {
    if (window.__gitAiClubHeartbeatFallbackInstalled || typeof window.EventSource !== 'function') return
    window.__gitAiClubHeartbeatFallbackInstalled = true

    const NativeEventSource = window.EventSource
    const isHeartbeatUrl = (url) => {
      try {
        return new URL(String(url), window.location.href).pathname === '/api/heartbeat'
      } catch {
        return false
      }
    }

    class HeartbeatEventSource extends EventTarget {
      constructor(url) {
        super()
        this.url = String(url)
        this.withCredentials = false
        this.readyState = NativeEventSource.CONNECTING
        this.onopen = null
        this.onerror = null
        this.onmessage = null
        this.closed = false
        this.timer = null
        this.abortController = null
        window.setTimeout(() => this.check(), 0)
      }

      close() {
        this.closed = true
        this.readyState = NativeEventSource.CLOSED
        if (this.timer) window.clearTimeout(this.timer)
        if (this.abortController) this.abortController.abort()
      }

      emit(type) {
        const event = new Event(type)
        this.dispatchEvent(event)
        const handler = this[`on${type}`]
        if (typeof handler === 'function') handler.call(this, event)
      }

      async check() {
        if (this.closed) return
        const endpoint = new URL(this.url, window.location.href)
        endpoint.pathname = endpoint.pathname.replace(/\/api\/heartbeat$/, '/api/repos')
        endpoint.search = ''
        this.abortController = new AbortController()
        const timeout = window.setTimeout(() => this.abortController.abort(), 5000)
        try {
          const response = await fetch(endpoint.toString(), {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: this.abortController.signal
          })
          if (!response.ok) throw new Error(`Heartbeat fallback returned ${response.status}`)
          if (this.closed) return
          const wasOpen = this.readyState === NativeEventSource.OPEN
          this.readyState = NativeEventSource.OPEN
          if (!wasOpen) this.emit('open')
          this.timer = window.setTimeout(() => this.check(), 10000)
        } catch {
          if (!this.closed) {
            this.readyState = NativeEventSource.CLOSED
            this.emit('error')
          }
        } finally {
          window.clearTimeout(timeout)
        }
      }
    }

    const PatchedEventSource = function (url, eventSourceInitDict) {
      if (isHeartbeatUrl(url)) return new HeartbeatEventSource(url)
      return new NativeEventSource(url, eventSourceInitDict)
    }
    PatchedEventSource.CONNECTING = NativeEventSource.CONNECTING
    PatchedEventSource.OPEN = NativeEventSource.OPEN
    PatchedEventSource.CLOSED = NativeEventSource.CLOSED
    PatchedEventSource.prototype = NativeEventSource.prototype
    Object.setPrototypeOf(PatchedEventSource, NativeEventSource)
    window.EventSource = PatchedEventSource
  }

  installHeartbeatEventSourceFallback()

  const TEXT_MAP = new Map(Object.entries({
    'GitNexus': 'GitNexus',
    'Analyze Repository': '分析仓库',
    'Starting analysis...': '正在启动分析...',
    'Analyze your first repository': '分析你的第一个仓库',
    'Analyze a new repository...': '分析新仓库...',
    'GitHub Repository URL': 'GitHub 仓库地址',
    'Local Folder': '本地目录',
    'Local Folder Path': '本地目录路径',
    'Server Connected': '服务已连接',
    'Connecting...': '正在连接...',
    'Loading graph...': '正在加载图谱...',
    'Switching repository...': '正在切换仓库...',
    'Downloading graph...': '正在下载图谱...',
    'Processing graph...': '正在处理图谱...',
    'Copy the command': '复制命令',
    'Click the icon in the terminal to copy.': '点击终端中的图标即可复制。',
    'Auto-connects and opens the graph': '自动连接并打开图谱',
    'No refresh needed — the page detects the server automatically.': '无需刷新，页面会自动探测本地服务。',
    'Public repos only · Cloned locally by the server · No data leaves your machine': '仅支持公开仓库 · 由本地服务克隆 · 数据不会离开你的机器',
    'Public & private repos · Cloned locally by the server · No data leaves your machine': '支持公开和私有仓库 · 由本地服务克隆 · 数据不会离开你的机器',
    'Paste a GitHub URL and GitNexus will clone it, parse the code, and build a live knowledge graph — right in your browser.': '粘贴 GitHub 地址后，GitNexus 会克隆仓库、解析代码，并在浏览器中构建实时知识图谱。',
    'Backend URL': '后端地址',
    'Enable Semantic Search': '启用语义搜索',
    'Explorer': '浏览器',
    'Filters': '筛选',
    'NODE TYPES': '节点类型',
    'Node Types': '节点类型',
    'Toggle visibility of node types in the graph': '切换图谱中各类节点的显示状态',
    'Folder': '文件夹',
    'File': '文件',
    'Class': '类',
    'Interface': '接口',
    'Enum': '枚举',
    'Type': '类型',
    'Function': '函数',
    'Method': '方法',
    'Variable': '变量',
    'Decorator': '装饰器',
    'Import': '导入',
    'EDGE TYPES': '关系类型',
    'Edge Types': '关系类型',
    'Toggle visibility of relationship types': '切换各类关系的显示状态',
    'Focus Depth': '聚焦深度',
    'Show nodes within N hops of selection': '只显示所选节点 N 跳内的节点',
    'All': '全部',
    '1 hop': '1 跳',
    '2 hops': '2 跳',
    '3 hops': '3 跳',
    '5 hops': '5 跳',
    'Select a node to apply depth filter': '选择节点后应用深度筛选',
    'Color Legend': '颜色图例',
    'Star if cool': '喜欢就点星',
    'Nexus AI': 'Nexus 智能助手',
    'Processes': '流程',
    'Process': '流程',
    'No Processes Detected': '未检测到流程',
    'Processes are execution flows traced from entry points. Load a codebase to see detected processes.': '流程是从入口点追踪出来的执行链路。加载代码库后即可查看检测到的流程。',
    'Full Process Map': '完整流程图',
    'Full 流程 Map': '完整流程图',
    'View combined map of': '查看汇总流程图，共',
    'processes detected': '个流程已检测到',
    'processes': '个流程',
    'steps': '个步骤',
    'clusters': '个分组',
    'nodes': '个节点',
    'edges': '条关系',
    'Cross-Community': '跨社区流程',
    'Intra-Community': '社区内流程',
    'NEW': '新',
    'Connecting': '正在连接',
    'Connecting...': '正在连接...',
    'Configure AI': '配置 AI',
    'You': '你',
    'Assistant': '助手',
    'Thinking': '思考中',
    'Stop': '停止',
    'Send': '发送',
    'Ask me anything': '尽管问我',
    'I can help you understand the architecture, find functions, or explain connections.': '我可以帮你理解架构、查找函数或解释代码关系。',
    'Explain the project architecture': '解释项目架构',
    'What does this project do?': '这个项目是做什么的？',
    'Show me the most important files': '列出最重要的文件',
    'Find all API handlers': '查找所有 API 处理器',
    'Configure an LLM provider to enable chat.': '配置 LLM 提供方后即可启用对话。',
    'Query': '查询',
    'Layout optimized': '布局已优化',
    'Layout optimizing': '正在优化布局',
    'Server connection lost — reconnecting...': '服务连接丢失，正在重连...',
    'Server connection lost — reconnecting…': '服务连接丢失，正在重连...',
    'Server connection lost - reconnecting...': '服务连接丢失，正在重连...',
    'Ready': '就绪',
    'Sponsor': '赞助',
    'need to buy some API credits to run SWE-bench 😅': '需要购买一些 API 额度来运行 SWE-bench 😅',
    'Settings': '设置',
    'Help': '帮助',
    'Zoom in': '放大',
    'Zoom out': '缩小',
    'Fit view': '适配视图',
    'AI Settings': 'AI 设置',
    'Provider': '提供方',
    'API Key': 'API 密钥',
    'Model': '模型',
    'Temperature': '温度',
    'Max Tokens': '最大 Tokens',
    'Save Settings': '保存设置',
    'Save': '保存',
    'Cancel': '取消',
    'OpenAI': 'OpenAI',
    'Azure OpenAI': 'Azure OpenAI',
    'Google Gemini': 'Google Gemini',
    'Anthropic': 'Anthropic',
    'Ollama (Local)': 'Ollama（本地）',
    'OpenRouter': 'OpenRouter',
    'MiniMax': 'MiniMax',
    'GLM (Z.AI)': 'GLM（Z.AI）',
    'Initializing AI agent...': '正在初始化 AI 智能助手...',
    'Expand Panel': '展开面板',
    'Collapse Panel': '收起面板',
    'File Explorer': '文件浏览器',
    'Expand Code Panel': '展开代码面板',
    'Code Inspector': '代码检查器',
    'Selected': '已选择',
    'Clear selection': '清除选择',
    'Clear AI citations': '清空 AI 引用',
    'AI Citations': 'AI 引用',
    'Focus in graph': '在图谱中聚焦',
    'Remove': '移除',
    'Drag to resize': '拖动调整宽度',
    'Loading source...': '正在加载源码...',
    'Select a file node to preview its contents.': '选择一个文件节点以预览内容。',
    'Code not available in memory for': '内存中暂无源码：',
    'Code': '代码',
    'SELECTED': '已选择',
    'Diagram Too Large': '图表过大',
    'Render Error': '渲染错误',
    'All Processes': '全部流程',
    'This diagram has': '该图表包含',
    'steps and is too complex to render. Try viewing individual processes instead of "All Processes".': '个步骤，复杂度过高无法渲染。请尝试查看单个流程，而不是“全部流程”。',
    'Unable to render diagram. Steps:': '无法渲染图表。步骤数：',
    'Copy diagram': '复制图表',
    'Highlight in graph': '在图谱中高亮',
    'Search nodes...': '搜索节点...',
    'Search Code': '搜索代码',
    'Cypher Query': 'Cypher 查询',
    'Pattern Search': '模式搜索',
    'Read File': '读取文件',
    'Loading AI model...': '正在加载 AI 模型...',
    'Clear': '清空',
    'Clear chat': '清空对话',
    'Clear Selection': '清除选择',
    'Close Panel': '关闭面板',
    'Copy to clipboard': '复制到剪贴板',
    'Copied!': '已复制',
    'Processing...': '处理中...',
    'Scroll to bottom': '滚动到底部',
    'Stop response': '停止回答',
    'Extracting file contents': '正在提取文件内容',
    'Connecting to server...': '正在连接服务...',
    'Validating server': '正在校验服务',
    'Failed to connect to server': '连接服务失败',
    'Failed to switch repository': '切换仓库失败',
    'Failed to initialize agent': '初始化智能助手失败',
    'Unknown error': '未知错误',
    'No project loaded. Load a project first.': '尚未加载项目，请先加载一个项目。',
    'Database not ready. Please wait for the graph to finish loading.': '数据库尚未就绪，请等待图谱加载完成。',
    'Couldn\'t create embeddings with WebGPU, so semantic search (Graph RAG) won\'t be as smart. The graph still works fine though!': '无法使用 WebGPU 创建嵌入向量，因此语义搜索（Graph RAG）效果会弱一些；图谱功能仍可正常使用。',
    'Skip it': '跳过',
    'Graph works, just no AI semantic search': '图谱可用，只是不启用 AI 语义搜索',
    'Contains': '包含',
    'Defines': '定义',
    'Imports': '导入',
    'Calls': '调用',
    'Extends': '继承',
    'Implements': '实现',
    'CONTAINS': '包含',
    'DEFINES': '定义',
    'IMPORTS': '导入',
    'CALLS': '调用',
    'EXTENDS': '继承',
    'IMPLEMENTS': '实现'
  }))

  const PLACEHOLDER_MAP = new Map(Object.entries({
    'Search files...': '搜索文件...',
    'Search nodes...': '搜索节点...',
    'Filter processes...': '筛选流程...',
    'Ask anything about this codebase...': '询问这个代码库里的任何问题...',
    'Ask about the codebase...': '询问这个代码库...',
    'Enter GitHub repository URL': '输入 GitHub 仓库地址',
    'Enter local folder path': '输入本地目录路径'
  }))

  const PROMPT_MAP = new Map(Object.entries({
    'Explain the project architecture': '解释项目架构',
    '解释项目架构': '解释项目架构',
    'What does this project do?': '这个项目是做什么的？',
    '这个项目是做什么的？': '这个项目是做什么的？',
    'Show me the most important files': '列出最重要的文件',
    '列出最重要的文件': '列出最重要的文件',
    'Find all API handlers': '查找所有 API 处理器',
    '查找所有 API 处理器': '查找所有 API 处理器'
  }))

  const TITLE_MAP = new Map(Object.entries({
    'Clear Selection': '清除选择',
    'Clear chat': '清空对话',
    'Close Panel': '关闭面板',
    'Copy to clipboard': '复制到剪贴板',
    'Copied!': '已复制',
    'Scroll to bottom': '滚动到底部',
    'Stop response': '停止回答'
  }))

  const SKIP_SELECTOR = 'code, pre, textarea, input, [contenteditable="true"], canvas, svg'
  const URL_PATTERN = /^(https?:\/\/|[./\\]?([\w.-]+\/)+[\w.-]+|[A-Za-z]:\\)/

  const shouldSkipText = (node) => {
    const parent = node.parentElement
    if (!parent || parent.closest(SKIP_SELECTOR)) return true
    const value = node.nodeValue.trim()
    if (!value || value.length > 220) return true
    if (URL_PATTERN.test(value)) return true
    // 真实代码符号和路径通常带有小写驼峰、斜杠或扩展名，这里避免误翻译图谱内容。
    if (/\.(ts|tsx|js|jsx|java|py|go|rs|vue|css|json|md)$/i.test(value)) return true
    return false
  }

  const translateTextValue = (value) => {
    const trimmed = value.trim()
    if (TEXT_MAP.has(trimmed)) {
      return value.replace(trimmed, TEXT_MAP.get(trimmed))
    }
    let next = value
    for (const [source, target] of TEXT_MAP.entries()) {
      if (source.length < 5 || !next.includes(source)) continue
      next = next.split(source).join(target)
    }
    next = next.replace(/(\d+) files\b/g, '$1 个文件')
      .replace(/(\d+) symbols\b/g, '$1 个符号')
      .replace(/(\d+) flows\b/g, '$1 条流程')
      .replace(/(\d+) processes detected\b/g, '$1 个流程已检测到')
      .replace(/View combined map of (\d+) processes\b/g, '查看 $1 个流程的汇总图')
      .replace(/(\d+) processes\b/g, '$1 个流程')
      .replace(/(\d+) nodes\b/g, '$1 个节点')
      .replace(/(\d+) node\b/g, '$1 个节点')
      .replace(/(\d+) edges\b/g, '$1 条关系')
      .replace(/(\d+) edge\b/g, '$1 条关系')
      .replace(/(\d+) references\b/g, '$1 条引用')
      .replace(/(\d+) reference\b/g, '$1 条引用')
      .replace(/(\d+) lines\b/g, '$1 行')
      .replace(/(\d+) line\b/g, '$1 行')
      .replace(/(\d+) steps\b/g, '$1 个步骤')
      .replace(/(\d+) step\b/g, '$1 个步骤')
      .replace(/(\d+) clusters\b/g, '$1 个分组')
      .replace(/(\d+) cluster\b/g, '$1 个分组')
      .replace(/\bL(\d+)\b/g, '第 $1 行')
      .replace(/(\d+) nodes found for “([^”]+)”/g, '为“$2”找到 $1 个节点')
      .replace(/No nodes found for “([^”]+)”/g, '没有找到“$1”相关节点')
      .replace(/(\d+)h ago\b/g, '$1 小时前')
      .replace(/(\d+)d ago\b/g, '$1 天前')
      .replace(/(\d+)m (\d+)s\b/g, '$1 分 $2 秒')
      .replace(/(\d+)s\b/g, '$1 秒')
      .replace(/([\d.]+) MB downloaded\b/g, '已下载 $1 MB')
    return next
  }

  const translateAttributes = (element) => {
    for (const [attributeName, dictionary] of [
      ['placeholder', PLACEHOLDER_MAP],
      ['aria-label', TITLE_MAP],
      ['title', TITLE_MAP],
      ['alt', TITLE_MAP],
      ['value', TEXT_MAP],
      ['data-tooltip', TITLE_MAP],
      ['data-title', TITLE_MAP]
    ]) {
      const raw = element.getAttribute(attributeName)
      if (!raw) continue
      const translated = dictionary.get(raw) || translateTextValue(raw)
      if (translated !== raw) element.setAttribute(attributeName, translated)
    }
  }

  const hideElement = (element) => {
    element.setAttribute('data-git-ai-club-hidden', 'true')
    element.style.setProperty('display', 'none', 'important')
    element.style.setProperty('visibility', 'hidden', 'important')
    element.style.setProperty('pointer-events', 'none', 'important')
  }

  const textOf = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim()

  const removeOfficialDecorations = () => {
    document.querySelectorAll('a[href*="github.com/abhigyanpatwari/GitNexus"]').forEach(hideElement)

    document.querySelectorAll('button, a').forEach((element) => {
      const text = textOf(element)
      if (!text) return
      if (text.includes('喜欢就点星') || text.includes('Star if cool')) hideElement(element)
      if (text.includes('赞助') || text.includes('Sponsor') || text.includes('SWE-bench') || text.includes('API 额度')) hideElement(element)
    })

    document.querySelectorAll('span, div').forEach((element) => {
      const text = textOf(element)
      if (!text || text.length > 90 || element.querySelector('div')) return
      if (text.includes('SWE-bench') || text.includes('API 额度')) {
        hideElement(element.closest('a, button') || element)
      }
    })
  }

  const setNativeInputValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (nativeSetter) nativeSetter.call(element, value)
    else element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const findPromptInput = () => {
    const textareas = [...document.querySelectorAll('textarea')].filter((element) => !element.disabled && !element.readOnly)
    if (textareas.length) return textareas[textareas.length - 1]
    return [...document.querySelectorAll('input')]
      .filter((element) => !element.disabled && !element.readOnly)
      .find((element) => /Ask|询问|codebase|代码库/i.test(element.placeholder || ''))
  }

  const setPromptInput = (prompt) => {
    const input = findPromptInput()
    if (!input) return
    setNativeInputValue(input, prompt)
    input.focus({ preventScroll: true })
  }

  const normalizePromptInputs = () => {
    document.querySelectorAll('input, textarea').forEach((element) => {
      const translated = PROMPT_MAP.get(element.value)
      if (translated && translated !== element.value) {
        setNativeInputValue(element, translated)
      }
    })
  }

  const installPromptClickTranslator = () => {
    if (window.__gitAiClubPromptClickTranslatorInstalled) return
    window.__gitAiClubPromptClickTranslatorInstalled = true
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null
      if (!target) return
      const prompt = PROMPT_MAP.get(textOf(target))
      if (!prompt) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      window.setTimeout(() => setPromptInput(prompt), 0)
      window.setTimeout(() => normalizePromptInputs(), 0)
      window.setTimeout(() => normalizePromptInputs(), 60)
      window.setTimeout(() => normalizePromptInputs(), 160)
      window.setTimeout(() => normalizePromptInputs(), 320)
    }, true)
  }

  const applyUiPolish = () => {
    removeOfficialDecorations()
    normalizePromptInputs()
    installPromptClickTranslator()
  }

  const translateNode = (root) => {
    if (root.nodeType === Node.TEXT_NODE) {
      if (shouldSkipText(root)) return
      const translated = translateTextValue(root.nodeValue)
      if (translated !== root.nodeValue) root.nodeValue = translated
      return
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return
    if (root.matches(SKIP_SELECTOR)) {
      translateAttributes(root)
      return
    }
    translateAttributes(root)
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => shouldSkipText(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    })
    const textNodes = []
    while (walker.nextNode()) textNodes.push(walker.currentNode)
    for (const textNode of textNodes) {
      const translated = translateTextValue(textNode.nodeValue)
      if (translated !== textNode.nodeValue) textNode.nodeValue = translated
    }
    root.querySelectorAll('input, textarea, button, [title], [aria-label], [alt], [value], [data-tooltip], [data-title]').forEach(translateAttributes)
  }

  let scheduled = false
  const scheduleTranslate = () => {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(() => {
      scheduled = false
      translateNode(document.body)
      applyUiPolish()
    })
  }

  document.documentElement.lang = 'zh-CN'
  document.title = 'GitNexus 全仓图'

  const installDomTranslator = () => {
    if (!document.body || window.__gitAiClubDomTranslatorInstalled) return false
    window.__gitAiClubDomTranslatorInstalled = true
    translateNode(document.body)
    applyUiPolish()
    new MutationObserver(scheduleTranslate).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'value', 'data-tooltip', 'data-title']
    })
    return true
  }

  if (!installDomTranslator()) {
    const waitForBody = new MutationObserver(() => {
      if (installDomTranslator()) waitForBody.disconnect()
    })
    waitForBody.observe(document.documentElement, { childList: true, subtree: true })
    window.addEventListener('DOMContentLoaded', installDomTranslator, { once: true })
  }
})()
