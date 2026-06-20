/**
 * 404 未找到页面。
 */
import { Link } from 'react-router-dom'
import { Button } from '@/src/components/common/Button'
import { ArrowLeft } from 'lucide-react'

export const NotFoundPage = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-bg-page)] px-4 text-center">
      <div className="animate-fadeIn">
        <p className="text-[72px] font-bold leading-none text-[var(--color-primary)]/15">404</p>
        <h1 className="-mt-4 text-[24px] font-bold tracking-tight text-[var(--color-text-primary)]">
          页面不存在
        </h1>
        <p className="mt-2 text-[14px] text-[var(--color-text-tertiary)]">
          你访问的页面不存在或已被移除。
        </p>
        <div className="mt-8">
          <Link to="/dashboard">
            <Button variant="primary" icon={<ArrowLeft className="h-4 w-4" />}>
              返回工作台
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
