/**
 * 起点中文网书架抓取脚本
 *
 * 用法：
 *   1. 安装依赖（首次）：pnpm add -D playwright && pnpm exec playwright install chromium
 *   2. 方式 A（Cookie 模式）：
 *       在浏览器登录 https://my.qidian.com 后，从开发者工具复制 Cookie 字符串，
 *       设置环境变量运行：QIDIAN_COOKIE="your_cookie_string" pnpm fetch-qidian
 *   3. 方式 B（交互模式，推荐）：
 *       直接运行 pnpm fetch-qidian，脚本会打开浏览器窗口，
 *       你在窗口中手动登录起点后，脚本自动检测登录完成并抓取全部分组。
 *
 * 输出：src/constants/qidian-bookshelf.json（Astro 页面 /qidian/ 读取展示）
 *
 * 特性：
 *   - 遍历书架全部分组（自动发现 /bookcase/{数字ID} 分组链接）
 *   - 每个分组自动翻页抓取（超过 100 本时不再丢失，按书籍 ID 去重合并）
 *   - 等待表格渲染完成（行数稳定），避免抓到未加载完的表格
 *   - 解析每本书的章节数（"第X章"，支持中文数字）
 *   - 抓取时保留历史 recommend（推荐）标记，新书默认不推荐
 *
 * 注意：起点有 JS 反爬与登录保护，页面结构可能随站点改版变化；
 * 若解析失败，脚本会把页面 HTML 保存到 scripts/.qidian-debug.html 供排查。
 */

import fs from "fs/promises";
import path from "path";

const BOOKSHELF_URL = "https://my.qidian.com/bookcase";
const OUTPUT_FILE = path.join(process.cwd(), "src/constants/qidian-bookshelf.json");
const DEBUG_FILE = path.join(process.cwd(), "scripts/.qidian-debug.html");
const AUTH_FILE = path.join(process.cwd(), "scripts/.qidian-auth.json"); // 登录态（Cookie）持久化文件
const MAX_PAGES = 20; // 单个分组最大翻页数

interface QidianBook {
	title: string;
	author: string;
	cover: string;
	url: string;
	category?: string;
	lastChapter?: string;
	updateStatus?: string;
	readProgress?: string;
	recommend?: boolean;
	lastChapterNum?: number;
	readChapterNum?: number;
}

interface QidianGroup {
	name: string;
	books: QidianBook[];
}

interface QidianBookshelfData {
	fetchedAt: string;
	groups: QidianGroup[];
}

// ---- 章节数解析（支持中文数字与阿拉伯数字） ----

const CN_DIGITS: Record<string, number> = {
	零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const CN_UNITS: Record<string, number> = {
	十: 10, 百: 100, 千: 1000, 万: 10000, 亿: 100000000,
};

function chineseToNumber(s: string): number | null {
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
			return null;
		}
	}
	return total + section + num;
}

function extractChapterNum(text: string | undefined | null): number | null {
	if (!text) return null;
	const m = text.match(/第\s*([0-9零一二三四五六七八九十百千万亿]+)\s*章/);
	if (!m) return null;
	const part = m[1].trim();
	if (/^\d+$/.test(part)) return parseInt(part, 10);
	return chineseToNumber(part);
}

function enrichBook(book: QidianBook): void {
	book.lastChapterNum = extractChapterNum(book.lastChapter) ?? undefined;
	book.readChapterNum = extractChapterNum(book.readProgress) ?? undefined;
}

/** 从书籍 URL 提取书籍 ID（https://www.qidian.com/book/123456/ -> 123456） */
function extractBid(url: string): string {
	const m = url.match(/book\/(\d+)/);
	return m ? m[1] : url;
}

/** 等待书架表格渲染完成：行数在 stableTime 内不再变化时返回行数（最多等 timeout） */
async function waitForTableRows(
	page: import("playwright").Page,
	minRows = 1,
	stableTime = 2500,
	timeout = 30000,
): Promise<number> {
	const deadline = Date.now() + timeout;
	let lastCount = -1;
	let stableSince = 0;
	while (Date.now() < deadline) {
		let count = -1;
		try {
			count = await page.evaluate(
				() => document.querySelectorAll("#shelfTable tbody tr").length,
			);
		} catch {
			// 页面跳转/加载中，忽略
		}
		if (count === lastCount && count >= minRows) {
			if (stableSince === 0) stableSince = Date.now();
			if (Date.now() - stableSince > stableTime) return count;
		} else {
			stableSince = 0;
			lastCount = count;
		}
		await page.waitForTimeout(1000);
	}
	return lastCount;
}

