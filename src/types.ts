export interface Station {
	id: string;
	name: string;
	url: string;
	tags: string[];
	codec: string;
	bitrate: number;
	country: string;
	favicon: string;
	isHls: boolean;
	/** radio-browser 的 lastcheckok，1 表示最近一次探测通过 */
	ok: boolean;
	clicks: number;
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlayerState {
	station: Station | null;
	status: PlayerStatus;
	message: string;
}

export type ListMode = "browse" | "favorites" | "recent";
