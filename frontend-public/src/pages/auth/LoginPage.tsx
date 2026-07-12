/**
 * 登录页面。
 */
import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/src/stores/auth'
import { featureFlags } from '@/src/app/featureFlags'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { getErrorMessage } from '@/src/lib/utils'

export const LoginPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const redirect = (location.state as { redirect?: string } | null)?.redirect || '/dashboard'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }

    try {
      await login(username.trim(), password)
      navigate(redirect, { replace: true })
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <h2 className="text-center text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        欢迎回来
      </h2>
      <p className="mt-1.5 text-center text-[14px] text-[var(--color-text-tertiary)]">
        登录你的 GitPilot 账号
      </p>

      {error && (
        <div className="mt-5 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <Input
          label="用户名"
          type="text"
          placeholder="请输入用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />
        <Input
          label="密码"
          type="password"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Button type="submit" loading={loading} className="mt-1 w-full h-10">
          登录
        </Button>
      </form>

      {featureFlags.registrationEnabled && (
        <p className="mt-6 text-center text-[13px] text-[var(--color-text-tertiary)]">
          还没有账号？{' '}
          <Link to="/register" className="font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
            注册账号
          </Link>
        </p>
      )}
    </div>
  )
}
