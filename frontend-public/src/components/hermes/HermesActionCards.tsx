import { CheckCircle2, PlayCircle } from 'lucide-react'
import { Button } from '@/src/components/common/Button'
import { computeHermesActionKey } from '@/src/lib/hermesUtils'
import type { HermesActionItem } from '@/src/types/hermes'

interface HermesActionCardsProps {
  actions: HermesActionItem[]
  executedActionKeys: Set<string>
  executingActionKey: string
  disabled: boolean
  onConfirm: (action: HermesActionItem, index: number, actionKey: string) => void
}

export const HermesActionCards = ({
  actions,
  executedActionKeys,
  executingActionKey,
  disabled,
  onConfirm,
}: HermesActionCardsProps) => {
  if (!actions.length) return null

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-amber-900">待确认动作</div>
        <div className="text-[11px] text-amber-700">写操作默认只生成待确认动作，确认后才会真正创建或执行。</div>
      </div>
      <div className="space-y-2">
        {actions.map((action, index) => {
          const key = computeHermesActionKey(action, index)
          const executed = executedActionKeys.has(key)
          const executing = executingActionKey === key
          return (
            <article key={key} className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{action.title || action.type}</div>
                  {action.description && (
                    <p className="mt-1 text-[12px] leading-5 text-[var(--color-text-secondary)]">{action.description}</p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={executed ? 'secondary' : 'primary'}
                  disabled={disabled || executed}
                  loading={executing}
                  icon={executed ? <CheckCircle2 className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                  onClick={() => onConfirm(action, index, key)}
                >
                  {executed ? '已执行' : '确认执行'}
                </Button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
