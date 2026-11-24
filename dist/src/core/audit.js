import { AI_CRAWLERS, CN_CRAWLERS, blockedAgents } from './site.js';
export const AUDIT_NOTES = [
    'robots.txt allowing a crawler only means the crawler may fetch; it does not mean the page will be indexed or quoted.',
    'Domestic engines (Baidu, Doubao/Bytespider, Sogou, 360, Yisou) mostly index Chinese-language content, and there is no public API to verify whether a page is in their index. This audit checks configuration only.',
    'Nothing here is measured against a live engine: the default is fully offline and no network request is made.',
];
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
    return { findings, notes: AUDIT_NOTES };
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
