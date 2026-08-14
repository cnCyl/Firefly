// 起点中文网书架功能类型定义
// 数据由 scripts/fetch-qidian-bookshelf.ts 抓取生成到 src/constants/qidian-bookshelf.json

export type QidianBook = {
	title: string; // 书名
	author: string; // 作者
	cover: string; // 封面图 URL
	url: string; // 书籍详情页链接
	category?: string; // 小说分类（玄幻/都市等）
	lastChapter?: string; // 最新章节标题
	updateStatus?: string; // 更新状态："有更新" / "无更新"
	readProgress?: string; // 阅读进度（如 "读至第 123 章"）
	recommend?: boolean; // 是否推荐（页面星星标记，抓取时保留）
	lastChapterNum?: number; // 解析出的最新章节数（无则缺省）
	readChapterNum?: number; // 解析出的阅读章节数（无则缺省）
};

export type QidianGroup = {
	name: string; // 书架分组名
	books: QidianBook[];
};

export type QidianBookshelfData = {
	fetchedAt: string; // 抓取时间 ISO 字符串
	groups: QidianGroup[];
};

export type QidianConfig = {
	enable: boolean; // 是否启用起点书架页面
	title: string; // 页面标题，留空使用 i18n 翻译
	description: string; // 页面描述，留空使用 i18n 翻译
	bookshelfUrl: string; // 起点书架页面地址（抓取脚本使用）
	// 需要添加 referrerpolicy="no-referrer" 的封面图域名（起点封面图有防盗链）
	coverDomains: string[];
};
