/** 测试用的最小 obsidian 运行时替身，只覆盖本插件实际用到的 API。 */
export class MarkdownRenderChild {
	containerEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.containerEl = containerEl;
	}
}

export function setIcon(el: HTMLElement, iconId: string): void {
	el.textContent = iconId;
}

export class Notice {
	constructor(public readonly message: string) {}
}

export class TFile {
	path = "";
}

export class Plugin {}

export class PluginSettingTab {}

export class Setting {}

export class SuggestModal {}

export class ItemView {}

// 注意：obsidian 模块并不导出 createFragment（宿主上它是全局函数）。
// 这里刻意不提供，任何 import { createFragment } from "obsidian" 都会在测试期暴露。

export async function requestUrl(): Promise<{ json: unknown }> {
	return { json: [] };
}
