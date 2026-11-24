/**
 * DSH host entry for dsh-geo-seo.
 *
 * The plugin keeps the same engine the CLI uses (src/core) and exposes it two
 * ways: as model tools, and as a small HTTP surface the sidebar panel calls.
 * Every registration goes through ctx.effect so a plugin reload disposes it
 * instead of leaking a second route or tool.
 */
import fs from 'node:fs';
import path from 'node:path';
import { runCheck } from './core/engine.js';
import { generateAssets } from './core/generate.js';
import { runAudit } from './core/audit.js';
import { MONITOR_QUESTIONS, questionText, summarizeMonitor, compareLastRun, recordRun } from './core/monitor.js';
import { renderReport, renderGenerate, renderAudit, renderMonitor } from './core/render.js';
import { panelHtml } from './panel.js';
import { appendHistory, appendMonitorRun, readHistory, readMonitorRuns, recallTarget, rememberTarget, } from './core/store.js';
import { RULE_PACK, RULE_PACK_VERSION } from './core/rules.js';
/** Plugin id, used for log prefixes and client route discovery. */
export const name = 'dsh-geo-seo';
/**
 * Services this plugin needs. The web server is required for the panel; the
 * tools service is optional (a headless host may not expose one).
 */
export const inject = ['webServer'];
/** Route prefix the sidebar panel talks to. */
const ROUTE_PREFIX = '/geo-seo/api';
/** Every endpoint the router answers; anything else is a 404, not a 405. */
const KNOWN_ENDPOINTS = new Set(['/state', '/panel', '/monitor', '/questions', '/check', '/generate', '/audit']);
/** Absolute paths the panel may scan, one per process (path-escape guard). */
const MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
    if (res.headersSent === true) {
        res.destroy?.();
        return;
    }
    const payload = JSON.stringify(body);
    res.writeHead?.(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end?.(payload);
}
async function readBody(req) {
    const chunks = [];
    let total = 0;
    const iterator = req[Symbol.asyncIterator];
    if (typeof iterator !== 'function')
        return undefined;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        total += buffer.length;
        if (total > MAX_BODY_BYTES)
            throw new Error('request body is too large');
        chunks.push(buffer);
    }
    if (chunks.length === 0)
        return undefined;
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (text === '')
        return undefined;
    return JSON.parse(text);
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function stringField(source, key) {
    const value = source[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
/**
 * Resolve the directory to scan: explicit argument, the last scan target, the
 * configured default, or the host working directory — in that order.
 */
function resolveTarget(explicit, config) {
    const candidate = explicit ?? config.defaultDir ?? recallTarget() ?? process.cwd();
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved)) {
        throw new Error(`directory not found: ${resolved}`);
    }
    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error(`not a directory: ${resolved}`);
    }
    return resolved;
}
function checkDirectory(dir, remember = true) {
    const started = Date.now();
    const outcome = runCheck(dir, { git: true });
    const report = outcome.report;
    if (remember) {
        appendHistory(dir, report);
        rememberTarget(dir);
    }
    return { report, history: readHistory(dir, 20), durationMs: Date.now() - started };
}
function monitorPayload(dir) {
    const runs = readMonitorRuns(dir);
    const summary = summarizeMonitor(runs);
    return { summary, runs: runs.slice(-20), compare: compareLastRun(runs) };
}
function generateFor(dir, body) {
    const graph = runCheck(dir).graph;
    const options = {};
    const outDir = stringField(body, 'outDir');
    if (outDir !== undefined)
        options.outDir = path.resolve(dir, outDir);
    if (body.force === true)
        options.force = true;
    if (body.dryRun === true)
        options.dryRun = true;
    const maxEntries = body.maxEntries;
    if (typeof maxEntries === 'number' && Number.isFinite(maxEntries))
        options.maxEntries = maxEntries;
    return generateAssets(graph, options);
}
export function apply(ctx, config = {}) {
    const registerRoute = ctx.webServer?.register;
    if (typeof registerRoute !== 'function') {
        ctx.logger?.('dsh-geo-seo')?.warn?.('web server service is unavailable — the panel cannot reach the engine');
    }
    else {
        const handler = async (req, res) => {
            const rawUrl = typeof req.url === 'string' ? req.url : '/';
            const queryStart = rawUrl.indexOf('?');
            const pathname = queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart);
            const query = new URLSearchParams(queryStart === -1 ? '' : rawUrl.slice(queryStart + 1));
            const sub = pathname.startsWith(ROUTE_PREFIX) ? pathname.slice(ROUTE_PREFIX.length) : pathname;
            const method = (req.method ?? 'GET').toUpperCase();
            try {
                if (sub === '/state' && method === 'GET') {
                    const target = query.get('dir') ?? recallTarget() ?? config.defaultDir ?? process.cwd();
                    const resolved = path.resolve(target);
                    const history = fs.existsSync(resolved) ? readHistory(resolved, 20) : [];
                    const runs = fs.existsSync(resolved) ? readMonitorRuns(resolved) : [];
                    sendJson(res, 200, { ok: true, value: { target: resolved, history, monitorRuns: runs.slice(-20), rulePack: RULE_PACK, rulePackVersion: RULE_PACK_VERSION } });
                    return;
                }
                if (sub === '/panel' && (method === 'GET' || method === 'HEAD')) {
                    const html = panelHtml();
                    res.writeHead?.(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
                    if (method === 'HEAD') {
                        res.end?.();
                        return;
                    }
                    res.end?.(html);
                    return;
                }
                if (sub === '/monitor' && method === 'GET') {
                    const target = query.get('dir') ?? recallTarget() ?? config.defaultDir ?? process.cwd();
                    const resolved = path.resolve(target);
                    const value = fs.existsSync(resolved)
                        ? monitorPayload(resolved)
                        : { summary: summarizeMonitor([]), runs: [], compare: null };
                    sendJson(res, 200, { ok: true, value });
                    return;
                }
                if (sub === '/questions' && method === 'GET') {
                    sendJson(res, 200, { ok: true, value: { questions: MONITOR_QUESTIONS, minSamples: 20 } });
                    return;
                }
                if (method === 'POST') {
                    const body = asRecord(await readBody(req));
                    const explicit = stringField(body, 'dir') ?? query.get('dir') ?? undefined;
                    if (sub === '/check') {
                        const payload = checkDirectory(resolveTarget(explicit, config));
                        sendJson(res, 200, { ok: true, value: payload });
                        return;
                    }
                    if (sub === '/generate') {
                        const dir = resolveTarget(explicit, config);
                        const result = generateFor(dir, body);
                        sendJson(res, 200, { ok: true, value: result });
                        return;
                    }
                    if (sub === '/audit') {
                        const dir = resolveTarget(explicit, config);
                        const graph = runCheck(dir).graph;
                        const result = runAudit(graph);
                        sendJson(res, 200, { ok: true, value: result });
                        return;
                    }
                    if (sub === '/monitor') {
                        const dir = resolveTarget(explicit, config);
                        const platform = stringField(body, 'platform') ?? 'unspecified';
                        const rawAnswers = Array.isArray(body.answers) ? body.answers : [];
                        const answers = rawAnswers.map((entry) => {
                            const record = asRecord(entry);
                            const answer = {
                                questionId: stringField(record, 'questionId') ?? '',
                                platform,
                                mentioned: record.mentioned === true,
                                cited: record.cited === true,
                            };
                            const note = stringField(record, 'note');
                            if (note !== undefined)
                                answer.note = note;
                            return answer;
                        });
                        const run = recordRun({ target: dir, name: path.basename(dir), platform, answers });
                        appendMonitorRun(dir, run);
                        sendJson(res, 200, { ok: true, value: monitorPayload(dir) });
                        return;
                    }
                    sendJson(res, 404, { ok: false, error: `unknown endpoint: ${sub}` });
                    return;
                }
                if (!KNOWN_ENDPOINTS.has(sub)) {
                    sendJson(res, 404, { ok: false, error: `unknown endpoint: ${sub}` });
                    return;
                }
                sendJson(res, 405, { ok: false, error: `method ${method} is not allowed for ${sub}` });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                sendJson(res, 400, { ok: false, error: message });
            }
        };
        ctx.effect?.(() => {
            const dispose = registerRoute({ kind: 'prefix', path: ROUTE_PREFIX, handler });
            return () => {
                if (typeof dispose === 'function')
                    dispose();
            };
        });
    }
    if (config.tools === false)
        return;
    const registerTool = ctx.tools?.register;
    if (typeof registerTool !== 'function')
        return;
    const renderText = (text) => [{ type: 'text', text }];
    const tools = [
        {
            name: 'geo_seo_check',
            description: 'Score a local project for GEO/SEO readiness (answer-level retrievability, not ranking). Returns the 100-point total, per-dimension scores, deductions located at file:line, and rationale for each weighted rule.',
            parameters: {
                dir: { type: 'string', description: 'Absolute or cwd-relative project directory. Defaults to the last scanned directory.' },
                format: { type: 'string', description: 'Output format: text (default), markdown, or json.' },
            },
            output: {
                schema: { type: 'string' },
                render: (args, value) => renderText(value),
            },
            isConcurrencySafe: () => true,
            execute: async (args) => {
                const dir = resolveTarget(args.dir, config);
                const payload = checkDirectory(dir);
                const format = args.format === 'markdown' ? 'markdown' : args.format === 'json' ? 'json' : 'text';
                return renderReport(payload.report, format, { color: false });
            },
        },
        {
            name: 'geo_seo_generate',
            description: 'Render llms.txt, llms-full.txt, ai.txt and structured-data.jsonld from one parse of the repository. Refuses to overwrite existing files without force, and refuses to write JSON-LD whose claims cannot be found in visible copy.',
            parameters: {
                dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
                outDir: { type: 'string', description: 'Output directory (defaults to a temp directory).' },
                force: { type: 'boolean', description: 'Overwrite existing files whose content differs.' },
                dryRun: { type: 'boolean', description: 'Report what would be written without touching disk.' },
                maxEntries: { type: 'number', description: 'Maximum core pages listed (10-20 recommended).' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => renderText(value),
            },
            isConcurrencySafe: () => false,
            execute: async (args) => {
                const dir = resolveTarget(args.dir, config);
                const result = generateFor(dir, args);
                return renderGenerate(result, 'text', { color: false });
            },
        },
        {
            name: 'geo_seo_audit',
            description: 'Check crawler reachability: robots.txt rules for AI crawlers, sitemap, meta robots, canonical, JS-gated content, and the domestic-engine configuration checks. Reachability is not a citation guarantee.',
            parameters: {
                dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => renderText(value),
            },
            isConcurrencySafe: () => true,
            execute: async (args) => {
                const dir = resolveTarget(args.dir, config);
                const graph = runCheck(dir).graph;
                return renderAudit(runAudit(graph), 'text', { color: false });
            },
        },
        {
            name: 'geo_seo_monitor',
            description: 'Record or summarise visibility monitoring samples: a fixed 20+ question library, whether the product is mentioned, whether the site is cited, and the trend with an explicit insufficient-sample warning.',
            parameters: {
                dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
                platform: { type: 'string', description: 'Platform name for a new sample (e.g. chatgpt, perplexity). Omit to read history.' },
                answers: { type: 'json', description: 'Array of { questionId, mentioned, cited, note? } for one sample.' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => renderText(value),
            },
            isConcurrencySafe: () => false,
            execute: async (args) => {
                const dir = resolveTarget(args.dir, config);
                if (args.platform !== undefined && Array.isArray(args.answers)) {
                    const platform = args.platform;
                    const answers = args.answers.map((entry) => {
                        const record = asRecord(entry);
                        return {
                            questionId: stringField(record, 'questionId') ?? '',
                            platform,
                            mentioned: record.mentioned === true,
                            cited: record.cited === true,
                        };
                    });
                    appendMonitorRun(dir, recordRun({ target: dir, name: path.basename(dir), platform: args.platform, answers }));
                }
                const runs = readMonitorRuns(dir);
                return renderMonitor(summarizeMonitor(runs), 'text', { color: false });
            },
        },
        {
            name: 'geo_seo_questions',
            description: 'List the fixed monitoring question library used by geo_seo_monitor, with the {name} placeholder already filled in.',
            parameters: {
                name: { type: 'string', description: 'Product name used to fill the question templates.' },
            },
            output: {
                schema: { type: 'string' },
                render: (_args, value) => renderText(value),
            },
            isConcurrencySafe: () => true,
            execute: async (args) => {
                const product = args.name ?? 'the plugin';
                return MONITOR_QUESTIONS.map((q) => `${q.id}  ${q.intent}  ${questionText(q, product)}`).join('\n');
            },
        },
    ];
    ctx.effect?.(() => {
        const disposers = [];
        for (const definition of tools) {
            try {
                const dispose = registerTool(definition);
                if (typeof dispose === 'function')
                    disposers.push(dispose);
            }
            catch (error) {
                ctx.logger?.('dsh-geo-seo')?.warn?.(`tool registration failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return () => {
            for (const dispose of disposers)
                dispose();
        };
    });
}
