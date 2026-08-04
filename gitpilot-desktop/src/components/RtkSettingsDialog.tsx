/**
 * RTK 设置 Dialog。
 *
 * /rtk 命令（hostAction=open_rtk_settings）的原生 GUI 适配，替代扩展的 TUI 设置模态框。
 * Dialog 只负责展示与触发 /rtk 子命令；配置持久化由扩展在 sidecar 内完成，
 * 子命令结果经 setWidget/notify 事件回传桌面。
 */
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/src/components/ui/dialog';
import { useRtkStore } from '@/src/store/rtk';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';

export function RtkSettingsDialog() {
	const open = useRtkStore((s) => s.settingsOpen);
	const close = useRtkStore((s) => s.closeSettings);
	const prompt = useSessionStore((s) => s.prompt);

	const run = (sub: string) => void prompt(`/rtk ${sub}`);

	return (
		<Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>RTK 优化设置</DialogTitle>
					<DialogDescription>
						RTK Optimizer 已由当前 GitPilot 版本内置。命令重写依赖 rtk 二进制（缺失时自动降级为原始命令），输出压缩始终可用。扩展配置保存在 ~/.gitpilot/agent 下。
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Button variant="outline" onClick={() => run('show')}>查看当前配置与运行时状态</Button>
					<Button variant="outline" onClick={() => run('stats')}>查看压缩指标</Button>
					<Button variant="outline" onClick={() => run('verify')}>检查 rtk 二进制可用性</Button>
					<Button variant="outline" onClick={() => run('path')}>查看配置文件路径</Button>
					<Button variant="outline" onClick={() => run('reset')}>重置所有设置为默认值</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
