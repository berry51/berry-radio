import { MarkdownRenderChild, setIcon } from "obsidian";
import type BerryRadioPlugin from "../main";
import { describeStation, primaryCategory } from "../labels";
import { StationPicker } from "../ui/picker";
import { srOnly } from "../ui/a11y";
import { renderArtwork } from "../ui/artwork";
import { renderVolume, type VolumeControl } from "../ui/volume";
import type { PlayerState, Station } from "../types";

/**
 * 笔记里的电台播放器：圆形封面 + 站名 + 上一台/播放/下一台 + 音量。
 * 生命周期交给宿主，笔记编辑或关闭标签页时 Obsidian 会调用 onunload。
 */
export class RadioBlock extends MarkdownRenderChild {
	private root!: HTMLElement;
	private artEl!: HTMLElement;
	private nameEl!: HTMLElement;
	private categoryEl!: HTMLElement;
	private metaEl!: HTMLElement;
	private metaTextEl!: HTMLElement;
	private playButton!: HTMLButtonElement;
	private playIcon!: HTMLElement;
	private playLabel!: HTMLElement;
	private favoriteButton!: HTMLButtonElement;
	private favoriteIcon!: HTMLElement;
	private favoriteLabel!: HTMLElement;
	private volume!: VolumeControl;
	private emptyEl!: HTMLElement;
	private emptyTextEl!: HTMLElement;
	private candidates: Station[] = [];
	private appliedId = "";
	private unsubscribe: (() => void) | null = null;
	private disposed = false;

	constructor(
		containerEl: HTMLElement,
		private readonly plugin: BerryRadioPlugin,
		private readonly query: string,
	) {
		super(containerEl);
	}

	onload(): void {
		this.renderShell();
		this.unsubscribe = this.plugin.player.subscribe((state) => this.sync(state));
		void this.resolve();
	}

