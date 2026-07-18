/**
 * 日期范围选择器。
 * 基于 react-day-picker，点击触发区域弹出左右双月日历面板，支持选择开始/结束日期范围。
 * 两个月份由同一个范围选择实例渲染，避免跨月日期被多个实例重复处理。
 */
import { useEffect, useRef, useState } from 'react'
import { DayPicker, type DateRange } from 'react-day-picker'
import 'react-day-picker/style.css'
import { zhCN } from 'date-fns/locale'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/src/lib/utils'

interface DateRangePickerProps {
  /** 开始日期，YYYY-MM-DD 格式。 */
  startDate: string
  /** 结束日期，YYYY-MM-DD 格式。 */
  endDate: string
  /** 日期变更回调，返回 YYYY-MM-DD 格式字符串。 */
  onChange: (start: string, end: string) => void
  /** 标签文字。 */
  label?: string
  /** 紧凑模式用于表格等密集布局，保留日历交互但缩小触发器。 */
  compact?: boolean
  /** 触发器的无障碍名称和悬浮提示。 */
  ariaLabel?: string
}

/** 将 YYYY-MM-DD 字符串转为 Date 对象（按本地时区解析，避免时区偏移）。 */
const parseDate = (s: string): Date | undefined => {
  if (!s) return undefined
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** 将 Date 对象转为 YYYY-MM-DD 字符串（本地时区）。 */
const toDateString = (d: Date | undefined): string => {
  if (!d || isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 获取指定月份的下一个月。 */
const nextMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 1)

/** 获取指定月份的上一个月。 */
const prevMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() - 1, 1)

export const DateRangePicker = ({ startDate, endDate, onChange, label, compact = false, ariaLabel }: DateRangePickerProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  /** 打开后已点击日历的次数，用于判断是否完成一轮开始+结束选择后再自动关闭。 */
  const clickCountRef = useRef(0)
  /** 双月日历当前显示的第一个月份。 */
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = parseDate(startDate)
    return d ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  })

  const range: DateRange = { from: parseDate(startDate), to: parseDate(endDate) }

  const handleSelect = (newRange: DateRange | undefined) => {
    const from = toDateString(newRange?.from)
    const to = toDateString(newRange?.to)
    onChange(from, to)

    clickCountRef.current += 1

    /* 只在第二次点击且产生了完整范围时才自动关闭，
       保证重新编辑已有范围时第一次点击不会直接关掉面板。 */
    if (clickCountRef.current >= 2 && from && to) {
      setTimeout(() => setOpen(false), 60)
    }
  }

  // 打开时同步左面板月份到已选开始日期
  useEffect(() => {
    if (!open) return
    const d = parseDate(startDate)
    if (d) setLeftMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const hasValue = startDate || endDate

  const dayPickerProps = {
    mode: 'range' as const,
    selected: range,
    onSelect: handleSelect,
    /** 编辑已有完整范围时，第一次点击先重新选择开始日，避免提前形成完整范围并触发保存。 */
    resetOnSelect: true,
    showOutsideDays: true,
    locale: zhCN,
  }

  return (
    <div ref={containerRef} className="relative flex w-full flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">{label}</label>
      )}
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => { clickCountRef.current = 0; setOpen(!open) }}
        className={cn(
          'flex w-full items-center rounded-lg border bg-white text-left transition-all duration-150',
          compact ? 'h-8 rounded-md' : 'h-10',
          'hover:border-[var(--color-border-strong)]',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        <CalendarRange className={cn('shrink-0 text-[var(--color-text-tertiary)]', compact ? 'ml-2 h-3 w-3' : 'ml-2.5 h-3.5 w-3.5')} strokeWidth={1.75} />
        <span className={cn(
          'flex min-w-0 flex-1 items-center gap-0', compact ? 'ml-1.5 mr-1.5 text-[11px]' : 'ml-2 mr-2.5 text-[13px]',
          hasValue ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-placeholder)]',
        )}>
          <span className="truncate">{startDate || '开始日期'}</span>
          <span className="mx-2 text-[var(--color-text-tertiary)] shrink-0">~</span>
          <span className="truncate">{endDate || '结束日期'}</span>
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 animate-fadeIn">
          <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] p-4 date-range-picker">
            <div className="relative">
              {/* 使用一个范围选择实例渲染连续两个月，避免跨月点击产生两个受控状态更新。 */}
              <DayPicker
                {...dayPickerProps}
                month={leftMonth}
                onMonthChange={setLeftMonth}
                numberOfMonths={2}
                hideNavigation
              />
            </div>
            {/* 自定义导航按钮覆盖在两侧 */}
            <div className="absolute inset-x-0 top-4 flex items-center justify-between px-2 pointer-events-none">
              <button
                type="button"
                onClick={() => setLeftMonth(prevMonth(leftMonth))}
                className="pointer-events-auto rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setLeftMonth(nextMonth(leftMonth))}
                className="pointer-events-auto rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            {(startDate || endDate) && (
              <div className="flex items-center justify-between border-t border-[var(--color-border-light)] mt-2 pt-2 px-1">
                <span className="text-[12px] text-[var(--color-text-tertiary)]">
                  {startDate || '开始'} ~ {endDate || '结束'}
                </span>
                <button
                  type="button"
                  onClick={() => { onChange('', ''); setOpen(false) }}
                  className="text-[12px] text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] transition-colors"
                >
                  清除
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
