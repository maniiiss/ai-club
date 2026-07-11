/**
 * 项目分享面板。
 * 生成/刷新/禁用项目只读分享链接，支持永久或 30 天过期。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { Share2, Copy, Check } from 'lucide-react'
import { getProjectShare, createOrRefreshProjectShare, disableProjectShare } from '@/src/api/release'
import type { ProjectShareItem } from '@/src/api/release'
import { getErrorMessage, formatDate } from '@/src/lib/utils'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'

export const SharePanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [share, setShare] = useState<ProjectShareItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [permanent, setPermanent] = useState(true)

  const fetchShare = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setShare(await getProjectShare(pid))
    } catch {
      setShare(null)
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => { fetchShare() }, [fetchShare])

  const handleCreate = async () => {
    setActionLoading(true)
    setError(null)
    try {
      const result = await createOrRefreshProjectShare(pid, {
        permanent,
        expiresInDays: permanent ? null : 30,
      })
      setShare(result)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleDisable = async () => {
    setActionLoading(true)
    setError(null)
    try {
      await disableProjectShare(pid)
      setShare(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!share?.shareUrl) return
    try {
      await navigator.clipboard.writeText(share.shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* 忽略剪贴板错误 */ }
  }

  if (loading) return <LoadingSpinner text="加载分享状态…" />

  return (
    <div className="animate-fadeIn space-y-4">
      <Card title="项目公开分享">
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
          生成公开链接，允许未登录用户查看项目的自动合并日志和流水线运行状态。
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
            {error}
          </div>
        )}

        {share?.enabled && share.shareUrl ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-800 text-[13px] font-medium mb-2">
                <Check className="h-4 w-4" />
                分享已启用
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={share.shareUrl}
                  className="flex-1 h-9 rounded-lg border border-emerald-300 bg-white px-3 text-[13px] text-[var(--color-text-primary)] font-mono"
                />
                <Button variant="secondary" size="sm" onClick={handleCopy} icon={copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}>
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              {share.expiresAt && (
                <p className="mt-2 text-[12px] text-emerald-700">有效期至：{formatDate(share.expiresAt)}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleCreate} loading={actionLoading}>刷新链接</Button>
              <Button variant="danger" onClick={handleDisable} loading={actionLoading}>禁用分享</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={permanent}
                onChange={(e) => setPermanent(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--color-border-strong)] accent-[var(--color-primary)]"
              />
              <span className="text-[13px] text-[var(--color-text-primary)]">永久有效</span>
              {!permanent && <span className="text-[12px] text-[var(--color-text-tertiary)]">（30 天后过期）</span>}
            </label>
            <Button onClick={handleCreate} loading={actionLoading} icon={<Share2 className="h-4 w-4" />}>
              生成分享链接
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