/** 等待书架表格出现并渲染稳定，返回是否有书架内容（15 秒内未出现视为未登录/非书架页） */
async function ensureShelfLoaded(page: import("playwright").Page): Promise<boolean> {
	const hasTable = await page
		.waitForSelector("#shelfTable tbody tr", { timeout: 15000 })
		.then(() => true)
		.catch(() => false);
	if (!hasTable) return false;
	await waitForTableRows(page, 1, 1500, 20000);
	return true;
}

/** 解析 "k1=v1; k2=v2" 形式的 Cookie 字符串为 Playwright cookie 数组 */
function parseCookies(cookieStr: string): { name: string; value: string; domain: string; path: string }[] {
	return cookieStr
		.split(";")
		.map((pair) => pair.trim())
		.filter(Boolean)
		.map((pair) => {
			const idx = pair.indexOf("=");
			if (idx === -1) return null;
			return {
				name: pair.slice(0, idx).trim(),
				value: pair.slice(idx + 1).trim(),
				domain: "my.qidian.com",
				path: "/",
			};
		})
		.filter((c): c is { name: string; value: string; domain: string; path: string } => c !== null);
}

/**
 * 尝试用账号密码自动登录起点（尽力而为）
 * 注意：起点登录可能弹出图形/滑块验证码，遇到验证码时无法全自动，需人工在窗口中完成。
 */
async function tryAutoLogin(
	page: import("playwright").Page,
	username: string,
	password: string,
): Promise<boolean> {
	try {
		console.log("尝试用账号密码自动登录...");

		// 等待登录表单出现
		await page.waitForSelector('input[type="password"]', { timeout: 15000 }).catch(() => {});

		// 用户名 / 手机号输入框（按常见选择器依次尝试）
		const userSelectors = [
			'input[type="text"]',
			'input[name*="user"]',
			'input[id*="user"]',
			'input[name*="phone"]',
			'input[name*="account"]',
			'input[placeholder*="手机"]',
			'input[placeholder*="账号"]',
			'input[placeholder*="用户名"]',
		];
		let filled = false;
		for (const sel of userSelectors) {
			const el = page.locator(sel).first();
			if ((await el.count()) > 0) {
				await el.fill(username);
				filled = true;
				break;
			}
		}
		if (!filled) {
			console.log("未找到用户名/手机号输入框，自动登录失败（请改用手动登录）");
			return false;
		}

		// 密码输入框
		const pwdOk = await page
			.fill('input[type="password"]', password)
			.then(() => true)
			.catch(() => {
				console.log("未找到密码输入框，自动登录失败");
				return false;
			});
		if (!pwdOk) return false;

		// 点击登录按钮
		const btnSelectors = [
			'button[type="submit"]',
			'a[class*="login"]',
			'button[class*="login"]',
			'[class*="login-btn"]',
			'.btn-login',
			'button:has-text("登录")',
		];
		for (const sel of btnSelectors) {
			const el = page.locator(sel).first();
			if ((await el.count()) > 0) {
				await el.click().catch(() => {});
				break;
			}
		}

		// 等待登录跳转（若出现验证码则需人工处理）
		await page.waitForTimeout(6000);

		const ok = await page
			.evaluate(() => /my\.qidian\.com\/bookcase/i.test(window.location.href))
			.catch(() => false);
		if (ok) {
			console.log("✅ 账号密码自动登录成功");
		} else {
			console.log("自动登录后未检测到书架页（可能遇到验证码或选择器不匹配），请手动完成登录");
			// 保存登录页 HTML 便于排查
			try {
				await page.content().then((h) =>
					import("node:fs").then((fs) =>
						fs.promises.writeFile(
							path.join(process.cwd(), "scripts/.qidian-login-debug.html"),
							h,
							"utf-8",
						),
					),
				);
			} catch { /* ignore */ }
		}
		return ok;
	} catch (e) {
		console.log("自动登录异常：", e instanceof Error ? e.message : e);
		return false;
	}
}

