/**
 * 工作台卡片：在线智能体 Top5。
 * 业务意图：在首页快速查看当前在线智能体，并跳转 AI 对话页发起协作。
 * 数据来源：getDashboardOverview 返回的 onlineAgents 字段，零新增请求。
 * 说明：公众端无 agent:view 权限，无法进入管理端智能体中心，故页脚跳转 /chat 而非智能体管理页。
 */
import { Link } from 'react-router-dom'
import { Bot, MessageSquare } from 'lucide-react'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { EmptyState } from '@/src/components/common/EmptyState'
import type { AgentSummary } from '@/src/types/dashboard'
import { cn } from '@/src/lib/utils'

interface OnlineAgentWidgetProps {
  /** 工作台概览返回的在线智能体列表。 */
  agents: AgentSummary[]
}

export const OnlineAgentWidget = ({ agents }: OnlineAgentWidgetProps) => {
  const list = agents.slice(0, 5)

  return (
    <Card
      title="在线智能体"
      action={
        <Link to="/chat">
          <Button variant="ghost" size="sm" icon={<MessageSquare className="h-4 w-4" />}>
            AI 对话
          </Button>
        </Link>
      }
    >
      {list.length === 0 ? (
        <EmptyState title="暂无在线智能体" description="配置智能体后可在此快速发起对话。" />
      ) : (
        <div className="space-y-2">
          {list.map((agent) => {
            const online = agent.status === '在线' || agent.enabled
            return (
              <Link
                key={agent.id}
                to="/chat"
                className="group flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 transition-all hover:border-[var(--color-primary)]/20 hover:shadow-[var(--shadow-sm)]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary)]">
                  <Bot className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)] group-hover:text-[var(--color-primary)]">
                    {agent.name}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-text-tertiary)]">
                    {agent.projectName || '全局'} · {agent.type}
                  </p>
                </div>
                <span
                  className={cn(
                    'flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                    online ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500',
                  )}
                >
                  {online ? '在线' : '离线'}
                </span>
              </Link>
            )
          })}
          {agents.length > 5 && (
            <p className="pt-1 text-center text-[11px] text-[var(--color-text-tertiary)]">
              共 {agents.length} 个，展示前 5 个
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
