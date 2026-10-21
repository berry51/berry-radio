import { PluginSettingTab, Setting, type App } from "obsidian";
import type BerryRadioPlugin from "./main";

export interface BerryRadioSettings {
	country: string;
	defaultStation: string;
	allowHttp: boolean;
	volume: number;
	enableBlock: boolean;
	enableSidebar: boolean;
	enablePage: boolean;
	enableStatusBar: boolean;
	/** 笔记内卡片的排版：hero 竖排唱片式，compact 横排紧凑式 */
	blockLayout: BlockLayout;
}

export type BlockLayout = "hero" | "compact";

export const DEFAULT_SETTINGS: BerryRadioSettings = {
	country: "CN",
	defaultStation: "",
	allowHttp: false,
	volume: 0.8,
	enableBlock: true,
	enableSidebar: true,
	enablePage: true,
	enableStatusBar: true,
	blockLayout: "compact",
};

export const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
	["CN", "中国"],
	["HK", "中国香港"],
	["TW", "中国台湾"],
	["MO", "中国澳门"],
	["US", "美国"],
	["JP", "日本"],
	["GB", "英国"],
	["KR", "韩国"],
	["FR", "法国"],
	["DE", "德国"],
	["RU", "俄罗斯"],
	["SG", "新加坡"],
	["MY", "马来西亚"],
	["CA", "加拿大"],
	["AU", "澳大利亚"],
	["IT", "意大利"],
	["ES", "西班牙"],
	["IN", "印度"],
	["BR", "巴西"],
	["TH", "泰国"],
];

/** 从磁盘读到的未知结构里安全地取出设置，缺失字段回落默认值。 */
export function mergeSettings(source: unknown): BerryRadioSettings {
	if (typeof source !== "object" || source === null) return { ...DEFAULT_SETTINGS };
	const raw = source as Record<string, unknown>;
	const bool = (key: string, fallback: boolean): boolean =>
		typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback;
	const str = (key: string, fallback: string): string =>
		typeof raw[key] === "string" ? (raw[key] as string) : fallback;

	const volume = typeof raw["volume"] === "number" ? (raw["volume"] as number) : DEFAULT_SETTINGS.volume;

	return {
		country: str("country", DEFAULT_SETTINGS.country),
		defaultStation: str("defaultStation", DEFAULT_SETTINGS.defaultStation),
		allowHttp: bool("allowHttp", DEFAULT_SETTINGS.allowHttp),
		volume: Math.max(0, Math.min(1, volume)),
		enableBlock: bool("enableBlock", DEFAULT_SETTINGS.enableBlock),
		enableSidebar: bool("enableSidebar", DEFAULT_SETTINGS.enableSidebar),
		enablePage: bool("enablePage", DEFAULT_SETTINGS.enablePage),
		enableStatusBar: bool("enableStatusBar", DEFAULT_SETTINGS.enableStatusBar),
		blockLayout: raw["blockLayout"] === "hero" ? "hero" : "compact",
	};
}

export class BerryRadioSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: BerryRadioPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("显示方式").setHeading();
		containerEl.createEl("p", {
			cls: "br-setting-desc",
			text: "四种入口可以任意组合，也可以只保留一种。",
		});

		this.addToggle(
			"笔记内嵌播放条",
			"在笔记里写 radio 代码块，就地显示播放条。",
			"enableBlock",
		);
		this.addToggle(
			"右侧栏面板",
			"在右侧栏打开电台列表，适合边写边换台。",
			"enableSidebar",
		);
		this.addToggle("独立页面", "在主区域以标签页打开完整电台页面。", "enablePage");
		this.addToggle("状态栏控制", "底部状态栏显示当前电台，点击可暂停。", "enableStatusBar");

		new Setting(containerEl)
			.setName("笔记卡片样式")
			.setDesc("唱片式居中显示大封面，紧凑式适合把播放器放在段落之间。")
			.addDropdown((dropdown) => {
				dropdown.addOption("hero", "唱片式");
				dropdown.addOption("compact", "紧凑式");
				dropdown.setValue(this.plugin.settings.blockLayout).onChange(async (value) => {
					this.plugin.settings.blockLayout = value === "compact" ? "compact" : "hero";
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

		new Setting(containerEl).setName("电台").setHeading();

		new Setting(containerEl)
			.setName("默认国家或地区")
			.setDesc("搜索与播放优先使用该地区的电台目录。")
			.addDropdown((dropdown) => {
				for (const [code, label] of COUNTRIES) dropdown.addOption(code, label);
				dropdown.setValue(this.plugin.settings.country).onChange(async (value) => {
					this.plugin.settings.country = value;
					this.plugin.directory.clear();
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

		new Setting(containerEl)
			.setName("默认电台")
			.setDesc("当 radio 代码块留空时使用，例如「中国之声」。")
			.addText((text) =>
				text
					.setPlaceholder("留空则不使用默认电台")
					.setValue(this.plugin.settings.defaultStation)
					.onChange(async (value) => {
						this.plugin.settings.defaultStation = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("允许 http 流")
			.setDesc("部分电台只提供不加密的 http 流。开启后可能被 Obsidian 的混合内容策略拦截。")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.allowHttp).onChange(async (value) => {
					this.plugin.settings.allowHttp = value;
					this.plugin.directory.clear();
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				}),
			);

		new Setting(containerEl)
			.setName("音量")
			.addSlider((slider) =>
				slider
					.setLimits(0, 100, 1)
					.setValue(Math.round(this.plugin.settings.volume * 100))
					.onChange((value) => {
						this.plugin.setVolume(value / 100);
					}),
			);

		new Setting(containerEl).setName("关于").setHeading();
		containerEl.createEl("p", {
			cls: "br-setting-desc",
			text: `版本 ${this.plugin.manifest.version}。电台目录来自 radio-browser.info，收藏与设置只保存在当前库。`,
		});
	}

	private addToggle(name: string, desc: string, key: keyof BerryRadioSettings): void {
		new Setting(this.containerEl)
			.setName(name)
			.setDesc(desc)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings[key] as boolean).onChange(async (value) => {
					(this.plugin.settings[key] as boolean) = value;
					await this.plugin.saveSettings();
					this.plugin.applySurfaces();
				}),
			);
	}
}
