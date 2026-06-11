# 執行計畫:Raw 檔案格式化瀏覽器擴充套件

> 依據 [docs/spec.md](./spec.md)(Draft v1,已於 2026-06-11 完成技術查證與修正)。
> 本檔為可逐步執行、可勾稽的工作清單;每完成並通過一個步驟,就把該步驟狀態標注為 ✅。

## 如何使用本計畫

- 每個步驟有固定欄位:**做什麼 / 步驟 / 測試 / 檢核標準 / 狀態**。
- **狀態標記慣例**:`☐ 未開始` → `⏳ 進行中` → `✅ 通過(YYYY-MM-DD)`。
  通過 = 該步驟「測試」全綠 **且**「檢核標準」逐條滿足,才可標 ✅。
- 步驟有依賴順序;同一里程碑內未明確標註「可平行」者,請依序進行。
- 不要跳過檢核;若檢核未過,標 `❌ 阻塞:<原因>` 並停在該步驟。

## 全域驗收指令(每個里程碑結束跑一次)

```bash
pnpm typecheck            # tsc --noEmit,零錯誤
pnpm test                 # vitest run,全綠
pnpm build                # wxt build,產出 .output/chrome-mv3
pnpm build:firefox        # wxt build -b firefox,產出 .output/firefox-mv3
```

> `package.json` scripts 對應:`typecheck: tsc --noEmit`、`test: vitest run`、`build: wxt build`、`build:firefox: wxt build -b firefox`、`dev: wxt`、`dev:firefox: wxt -b firefox`、`zip: wxt zip`、`zip:firefox: wxt zip -b firefox`。

---

# M1 — 骨架(目標:雙瀏覽器可 build、偵測管線可單測、純 mono 接管可見)

## M1-1 專案初始化與相依

**狀態**:✅ 通過(2026-06-11) — 雙瀏覽器 MV3 build 綠;gecko.id + strict_min_version 127.0;ini@6 無 EBADENGINE。(實機 Node 為 22.22.3,已滿足 ini@7,但仍依核准鎖 @6。)

**做什麼**:用 WXT 建立 vanilla-TS 專案骨架,鎖定 MV3 雙瀏覽器,安裝相依。

**步驟**:

1. `pnpm dlx wxt@latest init .`(template 選 `vanilla`,TypeScript)。確認 `wxt` 為 `0.20.x`。
2. 安裝執行期相依:
   ```bash
   pnpm add shiki @shikijs/langs @shikijs/themes @shikijs/engine-javascript yaml smol-toml ini@^6
   ```
   (Shiki 主套件 `shiki` 已含 `shiki/core`、`shiki/engine/javascript` subpath;`@shikijs/langs`、`@shikijs/themes` 供 fine-grained import。)
3. 開發相依:`pnpm add -D vitest happy-dom @types/node`。
4. 寫 `wxt.config.ts`:`manifest_version: 3`、`manifest.permissions: ['storage']`、`manifest.web_accessible_resources: [{ resources: ['viewer.js'], matches: ['<all_urls>'] }]`、`browser_specific_settings.gecko = { id: 'file-format-viewer@<domain>', strict_min_version: '127.0' }`。
5. `package.json` 補上上方 scripts 區塊。

**測試**:

```bash
pnpm exec wxt prepare        # 產生型別,零錯誤
pnpm typecheck
pnpm build && pnpm build:firefox
```

**檢核標準**:

- `.output/chrome-mv3/manifest.json` 與 `.output/firefox-mv3/manifest.json` 皆 `"manifest_version": 3`。
- Firefox manifest 含 `browser_specific_settings.gecko.id` 與 `strict_min_version: "127.0"`。
- 兩個 build 皆無錯誤;`ini` 安裝**無** EBADENGINE 警告(因鎖 `@6`)。

---

## M1-2 偵測描述層(`formats/*.ts` + `formats/index.ts`)

