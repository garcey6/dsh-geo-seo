# dsh-geo-seo — 实现细节

本页说明检查器内部如何工作：数据流、模块划分、评分算术、生成契约，以及那些「故意不做」
的地方。插件清单里的 `meta.detail` 指向本文件。

## 1. 设计约束

1. **默认本地、离线。** 内核里没有任何网络调用；CLI 与面板都不抓取外部内容，监测靠人工采样。
2. **事实必须带锚点。** 工具对仓库说的每句话，要么读自文件（带路径，通常带行号），要么由这些值算出。
   指不到行号的规则不会上线。
3. **规则包与引擎分离并带版本号。** 每次输出、文件头注释和报告里都写入 `RULE_PACK_VERSION`，
   同一个仓库同一版本可以复现同一个分数。
4. **绝不编造事实。** 生成器只能复述解析到的内容，JSON-LD 的逐字段校验用机制保证这一点。
5. **不承诺结果。** 输出里（包括面板与生成文件）不出现排名、流量、引用量的预测。

## 2. 分层

```
扫描层 scan.ts
  ├─ markdown.ts      标题、段落、列表、代码块、表格、链接、章节
  ├─ package-json.ts  名称、版本、描述、关键词、许可证、仓库与主页
  ├─ source-ast.ts    导出项、注册的工具/命令、配置项、inject
  └─ site.ts          robots.txt / sitemap.xml / llms.txt / ai.txt / HTML 元信息与 JSON-LD
        ↓  FactGraph（事实 + 锚点 + 解析错误）
规则层 rules.ts       34 条规则 + 3 条提示，每条带扣分与实证级别
        ↓  findings / advisories / ruleErrors
评分层 score.ts       去重、维度封顶、否决项、分档
        ↓  ScoreResult
生成层 generate.ts    llms.txt / llms-full.txt / ai.txt / JSON-LD + 一致性校验
审计层 audit.ts       可抓取性发现 + 固定提示
监测层 monitor.ts     问题库、复测记录、比率、趋势
        ↓
呈现层 render.ts      text | json | markdown
存储层 store.ts       ~/.dsh/geo-seo 下的历史与监测 JSONL
```

依赖是单向的：适配器依赖内核，内核不依赖适配器。`src/core/index.ts` 是唯一公开入口
（`dsh-geo-seo/core`）。

## 3. 事实图

```ts
interface FactGraph {
  dir: string;                 // 目标绝对路径
  scannedAt: string;
  packageJson?: PackageFact;
  docs: MarkdownDoc[];         // README 优先，其次 docs/**，再其次根目录 *.md
  sources: SourceFact[];
  site: SiteAuditFact;
  git: GitFact;                // 无 git 或不可用时 available=false
  files: string[];             // 参与扫描的文件，仓库相对路径、正斜杠
  errors: ParseError[];        // 坏文件只记录，不中断
  mtimes: Record<string, string>;
  declaredUpdatedAt?: string;  // 来自 front matter 或「最后更新」行
}
```

扫描上限：60 个 Markdown、200 个源码文件、深度 8、4000 个条目、单文件 4 MiB。忽略目录包括
`.git`、`node_modules`、`dist`、`build`、`out`、`coverage`、`.next`、`.cache`、`.turbo`、
`vendor`、`.venv`、`__pycache__`、`.idea`、`.vscode`、`tmp`、`.geo-seo`。源码扫描排除测试与
示例目录，避免夹具把分数抬高。

Markdown 用逐行扫描而非完整 CommonMark 实现：ATX/setext 标题、围栏与四空格代码块、带分隔行的
表格、带续行的列表、行内链接与裸 URL、YAML front matter。它对残缺输入刻意宽容：未闭合围栏、
畸形表格、CRLF 都不会抛错。

源码检查是词法级（正则），不是 TypeScript 程序，因此内核零依赖、速度快；代价是高度封装过的注册
代码可能识别不到，所以漏识别工具注册最多只扣机器可读维度的 4 分，而不是错误。

## 4. 规则包

`RULE_PACK = { name: 'geo-seo-core', version: '2026.02.1', released: '2026-02-18',
scoringVersion: 1 }`。每条规则声明维度、严重级别、扣分、实证级别（`strong` / `moderate` /
`weak` / `heuristic`）和一句话理由。

