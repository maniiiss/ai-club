/**
 * Webhook 配置面板。
 * 管理流水线的触发 Webhook 和回调 Webhook 配置。
 */
import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { Card } from '@/src/components/common/Card'
import {
  getAiClubPipelineTriggerWebhook,
  updateAiClubPipelineTriggerWebhook,
  getAiClubPipelineCallbackWebhook,
  updateAiClubPipelineCallbackWebhook,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import { subscribableStatuses } from '../constants'
import type {
  AiClubPipelineTriggerWebhook,
  AiClubPipelineTriggerWebhookPayload,
  AiClubPipelineCallbackWebhook,
  AiClubPipelineCallbackWebhookPayload,
} from '@/src/types/release'
import { Webhook, Copy, Check, Zap, Bell } from 'lucide-react'

interface WebhookPanelProps {
  pipelineId: number
}

export const WebhookPanel = ({ pipelineId }: WebhookPanelProps) => {
  /* 触发 Webhook 状态 */
  const [triggerWebhook, setTriggerWebhook] = useState<AiClubPipelineTriggerWebhook | null>(null)
  const [triggerLoading, setTriggerLoading] = useState(true)
  const [triggerSaving, setTriggerSaving] = useState(false)
  const [triggerEnabled, setTriggerEnabled] = useState(false)
  const [regenerateToken, setRegenerateToken] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [triggerCopied, setTriggerCopied] = useState(false)

  /* 回调 Webhook 状态 */
  const [callbackWebhook, setCallbackWebhook] = useState<AiClubPipelineCallbackWebhook | null>(null)
  const [callbackLoading, setCallbackLoading] = useState(true)
  const [callbackSaving, setCallbackSaving] = useState(false)
  const [callbackEnabled, setCallbackEnabled] = useState(false)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [subscribedStatuses, setSubscribedStatuses] = useState<string[]>([])
  const [callbackError, setCallbackError] = useState<string | null>(null)

  /** 加载触发 Webhook 配置。 */
  const fetchTriggerWebhook = useCallback(async () => {
    setTriggerLoading(true)
    setTriggerError(null)
    try {
      const data = await getAiClubPipelineTriggerWebhook(pipelineId)
      setTriggerWebhook(data)
      setTriggerEnabled(data.enabled)
      setRegenerateToken(false)
    } catch (err) {
      setTriggerError(getErrorMessage(err))
    } finally {
      setTriggerLoading(false)
    }
  }, [pipelineId])

  /** 加载回调 Webhook 配置。 */
  const fetchCallbackWebhook = useCallback(async () => {
    setCallbackLoading(true)
    setCallbackError(null)
    try {
      const data = await getAiClubPipelineCallbackWebhook(pipelineId)
      setCallbackWebhook(data)
      setCallbackEnabled(data.enabled)
      setSubscribedStatuses(data.subscribedStatuses || [])
    } catch (err) {
      setCallbackError(getErrorMessage(err))
    } finally {
      setCallbackLoading(false)
    }
  }, [pipelineId])

  useEffect(() => {
    fetchTriggerWebhook()
    fetchCallbackWebhook()
  }, [fetchTriggerWebhook, fetchCallbackWebhook])

  /** 保存触发 Webhook。 */
  const handleSaveTrigger = async () => {
    setTriggerSaving(true)
    setTriggerError(null)
    try {
      const payload: AiClubPipelineTriggerWebhookPayload = {
        enabled: triggerEnabled,
        regenerateToken,
      }
      const data = await updateAiClubPipelineTriggerWebhook(pipelineId, payload)
      setTriggerWebhook(data)
      setRegenerateToken(false)
    } catch (err) {
      setTriggerError(getErrorMessage(err))
    } finally {
      setTriggerSaving(false)
    }
  }

  /** 保存回调 Webhook。 */
  const handleSaveCallback = async () => {
    setCallbackSaving(true)
    setCallbackError(null)
    try {
      const payload: AiClubPipelineCallbackWebhookPayload = {
        enabled: callbackEnabled,
        callbackUrl: callbackUrl.trim() || null,
        subscribedStatuses,
      }
      const data = await updateAiClubPipelineCallbackWebhook(pipelineId, payload)
      setCallbackWebhook(data)
      setCallbackUrl('')
    } catch (err) {
      setCallbackError(getErrorMessage(err))
    } finally {
      setCallbackSaving(false)
    }
  }

  /** 复制触发 URL。 */
  const handleCopyTriggerUrl = async () => {
    if (!triggerWebhook?.triggerUrl) return
    try {
      await navigator.clipboard.writeText(triggerWebhook.triggerUrl)
      setTriggerCopied(true)
      setTimeout(() => setTriggerCopied(false), 2000)
    } catch { /* 忽略 */ }
  }

  /** 切换状态订阅。 */
  const toggleStatus = (status: string) => {
    setSubscribedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    )
  }

  return (
    <div className="space-y-6">
      {/* 触发 Webhook */}
      <Card title="触发 Webhook">
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            启用后可通过 URL 匿名触发流水线运行，无需登录态。
          </p>

          {triggerLoading ? (
            <LoadingSpinner text="加载触发 Webhook…" />
          ) : triggerError ? (
            <p className="text-[13px] text-[var(--color-danger)]">{triggerError}</p>
          ) : triggerWebhook ? (
            <>
              {/* 当前配置展示 */}
              {triggerWebhook.triggerUrl && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">触发 URL</span>
                    <button
                      onClick={handleCopyTriggerUrl}
                      className="text-[var(--color-text-tertiary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                      {triggerCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="mt-1 break-all font-mono text-[12px] text-[var(--color-text-primary)]">
                    {triggerWebhook.triggerUrl}
                  </p>
                  {triggerWebhook.maskedToken && (
                    <p className="mt-1 text-[11px] text-[var(--color-text-tertiary)]">
                      Token: {triggerWebhook.maskedToken}
                    </p>
                  )}
                </div>
              )}

              {/* 编辑表单 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={triggerEnabled}
                  onChange={(e) => setTriggerEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
                />
                <span className="text-[13px] text-[var(--color-text-primary)]">启用触发 Webhook</span>
              </label>

              {triggerEnabled && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={regenerateToken}
                    onChange={(e) => setRegenerateToken(e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
                  />
                  <span className="text-[13px] text-[var(--color-text-primary)]">重新生成 Token</span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">（旧 URL 将失效）</span>
                </label>
              )}

              <div className="flex items-center justify-between">
                {triggerWebhook.updatedAt && (
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    更新于 {formatDateTime(triggerWebhook.updatedAt)}
                  </span>
                )}
                <Button size="sm" loading={triggerSaving} onClick={handleSaveTrigger} icon={<Zap className="h-3.5 w-3.5" />}>
                  保存
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Card>

      {/* 回调 Webhook */}
      <Card title="回调 Webhook">
        <div className="space-y-4">
          <p className="text-[13px] text-[var(--color-text-secondary)]">
            流水线运行状态变更时回调通知指定 URL。
          </p>

          {callbackLoading ? (
            <LoadingSpinner text="加载回调 Webhook…" />
          ) : callbackError ? (
            <p className="text-[13px] text-[var(--color-danger)]">{callbackError}</p>
          ) : callbackWebhook ? (
            <>
              {/* 当前配置展示 */}
              {callbackWebhook.callbackUrlMasked && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-hover)] p-3">
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">回调地址</span>
                  <p className="mt-1 font-mono text-[12px] text-[var(--color-text-primary)]">
                    {callbackWebhook.callbackUrlMasked}
                  </p>
                </div>
              )}

              {callbackWebhook.lastDeliveryAt && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)]">
                  <Bell className="h-3 w-3" />
                  最近投递: {formatDateTime(callbackWebhook.lastDeliveryAt)}
                  {callbackWebhook.lastDeliveryStatus && (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-medium',
                        callbackWebhook.lastDeliveryStatus === 'SUCCESS'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-red-50 text-red-700',
                      )}
                    >
                      {callbackWebhook.lastDeliveryStatus}
                    </span>
                  )}
                </div>
              )}

              {/* 编辑表单 */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={callbackEnabled}
                  onChange={(e) => setCallbackEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
                />
                <span className="text-[13px] text-[var(--color-text-primary)]">启用回调 Webhook</span>
              </label>

              <Input
                label="回调地址"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                placeholder="https://example.com/webhook/callback"
                maxLength={2000}
                hint="留空则不修改已配置的地址"
              />

              {/* 订阅状态多选 */}
              <div>
                <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">订阅状态</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subscribableStatuses.map((status) => (
                    <label
                      key={status}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors',
                        subscribedStatuses.includes(status)
                          ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={subscribedStatuses.includes(status)}
                        onChange={() => toggleStatus(status)}
                        className="h-3 w-3 rounded accent-[var(--color-primary)]"
                      />
                      <span className="text-[12px] font-medium">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                {callbackWebhook.updatedAt && (
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    更新于 {formatDateTime(callbackWebhook.updatedAt)}
                  </span>
                )}
                <Button size="sm" loading={callbackSaving} onClick={handleSaveCallback} icon={<Webhook className="h-3.5 w-3.5" />}>
                  保存
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  )
}
