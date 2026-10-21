import type { Station } from "./types";

/** 代码块正文 → 查询词。多行折叠为空格，去掉包裹的引号与反引号。 */
export function normalizeQuery(raw: string): string {
	return raw
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.join(" ")
		.replace(/^["'`]+|["'`]+$/g, "")
		.trim();
}

export function isHlsUrl(url: string): boolean {
	return /\.m3u8(?:$|[?#])/i.test(url);
}

export function isHttpUrl(url: string): boolean {
	return /^http:\/\//i.test(url);
}

const DIRECT_CODECS = new Set(["MP3", "AAC", "AAC+", "OGG", "OPUS"]);

/** 直连音频流（MP3/AAC 等）在 Obsidian 里比 HLS 稳定得多，排序时加权。 */
export function isDirectAudio(codec: string): boolean {
	return DIRECT_CODECS.has((codec || "").toUpperCase());
}

export function dedupeByUrl(stations: Station[]): Station[] {
	const seen = new Set<string>();
	const result: Station[] = [];
	for (const station of stations) {
		if (seen.has(station.url)) continue;
		seen.add(station.url);
		result.push(station);
	}
	return result;
}

function reliabilityScore(station: Station): number {
	let score = 0;
	if (station.ok) score += 1000;
	if (isDirectAudio(station.codec)) score += 300;
	if (!isHttpUrl(station.url)) score += 100;
	score += Math.min(station.clicks, 300);
	return score;
}

/**
 * 候选排序只按「能不能播」和热度，不按名称相似度。
 * 搜索接口本身已经按名称过滤，再拿同名优先去排序会把可播的源挤掉。
 */
export function rankCandidates(stations: Station[]): Station[] {
	return dedupeByUrl(stations)
		.map((station, index) => ({ station, index, score: reliabilityScore(station) }))
		.sort((a, b) => (b.score - a.score) || (a.index - b.index))
		.map((entry) => entry.station);
}

/** 生成代码块正文：站名放进 fenced code block，供命令插入使用。 */
export function buildBlockSource(stationName: string): string {
	const safe = stationName.replace(/```/g, "").trim();
	return ["```radio", safe, "```", ""].join("\n");
}
