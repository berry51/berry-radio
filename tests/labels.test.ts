import { describe, expect, it } from "vitest";
import { describeStation, formatTags, primaryCategory } from "../src/labels";

describe("formatTags", () => {
	it("把常见英文标签翻成中文", () => {
		expect(formatTags(["news", "music"])).toEqual(["新闻", "音乐"]);
	});

	it("丢弃无法翻译的英文标签，避免中英混杂", () => {
		expect(formatTags(["news", "kwangtung"])).toEqual(["新闻"]);
	});

	it("保留中文原始标签", () => {
		expect(formatTags(["国家台", "news"])).toEqual(["国家台", "新闻"]);
	});

	it("去重并限制数量", () => {
		expect(formatTags(["news", "news", "music", "talk"], 2)).toEqual(["新闻", "音乐"]);
	});

	it("忽略空白项", () => {
		expect(formatTags(["", "  ", "jazz"])).toEqual(["爵士"]);
	});
});

describe("describeStation", () => {
	it("组合标签、编码与码率", () => {
		const text = describeStation({
			name: "北京交通广播",
			tags: ["traffic", "music"],
			codec: "MP3",
			bitrate: 64,
		});
		expect(text).toBe("交通 · 音乐 · MP3 · 64kbps");
	});

	it("标签与站名重复时不重复展示", () => {
		const text = describeStation({ name: "中国之声", tags: ["中国之声"], codec: "MP3", bitrate: 0 });
		expect(text).toBe("MP3");
	});

	it("没有可用信息时给出兜底文案", () => {
		const text = describeStation({ name: "某台", tags: [], codec: "UNKNOWN", bitrate: 0 });
		expect(text).toBe("直播电台");
	});
});

describe("primaryCategory", () => {
	it("返回标签命中的第一个顶层分类", () => {
		expect(primaryCategory(["traffic", "news"])).toBe("交通");
	});

	it("中文标签直接命中分类名", () => {
		expect(primaryCategory(["新闻"])).toBe("新闻");
	});

	it("无匹配分类返回 null", () => {
		expect(primaryCategory(["kwangtung"])).toBeNull();
		expect(primaryCategory([])).toBeNull();
	});
});
