interface ElOptions {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
}

function applyOptions(el: HTMLElement, options?: ElOptions | string): void {
	if (options === undefined) return;
	if (typeof options === "string") {
		el.className = options;
		return;
	}
	if (options.cls) el.className = options.cls;
	if (options.text !== undefined) el.textContent = options.text;
	if (options.attr) {
		for (const [key, value] of Object.entries(options.attr)) el.setAttribute(key, value);
	}
}

// 复刻 Obsidian 注入到 HTMLElement 上的 DOM 辅助方法，让插件代码能在 jsdom 里跑真实渲染。
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

proto["createEl"] = function (this: HTMLElement, tag: string, options?: ElOptions | string): HTMLElement {
	const el = document.createElement(tag);
	applyOptions(el, options);
	this.appendChild(el);
	return el;
};

proto["createDiv"] = function (this: HTMLElement, options?: ElOptions | string): HTMLElement {
	const createEl = this["createEl"] as (tag: string, opts?: ElOptions | string) => HTMLElement;
	return createEl.call(this, "div", options);
};

proto["createSpan"] = function (this: HTMLElement, options?: ElOptions | string): HTMLElement {
	const createEl = this["createEl"] as (tag: string, opts?: ElOptions | string) => HTMLElement;
	return createEl.call(this, "span", options);
};

proto["empty"] = function (this: HTMLElement): void {
	while (this.firstChild) this.removeChild(this.firstChild);
};

proto["addClass"] = function (this: HTMLElement, ...classes: string[]): void {
	this.classList.add(...classes);
};

proto["setText"] = function (this: HTMLElement, value: string): void {
	this.textContent = value;
};
