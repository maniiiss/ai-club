/**
 * 注册页面。
 */
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/src/stores/auth'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { getErrorMessage } from '@/src/lib/utils'

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export const RegisterPage = () => {
  const navigate = useNavigate()
  const register = useAuthStore((s) => s.register)
  const loading = useAuthStore((s) => s.loading)

  const [form, setForm] = useState({
    username: '',
    nickname: '',
    email: '',
    phone: '',
    gitlabUsername: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!form.username.trim()) errs.username = '请输入用户名'
    if (!form.nickname.trim()) errs.nickname = '请输入昵称'
    if (!form.email.trim()) {
      errs.email = '请输入邮箱'
    } else if (!isValidEmail(form.email)) {
      errs.email = '邮箱格式不正确'
    }
    if (!form.password) {
      errs.password = '请输入密码'
    } else if (form.password.length < 6) {
      errs.password = '密码至少 6 个字符'
    }
    if (form.password !== form.confirmPassword) {
      errs.confirmPassword = '两次输入的密码不一致'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    if (!validate()) return

    try {
      await register({
        username: form.username.trim(),
        nickname: form.nickname.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        gitlabUsername: form.gitlabUsername.trim(),
        password: form.password,
      })
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      setSubmitError(getErrorMessage(err))
    }
  }

  if (success) {
    return (
      <div className="py-4 text-center">
        <div className="mb-3 flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h2 className="text-[20px] font-bold text-[var(--color-text-primary)]">注册成功</h2>
        <p className="mt-2 text-[14px] text-[var(--color-text-tertiary)]">
          正在跳转到登录页面…
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-center text-[22px] font-bold tracking-tight text-[var(--color-text-primary)]">
        创建账号
      </h2>
      <p className="mt-1.5 text-center text-[14px] text-[var(--color-text-tertiary)]">
        加入 AI Club 智能研发协作平台
      </p>

      {submitError && (
        <div className="mt-5 rounded-lg bg-[var(--color-danger-light)] border border-red-100 px-3.5 py-2.5 text-[13px] text-[var(--color-danger)]">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3.5">
        <Input
          label="用户名 *"
          type="text"
          placeholder="登录使用的用户名"
          value={form.username}
          onChange={(e) => updateField('username', e.target.value)}
          error={errors.username}
          autoComplete="username"
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="昵称 *"
            type="text"
            placeholder="展示名称"
            value={form.nickname}
            onChange={(e) => updateField('nickname', e.target.value)}
            error={errors.nickname}
          />
          <Input
            label="邮箱 *"
            type="email"
            placeholder="your@email.com"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            error={errors.email}
            autoComplete="email"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="手机号"
            type="tel"
            placeholder="可选"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
          />
          <Input
            label="GitLab 用户名"
            type="text"
            placeholder="可选"
            value={form.gitlabUsername}
            onChange={(e) => updateField('gitlabUsername', e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="密码 *"
            type="password"
            placeholder="至少 6 个字符"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />
          <Input
            label="确认密码 *"
            type="password"
            placeholder="再次输入密码"
            value={form.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" loading={loading} className="mt-2 w-full h-10">
          注册
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[var(--color-text-tertiary)]">
        已有账号？{' '}
        <Link to="/login" className="font-semibold text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]">
          登录
        </Link>
      </p>
    </div>
  )
}
