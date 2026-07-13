import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

describe('GitPilot authentication theme', () => {
  it('offers a local theme picker before authentication and keeps the auth surface tokenized', () => {
    const layout = readFileSync(new URL('../src/layouts/AuthLayout.tsx', import.meta.url), 'utf8')
    const picker = readFileSync(new URL('../src/components/auth/AuthThemeSwitcher.tsx', import.meta.url), 'utf8')
    const theme = readFileSync(new URL('../src/lib/theme.ts', import.meta.url), 'utf8')
    const authStore = readFileSync(new URL('../src/stores/auth.ts', import.meta.url), 'utf8')
    const input = readFileSync(new URL('../src/components/common/Input.tsx', import.meta.url), 'utf8')
    const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

    assert.match(layout, /<AuthThemeSwitcher \/>/)
    assert.match(picker, /THEME_PRESETS/)
    assert.match(picker, /applyLoginTheme\(themeKey\)/)
    assert.match(picker, /handleSelect\(preset\.key\)/)
    assert.match(input, /bg-\[var\(--color-bg-elevated\)\]/)
    assert.match(styles, /auth-theme-picker/)
    assert.match(styles, /var\(--color-bg-card\)/)
    assert.match(theme, /LOGIN_THEME_STORAGE_KEY/)
    assert.match(theme, /getStoredLoginTheme/)
    assert.match(theme, /getLoginThemePreference/)
    assert.match(authStore, /getLoginThemePreference\(\)/)
    assert.match(authStore, /updateThemeApi\(\{ themeId: loginTheme \}\)/)
    assert.match(authStore, /applyLoginTheme\(user\.themeId\)/)
    assert.match(authStore, /applyLoginTheme\(getStoredLoginTheme\(\)\)/)
  })
})
