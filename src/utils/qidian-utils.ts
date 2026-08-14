import qidianBookshelf from "@/constants/qidian-bookshelf.json";
import type { QidianBook, QidianBookshelfData } from "@/types/qidianConfig";

// 读取起点书架数据（由 scripts/fetch-qidian-bookshelf.ts 构建时生成）
export function getQidianBookshelf(): QidianBookshelfData {
	return qidianBookshelf as QidianBookshelfData;
}

// 书架是否为空（无分组或全部分组无书）
export function isQidianBookshelfEmpty(data: QidianBookshelfData): boolean {
	return (
		!data ||
		!Array.isArray(data.groups) ||
		data.groups.every((g) => !g.books || g.books.length === 0)
	);
}

// 书架总书籍数
export function getQidianBookCount(data: QidianBookshelfData): number {
	if (!data || !Array.isArray(data.groups)) return 0;
	return data.groups.reduce((sum, g) => sum + (g.books?.length || 0), 0);
}

// 分组是否使用纯文本模式（书籍数量超过 50 本）
export function isGroupTextMode(bookCount: number): boolean {
	return bookCount > 50;
}

// ---- 章节数解析 ----

const CN_DIGITS: Record<string, number> = {
	零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CN_UNITS: Record<string, number> = {
	十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000,
};

/** 中文数字转阿拉伯数字（如 "四千九百六十七" -> 4967，失败返回 null） */
export function chineseToNumber(s: string): number | null {
	let total = 0;
	let section = 0;
	let num = 0;
	for (const ch of s) {
		if (ch in CN_DIGITS) {
			num = CN_DIGITS[ch];
		} else if (ch in CN_UNITS) {
			const unit = CN_UNITS[ch];
			if (unit === 10000 || unit === 100000000) {
				section = (section + num) * unit;
				total += section;
				section = 0;
				num = 0;
			} else {
				section += (num === 0 ? 1 : num) * unit;
				num = 0;
			}
		} else {
			return null; // 出现非数字字符，无法解析
		}
	}
	return total + section + num;
}

/** 从文本中提取"第 X 章"的章节数（支持中文数字与阿拉伯数字），无则返回 null */
export function extractChapterNum(text: string | undefined | null): number | null {
	if (!text) return null;
	const m = text.match(/第\s*([0-9零一二三四五六七八九十百千万亿]+)\s*章/);
	if (!m) return null;
	const part = m[1].trim();
	if (/^\d+$/.test(part)) return parseInt(part, 10);
	return chineseToNumber(part);
}

/** 判断是否已阅读至最新章（绿勾条件） */
export function isReadToLatest(book: QidianBook): boolean {
	const { lastChapterNum, readChapterNum, updateStatus } = book;
	// 章节数可解析时优先用数字比较
	if (lastChapterNum != null && readChapterNum != null) {
		return readChapterNum >= lastChapterNum;
	}
	// 解析失败时按状态文本判断："有更新" / "未读" 视为未读到最新
	if (!updateStatus) return false;
	return !/有更新|未读/.test(updateStatus);
}
