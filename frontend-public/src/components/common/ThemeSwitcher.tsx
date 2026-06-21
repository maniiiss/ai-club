/**
 * 主题色切换组件。
 * 以色块网格展示预设主题，点击即切换。
 */
import { useState, useRef, useEffect } from 'react'
import { Palette, Check } from 'lucide-react'
import { THEME_PRESETS, getCurrentTheme, applyTheme } from '@/src/lib/theme'
import { cn } from '@/src/lib/utils'

export const ThemeSwitcher = () => {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(getCurrentTheme)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (key: string) => {
    applyTheme(key)
    setCurrent(key)
    setOpen(false)
  }

  const currentPreset = THEME_PRESETS.find((t) => t.key === current)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px]',
          'transition-all duration-150',
          'hover:bg-[var(--color-bg-hover)]',
          open && 'bg-[var(--color-bg-hover)]',
        )}
        title="切换主题色"
      >
        <div
          className="h-4 w-4 rounded-full ring-2 ring-white shadow-sm"
          style={{ backgroundColor: currentPreset?.swatch || '#4f46e5' }}
        />
        <span className="hidden sm:inline text-[var(--color-text-secondary)] text-[12px]">
          {currentPreset?.label || '主题'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[220px] rounded-xl border border-[var(--color-border)] bg-white p-4 shadow-[var(--shadow-lg)] animate-scaleIn">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-4 w-4 text-[var(--color-text-tertiary)]" />
            <span className="text-[13px] font-semibold text-[var(--color-text-primary)]">主题色</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {THEME_PRESETS.map((preset) => {
              const isSelected = preset.key === current
              return (
                <button
                  key={preset.key}
                  onClick={() => handleSelect(preset.key)}
                  className={cn(
                    'group flex flex-col items-center gap-1.5 rounded-lg p-2 transition-all duration-150',
                    isSelected
                      ? 'bg-[var(--color-bg-hover)]'
                      : 'hover:bg-[var(--color-bg-hover)]',
                  )}
                  title={preset.label}
                >
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full shadow-sm transition-transform duration-150',
                      'group-hover:scale-110',
                      isSelected && 'ring-2 ring-offset-2',
                    )}
                    style={{
                      backgroundColor: preset.swatch,
                      ...(isSelected ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${preset.swatch}` } : {}),
                    }}
                  >
                    {isSelected && (
                      <div className="flex h-full w-full items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                  <span className={cn(
                    'text-[10px] leading-none',
                    isSelected ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-tertiary)]',
                  )}>
                    {preset.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
