/**
 * 按钮组件。
 * 支持 primary / secondary / ghost / danger 四种变体，
 * 以及 sm / md / lg 三种尺寸。
 * 设计参考 Linear/Vercel 风格：紧凑、清晰、交互反馈灵敏。
 */
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { cn } from '@/src/lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
  children: ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--color-primary)] text-white',
    'hover:bg-[var(--color-primary-hover)]',
    'active:bg-[var(--color-primary-700)]',
    'shadow-[0_1px_2px_rgba(79,70,229,0.25)]',
    'hover:shadow-[0_2px_4px_rgba(79,70,229,0.3)]',
  ].join(' '),
  secondary: [
    'bg-white text-[var(--color-text-primary)]',
    'border border-[var(--color-border-strong)]',
    'hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)]',
    'active:bg-gray-50',
    'shadow-[var(--shadow-xs)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-[var(--color-text-secondary)]',
    'hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]',
    'active:bg-gray-100',
  ].join(' '),
  danger: [
    'bg-[var(--color-danger)] text-white',
    'hover:bg-red-700 active:bg-red-800',
    'shadow-[0_1px_2px_rgba(220,38,38,0.25)]',
  ].join(' '),
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px] gap-1.5',
  md: 'h-9 px-4 text-[13.5px] gap-2',
  lg: 'h-10 px-5 text-[14px] gap-2',
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) => {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-all duration-150',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none',
        'select-none whitespace-nowrap',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  )
}
