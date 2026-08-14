/**
 * 一键更新起点书架并触发部署
 *
 * 流程：
 *   1. 合并页面导出的推荐文件（项目根目录 qidian-recommend.json → src/constants/）
 *   2. 运行抓取脚本（浏览器登录起点，自动抓取全部分组）
 *   3. 提交更新（书架数据 + 推荐列表，提交信息：年月日_书架推送_次数）
 *   4. 推送到 Git 仓库（Cloudflare Pages 等平台检测到推送后自动重新构建部署）
 *
 * 用法：pnpm update-qidian
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BOOKSHELF_FILE = "src/constants/qidian-bookshelf.json";
const RECOMMEND_FILE = "src/constants/qidian-recommend.json";
const ROOT_RECOMEND_FILE = "qidian-recommend.json"; // 页面"导出推荐"下载后放到项目根目录

function run(cmd, opts = {}) {
	console.log(`\n> ${cmd}`);
	return execSync(cmd, { stdio: "inherit", ...opts });
}

/** 生成提交信息：YYYYMMDD_书架推送_N（N 为当天第几次推送，自动递增） */
function buildCommitMessage() {
	const now = new Date();
	const ymd = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, "0"),
		String(now.getDate()).padStart(2, "0"),
	].join("");

	// 统计当天已有的"书架推送"提交数
	let count = 0;
	try {
		const log = execSync('git log --format="%s" --since=midnight').toString();
		count = (log.match(/书架推送/g) || []).length;
	} catch {
		/* git log 失败时按 0 计 */
	}

	return `${ymd}_书架推送_${count + 1}`;
}

/** 合并页面导出的推荐列表到 src/constants/qidian-recommend.json */
function mergeRecommendFile() {
	const rootPath = path.join(process.cwd(), ROOT_RECOMEND_FILE);
	if (!fs.existsSync(rootPath)) {
		console.log("\n未找到根目录的 qidian-recommend.json（如需持久化推荐：页面点「导出推荐」→ 下载文件放到项目根目录）");
		return false;
	}

	try {
		const exported = JSON.parse(fs.readFileSync(rootPath, "utf8"));
		const exportedList = Array.isArray(exported?.recommended) ? exported.recommended : [];

		let currentList = [];
		if (fs.existsSync(RECOMMEND_FILE)) {
			const current = JSON.parse(fs.readFileSync(RECOMMEND_FILE, "utf8"));
			currentList = Array.isArray(current?.recommended) ? current.recommended : [];
		}

		// 合并去重
		const merged = [...new Set([...currentList, ...exportedList])];
		fs.writeFileSync(
			RECOMMEND_FILE,
			JSON.stringify({ recommended: merged }, null, "\t"),
			"utf8",
		);
		console.log(`✅ 推荐列表已合并：${currentList.length} -> ${merged.length} 个`);
		// 合并后删除根目录的临时文件
		fs.rmSync(rootPath, { force: true });
		console.log("已清理根目录的 qidian-recommend.json");
		return true;
	} catch (e) {
		console.log("推荐合并失败（跳过）：", e instanceof Error ? e.message : e);
		return false;
	}
}

try {
	// 0. 合并页面导出的推荐文件（如果有）
	mergeRecommendFile();

	// 1. 抓取书架（交互模式：会弹出浏览器窗口，需登录起点；有登录态则免登录）
	run("npx tsx scripts/fetch-qidian-bookshelf.ts");

	// 2. 检查数据是否有变化
	const status = execSync(
		`git status --porcelain "${BOOKSHELF_FILE}" "${RECOMMEND_FILE}"`,
	).toString().trim();

	if (status) {
		const commitMsg = buildCommitMessage();
		console.log(`\n提交信息：${commitMsg}`);
		run(`git add "${BOOKSHELF_FILE}" "${RECOMMEND_FILE}"`);
		run(`git commit -m "${commitMsg}"`);
	} else {
		console.log("\n数据无变化，跳过提交");
	}

	// 3. 推送（触发平台自动部署）
	run("git push");
	console.log("\n✅ 已推送，等待部署平台自动构建部署。");
} catch (err) {
	console.error("\n更新失败：", err instanceof Error ? err.message : err);
	process.exit(1);
}
