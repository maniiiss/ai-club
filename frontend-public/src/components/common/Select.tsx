/**
 * 自定义下拉选择组件。
 * 替代原生 <select>，提供一致的设计风格和更好的交互体验。
 */
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { computeFloatingDropdownStyle, type FloatingDropdownStyle } from '@/src/lib/floatingUi'
import { cn } from '@/src/lib/utils'

interface SelectOption {
  value: string
  label: string
  /** 可选的描述文本，显示在 label 下方。 */
  description?: string
  /** 可选的前置图标或色块。 */
  icon?: ReactNode
}

interface SelectProps {
  /** 布局方式：普通表单默认上下排列；筛选工具栏可使用 inline 横向展示标签与下拉框。 */
  layout?: 'vertical' | 'inline'
  /** 字段标签。 */
  label?: string
  /** 当前选中值。 */
  value: string
  /** 值变更回调。 */
  onChange: (value: string) => void
  /** 选项列表。 */
  options: SelectOption[]
  /** 是否在下拉内启用本地搜索。 */
  searchable?: boolean
  /** 占位文本。 */
  placeholder?: string
  /** 是否禁用。 */
  disabled?: boolean
  /** 错误提示。 */
  error?: string
  /** 帮助文本。 */
  hint?: string
  /** 额外 className。 */
  className?: string
}

export const buildSelectRootClassName = (
  layout: SelectProps['layout'] = 'vertical',
  className?: string,
): string => cn(
  'flex',
  layout === 'inline' ? 'flex-row items-center gap-2' : 'flex-col gap-1.5',
  className,
)

export const Select = ({
  layout = 'vertical',
  label,
  value,
  onChange,
  options,
  searchable = false,
  placeholder = '请选择',
  disabled = false,
  error,
  hint,
  className,
}: SelectProps) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<FloatingDropdownStyle | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const filteredOptions = searchable && query.trim()
    ? options.filter((option) => {
      const keyword = query.trim().toLowerCase()
      return option.label.toLowerCase().includes(keyword)
        || option.description?.toLowerCase().includes(keyword)
    })
    : options

  // 点击外部关闭
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      const clickedTrigger = ref.current?.contains(target)
      const clickedMenu = menuRef.current?.contains(target)
      if (!clickedTrigger && !clickedMenu) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Escape 关闭
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    const updateMenuPosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuStyle(computeFloatingDropdownStyle({
        triggerRect: rect,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }))
    }
    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const dropdown = open && menuStyle ? createPortal(
    <div
      ref={menuRef}
      className="absolute z-[70] rounded-xl border border-[var(--color-border)] bg-white py-1.5 shadow-[var(--shadow-lg)] animate-scaleIn overflow-y-auto"
      style={{
        top: menuStyle.top,
        left: menuStyle.left,
        width: menuStyle.width,
        maxHeight: menuStyle.maxHeight,
      }}
    >
      {searchable && (
        <div className="sticky top-0 z-10 bg-white px-2 pb-1.5">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
            placeholder="搜索..."
            className="h-9 w-full rounded-lg border border-[var(--color-border-strong)] bg-white px-3 text-[13px] outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20"
          />
        </div>
      )}
      {filteredOptions.map((option) => {
        const isSelected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors',
              isSelected
                ? 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
            )}
          >
            {option.icon && (
              <span className="shrink-0">{option.icon}</span>
            )}
            <div className="flex-1 min-w-0">
              <p className={cn(
                'text-[13px] truncate',
                isSelected ? 'font-medium' : 'font-normal',
              )}
              title={option.label}
              >
                {option.label}
              </p>
              {option.description && (
                <p className="text-[11px] text-[var(--color-text-tertiary)] truncate mt-0.5">
                  {option.description}
                </p>
              )}
            </div>
            {isSelected && (
              <Check className="h-4 w-4 text-[var(--color-primary)] shrink-0" strokeWidth={2} />
            )}
          </button>
        )
      })}
      {filteredOptions.length === 0 && (
        <div className="px-3 py-5 text-center text-[13px] text-[var(--color-text-tertiary)]">
          暂无匹配选项
        </div>
      )}
    </div>,
    document.body,
  ) : null

  return (
    <div className={buildSelectRootClassName(layout, className)} ref={ref}>
      {label && (
        <label className={cn(
          'text-[13px] font-medium text-[var(--color-text-secondary)]',
          layout === 'inline' && 'shrink-0 whitespace-nowrap',
        )}>
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setOpen(!open)}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3.5 text-[14px]',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20',
            disabled && 'opacity-50 cursor-not-allowed',
            error
              ? 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20'
              : open
                ? 'border-[var(--color-primary)] focus:border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
                : 'border-[var(--color-border-strong)] hover:border-[var(--color-border-strong)]',
          )}
        >
          <span className={cn(
            'flex items-center gap-2 truncate',
            selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-placeholder)]',
          )}
          title={selected?.label || placeholder}
          >
            {selected?.icon}
            {selected?.label || placeholder}
          </span>
          <ChevronDown className={cn(
            'h-4 w-4 text-[var(--color-text-tertiary)] transition-transform duration-150 shrink-0',
            open && 'rotate-180',
          )} />
        </button>
      </div>
      {dropdown}
      {error && (
        <p className="text-[12px] text-[var(--color-danger)]">{error}</p>
      )}
      {hint && !error && (
        <p className="text-[12px] text-[var(--color-text-tertiary)]">{hint}</p>
      )}
    </div>
  )
}
