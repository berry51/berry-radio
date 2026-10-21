const TAG_LABELS: Record<string, string> = {
	music: "音乐",
	news: "新闻",
	talk: "谈话",
	sports: "体育",
	oldies: "怀旧",
	pop: "流行",
	rock: "摇滚",
	classical: "古典",
	jazz: "爵士",
	culture: "文化",
	entertainment: "娱乐",
	information: "资讯",
	traffic: "交通",
	"full service": "综合",
	"public radio": "公共广播",
	lifestyle: "生活",
	economics: "财经",
	business: "财经",
	literature: "文学",
	storytelling: "评书",
	children: "少儿",
	opera: "戏曲",
	relax: "轻音乐",
	"internet radio": "网络电台",
	international: "国际",
	religion: "宗教",
	comedy: "喜剧",
};

/** 侧栏与页面上的分类入口，第二项是 radio-browser 的 tag。 */
export const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
	["music", "音乐"],
	["news", "新闻"],
	["traffic", "交通"],
	["full service", "综合"],
	["economics", "财经"],
	["culture", "文化"],
	["sports", "体育"],
	["storytelling", "评书"],
	["opera", "戏曲"],
	["children", "少儿"],
	["oldies", "怀旧"],
	["public radio", "公共广播"],
];

/** 把英文标签翻成中文；没有对应词的中文标签原样保留，其余丢弃，避免中英混杂。 */
export function formatTags(tags: string[], limit = 3): string[] {
	const result: string[] = [];
	for (const tag of tags) {
		const key = tag.trim().toLowerCase();
		if (!key) continue;
		const label = TAG_LABELS[key] ?? (/[\u4e00-\u9fa5]/.test(tag) ? tag.trim() : "");
		if (!label || result.includes(label)) continue;
		result.push(label);
		if (result.length >= limit) break;
	}
	return result;
}

/** 播放条副标题：标签 · 编码 · 码率，缺省给「直播电台」。 */
export function describeStation(station: {
	name: string;
	tags: string[];
	codec: string;
	bitrate: number;
}): string {
	const parts: string[] = [];
	const name = station.name.trim().toLowerCase();
	// 有些电台的标签就是自己的名字，重复展示没有意义；只按整词相等判断，避免误删「交通」这类有效标签
	const tags = formatTags(station.tags, 2).filter((tag) => tag.toLowerCase() !== name);
	if (tags.length > 0) parts.push(tags.join(" · "));
	if (station.codec && station.codec.toUpperCase() !== "UNKNOWN") parts.push(station.codec);
	if (station.bitrate > 0) parts.push(`${station.bitrate}kbps`);
	return parts.length > 0 ? parts.join(" · ") : "直播电台";
}

/** 顶层分类的 tag 集合，用于把电台标签映射到分类。 */
const CATEGORY_KEYS = new Set(CATEGORIES.map(([tag]) => tag.toLowerCase()));
const CATEGORY_LABELS = new Set(CATEGORIES.map(([, label]) => label));

/**
 * 电台所属的第一个顶层分类（中文标签），无匹配返回 null。
 * 用于播放器上的分类标：英文 tag 直接命中分类 key，中文 tag 命中分类名。
 */
export function primaryCategory(tags: string[]): string | null {
	for (const tag of tags) {
		const raw = tag.trim();
		if (!raw) continue;
		const key = raw.toLowerCase();
		if (CATEGORY_KEYS.has(key)) {
			const found = CATEGORIES.find(([t]) => t.toLowerCase() === key);
			if (found) return found[1];
		}
		if (CATEGORY_LABELS.has(raw)) return raw;
	}
	return null;
}
