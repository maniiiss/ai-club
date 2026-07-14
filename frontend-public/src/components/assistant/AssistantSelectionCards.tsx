import { MousePointer2 } from 'lucide-react'
import type { AssistantSelectionCardItem, AssistantSelectionOptionItem, AssistantSelectionPayload } from '@/src/types/assistant'

interface AssistantSelectionCardsProps {
  cards: AssistantSelectionCardItem[]
  disabled: boolean
  onSelect: (selection: AssistantSelectionPayload) => void
}

const toSelection = (card: AssistantSelectionCardItem, option: AssistantSelectionOptionItem): AssistantSelectionPayload | null => {
  if (option.entityId == null) return null
  return {
    slot: option.slot || card.slot,
    entityType: option.entityType,
    entityId: option.entityId,
    resumeQuestion: card.resumeQuestion,
  }
}

export const AssistantSelectionCards = ({ cards, disabled, onSelect }: AssistantSelectionCardsProps) => {
  if (!cards.length) return null

  return (
    <section className="rounded-lg border border-[var(--color-primary-100)] bg-[var(--color-primary-lighter)] p-3">
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-[var(--color-primary-900)]">候选对象待确认</div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">选择后会继续处理，不需要重新描述问题。</div>
      </div>
      <div className="space-y-3">
        {cards.map((card) => (
          <article key={`${card.slot}-${card.title}`} className="rounded-lg border border-[var(--color-border-light)] bg-white p-3">
            <div className="text-[13px] font-semibold text-[var(--color-text-primary)]">{card.title}</div>
            {card.description && <p className="mt-1 text-[12px] text-[var(--color-text-secondary)]">{card.description}</p>}
            <div className="mt-3 grid gap-2">
              {card.options.map((option) => {
                const selection = toSelection(card, option)
                return (
                  <button
                    key={`${option.entityType}-${option.entityId}-${option.title}`}
                    type="button"
                    disabled={disabled || !selection}
                    className="flex items-start gap-2 rounded-lg border border-[var(--color-border-light)] px-3 py-2 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-lighter)] disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => selection && onSelect(selection)}
                  >
                    <MousePointer2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[var(--color-text-primary)]">{option.title}</span>
                      <span className="mt-0.5 block text-[11px] text-[var(--color-text-tertiary)]">{option.subtitle || option.entityType}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
