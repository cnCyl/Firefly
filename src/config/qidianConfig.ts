import type { QidianConfig } from "@/types/qidianConfig";

export const qidianConfig: QidianConfig = {
	// 是否启用起点书架页面（同时受 siteConfig.pages.qidian 控制）
	enable: true,
	// 页面标题，留空使用 i18n 翻译
	title: "",
	// 页面描述，留空使用 i18n 翻译
	description: "",
	// 起点书架页面地址（抓取脚本 fetch-qidian-bookshelf.ts 使用）
	bookshelfUrl: "https://my.qidian.com/bookcase",
	// 起点封面图域名防盗链处理
	coverDomains: ["qidian.com", "*.qidian.com", "qpic.cn", "*.qpic.cn"],
};
