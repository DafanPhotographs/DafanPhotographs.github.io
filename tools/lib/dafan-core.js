/**
 * DaFan 内容工作流 —— 纯函数生成核心（无依赖，浏览器 / Node 通用）
 *
 * 设计目标：
 *   - `data/series.json` 成为系列的唯一数据源（slug / 分类 / 年份 / 双语标题 / 双语描述 / 帧列表）；
 *   - 由核心函数重新生成：各系列页正文、作品列表卡片、摄影页卡片、首页结尾链接、i18n 词条；
 *   - 所有操作幂等：同一份数据重复运行不会产生新改动；
 *   - 浏览器后台页 tools/admin.html 与 Node CLI tools/new-series.mjs 共用这一份逻辑。
 *
 * 这份文件不读写文件系统、不发网络请求，宿主负责读写。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DaFanCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SITE_NAME = "大樊 / DaFan";
  var CARD_W = 2400;
  var CARD_H = 1500;
  var DEFAULT_SERIES_W = 2400;
  var DEFAULT_SERIES_H = 1600;

  var CARD_INDENT = "      ";
  var FILTER_INDENT = "    ";
  var HOME_LINKS_INDENT = "              ";
  var I18N_INDENT = "      ";

  var FILE_PATHS = {
    seriesJson: "data/series.json",
    i18n: "assets/js/i18n.js",
    worksIndex: "works/index.html",
    photographyIndex: "photography/index.html",
    homeIndex: "index.html",
    seriesPage: function (slug) {
      return "works/" + slug + "/index.html";
    }
  };

  // ---------------------------------------------------------------------------
  // 基础工具
  // ---------------------------------------------------------------------------

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function pad2(n) {
    return (n < 10 ? "0" : "") + n;
  }

  var ZH_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  var EN_NUM = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

  function numberWord(n, lang) {
    if (lang === "zh") return ZH_NUM[n] || String(n);
    return EN_NUM[n] || String(n);
  }

  /** 「N 个系列，以途为序。」随系列数量自动更新 */
  function autoWorkLede(count, lang) {
    if (lang === "zh") return numberWord(count, "zh") + "个系列，以途为序。";
    return numberWord(count, "en") + " series, ordered by the road.";
  }

  /** 文件名 -> slug（仅 ASCII；中文标题请手填 slug） */
  function slugify(text) {
    return String(text || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function isValidSlug(slug) {
    return /^[a-z0-9][a-z0-9-]*$/.test(String(slug || ""));
  }

  /** 帧命名约定：cover, 02, 03, 04 ... */
  function frameNames(count) {
    var names = ["cover"];
    for (var i = 2; i <= count; i++) names.push(pad2(i));
    return names;
  }

  function isPortrait(size) {
    return !!(size && size.width && size.height && size.height > size.width);
  }

  function frameAltText(series, index, lang) {
    // index 从 1 开始
    var total = series.frames.length;
    if (lang === "zh") return "系列作品，第 " + index + " 张";
    return "Series photograph " + index + " of " + total;
  }

  function cloudinarySeriesUrl(data, series, frameName) {
    return (
      "https://res.cloudinary.com/" +
      data.cloudName +
      "/image/upload/f_auto,q_auto/" +
      series.publicPrefix +
      "/" +
      frameName +
      ".jpg"
    );
  }

  function cloudinaryCardUrl(data, series) {
    return (
      "https://res.cloudinary.com/" +
      data.cloudName +
      "/image/upload/c_fill,g_auto,ar_16:10,w_2400,f_auto,q_auto/" +
      series.publicPrefix +
      "/cover.jpg"
    );
  }

  /** 从 JPEG / PNG / WebP(VP8X) 字节里读尺寸；读不出返回 null */
  function imageSize(input) {
    var bytes;
    if (input instanceof Uint8Array) bytes = input;
    else if (input && input.buffer instanceof ArrayBuffer) bytes = new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength);
    else if (input instanceof ArrayBuffer) bytes = new Uint8Array(input);
    else return null;
    if (bytes.length < 24) return null;

    // JPEG
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      var i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++;
          continue;
        }
        var marker = bytes[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        var len = (bytes[i + 2] << 8) | bytes[i + 3];
        var isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSof) {
          return {
            width: (bytes[i + 7] << 8) | bytes[i + 8],
            height: (bytes[i + 5] << 8) | bytes[i + 6]
          };
        }
        if (len <= 0) break;
        i += 2 + len;
      }
      return null;
    }

    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
      return {
        width: be32(bytes, 16),
        height: be32(bytes, 20)
      };
    }

    // WebP (VP8X)
    if (
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    ) {
      var fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (fourcc === "VP8X") {
        return {
          width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
          height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16))
        };
      }
    }
    return null;
  }

  function be32(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  // ---------------------------------------------------------------------------
  // data/series.json
  // ---------------------------------------------------------------------------

  function parseSeriesJson(text) {
    var data = JSON.parse(text);
    data.cloudName = data.cloudName || "";
    data.categories = data.categories || {};
    data.series = data.series || [];
    return data;
  }

  function serializeSeriesJson(data) {
    var out = {
      cloudName: data.cloudName,
      categories: data.categories,
      series: data.series
    };
    if (data.workLede) out.workLede = data.workLede;
    return JSON.stringify(out, null, 2) + "\n";
  }

  function normalizeFrame(frame, index) {
    if (typeof frame === "string") {
      return {
        name: frame,
        width: null,
        height: null
      };
    }
    var name = frame.name || frame.publicId || frameNames(index + 1)[index];
    return {
      name: name,
      width: frame.width || frame.w || null,
      height: frame.height || frame.h || null
    };
  }

  function normalizeSeriesEntry(entry, index) {
    var series = {
      slug: entry.slug,
      category: entry.category || "landscape",
      publicPrefix: entry.publicPrefix || "dafan/series/" + entry.slug,
      frames: (entry.frames || []).map(normalizeFrame),
      year: entry.year || "",
      title: entry.title || {},
      copy: entry.copy || {},
      alt: entry.alt || {}
    };
    if (!series.frames.length) {
      series.frames = frameNames(4).map(function (name) {
        return { name: name, width: null, height: null };
      });
    }
    return series;
  }

  // ---------------------------------------------------------------------------
  // assets/js/i18n.js
  // ---------------------------------------------------------------------------

  function findMatchingBrace(text, openIndex) {
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = openIndex; i < text.length; i++) {
      var ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /** 解析 i18n.js 的 dict 对象（只处理扁平的 "key": "value" 形式） */
  function parseI18n(source) {
    var marker = "const dict = ";
    var markerIndex = source.indexOf(marker);
    if (markerIndex < 0) throw new Error("assets/js/i18n.js 中未找到 `const dict = `");
    var openIndex = source.indexOf("{", markerIndex);
    var closeIndex = findMatchingBrace(source, openIndex);
    if (closeIndex < 0) throw new Error("assets/js/i18n.js 的 dict 大括号不匹配");

    var dictText = source.slice(openIndex, closeIndex + 1);
    var result = { zh: [], en: [] };
    var keys = Object.keys(result);
    var langPositions = [];
    var re = /(?:^|\n)\s*(zh|en)\s*:\s*\{/g;
    var match;
    while ((match = re.exec(dictText))) {
      langPositions.push({ lang: match[1], open: dictText.indexOf("{", match.index) });
    }
    if (langPositions.length < 2) throw new Error("assets/js/i18n.js 中未找到 zh / en 两套词条");
    langPositions.forEach(function (pos) {
      var end = findMatchingBrace(dictText, pos.open);
      var body = dictText.slice(pos.open + 1, end);
      result[pos.lang] = parseEntries(body);
    });
    keys = null;
    return {
      dict: result,
      dictStart: openIndex,
      dictEnd: closeIndex + 1
    };
  }

  function parseEntries(body) {
    var entries = [];
    var lines = body.split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      if (line.indexOf("//") === 0 || line.indexOf("/*") === 0 || line.indexOf("*") === 0) continue;
      var m = line.match(/^("(?:[^"\\]|\\.)*")\s*:\s*("(?:[^"\\]|\\.)*")\s*,?$/);
      if (!m) continue;
      try {
        entries.push({ key: JSON.parse(m[1]), value: JSON.parse(m[2]) });
      } catch (e) {
        /* 跳过无法解析的行 */
      }
    }
    return entries;
  }

  function entryMap(entries) {
    var map = {};
    entries.forEach(function (entry) {
      map[entry.key] = entry.value;
    });
    return map;
  }

  function isGeneratedKey(key) {
    return (
      /^s\d+\./.test(key) ||
      /^series\.alt\./.test(key) ||
      /^home\.alt\./.test(key) ||
      key === "work.lede" ||
      /^work\.filter\./.test(key) ||
      /^series\.[a-z0-9-]+\.(title|year|cat|copy|alt\.\d+)$/.test(key)
    );
  }

  function buildSeriesI18nEntries(data) {
    var entries = [];
    var zh = [];
    var en = [];
    var ledeZh = data.workLede && data.workLede.zh ? data.workLede.zh : autoWorkLede(data.series.length, "zh");
    var ledeEn = data.workLede && data.workLede.en ? data.workLede.en : autoWorkLede(data.series.length, "en");

    zh.push(["work.lede", ledeZh]);
    en.push(["work.lede", ledeEn]);

    zh.push(["work.filter.all", "全部"]);
    en.push(["work.filter.all", "All"]);
    Object.keys(data.categories).forEach(function (key) {
      var label = data.categories[key] || {};
      zh.push(["work.filter." + key, label.zh || key]);
      en.push(["work.filter." + key, label.en || label.zh || key]);
    });

    data.series.forEach(function (series) {
      var cat = data.categories[series.category] || {};
      var alt = series.alt || {};
      zh.push(["home.alt." + series.slug, alt.zh || (series.title.zh || series.slug) + "系列作品封面"]);
      en.push(["home.alt." + series.slug, alt.en || (series.title.en || series.slug) + " series cover photograph"]);
      zh.push(["series." + series.slug + ".title", series.title.zh || series.slug]);
      en.push(["series." + series.slug + ".title", series.title.en || series.title.zh || series.slug]);
      zh.push(["series." + series.slug + ".year", String(series.year || "")]);
      en.push(["series." + series.slug + ".year", String(series.year || "")]);
      zh.push(["series." + series.slug + ".cat", cat.zh || series.category]);
      en.push(["series." + series.slug + ".cat", cat.en || cat.zh || series.category]);
      zh.push(["series." + series.slug + ".copy", series.copy.zh || series.copy.en || ""]);
      en.push(["series." + series.slug + ".copy", series.copy.en || series.copy.zh || ""]);
      series.frames.forEach(function (frame, index) {
        zh.push(["series." + series.slug + ".alt." + (index + 1), frameAltText(series, index + 1, "zh")]);
        en.push(["series." + series.slug + ".alt." + (index + 1), frameAltText(series, index + 1, "en")]);
      });
    });

    entries.push({ lang: "zh", list: zh });
    entries.push({ lang: "en", list: en });
    return entries;
  }

  function renderI18n(source, data) {
    var parsed = parseI18n(source);
    var generated = buildSeriesI18nEntries(data);
    var generatedMap = {};
    generated.forEach(function (group) {
      group.list.forEach(function (pair) {
        generatedMap[group.lang + "|" + pair[0]] = true;
      });
    });

    var dictText = "{\n";
    var langs = ["zh", "en"];
    var langOutputs = {};
    langs.forEach(function (lang) {
      var kept = parsed.dict[lang].filter(function (entry) {
        if (isGeneratedKey(entry.key) && generatedMap[lang + "|" + entry.key]) return false;
        // 旧版 sN.* / series.alt.* 一律移除
        if (/^s\d+\./.test(entry.key) || /^series\.alt\./.test(entry.key)) return false;
        return true;
      });
      var lines = kept.map(function (entry) {
        return { text: I18N_INDENT + JSON.stringify(entry.key) + ": " + JSON.stringify(entry.value), comma: true };
      });
      var group = generated.filter(function (g) {
        return g.lang === lang;
      })[0];
      var generatedLines = group.list.map(function (pair) {
        return { text: I18N_INDENT + JSON.stringify(pair[0]) + ": " + JSON.stringify(pair[1]), comma: true };
      });
      var block = [{ text: I18N_INDENT + "/* series:data:start — 由 tools/new-series.mjs 依据 data/series.json 生成，请勿手改 */", comma: false }]
        .concat(generatedLines)
        .concat([{ text: I18N_INDENT + "/* series:data:end */", comma: false }]);
      var all = lines.concat(block);
      // 只有「最后一个属性行」不带逗号；注释行不带逗号
      var lastEntry = -1;
      all.forEach(function (line, index) {
        if (line.comma) lastEntry = index;
      });
      all.forEach(function (line, index) {
        if (line.comma && index !== lastEntry) line.text = line.text + ",";
      });
      langOutputs[lang] = all.map(function (line) {
        return line.text;
      });
    });

    dictText +=
      "    zh: {\n" + langOutputs.zh.join("\n") + "\n    },\n" +
      "    en: {\n" + langOutputs.en.join("\n") + "\n    }\n  }";

    return source.slice(0, parsed.dictStart) + dictText + source.slice(parsed.dictEnd);
  }

  /** 旧版词条 -> 数据模型（首次运行时的迁移来源） */
  function readLegacySeriesMeta(files) {
    var sources = {};
    try {
      sources.i18n = parseI18n(files[FILE_PATHS.i18n]);
    } catch (e) {
      sources.i18n = null;
    }
    var zhMap = sources.i18n ? entryMap(sources.i18n.dict.zh) : {};
    var enMap = sources.i18n ? entryMap(sources.i18n.dict.en) : {};
    return {
      zh: zhMap,
      en: enMap
    };
  }

  // ---------------------------------------------------------------------------
  // 迁移：旧的 sN.* / i18n 词条 -> data/series.json 中的双语元数据
  // ---------------------------------------------------------------------------

  function extractFrameSizesFromHtml(html) {
    var sizes = {};
    var re = /<img\s[^>]*>/g;
    var match;
    while ((match = re.exec(html))) {
      var tag = match[0];
      var srcMatch = tag.match(/\bsrc="([^"]+)"/);
      if (!srcMatch) continue;
      var widthMatch = tag.match(/\bwidth="(\d+)"/);
      var heightMatch = tag.match(/\bheight="(\d+)"/);
      if (!widthMatch || !heightMatch) continue;
      var file = srcMatch[1].split("/").pop().split("?")[0];
      var frameName = file.replace(/\.[a-z0-9]+$/i, "");
      if (!sizes[frameName]) {
        sizes[frameName] = {
          width: parseInt(widthMatch[1], 10),
          height: parseInt(heightMatch[1], 10)
        };
      }
    }
    return sizes;
  }

  function legacyCategoryOrder(files) {
    var html = files[FILE_PATHS.worksIndex] || "";
    var order = [];
    var re = /data-filter="([^"]+)"/g;
    var match;
    while ((match = re.exec(html))) {
      if (match[1] !== "all" && order.indexOf(match[1]) < 0) order.push(match[1]);
    }
    return order;
  }

  /**
   * 确保系列数据完整：旧数据（只有 slug/category/publicPrefix/frames 字符串）从
   * i18n.js 与现有系列页补齐 title/copy/year/alt/尺寸/分类标签。
   */
  function migrateSeriesData(files) {
    var data = parseSeriesJson(files[FILE_PATHS.seriesJson]);
    var legacy = readLegacySeriesMeta(files);
    var legacyZh = legacy.zh;
    var legacyEn = legacy.en;
    var order = legacyCategoryOrder(files);
    var notes = [];
    var changed = false;

    // 分类顺序：以现有筛选按钮顺序为准，缺的补在后面
    var nextCategories = {};
    order.forEach(function (key) {
      nextCategories[key] = data.categories[key] || null;
    });
    Object.keys(data.categories).forEach(function (key) {
      if (!nextCategories.hasOwnProperty(key)) nextCategories[key] = data.categories[key];
    });

    data.series = data.series.map(function (raw, index) {
      var series = normalizeSeriesEntry(raw, index);
      var keyIndex = index + 1;

      if (!series.title.zh && legacyZh["s" + keyIndex + ".title"]) {
        series.title.zh = legacyZh["s" + keyIndex + ".title"];
      }
      if (!series.title.en && legacyEn["s" + keyIndex + ".title"]) {
        series.title.en = legacyEn["s" + keyIndex + ".title"];
      }
      if (!series.year && legacyZh["s" + keyIndex + ".year"]) {
        series.year = legacyZh["s" + keyIndex + ".year"];
      }
      if (!series.copy.zh && legacyZh["s" + keyIndex + ".copy"]) {
        series.copy.zh = legacyZh["s" + keyIndex + ".copy"];
      }
      if (!series.copy.en && legacyEn["s" + keyIndex + ".copy"]) {
        series.copy.en = legacyEn["s" + keyIndex + ".copy"];
      }
      if (!series.alt.zh && legacyZh["home.alt." + series.slug]) {
        series.alt.zh = legacyZh["home.alt." + series.slug];
      }
      if (!series.alt.en && legacyEn["home.alt." + series.slug]) {
        series.alt.en = legacyEn["home.alt." + series.slug];
      }

      // 分类标签：优先数据里的，否则从旧词条推导
      if (!nextCategories[series.category]) {
        nextCategories[series.category] = {
          zh: legacyZh["s" + keyIndex + ".cat"] || legacyZh["work.filter." + series.category] || series.category,
          en: legacyEn["s" + keyIndex + ".cat"] || legacyEn["work.filter." + series.category] || series.category
        };
      }

      // 帧尺寸：从现有系列页的 width/height 补
      var pagePath = FILE_PATHS.seriesPage(series.slug);
      if (files[pagePath] && series.frames.some(function (f) { return !f.width || !f.height; })) {
        var sizes = extractFrameSizesFromHtml(files[pagePath]);
        series.frames.forEach(function (frame) {
          if ((!frame.width || !frame.height) && sizes[frame.name]) {
            frame.width = sizes[frame.name].width;
            frame.height = sizes[frame.name].height;
          }
          if (!frame.width || !frame.height) {
            frame.width = DEFAULT_SERIES_W;
            frame.height = DEFAULT_SERIES_H;
          }
        });
      } else if (!files[pagePath]) {
        series.frames.forEach(function (frame) {
          if (!frame.width || !frame.height) {
            frame.width = DEFAULT_SERIES_W;
            frame.height = DEFAULT_SERIES_H;
          }
        });
      }

      var comparable = serializeSeriesJson({ cloudName: data.cloudName, categories: {}, series: [raw] });
      var normalized = serializeSeriesJson({ cloudName: data.cloudName, categories: {}, series: [series] });
      if (comparable !== normalized) changed = true;
      return series;
    });

    // 旧 work.lede 若与自动文案不同，则作为自定义文案保留
    var autoLede = autoWorkLede(data.series.length, "zh");
    if (!data.workLede && legacyZh["work.lede"] && legacyZh["work.lede"] !== autoLede) {
      data.workLede = {
        zh: legacyZh["work.lede"],
        en: legacyEn["work.lede"] || legacyZh["work.lede"]
      };
    }

    var categoriesChanged = JSON.stringify(data.categories) !== JSON.stringify(nextCategories);
    data.categories = nextCategories;

    return {
      data: data,
      changed: changed || categoriesChanged,
      notes: notes
    };
  }

  // ---------------------------------------------------------------------------
  // HTML 渲染
  // ---------------------------------------------------------------------------

  function renderMetaDescription(data, series) {
    var cat = data.categories[series.category] || {};
    return series.title.zh + " — " + SITE_NAME + " " + (cat.zh || series.category) + "摄影系列。";
  }

  function renderSeriesCard(data, series, options) {
    var hrefPrefix = options.hrefPrefix;
    var loading = options.index === 0 ? "eager" : "lazy";
    var title = series.title.zh || series.title.en || series.slug;
    var cat = data.categories[series.category] || {};
    return (
      CARD_INDENT + '<a class="series-card" href="' + hrefPrefix + series.slug + '/" data-category="' + escapeAttr(series.category) + '">\n' +
      CARD_INDENT + "  <div class=\"series-card-media\">\n" +
      CARD_INDENT + '    <img src="' + escapeAttr(cloudinaryCardUrl(data, series)) + '" alt="" data-i18n-alt="home.alt.' + series.slug + '" width="' + CARD_W + '" height="' + CARD_H + '" loading="' + loading + '" decoding="async" data-cloud-fallback />\n' +
      CARD_INDENT + "  </div>\n" +
      CARD_INDENT + "  <div class=\"series-card-meta\">\n" +
      CARD_INDENT + '    <h2 class="series-card-title" data-i18n="series.' + series.slug + '.title">' + escapeHtml(title) + "</h2>\n" +
      CARD_INDENT + '    <span class="series-card-year"><span data-i18n="series.' + series.slug + '.year">' + escapeHtml(series.year) + '</span> · <span data-i18n="series.' + series.slug + '.cat">' + escapeHtml(cat.zh || series.category) + "</span></span>\n" +
      CARD_INDENT + '    <span class="series-card-cta"><span data-i18n="card.view">查看</span> <span aria-hidden="true">→</span></span>\n' +
      CARD_INDENT + "  </div>\n" +
      CARD_INDENT + "</a>"
    );
  }

  function renderCardsBlock(data, options) {
    return data.series
      .map(function (series, index) {
        return renderSeriesCard(data, series, {
          hrefPrefix: options.hrefPrefix,
          index: index
        });
      })
      .join("\n");
  }

  function renderFiltersBlock(data) {
    var lines = [
      FILTER_INDENT + '<div class="filters" data-filter-root role="group" aria-label="Filter">',
      FILTER_INDENT + '  <button type="button" class="filter-btn is-active" data-filter="all" aria-pressed="true" data-i18n="work.filter.all">全部</button>'
    ];
    Object.keys(data.categories).forEach(function (key) {
      var label = data.categories[key] || {};
      lines.push(
        FILTER_INDENT + '  <button type="button" class="filter-btn" data-filter="' + escapeAttr(key) + '" aria-pressed="false" data-i18n="work.filter.' + key + '">' + escapeHtml(label.zh || key) + "</button>"
      );
    });
    lines.push(FILTER_INDENT + "</div>");
    return lines.join("\n");
  }

  function renderHomeSeriesLinks(data) {
    return data.series
      .map(function (series) {
        var title = series.title.zh || series.title.en || series.slug;
        return (
          HOME_LINKS_INDENT + '<a class="home-closing__link" href="./works/' + series.slug + '/"><span data-i18n="series.' + series.slug + '.title">' + escapeHtml(title) + '</span><span class="home-closing__arrow" aria-hidden="true">→</span></a>'
        );
      })
      .join("\n");
  }

  function renderSeriesMain(data, series) {
    var cat = data.categories[series.category] || {};
    var title = series.title.zh || series.title.en || series.slug;
    var intro = series.copy.zh || series.copy.en || "";
    var figures = series.frames
      .map(function (frame, index) {
        var narrow = index === 2 && series.frames.length >= 3 ? " series-figure--narrow" : "";
        var loading = index === 0 ? "eager" : "lazy";
        var sizeAttrs = frame.width && frame.height ? ' width="' + frame.width + '" height="' + frame.height + '"' : "";
        return (
          "      <figure class=\"series-figure" + narrow + "\">\n" +
          '        <img src="' + escapeAttr(cloudinarySeriesUrl(data, series, frame.name)) + '" alt="" data-i18n-alt="series.' + series.slug + ".alt." + (index + 1) + '"' + sizeAttrs + ' loading="' + loading + '" decoding="async" data-cloud-fallback />\n' +
          "      </figure>"
        );
      })
      .join("\n");

    return (
      '    <a class="back-link" href="../" data-i18n="series.back">← 作品</a>\n' +
      '    <header class="series-header">\n' +
      '      <h1 data-i18n="series.' + series.slug + '.title">' + escapeHtml(title) + "</h1>\n" +
      '      <p class="meta"><span data-i18n="series.' + series.slug + '.year">' + escapeHtml(series.year) + '</span> · <span data-i18n="series.' + series.slug + '.cat">' + escapeHtml(cat.zh || series.category) + "</span></p>\n" +
      "    </header>\n\n" +
      '    <p class="series-intro" data-i18n="series.' + series.slug + '.copy">' + escapeHtml(intro) + "</p>\n\n" +
      '    <div class="series-images">\n' +
      figures + "\n" +
      "    </div>"
    );
  }

  function extractShell(pageHtml) {
    var mainOpen = '<main class="site-main">';
    var mainClose = "</main>";
    var start = pageHtml.indexOf(mainOpen);
    var end = pageHtml.indexOf(mainClose, start);
    if (start < 0 || end < 0) throw new Error("系列页模板缺少 <main class=\"site-main\"> … </main>");
    return {
      prefix: pageHtml.slice(0, start),
      suffix: pageHtml.slice(end + mainClose.length)
    };
  }

  function updateHead(prefix, data, series) {
    var titleTag = "<title>" + escapeHtml(series.title.zh) + " / " + escapeHtml(series.title.en || series.title.zh) + " — " + SITE_NAME + "</title>";
    var descTag = '<meta name="description" content="' + escapeAttr(renderMetaDescription(data, series)) + '" />';
    var out = prefix
      .replace(/<title>[\s\S]*?<\/title>/, titleTag)
      .replace(/<meta name="description" content="[^"]*"\s*\/>/, descTag);
    return out;
  }

  function renderSeriesPage(data, series, shellPage, options) {
    var shell = extractShell(shellPage);
    return updateHead(shell.prefix, data, series) + '<main class="site-main">\n' + renderSeriesMain(data, series) + "\n  </main>" + shell.suffix;
  }

  // ---------------------------------------------------------------------------
  // 区块标记：一次性安装，之后按标记替换（幂等）
  // ---------------------------------------------------------------------------

  function blockMarkers(name, indent) {
    return {
      start: indent + "<!-- " + name + ":start -->",
      end: indent + "<!-- " + name + ":end -->"
    };
  }

  function syncBlock(content, name, body, indent, findRegion) {
    var markers = blockMarkers(name, indent);
    var startIdx = content.indexOf(markers.start);
    var endIdx = content.indexOf(markers.end);
    if (startIdx >= 0 && endIdx > startIdx) {
      var innerStart = startIdx + markers.start.length;
      return content.slice(0, innerStart) + "\n" + body + "\n" + content.slice(endIdx);
    }
    var region = findRegion(content);
    if (!region) throw new Error("无法定位区块 " + name + "，请检查对应 HTML 结构是否被改动");
    return (
      content.slice(0, region.start) +
      markers.start + "\n" +
      body + "\n" +
      markers.end +
      content.slice(region.end)
    );
  }

  function findCardsRegion(content) {
    var first = content.search(/^ {6}<a class="series-card"/m);
    var lastClose = content.lastIndexOf("\n      </a>");
    if (first < 0 || lastClose < first) throw new Error("未找到 series-card 卡片区块");
    return {
      start: first,
      end: lastClose + "\n      </a>".length
    };
  }

  function findFiltersRegion(content) {
    var match = content.match(/^ {4}<div class="filters"[^\n]*>/m);
    if (!match) throw new Error("未找到 filters 筛选按钮区块");
    var start = match.index;
    var close = content.indexOf("</div>", start);
    if (close < 0) throw new Error("filters 区块缺少 </div>");
    return {
      start: start,
      end: close + "</div>".length
    };
  }

  function findHomeLinksRegion(content) {
    var start = content.search(/^ {14}<a class="home-closing__link" href=/m);
    var muted = content.indexOf('<a class="home-closing__link home-closing__link--muted"');
    if (start < 0 || muted < start) throw new Error("未找到首页结尾系列链接区块");
    var beforeMuted = content.slice(0, muted);
    var lastClose = beforeMuted.lastIndexOf("</a>");
    return {
      start: start,
      end: lastClose + "</a>".length
    };
  }

  /** 旧 sN.* 词条 -> series.<slug>.*（仅首页精选位这类手工维护的片段需要） */
  function migrateLegacyKeys(html, data) {
    var order = data.series.map(function (s) {
      return s.slug;
    });
    return html.replace(/data-i18n(-aria)?="s(\d+)\.(title|year|cat|copy)"/g, function (whole, aria, index, prop) {
      var slug = order[parseInt(index, 10) - 1];
      if (!slug) return whole;
      return 'data-i18n' + (aria || "") + '="series.' + slug + "." + prop + '"';
    });
  }

  // ---------------------------------------------------------------------------
  // 主入口：根据数据同步整个站点
  // ---------------------------------------------------------------------------

  function validateSpec(spec) {
    var errors = [];
    if (!spec || !isValidSlug(spec.slug)) errors.push("slug 只能包含小写字母、数字和连字符，例如 test-series");
    if (typeof spec.category !== "string" || !spec.category.trim()) errors.push("缺少分类 category");
    if (!spec.title || (!spec.title.zh && !spec.title.en)) errors.push("标题至少需要中文或英文之一");
    if (!spec.frames || !spec.frames.length) errors.push("至少需要一张照片");
    return errors;
  }

  function normalizeSpec(data, rawSpec) {
    var spec = {
      slug: rawSpec.slug,
      category: String(rawSpec.category || "").trim(),
      categoryLabel: rawSpec.categoryLabel || null,
      year: String(rawSpec.year || new Date().getFullYear()),
      title: {
        zh: (rawSpec.title && rawSpec.title.zh) || "",
        en: (rawSpec.title && rawSpec.title.en) || ""
      },
      copy: {
        zh: (rawSpec.copy && rawSpec.copy.zh) || "",
        en: (rawSpec.copy && rawSpec.copy.en) || ""
      },
      alt: {
        zh: (rawSpec.alt && rawSpec.alt.zh) || "",
        en: (rawSpec.alt && rawSpec.alt.en) || ""
      },
      frames: (rawSpec.frames || []).map(function (frame, index) {
        return {
          name: frame.name || frameNames(rawSpec.frames.length)[index],
          width: frame.width || null,
          height: frame.height || null
        };
      }),
      publicPrefix: rawSpec.publicPrefix || "dafan/series/" + rawSpec.slug
    };
    if (!spec.title.zh) spec.title.zh = spec.title.en;
    if (!spec.title.en) spec.title.en = spec.title.zh;
    if (!spec.copy.zh) spec.copy.zh = spec.copy.en;
    if (!spec.copy.en) spec.copy.en = spec.copy.zh;
    if (!spec.alt.zh) spec.alt.zh = spec.title.zh + "系列作品封面";
    if (!spec.alt.en) spec.alt.en = (spec.title.en || spec.title.zh) + " series cover photograph";
    spec.frames.forEach(function (frame) {
      if (!frame.width || !frame.height) {
        frame.width = DEFAULT_SERIES_W;
        frame.height = DEFAULT_SERIES_H;
      }
    });
    return spec;
  }

  function upsertCategory(data, category) {
    if (!category || !category.key) return;
    if (!data.categories[category.key]) {
      data.categories[category.key] = {
        zh: category.zh || category.key,
        en: category.en || category.zh || category.key
      };
    } else if (category.zh || category.en) {
      data.categories[category.key] = {
        zh: category.zh || data.categories[category.key].zh,
        en: category.en || data.categories[category.key].en
      };
    }
  }

  function toSeriesEntry(spec) {
    return {
      slug: spec.slug,
      category: spec.category,
      publicPrefix: spec.publicPrefix,
      frames: spec.frames.map(function (frame) {
        return {
          name: frame.name,
          width: frame.width,
          height: frame.height
        };
      }),
      year: spec.year,
      title: spec.title,
      copy: spec.copy,
      alt: spec.alt
    };
  }

  /**
   * 核心计划函数。
   * @param {Object} files 当前站点文件内容 { "data/series.json": "...", ... }
   * @param {Object} options
   *   - add: 新系列 spec（可选）
   *   - remove: 要删除的 slug（可选）
   *   - templateSlug: 用哪个现有系列页当外壳模板（默认第一个有页面的系列）
   *   - dryRun: 只计算不写（本函数本来就不写，保留字段仅用于语义）
   * @returns {{writes: Array, deletions: Array, data: Object, notes: Array}}
   */
  function planSiteSync(files, options) {
    options = options || {};
    var notes = [];
    var migration = migrateSeriesData(files);
    var data = migration.data;
    if (migration.changed) notes.push("已将旧版 i18n 中的系列文案迁移到 data/series.json（一次性）");

    if (options.remove) {
      var removeSlug = options.remove;
      var beforeCount = data.series.length;
      data.series = data.series.filter(function (series) {
        return series.slug !== removeSlug;
      });
      if (data.series.length === beforeCount) throw new Error("要删除的系列不存在：" + removeSlug);
      notes.push("已从数据中移除系列 " + removeSlug);
    }

    if (options.add) {
      var spec = normalizeSpec(data, options.add);
      var errors = validateSpec(spec);
      if (errors.length) throw new Error(errors.join("；"));
      upsertCategory(data, {
        key: spec.category,
        zh: spec.categoryLabel && spec.categoryLabel.zh,
        en: spec.categoryLabel && spec.categoryLabel.en
      });
      var entry = toSeriesEntry(spec);
      var existingIndex = -1;
      data.series.forEach(function (series, index) {
        if (series.slug === spec.slug) existingIndex = index;
      });
      if (existingIndex >= 0) {
        data.series[existingIndex] = entry;
        notes.push("更新已有系列：" + spec.slug + "（顺序保持不变）");
      } else {
        data.series.push(entry);
        notes.push("新增系列：" + spec.slug + "（共 " + data.series.length + " 个系列）");
      }
    }

    // 模板外壳：优先取第一个已有系列页
    var shellSlug = options.templateSlug || null;
    if (!shellSlug) {
      for (var i = 0; i < data.series.length; i++) {
        if (files[FILE_PATHS.seriesPage(data.series[i].slug)]) {
          shellSlug = data.series[i].slug;
          break;
        }
      }
    }
    if (!shellSlug || !files[FILE_PATHS.seriesPage(shellSlug)]) {
      throw new Error("站点里至少需要一个现有的 works/<slug>/index.html 作为页面外壳模板");
    }
    var shellPage = files[FILE_PATHS.seriesPage(shellSlug)];

    var writes = [];
    function addWrite(path, content, action) {
      if (action === "create") {
        writes.push({ path: path, content: content, action: "create", before: null });
        return;
      }
      var before = files[path];
      if (before === undefined) {
        writes.push({ path: path, content: content, action: "create", before: null });
      } else if (before !== content) {
        writes.push({ path: path, content: content, action: "update", before: before });
      }
    }

    // 1) 数据文件
    addWrite(FILE_PATHS.seriesJson, serializeSeriesJson(data));

    // 2) i18n 词条
    addWrite(FILE_PATHS.i18n, renderI18n(files[FILE_PATHS.i18n], data));

    // 3) 每个系列页（全部从外壳模板重新生成，保证格式一致）
    data.series.forEach(function (series) {
      var page = renderSeriesPage(data, series, shellPage, options);
      addWrite(FILE_PATHS.seriesPage(series.slug), page);
    });

    // 4) 作品列表卡片 + 筛选按钮
    var worksHtml = files[FILE_PATHS.worksIndex];
    worksHtml = syncBlock(worksHtml, "series:cards", renderCardsBlock(data, { hrefPrefix: "./" }), CARD_INDENT, findCardsRegion);
    worksHtml = syncBlock(worksHtml, "series:filters", renderFiltersBlock(data), FILTER_INDENT, findFiltersRegion);
    addWrite(FILE_PATHS.worksIndex, worksHtml);

    // 5) 摄影页卡片
    var photographyHtml = files[FILE_PATHS.photographyIndex];
    photographyHtml = syncBlock(
      photographyHtml,
      "series:cards",
      renderCardsBlock(data, { hrefPrefix: "../works/" }),
      CARD_INDENT,
      findCardsRegion
    );
    addWrite(FILE_PATHS.photographyIndex, photographyHtml);

    // 6) 首页：结尾系列链接 + 精选位旧 key 迁移
    var homeHtml = files[FILE_PATHS.homeIndex];
    homeHtml = migrateLegacyKeys(homeHtml, data);
    homeHtml = syncBlock(homeHtml, "series:homeLinks", renderHomeSeriesLinks(data), HOME_LINKS_INDENT, findHomeLinksRegion);
    addWrite(FILE_PATHS.homeIndex, homeHtml);

    // 已删除系列的页面
    var deletions = [];
    if (options.remove) {
      deletions.push(FILE_PATHS.seriesPage(options.remove));
    }

    return {
      writes: writes,
      deletions: deletions,
      data: data,
      notes: notes
    };
  }

  // ---------------------------------------------------------------------------
  // 其他小工具（CLI / admin）共用
  // ---------------------------------------------------------------------------

  function countLineDiff(before, after) {
    var a = (before || "").split("\n");
    var b = (after || "").split("\n");
    var n = a.length;
    var m = b.length;
    var dp = [];
    for (var i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (var x = n - 1; x >= 0; x--) {
      for (var y = m - 1; y >= 0; y--) {
        dp[x][y] = a[x] === b[y] ? dp[x + 1][y + 1] + 1 : Math.max(dp[x + 1][y], dp[x][y + 1]);
      }
    }
    var added = 0;
    var removed = 0;
    var p = 0;
    var q = 0;
    while (p < n && q < m) {
      if (a[p] === b[q]) {
        p++;
        q++;
      } else if (dp[p + 1][q] >= dp[p][q + 1]) {
        removed++;
        p++;
      } else {
        added++;
        q++;
      }
    }
    removed += n - p;
    added += m - q;
    return { added: added, removed: removed };
  }

  return {
    SITE_NAME: SITE_NAME,
    FILE_PATHS: FILE_PATHS,
    CARD_W: CARD_W,
    CARD_H: CARD_H,
    escapeHtml: escapeHtml,
    escapeAttr: escapeAttr,
    slugify: slugify,
    isValidSlug: isValidSlug,
    frameNames: frameNames,
    imageSize: imageSize,
    autoWorkLede: autoWorkLede,
    parseSeriesJson: parseSeriesJson,
    serializeSeriesJson: serializeSeriesJson,
    parseI18n: parseI18n,
    renderI18n: renderI18n,
    migrateSeriesData: migrateSeriesData,
    migrateLegacyKeys: migrateLegacyKeys,
    renderSeriesPage: renderSeriesPage,
    renderCardsBlock: renderCardsBlock,
    renderFiltersBlock: renderFiltersBlock,
    renderHomeSeriesLinks: renderHomeSeriesLinks,
    planSiteSync: planSiteSync,
    countLineDiff: countLineDiff
  };
});
