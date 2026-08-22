/** 标题栏新版本提示：后台静默检查发现更新后，在账户头像左侧提供直达“设置-版本与更新”的入口。 */
import { ArrowCircleUp as ArrowUpCircle } from '@phosphor-icons/react';
import { useDesktopUpdateStore } from '@/src/store/desktop-update';
import { useSettingsDialogStore } from '@/src/store/settings';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './TargetUpdateBadge.module.css';

export function TargetUpdateBadge() {
	const update = useDesktopUpdateStore((s) => s.update);
	// 业务意图：仅在有可安装更新时出现；下载/安装过程中保留入口，方便回到设置页查看进度；升级重启后 store 清空即自动隐藏。
	if (!update) return null;
	const openUpdateSettings = () => useSettingsDialogStore.getState().show('update');
	return (
		<Hint content={`发现新版本 v${update.version}，点击查看更新内容`}>
			<Button
				variant="ghost"
				size="icon-sm"
				className={styles.trigger}
				aria-label={`发现新版本 v${update.version}，打开版本与更新设置`}
				onClick={openUpdateSettings}
			>
				<ArrowUpCircle aria-hidden="true" />
				<span className={styles.dot} aria-hidden="true" />
			</Button>
		</Hint>
	);
}
