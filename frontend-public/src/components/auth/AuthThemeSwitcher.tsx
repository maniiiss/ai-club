/**
 * 未登录认证页的主题切换器。
 * 认证页不能调用账号主题接口，因此只更新统一的本地主题缓存；登录成功后由服务端账号主题覆盖本地选择。
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import { THEME_PRESETS, applyLoginTheme, getCurrentTheme } from '@/src/lib/theme'
import { cn } from '@/src/lib/utils'

export const AuthThemeSwitcher = () => {
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(getCurrentTheme)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (themeKey: string) => {
    const resolvedTheme = applyLoginTheme(themeKey)
    setCurrent(resolvedTheme)
    setOpen(false)
  }

  const currentPreset = THEME_PRESETS.find((preset) => preset.key === current)

  return (
    <div ref={ref} className="auth-theme-picker">
      <button
        type="button"
        className="auth-theme-picker-trigger"
        aria-label={`切换主题，当前为${currentPreset?.label || '深海蓝'}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Palette className="h-4 w-4" strokeWidth={1.8} />
        <span className="hidden sm:inline">{currentPreset?.label || '主题'}</span>
      </button>

      {open && (
        <div className="auth-theme-picker-menu" role="dialog" aria-label="认证页主题色">
          <div className="auth-theme-picker-heading">
            <span>主题色</span>
            <span className="auth-theme-picker-hint">登录后同步账号设置</span>
          </div>
          <div className="auth-theme-picker-options">
            {THEME_PRESETS.map((preset) => {
              const isSelected = preset.key === current
              return (
                <button
                  key={preset.key}
                  type="button"
                  className={cn('auth-theme-picker-option', isSelected && 'is-selected')}
                  aria-label={`使用${preset.label}主题`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(preset.key)}
                >
                  <span
                    className="auth-theme-picker-swatch"
                    style={{
                      background: `linear-gradient(135deg, ${preset.swatch} 0 48%, ${preset.light} 48% 100%)`,
                    }}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span>{preset.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
