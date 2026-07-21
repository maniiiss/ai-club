import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { http, unwrap } from '@/src/api/http'
import { useAuthStore } from '@/src/stores/auth'

interface ApprovalResponse { userCode: string; approved: boolean }

/**
 * GitPilot CLI 设备授权确认页。
 * 业务意图：浏览器只负责展示设备信息和复用已有登录态，CLI Token 永远不进入浏览器 localStorage。
 */
export const CliDeviceAuthorizationPage = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.token)
  const restoreSession = useAuthStore((state) => state.restoreSession)
  const [message, setMessage] = useState('正在读取设备授权…')
  const [approved, setApproved] = useState(false)
  const userCode = params.get('user_code') || ''

  useEffect(() => {
    let cancelled = false
    const approve = async () => {
      if (!userCode) { setMessage('缺少设备验证码，请回到 CLI 重新执行登录。'); return }
      if (!token) {
        setMessage('请先登录 AI Club 平台，登录后返回本页面确认 CLI 设备。')
        return
      }
      await restoreSession()
      try {
        const response = await http.post<{ success: boolean; message: string; data: ApprovalResponse }>(`/api/cli/device/authorizations/${encodeURIComponent(userCode)}/approve`)
        unwrap(response)
        if (!cancelled) { setApproved(true); setMessage('设备授权成功，可以回到终端继续使用 GitPilot。') }
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : '设备授权失败')
      }
    }
    approve()
    return () => { cancelled = true }
  }, [restoreSession, token, userCode])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">GitPilot CLI</p>
        <h1 className="mt-3 text-2xl font-bold text-[var(--color-text)]">设备授权</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">验证码：<span className="font-mono font-bold">{userCode || '—'}</span></p>
        <p className="mt-4 text-sm leading-6 text-[var(--color-text-secondary)]">{message}</p>
        {!token && <button className="mt-6 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white" onClick={() => navigate('/login', { state: { redirect: `${window.location.pathname}${window.location.search}` } })}>前往登录</button>}
        {approved && <p className="mt-6 rounded-lg bg-[var(--color-success-soft)] px-4 py-3 text-sm text-[var(--color-success)]">请返回终端窗口。</p>}
      </section>
    </main>
  )
}
