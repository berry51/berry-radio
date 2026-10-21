import { beforeEach, describe, expect, it } from "vitest";
import { showMenu, type MenuSection } from "../src/ui/menu";

describe("下拉菜单", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	const sections: MenuSection[] = [
		{ heading: "最近收听", options: [{ label: "CNR-1 中国之声", icon: "radio-tower" }] },
		{ options: [{ label: "搜索电台…", icon: "search" }] },
	];

	it("渲染分组标题与菜单项", () => {
		const anchor = document.createElement("div");
		document.body.appendChild(anchor);
		showMenu(anchor, sections);

		const menu = document.querySelector(".br-menu");
		expect(menu).not.toBeNull();
		expect(menu?.querySelector(".br-menu__heading")?.textContent).toBe("最近收听");
		const items = [...(menu?.querySelectorAll(".br-menu__label") ?? [])].map((el) => el.textContent);
		expect(items).toEqual(["CNR-1 中国之声", "搜索电台…"]);
	});

	it("点击菜单项会执行回调并关闭菜单", () => {
		const anchor = document.createElement("div");
		document.body.appendChild(anchor);
		let picked = 0;
		showMenu(anchor, [
			{ options: [{ label: "切这一台", onSelect: () => { picked += 1; } }] },
		]);

		const item = document.querySelector(".br-menu__item") as HTMLElement;
		item.click();
		expect(picked).toBe(1);
		expect(document.querySelector(".br-menu")).toBeNull();
	});

	it("重复调用只保留一个菜单", () => {
		const anchor = document.createElement("div");
		document.body.appendChild(anchor);
		showMenu(anchor, sections);
		showMenu(anchor, sections);
		expect(document.querySelectorAll(".br-menu").length).toBe(1);
	});

	it("disabled 项不响应点击", () => {
		const anchor = document.createElement("div");
		document.body.appendChild(anchor);
		let picked = 0;
		showMenu(anchor, [{ heading: "分组", options: [{ label: "不可点", disabled: true, onSelect: () => { picked += 1; } }] }]);

		const item = document.querySelector(".br-menu__item") as HTMLElement;
		expect(item.classList.contains("is-disabled")).toBe(true);
		item.click();
		expect(picked).toBe(0);
	});
});
