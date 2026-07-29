/** 标题栏登录账户菜单：集中展示用户、积分与受控平台操作。 */
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ChevronDown, Coins, ExternalLink, LogOut, UserRound } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';

function displayName(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string {
	return account?.user.nickname?.trim() || account?.user.username || 'GitPilot 用户';
}

function initials(name: string): string {
	return name.trim().slice(0, 2).toUpperCase() || 'GP';
}

/** 将平台返回的相对头像路径规范为桌面 WebView 可访问的完整地址。 */
function resolveAvatarUrl(account: ReturnType<typeof useSessionStore.getState>['platformAccount']): string | null {
	const source = account?.user.avatarUrl?.trim();
	if (!source) return null;
	try {
		return new URL(source, account?.platformUrl).toString();
	} catch {
		return null;
	}
}

export function UserMenu() {
	const account = useSessionStore((s) => s.platformAccount);
	const logout = useSessionStore((s) => s.logout);
	const [open, setOpen] = useState(false);
	const [avatarFailed, setAvatarFailed] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const name = displayName(account);
	const avatarUrl = avatarFailed ? null : resolveAvatarUrl(account);
	const avatar = (large = false) => (
		<span className={`desktop-user-menu__avatar${large ? ' is-large' : ''}`}>
			{avatarUrl ? <img src={avatarUrl} alt={`${name}的头像`} onError={() => setAvatarFailed(true)} /> : initials(name)}
		</span>
	);

	useEffect(() => setAvatarFailed(false), [account?.platformUrl, account?.user.avatarUrl]);

	useEffect(() => {
		if (!open) return;
		const dismiss = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('pointerdown', dismiss);
		window.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('pointerdown', dismiss);
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [open]);

	const openWeb = async () => {
		if (!account?.platformUrl) return;
		setOpen(false);
		await invoke('open_platform_web', { platformUrl: account.platformUrl });
	};

	const signOut = async () => {
		setOpen(false);
		await logout();
	};

	return (
		<div ref={rootRef} className="desktop-user-menu">
			<button type="button" className="desktop-user-menu__trigger" onClick={() => setOpen((value) => !value)} title="账户菜单" aria-label="账户菜单" aria-expanded={open}>
				{account ? avatar() : <span className="desktop-user-menu__avatar"><UserRound size={14} /></span>}
				<ChevronDown size={12} />
			</button>
			{open && (
				<div className="desktop-user-menu__panel" role="menu" aria-label="账户菜单">
					<div className="desktop-user-menu__identity">
						{avatar(true)}
						<span><b>{name}</b><small>{account?.user.username ?? '正在读取账户信息…'}</small></span>
					</div>
					<div className="desktop-user-menu__credits"><Coins size={14} /><span>积分</span><b>{account?.creditBalance ?? '—'}</b></div>
					<div className="desktop-user-menu__divider" />
					<button type="button" role="menuitem" onClick={() => void openWeb()} disabled={!account?.platformUrl}><ExternalLink size={14} />前往 GitPilot Web</button>
					<button type="button" role="menuitem" onClick={() => void signOut()}><LogOut size={14} />退出登录</button>
				</div>
			)}
		</div>
	);
}
