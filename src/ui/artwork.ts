import type { Station } from "../types";

export function monogram(name: string): string {
	const value = (name || "").trim();
	if (!value) return "?";
	const first = value.charAt(0);
	return /[A-Za-z0-9]/.test(first) ? first.toUpperCase() : first;
}

export type ArtworkSize = "sm" | "md" | "lg" | "xl";

/**
 * 电台封面：中性底 + 发丝内边的圆形。
 * 不按站名派生色相——颜色只来自电台自己的台标（favicon）或 Obsidian 主题强调色，
 * 避免每家电台一个颜色在笔记里制造视觉噪音。
 */
export function renderArtwork(
	container: HTMLElement,
	station: Station | null,
	size: ArtworkSize,
): void {
	container.empty();
	container.className = `br-art br-art--${size}`;

	if (!station) {
		container.classList.remove("br-art--station");
		container.textContent = "♪";
		return;
	}

	container.classList.add("br-art--station");

	const label = container.createSpan({ cls: "br-art__mono", text: monogram(station.name) });

	const favicon = station.favicon;
	if (!favicon || !/^https:\/\//i.test(favicon)) return;

	const image = container.createEl("img");
	image.alt = "";
	image.loading = "lazy";
	image.decoding = "async";
	image.addEventListener("load", () => {
		label.remove();
		container.appendChild(image);
	});
	image.addEventListener("error", () => {
		image.remove();
	});
	image.src = favicon;
}
