/**
 * 认证页面布局。
 * 左右分屏设计：左侧品牌面板（渐变背景 + 产品特性），右侧表单面板。
 * 移动端仅显示表单面板。
 */
import { Outlet, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/src/stores/auth'
import {
  FolderKanban,
  CalendarRange,
  Code2,
  FlaskConical,
  Rocket,
  Sparkles,
} from 'lucide-react'
import { BrandMark } from '@/src/components/common/BrandMark'
import { AuthBackground } from '@/src/components/auth/AuthBackground'

const features = [
  { icon: FolderKanban, text: '项目空间协作' },
  { icon: CalendarRange, text: '迭代与工作项管理' },
  { icon: Code2, text: '代码仓库与质量治理' },
  { icon: FlaskConical, text: '测试与自动化执行' },
  { icon: Rocket, text: '发布流水线与可观测性' },
  { icon: Sparkles, text: 'Hermes AI 智能辅助' },
]

export const AuthLayout = () => {
  const token = useAuthStore((s) => s.token)

  if (token) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="auth-theme-gitpilot relative flex min-h-screen overflow-hidden bg-[#dce5ec]">
      <AuthBackground />
      <div className="auth-background-seam" />

      {/* 左侧品牌面板（桌面端可见） */}
      <div className="relative z-10 hidden lg:flex lg:w-[45%] lg:max-w-[560px] flex-col justify-between border-r border-white/10 bg-[rgba(7,23,34,0.78)] px-12 py-10 backdrop-blur-[2px]">
        {/* 装饰网格背景 */}
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        {/* 装饰光晕 */}
        <div className="absolute -top-32 -right-32 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-white/10 blur-3xl" />

        {/* Logo + 品牌名 */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 rounded-xl shadow-[0_14px_32px_rgba(15,23,42,0.24)]" />
            <span className="text-xl font-bold text-white tracking-tight">GitPilot</span>
          </div>
          <h2 className="mt-10 text-3xl font-bold text-white leading-tight">
            智能研发协作平台
          </h2>
          <p className="mt-3 text-base text-white/70 leading-relaxed max-w-sm">
            从规划到发布，AI 驱动的全流程研发协作工具。让团队专注于创造价值。
          </p>
        </div>

        {/* 功能特性列表 */}
        <div className="relative z-10 space-y-3">
          {features.map((f) => (
            <div key={f.text} className="flex items-center gap-3 text-white/75">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                <f.icon className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium">{f.text}</span>
            </div>
          ))}
        </div>

        {/* 底部 */}
        <p className="relative z-10 text-xs text-white/40">
          &copy; {new Date().getFullYear()} GitPilot
        </p>
      </div>

      {/* 右侧表单面板 */}
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center bg-[rgba(220,229,236,0.80)] px-6 py-10 backdrop-blur-[2px] lg:px-12">
        {/* 移动端品牌标识 */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <BrandMark className="h-9 w-9 rounded-lg shadow-[0_10px_24px_rgba(79,70,229,0.2)]" />
          <span className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
            GitPilot
          </span>
        </div>

        <div className="w-full max-w-[400px] animate-fadeIn">
          <div className="rounded-2xl border border-white/80 bg-[rgba(247,250,252,0.94)] px-8 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <Outlet />
          </div>
        </div>

        <p className="mt-8 text-[var(--text-xs)] text-[var(--color-text-tertiary)] lg:mt-12">
          &copy; {new Date().getFullYear()} GitPilot &middot; AI 智能研发协作平台
        </p>
      </div>
    </div>
  )
}
