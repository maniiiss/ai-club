/** 写入剪贴板的统一入口；不可用时返回 false 供界面保持原状。 */
export async function copyText(text: string): Promise<boolean> {
	try {
		if (!navigator.clipboard?.writeText) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
