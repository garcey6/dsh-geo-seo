# dsh-geo-seo · 项目简介

「招牌」文案库：四种长度、中英各一套，可直接取用到 GitHub About、package.json、插件市场卡片、README 开头与 llms.txt 摘要。每一版都按本项目的规则写——结论前置、实体同名、事实可核验、明确边界、不承诺排名。

---

## 中文

### 一句话（≤ 40 字）

给 AI 引擎看的 SEO：读出仓库里的真实事实，按七维 100 分制打分，扣分精确到行。

### 卡片版（≤ 90 字）

dsh-geo-seo 是一个 DSH 插件与 CLI。它读取真实仓库——README、package.json、源码、robots.txt、sitemap——用 34 条规则在七个维度上给出 100 分制评分，扣分定位到 file:line，并能从同一份事实图一次生成 llms.txt、llms-full.txt、ai.txt 与 JSON-LD。全程离线，结果可复现，不承诺排名。

### 标准版（README / 发布页开头）

dsh-geo-seo 是一个 DSH 插件兼 CLI，用来测量项目文档在 AI 引擎里能不能被读懂、能不能被引用，并指出该改哪几行。

它不猜排名。它读你的仓库——README、package.json、源码、robots.txt、sitemap、HTML——建成一张带 `file:line` 锚点的事实图，再按七维加权规则打分（主题相关性 28、关键信息结构 22、事实密度 18、时间新鲜度 10、机器可读 12、信任线索 7、合规 3，合计 100）。扣分项指向行号，每条建议标注实证权重：strong / moderate / weak / heuristic。

四件事，一条链路：

- 解析：README 结构、包元数据、源码里导出的函数与注册的工具，每个事实带来源锚点
- 评分：34 条规则跑在事实图上；严重合规问题把总分封顶 60，文档过短按缺口比例折减
- 生成：llms.txt、llms-full.txt、ai.txt、JSON-LD，只写正文能核对的字段，校验不过就拒写
- 监测：24 条问题库逐次复测，样本不足 20 条时只记事实、不给结论

安装并跑第一次检查：

```bash
pnpm add -D dsh-geo-seo
geo-seo check --dir . --format text
```

当前版本 0.1.0，要求 Node 22.6 与 DSH 0.30 及以上；MIT 许可；维护者 garcey。默认完全离线：不联网、不上传、不调用第三方接口。

边界写在明面上：不预测排名、流量或引用；robots 放行不等于国内引擎可引用；监测样本不足时不给结论。

### 长版（GitHub About / 市场详情页）

**问题**：AI 引擎读你的项目，和人类读你的项目，不是同一件事。它不看导航、不点展开、不执行 JS，只抓它认得的文本与结构；被截断、被误判、被当成营销话术的部分，直接不进入回答。

**做法**：dsh-geo-seo 不做关键词堆砌，也不做「排名提升」的承诺。它把仓库解析成事实图——文档结构、包元数据、源码里的导出与工具、robots 与 sitemap、页面可见正文——每个事实都带来源锚点（文件、行号、节点路径）。规则层在这张图上跑，产出可复核的扣分明细；生成层用同一份事实渲染机器可读资产；呈现层只负责展示，不参与判断。

**结果**：一个 0–100 的总分、七个维度的分解、按严重度排序的扣分清单（附改写建议与证据级别），以及四个可直接发布的文件：llms.txt、llms-full.txt、ai.txt、structured-data.jsonld。

**为什么不吹效果**：排名、流量、引用三者都无法归因到单一页面改动，任何「提升 X%」的承诺都不可证伪。这个工具只做一件事——把「引擎能否读懂、能否核验」变成可测量、可回归的数字。

### llms.txt 摘要行（≤ 240 字符，供本仓库自身生成时使用）

dsh-geo-seo 是一个 DSH 插件与 CLI，读取仓库事实并按七维 100 分制评估 GEO 就绪度，扣分定位到 file:line，可一次生成 llms.txt、llms-full.txt、ai.txt 与 JSON-LD；离线运行，不承诺排名。

---

## English

### One line

SEO for engines that read: measure what a repository actually says, score it across seven weighted dimensions, and fix the exact lines that block citation.

### Card

