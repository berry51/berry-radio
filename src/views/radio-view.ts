import { ItemView, setIcon, type WorkspaceLeaf } from "obsidian";
import type BerryRadioPlugin from "../main";
import { CATEGORIES, describeStation } from "../labels";
import { COUNTRIES } from "../settings";
import type { ListMode, PlayerState, Station } from "../types";
import { renderArtwork } from "../ui/artwork";
import { renderControls, type PlayerControls } from "../ui/controls";

export const RADIO_VIEW_TYPE = "berry-radio-view";

export class RadioView extends ItemView {
	private unsubscribe: (() => void) | null = null;
	private searchTimer: number | null = null;
	private token = 0;

	private query = "";
	private tag = "";
	private mode: ListMode = "browse";
	private stations: Station[] = [];
	private status: "idle" | "loading" | "error" = "idle";
	private errorMessage = "";

	private searchEl!: HTMLInputElement;
	private chipsEl!: HTMLElement;
	private listEl!: HTMLElement;
	private countEl!: HTMLElement;
	private nowEl!: HTMLElement;
	private artEl!: HTMLElement;
	private nowNameEl!: HTMLElement;
	private nowStatusEl!: HTMLElement;
	private controls!: PlayerControls;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: BerryRadioPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return RADIO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "电台";
	}

	getIcon(): string {
		return "radio-tower";
	}

	async onOpen(): Promise<void> {
		this.build();
		this.syncBottomInset();
		this.unsubscribe = this.plugin.player.subscribe((state) => this.syncNowPlaying(state));
		// 状态栏的显示/隐藏是 Obsidian 侧的开关（视图 → 状态栏），布局变化时重新对齐
		this.registerEvent(this.app.workspace.on("layout-change", () => this.syncBottomInset()));
		this.registerDomEvent(window, "resize", () => this.syncBottomInset());
		await this.fetchStations();
	}

	/**
	 * Obsidian 的 `.view-content` 自带 `padding-bottom: 32px`，那是给固定定位的
	 * 状态栏预留的位置。状态栏隐藏时这段就是死空间，播放器和视口底部之间会留一条
	 * 空白带；这里按状态栏的实际高度动态给位——显示时留出它的高度，隐藏时留 0。
	 */
	private syncBottomInset(): void {
		const bar = document.querySelector(".status-bar");
		let inset = 0;
		if (bar) {
			const style = getComputedStyle(bar);
			const rect = bar.getBoundingClientRect();
			if (style.display !== "none" && style.visibility !== "hidden" && rect.height > 0) {
				inset = Math.round(rect.height);
			}
		}
		this.contentEl.setCssProps({ "--br-status-inset": `${inset}px` });
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
	}

	async refresh(): Promise<void> {
		await this.fetchStations();
	}

	private build(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("br-view");

		const header = root.createDiv({ cls: "br-header" });
		const titleRow = header.createDiv({ cls: "br-title-row" });
		titleRow.createSpan({ cls: "br-title", text: "电台" });
		this.countEl = titleRow.createSpan({ cls: "br-count", text: "" });

		const tools = header.createDiv({ cls: "br-tools" });
		this.searchEl = tools.createEl("input", {
			cls: "br-search",
			attr: { type: "search", placeholder: "搜索电台名称" },
		});
		this.searchEl.addEventListener("input", () => this.onSearchInput());

		const country = tools.createEl("select", { cls: "br-country" });
		for (const [code, label] of COUNTRIES) {
			const option = country.createEl("option", { text: label });
			option.value = code;
			if (code === this.plugin.settings.country) option.selected = true;
		}
		country.addEventListener("change", () => {
			void this.onCountryChange(country.value);
		});

		this.chipsEl = root.createDiv({ cls: "br-chips" });
		this.listEl = root.createDiv({ cls: "br-list" });

		const now = root.createDiv({ cls: "br-now" });
		this.nowEl = now;
		// 播放器与列表之间只用一条发丝线分开，播放器本身没有背景块；
		// 内容压成一行：封面 · 台名/状态 · 播放键 · 音量
		const row = now.createDiv({ cls: "br-now__row" });
		this.artEl = row.createDiv({ cls: "br-art br-art--md" });
		renderArtwork(this.artEl, null, "md");
		const info = row.createDiv({ cls: "br-now-info" });
		this.nowNameEl = info.createDiv({ cls: "br-now-name", text: "未在播放" });
		this.nowStatusEl = info.createDiv({ cls: "br-now-status", text: "选择一家电台开始收听" });

		this.controls = renderControls(this.plugin, { size: "md", showVolume: true });
		row.appendChild(this.controls.root);

		this.renderChips();
	}

	private renderChips(): void {
		this.chipsEl.empty();
		const add = (label: string, active: boolean, onClick: () => void): void => {
			const chip = this.chipsEl.createEl("button", { cls: "br-chip", text: label });
			chip.type = "button";
			if (active) chip.classList.add("is-on");
			chip.addEventListener("click", onClick);
		};

		add("全部", this.mode === "browse" && this.tag === "", () => {
			this.mode = "browse";
			this.tag = "";
			this.renderChips();
			void this.fetchStations();
		});
		add("收藏", this.mode === "favorites", () => {
			this.mode = "favorites";
			this.renderChips();
			void this.fetchStations();
		});
		add("最近", this.mode === "recent", () => {
			this.mode = "recent";
			this.renderChips();
			void this.fetchStations();
		});

		for (const [tag, label] of CATEGORIES) {
			add(label, this.mode === "browse" && this.tag === tag, () => {
				this.mode = "browse";
				this.tag = this.tag === tag ? "" : tag;
				this.renderChips();
				void this.fetchStations();
			});
		}
	}

	private onSearchInput(): void {
		if (this.searchTimer !== null) window.clearTimeout(this.searchTimer);
		this.searchTimer = window.setTimeout(() => {
			this.searchTimer = null;
			this.query = this.searchEl.value.trim();
			this.mode = "browse";
			this.renderChips();
			void this.fetchStations();
		}, 250);
	}

	private async onCountryChange(code: string): Promise<void> {
		this.plugin.settings.country = code;
		this.plugin.directory.clear();
		await this.plugin.saveSettings();
		await this.fetchStations();
	}

	private async fetchStations(): Promise<void> {
		const token = ++this.token;

		if (this.mode === "favorites" || this.mode === "recent") {
			this.stations = this.mode === "favorites" ? this.plugin.store.favorites : this.plugin.store.recent;
			this.status = "idle";
			this.renderList();
			return;
		}

		this.status = "loading";
		this.renderList();

		try {
			const stations = await this.plugin.directory.search({
				query: this.query,
				country: this.plugin.settings.country,
				tag: this.tag,
				limit: 60,
			});
			if (token !== this.token) return;
			this.stations = stations;
			this.status = "idle";
			this.renderList();
		} catch (error) {
			if (token !== this.token) return;
			this.status = "error";
			this.errorMessage = error instanceof Error ? error.message : "加载失败";
			this.renderList();
		}
	}

	private renderList(): void {
		this.listEl.empty();
		this.countEl.setText(this.stations.length > 0 ? String(this.stations.length) : "");

		if (this.status === "loading") {
			this.listEl.createDiv({ cls: "br-hint", text: "正在载入…" });
			return;
		}
		if (this.status === "error") {
			this.listEl.createDiv({ cls: "br-hint br-hint--error", text: this.errorMessage });
			return;
		}
		if (this.stations.length === 0) {
			this.listEl.createDiv({ cls: "br-hint", text: this.emptyText() });
			return;
		}

		this.stations.forEach((station, index) => this.buildRow(station, index));
		this.refreshActiveRows(this.plugin.player.snapshot());
	}

	private emptyText(): string {
		if (this.mode === "favorites") return "还没有收藏。点电台右侧的星标即可收藏。";
		if (this.mode === "recent") return "还没有收听记录。";
		return "没有匹配的电台。";
	}

	private buildRow(station: Station, index: number): void {
		const row = this.listEl.createDiv({ cls: "br-row" });
		row.dataset.stationId = station.id;

		const art = row.createDiv({ cls: "br-art br-art--sm" });
		renderArtwork(art, station, "sm");

		const info = row.createDiv({ cls: "br-info" });
		info.createDiv({ cls: "br-name", text: station.name });
		info.createDiv({ cls: "br-meta", text: describeStation(station) });

		const star = row.createEl("button", { cls: "br-star" });
		star.type = "button";
		setIcon(star, "star");
		if (this.plugin.isFavorite(station.id)) star.classList.add("is-on");

		row.addEventListener("click", (event) => {
			const target = event.target;
			if (target instanceof HTMLElement && target.closest(".br-star")) return;
			void this.plugin.playStations(this.stations, index);
		});

		star.addEventListener("click", (event) => {
			event.stopPropagation();
			this.plugin.toggleFavorite(station);
			star.classList.toggle("is-on", this.plugin.isFavorite(station.id));
			if (this.mode === "favorites") void this.fetchStations();
		});
	}

	private refreshActiveRows(state: PlayerState): void {
		const rows = this.listEl.querySelectorAll(".br-row");
		for (const node of Array.from(rows)) {
			const row = node as HTMLElement;
			const isCurrent = state.station !== null && row.dataset.stationId === state.station.id;
			row.classList.toggle("is-current", isCurrent);

			const existing = row.querySelector(".br-eq");
			if (isCurrent && state.status === "playing") {
				if (!existing) {
					const eq = createDiv({ cls: "br-eq" });
					eq.createSpan();
					eq.createSpan();
					eq.createSpan();
					const star = row.querySelector(".br-star");
					if (star) row.insertBefore(eq, star);
					else row.appendChild(eq);
				}
			} else if (existing) {
				existing.remove();
			}
		}
	}

	private syncNowPlaying(state: PlayerState): void {
		if (!this.nowNameEl) return;

		renderArtwork(this.artEl, state.station, "md");
		this.nowNameEl.setText(state.station ? state.station.name : "未在播放");
		this.nowStatusEl.setText(state.station ? this.statusLabel(state) : "选择一家电台开始收听");
		this.controls.update(state);

		this.nowEl.classList.toggle("is-playing", state.status === "playing");
		this.nowEl.classList.toggle("is-error", state.status === "error");

		this.refreshActiveRows(state);
	}

	private statusLabel(state: PlayerState): string {
		if (state.status === "loading") return state.message || "正在连接…";
		if (state.status === "playing") return "正在播放";
		if (state.status === "paused") return "已暂停";
		if (state.status === "error") return state.message || "无法播放";
		return "就绪";
	}
}
