import Hls from "hls.js";
import type { PlayerState, Station } from "./types";

type Listener = (state: PlayerState) => void;

const MAX_ATTEMPTS = 3;

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0.8;
	return Math.max(0, Math.min(1, value));
}

/**
 * 全库唯一的播放器。刻意不设置 audio 的 crossorigin：
 * 一旦设置就会强制走 CORS 检查，会误伤大量本来可以直接播放的流。
 */
export class RadioPlayer {
	private readonly audio: HTMLAudioElement;
	private hls: Hls | null = null;
	private readonly listeners = new Set<Listener>();
	private state: PlayerState = { station: null, status: "idle", message: "" };
	private generation = 0;

	constructor(volume: number) {
		this.audio = new Audio();
		this.audio.preload = "none";
		this.audio.volume = clamp01(volume);
		this.audio.addEventListener("playing", this.handlePlaying);
		this.audio.addEventListener("pause", this.handlePause);
		this.audio.addEventListener("error", this.handleError);
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		listener(this.state);
		return () => {
			this.listeners.delete(listener);
		};
	}

	snapshot(): PlayerState {
		return this.state;
	}

	/** 依次尝试候选源，前一个失败自动换下一个。 */
	async playCandidates(stations: Station[]): Promise<void> {
		const list = stations.slice(0, MAX_ATTEMPTS);
		if (list.length === 0) {
			this.update({ station: null, status: "error", message: "没有可用的电台源" });
			return;
		}

		const token = ++this.generation;

		for (let index = 0; index < list.length; index++) {
			const station = list[index];
			if (!station) continue;
			if (token !== this.generation) return;

			this.update({
				station,
				status: "loading",
				message: index === 0 ? "正在连接…" : `正在尝试第 ${index + 1} 个源…`,
			});

			try {
				await this.attempt(station, token);
				if (token !== this.generation) return;
				this.update({ status: "playing", message: "" });
				return;
			} catch (error) {
				if (token !== this.generation) return;
				// 浏览器阻止播放不是流的问题，换源也没用
				if (error instanceof DOMException && error.name === "NotAllowedError") {
					this.update({ status: "paused", message: "点击播放开始收听" });
					return;
				}
			}
		}

		if (token === this.generation) {
			this.update({ status: "error", message: "该电台暂时无法播放" });
		}
	}

	async playStation(station: Station): Promise<void> {
		await this.playCandidates([station]);
	}

	toggle(): void {
		if (!this.state.station) return;
		if (this.audio.paused) {
			this.audio.play().catch(() => {
				this.update({ status: "error", message: "点击播放重新连接" });
			});
			return;
		}
		this.audio.pause();
	}

	stop(): void {
		this.generation++;
		this.resetMedia();
		this.update({ station: null, status: "idle", message: "" });
	}

	setVolume(volume: number): void {
		this.audio.volume = clamp01(volume);
	}

	getVolume(): number {
		return this.audio.volume;
	}

	destroy(): void {
		this.generation++;
		this.resetMedia();
		this.audio.removeEventListener("playing", this.handlePlaying);
		this.audio.removeEventListener("pause", this.handlePause);
		this.audio.removeEventListener("error", this.handleError);
		this.listeners.clear();
		this.state = { station: null, status: "idle", message: "" };
	}

	private attempt(station: Station, token: number): Promise<void> {
		this.resetMedia();
		if (station.isHls && Hls.isSupported()) return this.attachHls(station, token);
		return new Promise<void>((resolve, reject) => {
			this.audio.src = station.url;
			this.audio.play().then(resolve, reject);
		});
	}

	private attachHls(station: Station, token: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const settle = (finish: () => void): void => {
				if (settled) return;
				settled = true;
				finish();
			};

			const hls = new Hls({
				enableWorker: true,
				maxBufferLength: 30,
				manifestLoadingMaxRetry: 2,
				fragLoadingMaxRetry: 2,
			});
			this.hls = hls;

			hls.on(Hls.Events.MANIFEST_PARSED, () => {
				if (token !== this.generation) {
					settle(resolve);
					return;
				}
				this.audio.play().then(
					() => settle(resolve),
					(error: unknown) => settle(() => reject(error)),
				);
			});

			hls.on(Hls.Events.ERROR, (_event, data) => {
				if (!data.fatal) return;
				if (token !== this.generation) {
					settle(resolve);
					return;
				}
				// 个别 CDN 对 app:// 源直接拒绝，hls.js 拿不到清单；交给原生解码再试一次
				this.teardown();
				this.audio.src = station.url;
				this.audio.play().then(
					() => settle(resolve),
					() => settle(() => reject(new Error("该源不可用"))),
				);
			});

			hls.attachMedia(this.audio);
			hls.loadSource(station.url);
		});
	}

	private resetMedia(): void {
		this.teardown();
		try {
			this.audio.pause();
		} catch {
			// 暂停失败不影响重置
		}
		this.audio.removeAttribute("src");
		this.audio.load();
	}

	private teardown(): void {
		if (!this.hls) return;
		try {
			this.hls.destroy();
		} catch {
			// 销毁失败不影响后续状态，忽略
		}
		this.hls = null;
	}

	private readonly handlePlaying = (): void => {
		if (!this.state.station) return;
		this.update({ status: "playing", message: "" });
	};

	private readonly handlePause = (): void => {
		if (!this.state.station) return;
		if (this.state.status === "loading" || this.state.status === "error") return;
		this.update({ status: "paused", message: "" });
	};

	private readonly handleError = (): void => {
		if (!this.state.station) return;
		// loading 阶段的失败由 playCandidates 的 Promise 处理，这里不抢状态
		if (this.state.status !== "playing" && this.state.status !== "paused") return;
		this.update({ status: "error", message: "该电台暂时无法播放" });
	};

	private update(patch: Partial<PlayerState>): void {
		const next: PlayerState = { ...this.state, ...patch };
		if (
			next.station === this.state.station &&
			next.status === this.state.status &&
			next.message === this.state.message
		) {
			return;
		}
		this.state = next;
		for (const listener of this.listeners) listener(next);
	}
}
