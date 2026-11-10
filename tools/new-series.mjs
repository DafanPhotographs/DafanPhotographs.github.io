#!/usr/bin/env node
/**
 * 大樊摄影站 · 一键新增系列（本地 CLI）
 *
 * 用法示例：
 *   node tools/new-series.mjs --dir ~/Desktop/新系列 --dry-run
 *   node tools/new-series.mjs --dir ~/Desktop/新系列 --upload
 *   node tools/new-series.mjs --dir ~/Desktop/新系列 --upload --commit
 *   node tools/new-series.mjs --remove test-series --dry-run
 *
 * 目录结构（--dir 指向的文件夹）：
 *   01.jpg 02.jpg 03.jpg ...      照片（按文件名自然排序，第 1 张成为封面）
 *   meta.json                     可选：slug / 分类 / 年份 / 中英标题与描述
 *
 * 密钥：只从仓库根目录 .env 读取（已加入 .gitignore），或从环境变量读取：
 *   CLOUDINARY_CLOUD_NAME=no7rdn4w
 *   CLOUDINARY_UPLOAD_PRESET=dafan_unsigned
 *
 * 本脚本不会自动 push；--commit 只做本地提交。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const core = require("./lib/dafan-core.js");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      if (["dry-run", "upload", "mock-upload", "commit", "help", "full-diff", "sync"].includes(key)) {
        args[key] = true;
      } else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`参数 --${key} 缺少取值`);
        }
        args[key] = value;
        i++;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function usage() {
  console.log(`大樊摄影站 · 一键新增系列

用法：
  node tools/new-series.mjs --dir <照片文件夹> [选项]

必填：
  --dir <路径>          照片 + meta.json 所在文件夹（第 1 张为封面）

常用选项：
  --dry-run             只打印将产生的 diff，不写入文件
  --upload              用 Cloudinary unsigned preset 上传照片
  --mock-upload         不上传，按约定生成 Cloudinary URL（本地预览用）
  --commit              写入后执行本地 git add + git commit（不 push）
  --repo <路径>          仓库根目录（默认本脚本所在仓库）
  --plan-out <文件>      把「将写入的文件」保存为 JSON（供测试/后台页比对）
  --full-diff           打印完整 diff（默认每个文件最多 120 行）
  --sync                只做站点同步/首次迁移，不新增也不删除系列
  --remove <slug>       删除一个系列（清理该系列页 + 所有引用）
  --help                显示帮助

密钥（二选一）：
  .env 文件（推荐，已在 .gitignore）：
    CLOUDINARY_CLOUD_NAME=no7rdn4w
    CLOUDINARY_UPLOAD_PRESET=dafan_unsigned
  或同名环境变量。

操作手册见仓库根目录 tools/README.md 与工作区 dafan-content-workflow/REPORT.md。
`);
}

function loadDotEnv(repoRoot) {
  const file = path.join(repoRoot, ".env");
  const out = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, "utf8");
    text.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx < 0) return;
      out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    });
  }
  ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_UPLOAD_PRESET"].forEach((key) => {
    if (process.env[key]) out[key] = process.env[key];
  });
  return out;
}

const SITE_FILES = [
  core.FILE_PATHS.seriesJson,
  core.FILE_PATHS.i18n,
  core.FILE_PATHS.worksIndex,
  core.FILE_PATHS.photographyIndex,
  core.FILE_PATHS.homeIndex
];

function readSiteFiles(repoRoot, data) {
  const files = {};
  const paths = SITE_FILES.slice();
  data.series.forEach((series) => {
    paths.push(core.FILE_PATHS.seriesPage(series.slug));
  });
  for (const rel of paths) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) files[rel] = fs.readFileSync(abs, "utf8");
  }
  return files;
}

function naturalSort(names) {
  return names.slice().sort((a, b) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" }));
}

function readPhotos(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const photos = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (entry.name.startsWith(".")) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    photos.push(entry.name);
  }
  return naturalSort(photos);
}

function buildSpecFromDir(dir, meta, options) {
  const photoFiles = readPhotos(dir);
  if (!photoFiles.length) {
    throw new Error(`文件夹里没有照片（支持 ${[...IMAGE_EXT].join(" / ")}）：${dir}`);
  }
  const ordered = Array.isArray(meta.frames) && meta.frames.length ? meta.frames : photoFiles;
  ordered.forEach((name) => {
    if (!photoFiles.includes(name)) throw new Error(`meta.json 里指定的照片不存在：${name}`);
  });
  const names = core.frameNames(ordered.length);
  const frames = ordered.map((name, index) => {
    const buffer = fs.readFileSync(path.join(dir, name));
    const size = core.imageSize(buffer) || {};
    const override = (meta.sizes && meta.sizes[name]) || {};
    const width = override.width || size.width || null;
    const height = override.height || size.height || null;
    if (options.upload && !size.width) {
      console.warn(`  ⚠ 读不出 ${name} 的像素尺寸，请确认它是 JPG/PNG/WebP；已用 2400×1600 兜底`);
    }
    return { name: names[index], width, height, file: path.join(dir, name) };
  });
  return {
    spec: {
      slug: meta.slug,
      category: meta.category,
      categoryLabel: meta.categoryLabel,
      year: meta.year,
      title: meta.title,
      copy: meta.copy,
      alt: meta.alt,
      publicPrefix: meta.publicPrefix || "dafan/series/" + meta.slug,
      frames
    },
    photoFiles: ordered
  };
}

function resolveCategory(spec, data) {
  const key = spec.category;
  if (!key) throw new Error("meta.json 缺少 category（例如 travel / landscape）");
  const label = spec.categoryLabel || (data.categories[key] ? null : null);
  return { key, zh: (label && label.zh) || "", en: (label && label.en) || "" };
}

async function uploadToCloudinary({ env, repoRoot, spec, data, dryRun }) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME || data.cloudName;
  const preset = env.CLOUDINARY_UPLOAD_PRESET;
  if (!preset) {
    throw new Error(
      "缺少 CLOUDINARY_UPLOAD_PRESET。请在仓库根目录 .env 里配置 unsigned preset（见 .env.example），" +
        "或改用 --mock-upload / 先在 Cloudinary 网页后台上传。"
    );
  }
  if (!cloudName) throw new Error("缺少 Cloudinary cloud name");
  const folder = spec.publicPrefix;
  console.log(`\n☁ Cloudinary 上传：cloud=${cloudName} preset=${preset} folder=${folder}`);
  const results = [];
  for (const frame of spec.frames) {
    const buffer = fs.readFileSync(frame.file);
    const ext = path.extname(frame.file).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), path.basename(frame.file));
    form.append("upload_preset", preset);
    form.append("folder", folder);
    form.append("public_id", frame.name);
    if (dryRun) {
      console.log(`  [dry-run] 将上传 ${frame.file} -> ${folder}/${frame.name}`);
      results.push({ frame: frame.name, url: "(dry-run)" });
      continue;
    }
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: form
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = body && body.error ? body.error.message : JSON.stringify(body);
      throw new Error(`Cloudinary 上传失败（${res.status}）：${detail}`);
    }
    results.push({ frame: frame.name, url: body.secure_url, publicId: body.public_id });
    console.log(`  ✓ ${path.basename(frame.file)} -> ${body.secure_url}`);
  }
  return results;
}

function unifiedDiff(before, after, relPath, maxLines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dafan-diff-"));
  const beforePath = path.join(dir, "before");
  const afterPath = path.join(dir, "after");
  fs.writeFileSync(beforePath, before || "");
  fs.writeFileSync(afterPath, after || "");
  const res = spawnSync("diff", ["-u", "--label", before ? "a/" + relPath : "/dev/null", "--label", "b/" + relPath, beforePath, afterPath], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  fs.rmSync(dir, { recursive: true, force: true });
  if (res.error) {
    // 没有 diff 命令时退化为行数统计
    const counts = core.countLineDiff(before, after);
    return `--- a/${relPath}\n+++ b/${relPath}\n（系统无 diff 命令，仅统计：+${counts.added} / -${counts.removed} 行）\n`;
  }
  const lines = (res.stdout || "").split("\n");
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join("\n") + `\n… （diff 过长，已截断；共 ${lines.length} 行）\n`;
  }
  return res.stdout || "";
}

function printPlan(plan, options) {
  if (!plan.writes.length && !plan.deletions.length) {
    console.log("\n✓ 数据已是最新，没有需要写入的文件。");
    return;
  }
  console.log("\n将产生以下改动：\n");
  for (const write of plan.writes) {
    const counts = core.countLineDiff(write.before || "", write.content);
    console.log(`  ${write.action === "create" ? "＋ 新建" : "✱ 修改"} ${write.path}  (+${counts.added} / -${counts.removed} 行)`);
  }
  for (const del of plan.deletions) {
    console.log(`  － 删除 ${del}`);
  }
  const full = options["full-diff"];
  const maxLines = full ? 100000 : 120;
  console.log("");
  for (const write of plan.writes) {
    const diff = unifiedDiff(write.before, write.content, write.path, maxLines);
    if (diff.trim()) process.stdout.write(diff);
  }
}

function writePlan(plan, repoRoot) {
  for (const write of plan.writes) {
    const abs = path.join(repoRoot, write.path);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, write.content);
  }
  for (const del of plan.deletions) {
    const abs = path.join(repoRoot, del);
    if (fs.existsSync(abs)) {
      fs.rmSync(abs);
      const dir = path.dirname(abs);
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    }
  }
}

function gitCommit(repoRoot, plan, spec) {
  const paths = plan.writes.map((w) => w.path).concat(plan.deletions);
  const add = spawnSync("git", ["add", "-A", "--", ...paths], { cwd: repoRoot, encoding: "utf8" });
  if (add.status !== 0) throw new Error("git add 失败：" + (add.stderr || ""));
  const title = spec && spec.title ? `${spec.title.zh} / ${spec.title.en}` : "series";
  const message = spec ? `feat(series): add ${spec.slug} — ${title}` : "chore(series): sync series data";
  const commit = spawnSync("git", ["commit", "-m", message], { cwd: repoRoot, encoding: "utf8" });
  if (commit.status !== 0) {
    throw new Error("git commit 失败：" + (commit.stdout || "") + (commit.stderr || ""));
  }
  console.log("\n✓ 已在本地提交：" + message);
  console.log("  部署方式：git push（或在你习惯的 Git 客户端里推送 main）。本工具不会自动 push。");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const repoRoot = path.resolve(args.repo || path.join(__dirname, ".."));
  const env = loadDotEnv(repoRoot);
  const seriesJsonPath = path.join(repoRoot, core.FILE_PATHS.seriesJson);
  if (!fs.existsSync(seriesJsonPath)) throw new Error("看起来不是站点仓库：" + repoRoot);
  const baseData = core.parseSeriesJson(fs.readFileSync(seriesJsonPath, "utf8"));
  const files = readSiteFiles(repoRoot, baseData);

  let spec = null;
  if (args.sync) {
    console.log("\n🔄 仅同步站点（首次安装会写入区块标记并迁移旧 i18n 词条）");
  } else if (args.remove) {
    console.log(`\n🗑 删除系列：${args.remove}`);
  } else {
    if (!args.dir) {
      usage();
      throw new Error("缺少 --dir <照片文件夹>（或使用 --sync / --remove <slug>）");
    }
    const dir = path.resolve(args.dir);
    if (!fs.existsSync(dir)) throw new Error("照片文件夹不存在：" + dir);
    let meta = {};
    const metaPath = path.join(dir, "meta.json");
    if (fs.existsSync(metaPath)) {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      console.log(`\n📄 读取 ${metaPath}`);
    } else {
      console.log("\n⚠ 没有找到 meta.json，将只根据文件夹名生成 slug（建议补 meta.json 填中英标题/描述）");
      meta.slug = meta.slug || core.slugify(path.basename(dir));
    }
    const built = buildSpecFromDir(dir, meta, { upload: !!args.upload });
    spec = built.spec;
    const category = resolveCategory(spec, baseData);
    spec.category = category.key;
    spec.categoryLabel = category.zh || category.en ? category : undefined;
    if (spec.categoryLabel) {
      spec.categoryLabel = { zh: category.zh || category.key, en: category.en || category.zh || category.key };
    }
    console.log(`\n📷 ${built.photoFiles.length} 张照片：${built.photoFiles.join(", ")}`);
    console.log(`   slug=${spec.slug}  year=${spec.year}  category=${spec.category}  标题=${spec.title.zh} / ${spec.title.en}`);

    if (args.upload) {
      await uploadToCloudinary({ env, repoRoot, spec, data: baseData, dryRun: !!args["dry-run"] });
    } else {
      console.log("\n⚠ 未上传图片：本次按约定生成 Cloudinary 图片 URL（dafan/series/" + spec.slug + "/...）。");
      console.log("  请确认图片已上传到 Cloudinary，或加 --upload 使用 unsigned preset 自动上传。");
    }
  }

  const planOptions = args.remove ? { remove: args.remove } : args.sync ? {} : { add: spec };
  const plan = core.planSiteSync(files, planOptions);
  plan.notes.forEach((note) => console.log("• " + note));

  if (args["plan-out"]) {
    fs.writeFileSync(path.resolve(args["plan-out"]), JSON.stringify({ writes: plan.writes, deletions: plan.deletions, notes: plan.notes }, null, 2));
    console.log("\n已保存计划：" + path.resolve(args["plan-out"]));
  }

  printPlan(plan, args);

  if (args["dry-run"]) {
    console.log("\n（--dry-run：未写入任何文件）\n");
    return;
  }

  writePlan(plan, repoRoot);
  console.log("\n✓ 已写入 " + plan.writes.length + " 个文件" + (plan.deletions.length ? "，删除 " + plan.deletions.length + " 个" : ""));

  if (args.commit) {
    gitCommit(repoRoot, plan, spec);
  } else {
    console.log("\n下一步：");
    if (spec) {
      console.log("  python3 -m http.server 8080   # 本地预览 http://127.0.0.1:8080/works/" + spec.slug + "/");
    } else {
      console.log("  python3 -m http.server 8080   # 本地检查页面");
    }
    var changeLabel = spec ? "add " + spec.slug : args.remove ? "remove " + args.remove : "sync series data";
    console.log("  git add -A && git commit -m 'feat(series): " + changeLabel + "'");
    console.log("  git push");
  }
}

main().catch((error) => {
  console.error("\n✗ " + error.message + "\n");
  process.exit(1);
});
