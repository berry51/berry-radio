import { describe, expect, it, vi } from "vitest";

import { RadioBlock } from "../src/views/radio-block";
import type BerryRadioPlugin from "../src/main";
import type { PlayerState, Station } from "../src/types";

function station(overrides: Partial<Station> = {}): Station {
	return {
		id: overrides.id ?? "id-1",
		name: overrides.name ?? "中国之声",
		url: overrides.url ?? "https://example.com/64k.mp3",
		tags: overrides.tags ?? ["news"],
		codec: overrides.codec ?? "MP3",
		bitrate: overrides.bitrate ?? 64,
		country: "China",
		isHls: overrides.isHls ?? false,
		ok: true,
		clicks: 0,
	};
}

function makeHost(candidates: Station[], defaultStation = "") {
	let listener: ((state: PlayerState) => void) | null = null;
	let state: PlayerState = { station: null, status: "idle", message: "" };

	const player = {
		subscribe(fn: (value: PlayerState) => void): () => void {
			listener = fn;
			fn(state);
			return () => {
				listener = null;
			};
		},
		snapshot: (): PlayerState => state,
		toggle: vi.fn(),
		stop: vi.fn(),
	};

	const directory = {
		resolveCandidates: vi.fn(async () => candidates),
		search: vi.fn(async () => candidates),
		clear: vi.fn(),
	};

	const playStationCandidates = vi.fn(async (list: Station[]) => {
		const first = list[0];
		state = { station: first ?? null, status: "playing", message: "" };
		listener?.(state);
	});

	const plugin = {
		player,
		directory,
		playStationCandidates,
		settings: { country: "CN", defaultStation, volume: 0.8 },
		setVolume: vi.fn(),
		isFavorite: () => false,
		toggleFavorite: vi.fn(),
		app: { vault: { getAbstractFileByPath: () => null } },
	} as unknown as BerryRadioPlugin;

	return {
		plugin,
		player,
		directory,
		playStationCandidates,
		emit(next: PlayerState) {
			state = next;
			listener?.(next);
		},
	};
}

function mount(query: string, host: ReturnType<typeof makeHost>) {
	const container = document.createElement("div");
	const block = new RadioBlock(container, host.plugin, query);
	block.onload();
	return { container, block };
}

describe("RadioBlock 渲染", () => {
	it("解析成功后显示最佳候选的站名与描述", async () => {
		const host = makeHost([station()]);
		const { container } = mount("中国之声", host);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		const root = container.querySelector(".berry-radio") as HTMLElement;
		expect(root.getAttribute("data-state")).toBe("ready");
		expect(container.querySelector(".br-controls__btn--play .br-icon")?.textContent).toBe("play");
		expect(container.textContent).toContain("新闻");
		expect(container.textContent).toContain("64kbps");
	});

	it("没有候选时给出选台入口", async () => {
		const host = makeHost([]);
		const { container } = mount("不存在的电台", host);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("没有找到这个电台");
		});
		const root = container.querySelector(".berry-radio") as HTMLElement;
		expect(root.getAttribute("data-state")).toBe("empty");
		expect(container.textContent).toContain("选择电台");
	});

	it("空代码块且未设置默认电台时提示先选台", async () => {
		const host = makeHost([station()], "");
		const { container } = mount("", host);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("还没有指定电台");
		});
		expect(host.directory.resolveCandidates).not.toHaveBeenCalled();
	});

	it("空代码块会回落到默认电台设置", async () => {
		const host = makeHost([station()], "中国之声");
		const { container } = mount("", host);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});
		expect(host.directory.resolveCandidates).toHaveBeenCalledWith("中国之声", "CN");
	});

	it("目录请求失败时显示错误原因", async () => {
		const host = makeHost([station()]);
		host.directory.resolveCandidates.mockRejectedValueOnce(new Error("无法连接电台目录"));
		const { container } = mount("中国之声", host);

		await vi.waitFor(() => {
			expect(container.textContent).toContain("无法连接电台目录");
		});
	});
});

describe("RadioBlock 与播放器联动", () => {
	it("播放中切换为停止图标（直播流没有暂停）", async () => {
		const host = makeHost([station()]);
		const { container } = mount("中国之声", host);
		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		host.emit({ station: station(), status: "playing", message: "" });

		const root = container.querySelector(".berry-radio") as HTMLElement;
		expect(root.getAttribute("data-state")).toBe("playing");
		expect(container.querySelector(".br-controls__btn--play .br-icon")?.textContent).toBe("pause");
	});

	it("播放的是候选里的另一路源时仍算当前电台", async () => {
		const backup = station({ id: "id-2", name: "CNR-1 中国之声" });
		const host = makeHost([station(), backup]);
		const { container } = mount("中国之声", host);
		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		host.emit({ station: backup, status: "playing", message: "" });

		expect(container.querySelector(".br-controls__btn--play .br-icon")?.textContent).toBe("pause");
	});

	it("播放中再次点击播放键会停止而不是暂停", async () => {
		const host = makeHost([station()]);
		const { container } = mount("中国之声", host);
		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		host.emit({ station: station(), status: "playing", message: "" });
		const button = container.querySelector(".br-controls__btn--play") as HTMLButtonElement;
		button.click();

		expect(host.player.stop).toHaveBeenCalled();
		expect(host.player.toggle).not.toHaveBeenCalled();
	});

	it("点击播放会把整组候选交给播放器", async () => {
		const backup = station({ id: "id-2", name: "CNR-1 中国之声" });
		const host = makeHost([station(), backup]);
		const { container } = mount("中国之声", host);
		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		const button = container.querySelector(".br-controls__btn--play") as HTMLButtonElement;
		button.click();

		await vi.waitFor(() => {
			expect(host.playStationCandidates).toHaveBeenCalledWith([station(), backup]);
		});
	});

	it("卸载后不再响应播放状态变化", async () => {
		const host = makeHost([station()]);
		const { container, block } = mount("中国之声", host);
		await vi.waitFor(() => {
			expect(container.textContent).toContain("中国之声");
		});

		block.onunload();
		const before = container.querySelector(".br-controls__btn--play .br-icon")?.textContent;

		host.emit({ station: station(), status: "playing", message: "" });

		expect(container.querySelector(".br-controls__btn--play .br-icon")?.textContent).toBe(before);
	});
});
