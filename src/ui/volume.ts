import { setIcon } from "obsidian";
import type BerryRadioPlugin from "../main";

export interface VolumeControl {
	root: HTMLElement;
	update(): void;
}

/**
 * 音量行：喇叭图标 + 滑杆 + 百分比。
 *
 * 轨道与滑块是自绘的（原生 input 透明地叠在上面只管交互）——原生
 * `::-webkit-slider-thumb` 的垂直定位依赖 margin 抵消，一旦宿主主题改写了
 * 轨道高度就会偏上几像素，且无法从外部修正。自绘之后滑块用
 * `top: 50% / translateY(-50%)` 钉在轨道中线上，与行居中对齐是几何保证。
 */
export function renderVolume(plugin: BerryRadioPlugin, extraClass = ""): VolumeControl {
	const root = document.createElement("div");
	root.className = extraClass ? `br-volume ${extraClass}` : "br-volume";

	const icon = document.createElement("span");
	icon.className = "br-volume__icon";
	setIcon(icon, "volume-2");

	const control = document.createElement("div");
	control.className = "br-volume__control";

	const track = document.createElement("div");
	track.className = "br-volume__track";
	const fill = document.createElement("div");
	fill.className = "br-volume__fill";
	const thumb = document.createElement("div");
	thumb.className = "br-volume__thumb";
	control.appendChild(track);
	control.appendChild(fill);
	control.appendChild(thumb);

	const range = document.createElement("input");
	range.type = "range";
	range.min = "0";
	range.max = "100";
	range.step = "1";
	range.className = "br-volume__range";
	range.value = String(Math.round(plugin.settings.volume * 100));
	// 用原生 label 命名，不用无障碍标签属性：Obsidian 会把它变成悬浮提示
	const rangeId = `br-volume-${Math.random().toString(36).slice(2, 9)}`;
	range.id = rangeId;
	const rangeLabel = document.createElement("label");
	rangeLabel.className = "br-sr-only";
	rangeLabel.htmlFor = rangeId;
	rangeLabel.textContent = "音量";
	control.appendChild(rangeLabel);
	control.appendChild(range);

	const percent = document.createElement("span");
	percent.className = "br-volume__pct";
	percent.setText(`${range.value}%`);

	const paint = (): void => {
		percent.setText(`${range.value}%`);
		// 填充宽度与滑块位置都取自这一个变量，两者永远对得上
		root.style.setProperty("--br-vol", `${range.value}%`);
	};
	paint();

	range.addEventListener("input", () => {
		paint();
		plugin.setVolume(Number(range.value) / 100);
	});

	// 焦点环画在自绘滑块上（原生 input 是透明的，看不见 outline）
	range.addEventListener("focus", () => root.classList.add("is-focus"));
	range.addEventListener("blur", () => root.classList.remove("is-focus"));

	// 滑杆的点击和拖动不该冒泡到卡片上，否则会顺带触发播放/停止
	root.addEventListener("click", (event) => event.stopPropagation());
	root.addEventListener("pointerdown", (event) => event.stopPropagation());

	root.appendChild(icon);
	root.appendChild(control);
	root.appendChild(percent);

	return {
		root,
		update(): void {
			range.value = String(Math.round(plugin.settings.volume * 100));
			paint();
		},
	};
}