async function main() {
	// 动态加载 playwright（未安装时给出提示）
	let playwright: typeof import("playwright");
	try {
		playwright = await import("playwright");
	} catch {
		console.error(
			"未安装 playwright。请先执行：\n" +
				"  pnpm add -D playwright && pnpm exec playwright install chromium",
		);
		throw new Error("playwright 未安装");
	}

	const cookieStr = process.env.QIDIAN_COOKIE || "";
	// 账号密码自动登录（可选）
	const qidianUsername = process.env.QIDIAN_USERNAME || "";
	const qidianPassword = process.env.QIDIAN_PASSWORD || "";
	// 是否已有保存的登录态
	let hasSavedAuth = false;
	try {
		await fs.access(AUTH_FILE);
		hasSavedAuth = true;
		console.log("检测到已保存的登录态（scripts/.qidian-auth.json）");
	} catch {
		/* 无登录态文件 */
	}

	// 登录检测函数
	const checkLoggedIn = async (p: import("playwright").Page): Promise<boolean> => {
		try {
			return await p.evaluate(() => {
				const url = window.location.href;
				const onShelf = /my\.qidian\.com\/bookcase/i.test(url);
				const hasBooks =
					document.querySelectorAll(
						'#shelfTable tbody tr, a[href*="/book/"]',
					).length > 0;
				return onShelf && hasBooks;
			});
		} catch {
			return false;
		}
	};

	let browser: import("playwright").Browser | null = null;
	let context: import("playwright").BrowserContext | null = null;
	let page: import("playwright").Page | null = null;
	let loggedIn = false;

	const launchBrowser = async (headless: boolean) => {
		const b = await playwright.chromium.launch({
			headless,
			// 绕过反爬的一些常规参数
			args: [
				"--disable-blink-features=AutomationControlled",
				"--no-sandbox",
			],
		});
		const ctx = await b.newContext({
			userAgent:
				"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
			locale: "zh-CN",
			...(hasSavedAuth ? { storageState: AUTH_FILE } : {}),
		});
		return { b, ctx };
	};

	// ---- 模式 1：Cookie 模式（环境变量 QIDIAN_COOKIE，全程无头）----
	if (cookieStr) {
		console.log("== Cookie 模式：使用环境变量 QIDIAN_COOKIE 抓取 ==");
		const { b, ctx } = await launchBrowser(true);
		browser = b;
		context = ctx;
		const cookies = parseCookies(cookieStr);
		if (cookies.length === 0) {
			console.error("QIDIAN_COOKIE 解析失败，请检查格式（应为 k=v; k2=v2 形式）");
			await browser.close();
			process.exit(1);
		}
		await context.addCookies(cookies);
		console.log(`已注入 ${cookies.length} 个 Cookie`);
		page = await context.newPage();
		await page.goto(BOOKSHELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
		await ensureShelfLoaded(page);
		loggedIn = await checkLoggedIn(page);
		if (!loggedIn) {
			console.error("未检测到有效登录态，请检查 QIDIAN_COOKIE 或改用交互模式");
			await browser.close();
			process.exit(1);
		}
	}

	// ---- 模式 2：登录态模式（无头验证，有效则全程免登录无窗口）----
	if (!loggedIn && hasSavedAuth && !cookieStr) {
		console.log("== 尝试使用已保存的登录态（无头免登录）==");
		const { b, ctx } = await launchBrowser(true);
		browser = b;
		context = ctx;
		page = await context.newPage();
		await page.goto(BOOKSHELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
		await ensureShelfLoaded(page);
		loggedIn = await checkLoggedIn(page);
		if (loggedIn) {
			console.log("✅ 登录态有效，免登录直接抓取（无浏览器窗口）");
		} else {
			console.log("登录态已过期，需要重新登录...");
			await browser.close();
			browser = null;
			context = null;
			page = null;
		}
	}

	// ---- 模式 3：交互模式（有头窗口，账号密码自动登录 → 手动登录）----
	if (!loggedIn && !cookieStr) {
		console.log("== 交互模式：将打开浏览器窗口 ==");
		const { b, ctx } = await launchBrowser(false);
		browser = b;
		context = ctx;
		page = await context.newPage();
		await page.goto(BOOKSHELF_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
		await ensureShelfLoaded(page);

		// 账号密码自动登录（配置了 QIDIAN_USERNAME / QIDIAN_PASSWORD 时）
		if (qidianUsername && qidianPassword) {
			loggedIn = await tryAutoLogin(page, qidianUsername, qidianPassword);
		}

		// 手动登录：轮询等待用户在浏览器窗口完成登录
		if (!loggedIn) {
			console.log("浏览器已打开，请在窗口中登录起点中文网（可手动打开书架页确认）...");
			const deadline = Date.now() + 180000;
			while (Date.now() < deadline && !loggedIn) {
				await page.waitForTimeout(2000);
				loggedIn = await checkLoggedIn(page);
			}
			if (loggedIn) {
				console.log("检测到登录完成，书架已可访问，继续抓取...");
			} else {
				console.log("等待超时（3 分钟）或未检测到书架内容，尝试直接抓取当前页面...");
			}
		}
	}

	// 登录成功则保存登录态（下次免登录）
	if (loggedIn && context) {
		try {
			await context.storageState({ path: AUTH_FILE });
			console.log("✅ 登录态已保存到 scripts/.qidian-auth.json（下次抓取免登录）");
		} catch (e) {
			console.log("登录态保存失败：", e);
		}
	}

	if (!loggedIn || !browser || !context || !page) {
		console.error("未能完成登录，无法抓取。请检查登录态或网络。");
		process.exit(1);
	}

	// ---- 抓取全部分组（自动翻页 + 自动发现分组）----
	const allGroups: QidianGroup[] = [];
	const visitedGroups = new Set<string>();

	const scrapeUrl = async (targetUrl: string): Promise<void> => {
		if (visitedGroups.has(targetUrl)) return;
		visitedGroups.add(targetUrl);

		// 分组基础 URL（去掉分页参数）
		const baseUrl = targetUrl.split(/[?#]/)[0];
		console.log(`==== 抓取分组：${baseUrl} ====`);

		// 分页循环：逐页抓取，按书籍 ID 去重合并
		// 翻页策略：① 同页滚动加载/加载更多按钮 ② 分页控件链接 ③ URL 参数轮换（page/pg/pageNo/p/pageIndex/cur）
		const allBooks: QidianBook[] = [];
		const seenBids = new Set<string>();
		let groupName = "默认分组";
		let pageCount = 0;
		let currentUrl: string | null = baseUrl;
		let activeParam: string | null = null; // 当前生效的页码参数
		let pgParamIdx = 0;
		const PG_PARAMS = ["pageIndex", "page", "pg", "pageNo", "p", "cur"];

		/** 从 URL 提取页码参数名（?page= / &pg= 等） */
		const getUrlParam = (url: string): string | null => {
			const m = url.match(/[?&](page|pg|pageNo|p|pageIndex|cur)=/);
			return m ? m[1] : null;
		};

		/** 从 URL 提取 (参数名, 页码) */
		const parseUrlPage = (url: string): { param: string; num: number } | null => {
			const m = url.match(/[?&](page|pg|pageNo|p|pageIndex|cur)=(\d+)/);
			return m ? { param: m[1], num: parseInt(m[2], 10) } : null;
		};

		while (currentUrl && pageCount < MAX_PAGES) {
			pageCount++;
			console.log(`  [第 ${pageCount} 页] ${currentUrl}`);
			await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});

			// 等待表格渲染完成，行数过少时刷新重试一次
			let rowCount = await waitForTableRows(page);
			if (rowCount <= 2) {
				console.log("    表格行数过少，刷新重试...");
				await page.goto(currentUrl, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
				rowCount = await waitForTableRows(page);
			}
			console.log(`    初始表格 ${rowCount} 行`);

			// 保存页面 HTML 便于调试（仅整个抓取过程首次）
			if (visitedGroups.size === 1 && pageCount === 1) {
				const html = await page.content();
				await fs.writeFile(DEBUG_FILE, html, "utf-8");
			}

			// === 同页滚动加载 / "加载更多"按钮检测（行数增长则继续滚动）===
			let lastRowCount = rowCount;
			for (let r = 0; r < 8; r++) {
				// 滚动到底部多次，触发虚拟滚动/懒加载
				await page
					.evaluate(async () => {
						for (let i = 0; i < 5; i++) {
							window.scrollTo(0, document.body.scrollHeight);
							await new Promise((res) => setTimeout(res, 300));
						}
					})
					.catch(() => {});
				// 尝试点击"加载更多/查看更多"按钮
				await page
					.evaluate(() => {
						const btn = Array.from(
							document.querySelectorAll("a, button, div"),
						).find((el) => {
							const t = (el.textContent || "").trim();
							return (
								/加载更多|查看更多|load more|下一页/i.test(t) &&
								t.length < 12
							);
						});
						if (btn && btn instanceof HTMLElement) btn.click();
					})
					.catch(() => {});
				await page.waitForTimeout(2500);

				const nowCount = await page
					.evaluate(() => document.querySelectorAll("#shelfTable tbody tr").length)
					.catch(() => -1);
				if (nowCount > lastRowCount) {
					console.log(`    滚动加载触发：${lastRowCount} -> ${nowCount} 行`);
					lastRowCount = nowCount;
					continue;
				}
				break;
			}
			rowCount = lastRowCount;
			console.log(`    滚动加载后 ${rowCount} 行`);

			// 解析当前页表格
			const pageGroups = await page.evaluate(() => {
				interface B {
					title: string;
					author: string;
					cover: string;
					url: string;
					category?: string;
					lastChapter?: string;
					updateStatus?: string;
					readProgress?: string;
				}
				interface G {
					name: string;
					books: B[];
				}

				const groups: G[] = [];
				const groupName =
					document.querySelector("h2.shelf-title")?.textContent?.trim() || "默认分组";

				const books: B[] = [];
				document.querySelectorAll("#shelfTable tbody tr").forEach((row) => {
					const nameLink = row.querySelector('a[data-bid]');
					const bid = nameLink?.getAttribute("data-bid") || "";
					const title =
						nameLink?.getAttribute("title")?.trim() ||
						nameLink?.textContent?.trim() ||
						"";
					if (!bid || !title) return;

					const authorEl = row.querySelector(".shelf-table-author");
					const author =
						authorEl?.getAttribute("title")?.trim() ||
						authorEl?.textContent?.trim() ||
						"";

					const category =
						row
							.querySelector(".fen-category")
							?.textContent?.trim()
							?.replace(/[「」]/g, "") || "";

					const chapterEl = row.querySelector(".shelf-table-chapter");
					const lastChapter =
						chapterEl?.getAttribute("title")?.trim() ||
						chapterEl?.textContent?.trim() ||
						"";

					const progressEl = row.querySelector(".spTips");
					const readProgress = progressEl?.getAttribute("title")?.trim() || "";
					const updateStatus = progressEl?.textContent?.trim() || "";

					const cover = `https://bookcover.yuewen.com/qdbimg/349573/${bid}/180`;
					const url = `https://www.qidian.com/book/${bid}/`;

					books.push({
						title,
						author,
						cover,
						url,
						category: category || undefined,
						lastChapter: lastChapter || undefined,
						updateStatus: updateStatus || undefined,
						readProgress: readProgress || undefined,
					});
				});

				if (books.length > 0) {
					groups.push({ name: groupName, books });
				}
				return groups;
			});

			if (pageGroups.length > 0) {
				groupName = pageGroups[0].name;
				const pageBooks = pageGroups[0].books;

				// 按书籍 ID 去重合并
				let newCount = 0;
				pageBooks.forEach((b) => {
					const bid = extractBid(b.url);
					if (!seenBids.has(bid)) {
						seenBids.add(bid);
						allBooks.push(b);
						newCount++;
					}
				});
				console.log(`    本页 ${pageBooks.length} 本，新增 ${newCount} 本（累计 ${allBooks.length}）`);

				// 当前 URL 参数有效（抓到新书）则记住该参数
				if (newCount > 0) {
					const p = getUrlParam(currentUrl);
					if (p) activeParam = p;
				}

				// 已确认有效的页码参数翻页到无新书时，结束本分组
				if (newCount === 0 && activeParam) {
					console.log("    翻页已到底（无新书），结束本分组");
					break;
				}
			} else {
				console.log("    未解析到书籍（可能不是书架表格页），停止翻页");
				break;
			}

			// === 小分组快速跳过：第 1 页行数未满一页（<100 行）说明无翻页 ===
			if (pageCount === 1 && rowCount < 100) {
				console.log(`    本组仅 ${rowCount} 本（未满一页），无需翻页`);
				break;
			}

			// === 确定下一页 URL ===
			// 策略 1：页面分页控件链接（"下一页"按钮 / 页码链接）
			const pageLink = await page.evaluate(() => {
				const nextA = Array.from(document.querySelectorAll('a[href]')).find((a) => {
					const text = (a.textContent || "").trim();
					const cls = a.className || "";
					return /下一页|下页|next/i.test(text) && !/disabled/.test(String(cls));
				});
				if (nextA) {
					try {
						const u = new URL((nextA as HTMLAnchorElement).href, window.location.href);
						if (u.hostname === "my.qidian.com" && u.href !== window.location.href) {
							return u.href;
						}
					} catch { /* ignore */ }
				}
				const pageLinks = Array.from(
					document.querySelectorAll('.pagination a[href], .pages a[href], [class*="page-list"] a[href], .ui-page a[href]'),
				);
				for (const a of pageLinks) {
					try {
						const u = new URL((a as HTMLAnchorElement).href, window.location.href);
						if (u.hostname === "my.qidian.com" && u.href !== window.location.href) {
							return u.href;
						}
					} catch { /* ignore */ }
				}
				return null;
			});

			if (pageLink) {
				currentUrl = pageLink;
				continue;
			}

			// 策略 2：已生效的页码参数继续翻页（页码连续递增，避免跳号）
			if (activeParam) {
				const parsed = parseUrlPage(currentUrl);
				const nextNum = (parsed?.num ?? 1) + 1;
				currentUrl = `${baseUrl}?${activeParam}=${nextNum}`;
				continue;
			}

			// 策略 3：尝试新的页码参数（从第 2 页开始，第 1 页已抓）
			if (pgParamIdx < PG_PARAMS.length) {
				const param = PG_PARAMS[pgParamIdx];
				pgParamIdx++;
				currentUrl = `${baseUrl}?${param}=2`;
				continue;
			}

			// 策略 4：无更多页
			currentUrl = null;
		}

		// 汇总当前分组
		if (allBooks.length > 0) {
			allGroups.push({ name: groupName, books: allBooks });
			console.log(`  ★ 分组 "${groupName}" 完成：${allBooks.length} 本（${pageCount} 页）`);
		} else {
			console.log("  未解析到书籍（该页面可能不是书架表格页）");
		}

		// 发现其他分组链接：仅接受 my.qidian.com 域名的 /bookcase/{数字ID}
		const links = await page.evaluate(() => {
			const out: { name: string; url: string }[] = [];
			document.querySelectorAll('a[href*="bookcase"]').forEach((el) => {
				const href = el.getAttribute("href") || "";
				const name = el.textContent?.trim() || "";
				try {
					const u = new URL(href, window.location.href);
					if (
						u.hostname === "my.qidian.com" &&
						/\/bookcase\/\d+/.test(u.pathname)
					) {
						out.push({ name, url: u.href });
					}
				} catch {
					/* 忽略无效链接 */
				}
			});
			return out;
		});

		for (const link of links.filter((l) => l.name)) {
			await scrapeUrl(link.url.split(/[?#]/)[0]);
		}
	};

	await scrapeUrl(BOOKSHELF_URL);
	await browser.close();

	// ---- 按分组名去重（重复访问产生的重复分组只保留第一个）----
	const seenNames = new Set<string>();
	const dedupedGroups = allGroups.filter((g) => {
		if (seenNames.has(g.name)) return false;
		seenNames.add(g.name);
		return true;
	});

	// ---- 章节数解析 + 保留历史推荐状态 ----
	const oldRecommend = new Map<string, boolean>();
	try {
		const oldRaw = await fs.readFile(OUTPUT_FILE, "utf-8");
		const oldData = JSON.parse(oldRaw) as QidianBookshelfData;
		oldData.groups?.forEach((g) =>
			g.books?.forEach((b) => {
				if (b.recommend && b.url) oldRecommend.set(b.url, true);
			}),
		);
	} catch {
		/* 旧数据不存在时忽略 */
	}

	dedupedGroups.forEach((g) =>
		g.books.forEach((b) => {
			enrichBook(b);
			if (oldRecommend.has(b.url)) b.recommend = true;
		}),
	);

	if (dedupedGroups.length === 0) {
		console.error(
			"未能从页面提取书架数据。已将页面 HTML 保存到 scripts/.qidian-debug.html，" +
				"请检查实际 DOM/接口结构，或确认已登录且书架非空。",
		);
		process.exit(1);
	}

	const result: QidianBookshelfData = {
		fetchedAt: new Date().toISOString(),
		groups: dedupedGroups,
	};

	const bookCount = dedupedGroups.reduce((sum, g) => sum + g.books.length, 0);
	console.log(
		`抓取成功：${dedupedGroups.length} 个分组，共 ${bookCount} 本书，写入 ${OUTPUT_FILE}`,
	);
	await fs.writeFile(OUTPUT_FILE, JSON.stringify(result, null, "\t"), "utf-8");
}

main().catch((err) => {
	console.error("抓取失败：", err);
	process.exit(1);
});
