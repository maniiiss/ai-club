/**
 * 个人资料设置页面。
 * 展示当前用户信息并支持编辑昵称、邮箱、手机号、GitLab 用户名。
 * 包含修改密码区域。
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useAuthStore } from '@/src/stores/auth'
import { changePasswordApi } from '@/src/api/auth'
import { getMyCreditAccount, pageMyCreditTransactions } from '@/src/api/credits'
import { Card } from '@/src/components/common/Card'
import { Button } from '@/src/components/common/Button'
import { Input } from '@/src/components/common/Input'
import { getErrorMessage, getInitials } from '@/src/lib/utils'
import { THEME_PRESETS, getCurrentTheme, applyTheme } from '@/src/lib/theme'
import { Check, Coins } from 'lucide-react'
import { cn } from '@/src/lib/utils'
import type { CreditAccount, CreditTransaction } from '@/src/types/credits'

export const ProfilePage = () => {
  const user = useAuthStore((s) => s.user)
  const updateProfile = useAuthStore((s) => s.updateProfile)
  const [currentTheme, setCurrentTheme] = useState(getCurrentTheme)
  const [creditAccount, setCreditAccount] = useState<CreditAccount | null>(null)
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([])
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)

  // 个人资料编辑。
  const [profileForm, setProfileForm] = useState({
    nickname: user?.nickname || '',
    email: user?.email || '',
    phone: user?.phone || '',
    gitlabUsername: user?.gitlabUsername || '',
  })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  // 修改密码。
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordSuccess, setPasswordSuccess] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const loadCredits = async () => {
      setCreditLoading(true)
      setCreditError(null)
      try {
        const [account, transactions] = await Promise.all([
          getMyCreditAccount(),
          pageMyCreditTransactions({ page: 1, size: 8 }),
        ])
        if (!alive) return
        setCreditAccount(account)
        setCreditTransactions(transactions.records)
      } catch (err) {
        if (alive) setCreditError(getErrorMessage(err))
      } finally {
        if (alive) setCreditLoading(false)
      }
    }
    loadCredits()
    return () => {
      alive = false
    }
  }, [user?.id])

  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)
    setProfileSuccess(false)

    try {
      await updateProfile(profileForm)
      setProfileSuccess(true)
      setTimeout(() => setProfileSuccess(false), 3000)
    } catch (err) {
      setProfileError(getErrorMessage(err))
    } finally {
      setProfileSaving(false)
    }
  }

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(false)

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('新密码至少 6 个字符')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('两次输入的密码不一致')
      return
    }

    setPasswordSaving(true)
    try {
      await changePasswordApi({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      })
      setPasswordSuccess(true)
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setTimeout(() => setPasswordSuccess(false), 3000)
    } catch (err) {
      setPasswordError(getErrorMessage(err))
    } finally {
      setPasswordSaving(false)
    }
  }

  const displayName = user?.nickname || user?.username || '用户'
  const formatAmount = (value: number) => (value > 0 ? `+${value}` : String(value))
  const transactionTypeLabel = (type: string) => ({
    REGISTER_GRANT: '注册赠送',
    ADJUST_INCREASE: '调账增加',
    ADJUST_DECREASE: '调账扣减',
    CONSUME: 'AI 消费',
    REFUND: '消费退款',
  }[type] || type)

  return (
    <div className="mx-auto max-w-2xl h-full overflow-y-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-[var(--text-2xl)] font-bold text-[var(--color-text-primary)]">个人设置</h1>
        <p className="mt-1 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          管理你的账号信息
        </p>
      </div>

      {/* 用户头像与基本信息 */}
      <Card>
        <div className="flex items-center gap-4">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--text-2xl)] font-bold text-[var(--color-primary)]">
              {getInitials(displayName)}
            </div>
          )}
          <div>
            <h2 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
              {displayName}
            </h2>
            <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
              @{user?.username}
            </p>
            {user?.roleNames && user.roleNames.length > 0 && (
              <div className="mt-1 flex gap-1">
                {user.roleNames.map((role) => (
                  <span
                    key={role}
                    className="rounded-full bg-[var(--color-info-light)] px-2 py-0.5 text-[var(--text-xs)] text-[var(--color-info)]"
                  >
                    {role}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card title="积分账户">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary)]">
            <Coins className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[12px] font-medium text-[var(--color-text-tertiary)]">当前余额</p>
                <p className="mt-1 text-[32px] font-bold leading-none text-[var(--color-text-primary)]">
                  {creditAccount?.balance ?? (creditLoading ? '-' : 0)}
                </p>
              </div>
              {creditAccount && (
                <div className="grid grid-cols-3 gap-2 text-right text-[12px]">
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">累计赠送</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{creditAccount.totalGranted}</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">累计消费</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{creditAccount.totalConsumed}</p>
                  </div>
                  <div>
                    <p className="text-[var(--color-text-tertiary)]">累计退款</p>
                    <p className="font-semibold text-[var(--color-text-primary)]">{creditAccount.totalRefunded}</p>
                  </div>
                </div>
              )}
            </div>

            {creditError && (
              <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-danger)]">
                {creditError}
              </div>
            )}

            <div className="mt-5 space-y-2">
              {creditTransactions.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--color-bg-hover)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-[var(--color-text-primary)]">{transactionTypeLabel(item.transactionType)}</p>
                    <p className="truncate text-[12px] text-[var(--color-text-tertiary)]">
                      {item.reason || item.featureCode || '积分变动'} · {item.createdAt || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-[14px] font-bold', item.amount >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                      {formatAmount(item.amount)}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">余额 {item.balanceAfter}</p>
                  </div>
                </div>
              ))}
              {!creditLoading && !creditTransactions.length && (
                <p className="rounded-lg bg-[var(--color-bg-hover)] px-3 py-3 text-center text-[13px] text-[var(--color-text-tertiary)]">
                  暂无积分流水
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 编辑个人资料 */}
      <Card title="个人资料">
        {profileSuccess && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-success-light)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-success)]">
            资料已更新
          </div>
        )}
        {profileError && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-danger)]">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
          <Input
            label="昵称"
            value={profileForm.nickname}
            onChange={(e) => setProfileForm((p) => ({ ...p, nickname: e.target.value }))}
          />
          <Input
            label="邮箱"
            type="email"
            value={profileForm.email}
            onChange={(e) => setProfileForm((p) => ({ ...p, email: e.target.value }))}
          />
          <Input
            label="手机号"
            type="tel"
            value={profileForm.phone}
            onChange={(e) => setProfileForm((p) => ({ ...p, phone: e.target.value }))}
          />
          <Input
            label="GitLab 用户名"
            value={profileForm.gitlabUsername}
            onChange={(e) => setProfileForm((p) => ({ ...p, gitlabUsername: e.target.value }))}
            hint="用于关联 GitLab 代码仓库"
          />
          <div className="pt-2">
            <Button type="submit" loading={profileSaving}>
              保存修改
            </Button>
          </div>
        </form>
      </Card>

      {/* 修改密码 */}
      <Card title="修改密码">
        {passwordSuccess && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-success-light)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-success)]">
            密码已修改
          </div>
        )}
        {passwordError && (
          <div className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-danger-light)] px-3 py-2 text-[var(--text-sm)] text-[var(--color-danger)]">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
          <Input
            label="当前密码"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
            autoComplete="current-password"
          />
          <Input
            label="新密码"
            type="password"
            placeholder="至少 6 个字符"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
            autoComplete="new-password"
          />
          <Input
            label="确认新密码"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
            autoComplete="new-password"
          />
          <div className="pt-2">
            <Button type="submit" variant="secondary" loading={passwordSaving}>
              修改密码
            </Button>
          </div>
        </form>
      </Card>

      {/* 主题色 */}
      <Card title="外观">
        <p className="text-[13px] text-[var(--color-text-secondary)] mb-4">
          选择你喜欢的主题色，界面将自动适配。
        </p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {THEME_PRESETS.map((preset) => {
            const isSelected = preset.key === currentTheme
            return (
              <button
                key={preset.key}
                onClick={() => {
                  applyTheme(preset.key)
                  setCurrentTheme(preset.key)
                }}
                className={cn(
                  'group flex flex-col items-center gap-2 rounded-xl p-3 transition-all duration-150',
                  isSelected
                    ? 'bg-[var(--color-bg-hover)] ring-2 ring-offset-2 ring-[var(--color-primary)]'
                    : 'hover:bg-[var(--color-bg-hover)]',
                )}
              >
                <div
                  className={cn(
                    'h-8 w-8 rounded-full shadow-sm transition-transform duration-150',
                    'group-hover:scale-110',
                  )}
                  style={{
                    backgroundColor: preset.swatch,
                    ...(isSelected ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${preset.swatch}` } : {}),
                  }}
                >
                  {isSelected && (
                    <div className="flex h-full w-full items-center justify-center">
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    </div>
                  )}
                </div>
                <span className={cn(
                  'text-[12px] leading-none',
                  isSelected ? 'text-[var(--color-text-primary)] font-semibold' : 'text-[var(--color-text-tertiary)]',
                )}>
                  {preset.label}
                </span>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
