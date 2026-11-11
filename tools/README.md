# tools/ — 单张照片后台

站点现在以**单张照片**为单位：照片、标题、描述、地点都在 `data/photos.json` 里，摄影页和首页在浏览器里读取它渲染。

| 文件 | 作用 |
| --- | --- |
| `admin.html` | 照片后台：拖拽上传、编辑标题/描述/地点、删除、首页精选 |
| `start-admin.command` | 双击启动本地静态服务并打开后台（也可以直接访问线上 `/tools/admin.html`） |
| `sw.js` | PWA 离线壳；后台页面 network-first，发版后自动更新 |
| `manifest.webmanifest` + 图标 | 安装到程序坞 |

## 数据模型

```json
{
  "cloudName": "no7rdn4w",
  "locations": { "bipenggou": { "zh": "毕棚沟", "en": "Bipenggou" } },
  "featured": ["bipenggou-cover", "emeishan-cover", "qingdao-cover"],
  "photos": [
    {
      "id": "bipenggou-cover",
      "publicId": "dafan/series/bipenggou/cover",
      "width": 2400,
      "height": 1600,
      "location": "bipenggou",
      "title": { "zh": "毕棚沟 · 01", "en": "Bipenggou · 01" },
      "copy": { "zh": "…", "en": "…" },
      "alt": { "zh": "…", "en": "…" }
    }
  ]
}
```

- `locations`：地点/分类（以后加“旅游地点”就加这里）。
- `featured`：首页三屏的照片 id，按顺序。
- `photos`：所有照片；`publicId` 是 Cloudinary 的 public id（不带扩展名）。

## 日常使用

1. 打开 `https://dafanphotographs.github.io/tools/admin.html`（或双击 `start-admin.command`）。
2. 「配置」里填 Cloudinary **unsigned preset** 和 GitHub **fine-grained PAT**（Contents: Read and write），保存。
3. 「新增照片」拖入照片（可多张），逐张填标题/描述/地点。
4. 「现有照片」可直接改文字/地点，或删除。
5. 「首页精选」选 1–5 张（至少 1 张）。
6. 点「上传并发布」：上传 Cloudinary + 提交 `data/photos.json`，1–2 分钟后线上生效。

## 注意

- **删除只从网站移除**，Cloudinary 原图不会删除；需要到 Cloudinary 控制台 Media Library 手动删。
- 没有 PAT 时可以用「下载 photos.json」把文件替换进仓库后自己 commit/push。
- 上传需要 unsigned preset；没有配置时发布会先报错，不会产生半成品。
- 首页/摄影页是读取 `data/photos.json` 动态渲染的，所以发布只需要更新这一个 JSON，不需要再生成 HTML。
- 旧版系列页 `/works/<slug>/` 已删除，`/works/` 会重定向到 `/photography/`。
