/**
 * GitPilot 我的反馈页面。
 * 业务意图：让用户主动查看反馈是否已被处理以及处理结论，形成可感知的闭环。
 */
import { useEffect, useState } from 'react'
import { MessageSquareText, ThumbsDown, ThumbsUp } from 'lucide-react'
import { pageAssistantFeedback } from '@/src/api/assistant'
import { Card } from '@/src/components/common/Card'
import { EmptyState } from '@/src/components/common/EmptyState'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { getErrorMessage } from '@/src/lib/utils'
import type { AssistantMessageFeedbackSummary } from '@/src/types/assistant'

const statusLabels: Record<string, string> = {
  NEW: '待处理',
  TRIAGED: '已分诊',
  IN_PROGRESS: '处理中',
  RESOLVED: '已解决',
  REJECTED: '暂不处理',
  DUPLICATE: '重复问题',
  AUTO_CLOSED: '已记录',
}

const reasonLabels: Record<string, string> = {
  WRONG_ANSWER: '事实错误',
  IRRELEVANT: '答非所问',
  MISSING_CONTEXT: '上下文缺失',
  TOOL_FAILED: '工具失败',
  INTERRUPTED: '响应中断',
  UNCLEAR: '表达不清',
  OTHER: '其他',
}

export const AssistantFeedbackPage = () => {
  const [items, setItems] = useState<AssistantMessageFeedbackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    pageAssistantFeedback({ page: 1, size: 100 })
      .then((data) => {
        if (alive) setItems(data.records)
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [])

  return (
    <div className="mx-auto h-full max-w-4xl overflow-y-auto pb-8 animate-fadeIn">
      <div className="mb-5">
        <h1 className="text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">我的 GitPilot 反馈</h1>
        <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">查看你提交的回答评价和处理结论。</p>
      </div>
      {error && <div className="mb-4 rounded-lg bg-[var(--color-danger-light)] px-3 py-2 text-[13px] text-[var(--color-danger)]">{error}</div>}
      {loading ? <LoadingSpinner /> : !items.length ? (
        <EmptyState icon={<MessageSquareText className="h-6 w-6" />} title="暂无反馈" description="在 GitPilot 回答下提交评价后，会在这里显示。" />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-2">
                  {item.vote === 'UP' ? <ThumbsUp className="h-4 w-4 text-emerald-600" /> : <ThumbsDown className="h-4 w-4 text-rose-600" />}
                  <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">{item.vote === 'UP' ? '回答有帮助' : '回答需要改进'}</span>
                </div>
                <span className="rounded-full bg-[var(--color-bg-hover)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]">{statusLabels[item.status] || item.status}</span>
              </div>
              <div className="mt-3 rounded-lg bg-[var(--color-bg-hover)] p-3">
                <p className="text-[12px] font-medium text-[var(--color-text-tertiary)]">我的问题</p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-6 text-[var(--color-text-primary)]">{item.questionSnapshot || '暂无问题快照'}</p>
              </div>
              <div className="mt-3">
                <p className="text-[12px] font-medium text-[var(--color-text-tertiary)]">反馈原因</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {item.reasonCodes.map((reason) => <span key={reason} className="rounded-full bg-rose-50 px-2 py-1 text-[11px] text-rose-700">{reasonLabels[reason] || reason}</span>)}
                  {!item.reasonCodes.length && <span className="text-[12px] text-[var(--color-text-tertiary)]">—</span>}
                </div>
              </div>
              {item.comment && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-6 text-[var(--color-text-secondary)]">补充说明：{item.comment}</p>}
              {item.resolutionNote && <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-[13px] leading-6 text-emerald-800">处理结果：{item.resolutionNote}</div>}
              <p className="mt-3 text-[11px] text-[var(--color-text-tertiary)]">提交于 {item.createdAt || '—'}{item.resolvedAt ? ` · 处理于 ${item.resolvedAt}` : ''}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
