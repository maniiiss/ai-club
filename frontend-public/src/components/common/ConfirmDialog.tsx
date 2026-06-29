/**
 * 公众端通用确认弹窗。
 * 业务意图：替代浏览器原生 confirm/prompt，保持删除、重命名等高频操作的视觉和交互一致。
 */
import { type ReactNode, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info, PencilLine, Trash2 } from 'lucide-react'
import { Button } from './Button'
import { cn } from '@/src/lib/utils'

type ConfirmDialogVariant = 'default' | 'danger' | 'edit'

interface ConfirmDialogInput {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  autoFocus?: boolean
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  variant?: ConfirmDialogVariant
  confirmText?: string
  cancelText?: string
  loading?: boolean
  confirmDisabled?: boolean
  input?: ConfirmDialogInput
  onCancel: () => void
  onConfirm: () => void
}

const variantConfig: Record<ConfirmDialogVariant, {
  icon: ReactNode
  iconClassName: string
  confirmVariant: 'primary' | 'danger'
}> = {
  default: {
    icon: <Info className="h-5 w-5" />,
    iconClassName: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    confirmVariant: 'primary',
  },
  danger: {
    icon: <Trash2 className="h-5 w-5" />,
    iconClassName: 'bg-[var(--color-danger-light)] text-[var(--color-danger)]',
    confirmVariant: 'danger',
  },
  edit: {
    icon: <PencilLine className="h-5 w-5" />,
    iconClassName: 'bg-[var(--color-primary-light)] text-[var(--color-primary)]',
    confirmVariant: 'primary',
  },
}

export const ConfirmDialog = ({
  open,
  title,
  description,
  variant = 'default',
  confirmText = '确认',
  cancelText = '取消',
  loading = false,
  confirmDisabled = false,
  input,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) => {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const config = variantConfig[variant]

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  useEffect(() => {
    if (open && input?.autoFocus) {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [input?.autoFocus, open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={inputId}>
      <button
        type="button"
        aria-label="关闭确认弹窗"
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-fadeIn"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-xl)] animate-scaleIn">
        <div className={cn('mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full', config.iconClassName)}>
          {config.icon}
        </div>
        <h3 id={inputId} className="text-center text-[16px] font-semibold text-[var(--color-text-primary)]">
          {title}
        </h3>
        {description && (
          <div className="mt-1.5 text-center text-[13px] leading-5 text-[var(--color-text-tertiary)]">
            {description}
          </div>
        )}
        {input && (
          <label className="mt-4 block text-left" htmlFor={`${inputId}-input`}>
            <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">{input.label}</span>
            <input
              ref={inputRef}
              id={`${inputId}-input`}
              value={input.value}
              maxLength={input.maxLength}
              placeholder={input.placeholder}
              className="mt-1.5 h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-[13px] text-[var(--color-text-primary)] outline-none transition-colors placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-primary)] focus:ring-3 focus:ring-[var(--color-primary-light)]"
              onChange={(event) => input.onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !confirmDisabled && !loading) {
                  event.preventDefault()
                  onConfirm()
                }
              }}
            />
          </label>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            type="button"
            variant={config.confirmVariant}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmText}
          </Button>
        </div>
        {variant === 'danger' && (
          <div className="mt-3 flex items-center justify-center gap-1 text-[11px] text-[var(--color-text-tertiary)]">
            <AlertTriangle className="h-3.5 w-3.5" />
            此操作提交后将立即生效
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
