import { requestUrl } from "obsidian";
import type { Station } from "./types";
import { isHlsUrl, isHttpUrl, rankCandidates } from "./query";

const MIRRORS = [
	"https://de1.api.radio-browser.info/json",
	"https://nl1.api.radio-browser.info/json",
	"https://fi1.api.radio-browser.info/json",
	"https://at1.api.radio-browser.info/json",
];

const CACHE_TTL = 5 * 60 * 1000;

function text(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function num(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function toStation(raw: Record<string, unknown>): Station | null {
	const name = text(raw["name"]);
	const url = text(raw["url_resolved"]) || text(raw["url"]);
	if (!name || !url) return null;

	const tagSource = text(raw["tags"]);
	const tags = tagSource
		? tagSource
				.split(",")
				.map((tag) => tag.trim())
				.filter((tag) => tag.length > 0)
				.slice(0, 8)
		: [];

	return {
		id: text(raw["stationuuid"]) || url,
		name,
		url,
		tags,
		codec: text(raw["codec"]),
		bitrate: num(raw["bitrate"]),
		country: text(raw["country"]),
		favicon: text(raw["favicon"]),
		isHls: num(raw["hls"]) === 1 || isHlsUrl(url),
		ok: num(raw["lastcheckok"]) === 1,
		clicks: num(raw["clickcount"]),
	};
}

export interface DirectoryOptions {
	allowHttp: () => boolean;
}

export interface SearchOptions {
	query?: string;
	country?: string;
	tag?: string;
	limit?: number;
}

export class RadioDirectory {
	private readonly cache = new Map<string, { at: number; stations: Station[] }>();

	constructor(private readonly options: DirectoryOptions) {}

	/** 目录搜索，返回按可播性排序的候选。 */
	async search(options: SearchOptions = {}): Promise<Station[]> {
		const query = (options.query ?? "").trim();
		const country = options.country ?? "";
		const tag = options.tag ?? "";
		const limit = options.limit ?? 60;

		const key = [country, query.toLowerCase(), tag, limit, this.options.allowHttp() ? "http" : "https"].join("|");
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.at < CACHE_TTL) return cached.stations;

		const params = new URLSearchParams({
			hidebroken: "true",
			order: "clickcount",
			reverse: "true",
			limit: String(limit),
		});
		if (country) params.set("countrycode", country);
		if (query) params.set("name", query.slice(0, 80));
		if (tag) {
			params.set("tag", tag);
			params.set("tagExact", "true");
		}

		const payload = await this.request(`/stations/search?${params.toString()}`);
		const stations = this.normalize(payload);
		this.cache.set(key, { at: Date.now(), stations });
		return stations;
	}

	/** 把代码块里的查询词解析成一组按优先级排列的候选，供播放器逐个尝试。 */
	async resolveCandidates(query: string, country: string): Promise<Station[]> {
		const stations = await this.search({ query, country, limit: 24 });
		return rankCandidates(stations);
	}

	clear(): void {
		this.cache.clear();
	}

	private normalize(payload: unknown): Station[] {
		if (!Array.isArray(payload)) return [];
		const allowHttp = this.options.allowHttp();
		const stations: Station[] = [];
		for (const entry of payload) {
			if (typeof entry !== "object" || entry === null) continue;
			const station = toStation(entry as Record<string, unknown>);
			if (!station) continue;
			if (!allowHttp && isHttpUrl(station.url)) continue;
			stations.push(station);
		}
		return rankCandidates(stations);
	}

	private async request(path: string): Promise<unknown> {
		let lastError: unknown = null;
		for (const base of MIRRORS) {
			try {
				const response = await requestUrl({ url: `${base}${path}`, method: "GET" });
				return response.json;
			} catch (error) {
				lastError = error;
			}
		}
		const detail = lastError instanceof Error ? lastError.message : "";
		throw new Error(detail ? `无法连接电台目录（${detail}）` : "无法连接电台目录");
	}
}
