# 規格書:Raw 檔案格式化瀏覽器擴充套件(WXT + Shiki)

> 狀態:Draft v1 — 2026-06-11
> 技術事實均於 2026-06 經官方文件/npm registry 驗證,引用來源見各節。

## 1. 產品目標與範圍

在瀏覽器直接開啟 raw 檔案(伺服器以純文字回應的 URL)時,以下列方式取代原生的純文字渲染:

- Mono 字型、語法高亮、行號、易讀排版、深淺色主題。
- **結構化資料格式**:互動式可摺疊樹狀檢視(展開/摺疊節點、顯示 item 數量、Parsed/Raw 雙檢視切換)— 體驗對標 Chrome 上的 [JSON Formatter](https://github.com/callumlocke/json-formatter)。
- **程式/腳本格式**:靜態語法高亮 + 行號。

### v1 支援格式

| 格式 | 檢視型態 |
|---|---|
| JSON | 互動樹 + Raw 高亮 |
| YAML | 互動樹 + Raw 高亮 |
| XML | 互動樹 + Raw 高亮 |
| TOML | 互動樹 + Raw 高亮 |
| ini | 互動樹 + Raw 高亮 |
| Dockerfile | 靜態高亮 |
| Vagrantfile | 靜態高亮(ruby grammar) |
| bash/shell | 靜態高亮 |

### 非目標(v1)

- iframe 內的 raw 檔案(只處理 top frame)。
- 編輯能力 —— 純檢視器。
- Firefox 內建 JSON viewer 的程式化繞過(見 §6)。

## 2. 關鍵技術決策

| 決策 | 選擇 | 依據 |
|---|---|---|
| 框架 | **WXT 0.20.x**(最新 0.20.26) | file-based `entrypoints/` 慣例、自動產 manifest、`wxt dev/build/zip` 多瀏覽器工作流、Vitest 整合([wxt.dev](https://wxt.dev)) |
| Manifest | **MV3-only,Chrome + Firefox 皆是** | Chrome 已永久終止 MV2 支援(連 enterprise policy 豁免也已移除)。本專案**不寫任何 MV2 fallback**、不依賴 blocking webRequest(Chrome MV3 無此能力)、不依賴 persistent background page。Firefox MV3 自 FF 109 GA;設 `strict_min_version: '127.0'`(FF 127 起 host permissions 安裝即授予,避開 109–126 預設不授予的陷阱) |
| 高亮引擎 | **Shiki 4.2,fine-grained bundle + JS regex engine** | `createHighlighterCore`(`shiki/core`)+ `createJavaScriptRegexEngine`(`shiki/engine/javascript`)。JS engine 自 3.9.1 起完整支援所有內建 grammar,**無需 WASM** → 無 `wasm-unsafe-eval`、無額外 `.wasm` 資源、bundle 較小(完整保真度需 ES2024 `v` flag,瀏覽器擴充環境滿足;見 §8 caveat)。**不採用** `@shikijs/langs-precompiled`(因 [shikijs/shiki#918](https://github.com/shikijs/shiki/issues/918) 多數語言尚不可用,非僅 experimental) |
| UI | **Vanilla TypeScript,無框架** | viewer 為「渲染一次、局部互動」場景,避免每個分頁載入框架 runtime;虛擬化樹手寫即可 |
| Parsers | `yaml@2.9`(eemeli)、`smol-toml@1.6`、`ini@6`、native `JSON.parse`、native `DOMParser` | 皆為 2026 年仍活躍維護;`@iarna/toml` 已停止維護 6 年,不採用;`fast-xml-parser` 不需要(瀏覽器內建 DOMParser)。`ini` 鎖 `@6`:`ini@7` 的 `engines` 需 Node ≥22.22.2,本機 Node 為 22.22.0,降版避免 EBADENGINE(runtime 由 bundler 處理,不受 Node 版本影響) |
| 背景腳本 | **v1 完全不需要** | 偵測與渲染都在 content script 完成,設定用 WXT 內建 storage(`import { storage } from '#imports'`);少一個 MV3 service worker 生命週期要顧 |

## 3. 架構總覽

兩段式 content script —— 對標 JSON Formatter「在所有頁面保持極低成本」的設計:

```
┌──────────────────────── every page (<all_urls>) ─────────────────────────┐
│ entrypoints/content.ts  (~3-5 KB, runAt: 'document_end')                  │
│   1. cheap bail-outs(一般 HTML 頁面、iframe、超過硬上限)                │
│   2. detect():contentType → URL 檔名 → body>pre 結構 → content sniffing │
│   3. 未命中 → return(此後零成本)                                       │
│   4. 命中 → await import(browser.runtime.getURL('/viewer.js'))            │
└────────────────────────────────────────────────────────────────────────────┘
                                    │ 只在真正的 raw 檔案頁
                                    ▼
┌──────── entrypoints/viewer.ts (unlisted script, 單一 IIFE, lazy) ─────────┐
│ - 讀設定(@wxt-dev/storage, sync:)                                        │
│ - 取出 raw 文字(pre.textContent / XML 原始碼回復)                       │
│ - 在 closed ShadowRoot 內掛載 viewer UI                                   │
│ - 結構化格式:parser → tree model → 虛擬化可摺疊樹                        │
│ - 全部格式:Shiki core + JS engine,grammar 依格式 dynamic import          │
│ - 工具列:Parsed/Raw 切換、copy、主題、expand/collapse all                │
└────────────────────────────────────────────────────────────────────────────┘
```

設計理由:

- **小偵測器 + lazy 重型 viewer**:WXT 不支援 content script code-splitting([wxt#357](https://github.com/wxt-dev/wxt/issues/357) 仍開著),且 unlisted script 預設編譯成**單一 IIFE**(`UnlistedScriptDefinition` 無 `type: 'module'` 選項,只有 background / HTML page entrypoint 才是 ESM 可分 chunk)。因此 `viewer.js` 是把 Shiki core + JS engine + 全部 grammar + 全部 parser 都 **inline 進去的一支 IIFE**,由 content script 以 `import(/* @vite-ignore */ browser.runtime.getURL('/viewer.js'))` 載入(import 進來的模組跑在 content script 同一個 isolated world realm,side-effect 即接管頁面;CSP 免疫照舊)。`viewer.js` 必須**手動**列入 `web_accessible_resources`(WXT 不會自動加)。代價:無法 per-grammar 拆分,一次載入 8 個 grammar —— 但因為只在真正的 raw 檔案頁載入一次,屬 on-demand 成本、非每頁稅,可接受。
- **偵測器必須零重依賴(關鍵陷阱)**:`content.ts` 只能碰到**輕量偵測描述**(MIME / 副檔名 / 檔名 / sniff 函式),**絕不可**經由 registry 觸及 grammar / parser 的 `import()`。因為 content script 也是 IIFE,Vite 會把 dynamic import **inline**,任何被碰到的 grammar 都會被灌進每頁載入的 `content.js`,直接破壞「偵測器極輕」。故 format 定義拆兩層:偵測描述(`formats/*.ts`,輕,content 與 viewer 共用)vs render provider(`viewer/providers.ts`,重,只有 viewer 觸及,見 §7)。
- **`runAt: 'document_end'`**:不用 `document_start`(`<pre>` 還不存在),也不用 `document_idle`(大檔案時可能晚數秒,閃爍更明顯)。防閃爍另由 manifest CSS 處理(§5)。
- **Shadow DOM + constructed stylesheets**:隔離頁面樣式,且 CSSOM 不受頁面 CSP 管轄(§5)。

## 4. 偵測 pipeline(`utils/detect.ts`)

純函式、依成本排序、可完整單元測試。回傳 `{ formatId, confidence, rawSource } | null`。

### Step 0 — 結構 gate(JSON Formatter 招式的一般化)

僅在以下任一條件成立時繼續:

- `document.body` 恰好一個元素子節點且為 `<pre>`(Chrome/Firefox 渲染 `text/plain` 與未識別文字類型的方式),或
- `document.contentType` 為 XML 類型且 document 是 `XMLDocument`(此時沒有 `<pre>`,見 §5 XML 特例)。

立即退出的情況:非 top frame、`text/html` 且為一般 DOM、view-source 頁、超過硬上限(§8)、偵測到 Firefox 內建 JSON viewer 的 DOM(§6)。

### Step 1 — MIME 對照(`document.contentType`,先精確再 suffix)

| 格式 | MIME types |
|---|---|
| JSON | `application/json`、`text/json`(非標準但常見)、任何 `*/*+json`(`application/ld+json`、`application/manifest+json` …) |
| YAML | `application/yaml`(RFC 9512 正式型別)、`text/yaml`、`text/x-yaml`、`application/x-yaml` |
| XML | `application/xml`、`text/xml`、任何 `*/*+xml`(**排除** `+xhtml`;`image/svg+xml` 已被當圖片渲染,不處理) |
| TOML | `application/toml`(已註冊但實務罕見,多數伺服器送 `text/plain`) |
| ini | 無可靠 MIME —— 仰賴檔名 |
| Shell | `application/x-sh`、`application/x-shellscript`、`text/x-sh`、`text/x-shellscript` |
| Dockerfile / Vagrantfile | 無 —— 一律 `text/plain`(`application/octet-stream` 會直接下載,到不了 content script) |

### Step 2 — URL 檔名比對

取 `location.pathname` 最後一段(去 query/hash、不分大小寫),僅在 contentType 為 `text/plain` 或泛型時套用:

- `.json`、`.jsonc`、`.json5` → JSON(json grammar;`JSON.parse` 成功才給樹)
- `.yml`、`.yaml` → YAML;`.toml` → TOML
- `.xml`、`.xsd`、`.plist`、`.svg`(以文字回應時)→ XML
- `.ini`、`.cfg`、`.conf`、`.properties`、`.editorconfig`、`.gitconfig` → ini
- 精確檔名 `Dockerfile`、`Containerfile`、前綴 `Dockerfile.` → Dockerfile
- 精確檔名 `Vagrantfile` → Vagrantfile(ruby grammar)
- `.sh`、`.bash`、`.zsh`、dotfiles(`.bashrc`、`.bash_profile`、`.zshrc`、`.profile`)→ Shell

### Step 3 — Content sniffing fallback

僅限:`text/plain` + 單一 `<pre>` + 大小低於 sniff 上限(2 MB)。

- 首個非空白字元為 `{` 或 `[` → 嘗試 `JSON.parse`(sniff 即 parse,反正樹也需要)。
- 第一行 shebang(`#!/bin/sh|bash|zsh`、`#!/usr/bin/env bash`)→ Shell。
- 開頭 `<?xml` → XML。
- ini(`[section]` + 多數行 `key=value`)與 YAML(`key: value`、`---`)行型啟發式:只掃前 ~100 行、需高命中率才觸發,且**預設關閉**(sniffing 是 JSON Formatter 類擴充套件誤判 bug 的主要來源,如其 [issue #275](https://github.com/callumlocke/json-formatter/issues/275));設定頁提供 per-format「detect by content」開關(JSON/XML/Shell 預設開,ini/YAML 預設關)。

### Manifest matches

```ts
matches: ['*://*/*', 'file:///*']  // 等效 <all_urls>;含 file:// 供本機檔案
```

`<all_urls>` 在此產品類別無可避免(無法預知 raw 檔的 URL),所有同類擴充套件皆如此;商店審查理由文案見 §11。Chrome 的 file URL 需使用者在擴充功能頁手動開啟「Allow access to file URLs」。

## 5. 頁面接管技術(`viewer/mount.ts`)

1. `const pre = document.body.querySelector(':scope > pre')`;`const raw = pre.textContent ?? ''`。**`raw` 是唯一真相來源**:Raw 檢視與 copy 按鈕都用它,絕不從 parsed tree 重新序列化。
2. 設 `document.documentElement.dataset.prettyRaw = 'active'`,並把命中的 `formatId` 一併寫上(如 `dataset.prettyRawFormat = 'json'`)當作交接 —— `viewer.js` 載入後直接讀此屬性,**不重跑偵測**;raw 文字仍由 viewer 自 `pre.textContent` 取得(唯一真相來源)。manifest 注入的 `content.css` 內含:

   ```css
   html[data-pretty-raw] body > pre { display: none; }
   ```

   manifest 注入的 CSS 由瀏覽器注入、不受頁面 CSP 限制 → 即時、CSP-proof 的防閃爍。
3. 建 `<div id="pretty-raw-root">` → `attachShadow({ mode: 'closed' })` → `adoptedStyleSheets` 掛 constructed `CSSStyleSheet`(主題變數 + 排版)。constructed stylesheet 屬 CSSOM 操作,頁面 CSP 的 `style-src` 管不到;Shadow DOM 同時隔離頁面樣式污染。
4. **不銷毀原始 `<pre>`**(僅 `display: none`):「對此頁停用」可低成本還原。
5. `document.title` 為空時填入檔名;shadow host 設 CSS `color-scheme` 讓捲軸配合主題。
6. CSP 邊界(已驗證):content script 在 isolated world 執行、有自己的 CSP;manifest CSS 與 adopted stylesheets 皆不受頁面 CSP 管。唯一要避免的是往頁面 DOM 插 inline `<style>`/`<script>`/`data:` 圖 —— 本設計三者皆不用(icon 用 inline SVG 元素)。

### XML 特例(容易踩雷)

`application/xml` / `text/xml` 的 document 不是 HTML-with-`<pre>`:

- **Chrome**:webkit XML viewer 會把原始碼留在隱藏的 `<div id="webkit-xml-viewer-source-xml">` —— 從這裡取 raw 文字。
- **Firefox**:pretty-print 成樹(含「no style information」橫幅),原始 bytes 不在 DOM。回復順序:(1) Chrome source div →(2) `new XMLSerializer().serializeToString(document)`(會丟失註解/原始排版,需註明保真度限制)→(3) `fetch(location.href, { cache: 'force-cache', credentials: 'include' })` 受控重抓(通常命中快取;以設定開關 + 大小上限守門)。

## 6. Firefox 內建 JSON viewer

研究結論:**不對抗,偵測到就讓路,並引導使用者**。

- Firefox 的 JSON viewer(`devtools.jsonview.enabled`,FF 53 起預設開)會在擴充套件看到 raw `<pre>` 之前接管 `application/json`。擴充套件無法改 `about:config`。所有主流同類套件(JSONView、Virtual JSON Viewer、JsonDiscovery)的做法都是請使用者自行關閉該 pref。
- `webRequest` blocking 改寫 `Content-Type` 讓內建 viewer 不啟動,在 **Firefox MV3 仍可行**(Mozilla 保留 blocking webRequest,Chrome MV3 沒有 —— 與 §2 的 MV3-only 決策相呼應),但需要 `webRequestBlocking` 重權限、語義副作用大、增加 AMO 審查複雜度 → **v1 不做,列為 v2 可選功能**。
- v1 行為:偵測到 Firefox JSON viewer DOM 即不動作;options 頁顯示 Firefox 專屬說明(關閉 `devtools.jsonview.enabled` 後,Firefox 會以純 `<pre>` 渲染 JSON,本套件即正常運作)。其他格式(YAML/TOML/ini/Shell/Dockerfile,以及以 text 回應的 XML)在 Firefox 不受影響。

## 7. 各格式處理表與 registry

| 格式 | 偵測(MIME / 檔名 / sniff) | Shiki grammar | Parser(樹) | 檢視 |
|---|---|---|---|---|
| JSON | `application/json`、`*+json` / `.json` / `{`-`[` + parse | `json` | native `JSON.parse` | Tree + Raw |
| YAML | `application/yaml` 等 / `.yml,.yaml` / opt-in 行型 | `yaml` | `yaml@2.9`(`parseDocument`:node ranges + multi-doc) | Tree + Raw |
| TOML | `application/toml` / `.toml` | `toml` | `smol-toml@1.6`(TOML 1.1) | Tree + Raw |
| XML | `application/xml`、`*+xml` / `.xml,.xsd,.plist` / `<?xml` | `xml` | native `DOMParser`(以 `parsererror` 偵錯) | Tree + Raw |
| ini | — / `.ini,.cfg,.conf,…` / opt-in 行型 | `ini` | `ini@6` | Tree + Raw |
| Dockerfile | — / `Dockerfile*`、`Containerfile` | `docker` | — | 靜態高亮 |
| Vagrantfile | — / `Vagrantfile` | `ruby` | — | 靜態高亮 |
| Shell | `application/x-sh` 等 / `.sh,.bash`、dotfiles / shebang | `shellscript` | — | 靜態高亮 |

Registry 拆兩層(理由見 §3:content script 是 IIFE,碰到 grammar/parser 會被 inline 而灌大每頁載入的 `content.js`):

**第一層 —— 偵測描述(輕,`content.ts` 可安全 import)**

```ts
// formats/json.ts —— 純資料 + sniff 函式,無任何 grammar/parser 依賴
export const json: FormatDescriptor = {
  id: 'json',
  mimes: ['application/json', 'text/json'],
  mimeSuffixes: ['+json'],
  extensions: ['.json', '.jsonc', '.json5'],
  filenames: [],
  sniff: (text) => /* 首個非空白字元為 { 或 [ 再試 JSON.parse */,
  view: 'tree',                                   // 'tree' | 'static'
}
// formats/index.ts: export const descriptors = [json, yaml, toml, xml, ini, ...]
```

**第二層 —— render provider(重,只有 `viewer.js` 觸及,全部 static import → inline 進 IIFE)**

```ts
// viewer/providers.ts
import jsonGrammar from '@shikijs/langs/json'
import yamlGrammar from '@shikijs/langs/yaml'
import { parse as parseYaml } from 'yaml'
// …其餘 grammar / parser 一律 static import

export const providers: Record<FormatId, {
  grammar: LanguageInput
  parse?: (text: string) => unknown
}> = {
  json: { grammar: jsonGrammar, parse: JSON.parse },
  yaml: { grammar: yamlGrammar, parse: parseYaml },
  // …
}
```

`utils/detect.ts`(content 端)只走訪 `formats/*` 的偵測描述;`viewer.js` 載入後依命中的 `formatId` 從 `providers` 取已 inline 的 grammar/parser(無額外網路請求)。新增格式 = `formats/<fmt>.ts` 加一個描述 + `providers` 加一列。

## 8. 渲染 pipeline 與效能

### 樹狀檢視(`viewer/tree.ts`)

parse → 正規化為統一節點模型 `{ key, kind, value?, children?, count }` → 攤平可見節點 → **虛擬化渲染**(固定行高,只渲染 viewport ± overscan,絕對定位 spacer;手寫約 150 行,不引入函式庫)。

功能:

- 展開/摺疊 + item 數量(`{…} 12 keys`、`[…] 240 items`)
- Expand all / Collapse all(collapse-all 為 O(1):重設可見集合)
- 字串值內 URL 可點擊
- Row hover:copy value / copy path
- 工具列 Parsed | Raw 切換

### Raw/靜態檢視(`viewer/highlight.ts`)

- Shiki `createHighlighterCore` + `createJavaScriptRegexEngine()`,模組級 singleton。
- 單一主題對:`github-light` + `github-dark`(`@shikijs/themes/*`),dual-theme CSS variables 輸出 → 切主題只翻 CSS class,不重新高亮。
- 行號用 CSS counter 掛在 Shiki 的 `.line` span 上;提供 soft-wrap 開關。

> **JS engine caveat**:`createJavaScriptRegexEngine` 經 Oniguruma-To-ES 轉換,完整 grammar 保真度需 RegExp `v` flag(ES2024 / 對應現代瀏覽器)。strict 模式遇無法轉換的 pattern 會 throw —— 對我們只用內建 grammar(3.9.1+ 全支援)正常運作,但建議包一層 try/catch,失敗時 fallback 到純 mono 檢視,避免單一格式拖垮整頁。

### 大小門檻(預設值,可在設定覆寫)

| 大小 | 行為 |
|---|---|
| ≤ 1 MB | 完整體驗:結構化格式預設樹狀、Raw 高亮 |
| 1–10 MB | Raw 檢視跳過 Shiki(純 mono `<pre>` + 行號);JSON/YAML 樹在 parse 時間預算(~1.5 s)內完成才提供 —— 虛擬化讓渲染與大小無關,成本只剩 parse |
| > 10 MB | 不動作,留原生渲染 + 角落小 badge「Format anyway?」(點了走 1–10 MB 路徑) |

大檔高亮採**分塊**:~200 行/chunk,viewport 優先,`requestIdleCallback` / `setTimeout(0)` 排程,首屏即時可見。以上皆符合 Shiki 官方 [best-performance](https://shiki.style/guide/best-performance) 指引(fine-grained bundle、共享 singleton、JS engine)。

## 9. 專案佈局與設定

```
file-format-extension/
├── wxt.config.ts          # manifest: permissions:['storage'],
│                          #   web_accessible_resources: ['viewer.js'](手動，WXT 不自動加),
│                          #   browser_specific_settings.gecko.id(AMO MV3 必填),
│                          #   gecko strict_min_version: '127.0'
├── package.json           # wxt@^0.20, shiki@^4.2(core/engine/langs/themes),
│                          #   yaml@^2.9, smol-toml@^1.6, ini@^6
├── entrypoints/
│   ├── content.ts         # defineContentScript({ matches, runAt:'document_end',
│   │                      #   cssInjectionMode:'manifest' })；import ../assets/content.css
│   ├── viewer.ts          # defineUnlistedScript —— 單一 IIFE，全部重依賴 inline，lazy 載入
│   └── options/
│       ├── index.html     # WXT 慣例：options 需 index.html
│       └── main.ts        # vanilla TS 設定頁
├── assets/
│   └── content.css        # 防閃爍規則（不可放 entrypoints/，會與 content.ts 撞 entrypoint 名）
├── utils/
│   ├── detect.ts          # 偵測 pipeline(純函式，只依賴 formats 偵測描述)
│   ├── settings.ts        # storage.defineItem 定義(import { storage } from '#imports')
│   └── text.ts            # raw 文字抽取(含 XML 原始碼回復)
├── formats/               # 第一層：偵測描述(輕，content 端可安全 import)
│   ├── index.ts           # descriptors 陣列 + FormatDescriptor 型別
│   └── {json,yaml,toml,xml,ini,dockerfile,vagrantfile,shell}.ts
├── viewer/
│   ├── providers.ts       # 第二層：formatId → { grammar, parse }(重，static import，僅 viewer 觸及)
│   ├── mount.ts           # shadow root、接管、工具列
│   ├── tree.ts            # 節點模型 + 虛擬化樹
│   ├── highlight.ts       # shiki singleton、分塊高亮
│   └── theme.ts           # constructed stylesheets、light/dark 解析
├── docs/spec.md           # 本文件
└── tests/                 # unit + e2e(§10)
```

### 設定(`utils/settings.ts`)

全部以 WXT 內建 storage(`import { storage } from '#imports'`)的 `storage.defineItem`(`sync:` 前綴、`fallback`、`version: 1` 預留 migration)。注意:`@wxt-dev/storage` 是給非 WXT 專案用的獨立套件,WXT 專案內**直接用 `#imports`**,勿另裝:

| Key | 型別 | 說明 |
|---|---|---|
| `sync:theme` | `'auto' \| 'light' \| 'dark'` | `auto` 由 viewer 內 `matchMedia('(prefers-color-scheme: dark)')` 解析並監聽變化 |
| `sync:formats` | `Record<FormatId, { enabled: boolean; sniff: boolean; defaultView: 'tree' \| 'raw' }>` | per-format 開關 |
| `sync:perf` | `{ highlightMaxBytes: 1_048_576; hardMaxBytes: 10_485_760 }` | 門檻 |
| `sync:disabledOrigins` | `string[]` | 工具列的 per-site 停用 |

Options 頁直接讀寫;viewer 以 `storage.watch()` 即時套用 theme 與 per-format 設定。**v1 不需要 background script**。

### 多瀏覽器

- `wxt dev` / `wxt dev -b firefox` 開發(HMR);`wxt build` / `wxt build -b firefox` 產出。
- 兩邊都鎖 **MV3**(§2);WXT 的 `browser` 抽象層處理 `chrome.*` vs `browser.*` 差異。

## 10. 測試計畫

### Unit(Vitest + `WxtVitest` from `wxt/testing/vitest-plugin`,environment: happy-dom)

- `detect.ts`:表格驅動矩陣 —— (contentType × 檔名 × body 結構 × 內容) → 預期格式或 none;**必含誤判反例**(一般 HTML 頁含單一 `<pre>` 裝著 JSON 樣貌散文 —— JSON Formatter #275 那類 bug)。
- `formats/*`:parser adapter → 統一節點模型(multi-doc YAML、TOML table/array-of-tables、XML 屬性/CDATA、ini section、malformed input 的錯誤呈現)。
- `tree.ts`:攤平/展開/摺疊邏輯、item counts、虛擬視窗計算。
- `settings.ts`:預設值、watch、migration —— 對 `fakeBrowser`(`wxt/testing/fake-browser`,每個 `beforeEach` 重設)。

### E2E(Playwright,Chromium only)

Playwright 以 `--load-extension` 載入 `.output/chrome-mv3`;本機 HTTP server 提供 fixture 並控制 `Content-Type`:

- 接管成功(shadow root 存在)、樹渲染 N rows
- Raw 切換顯示與原文 byte-identical 的文字
- 超大 fixture 不被動作
- strict CSP fixture(`style-src 'none'`)仍正常渲染

Firefox e2e:Playwright 無法載入 Firefox 擴充套件 → 手動 checklist(`wxt dev -b firefox`),涵蓋 JSON viewer 讓路行為與其他格式接管。

### CI

typecheck → unit → `wxt build` + `wxt build -b firefox`(manifest snapshot test)→ Playwright job。

## 11. 發佈

- **Chrome Web Store**:`wxt zip`。`<all_urls>` 會觸發權限理由表單與較長審查 —— 理由文案:

  > The extension formats raw data/config files (JSON, YAML, XML, TOML, ini, shell scripts) wherever they are served; file URLs are not known in advance, so it must run its lightweight detector on all URLs. It activates only on pages whose entire body is a raw text document, transmits no data, and requires no other permissions besides `storage` for user preferences.

- **AMO(Firefox)**:`wxt zip -b firefox` 同時產出 extension zip 與 **sources zip**(AMO 強制要求可重建原始碼;首次送審前先驗證 `npm ci && wxt zip -b firefox` 可重現 build)。MV3 在 AMO **必須**有明確 add-on ID:`browser_specific_settings.gecko.id`。Reviewer notes 用同一段理由文案。
- 無 remote code、無 analytics —— 讓兩邊審查單純。
- 後續可用 `wxt submit init` / `wxt submit` 自動化 CI 發佈。

## 12. 里程碑

| 里程碑 | 內容 | 估時 |
|---|---|---|
| **M1 骨架** | WXT 專案、偵測 content script(結構 gate + MIME/檔名)、lazy `viewer.js` 管線(`web_accessible_resources`)、純 mono 接管(先不接 Shiki)、settings storage、options 頁外殼、Vitest wiring、雙瀏覽器 dev build 可跑 | ~1 週 |
| **M2 JSON 完整體驗** | JSON 樹(節點模型、虛擬化、counts、展開摺疊、copy、URL 連結化)、Raw + Shiki(core + JS engine + json grammar、dual theme)、防閃爍 CSS、效能門檻、Firefox JSON viewer 偵測 + options callout。此里程碑即旗艦格式的完整產品 | ~1–1.5 週 |
| **M3 其餘格式** | registry 驅動展開 YAML/TOML/ini 樹、XML(含原始碼回復路徑)、Dockerfile/Vagrantfile/shell 靜態檢視、content sniffing 啟發式 + per-format 開關、parser 失敗 fallback 到高亮 Raw | ~1 週 |
| **M4 打磨與上架** | 1–10 MB 分塊高亮、per-site 停用、樹鍵盤導航、Playwright suite、icon/截圖/商店文案、CWS + AMO 送審(sources zip 重現驗證)、Firefox 手動 QA(ESR + current) | ~1 週 |

## 13. 已知風險與未來事項

- **wxt#357**:上游若支援 content script code-splitting,可簡化 viewer 載入管線(移除 unlisted script 繞法)。
- **`@shikijs/langs-precompiled`**:目前因 [shikijs/shiki#918](https://github.com/shikijs/shiki/issues/918) 多數語言尚不可用(非僅 experimental),**v1 不採用**;待該 issue 解決後可搭配 `createJavaScriptRawEngine` 進一步縮小 viewer bundle。
- **Firefox webRequest JSON viewer 繞過**:視使用者需求排 v2(僅 Firefox 可行;Chrome MV3 永遠不會有 blocking webRequest)。
- **XML 原始碼保真度**:Firefox 上 `XMLSerializer` 路徑會丟失註解與原始排版;re-fetch 路徑需留意非冪等端點(雖然 GET 理應安全)。
- **`document.contentType` 相容性**:兩家瀏覽器皆支援,但對某些重導向/串流回應的值需在 M1 實測確認。
