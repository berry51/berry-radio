import { setIcon } from "obsidian";
import type BerryRadioPlugin from "../main";
import type { PlayerState, Station } from "../types";
import { srOnly } from "../ui/a11y";
import { showMenu, type MenuSection } from "../ui/menu";

/**
 * 状态栏迷你播放器。
 *
 * 定位：**不离开当前笔记就能控制电台**。因此
 * - 设置里开启后，这一条**常驻**显示（不再只在播放时出现，停止后也不消失）；
 * - 播放键：播放中按下即停止；没有电台时重播刚才那台，再没有就进选台；
 * - 台名 / 箭头：弹出切台菜单（最近收听 · 收藏 · 搜索电台 · 打开面板）——
 *   菜单与选台弹窗都是覆盖层，当前笔记不会被切走。
 */
export class StatusBar {
	private readonly el: HTMLElement;
	private readonly playEl: HTMLButtonElement;
	private readonly textEl: HTMLElement;
	private readonly caretEl: HTMLButtonElement;
	private unsubscribe: (() => void) | null = null;
	private enabled = true;
	private lastState: PlayerState = { station: null, status: "idle", message: "" };
	/** 停止后播放器会清掉 station，这里留一份用于「再按一次重播刚才那台」和显示台名。 */
	private lastStation: Station | null = null;

	constructor(
		private readonly plugin: BerryRadioPlugin,
		private readonly host: HTMLElement,
	) {
		this.el = host.createDiv({ cls: "br-status" });

		this.playEl = this.makeButton("play", "播放", () => this.onPlayClick());

		this.textEl = this.el.createSpan({ cls: "br-status__text", text: "选择电台" });
		this.textEl.addEventListener("click", (event) => this.openMenu(event));

		this.caretEl = this.makeButton("chevron-down", "切换电台", () => this.openMenu());

		this.sync(this.lastState);
	}

	start(): void {
		this.unsubscribe = this.plugin.player.subscribe((state) => this.sync(state));
	}

	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.applyVisibility();
	}

	destroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private makeButton(iconId: string, label: string, onClick: () => void): HTMLButtonElement {
		const button = this.el.createEl("button", { cls: "br-status__btn" });
		button.type = "button";
		const icon = button.createSpan({ cls: "br-icon" });
		setIcon(icon, iconId);
		const text = srOnly(label);
		button.appendChild(text);
		button.addEventListener("click", (event) => {
			event.stopPropagation();
			onClick();
		});
		return button;
	}

	private onPlayClick(): void {
		const state = this.plugin.player.snapshot();
		if (state.station) {
			this.plugin.togglePlayback();
			return;
		}
		// 没有任何台在播：先重播刚才那台，没有就进选台
		if (this.lastStation) {
			void this.plugin.playStation(this.lastStation);
			return;
		}
		this.plugin.openStationPicker();
	}

	/** 切台菜单：最近收听 / 收藏 / 搜索电台 / 打开面板。 */
	private openMenu(event?: MouseEvent): void {
		const store = this.plugin.store;
		const sections: MenuSection[] = [];

		const stationOptions = (list: Station[]) =>
			list.map((station) => ({
				label: station.name,
				icon: "radio-tower",
				onSelect: () => void this.plugin.playStation(station),
			}));

		if (store.recent.length > 0) {
			sections.push({ heading: "最近收听", options: stationOptions(store.recent.slice(0, 6)) });
		}
		if (store.favorites.length > 0) {
			sections.push({ heading: "收藏", options: stationOptions(store.favorites.slice(0, 6)) });
		}

		sections.push({
			options: [
				{ label: "搜索电台…", icon: "search", onSelect: () => this.plugin.openStationPicker() },
				{ label: "打开电台面板", icon: "radio-tower", onSelect: () => void this.plugin.activateView("sidebar") },
			],
		});

		showMenu(this.textEl, sections);
		event?.preventDefault();
	}

	private sync(state: PlayerState): void {
		this.lastState = state;
		if (state.station) this.lastStation = state.station;

		this.applyVisibility();

		const active = state.status === "playing" || state.status === "loading";
		const playIcon = this.playEl.querySelector<HTMLElement>(".br-icon");
		if (playIcon) setIcon(playIcon, active ? "pause" : "play");
		const playLabel = this.playEl.querySelector<HTMLElement>(".br-sr-only");
		if (playLabel) playLabel.textContent = active ? "停止播放" : "播放";
		this.el.classList.toggle("is-error", state.status === "error");

		const name = state.station?.name ?? this.lastStation?.name ?? "选择电台";
		this.textEl.setText(name);
		this.el.classList.toggle("is-idle", !state.station);
	}

	/** 隐藏时连宿主一起收掉：Obsidian 的 status-bar-item 自身有固定高度，
	 *  只藏内部节点会在状态栏里留一条空的点击区。 */
	private applyVisibility(): void {
		const visible = this.enabled;
		this.host.style.display = visible ? "" : "none";
		this.el.style.display = visible ? "" : "none";
	}
}
