import { setIcon } from "obsidian";

export interface MenuOption {
	label: string;
	icon?: string;
	disabled?: boolean;
	onSelect?: () => void;
}

export interface MenuSection {
	/** 分组标题，如「最近收听」 */
	heading?: string;
	options: MenuOption[];
}

let openMenu: HTMLElement | null = null;

function closeOpenMenu(): void {
	openMenu?.remove();
	openMenu = null;
	document.removeEventListener("mousedown", onDocumentMouseDown, true);
	document.removeEventListener("keydown", onDocumentKeyDown, true);
	window.removeEventListener("resize", closeOpenMenu);
	window.removeEventListener("blur", closeOpenMenu);
}

function onDocumentMouseDown(event: MouseEvent): void {
	if (openMenu && !openMenu.contains(event.target as Node)) closeOpenMenu();
}

function onDocumentKeyDown(event: KeyboardEvent): void {
	if (event.key === "Escape") closeOpenMenu();
}

/**
 * 轻量下拉菜单。
 *
 * 不用 Obsidian 的 `Menu`：桌面端它走的是系统原生菜单（圆角、系统配色），
 * 既和插件的 all-sharp 设计语言冲突，也没法用 CSS 精修。这里自绘一个
 * 直角、发丝线、跟随主题变量的浮层，用法与系统菜单一致。
 */
export function showMenu(anchor: HTMLElement, sections: MenuSection[]): void {
	closeOpenMenu();

	// 游离浮层：先在 fragment 里建好，定位完成后再挂到 body
	const menu = createDiv();
	menu.className = "br-menu";
	menu.setAttribute("role", "menu");

	for (const section of sections) {
		if (section.heading) {
			const heading = menu.createDiv({ cls: "br-menu__heading", text: section.heading });
			heading.setAttribute("role", "presentation");
		}
		for (const option of section.options) {
			const item = menu.createDiv({ cls: "br-menu__item" });
			item.setAttribute("role", "menuitem");
			if (option.icon) {
				const icon = item.createSpan({ cls: "br-menu__icon" });
				setIcon(icon, option.icon);
			}
			item.createSpan({ cls: "br-menu__label", text: option.label });
			if (option.disabled) {
				item.addClass("is-disabled");
				item.setAttribute("aria-disabled", "true");
				continue;
			}
			item.addEventListener("click", (event) => {
				event.stopPropagation();
				closeOpenMenu();
				option.onSelect?.();
			});
		}
	}

	document.body.appendChild(menu);

	// 贴着锚点右对齐、放在上方；空间不够时翻到下方
	const rect = anchor.getBoundingClientRect();
	const menuRect = menu.getBoundingClientRect();
	const left = Math.max(8, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 8));
	let top = rect.top - menuRect.height - 6;
	if (top < 8) top = rect.bottom + 6;
	menu.setCssProps({ left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });

	openMenu = menu;
	document.addEventListener("mousedown", onDocumentMouseDown, true);
	document.addEventListener("keydown", onDocumentKeyDown, true);
	window.addEventListener("resize", closeOpenMenu);
	window.addEventListener("blur", closeOpenMenu);
}
