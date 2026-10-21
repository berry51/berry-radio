import { Plugin, type Editor, type WorkspaceLeaf } from "obsidian";
import { RadioDirectory } from "./directory";
import { RadioPlayer } from "./player";
import { RadioBlock } from "./views/radio-block";
import { RADIO_VIEW_TYPE, RadioView } from "./views/radio-view";
import { StatusBar } from "./views/status-bar";
import { StationPicker } from "./ui/picker";
import {
	BerryRadioSettingTab,
	DEFAULT_SETTINGS,
	mergeSettings,
	type BerryRadioSettings,
} from "./settings";
import { buildBlockSource, normalizeQuery } from "./query";
import {
	EMPTY_STORE,
	isFavorite as isFavoriteInStore,
	pushRecent,
	sanitizeStore,
	toggleFavorite as toggleFavoriteInStore,
	type StoreData,
} from "./store";
import type { Station } from "./types";

export default class BerryRadioPlugin extends Plugin {
	settings: BerryRadioSettings = { ...DEFAULT_SETTINGS };
	store: StoreData = { favorites: [], recent: [] };
	player!: RadioPlayer;
	directory!: RadioDirectory;

	private statusBar: StatusBar | null = null;
	private ribbonEl: HTMLElement | null = null;
	private saveTimer: number | null = null;
	private queue: Station[] = [];
	private queueIndex = 0;

	async onload(): Promise<void> {
		await this.loadState();

		this.player = new RadioPlayer(this.settings.volume);
		this.directory = new RadioDirectory({ allowHttp: () => this.settings.allowHttp });

		this.registerView(RADIO_VIEW_TYPE, (leaf: WorkspaceLeaf) => new RadioView(leaf, this));

		this.registerMarkdownCodeBlockProcessor("radio", (source, el, ctx) => {
			if (!this.settings.enableBlock) {
				el.createDiv({ cls: "berry-radio berry-radio--off", text: "笔记内嵌电台已在设置中关闭" });
				return;
			}
			ctx.addChild(new RadioBlock(el, this, normalizeQuery(source)));
		});

		// 点左侧功能区的电台图标 = 打开一个完整的电台页面（主区域标签页）
		this.ribbonEl = this.addRibbonIcon("radio-tower", "打开电台页面", () => {
			void this.activateView("page");
		});

		this.addCommand({
			id: "open-panel",
			name: "打开电台面板（右侧栏）",
			callback: () => void this.activateView("sidebar"),
		});

		this.addCommand({
			id: "open-page",
			name: "打开电台页面",
			callback: () => void this.activateView("page"),
		});

		this.addCommand({
			id: "insert-station",
			name: "插入电台到当前笔记",
			editorCallback: (editor: Editor) => {
				new StationPicker(this.app, this, (station) => {
					editor.replaceSelection(buildBlockSource(station.name));
				}).open();
			},
		});

		this.addCommand({
			id: "toggle-playback",
			name: "播放或停止",
			checkCallback: (checking) => {
				if (!this.player.snapshot().station) return false;
				if (!checking) this.togglePlayback();
				return true;
			},
		});

		this.addCommand({
			id: "stop-playback",
			name: "停止播放",
			checkCallback: (checking) => {
				if (!this.player.snapshot().station) return false;
				if (!checking) this.player.stop();
				return true;
			},
		});

		this.addCommand({
			id: "next-station",
			name: "下一台",
			checkCallback: (checking) => {
				if (!this.player.snapshot().station) return false;
				if (!checking) void this.next();
				return true;
			},
		});

		this.addCommand({
			id: "previous-station",
			name: "上一台",
			checkCallback: (checking) => {
				if (!this.player.snapshot().station) return false;
				if (!checking) void this.previous();
				return true;
			},
		});

		this.addCommand({
			id: "toggle-favorite",
			name: "收藏或取消收藏当前电台",
			checkCallback: (checking) => {
				const station = this.player.snapshot().station;
				if (!station) return false;
				if (!checking) this.toggleFavorite(station);
				return true;
			},
		});

		const statusHost = this.addStatusBarItem();
		this.statusBar = new StatusBar(this, statusHost);
		this.statusBar.start();

		this.addSettingTab(new BerryRadioSettingTab(this.app, this));
		this.applySurfaces();
	}

	onunload(): void {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.statusBar?.destroy();
		this.player.destroy();
	}

	/** 按设置显示或隐藏入口。 */
	applySurfaces(): void {
		if (this.ribbonEl) this.ribbonEl.style.display = this.settings.enableSidebar ? "" : "none";
		this.statusBar?.setEnabled(this.settings.enableStatusBar);
	}

