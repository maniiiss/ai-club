/**
 * 可观测性面板。
 * 展示项目健康摘要、健康趋势图和运行实例列表，支持编辑运行实例观测配置。
 */
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  Activity,
  Cpu,
  Pencil,
  Server,
} from 'lucide-react'
import {
  getObservabilityProjectHealth,
  getObservabilityProjectHealthTimeline,
  getObservabilityProjectDetail,
} from '@/src/api/release'
import { getErrorMessage, cn, formatDateTime } from '@/src/lib/utils'
import { getHealthLevelColor, getStatusColor } from '../constants'
import type {
  ObservabilityProjectHealthItem,
  ObservabilityHealthTimelinePointItem,
  ObservabilityProjectDetail,
  RuntimeInstanceItem,
} from '@/src/types/release'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { LoadingSpinner } from '@/src/components/common/LoadingSpinner'
import { ErrorState } from '@/src/components/common/ErrorState'
import { EmptyState } from '@/src/components/common/EmptyState'
import { RuntimeInstanceDrawer } from '../components/RuntimeInstanceDrawer'

export const ObservabilityPanel = () => {
  const { projectId } = useParams<{ projectId: string }>()
  const pid = Number(projectId)

  const [health, setHealth] = useState<ObservabilityProjectHealthItem | null>(null)
  const [timeline, setTimeline] = useState<ObservabilityHealthTimelinePointItem[]>([])
  const [detail, setDetail] = useState<ObservabilityProjectDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  /* 运行实例配置编辑抽屉 */
  const [editingInstance, setEditingInstance] = useState<RuntimeInstanceItem | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [healthData, timelineData, detailData] = await Promise.all([
        getObservabilityProjectHealth(pid),
        getObservabilityProjectHealthTimeline(pid).catch(() => [] as ObservabilityHealthTimelinePointItem[]),
        getObservabilityProjectDetail(pid).catch(() => null),
      ])
      setHealth(healthData)
      setTimeline(timelineData)
      setDetail(detailData)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [pid])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) return <LoadingSpinner text="加载健康状态…" />
  if (error) return <ErrorState description={error} onRetry={fetchData} />
  if (!health) {
    return (
      <EmptyState
        title="暂无可观测性数据"
        description="该项目还没有配置运行时实例。"
        icon={<Activity className="h-6 w-6" strokeWidth={1.5} />}
      />
    )
  }

  const instances = detail?.instances || []

  return (
    <div className="space-y-4">
      {/* 健康摘要 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card title="健康评分">
          <p className="text-[28px] font-bold text-[var(--color-primary)]">{health.projectHealthScore ?? '-'}</p>
        </Card>
        <Card title="健康等级">
          <span className={cn('inline-flex rounded-full px-3 py-1 text-[14px] font-semibold', getHealthLevelColor(health.projectHealthLevel))}>
            {health.projectHealthLevel || '-'}
          </span>
        </Card>
        <Card title="实例总数">
          <p className="text-[28px] font-bold text-[var(--color-text-primary)]">{health.totalInstanceCount}</p>
        </Card>
        <Card title="异常实例">
          <p className={cn('text-[28px] font-bold', health.abnormalInstanceCount > 0 ? 'text-red-600' : 'text-emerald-600')}>
            {health.abnormalInstanceCount}
          </p>
        </Card>
      </div>

      {/* 最近检查时间 */}
      {health.lastHealthCheckedAt && (
        <div className="rounded-lg bg-[var(--color-bg-hover)] px-4 py-3 text-[13px] text-[var(--color-text-secondary)]">
          最近检查时间: {formatDateTime(health.lastHealthCheckedAt)}
        </div>
      )}

      {/* 健康趋势图 */}
      {timeline.length > 0 && (
        <Card title="健康趋势">
          <HealthTimelineChart data={timeline} />
        </Card>
      )}

      {/* 运行实例列表 */}
      <Card title="运行实例" action={<span className="text-[12px] text-[var(--color-text-tertiary)]">{instances.length} 个实例</span>}>
        {instances.length === 0 ? (
          <EmptyState
            title="暂无运行实例"
            description="该项目还没有关联的运行实例。"
            icon={<Server className="h-6 w-6" strokeWidth={1.5} />}
          />
        ) : (
          <div className="space-y-3">
            {instances.map((instance) => (
              <div
                key={instance.id}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />
                      <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{instance.name}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', instance.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                        {instance.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--color-text-tertiary)]">
                      {instance.environment && <span>环境: {instance.environment}</span>}
                      {instance.serviceName && <span>服务: {instance.serviceName}</span>}
                      {instance.serverName && <span>节点: {instance.serverName}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className={cn('rounded px-1.5 py-0.5', instance.logEnabled ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500')}>
                        日志{instance.logEnabled ? '已启用' : '未启用'}
                      </span>
                      <span className={cn('rounded px-1.5 py-0.5', instance.healthEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500')}>
                        健康{instance.healthEnabled ? '已启用' : '未启用'}
                      </span>
                      {instance.lastHealthLevel && (
                        <span className={cn('rounded px-1.5 py-0.5 font-medium', getHealthLevelColor(instance.lastHealthLevel))}>
                          {instance.lastHealthLevel}
                        </span>
                      )}
                      {instance.lastHealthScore !== null && (
                        <span className="text-[var(--color-text-tertiary)]">评分: {instance.lastHealthScore}</span>
                      )}
                    </div>
                    {instance.lastStatusMessage && (
                      <p className="mt-1.5 text-[11px] text-[var(--color-text-tertiary)] line-clamp-1">{instance.lastStatusMessage}</p>
                    )}
                    {instance.lastHealthCheckedAt && (
                      <p className="mt-1 text-[10px] text-[var(--color-text-tertiary)]">
                        最近健康检查: {formatDateTime(instance.lastHealthCheckedAt)}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" icon={<Pencil className="h-3 w-3" />} onClick={() => setEditingInstance(instance)}>
                    编辑配置
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 运行实例配置编辑抽屉 */}
      <RuntimeInstanceDrawer
        open={!!editingInstance}
        onClose={() => setEditingInstance(null)}
        projectId={pid}
        instance={editingInstance}
        onSuccess={fetchData}
      />
    </div>
  )
}

/** 健康趋势折线图（纯 SVG 实现，无需外部图表库）。 */
const HealthTimelineChart = ({ data }: { data: ObservabilityHealthTimelinePointItem[] }) => {
  if (data.length === 0) return null

  const width = 600
  const height = 180
  const padding = { top: 20, right: 20, bottom: 30, left: 40 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const validPoints = data.filter((d) => d.healthScore != null)
  if (validPoints.length === 0) return <p className="text-[13px] text-[var(--color-text-tertiary)]">暂无有效数据点</p>

  const maxScore = 100
  const minScore = 0

  const xScale = (i: number) => padding.left + (i / Math.max(validPoints.length - 1, 1)) * chartWidth
  const yScale = (v: number) => padding.top + chartHeight - ((v - minScore) / (maxScore - minScore)) * chartHeight

  const pathD = validPoints
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.healthScore!)}`)
    .join(' ')

  const areaD = `${pathD} L ${xScale(validPoints.length - 1)} ${padding.top + chartHeight} L ${xScale(0)} ${padding.top + chartHeight} Z`

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] h-auto">
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={padding.left} y1={yScale(v)} x2={width - padding.right} y2={yScale(v)} stroke="var(--color-border-light)" strokeWidth={0.5} />
            <text x={padding.left - 8} y={yScale(v) + 4} textAnchor="end" className="fill-[var(--color-text-tertiary)]" fontSize={10}>{v}</text>
          </g>
        ))}
        <defs>
          <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.2} />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#healthGrad)" />
        <path d={pathD} fill="none" stroke="var(--color-primary)" strokeWidth={2} strokeLinejoin="round" />
        {validPoints.map((d, i) => (
          <circle key={i} cx={xScale(i)} cy={yScale(d.healthScore!)} r={3} fill="var(--color-primary)" />
        ))}
        {validPoints.length > 1 && (
          <>
            <text x={xScale(0)} y={height - 5} textAnchor="middle" className="fill-[var(--color-text-tertiary)]" fontSize={9}>
              {formatDateTime(validPoints[0].sampledAt)}
            </text>
            <text x={xScale(validPoints.length - 1)} y={height - 5} textAnchor="middle" className="fill-[var(--color-text-tertiary)]" fontSize={9}>
              {formatDateTime(validPoints[validPoints.length - 1].sampledAt)}
            </text>
          </>
        )}
      </svg>
    </div>
  )
}