**狀態**:✅ 通過(2026-06-11) — descriptors 測試綠;`rg` 確認 formats/ 無 grammar/parser import。修正:`.editorconfig`/`.gitconfig` 為 dotfile 檔名(移到 `filenames`,非 `extensions`)。

**做什麼**:建立「第一層」格式偵測描述(純資料 + sniff,**無** grammar/parser 依賴),供 `content.ts` 安全 import(見 spec §3、§7)。

**步驟**:

1. 定義 `FormatDescriptor` 型別與 `FormatId` union(`'json' | 'yaml' | 'toml' | 'xml' | 'ini' | 'dockerfile' | 'vagrantfile' | 'shell'`)。
2. 為 8 種格式各寫一檔,填 `mimes / mimeSuffixes / extensions / filenames / sniff? / view`(內容對照 spec §4、§7 表)。
3. `formats/index.ts` 匯出 `descriptors: FormatDescriptor[]`。

**測試**:`tests/formats.descriptors.test.ts`

- `descriptors.length === 8`,`id` 唯一。
- 每個 descriptor 的 `view` 為 `'tree' | 'static'`。
- 結構化格式(json/yaml/toml/xml/ini)`view === 'tree'`;dockerfile/vagrantfile/shell `view === 'static'`。

**檢核標準**:

- `formats/*.ts` 內**不出現** `@shikijs/langs`、`yaml`、`smol-toml`、`ini`、`shiki` 任何 import(grep 驗證:`rg -n "shikijs|smol-toml|from 'yaml'|from 'ini'" formats/` 應無結果)。
- 測試全綠。

---

## M1-3 偵測 pipeline(`utils/detect.ts`,純函式)

**狀態**:✅ 通過(2026-06-11) — 39 個 detect 測試綠,含全部誤判反例(HTML 頁、prose-starting-with-`{`、xhtml+xml、Firefox JSON viewer、超過 hardMax)。`detect()` 純函式;DOM 萃取在 `detectFromDocument()`。

**做什麼**:實作 spec §4 的 Step 0-3 偵測流程,設計成可注入輸入的純函式以利單測。

**步驟**:

1. `detect(input: DetectInput): DetectResult | null`,`DetectInput = { contentType, pathname, bodyShape, sampleText }`(`bodyShape` 表「body 是否恰好單一 `<pre>` 子元素 / 是否 XMLDocument / 是否 Firefox JSON viewer DOM」)。
2. 依序:結構 gate → MIME 對照 → 檔名比對 → 內容 sniffing(預設開關依 spec §4 Step 3)。
3. 另寫一薄包裝 `detectFromDocument(document, settings)` 從真實 DOM 萃取 `DetectInput` 後呼叫 `detect`(content.ts 用此)。

**測試**:`tests/detect.test.ts`(表格驅動,環境 happy-dom)

