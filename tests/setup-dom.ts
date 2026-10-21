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

proto["removeClass"] = function (this: HTMLElement, ...classes: string[]): void {
	this.classList.remove(...classes);
};

proto["toggleClass"] = function (this: HTMLElement, classes: string | string[], value: boolean): void {
	const list = Array.isArray(classes) ? classes : [classes];
	for (const cls of list) this.classList.toggle(cls, value);
};

proto["setText"] = function (this: HTMLElement, value: string): void {
	this.textContent = value;
};

// 官方扫描禁止 element.style.xxx = 直接赋值，要求走 setCssProps / setCssStyles。
proto["setCssProps"] = function (this: HTMLElement, props: Record<string, string>): void {
	for (const [key, value] of Object.entries(props)) {
		if (key.startsWith("--")) this.style.setProperty(key, value);
		else this.style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), value);
	}
};

proto["setCssStyles"] = function (this: HTMLElement, styles: Partial<CSSStyleDeclaration>): void {
	for (const [key, value] of Object.entries(styles)) {
		if (value === undefined || value === null) continue;
		this.style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), String(value));
	}
};

// 游离节点用全局助手（宿主上它们返回未挂载的元素）。
function detached(tag: string, options?: ElOptions | string): HTMLElement {
	const el = document.createElement(tag);
	applyOptions(el, options);
	return el;
}

const globalScope = globalThis as unknown as Record<string, unknown>;

globalScope["createEl"] = (tag: string, options?: ElOptions | string): HTMLElement => detached(tag, options);
globalScope["createDiv"] = (options?: ElOptions | string): HTMLElement => detached("div", options);
globalScope["createSpan"] = (options?: ElOptions | string): HTMLElement => detached("span", options);

// 宿主上 document.createEl 会把元素挂到 document 并抛 HierarchyRequestError。
// 这里显式抛错，避免「测试通过、真机崩溃」的漏测。
const docProto = Document.prototype as unknown as Record<string, unknown>;

const refuseOnDocument = (): never => {
	throw new Error(
		"document.createEl 在宿主上会把元素挂到 document 并抛错；游离节点请用全局 createEl/createDiv/createSpan",
	);
};

docProto["createEl"] = refuseOnDocument;
docProto["createDiv"] = refuseOnDocument;
docProto["createSpan"] = refuseOnDocument;
