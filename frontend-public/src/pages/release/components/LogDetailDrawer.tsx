/**
 * 日志详情抽屉。
 * 统一展示 AI Club 流水线运行日志和 Jenkins 构建日志。
 * 通过 mode 区分两种日志来源，调用不同的 API。
 */
import { useEffect, useState, useCallback } from 'react'
import { SlideDrawer } from '@/src/components/common/SlideDrawer'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { Button } from '@/src/components/common/Button'
import { getAiClubPipelineRunLog, getPipelineBuildLog } from '@/src/api/release'
import { getErrorMessage, formatDateTime, cn } from '@/src/lib/utils'
import type {
  AiClubPipelineRunLogDetail,
  JenkinsBuildLogDetail,
} from '@/src/types/release'
import { getStatusColor } from '../constants'
import { ExternalLink, FileText, Copy, Check, ChevronDown, ChevronUp } from 'lucide-react'

export interface LogDetailDrawerProps {
  /** 日志来源模式：AI Club 运行日志 或 Jenkins 构建日志。 */
  mode: 'ai-club-run' | 'jenkins-build'
  /** AI Club 模式下传流水线 ID，Jenkins 模式下传绑定 ID。 */
  refId: number
  /** AI Club 模式下传运行编号，Jenkins 模式下传构建编号。 */
  seqNumber: number
  open: boolean
  onClose: () => void
}

export const LogDetailDrawer = ({
  mode,
  refId,
  seqNumber,
  open,
  onClose,
}: LogDetailDrawerProps) => {
  const [log, setLog] = useState<AiClubPipelineRunLogDetail | JenkinsBuildLogDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  const fetchLog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'ai-club-run') {
        setLog(await getAiClubPipelineRunLog(refId, seqNumber))
      } else {
        setLog(await getPipelineBuildLog(refId, seqNumber))
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [mode, refId, seqNumber])

  useEffect(() => {
    if (open) fetchLog()
  }, [open, fetchLog])

  const handleCopy = async () => {
    if (!log) return
    const text = log.consoleLog
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* 忽略剪贴板错误 */
    }
  }

  const isAiClub = mode === 'ai-club-run'
  const runLog = isAiClub ? (log as AiClubPipelineRunLogDetail | null) : null
  const buildLog = !isAiClub ? (log as JenkinsBuildLogDetail | null) : null
  const consoleLog = log?.consoleLog ?? ''

  /** 日志标题。 */
  const title = log
    ? isAiClub
      ? `${runLog?.pipelineName ?? ''} #${runLog?.runNumber ?? seqNumber}`
      : `${buildLog?.jobName ?? ''} #${buildLog?.buildNumber ?? seqNumber}`
    : `#${seqNumber}`

  /** 日志状态。 */
  const status = log ? (isAiClub ? runLog?.status : buildLog?.result) : null

  /** 外部链接。 */
  const externalUrl = log ? (isAiClub ? runLog?.url : buildLog?.url) : null

  /** 元信息列表。 */
  const metaParts: string[] = []
  if (log) {
    if (isAiClub && runLog) {
      if (runLog.startedAt) metaParts.push(`开始: ${formatDateTime(runLog.startedAt)}`)
      if (runLog.finishedAt) metaParts.push(`结束: ${formatDateTime(runLog.finishedAt)}`)
      if (runLog.branch) metaParts.push(`分支: ${runLog.branch}`)
    } else if (buildLog) {
      if (buildLog.executedAt) metaParts.push(`执行: ${formatDateTime(buildLog.executedAt)}`)
      if (buildLog.durationText) metaParts.push(`时长: ${buildLog.durationText}`)
    }
  }

  const charCount = consoleLog.length.toLocaleString()

  return (
    <SlideDrawer
      open={open}
      onClose={onClose}
      title={title}
      description={isAiClub ? '运行日志详情' : '构建日志详情'}
      width="100%"
      maxWidth="1100px"
      headerActions={
        <Button
          variant="ghost"
          size="sm"
          icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
          onClick={handleCopy}
          disabled={!consoleLog}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      }
    >
      {loading ? (
        <LoadingSpinner fullscreen text="加载日志…" />
      ) : error ? (
        <div className="p-6">
          <ErrorState description={error} onRetry={fetchLog} />
        </div>
      ) : !log ? (
        <div className="p-6">
          <ErrorState description="未找到日志数据" />
        </div>
      ) : (
        <div className="p-6 space-y-4">
          {/* 状态与元信息 */}
          <div className="flex flex-wrap items-center gap-3">
            {status && (
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-medium', getStatusColor(status))}>
                {status}
              </span>
            )}
            {metaParts.map((info, i) => (
              <span key={i} className="text-[11px] text-[var(--color-text-tertiary)]">{info}</span>
            ))}
            {externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[11px] text-[var(--color-primary)] hover:underline"
              >
                <ExternalLink className="h-3 w-3" />外部链接
              </a>
            )}
          </div>

          {/* 控制台日志 */}
          <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border-light)] bg-[var(--color-bg-hover)] px-4 py-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">控制台日志</span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">{`(${charCount} 字符)`}</span>
              </div>
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
            {!collapsed && (
              <pre className="max-h-[60vh] overflow-auto bg-gray-900 p-4 text-[12px] leading-5 text-gray-100 font-mono whitespace-pre-wrap break-all">
                {consoleLog || '（空日志）'}
              </pre>
            )}
          </div>
        </div>
      )}
    </SlideDrawer>
  )
}