	async activateView(placement: "sidebar" | "page"): Promise<void> {
		const { workspace } = this.app;

		// 侧栏和主区域各自独立，允许同时打开两份
		const isSidebar = (leaf: WorkspaceLeaf): boolean =>
			(leaf.getRoot() as unknown) === (workspace.rightSplit as unknown);

		const existing = workspace.getLeavesOfType(RADIO_VIEW_TYPE).find((leaf) =>
			placement === "sidebar" ? isSidebar(leaf) : !isSidebar(leaf),
		);
		if (existing) {
			await workspace.revealLeaf(existing);
			return;
		}

		const leaf = placement === "sidebar" ? workspace.getRightLeaf(false) : workspace.getLeaf("tab");
		if (!leaf) return;
		await leaf.setViewState({ type: RADIO_VIEW_TYPE, active: true });
		await workspace.revealLeaf(leaf);
	}

	async playStations(stations: Station[], startIndex = 0): Promise<void> {
		const station = stations[startIndex];
		if (!station) return;

		this.queue = stations;
		this.queueIndex = startIndex;
		this.store = pushRecent(this.store, station);
		void this.persist();
		await this.player.playCandidates([station]);
		this.refreshViews();
	}

	/** 播放一组候选源（同一电台的多个镜像），保留逐个回退能力。 */
	async playStationCandidates(candidates: Station[]): Promise<void> {
		const first = candidates[0];
		if (!first) return;
		this.queue = [first];
		this.queueIndex = 0;
		this.store = pushRecent(this.store, first);
		void this.persist();
		await this.player.playCandidates(candidates);
		this.refreshViews();
	}

	/** 在当前列表里切到下一台，到底后回到第一台。 */
	/**
	 * 电台是直播流，没有「暂停」这个概念：播放中再按一次就是停止并断开连接。
	 * 否则暂停后音频缓冲仍在后台跑，恢复时听到的是几分钟前的内容。
	 */
	togglePlayback(): void {
		const state = this.player.snapshot();
		if (!state.station) return;
		if (state.status === "playing" || state.status === "loading") {
			this.player.stop();
			return;
		}
		this.player.toggle();
	}

	/** 播放一整台电台（带同名多源回退），状态栏切台用。 */
	async playStation(station: Station): Promise<void> {
		let list: Station[] = [station];
		try {
			const candidates = await this.directory.resolveCandidates(station.name, this.settings.country);
			// 解析结果里可能不含这一台（电台下线/改名），此时退回它自己的地址
			const matched = candidates.filter((item) => item.name === station.name);
			if (matched.length > 0) list = matched;
		} catch {
			// 目录不可用时直接用收藏里记下的地址
		}
		await this.playStationCandidates(list);
	}

	/**
	 * 打开选台弹窗。弹窗是覆盖层，不会切换当前笔记 —— 状态栏用它来切台，
	 * 达成「不离开当前笔记就能控制电台」的目的。
	 */
	openStationPicker(): void {
		new StationPicker(this.app, this, (station) => {
			void this.playStation(station);
		}).open();
	}

	async next(): Promise<void> {
		if (this.queue.length === 0) return;
		const index = (this.queueIndex + 1) % this.queue.length;
		await this.playStations(this.queue, index);
	}

	async previous(): Promise<void> {
		if (this.queue.length === 0) return;
		const index = (this.queueIndex - 1 + this.queue.length) % this.queue.length;
		await this.playStations(this.queue, index);
	}

	toggleFavorite(station: Station): void {
		this.store = toggleFavoriteInStore(this.store, station);
		void this.persist();
		this.refreshViews();
	}

	isFavorite(stationId: string): boolean {
		return isFavoriteInStore(this.store, stationId);
	}

	setVolume(volume: number): void {
		const next = Math.max(0, Math.min(1, volume));
		this.settings.volume = next;
		this.player.setVolume(next);
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveSettings();
		}, 400);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(RADIO_VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof RadioView) void view.refresh();
		}
	}

	async saveSettings(): Promise<void> {
		await this.persist();
	}

	private async persist(): Promise<void> {
		await this.saveData({ settings: this.settings, store: this.store });
	}

	private async loadState(): Promise<void> {
		const raw = (await this.loadData()) as Record<string, unknown> | null;
		if (!raw || typeof raw !== "object") {
			this.settings = { ...DEFAULT_SETTINGS };
			this.store = { favorites: [], recent: [] };
			return;
		}

		// 0.1.x 只存了设置本身，没有 settings 包裹层
		const settingsSource = "settings" in raw ? raw["settings"] : raw;
		this.settings = mergeSettings(settingsSource);
		this.store = sanitizeStore("store" in raw ? raw["store"] : EMPTY_STORE);
	}
}
