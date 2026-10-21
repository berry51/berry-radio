import type { Station } from "./types";

export interface StoreData {
	favorites: Station[];
	recent: Station[];
}

export const EMPTY_STORE: StoreData = { favorites: [], recent: [] };

const MAX_FAVORITES = 100;
const MAX_RECENT = 20;

export function isFavorite(data: StoreData, stationId: string): boolean {
	return data.favorites.some((station) => station.id === stationId);
}

export function toggleFavorite(data: StoreData, station: Station): StoreData {
	const exists = isFavorite(data, station.id);
	if (exists) {
		return { ...data, favorites: data.favorites.filter((item) => item.id !== station.id) };
	}
	return { ...data, favorites: [station, ...data.favorites].slice(0, MAX_FAVORITES) };
}

export function pushRecent(data: StoreData, station: Station): StoreData {
	const rest = data.recent.filter((item) => item.id !== station.id);
	return { ...data, recent: [station, ...rest].slice(0, MAX_RECENT) };
}

export function sanitizeStore(value: unknown): StoreData {
	if (typeof value !== "object" || value === null) return { favorites: [], recent: [] };
	const source = value as Partial<StoreData>;
	return {
		favorites: Array.isArray(source.favorites) ? source.favorites.filter(isStation) : [],
		recent: Array.isArray(source.recent) ? source.recent.filter(isStation) : [],
	};
}

function isStation(value: unknown): value is Station {
	if (typeof value !== "object" || value === null) return false;
	const station = value as Partial<Station>;
	return typeof station.id === "string" && typeof station.name === "string" && typeof station.url === "string";
}
