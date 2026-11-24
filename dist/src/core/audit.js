import { AI_CRAWLERS, CN_CRAWLERS, blockedAgents } from './site.js';
import { renderPrompt } from './prompt.js';
export const AUDIT_NOTES = [
    'robots.txt allowing a crawler only means the crawler may fetch; it does not mean the page will be indexed or quoted.',
    'Domestic engines (Baidu, Doubao/Bytespider, Sogou, 360, Yisou) mostly index Chinese-language content, and there is no public API to verify whether a page is in their index. This audit checks configuration only.',
    'Nothing here is measured against a live engine: the default is fully offline and no network request is made.',
];
export const AUDIT_CHECKS = [
    {
        id: 'AUD-INT-001',
        scope: 'international',
        title: 'robots.txt published',
        titleZh: '已发布 robots.txt',
        priority: 'medium',
        impact: 'Without robots.txt the deployment has no way to point crawlers at the sitemap.',
        impactZh: '没有 robots.txt 就无法声明抓取意图，也无法指向 sitemap。',
        promptTemplate: '{file} 不存在。请为站点新增 robots.txt：显式 Allow 想被引用的 AI 爬虫，并加一行 Sitemap: <站点地址>/sitemap.xml。',
        promptTemplateEn: 'There is no {file}. Add one that allows the AI crawlers you want citations from and points at the sitemap with a Sitemap: line.',
    },
    {
        id: 'AUD-INT-002',
        scope: 'international',
        title: 'AI crawlers allowed',
        titleZh: 'AI 爬虫未被屏蔽',
        priority: 'high',
        impact: 'A root Disallow removes every page from those engines at once.',
        impactZh: '根目录 Disallow 会让这些引擎一次性失去全部页面。',
        promptTemplate: '请修改 {file}：删除对 AI 爬虫的整站 Disallow，改为分目录放行；如确需屏蔽，请写明原因。',
        promptTemplateEn: 'Edit {file}: remove the site-wide Disallow for AI crawlers, allow paths selectively, and state a reason if a block is intentional.',
    },
    {
        id: 'AUD-INT-003',
        scope: 'international',
        title: 'sitemap.xml published',
        titleZh: '已发布 sitemap.xml',
        priority: 'medium',
        impact: 'A sitemap is the cheapest way to enumerate canonical URLs for a crawler.',
        impactZh: 'sitemap 是让抓取方枚举规范页面的最低成本方式。',
        promptTemplate: '{file} 不存在。请生成 sitemap.xml，列出所有规范页面 URL，并在 robots.txt 里用 Sitemap: 指向它。',
        promptTemplateEn: 'There is no {file}. Generate a sitemap listing every canonical URL and reference it from robots.txt.',
    },
    {
        id: 'AUD-INT-004',
        scope: 'international',
        title: 'sitemap.xml lists URLs',
        titleZh: 'sitemap 含页面地址',
        priority: 'medium',
        impact: 'An empty sitemap looks published but contributes nothing.',
        impactZh: '空 sitemap 看似已发布，实际没有提供任何信息。',
        promptTemplate: '请在 {file} 的 <urlset> 内补上 <url><loc>…</loc></url> 条目，覆盖所有规范页面。',
        promptTemplateEn: 'Add <url><loc>…</loc></url> entries to {file} for every canonical page.',
    },
    {
        id: 'AUD-INT-005',
        scope: 'international',
        title: 'Pages are indexable',
        titleZh: '页面允许索引',
        priority: 'high',
        impact: 'noindex guarantees the page can never be cited.',
        impactZh: 'noindex 会让页面永远无法被引用。',
        promptTemplate: '请修改 {file}：移除 robots meta 里的 noindex/none，仅对确实不该收录的页面保留。',
        promptTemplateEn: 'Edit {file}: remove noindex/none from the robots meta tag except on pages that genuinely must stay out of the index.',
    },
    {
        id: 'AUD-INT-006',
        scope: 'international',
        title: 'Content is in the HTML',
        titleZh: '正文在 HTML 里',
        priority: 'high',
        impact: 'Most AI crawlers do not run JavaScript, so client-only text is invisible.',
        impactZh: '多数 AI 抓取不执行 JavaScript，纯前端渲染的正文等于不存在。',
        promptTemplate: '请把 {file} 的正文改为服务端渲染或预渲染输出，保证不执行 JS 也能读到完整文本。',
        promptTemplateEn: 'Server-render or pre-render the body of {file} so the full text is readable without running JavaScript.',
    },
    {
        id: 'AUD-INT-007',
        scope: 'international',
        title: 'Canonical link present',
        titleZh: '存在 canonical 链接',
        priority: 'low',
        impact: 'Without a canonical URL the same page can be indexed under several addresses.',
        impactZh: '缺少 canonical 时同一页面可能以多个地址被收录。',
        promptTemplate: '请为 {file} 添加自引用的 <link rel="canonical" href="绝对地址">。',
        promptTemplateEn: 'Add a self-referencing <link rel="canonical"> to {file}.',
    },
    {
        id: 'AUD-INT-008',
        scope: 'international',
        title: 'Canonical URLs are unique',
        titleZh: 'canonical 各不相同',
        priority: 'medium',
        impact: 'A shared canonical hides every page but one from the index.',
        impactZh: '共用 canonical 会让除一页之外的所有页面被索引忽略。',
        promptTemplate: '请检查 {file}：把每个页面的 canonical 改为指向自己的地址，不要多页共用一个。',
        promptTemplateEn: 'Check {file}: make each canonical self-referential instead of sharing one URL across pages.',
    },
    {
        id: 'AUD-CN-001',
        scope: 'domestic',
        title: 'Chinese crawlers allowed',
        titleZh: '中文爬虫未被屏蔽',
        priority: 'high',
        impact: 'Domestic engines cannot index a site that disallows their crawlers.',
        impactZh: '屏蔽中文爬虫后，国内引擎无法收录站点。',
        promptTemplate: '请修改 {file}：放行 Baiduspider、Bytespider 等中文爬虫，或说明必须屏蔽的业务原因。',
        promptTemplateEn: 'Edit {file}: allow Baiduspider, Bytespider and the other Chinese crawlers, or document why they must stay blocked.',
    },
    {
        id: 'AUD-CN-002',
        scope: 'domestic',
        title: 'Chinese-language page exists',
        titleZh: '存在中文页面',
        priority: 'medium',
        impact: 'Domestic engines mostly surface Chinese content for Chinese queries.',
        impactZh: '国内引擎在中文查询下主要展示中文内容。',
        promptTemplate: '请新增中文版文档（如 README.zh-CN.md 或 locale 页面），事实、命令和版本与英文版保持一致。',
        promptTemplateEn: 'Add a Chinese edition (README.zh-CN.md or a locale page) carrying the same facts, commands and version as the English one.',
    },
    {
        id: 'AUD-CN-003',
        scope: 'domestic',
        title: 'Chinese page has depth',
        titleZh: '中文页面内容充足',
        priority: 'low',
        impact: 'A stub Chinese page rarely earns a citation.',
        impactZh: '内容过少的中文页面很难被引用。',
        promptTemplate: '请把 {file} 补充到与英文版同等的深度：安装、配置、示例、限制各一节。',
        promptTemplateEn: 'Bring {file} to the same depth as the English page: install, configuration, examples and limits.',
    },
    {
        id: 'AUD-CN-004',
        scope: 'domestic',
        title: 'Responsive viewport',
        titleZh: '声明移动端 viewport',
        priority: 'medium',
        impact: 'Domestic traffic is mostly mobile; an undeclared viewport renders unpredictably.',
        impactZh: '国内流量以移动端为主，未声明 viewport 会导致渲染不可预期。',
        promptTemplate: '请为 {file} 添加 <meta name="viewport" content="width=device-width, initial-scale=1">，并保证移动端与桌面端正文一致。',
        promptTemplateEn: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to {file} and keep mobile and desktop text identical.',
    },
    {
        id: 'AUD-CN-005',
        scope: 'domestic',
        title: 'Baidu can fetch the page',
        titleZh: '百度可以抓取页面',
        priority: 'medium',
        impact: 'Baiduspider blocked at the root means no Baidu index entry.',
        impactZh: '根目录屏蔽 Baiduspider 意味着无法进入百度索引。',
        promptTemplate: '请修改 {file}：取消对 Baiduspider 的整站 Disallow，改为按目录放行。',
        promptTemplateEn: 'Edit {file}: lift the site-wide Baiduspider Disallow and allow paths selectively instead.',
    },
];
const CHECK_BY_ID = new Map(AUDIT_CHECKS.map((check) => [check.id, check]));
/** Copies the panel half of the checklist onto a finding, once, after the run. */
function withCopy(draft) {
    const meta = CHECK_BY_ID.get(draft.ruleId);
    if (meta === undefined) {
        throw new Error('audit check ' + draft.ruleId + ' has no entry in AUDIT_CHECKS (priority, impact and prompt are required)');
    }
    const anchor = draft.anchors[0];
    const values = { title: draft.title, suggestion: draft.suggestion };
    if (anchor?.file !== undefined)
        values.file = anchor.file;
    if (anchor?.line !== undefined)
        values.line = anchor.line;
    return {
        ...draft,
        priority: meta.priority,
        impact: meta.impact,
        impactZh: meta.impactZh,
        prompt: renderPrompt(meta.promptTemplateEn, values),
        promptZh: renderPrompt(meta.promptTemplate, values),
    };
}
export function runAudit(graph) {
    const findings = [];
    const robots = graph.site.robots;
    const site = graph.site;
    // ------------------------------------------------------ international scope
    if (!robots) {
        findings.push({
            ruleId: 'AUD-INT-001',
            scope: 'international',
            severity: 'warning',
            title: 'No robots.txt',
            detail: 'Crawlers default to allow, but the deployment states no intent and cannot point to a sitemap.',
            suggestion: 'Publish robots.txt with an explicit allow for the AI crawlers you want, plus a Sitemap: line.',
            anchors: [{ file: 'robots.txt' }],
            evidence: 'strong',
        });
    }
    else {
        const blocked = blockedAgents(robots, AI_CRAWLERS);
        if (blocked.length > 0) {
            findings.push({
                ruleId: 'AUD-INT-002',
                scope: 'international',
                severity: 'error',
                title: 'AI crawlers blocked at the root',
                detail: 'robots.txt disallows: ' + blocked.join(', '),
                suggestion: 'Remove the blanket Disallow for the crawlers you want citations from.',
                anchors: [{ file: robots.file, line: 1 }],
                evidence: 'strong',
            });
        }
    }
    if (!site.sitemap) {
        findings.push({
            ruleId: 'AUD-INT-003',
            scope: 'international',
            severity: 'warning',
            title: 'No sitemap.xml',
            detail: 'No sitemap was found in the repository root or the usual static directories.',
            suggestion: 'Generate a sitemap.xml listing every canonical page URL.',
            anchors: [{ file: 'sitemap.xml' }],
            evidence: 'moderate',
        });
    }
    else if (site.sitemap.urls.length === 0) {
        findings.push({
            ruleId: 'AUD-INT-004',
            scope: 'international',
            severity: 'warning',
            title: 'sitemap.xml has no URLs',
            detail: 'The file exists but contains no <loc> entries.',
            suggestion: 'List canonical page URLs in the sitemap.',
            anchors: [{ file: site.sitemap.file, line: 1 }],
            evidence: 'strong',
        });
    }
    for (const meta of site.metaRobots) {
        const value = meta.content.toLowerCase();
        if (value.includes('noindex') || value.includes('none')) {
            findings.push({
                ruleId: 'AUD-INT-005',
                scope: 'international',
                severity: 'error',
                title: 'Page is marked noindex',
                detail: meta.file + ':' + meta.line + ' sets robots="' + meta.content + '".',
                suggestion: 'Remove noindex from pages you want cited.',
                anchors: [{ file: meta.file, line: meta.line }],
                evidence: 'strong',
            });
        }
    }
    const jsOnly = site.htmlFiles.filter((file) => file.chars > 0 && file.textChars / file.chars < 0.05);
    if (jsOnly.length > 0) {
        findings.push({
            ruleId: 'AUD-INT-006',
            scope: 'international',
            severity: 'error',
            title: 'Content is not in the HTML',
            detail: 'Less than 5% of these files is text: ' + jsOnly.map((file) => file.file).join(', '),
            suggestion: 'Server-render or pre-render the content: most AI crawlers do not execute JavaScript.',
            anchors: jsOnly.slice(0, 3).map((file) => ({ file: file.file, line: 1 })),
            evidence: 'strong',
        });
    }
    if (site.canonicals.length === 0 && site.htmlFiles.length > 0) {
        findings.push({
            ruleId: 'AUD-INT-007',
            scope: 'international',
            severity: 'info',
            title: 'No canonical link',
            detail: 'No <link rel="canonical"> was found in the static HTML entry points.',
            suggestion: 'Add a self-referencing canonical URL to every page.',
            anchors: site.htmlFiles.slice(0, 3).map((file) => ({ file: file.file, line: 1 })),
            evidence: 'moderate',
        });
    }
    else {
        const seen = new Map();
        for (const canonical of site.canonicals) {
            const list = seen.get(canonical.href) ?? [];
            list.push(canonical.file + ':' + canonical.line);
            seen.set(canonical.href, list);
        }
        for (const [href, places] of seen) {
            if (places.length > 1) {
                findings.push({
                    ruleId: 'AUD-INT-008',
                    scope: 'international',
                    severity: 'warning',
                    title: 'Canonical URL used by several pages',
                    detail: 'Cookie-cutter canonical "' + href + '" on ' + places.join(', '),
                    suggestion: 'Make each canonical self-referential; shared canonical URLs hide pages from indexes.',
                    anchors: [{ file: places[0]?.split(':')[0] ?? 'index.html', line: 1 }],
                    evidence: 'strong',
                });
            }
        }
    }
    // ----------------------------------------------------------- domestic scope
    if (robots) {
        const blockedCn = blockedAgents(robots, CN_CRAWLERS);
        if (blockedCn.length > 0) {
            findings.push({
                ruleId: 'AUD-CN-001',
                scope: 'domestic',
                severity: 'error',
                title: 'Chinese crawlers blocked at the root',
                detail: 'robots.txt disallows: ' + blockedCn.join(', '),
                suggestion: 'Allow the Chinese crawlers you want to index the page.',
                anchors: [{ file: robots.file, line: 1 }],
                evidence: 'strong',
            });
        }
    }
    const chineseDocs = graph.docs.filter((doc) => /[\u4e00-\u9fff]/.test(doc.raw));
    if (chineseDocs.length === 0) {
        findings.push({
            ruleId: 'AUD-CN-002',
            scope: 'domestic',
            severity: 'warning',
            title: 'No Chinese-language page',
            detail: 'All documentation is non-Chinese; domestic engines mostly surface Chinese content for Chinese queries.',
            suggestion: 'Add a Chinese README or a zh-CN locale page with the same facts as the English one.',
            anchors: [{ file: 'README.md' }],
            evidence: 'moderate',
        });
    }
    else {
        const readable = chineseDocs.filter((doc) => doc.wordCount > 150);
        if (readable.length === 0) {
            findings.push({
                ruleId: 'AUD-CN-003',
                scope: 'domestic',
                severity: 'info',
                title: 'Chinese page is very short',
                detail: 'Chinese content exists but no Chinese document exceeds 150 words.',
                suggestion: 'Give the Chinese page the same depth as the English one.',
                anchors: chineseDocs.slice(0, 2).map((doc) => ({ file: doc.file, line: 1 })),
                evidence: 'weak',
            });
        }
    }
    const noViewport = site.htmlFiles.filter((file) => !file.viewport);
    if (noViewport.length > 0) {
        findings.push({
            ruleId: 'AUD-CN-004',
            scope: 'domestic',
            severity: 'warning',
            title: 'No responsive viewport',
            detail: 'These pages declare no <meta name="viewport">, so the mobile rendering is unknown: ' + noViewport.map((file) => file.file).join(', '),
            suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and keep mobile and desktop content identical.',
            anchors: noViewport.slice(0, 3).map((file) => ({ file: file.file, line: 1 })),
            evidence: 'moderate',
        });
    }
    const blockedDomestic = blockedAgents(robots, ['baiduspider']);
    if (blockedDomestic.length > 0) {
        findings.push({
            ruleId: 'AUD-CN-005',
            scope: 'domestic',
            severity: 'warning',
            title: 'Baidu cannot fetch the page',
            detail: 'robots.txt disallows Baiduspider at "/".',
            suggestion: 'Unblock Baiduspider if you want the page in the Baidu index.',
            anchors: robots ? [{ file: robots.file, line: 1 }] : [{ file: 'robots.txt' }],
            evidence: 'strong',
        });
    }
    const annotated = findings.map(withCopy);
    const failed = new Set(annotated.map((finding) => finding.ruleId));
    const checks = AUDIT_CHECKS.map((meta) => ({
        id: meta.id,
        scope: meta.scope,
        title: meta.title,
        titleZh: meta.titleZh,
        ok: !failed.has(meta.id),
    }));
    return { findings: annotated, notes: AUDIT_NOTES, checks };
}
export function auditSummary(result) {
    const summary = { errors: 0, warnings: 0, infos: 0 };
    for (const finding of result.findings) {
        if (finding.severity === 'error')
            summary.errors += 1;
        else if (finding.severity === 'warning')
            summary.warnings += 1;
        else
            summary.infos += 1;
    }
    return summary;
}