| 维度 | 规则 |
| --- | --- |
| 相关性（28） | REL-001 无 README · REL-002 无一级标题 · REL-003 首段没说清是什么 · REL-004 标题与正文实体不一致 · REL-005 关键词堆砌 · REL-100 文档过短（按缺口折减） |
| 结构（22） | STR-001 标题跳级 · STR-002 无章节结构 · STR-003 核心结论被埋 · STR-004 功能点是散文不是列表 · STR-005 多个一级标题 · STR-006 长页面无目录 |
| 事实密度（18） | FAC-001 无安装命令 · FAC-002 未声明版本 · FAC-003 配置项未文档化 · FAC-004 无可运行示例 · FAC-005 无仓库/反馈链接 · FAC-006 数字无出处 |
| 新鲜度（10） | FRE-001 无更新日期 · FRE-002 日期过旧（>365 天）· FRE-003 声明日期与提交历史不一致（>90 天）· FRE-004 无变更记录 |
| 机器可读（12） | MAC-001 无 JSON-LD · MAC-002 JSON-LD 无效或缺少类型 · MAC-003 无 llms.txt · MAC-004 llms.txt 过薄 · MAC-005 robots 屏蔽 AI 爬虫 |
| 信任线索（7） | TRU-001 无许可证 · TRU-002 无维护者 · TRU-003 无反馈渠道 · TRU-004 无发布历史 |
| 一致性与合规（3） | COM-001 不可证实的承诺（**否决项**）· COM-002 结构化数据超出正文 · COM-003 机器生成内容未标注 |

实证级别描述的是「这条规则有多少依据」，不是「扣多少分」：`heuristic` 是提示，
`strong` 是可度量的矛盾。

## 5. 评分算术

```
dimension.score    = max(0, weight − 该维度扣分合计)
dimension.deducted = weight − score
total              = Σ dimension.score            // 0…100
命中否决项时：     total = min(total, 60)         // capReason 记录命中的规则
```

- REL-100 的扣分为 `28 × (1 − 全部文档字数 / 600)`，保留一位小数：300 字丢掉约一半相关性权重，
  600 字以上不扣。
- 去重键是 `ruleId + 归一化建议`。同一条建议在三个文件命中只扣一次，锚点合并（最多 6 个），
  所以把一段坏文案复制到五页不会成倍扣分。
- 发现按 错误 → 警告 → 提示 排序，再按维度、再按扣分。
- 分档：≥85 excellent，≥70 good，≥50 fair，其余 poor；被否决项压分的报告按压分后的总分取档。

## 6. 生成契约

四个文件都来自**同一个** `FactGraph`，因此彼此不可能互相矛盾。

- **页面选择**：根 README 优先，其次子目录 README，再其次 `docs/`，最后其它 Markdown，
  由 `--max-entries` 控制（默认 20，PRD 要求 10–20）。不足 10 条时给警告，而不是编造条目。
- **来源注释**：`llms.txt` 与 `llms-full.txt` 开头有 HTML 注释，写明引擎版本、规则包版本、
  生成时间和使用的文件。
- **摘要**：能用 package 描述就用描述，否则取第一个有意义的段落；版本、许可证、仓库、主页、
  最后更新这些事实行只在值存在时输出。
- **JSON-LD**：`@type` 只允许 `SoftwareApplication`、`TechArticle`、`FAQPage`。每个字段都与
  可见正文拼接文本核对：`name` 缺失或正文中找不到 → **阻断**，拒绝写入；`description`、
  `softwareVersion`、`author` 找不到 → **丢弃**并逐项报告；`aggregateRating`、`offers`
  无论输入如何都不输出。
- **写入策略**：默认输出到系统临时目录（按仓库哈希分目录）。目标文件已存在且内容不同，在没有
  `--force` 时**跳过并报告**，绝不静默覆盖。`--dry-run` 只报告大小与警告。
- `ai.txt` 与 `llms.txt` 内容逐字节相同（另一命名约定）。

## 7. 可抓取性审计

国际（AUD-INT-001…008）：缺 robots.txt、根路径屏蔽主流 AI 爬虫（GPTBot、OAI-SearchBot、
ChatGPT-User、ClaudeBot、PerplexityBot、Google-Extended、Applebot-Extended、
Meta-ExternalAgent、CCBot 等）、缺 sitemap、sitemap 为空、`noindex`、内容依赖 JS（可见正文
低于 HTML 的 5%）、缺 canonical、canonical 复用。

国内（AUD-CN-001…005）：屏蔽国内爬虫（Baiduspider、Bytespider、Sogou、360Spider、
YisouSpider）、无中文页面、中文页面过短、缺 viewport、屏蔽 Baiduspider。

