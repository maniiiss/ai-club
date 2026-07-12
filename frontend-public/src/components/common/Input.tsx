/**
 * 输入框组件。
 * 简洁精致的设计，支持标签、错误提示、前置图标。
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/src/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: ReactNode
  /** 输入框尺寸，sm 用于筛选栏等紧凑场景；默认 md 保持既有样式。 */
  size?: 'sm' | 'md'
  /** 是否按外层容器宽度对带图标输入框启用窄屏降级。 */
  adaptiveIcon?: boolean
  /** 输入框外层布局类名，便于在 flex 筛选栏中控制宽度。 */
  wrapperClassName?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, size = 'md', adaptiveIcon = false, wrapperClassName, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className={cn('flex flex-col gap-1.5', adaptiveIcon && 'common-input-shell', wrapperClassName)}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[13px] font-medium text-[var(--color-text-secondary)]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)] pointer-events-none">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-lg border bg-white px-3.5 text-[14px]',
              'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-placeholder)]',
              'transition-all duration-150',
              'h-10 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]',
              size === 'sm' && 'h-9 px-3 text-[13px]',
              error
                ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20 focus:border-[var(--color-danger)]'
                : 'border-[var(--color-border-strong)] hover:border-[var(--color-border-strong)]',
              icon ? 'pl-10' : '',
              icon && size === 'sm' ? 'pl-9' : '',
              adaptiveIcon && 'common-input-control--adaptive-icon focus-visible:outline-none',
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
        )}
        {hint && !error && (
          <p className="text-[12px] text-[var(--color-text-tertiary)]">{hint}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
