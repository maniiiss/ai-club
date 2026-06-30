/**
 * 日期范围选择器。
 * 基于 react-day-picker，点击触发区域弹出左右双月日历面板，支持选择开始/结束日期范围。
 * 每个月份独立导航（前后翻页）。
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

export const DateRangePicker = ({ startDate, endDate, onChange, label }: DateRangePickerProps) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  /** 记录是否已完成第一次点击（选开始日期），第二次点击后才自动关闭。 */
  const hasStartRef = useRef(false)
  /** 左面板当前显示月份。 */
  const [leftMonth, setLeftMonth] = useState(() => {
    const d = parseDate(startDate)
    return d ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  })
  /** 右面板始终为左面板的下一个月。 */
  const rightMonth = nextMonth(leftMonth)

  const range: DateRange = { from: parseDate(startDate), to: parseDate(endDate) }

  const handleSelect = (newRange: DateRange | undefined) => {
    const from = toDateString(newRange?.from)
    const to = toDateString(newRange?.to)
    onChange(from, to)

    if (!from) {
      hasStartRef.current = false
    } else if (!to || from === to) {
      hasStartRef.current = true
    } else {
      if (hasStartRef.current) {
        setTimeout(() => setOpen(false), 200)
      }
      hasStartRef.current = false
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
    showOutsideDays: true,
    locale: zhCN,
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-[var(--color-text-secondary)]">{label}</label>
      )}
      <button
        type="button"
        onClick={() => { hasStartRef.current = !!startDate; setOpen(!open) }}
        className={cn(
          'flex items-center h-10 rounded-lg border bg-white transition-all duration-150 text-left',
          'hover:border-[var(--color-border-strong)]',
          open
            ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20'
            : 'border-[var(--color-border-strong)]',
        )}
      >
        <CalendarRange className="ml-2.5 h-3.5 w-3.5 text-[var(--color-text-tertiary)] shrink-0" strokeWidth={1.75} />
        <span className={cn(
          'ml-2 text-[13px] truncate',
          hasValue ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-placeholder)]',
        )}>
          {startDate || '开始日期'} <span className="mx-1.5 text-[var(--color-text-tertiary)]">~</span> {endDate || '结束日期'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 animate-fadeIn">
          <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-xl)] p-3 date-range-picker">
            <div className="flex gap-4">
              {/* 左面板：显示 leftMonth，隐藏内置导航，用自定义按钮控制 */}
              <div className="relative">
                <DayPicker
                  {...dayPickerProps}
                  month={leftMonth}
                  onMonthChange={setLeftMonth}
                  numberOfMonths={1}
                  hideNavigation
                />
              </div>
              {/* 右面板：显示 rightMonth，隐藏内置导航，用自定义按钮控制 */}
              <div className="relative">
                <DayPicker
                  {...dayPickerProps}
                  month={rightMonth}
                  numberOfMonths={1}
                  hideNavigation
                />
              </div>
            </div>
            {/* 自定义导航按钮覆盖在两侧 */}
            <div className="absolute inset-x-0 top-3 flex items-center justify-between px-1 pointer-events-none">
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