每次审计都打印三条固定提示：robots 放行不等于会被引用；国内收录状态无法从仓库验证；审计全程离线。

## 8. 可见性监测

`MONITOR_QUESTIONS` 共 24 条固定问题，覆盖定义、安装、配置、排错、对比、价格、隐私、限制、
支持、平台、信任、维护、环境要求、CI、输出、工作流、透明度，以及一个「期望陷阱」
（「你会承诺排名吗？」）。问题文本用 `{name}` 占位，同一套问题适用于任何插件。

每次复测对每个回答记录：问题 id、平台、是否提及、是否引用本站、可选备注。比率 = 提及数/样本数、
引用数/样本数，保留三位小数。`MIN_SAMPLES = 20`，样本不足时汇总标记
`insufficientSample`，所有界面都注明「不具统计意义」。趋势保留最近 10 次。
`compareLastRun` 返回与上一次的差值以及已有次数。工具只记录事实，不解释「为什么被提及」。

## 9. 报告与存储

报告（schema 版本 1）包含：引擎与规则包版本、生成时间、目标、汇总（总分、分档、是否压分、
各级计数、文档数、文件数、耗时）、带发现项的维度、全部发现项、提示项、事实摘要、解析错误。
路径统一为仓库相对路径与正斜杠，因此报告可移植、可 diff。

状态目录由 `DSH_GEO_SEO_HOME` 指定（默认 `~/.dsh/geo-seo`）：
`workspaces/<sha1(path).slice(0,16)>/history.jsonl`、`monitor.jsonl`，以及记录上次目标的
`last-target`。追加式 JSONL，坏行跳过而不破坏历史。

## 10. 宿主集成

`src/index.ts` 导出 `apply(ctx, config)`、`inject = ['webServer']` 与 `Config` 类型，
注册五个工具和一条前缀路由 `/geo-seo/api`：GET `state` / `assets` / `preview` /
`questions` / `monitor`，POST `check` / `generate` / `audit` / `monitor` /
`monitor/import` / `pick-dir` / `open-file`。所有注册都包在 `ctx.effect` 里，热重载时释放
旧路由而不是泄漏。未知路径返回 404，方法不匹配返回 405；目标非法返回 400，消息只写目录名，
绝对路径放在单独的 `detail` 字段里，由面板收进「查看详情」。

面板是 `assets/panel.html`，由宿主路由提供，在侧栏标签页的 iframe 里渲染
（`client/index.js`）。它是一份普通文档：不需要打包器、不依赖 Harness 客户端包、无外部资源。
单页纵向六区：项目选择、评分 Hero、问题卡片，然后是资产 / 可抓取性 / 可见性监测三个折叠区。
每张问题卡片给出优先级、影响、建议，以及由规则的 `promptTemplate` / `promptTemplateEn` 渲染的
提示词；面板复制当前语言的提示词，`--format json` 里也是同一个字符串。
面板的 `POST /generate` 直接写进项目目录（工具侧仍默认写临时目录），因此资产表能把磁盘字节与
生成结果对照。`POST /pick-dir` 在宿主暴露 Electron 时打开原生目录对话框，否则返回
`{ path: null }`，面板于是回退到「高级」里的文本框。语言跟随浏览器，可在面板内切换，
选择记在 localStorage。

## 11. 扩展点

- **新增规则**：在 `src/core/rules.ts` 的 `RULES` 里加一条（维度、级别、扣分、实证级别、
  理由、返回发现项的 `check(ctx)`），提升 `RULE_PACK_VERSION`，并在 `test/` 里加夹具与断言。
- **新增输出格式**：在 `src/core/render.ts` 实现，并把值加入 `OutputFormat`；CLI 与面板自动支持。
- **新增审计检查**：在 `src/core/audit.ts` 追加，使用 `AUD-INT-` 或 `AUD-CN-` 编号并声明 scope；
  固定提示数组共用。

## 12. 已知限制

- 词法级源码检查无法识别把工具名藏在变量后面的注册写法。
- 新鲜度在有 git 时与提交历史对比；没有 git 历史的仓库只能检查是否声明了日期。
- 国际/国内的分组是启发式的：只读仓库里的静态文件，服务端运行时渲染的内容看不到。
- 评分是规则化、确定性的。可见事实相同的两个仓库得分相同——这是刻意设计，但也意味着分数无法
  判断产品是否好用。
