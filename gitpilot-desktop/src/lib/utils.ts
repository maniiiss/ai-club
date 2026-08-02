import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 统一合并 Tailwind 类名，避免组件变体和业务覆盖产生重复样式。 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
