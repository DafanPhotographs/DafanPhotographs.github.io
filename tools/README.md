# tools/ — 新增系列的本地工具

这两个工具只做「生成/上传/提交」，不改变站点的纯静态结构；GitHub Pages 仍然是把仓库根目录原样发布。

| 文件 | 作用 |
| --- | --- |
| `admin.html` | 浏览器发布后台：拖照片、填中英文字、预览、下载 ZIP 或直接提交 GitHub |
| `start-admin.command` | 双击启动 `python3 -m http.server` 并打开后台页 |
| `new-series.mjs` | Node CLI（同样的事，命令行版；可打印 diff、可选本地提交） |
| `lib/dafan-core.js` | 两个宿主共用的纯函数生成核心（无依赖） |
| `../data/series.json` | **唯一数据源**：slug / 分类 / 年份 / 中英标题与描述 / 帧列表 |
| `../.env.example` | Cloudinary unsigned preset 的配置模板（复制成 `.env`） |

## 站主日常（推荐：浏览器后台）

1. 在 Finder 里双击 `tools/start-admin.command`（或终端里 `cd 仓库 && python3 -m http.server 8080`）。
2. 浏览器打开 <http://127.0.0.1:8080/tools/admin.html>。
3. 首次使用：点开「配置」，填 Cloudinary cloud name + unsigned preset，可选填 GitHub PAT，点保存（只存本机浏览器）。
4. 从 Lightroom 导出 JPG（长边 2400px、sRGB）到桌面文件夹。
5. 把 JPG 拖进后台 → 填 slug / 分类 / 年份 / 中英标题与描述 → 「生成文件并预览」。
6. 两种提交方式：
   - **发布到 GitHub**（需要 PAT）：自动上传 Cloudinary + 一次提交所有文件，1–2 分钟后线上更新；
   - **下载 ZIP**：把 ZIP 解压到仓库根目录，自己 `git add/commit/push`。
7. 图片也可以先在 Cloudinary 网页后台上传到 `dafan/series/<slug>/`（cover/02/03...），在后台勾「图片已手动上传」即可跳过自动上传。

## 命令行版

```bash
# 只预览将产生的 diff
node tools/new-series.mjs --dir ~/Desktop/新系列 --dry-run

# 已有 .env（或想手动传图）→ 直接生成文件
node tools/new-series.mjs --dir ~/Desktop/新系列

# 自动上传 Cloudinary + 本地 git 提交（不 push）
node tools/new-series.mjs --dir ~/Desktop/新系列 --upload --commit

# 删除一个系列（会同步所有引用；图片需自行在 Cloudinary 删）
node tools/new-series.mjs --remove old-slug --dry-run
```

`--dir` 文件夹里放 `01.jpg 02.jpg 03.jpg ...`，可选 `meta.json`：

```json
{
  "slug": "new-series",
  "category": "travel",
  "year": "2025",
  "title": { "zh": "中文标题", "en": "English Title" },
  "copy": { "zh": "中文描述", "en": "English description" },
  "alt": { "zh": "封面 alt 中文", "en": "Cover alt English" }
}
```

## 安装（一次性）

工具的「首次运行」会做一次幂等迁移：给 `works/index.html`、`photography/index.html`、`index.html` 加区块标记，把旧的 `sN.*` 词条换成 `series.<slug>.*`，并把系列文案搬进 `data/series.json`。之后每次新增系列只动内容和新增文件。

```bash
node tools/new-series.mjs --sync        # 只做迁移/同步，不加新系列
```

## 注意

- `.env` 已在 `.gitignore` 中；不要把 Cloudinary API secret 或 GitHub PAT 写进任何提交。
- Cloudinary **unsigned preset** 只需要「允许 unsigned 上传」，不要用 API key/secret。
- 后台页面的 GitHub PAT 需要 fine-grained token 的 **Contents: Read and write** 权限，只作用于这一个仓库。
- 本工具不会自动 push；CI 的 `npm run test:qa` 与新工具互不影响。
- `works/<slug>/index.html` 会基于现有系列页外壳重新生成，所以页头/页脚改动只需改在任意一个现有系列页上（工具会从第一个现有系列页取外壳）。