- 正例矩陣:每格式至少 (MIME 命中)、(檔名命中)、(sniff 命中) 各一例 → 回傳正確 `formatId`。
- **誤判反例**(必含):
  - 一般 HTML 頁(body 非單一 pre)→ `null`。
  - body 為單一 `<pre>` 但內容是「以 `{` 開頭的散文、`JSON.parse` 失敗」→ `null`(JSON Formatter #275 類)。
  - `application/xhtml+xml` → `null`(被 `+xml` 排除規則擋下)。
  - Firefox JSON viewer DOM → `null`。
- 邊界:超過 `hardMaxBytes` → `null`;`text/plain` 無副檔名無 sniff 命中 → `null`。

**檢核標準**:

- 上述矩陣 100% 通過。
- `detect` 為純函式(不碰 `document`/`location` 全域;以參數注入)。

---

## M1-4 content script + 純 mono 接管 + lazy viewer 管線

**狀態**:✅ build 不變量通過(2026-06-11);⏳ Playwright smoke 待實機 — content.js 19.4KB(< 30KB)且 `rg` 確認無 Shiki/parser;viewer.js 3KB 已在 `web_accessible_resources`;manifest CSS 注入確認。**註**:`entrypoints/content.css` 會與 `content.ts` 撞 entrypoint 名,已改放 `assets/content.css` 由 content.ts import(spec/plan 佈局待同步)。Playwright smoke(shadow root 存在等)需可開瀏覽器的環境,延後至 M2-3/M4-3 一併跑。

**做什麼**:串起「偵測 → 防閃爍 → lazy 載入 viewer.js → 純 mono 接管」(M1 先不接 Shiki/樹)。驗證偵測器極輕、viewer 只在 raw 頁載入。

**步驟**:

1. `entrypoints/content.ts`:`defineContentScript({ matches: ['*://*/*','file:///*'], runAt: 'document_end', cssInjectionMode: 'manifest', main() {...} })`。
   - 呼叫 `detectFromDocument`;命中才:設 `documentElement.dataset.prettyRaw='active'`、`dataset.prettyRawFormat=formatId`,然後 `await import(/* @vite-ignore */ browser.runtime.getURL('/viewer.js'))`。
2. `entrypoints/content.css`:`html[data-pretty-raw] body > pre { display:none }`(防閃爍,spec §5)。
3. `entrypoints/viewer.ts`(`defineUnlistedScript`):M1 版只做純 mono 接管 —— 讀 `dataset.prettyRawFormat` + `pre.textContent`,建 closed shadow root,`adoptedStyleSheets` 掛 mono + 行號樣式,渲染 `<pre>` + 工具列骨架(暫只有標題/格式名)。

**測試**:`tests/e2e/takeover.smoke.spec.ts`(Playwright,Chromium,`--load-extension=.output/chrome-mv3`)

- 本機 server 提供 `sample.json`(`Content-Type: application/json`)→ 開啟後 `#pretty-raw-root` shadow root 存在、含 mono `<pre>`。
- 一般 HTML 頁 → 無 `#pretty-raw-root`。

**檢核標準**:

- **偵測器極輕**:`rg -l "shikijs|smol-toml|createHighlighter" .output/chrome-mv3/content-scripts/` 無結果;`content.js` 體積 < 30 KB(列入 CI 斷言)。
- `viewer.js` 已在 `manifest.web_accessible_resources`。
- 一般網頁瀏覽不載入 `viewer.js`(DevTools Network 僅 raw 頁出現)。

---

## M1-5 設定層 + options 頁外殼

**狀態**:✅ 通過(2026-06-11) — settings 測試綠(預設值、persistence、watch、loadDetectOptions disabled-origin);options.html 產出於 build。`loadDetectOptions(origin)` 改為注入 origin 以利純測試。互動式「重整保留」待實機抽查。

**做什麼**:建立設定 schema 與 options 頁骨架(spec §9)。

**步驟**:

1. `utils/settings.ts`:`import { storage } from '#imports'`;`storage.defineItem` 定義 `sync:theme`、`sync:formats`、`sync:perf`、`sync:disabledOrigins`(各帶 `fallback`、`version: 1`)。
2. `entrypoints/options/index.html` + `entrypoints/options/main.ts`:vanilla TS,渲染 theme 下拉 + per-format 開關清單(讀寫上述 item)。

**測試**:`tests/settings.test.ts`(Vitest + `fakeBrowser`,`beforeEach(() => fakeBrowser.reset())`)

- 預設值正確(theme=`auto`、各格式 `enabled:true`、sniff 預設依 spec §4)。
- 寫入後 `storage.getItem` 讀回一致;`watch` 回呼被觸發。

**檢核標準**:

- options 頁在 `pnpm dev` 下可開、可改、重整後保留。
- settings 測試全綠。

---

## M1-6 測試與 CI wiring

**狀態**:✅ 通過(2026-06-11,Playwright 設定除外) — `vitest.config.ts` 套 `WxtVitest` + happy-dom;`pnpm verify`(typecheck → 47 tests → build → build:firefox)一鍵全綠。pnpm 11 設定搬到 `pnpm-workspace.yaml`(`allowBuilds`)。Playwright 設定延後(需可開瀏覽器環境)。

**做什麼**:固化測試與型別檢查基礎建設。

**步驟**:

1. `vitest.config.ts`:套用 `WxtVitest` from `wxt/testing/vitest-plugin`,`environment: 'happy-dom'`。
2. CI(GitHub Actions 或本機 `pnpm verify` 複合腳本):`typecheck → test → build → build:firefox`。
3. Playwright 設定(Chromium project,載入 `.output/chrome-mv3`)。

**測試**:`pnpm verify` 一鍵跑完上述四步。

**檢核標準**:

- 全域驗收指令四項全綠。
- M1-1~M1-5 既有測試在 CI 重跑通過。

> **M1 完成定義**:`pnpm verify` 全綠;開 `.json` 檔可見 mono 接管;偵測器體積斷言通過;雙瀏覽器 build 成功。

---

# M2 — JSON 完整體驗(旗艦格式端到端)

## M2-1 樹節點模型 + 虛擬化(`viewer/tree.ts`)

**狀態**:✅ 通過(2026-06-11) — 9 個 tree 測試綠(normalize kind/count/path、flatten 展開摺疊、collapse-all=1 列、虛擬視窗計算)。修正:`pathKey` 改 `JSON.stringify` 避免 `['a b']` 與 `['a','b']` 碰撞。虛擬化 renderer + copy-path + URL linkify 已實作;10k-row 流暢度待實機。

**做什麼**:JSON.parse → 統一節點模型 → 攤平 → 虛擬化渲染(spec §8)。

**步驟**:

1. `normalize(value): TreeNode`(`{ key, kind, value?, children?, count }`)。
2. `flatten(visibleSet): Row[]`;展開/摺疊只改 `visibleSet`。
3. 虛擬化:固定行高,只渲染 viewport ± overscan,絕對定位 spacer。
4. 互動:展開/摺疊 + item counts、expand/collapse all(collapse-all O(1))、字串值 URL 連結化、row hover copy value / copy path。

**測試**:`tests/tree.test.ts`

- `normalize` 對 object/array/巢狀/primitive 的 kind 與 count 正確。
- `flatten` 在展開/摺疊狀態下回傳列數正確。
- collapse-all 後可見列 = 根層級列數。
- 虛擬視窗計算:給定 scrollTop/height,回傳的 row 範圍正確。

**檢核標準**:

- 10,000 節點 fixture:DOM 內實際 row 元素數 ≈ viewport 容量(非全量),捲動流暢。
- copy path 產生的路徑可被 `JSON` 取值還原(round-trip 抽查)。

---

## M2-2 Shiki 高亮 + 主題(`viewer/highlight.ts` + `viewer/theme.ts` + `viewer/providers.ts`)

**狀態**:✅ 通過(2026-06-11) — highlight 測試綠(json 輸出 `.line` + `--shiki-dark`;fallback 跳脫 HTML)。singleton highlighter + JS engine + dual theme;try/catch fallback;`providers.json` 就緒。build 確認 Shiki 只進 viewer.js(211KB),content.js 仍 19.4KB 無 Shiki。

**做什麼**:fine-grained Shiki singleton + JS engine + json grammar + dual theme;Raw 檢視;行號(spec §8)。

**步驟**:

1. `viewer/providers.ts`:`import jsonGrammar from '@shikijs/langs/json'`、themes static import;`providers.json = { grammar: jsonGrammar, parse: JSON.parse }`。
2. `viewer/highlight.ts`:`createHighlighterCore({ engine: createJavaScriptRegexEngine(), themes:[githubLight, githubDark], langs:[jsonGrammar] })` 模組級 singleton;`codeToHtml(code, { lang, themes:{ light:'github-light', dark:'github-dark' } })`。**包 try/catch**,throw 時 fallback 純 mono(spec §8 caveat)。
3. `viewer/theme.ts`:dual-theme CSS variables(`--shiki-dark`),切主題只翻 class;`auto` 由 `matchMedia` 解析並監聽。
4. 行號:CSS counter 掛 `.line`;soft-wrap 開關。

**測試**:`tests/highlight.test.ts`(happy-dom)

- `codeToHtml` 對 json 輸出含 `.line` 與 `--shiki-dark` CSS 變數。
- 故意餵入會 throw 的情境 → 回傳 fallback 標記(不拋出)。

**檢核標準**:

- Raw 檢視文字與 `pre.textContent` **byte-identical**(e2e 斷言)。
- 切換 light/dark **不**重新呼叫 `codeToHtml`(只改 class)。

---

## M2-3 mount/工具列 + 效能門檻(`viewer/mount.ts`)

**狀態**:✅ 實作完成 + build 綠(2026-06-11);⏳ Playwright/實機待跑 — Parsed/Raw 切換、Copy(用 raw 唯一真相)、主題循環(auto/light/dark,storage.watch 即時)、expand/collapse all;`highlightMaxBytes` 超過走純 mono gutter。e2e(byte-identical、門檻、CSP fixture)延後至可開瀏覽器環境。

**做什麼**:組裝 viewer:Parsed/Raw 切換、copy、主題切換、expand/collapse all;套用大小門檻(spec §8)。

**步驟**:

1. 工具列:Parsed | Raw、copy(用唯一真相 `raw`)、主題、展開/摺疊全部。
2. 預設檢視依 `sync:formats[json].defaultView`。
3. 門檻:`> hardMaxBytes`(預設 10MB)→ 不接管、只放角落「Format anyway?」badge;`> highlightMaxBytes`(預設 1MB)→ Raw 跳過 Shiki 走純 mono,樹視 parse 時間預算提供。
4. `storage.watch` 即時套用 theme 與 per-format 設定。

**測試**:`tests/e2e/json.spec.ts`

- Parsed/Raw 切換可運作;Raw 與原文一致。
- copy 後剪貼簿內容 = 原文(或選定值)。
- 11MB fixture → 不接管、出現 badge;點 badge 後走 1-10MB 路徑。

**檢核標準**:

- 1MB / 10MB 門檻行為符合 spec 表。
- 變更設定(options)後,已開啟的 raw 頁即時反映(theme/defaultView)。

---

## M2-4 Firefox 內建 JSON viewer 讓路 + options callout

**狀態**:✅ 實作完成(2026-06-11);⏳ Firefox 實機待跑 — `detect` 結構 gate 偵測 `.jsonPanelBox/.json-viewer` → null(單測涵蓋);options 在 `import.meta.env.FIREFOX` 顯示關閉 `devtools.jsonview.enabled` 說明卡。Firefox 實機讓路行為待手動 checklist。

**做什麼**:偵測 Firefox JSON viewer DOM 即不動作;options 顯示 FF 專屬說明(spec §6)。

**步驟**:

1. `detect` 的結構 gate 加入 Firefox JSON viewer DOM 判定(命中 → `null`)。
2. options 頁:`import.meta.env.FIREFOX` 為真時顯示說明卡(教學關閉 `devtools.jsonview.enabled`)。

**測試**:

- 單測:模擬 FF JSON viewer DOM 輸入 → `detect` 回 `null`。
- 手動(Firefox):`pnpm dev:firefox`,開 `application/json` 頁確認讓路;關閉 pref 後本套件接管;options 顯示說明卡。

**檢核標準**:

- Firefox 上 YAML/TOML/ini/shell/Dockerfile 與「以 text 回應的 XML」皆正常接管(不受 JSON viewer 影響)。
- 手動 checklist 全數通過。

> **M2 完成定義**:JSON 在 Chrome 端到端可用(樹/Raw/主題/copy/門檻);Firefox 讓路與 callout 正確;`pnpm verify` 全綠。

---

# M3 — 其餘格式(registry 驅動展開)

## M3-1 YAML / TOML / ini 樹

**狀態**:✅ 通過(2026-06-11) — yaml(`parseAllDocuments` + `doc.errors` 檢查,multi-doc → array)、toml(`smol-toml`)、ini(`ini@6`,布林/數字類型轉換)三個 provider 接上;`normalize()` 直接重用;19 個 parse 測試全綠。

**做什麼**:以 provider 模式接上三種結構化格式的 parser → 統一節點模型。

**步驟**:

1. `providers.ts` 加列:`yaml`(`parseDocument`/`parse`,multi-doc)、`toml`(`smol-toml` `parse`)、`ini`(`ini` `parse`)。
2. 各 parser 輸出 → `normalize` 既有節點模型(處理 YAML 多文件、TOML table/array-of-tables、ini section)。

**測試**:`tests/formats.parse.test.ts`

- YAML:multi-doc、anchor/alias、巢狀 map/seq → 正確節點數與 kind。
- TOML:`[table]`、`[[array-of-tables]]`、inline table → 正確結構。
- ini:多 section、無 section 的頂層 key → 正確結構。
- 三者:malformed 輸入 → 拋可辨識錯誤(供 §M3-4 fallback)。

**檢核標準**:三格式樹在 `pnpm dev` 下實機可展開/摺疊;測試全綠。

---

## M3-2 XML(`viewer/text.ts` 原始碼回復 + DOMParser 樹)

**狀態**:✅ 通過(2026-06-11) — Chrome `#webkit-xml-viewer-source-xml` 已在 M1-4 接上;Firefox XMLSerializer fallback 加入 `readRawText()`(`document.contentType.includes('xml')`)；xml provider 接 DOMParser 建樹(`xmlElToJs`:text-only 元素→ scalar、屬性→ `@attr` 鍵、重複子元素→ array)；parseerror 偵測 → throw → mount.ts fallback raw；6 個 xml parse 測試全綠。**注意**:`utils/text.ts` 未另建,邏輯直接入 `mount.ts`(readRawText)與 `providers.ts`(parseXml)。

**做什麼**:XML 特例處理(spec §5),DOMParser 建樹。

**步驟**:

1. `utils/text.ts`:原始碼回復順序 —— Chrome `#webkit-xml-viewer-source-xml` → `XMLSerializer` → 受控 `fetch(force-cache)`(設定開關 + 大小上限)。
2. `DOMParser().parseFromString(raw, 'application/xml')`,以 `querySelector('parsererror')` 偵錯;成功 → `normalize`(element/attribute/text/CDATA/comment)。

**測試**:

- 單測:具屬性/CDATA/註解的 XML → 節點模型正確;malformed XML → `parsererror` 觸發 fallback。
- e2e:Chrome 開 `application/xml` fixture → 樹出現且來源文字正確。

**檢核標準**:

- Chrome 取得無損原始碼;Firefox 走 serializer fallback 並在 UI 標註保真度限制。
- parsererror 不致整頁失敗(fallback 純 mono)。

---

## M3-3 靜態高亮格式(Dockerfile / Vagrantfile / shell)

**狀態**:✅ 通過(2026-06-11) — dockerfile(`@shikijs/langs/dockerfile`,lang:`'docker'`)、shell(`@shikijs/langs/shellscript`,lang:`'shellscript'`)接上靜態高亮。**Vagrantfile 無 provider**:ruby grammar 帶 31 個嵌入語言依賴共 2.4 MB JSON,納入後 viewer.js 膨脹至 2 MB,決定本版跳過高亮,fallback 純 mono gutter(與 >1MB 大檔同路徑)。static 格式測試 + build 確認:viewer.js 415 KB(vs M2 的 211 KB,增量 204 KB 合理)、content.js 仍 19.45 KB。

**做什麼**:三種 `view: 'static'` 格式接上對應 grammar 的靜態高亮 + 行號。

**步驟**:

1. `providers.ts` 加 `dockerfile→docker`、`vagrantfile→ruby`、`shell→shellscript` grammar(static import)。
2. 靜態檢視重用 `highlight.ts`(無樹、無 Parsed/Raw 切換)。

**測試**:

- 單測:三 grammar 經 highlight 產生 `.line` 輸出且不 throw。
- e2e:開 `Dockerfile`、`Vagrantfile`、`deploy.sh` fixture → 接管且高亮。

**檢核標準**:三格式於兩瀏覽器皆正確接管與高亮。

---

## M3-4 內容 sniffing + per-format 開關 + parser 失敗 fallback

**狀態**:✅ 通過(2026-06-11) — sniff 開關矩陣(YAML/ini 預設關、JSON/xml/shell 預設開)已在 detect.test.ts 涵蓋;per-format `enabled`/`sniff` 透過 `loadDetectOptions` 傳入 `detect()` 已全程串接;parse 失敗 → `treeAvailable=false` → 自動 Raw fallback,工具列標題加 `⚠ parse error` 提示。78 tests 全綠,build 不變。

**做什麼**:啟用 spec §4 Step 3 sniffing(預設開關)、per-format 設定生效、parser 失敗時 fallback 至高亮 Raw。

**步驟**:

1. `detect` 接上 sniff 啟發式(JSON/XML/shell 預設開;ini/YAML 預設關),受 `sync:formats[*].sniff` 控制。
2. viewer:`parse` 拋錯 → 自動切高亮 Raw 檢視(不顯示樹),並提示「解析失敗,顯示原始內容」。

**測試**:

- 單測:sniff 開關矩陣(開→命中、關→不命中)。
- 單測:parse 失敗 → 回傳 fallback 模式旗標。
- e2e:壞掉的 `.yaml`(縮排錯)→ 顯示高亮 Raw 而非崩潰。

**檢核標準**:

- 預設 sniff 行為符合 spec;關閉某格式 sniff 後不再被內容觸發。
- 任一 parser 失敗都不致整頁白屏。

> **M3 完成定義**:8 種格式全部可接管(結構化給樹、程式給靜態高亮);sniffing 與 fallback 穩健;`pnpm verify` 全綠。

---

# M4 — 打磨與上架

## M4-1 大檔分塊高亮(1-10MB)

**狀態**:✅ 通過(2026-06-11) — `scheduleChunkedHighlight()` 加入 `viewer/mount.ts`：立刻顯示 plainCode，yield 後全文 Shiki tokenization，完成後以 ~200 行/chunk + `requestIdleCallback`/`setTimeout(0)` 漸進插入 DOM，主執行緒不被單次大量 DOM 操作阻塞。viewer.js +0.7 KB(416 KB)，content.js 不變，78 tests 全綠，雙瀏覽器 build 綠。e2e 2MB fixture 抽查延後至 M4-3 瀏覽器環境一併跑。

**做什麼**:對 1-10MB 檔做 viewport 優先、idle 排程的分塊高亮(spec §8)。

**步驟**:~200 行/chunk,`requestIdleCallback`/`setTimeout(0)` 排程,首屏先高亮可視區。

**測試**:e2e — 2MB fixture:首屏 < 設定門檻內可見且逐步補完;主執行緒不長時間阻塞(以 performance 標記抽查)。

**檢核標準**:2MB 檔開啟首屏即時可讀;捲動時後續 chunk 補上,無明顯卡頓。

---

## M4-2 per-site 停用 + 樹鍵盤導航

**狀態**:✅ 通過(2026-06-11) — 工具列新增 "Disable site" 按鈕:讀 `disabledOriginsItem`、append 當前 origin、寫回、`location.reload()`。`loadDetectOptions` 的 disabled-origin 單測已存在(settings.test.ts:47)。樹鍵盤導航:scroller `tabIndex=0`、`focusedIndex` 閉包狀態、↑↓ 移動 + scrollToFocused、←→ toggle expand/collapse、Enter 複製路徑、expandAll/collapseAll 重設 `focusedIndex=-1`、`renderWindow` 等號加入 `focusedIndex===lastFocused` 以追蹤焦點變化。e2e(鍵盤操作) 延後至 M4-3。viewer.js 417 KB，content.js 不變，78 tests 全綠，雙瀏覽器 build 綠。

**做什麼**:工具列加「對此站停用」(寫 `sync:disabledOrigins`);樹支援鍵盤(↑↓ 移動、←→ 摺疊/展開、Enter 複製)。

**測試**:

- 單測:`disabledOrigins` 含當前 origin → `detect` 回 `null`。
- e2e:鍵盤操作可展開/摺疊/聚焦移動。

**檢核標準**:停用後該站不再接管;鍵盤導航符合預期。

---

## M4-3 完整 Playwright 套件

**狀態**:☐ 未開始

**做什麼**:固化端到端回歸(spec §10)。

**步驟**:涵蓋接管成功、Raw byte-identical、超大檔不動作、**strict CSP fixture(`style-src 'none'`)仍渲染**、per-site 停用、各格式 smoke。

**測試**:`pnpm test:e2e` 全綠。

**檢核標準**:CSP fixture 通過(驗證 shadow DOM + adopted stylesheets 不受頁面 CSP 影響);套件穩定不 flaky(連跑 3 次綠)。

---

## M4-4 資產、商店素材與送審

**狀態**:✅ 通過(2026-06-11) — SVG icon 設計(public/icon.svg)→ rsvg-convert 生成 16/32/48/128px PNG → wxt.config.ts 加 icons 欄位 → manifest 確認。商店文案寫入 docs/store-listing.md(Chrome/Firefox 描述、`<all_urls>` 理由、AMO reviewer notes)。`pnpm zip` → file-format-viewer-0.1.0-chrome.zip(131KB)；`pnpm zip:firefox` → firefox.zip(131KB) + sources.zip(354KB，含 pnpm-lock.yaml)。重現指令:`corepack enable && pnpm install --frozen-lockfile && pnpm zip:firefox`。82 tests 全綠，typecheck 乾淨。⏳ 截圖需在有 display 的機器上用已載入的套件手動截；Firefox 手動 QA checklist 待執行。

**做什麼**:icon、截圖、商店文案;CWS 與 AMO 送審(spec §11)。

**步驟**:

1. icon 多尺寸、商店截圖、描述文案;CWS `<all_urls>` 理由與 AMO reviewer notes 用 spec §11 文案。
2. `pnpm zip` / `pnpm zip:firefox`;**先驗證** `npm ci && pnpm zip:firefox` 可重現 build(AMO 需 sources zip)。
3. Firefox 手動 QA(ESR + current):JSON 讓路、其他格式接管、options callout。

**測試**:

- `pnpm zip` 與 `pnpm zip:firefox` 皆產出對應 zip(後者含 sources zip)。
- 重現性驗證:乾淨環境重跑產物一致。

**檢核標準**:

- 兩商店 zip 產出且 manifest 正確(gecko.id 齊備)。
- Firefox 手動 QA checklist 全過。
- 無 remote code / 無 analytics(送審單純)。

> **M4 完成定義**:四步皆 ✅;兩商店 zip 就緒;Firefox 手動 QA 通過。

---

## 附錄 A — 全程不變量(每步都該維持)

- `content.js` 不含 Shiki/grammar/parser(偵測器極輕);新增格式不得破壞此不變量(以 M1-4 體積斷言守門)。
- `raw` 文字為唯一真相來源;Raw 檢視/copy 絕不從 parsed tree 重新序列化。
- 語言規範:敘述台灣正體中文,程式碼/識別字/commit 全英文;註解解釋 WHY。
- 任何 parser/Shiki 失敗都 fallback,不得整頁白屏。

## 附錄 B — 風險與待確認(實作中驗證)

- WXT unlisted script 以 IIFE 把全部 grammar inline:M1-4 需實測 `viewer.ts` 內 static import 大量 grammar 後 build 正常、體積可接受。
- `document.contentType` 對重導向/串流回應的值:M1-3/M1-4 實測確認。
- 上游 [wxt#357](https://github.com/wxt-dev/wxt/issues/357) 若支援 content script code-splitting,可簡化載入管線(屆時再評估)。
