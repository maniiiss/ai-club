/**
 * AI Club 品牌标识。
 * 统一复用公众端左上角品牌入口和浏览器 favicon 的同一套图形资产。
 */
import { cn } from '@/src/lib/utils'

interface BrandMarkProps {
  className?: string
  alt?: string
}

export const BrandMark = ({ className, alt = 'AI Club' }: BrandMarkProps) => {
  return (
    <img
      src="/brand-icon.svg"
      alt={alt}
      draggable={false}
      className={cn('block h-8 w-8 shrink-0 select-none', className)}
    />
  )
}
