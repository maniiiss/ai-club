import { useEffect, useState } from 'react'
import { Terminal, Copy, Check } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { fetchGitPilotCliInfo } from '@/src/api/gitpilot-cli'

/**
 * GitPilot CLI 专题页：展示一键安装命令（Windows / Linux+macOS）、使用步骤与环境要求。
 * 下载基础地址从后端 /api/public/gitpilot-cli/info 获取（可配），为空时回退当前域名。
 */
export const GitPilotCliPage = () => {
  const [baseUrl, setBaseUrl] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    fetchGitPilotCliInfo()
      .then((info) => setBaseUrl(info.downloadBaseUrl || window.location.origin))
      .catch(() => setBaseUrl(window.location.origin))
  }, [])

  const winCmd = `powershell -ep Bypass -c "irm ${baseUrl}/downloads/install.ps1 | iex"`
  const unixCmd = `curl -fsSL ${baseUrl}/downloads/install.sh | bash`

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const installSteps = [
    { title: '启动 GitPilot', cmd: 'gitpilot' },
    { title: '登录平台（浏览器设备授权）', cmd: '/login' },
    { title: '选择模型开始推理', cmd: '/model' },
    { title: '查看负责人是自己的需求', cmd: '/requirement' },
  ]

  return (
    <div className="mx-auto h-full max-w-3xl space-y-6 overflow-y-auto p-6 animate-fadeIn">
      <div>
        <h1 className="flex items-center gap-2 text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">
          <Terminal className="h-6 w-6 text-[var(--color-primary)]" /> GitPilot CLI
        </h1>
        <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          在终端使用 GitPilot 的 AI 代码协作能力，复用平台模型推理，本地 Coding Agent 直接读写你的仓库。
        </p>
      </div>

      <Card title="一键安装">
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">Windows（PowerShell）</p>
            <div className="flex items-center gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-2.5">
                <code className="font-mono text-[13px] text-[var(--color-text-primary)]">{winCmd}</code>
              </pre>
              <button
                onClick={() => copy(winCmd, 'win')}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="复制 Windows 安装命令"
              >
                {copied === 'win' ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]">Linux / macOS</p>
            <div className="flex items-center gap-2">
              <pre className="flex-1 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-2.5">
                <code className="font-mono text-[13px] text-[var(--color-text-primary)]">{unixCmd}</code>
              </pre>
              <button
                onClick={() => copy(unixCmd, 'unix')}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="复制 Linux/macOS 安装命令"
              >
                {copied === 'unix' ? <Check className="h-4 w-4 text-[var(--color-success)]" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="text-[12px] text-[var(--color-text-tertiary)]">
            安装脚本会下载 GitPilot CLI 源码包到 <code className="font-mono">~/.gitpilot/cli/</code> 并自动构建、注册 <code className="font-mono">gitpilot</code> 命令。
          </p>
        </div>
      </Card>

      <Card title="使用步骤">
        <ol className="space-y-4">
          {installSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[12px] font-bold text-[var(--color-primary)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-[var(--color-text-primary)]">{s.title}</p>
                <pre className="mt-1.5 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-2.5">
                  <code className="font-mono text-[13px] text-[var(--color-text-primary)]">{s.cmd}</code>
                </pre>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="环境要求">
        <ul className="space-y-2 text-[14px] text-[var(--color-text-secondary)]">
          <li className="flex items-center gap-2">
            <span className="text-[var(--color-text-tertiary)]">·</span> Node.js ≥ 22.19（pi-coding-agent 0.81.1 要求）
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[var(--color-text-tertiary)]">·</span> Windows / macOS / Linux
          </li>
          <li className="flex items-center gap-2">
            <span className="text-[var(--color-text-tertiary)]">·</span> npm（随 Node.js 安装）
          </li>
        </ul>
      </Card>
    </div>
  )
}