dsh-geo-seo is a DSH plugin and CLI. It reads the real repository — README, package.json, sources, robots.txt, sitemap — scores documentation against 34 rules across seven weighted dimensions out of 100, points every deduction at a file and line, and renders llms.txt, llms-full.txt, ai.txt and JSON-LD from the same fact graph. Offline, deterministic, and it never promises a ranking.

### Standard

dsh-geo-seo is a DSH plugin and CLI that measures whether AI engines can read and cite your project documentation, and points at the lines to fix.

It does not predict rankings. It reads the repository — README, package.json, sources, robots.txt, sitemap, HTML — builds a fact graph with `file:line` anchors, then scores it against weighted rules across seven dimensions (topic relevance 28, structure 22, fact density 18, freshness 10, machine-readable 12, trust 7, compliance 3, for 100 points total). Deductions point at lines; every suggestion states its evidence strength: strong, moderate, weak or heuristic.

Four steps, one pipeline:

- Parse: README structure, package metadata, exported functions and registered tools, each fact carrying a source anchor
- Score: 34 rules over the graph; a compliance gate caps the total at 60, short documents reduce relevance proportionally
- Generate: llms.txt, llms-full.txt, ai.txt and JSON-LD with verifiable fields only; it refuses to write when the consistency check fails
- Monitor: a 24-question bank re-run over time, reported as facts until 20 samples exist

Install and run the first check:

```bash
pnpm add -D dsh-geo-seo
geo-seo check --dir . --format text
```

Current version 0.1.0; requires Node 22.6+ and DSH 0.30+; MIT licensed; maintained by garcey. Offline by default: no network calls, no uploads, no third-party APIs.

The limits are part of the product: no ranking, traffic or citation forecasts; an open robots.txt does not mean a Chinese engine will cite you; monitoring data under 20 samples is reported as facts without a verdict.

### Long

**The problem.** An AI engine reading your project is not the same reader as a human. It does not use navigation, expand accordions or run JavaScript; it takes the text and structure it can parse. Whatever is truncated, misclassified or reads like marketing simply does not make it into the answer.

**The approach.** dsh-geo-seo does not stuff keywords and does not sell ranking promises. It parses the repository into a fact graph — document structure, package metadata, exported functions and registered tools, robots and sitemap, visible page text — with a source anchor for every fact (file, line, node path). The rule layer evaluates that graph and produces auditable deductions; the generate layer renders machine-readable assets from the same facts; the presentation layer only displays, never decides.

**The output.** A 0–100 score, seven dimension sub-scores, a severity-ordered list of deductions with rewrite suggestions and evidence levels, and four publishable files: llms.txt, llms-full.txt, ai.txt, structured-data.jsonld.

**Why no effect claims.** Ranking, traffic and citations cannot be attributed to a single page edit; any "X% uplift" claim is unfalsifiable. This tool does one thing instead — turns "can an engine read and verify this?" into a number that can be measured and regression-tested.

### llms.txt summary line (≤ 240 chars)

dsh-geo-seo is a DSH plugin and CLI that scores repository documentation for AI-engine readability across seven weighted dimensions out of 100, points deductions at file:line, and renders llms.txt, llms-full.txt, ai.txt and JSON-LD. Offline; no ranking promises.

---

## 落位建议

| 位置 | 用哪一版 | 备注 |
|---|---|---|
| `package.json` 的 `description` | 卡片版首句（约 160 字符） | npm / 插件列表会截断，第二句留给详情页 |
| GitHub About | 一句话 + 关键词 | 关键词用 `geo`、`seo`、`llms.txt`、`dsh-plugin` |
| 插件市场卡片 | 卡片版 | 与 `locale/*.json` 的 `meta.description` 保持一致 |
| README 首段 | 标准版 | 首段决定「是否回答了它是什么」这一维度 |
| 发布页 / 详情页 | 长版 | 四个小标题本身就是可被抓取的结构 |
| 本仓库生成的 llms.txt | 摘要行 | 与 README 首段同义，避免实体漂移 |

一致性要求：六处文案对同一实体的称呼必须一致——插件叫 **dsh-geo-seo**，CLI 二进制叫 **geo-seo**，不要混写成「GEO SEO 工具」「SEO 插件」。