	onunload(): void {
		this.disposed = true;
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	private renderShell(): void {
		this.containerEl.empty();

		this.root = this.containerEl.createDiv({ cls: "berry-radio" });
		this.root.setAttribute("data-state", "loading");
		this.root.setAttribute("data-layout", this.plugin.settings.blockLayout);
		// 点卡片任意位置都能播放/暂停；按钮与滑杆各自 stopPropagation
		this.root.addEventListener("click", () => void this.handleClick());

		const head = this.root.createDiv({ cls: "berry-radio__head" });
		this.artEl = head.createDiv({ cls: "br-art br-art--lg" });
		renderArtwork(this.artEl, null, "lg");

		const info = head.createDiv({ cls: "berry-radio__info" });
		this.categoryEl = info.createSpan({ cls: "berry-radio__cat" });
		this.categoryEl.style.display = "none";
		this.nameEl = info.createDiv({ cls: "berry-radio__name", text: this.query || "未指定电台" });

		this.metaEl = info.createDiv({ cls: "berry-radio__meta" });
		this.metaEl.createSpan({ cls: "berry-radio__dot" });
		this.metaTextEl = this.metaEl.createSpan({ cls: "berry-radio__meta-text", text: "正在解析…" });

		this.favoriteButton = head.createEl("button", { cls: "berry-radio__fav" });
		this.favoriteButton.type = "button";
		this.favoriteIcon = this.favoriteButton.createSpan({ cls: "br-icon" });
		setIcon(this.favoriteIcon, "star");
		this.favoriteLabel = srOnly("收藏");
		this.favoriteButton.appendChild(this.favoriteLabel);
		this.favoriteButton.addEventListener("click", (event) => {
			event.stopPropagation();
			const station = this.candidates[0];
			if (!station) return;
			this.plugin.toggleFavorite(station);
			this.paintFavorite(station);
		});

		// 电台是直播流，没有上一曲/下一曲：控制区只有播放键 + 音量，同一行居中。
		// 带上 br-controls，复用同一套控件样式（含压过宿主默认按钮的规则）
		const transport = this.root.createDiv({ cls: "berry-radio__transport br-controls" });

		this.playButton = transport.createEl("button", {
			cls: "br-controls__btn br-controls__btn--play",
		});
		this.playButton.type = "button";
		this.playIcon = this.playButton.createSpan({ cls: "br-icon" });
		setIcon(this.playIcon, "play");
		this.playLabel = srOnly("播放");
		this.playButton.appendChild(this.playLabel);
		this.playButton.addEventListener("click", (event) => {
			event.stopPropagation();
			void this.handleClick();
		});

		this.volume = renderVolume(this.plugin, "berry-radio__volume");
		transport.appendChild(this.volume.root);

		this.emptyEl = this.root.createDiv({ cls: "berry-radio__empty" });
		const emptyArt = this.emptyEl.createDiv({ cls: "br-art br-art--lg" });
		renderArtwork(emptyArt, null, "lg");
		this.emptyTextEl = this.emptyEl.createDiv({ cls: "berry-radio__empty-text" });
		const action = this.emptyEl.createEl("button", { cls: "berry-radio__action", text: "选择电台" });
		action.type = "button";
		action.addEventListener("click", (event) => {
			event.stopPropagation();
			this.openPicker();
		});
	}

	private async resolve(): Promise<void> {
		const query = this.query || this.plugin.settings.defaultStation;
		if (!query) {
			this.showPickerState("这个代码块还没有指定电台");
			return;
		}

		this.nameEl.setText(query);
		try {
			const candidates = await this.plugin.directory.resolveCandidates(query, this.plugin.settings.country);
			if (this.disposed) return;
			const best = candidates[0];
			if (!best) {
				this.showPickerState("没有找到这个电台");
				return;
			}
			this.candidates = candidates;
			this.applyStation(best);
			this.root.setAttribute("data-state", "ready");
			this.sync(this.plugin.player.snapshot());
		} catch (error) {
			if (this.disposed) return;
			this.fail(error instanceof Error ? error.message : "加载失败");
		}
	}

	private applyStation(station: Station): void {
		if (this.appliedId !== station.id) {
			this.appliedId = station.id;
			renderArtwork(this.artEl, station, "lg");
		}
		this.nameEl.setText(station.name);
		const category = primaryCategory(station.tags);
		if (category) {
			this.categoryEl.setText(category);
			this.categoryEl.style.display = "";
		} else {
			this.categoryEl.style.display = "none";
		}
		this.metaTextEl.setText(describeStation(station));
		this.paintFavorite(station);
	}

	private paintFavorite(station: Station): void {
		const active = this.plugin.isFavorite(station.id);
		this.favoriteButton.classList.toggle("is-on", active);
		this.favoriteLabel.setText(active ? "取消收藏" : "收藏");
	}

	private showPickerState(message: string): void {
		this.root.setAttribute("data-state", "empty");
		this.emptyTextEl.setText(message);
		this.candidates = [];
	}

	private openPicker(): void {
		new StationPicker(this.plugin.app, this.plugin, (station) => {
			this.candidates = [station];
			this.applyStation(station);
			this.root.setAttribute("data-state", "ready");
			void this.plugin.playStationCandidates([station]);
		}).open();
	}

	private async handleClick(): Promise<void> {
		// 空卡片不从这里弹选台框：同一次点击会穿透到弹窗第一条候选，误播别的台
		if (this.candidates.length === 0) return;
		const state = this.plugin.player.snapshot();
		if (state.station && this.isCurrent(state.station)) {
			// 直播流：播放中按下即停止（断开），不是暂停
			if (state.status === "playing" || state.status === "loading") {
				this.plugin.player.stop();
				return;
			}
			this.plugin.player.toggle();
			return;
		}
		await this.plugin.playStationCandidates(this.candidates);
	}

	private isCurrent(station: Station): boolean {
		return this.candidates.some((item) => item.id === station.id);
	}

	private sync(state: PlayerState): void {
		if (!this.root || this.candidates.length === 0) return;

		const current = state.station !== null && this.isCurrent(state.station);
		if (!current) {
			this.root.setAttribute("data-state", "ready");
			setIcon(this.playIcon, "play");
			this.playLabel.setText("播放");
			this.playButton.classList.remove("is-loading");
			const best = this.candidates[0];
			if (best) this.applyStation(best);
			return;
		}

		if (state.status === "loading") {
			this.root.setAttribute("data-state", "loading");
			setIcon(this.playIcon, "pause");
			this.playLabel.setText("停止播放");
			this.playButton.classList.add("is-loading");
			this.metaTextEl.setText(state.message || "正在连接…");
			return;
		}

		this.playButton.classList.remove("is-loading");

		if (state.status === "playing") {
			this.root.setAttribute("data-state", "playing");
			// 播放中显示「暂停」图标，但按下是真的断开流（直播流没有续播）
			setIcon(this.playIcon, "pause");
			this.playLabel.setText("停止播放");
			if (state.station) this.applyStation(state.station);
			return;
		}

		if (state.status === "error") {
			this.root.setAttribute("data-state", "error");
			setIcon(this.playIcon, "play");
			this.playLabel.setText("播放");
			this.metaTextEl.setText(state.message || "该电台暂时无法播放");
			return;
		}

		this.root.setAttribute("data-state", "ready");
		setIcon(this.playIcon, "play");
		this.playLabel.setText("播放");
		this.volume.update();
	}

	private fail(message: string): void {
		this.root.setAttribute("data-state", "error");
		setIcon(this.playIcon, "play");
		this.playLabel.setText("播放");
		this.nameEl.setText(this.query || "未指定电台");
		this.categoryEl.style.display = "none";
		this.metaTextEl.setText(message);
	}
}
