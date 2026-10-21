/**
 * 视觉隐藏但对读屏可见的文本。
 *
 * 用来给纯图标控件命名。不用无障碍标签属性：Obsidian 会把它映射成悬浮提示气泡，
 * 而这个插件的交互语义要求「可见图标 + 读屏可读名」，不靠 tooltip 解释。
 */
export function srOnly(text: string): HTMLElement {
	const span = document.createElement("span");
	span.className = "br-sr-only";
	span.textContent = text;
	return span;
}
