import { SuggestModal, setIcon, type App } from "obsidian";
import type BerryRadioPlugin from "../main";
import { describeStation } from "../labels";
import type { Station } from "../types";
import { renderArtwork } from "./artwork";

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** 选台弹窗。官方 getSuggestions 支持返回 Promise，因此直接做服务端搜索，不预载全量目录。 */
export class StationPicker extends SuggestModal<Station> {
	private token = 0;

	constructor(
		app: App,
		private readonly plugin: BerryRadioPlugin,
		private readonly onPick: (station: Station) => void,
	) {
		super(app);
		this.limit = 24;
	}

	override onOpen(): void {
		super.onOpen();
		this.setPlaceholder("搜索电台，例如：中国之声");
	}

	override async getSuggestions(query: string): Promise<Station[]> {
		const token = ++this.token;
		const trimmed = query.trim();

		if (trimmed.length > 0) await sleep(180);
		if (token !== this.token) return [];

		try {
			const stations = await this.plugin.directory.search({
				query: trimmed,
				country: this.plugin.settings.country,
				limit: 24,
			});
			return token === this.token ? stations : [];
		} catch {
			return [];
		}
	}

	override renderSuggestion(station: Station, el: HTMLElement): void {
		el.addClass("br-suggest");

		const art = el.createDiv({ cls: "br-art br-art--sm" });
		renderArtwork(art, station, "sm");

		const info = el.createDiv({ cls: "br-suggest__info" });
		info.createDiv({ cls: "br-suggest__name", text: station.name });
		info.createDiv({ cls: "br-suggest__meta", text: describeStation(station) });

		if (this.plugin.isFavorite(station.id)) {
			const star = el.createDiv({ cls: "br-suggest__star" });
			setIcon(star, "star");
		}
	}

	override onChooseSuggestion(station: Station): void {
		this.onPick(station);
	}
}
