import { describe, expect, it } from "vitest";
import { synchronizeDesignPages } from "../src/modes/rpc/design-pages.ts";

describe("Design 页面索引", () => {
	it("一次 patch 创建多个页面时同步补齐页面树", () => {
		const pages = [{ id: "home", name: "Home", route: "/", entryFileId: "home-index", fileIds: ["home-index"] }];
		const files = [
			{ id: "home-index", path: "pages/home/index.html", language: "html" as const, content: "" },
			{ id: "login-index", path: "pages/qcc-login/index.html", language: "html" as const, content: "" },
			{ id: "login-css", path: "pages/qcc-login/styles.css", language: "css" as const, content: "" },
			{ id: "detail-index", path: "pages/qcc-detail/index.html", language: "html" as const, content: "" },
		];

		expect(synchronizeDesignPages(pages, files)).toEqual([
			{ id: "home", name: "Home", route: "/", entryFileId: "home-index", fileIds: ["home-index"] },
			{ id: "qcc-login", name: "qcc-login", route: "/qcc-login", entryFileId: "login-index", fileIds: ["login-index", "login-css"] },
			{ id: "qcc-detail", name: "qcc-detail", route: "/qcc-detail", entryFileId: "detail-index", fileIds: ["detail-index"] },
		]);
	});

	it("不把没有 HTML 入口的目录误识别为页面", () => {
		const files = [{ id: "css", path: "pages/shared-only/styles.css", language: "css" as const, content: "" }];
		expect(synchronizeDesignPages([], files)).toEqual([]);
	});
});
