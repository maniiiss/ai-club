/**
 * 新建流水线类型选择弹窗。
 * 统一入口，用户先选择流水线工具类型（GitPilot 或 Jenkins），再进入对应表单。
 */
import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Cpu, Server, X } from 'lucide-react'
import { cn } from '@/src/lib/utils'

interface CreatePipelineTypeDialogProps {
  open: boolean
  onClose: () => void
  onSelectAiClub: () => void
  onSelectJenkins: () => void
}

interface TypeOption {
  key: 'ai-club' | 'jenkins'
  title: string
  description: string
  icon: ReactNode
  iconBg: string
  onClick: () => void
}

export const CreatePipelineTypeDialog = ({
  open,
  onClose,
  onSelectAiClub,
  onSelectJenkins,
}: CreatePipelineTypeDialogProps) => {
  if (!open) return null

  const options: TypeOption[] = [
    {
      key: 'ai-club',
      title: 'GitPilot 流水线',
      description: '基于 Woodpecker CI 的流水线，支持配置文件、Cron 定时和 Webhook 触发',
      icon: <Cpu className="h-6 w-6" strokeWidth={1.75} />,
      iconBg: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
      onClick: onSelectAiClub,
    },
    {
      key: 'jenkins',
      title: 'Jenkins 流水线',
      description: '绑定 Jenkins Server 上的 Job，触发构建并收集构建历史',
      icon: <Server className="h-6 w-6" strokeWidth={1.75} />,
      iconBg: 'bg-amber-50 text-amber-600',
      onClick: onSelectJenkins,
    },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-fadeIn"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        {/* 头部 */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-semibold text-[var(--color-text-primary)]">选择流水线类型</h3>
            <p className="mt-0.5 text-[12px] text-[var(--color-text-tertiary)]">选择要创建的流水线工具</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 类型选项 */}
        <div className="space-y-3">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={option.onClick}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-left transition-all duration-150',
                'hover:border-[var(--color-primary)] hover:shadow-[var(--shadow-card)] cursor-pointer',
              )}
            >
              <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg', option.iconBg)}>
                {option.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{option.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-tertiary)]">{option.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
