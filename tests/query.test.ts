import { describe, expect, it } from "vitest";
import {
	buildBlockSource,
	dedupeByUrl,
	isDirectAudio,
	isHlsUrl,
	isHttpUrl,
	normalizeQuery,
	rankCandidates,
} from "../src/query";
import type { Station } from "../src/types";

function station(overrides: Partial<Station> = {}): Station {
	return {
		id: overrides.id ?? "id",
		name: overrides.name ?? "电台",
		url: overrides.url ?? "https://example.com/a.mp3",
		tags: overrides.tags ?? [],
		codec: overrides.codec ?? "MP3",
		bitrate: overrides.bitrate ?? 64,
		country: overrides.country ?? "China",
		isHls: overrides.isHls ?? false,
		ok: overrides.ok ?? true,
		clicks: overrides.clicks ?? 0,
	};
}

describe("normalizeQuery", () => {
	it("去掉首尾空白", () => {
		expect(normalizeQuery("  中国之声  ")).toBe("中国之声");
	});

	it("把多行折叠成空格", () => {
		expect(normalizeQuery("北京\n\n交通广播\n")).toBe("北京 交通广播");
	});

	it("去掉包裹的引号与反引号", () => {
		expect(normalizeQuery("`中国之声`")).toBe("中国之声");
	});

	it("空内容返回空串", () => {
		expect(normalizeQuery("   \n  ")).toBe("");
	});
});

describe("URL 与编码判定", () => {
	it("识别 HLS 地址", () => {
		expect(isHlsUrl("https://a/b/index.m3u8")).toBe(true);
		expect(isHlsUrl("https://a/b/index.m3u8?token=1")).toBe(true);
		expect(isHlsUrl("https://a/b/64k.mp3")).toBe(false);
	});

	it("识别 http 明文地址", () => {
		expect(isHttpUrl("http://a/b.mp3")).toBe(true);
		expect(isHttpUrl("https://a/b.mp3")).toBe(false);
	});

	it("识别直连音频编码", () => {
		expect(isDirectAudio("MP3")).toBe(true);
		expect(isDirectAudio("aac+")).toBe(true);
		expect(isDirectAudio("UNKNOWN")).toBe(false);
	});
});

describe("rankCandidates", () => {
	it("可播的 MP3 排在不可达的 HLS 之前", () => {
		const deadHls = station({ id: "dead", name: "中国之声", url: "https://dead.example/x.m3u8", codec: "UNKNOWN", isHls: true });
		const workingMp3 = station({ id: "good", name: "CNR-1 中国之声", url: "https://good.example/64k.mp3" });
		expect(rankCandidates([deadHls, workingMp3])[0]?.id).toBe("good");
	});

	it("同名电台不会因为名称完全一致而挤掉可播的源", () => {
		const exactButDead = station({ id: "exact", name: "中国之声", url: "https://dead/x.m3u8", codec: "UNKNOWN", isHls: true });
		const prefixAndAlive = station({ id: "alive", name: "CNR-1 中国之声", url: "https://good/64k.mp3" });
		expect(rankCandidates([exactButDead, prefixAndAlive])[0]?.id).toBe("alive");
	});

	it("探测未通过的源排在探测通过的源之后", () => {
		const unchecked = station({ id: "unchecked", url: "https://a/1.mp3", ok: false });
		const checked = station({ id: "checked", url: "https://a/2.mp3", ok: true });
		expect(rankCandidates([unchecked, checked])[0]?.id).toBe("checked");
	});

	it("同等条件下热度高的在前", () => {
		const cold = station({ id: "cold", url: "https://a/1.mp3", clicks: 1 });
		const hot = station({ id: "hot", url: "https://a/2.mp3", clicks: 200 });
		expect(rankCandidates([cold, hot])[0]?.id).toBe("hot");
	});

	it("按播放地址去重", () => {
		const first = station({ id: "a", url: "https://a/same.mp3", clicks: 10 });
		const second = station({ id: "b", url: "https://a/same.mp3", clicks: 5 });
		expect(rankCandidates([first, second])).toHaveLength(1);
	});

	it("空输入返回空数组", () => {
		expect(rankCandidates([])).toEqual([]);
	});
});

describe("dedupeByUrl", () => {
	it("保留首次出现的条目", () => {
		const list = [station({ id: "1", url: "https://a" }), station({ id: "2", url: "https://a" })];
		expect(dedupeByUrl(list)).toHaveLength(1);
	});
});

describe("buildBlockSource", () => {
	it("生成可插入的 fenced 代码块", () => {
		expect(buildBlockSource("中国之声")).toBe("```radio\n中国之声\n```\n");
	});

	it("移除站名里的反引号，避免破坏代码块", () => {
		expect(buildBlockSource("a```b")).toBe("```radio\nab\n```\n");
	});
});
