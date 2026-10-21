import { describe, expect, it } from "vitest";
import { EMPTY_STORE, isFavorite, pushRecent, sanitizeStore, toggleFavorite } from "../src/store";
import type { Station } from "../src/types";

function station(id: string, name = id): Station {
	return {
		id,
		name,
		url: `https://example.com/${id}.mp3`,
		tags: [],
		codec: "MP3",
		bitrate: 64,
		country: "China",
		isHls: false,
		ok: true,
		clicks: 0,
	};
}

describe("收藏", () => {
	it("第一次收藏会加入列表", () => {
		const next = toggleFavorite(EMPTY_STORE, station("a"));
		expect(isFavorite(next, "a")).toBe(true);
	});

	it("再次收藏会取消", () => {
		const once = toggleFavorite(EMPTY_STORE, station("a"));
		const twice = toggleFavorite(once, station("a"));
		expect(isFavorite(twice, "a")).toBe(false);
	});

	it("最新收藏排在最前", () => {
		const first = toggleFavorite(EMPTY_STORE, station("a"));
		const second = toggleFavorite(first, station("b"));
		expect(second.favorites[0]?.id).toBe("b");
	});
});

describe("最近收听", () => {
	it("新记录排在最前且不重复", () => {
		const one = pushRecent(EMPTY_STORE, station("a"));
		const two = pushRecent(one, station("b"));
		const again = pushRecent(two, station("a"));
		expect(again.recent.map((item) => item.id)).toEqual(["a", "b"]);
	});

	it("最多保留 20 条", () => {
		let data = EMPTY_STORE;
		for (let index = 0; index < 30; index++) data = pushRecent(data, station(String(index)));
		expect(data.recent).toHaveLength(20);
	});
});

describe("sanitizeStore", () => {
	it("过滤掉结构不对的条目", () => {
		const data = sanitizeStore({
			favorites: [station("a"), { id: 1 }, null],
			recent: "bad",
		});
		expect(data.favorites).toHaveLength(1);
		expect(data.recent).toEqual([]);
	});

	it("输入不是对象时返回空结构", () => {
		expect(sanitizeStore(null)).toEqual({ favorites: [], recent: [] });
	});
});
