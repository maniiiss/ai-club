/**
 * RTK 设置分区。
 *
 * /rtk 命令（hostAction=open_rtk_settings）的原生 GUI 适配，替代扩展的 TUI 设置模态框。
 * 分区只负责展示与触发 /rtk 子命令；配置持久化由扩展在 sidecar 内完成，
 * 子命令结果经 setWidget/notify 事件回传桌面。
 */
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { Activity, BarChart3, FileKey2, RotateCcw, ShieldCheck } from 'lucide-react';

/** RTK 分区操作；实际配置仍由 sidecar 扩展持久化。 */
export const RTK_ACTIONS = [
	{ command: 'show', label: '查看当前配置与运行时状态', icon: Activity },
	{ command: 'stats', label: '查看压缩指标', icon: BarChart3 },
	{ command: 'verify', label: '检查 rtk 二进制可用性', icon: ShieldCheck },
	{ command: 'path', label: '查看配置文件路径', icon: FileKey2 },
	{ command: 'reset', label: '重置所有设置为默认值', icon: RotateCcw },
] as const;

export function RtkSettingsPanel() {
	const prompt = useSessionStore((s) => s.prompt);

	const run = (sub: string) => void prompt(`/rtk ${sub}`);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto px-5 py-5"><div className="grid gap-2 sm:grid-cols-2">{RTK_ACTIONS.map(({ command, label, icon: Icon }) => <Button key={command} type="button" variant="outline" className="h-auto min-h-12 justify-start px-3 py-2.5 text-left" onClick={() => run(command)}><Icon className="text-[var(--primary)]" /><span className="min-w-0"><b className="block text-xs text-[var(--foreground)]">{label}</b></span></Button>)}</div></div>
		</div>
	);
}
