/** 目标标题栏账户入口：沿用平台账户 action，独立收口头像与菜单视觉。 */
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Coins, ExternalLink, LogOut, Plug, RefreshCw, UserRound, Wrench } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { DEPLOYMENT } from '@/src/lib/config';
import { Button } from '@/src/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { THEME_OPTIONS, isThemeMode, useThemeStore } from '@/src/store/theme';
import { useRtkStore } from '@/src/store/rtk';
import { useMcpDialogStore } from '@/src/store/mcp';
import styles from './TargetUserMenu.module.css';

function displayName(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string { return account?.user.nickname?.trim() || account?.user.username || 'GitPilot 用户'; }
function initials(name: string): string { return name.trim().slice(0, 2).toUpperCase() || 'GP'; }
function resolveAvatarUrl(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string | null { const source = account?.user.avatarUrl?.trim(); if (!source) return null; try { return new URL(source, account?.platformUrl).toString(); } catch { return null; } }

export function TargetUserMenu() {
	const account = useSessionStore((s) => s.platformAccount);
	const logout = useSessionStore((s) => s.logout);
	const sidecarConnection = useSessionStore((s) => s.connection);
	const platformConnection = useSessionStore((s) => s.platformConnection);
	const retryPlatformConnection = useSessionStore((s) => s.retryPlatformConnection);
	const theme = useThemeStore((s) => s.theme);
	const setTheme = useThemeStore((s) => s.setTheme);
	const [avatarFailed, setAvatarFailed] = useState(false);
	const name = displayName(account);
	const avatarUrl = avatarFailed ? null : resolveAvatarUrl(account);
	const isConnected = sidecarConnection === 'ready' && platformConnection === 'connected';
	const connectionLabel = isConnected ? '已连接' : sidecarConnection !== 'ready' ? '本地 Agent 未连接' : platformConnection === 'checking' ? '平台正在连接' : '平台未连接';
	useEffect(() => setAvatarFailed(false), [account?.platformUrl, account?.user.avatarUrl]);
	const avatar = (large = false) => <span className={`${styles.avatar} ${large ? styles.large : ''}`}>{avatarUrl ? <img src={avatarUrl} alt={`${name}的头像`} onError={() => setAvatarFailed(true)} /> : initials(name)}</span>;
	const openWeb = async () => { if (DEPLOYMENT.webBaseUrl) await invoke('open_platform_web', { platformUrl: DEPLOYMENT.webBaseUrl }); };
	return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={styles.trigger} title={`账户菜单，平台${connectionLabel}`} aria-label={`账户菜单，平台${connectionLabel}`}><span className={styles.avatarWithStatus}>{account ? avatar() : <span className={styles.avatar}><UserRound size={14} /></span>}<span className={`${styles.statusDot} ${isConnected ? styles.statusReady : styles.statusOffline}`} title={`平台${connectionLabel}`} aria-label={`平台${connectionLabel}`} /></span><ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className={styles.content}>
		<div className={styles.identity}>{avatar(true)}<span><b>{name}</b><small>{account?.user.username ?? '正在读取账户信息…'}</small></span></div>
		<div className={styles.credits}><Coins size={14} /><span>积分</span><b>{account?.creditBalance ?? '—'}</b></div>
		<DropdownMenuSeparator />
		<DropdownMenuLabel>界面主题</DropdownMenuLabel>
		<DropdownMenuRadioGroup className={styles.themeChoices} value={theme} onValueChange={(value) => { if (isThemeMode(value)) setTheme(value); }}>
			{THEME_OPTIONS.map((option) => <DropdownMenuRadioItem key={option.value} value={option.value} className={styles.themeRadioItem} aria-label={`${option.label}：${option.description}`} title={`${option.label}：${option.description}`}><span className={`${styles.themeSwatch} ${option.value === 'current' ? styles.themeCurrent : option.value === 'mono-dark' ? styles.themeMonoDark : styles.themeLight}`} aria-hidden="true" /></DropdownMenuRadioItem>)}
		</DropdownMenuRadioGroup>
		<DropdownMenuSeparator />
		<DropdownMenuItem onSelect={() => useRtkStore.getState().openSettings()}><Wrench />RTK 优化设置</DropdownMenuItem>
		<DropdownMenuItem onSelect={() => void retryPlatformConnection()} disabled={platformConnection === 'checking'}><RefreshCw className={platformConnection === 'checking' ? 'animate-spin' : undefined} />重新检查连接</DropdownMenuItem><DropdownMenuItem onSelect={() => void openWeb()} disabled={!DEPLOYMENT.webBaseUrl}><ExternalLink />前往 GitPilot Web</DropdownMenuItem><DropdownMenuItem onSelect={() => void logout()}><LogOut />退出登录</DropdownMenuItem>
		<DropdownMenuItem onSelect={() => useMcpDialogStore.getState().show()}><Plug />MCP 管理</DropdownMenuItem>
	</DropdownMenuContent></DropdownMenu>;
}
