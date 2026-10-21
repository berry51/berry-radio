import { setIcon } from "obsidian";
import type BerryRadioPlugin from "../main";
import type { PlayerState } from "../types";
import { srOnly } from "./a11y";
import { renderVolume, type VolumeControl } from "./volume";

export type ControlSize = "sm" | "md" | "lg";

export interface PlayerControls {
	root: HTMLElement;
	update(state: PlayerState): void;
}

/** 图标按钮：图标 + 视觉隐藏文本。不用无障碍标签属性，Obsidian 会把它变成悬浮提示。 */
function button(cls: string, iconId: string, label: string, onClick: () => void): {
	element: HTMLButtonElement;
	icon: HTMLElement;
	label: HTMLElement;
} {
	const element = createEl("button");
	element.type = "button";
	element.className = cls;
	const icon = element.createSpan({ cls: "br-icon" });
	setIcon(icon, iconId);
	const labelEl = srOnly(label);
	element.appendChild(labelEl);
	element.addEventListener("click", (event) => {
		event.stopPropagation();
		onClick();
	});
	return { element, icon, label: labelEl };
}

/**
 * 电台是直播流，没有「上一曲 / 下一曲」——控制区只保留播放与停止。
 * 音量与播放键同一行并整体居中，控制区因此只占一行。
 * 只负责画控件与更新图标，播放状态由调用方传入。
 */
export function renderControls(
	plugin: BerryRadioPlugin,
	options: { size?: ControlSize; showVolume?: boolean } = {},
): PlayerControls {
	const size = options.size ?? "md";
	const root = createDiv();
	root.className = `br-controls br-controls--${size}`;

	const play = button("br-controls__btn br-controls__btn--play", "play", "播放", () =>
		plugin.togglePlayback(),
	);
	root.appendChild(play.element);

	let volume: VolumeControl | null = null;
	if (options.showVolume) {
		volume = renderVolume(plugin);
		root.appendChild(volume.root);
	}

	return {
		root,
		update(state: PlayerState): void {
			// 直播流：图标用「暂停」表达"按下即停播"，实际动作是断开（player.toggle → stop）
			const active = state.status === "playing" || state.status === "loading";
			setIcon(play.icon, active ? "pause" : "play");
			play.element.classList.toggle("is-loading", state.status === "loading");
			play.label.setText(active ? "停止播放" : "播放");
			play.element.disabled = !state.station;
			volume?.update();
		},
	};
}
