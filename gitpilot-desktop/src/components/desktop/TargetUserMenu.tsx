/** 目标标题栏账户入口：沿用平台账户 action，独立收口头像与菜单视觉。 */
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Coins, ExternalLink, LogOut, RefreshCw, Settings2, UserRound } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { DEPLOYMENT } from '@/src/lib/config';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/src/components/ui/dropdown-menu';
import { useSettingsDialogStore } from '@/src/store/settings';
import styles from './TargetUserMenu.module.css';

function displayName(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string { return account?.user.nickname?.trim() || account?.user.username || 'GitPilot 用户'; }
function initials(name: string): string { return name.trim().slice(0, 2).toUpperCase() || 'GP'; }
function resolveAvatarUrl(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string | null { const source = account?.user.avatarUrl?.trim(); if (!source) return null; try { return new URL(source, account?.platformUrl).toString(); } catch { return null; } }

export function TargetUserMenu() {
	const account = useSessionStore((s) => s.platformAccount);
	const logout = useSessionStore((s) => s.logout);
	const sidecarConnection = useSessionStore((s) => s.connection);
	const platformConnection = useSessionStore((s) => s.platformConnection);
	const manualRefresh = useSessionStore((s) => s.manualRefresh);
	const [avatarFailed, setAvatarFailed] = useState(false);
	const name = displayName(account);
	const avatarUrl = avatarFailed ? null : resolveAvatarUrl(account);
	const isConnected = sidecarConnection === 'ready' && platformConnection === 'connected';
	const connectionLabel = isConnected ? '已连接' : sidecarConnection !== 'ready' ? '本地 Agent 未连接' : platformConnection === 'checking' ? '平台正在连接' : '平台未连接';
	useEffect(() => setAvatarFailed(false), [account?.platformUrl, account?.user.avatarUrl]);
	const avatar = (large = false) => <span className={`${styles.avatar} ${large ? styles.large : ''}`}>{avatarUrl ? <img src={avatarUrl} alt={`${name}的头像`} onError={() => setAvatarFailed(true)} /> : initials(name)}</span>;
	const openWeb = async () => { if (DEPLOYMENT.webBaseUrl) await invoke('open_platform_web', { platformUrl: DEPLOYMENT.webBaseUrl }); };
	return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className={`${styles.trigger} focus-visible:outline-none focus-visible:ring-0`} aria-label={`账户菜单，平台${connectionLabel}`}><span className={styles.avatarWithStatus}>{account ? avatar() : <span className={styles.avatar}><UserRound size={14} /></span>}<Hint content={`平台 · ${connectionLabel}`}><span className={`${styles.statusDot} ${isConnected ? styles.statusReady : styles.statusOffline}`} aria-label={`平台${connectionLabel}`} /></Hint></span><ChevronDown size={12} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className={styles.content}>
		<div className={styles.identityHeader}><div className={styles.identity}>{avatar(true)}<span><b>{name}</b><small>{account?.user.username ?? '正在读取账户信息…'}</small></span></div><Hint content="刷新：同步平台模型配置与账户状态"><Button variant="ghost" size="icon-sm" className={styles.refreshButton} onClick={() => void manualRefresh()} disabled={platformConnection === 'checking'} aria-label="刷新模型配置与账户状态"><RefreshCw className={platformConnection === 'checking' ? 'animate-spin' : undefined} /></Button></Hint></div>
		<div className={styles.credits}><Coins size={14} /><span>积分</span><b>{account?.creditBalance ?? '—'}</b></div>
		<DropdownMenuSeparator />
		<DropdownMenuItem onSelect={() => useSettingsDialogStore.getState().show('basic')}><Settings2 />设置</DropdownMenuItem>
		<DropdownMenuSeparator />
		<DropdownMenuItem onSelect={() => void openWeb()} disabled={!DEPLOYMENT.webBaseUrl}><ExternalLink />前往 GitPilot Web</DropdownMenuItem><DropdownMenuItem onSelect={() => void logout()}><LogOut />退出登录</DropdownMenuItem>
	</DropdownMenuContent></DropdownMenu>;
}
