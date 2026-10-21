import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			// obsidian 包只提供类型、没有运行时入口，测试时替换为最小替身
			obsidian: fileURLToPath(new URL("./tests/obsidian-stub.ts", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		setupFiles: ["./tests/setup-dom.ts"],
		include: ["tests/**/*.test.ts"],
	},
});
