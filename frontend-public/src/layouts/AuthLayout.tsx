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
    <div className="flex min-h-screen">
      {/* 左侧品牌面板（桌面端可见） */}
      <div className="hidden lg:flex lg:w-[45%] lg:max-w-[560px] flex-col justify-between bg-gradient-auth relative overflow-hidden px-12 py-10">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <span className="text-sm font-bold text-white">AI</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">AI Club</span>
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
          &copy; {new Date().getFullYear()} AI Club
        </p>
      </div>

      {/* 右侧表单面板 */}
      <div className="flex flex-1 flex-col items-center justify-center bg-[var(--color-bg-page)] px-6 py-10 lg:px-12">
        {/* 移动端品牌标识 */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-primary)]">
            <span className="text-xs font-bold text-white">AI</span>
          </div>
          <span className="text-lg font-bold text-[var(--color-text-primary)] tracking-tight">
            AI Club
          </span>
        </div>

        <div className="w-full max-w-[400px] animate-fadeIn">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] px-8 py-8 shadow-[var(--shadow-lg)]">
            <Outlet />
          </div>
        </div>

        <p className="mt-8 text-[var(--text-xs)] text-[var(--color-text-tertiary)] lg:mt-12">
          &copy; {new Date().getFullYear()} AI Club &middot; 智能研发协作平台
        </p>
      </div>
    </div>
  )
}
