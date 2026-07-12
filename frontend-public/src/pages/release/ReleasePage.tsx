/**
 * 发布与观测模块页面。
 * 四个子 Tab：流水线中心（GitPilot + Jenkins 统一管理）+ 可观测性 + 项目日志 + 项目分享。
 * 各面板拆分到 panels/ 目录，表单与详情抽屉拆分到 components/ 目录。
 */
import { useState } from 'react'
import { Rocket, Activity, FileText, Share2 } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import { PipelinesPanel } from './panels/PipelinesPanel'
import { ObservabilityPanel } from './panels/ObservabilityPanel'
import { LogsPanel } from './panels/LogsPanel'
import { SharePanel } from './panels/SharePanel'

type ReleaseTab = 'pipelines' | 'observability' | 'logs' | 'share'

const tabs: { key: ReleaseTab; label: string; icon: typeof Rocket }[] = [
  { key: 'pipelines', label: '流水线中心', icon: Rocket },
  { key: 'observability', label: '可观测性', icon: Activity },
  { key: 'logs', label: '项目日志', icon: FileText },
  { key: 'share', label: '项目分享', icon: Share2 },
]

export const ReleasePage = () => {
  const [activeTab, setActiveTab] = useState<ReleaseTab>('pipelines')

  return (
    <div className="h-full overflow-y-auto animate-fadeIn">
      <h2 className="mb-2 text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        发布与观测
      </h2>
      <p className="mb-6 text-[14px] text-[var(--color-text-tertiary)]">
        跟踪流水线运行状态、项目健康度和日志
      </p>

      {/* Tab 切换 */}
      <div className="mb-6 flex gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-xs)] w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150',
              activeTab === tab.key
                ? 'bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            )}
          >
            <tab.icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pipelines' && <PipelinesPanel />}
      {activeTab === 'observability' && <ObservabilityPanel />}
      {activeTab === 'logs' && <LogsPanel />}
      {activeTab === 'share' && <SharePanel />}
    </div>
  )
}
