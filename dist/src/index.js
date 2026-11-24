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
 * tools registry is optional (a headless host may not expose one), so it is
 * read through `ctx.reflect.get` instead of being injected — cordis throws on
 * `ctx.<name>` reads for services that are not declared.
 */
export const inject = ['webServer'];
/**
 * Read a service that may legitimately be absent. `ctx.<name>` reads throw for
 * services the plugin did not declare, so optional ones go through the reflect
 * service, which returns undefined instead (strict = false: value from a
 * providing fiber that is not active yet still counts).
 */
function readOptionalService(ctx, name) {
    const reflect = ctx.reflect;
    if (typeof reflect?.get !== 'function')
        return undefined;
    try {
        return reflect.get(name, false);
    }
    catch {
        return undefined;
    }
}
/** Route prefix the sidebar panel talks to. */
const ROUTE_PREFIX = '/geo-seo/api';
/** Every endpoint the router answers; anything else is a 404, not a 405. */
const KNOWN_ENDPOINTS = new Set([
    '/state',
    '/panel',
    '/monitor',
    '/questions',
    '/check',
    '/generate',
    '/audit',
    '/assets',
    '/preview',
    '/pick-dir',
    '/open-file',
    '/monitor/import',
]);
/** The four generated assets, in the order the panel lists them. */
const ASSET_NAMES = ['llms.txt', 'llms-full.txt', 'ai.txt', 'structured-data.jsonld'];
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
 * A scan target that cannot be used. The message names only the last path
 * segment so an error banner never leaks the host's absolute layout; the full
 * path travels in `target` for the collapsed "details" disclosure.
 */
class TargetError extends Error {
    code;
    target;
    constructor(code, target) {
        super((code === 'not-found' ? 'directory not found: ' : 'not a directory: ') + path.basename(target));
        this.code = code;
        this.target = target;
    }
}
/**
 * Resolve the directory to scan: explicit argument, the last scan target, the
 * configured default, or the host working directory — in that order.
 */
function resolveTarget(explicit, config) {
    const candidate = explicit ?? config.defaultDir ?? recallTarget() ?? process.cwd();
    const resolved = path.resolve(candidate);
    if (!fs.existsSync(resolved))
        throw new TargetError('not-found', resolved);
    if (!fs.statSync(resolved).isDirectory())
        throw new TargetError('not-a-directory', resolved);
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
/** Coerce the loosely-typed answers array the panel (or an import file) sends. */
function toMonitorAnswers(raw, fallbackPlatform) {
    const list = Array.isArray(raw) ? raw : [];
    const answers = [];
    for (const entry of list) {
        const record = asRecord(entry);
        const questionId = stringField(record, 'questionId');
        if (questionId === undefined)
            continue;
        const answer = {
            questionId,
            platform: stringField(record, 'platform') ?? fallbackPlatform,
            mentioned: record.mentioned === true,
            cited: record.cited === true,
        };
        const note = stringField(record, 'note');
        if (note !== undefined)
            answer.note = note;
        answers.push(answer);
    }
    return answers;
}
/** Panel previews are capped so a huge generated asset cannot stall the tab. */
const MAX_PREVIEW_CHARS = 200 * 1024;
function monitorPayload(dir) {
    const runs = readMonitorRuns(dir);
    const summary = summarizeMonitor(runs);
    return { summary, runs: runs.slice(-20), compare: compareLastRun(runs) };
}
function generateFor(dir, body, fallbackOutDir) {
    const graph = runCheck(dir).graph;
    const options = {};
    const outDir = stringField(body, 'outDir') ?? fallbackOutDir;
    if (outDir !== undefined)
        options.outDir = path.resolve(dir, outDir);
    if (body.force === true)
        options.force = true;
    if (body.dryRun === true)
        options.dryRun = true;
    const maxEntries = body.maxEntries;
    if (typeof maxEntries === 'number' && Number.isFinite(maxEntries))
        options.maxEntries = maxEntries;
    const requested = Array.isArray(body.files) ? body.files.filter((name) => typeof name === 'string') : [];
    const names = requested.filter((name) => ASSET_NAMES.includes(name));
    if (names.length > 0)
        options.names = names;
    return generateAssets(graph, options);
}
/**
 * What exists next to the project versus what the generator would write now.
 * A dry run gives the expected size and the verification verdict without
 * touching disk, so the panel can say "3 of 4 up to date".
 */
function assetsPayload(dir) {
    const graph = runCheck(dir).graph;
    const preview = generateAssets(graph, { outDir: dir, dryRun: true });
    const expected = new Map(preview.files.map((file) => [path.basename(file.path), file]));
    const files = ASSET_NAMES.map((name) => {
        const target = path.join(dir, name);
        const exists = fs.existsSync(target);
        const stat = exists ? fs.statSync(target) : undefined;
        const planned = expected.get(name);
        const expectedBytes = planned?.bytes ?? 0;
        const bytes = stat?.size ?? 0;
        const status = stat === undefined ? 'missing' : bytes === expectedBytes ? 'current' : 'stale';
        const item = { name, path: target, exists, bytes, expectedBytes, status };
        if (stat !== undefined)
            item.generatedAt = stat.mtime.toISOString();
        // A missing file is not stale; the dry-run reason would only add noise.
        if (status === 'stale' && planned?.reason !== undefined)
            item.reason = planned.reason;
        return item;
    });
    return { dir, files, verification: preview.verification };
}
/** Electron is not a typed dependency (the CLI never loads it), so import it softly. */
const dynamicImport = new Function('specifier', 'return import(specifier)');
/** Opens the host's native directory picker; undefined when no bridge exists. */
async function pickDirectory() {
    try {
        const electron = await dynamicImport('electron');
        const dialog = electron?.dialog ?? electron?.default?.dialog;
        if (dialog === undefined || typeof dialog.showOpenDialog !== 'function')
            return undefined;
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Select a project directory' });
        if (result?.canceled === true)
            return undefined;
        const chosen = Array.isArray(result?.filePaths) ? result.filePaths[0] : undefined;
        return typeof chosen === 'string' && chosen !== '' ? chosen : undefined;
    }
    catch {
        return undefined;
    }
}
/** Hands a file:line target to the OS so the host's editor opens it. */
async function openInEditor(target) {
    try {
        const electron = await dynamicImport('electron');
        const shell = electron?.shell ?? electron?.default?.shell;
        if (shell === undefined || typeof shell.openPath !== 'function')
            return false;
        const failure = await shell.openPath(target);
        return typeof failure === 'string' ? failure === '' : true;
    }
    catch {
        return false;
    }
}
export function apply(ctx, config = {}) {
    const webServer = ctx.webServer;
    if (webServer === undefined || typeof webServer.register !== 'function') {
        ctx.logger?.('dsh-geo-seo')?.warn?.('web server service is unavailable — the panel cannot reach the engine');
    }
    else {
        // Keep the service object as the receiver: register() reads its own route
        // tables through `this`, so a detached function reference throws.
        const server = webServer;
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
                    const exists = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
                    const history = exists ? readHistory(resolved, 20) : [];
                    const runs = exists ? readMonitorRuns(resolved) : [];
                    sendJson(res, 200, {
                        ok: true,
                        value: {
                            target: exists ? resolved : undefined,
                            dirName: path.basename(resolved),
                            exists,
                            hasPackageJson: exists && fs.existsSync(path.join(resolved, 'package.json')),
                            fallbackDir: process.cwd(),
                            history,
                            monitorRuns: runs.slice(-20),
                            rulePack: RULE_PACK,
                            rulePackVersion: RULE_PACK_VERSION,
                        },
                    });
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
                if (sub === '/assets' && method === 'GET') {
                    const dir = resolveTarget(query.get('dir') ?? undefined, config);
                    sendJson(res, 200, { ok: true, value: assetsPayload(dir) });
                    return;
                }
                if (sub === '/preview' && method === 'GET') {
                    const dir = resolveTarget(query.get('dir') ?? undefined, config);
                    const requested = query.get('name') ?? '';
                    if (!ASSET_NAMES.includes(requested)) {
                        throw new Error('unknown asset: ' + (requested === '' ? '(missing name)' : path.basename(requested)));
                    }
                    const target = path.join(dir, requested);
                    if (!fs.existsSync(target))
                        throw new Error('asset not generated yet: ' + requested);
                    const raw = fs.readFileSync(target, 'utf8');
                    const truncated = raw.length > MAX_PREVIEW_CHARS;
                    sendJson(res, 200, {
                        ok: true,
                        value: {
                            name: requested,
                            content: truncated ? raw.slice(0, MAX_PREVIEW_CHARS) : raw,
                            bytes: Buffer.byteLength(raw),
                            truncated,
                        },
                    });
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
                        // The panel writes next to the project: its asset table lists the
                        // files that ship with the repository, not a temp copy.
                        const result = generateFor(dir, body, '.');
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
                    if (sub === '/pick-dir') {
                        const selected = await pickDirectory();
                        sendJson(res, 200, { ok: true, value: { path: selected ?? null } });
                        return;
                    }
                    if (sub === '/open-file') {
                        const relative = stringField(body, 'path');
                        if (relative === undefined)
                            throw new Error('path is required');
                        const base = resolveTarget(explicit, config);
                        const target = path.resolve(base, relative);
                        const line = typeof body.line === 'number' && Number.isFinite(body.line) ? body.line : undefined;
                        const opened = fs.existsSync(target) ? await openInEditor(target) : false;
                        sendJson(res, 200, { ok: true, value: { opened, path: target, line } });
                        return;
                    }
                    if (sub === '/monitor') {
                        const dir = resolveTarget(explicit, config);
                        const platform = stringField(body, 'platform') ?? 'unspecified';
                        const answers = toMonitorAnswers(body.answers, platform);
                        const run = recordRun({ target: dir, name: path.basename(dir), platform, answers });
                        appendMonitorRun(dir, run);
                        sendJson(res, 200, { ok: true, value: monitorPayload(dir) });
                        return;
                    }
                    if (sub === '/monitor/import') {
                        const dir = resolveTarget(explicit, config);
                        const rawRuns = Array.isArray(body.runs) ? body.runs : [];
                        if (rawRuns.length === 0)
                            throw new Error('runs must be a non-empty array');
                        let imported = 0;
                        for (const entry of rawRuns) {
                            const record = asRecord(entry);
                            const answers = toMonitorAnswers(record.answers, stringField(record, 'platform') ?? 'imported');
                            if (answers.length === 0)
                                continue;
                            const at = stringField(record, 'at');
                            const run = recordRun({
                                target: dir,
                                name: path.basename(dir),
                                platform: stringField(record, 'platform') ?? 'imported',
                                ...(at !== undefined ? { at } : {}),
                                answers,
                            });
                            appendMonitorRun(dir, run);
                            imported += 1;
                        }
                        sendJson(res, 200, { ok: true, value: { ...monitorPayload(dir), imported } });
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
                const body = { ok: false, error: message };
                if (error instanceof TargetError) {
                    body.code = error.code;
                    body.detail = error.target;
                }
                sendJson(res, 400, body);
            }
        };
        ctx.effect?.(() => {
            const dispose = server.register({ kind: 'prefix', path: ROUTE_PREFIX, handler });
            return () => {
                if (typeof dispose === 'function')
                    dispose();
            };
        });
    }
    if (config.tools === false)
        return;
    const renderText = (text) => [{ type: 'text', text }];
    const tools = [
        {
            name: 'geo_seo_check',
            description: 'Score a local project for GEO/SEO readiness (answer-level retrievability, not ranking). Returns the 100-point total, per-dimension scores, deductions located at file:line, and rationale for each weighted rule.',
            parameters: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    dir: { type: 'string', description: 'Absolute or cwd-relative project directory. Defaults to the last scanned directory.' },
                    format: { type: 'string', enum: ['text', 'markdown', 'json'], description: 'Output format: text (default), markdown, or json.' },
                },
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
                type: 'object',
                additionalProperties: false,
                properties: {
                    dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
                    outDir: { type: 'string', description: 'Output directory (defaults to a temp directory).' },
                    force: { type: 'boolean', description: 'Overwrite existing files whose content differs.' },
                    dryRun: { type: 'boolean', description: 'Report what would be written without touching disk.' },
                    maxEntries: { type: 'integer', description: 'Maximum core pages listed (10-20 recommended).' },
                },
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
                type: 'object',
                additionalProperties: false,
                properties: {
                    dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
                },
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
                type: 'object',
                additionalProperties: false,
                properties: {
                    dir: { type: 'string', description: 'Absolute or cwd-relative project directory.' },
                    platform: { type: 'string', description: 'Platform name for a new sample (e.g. chatgpt, perplexity). Omit to read history.' },
                    answers: {
                        type: 'array',
                        description: 'One sample: { questionId, mentioned, cited, note? } per answered question.',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                questionId: { type: 'string' },
                                mentioned: { type: 'boolean' },
                                cited: { type: 'boolean' },
                                note: { type: 'string' },
                            },
                        },
                    },
                },
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
                type: 'object',
                additionalProperties: false,
                properties: {
                    name: { type: 'string', description: 'Product name used to fill the question templates.' },
                },
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
    // register() reaches its scope tables through `this`, so always call it on
    // the service object rather than on a detached reference.
    const registerTools = (registry) => {
        const disposers = [];
        for (const definition of tools) {
            try {
                const dispose = registry.register(definition);
                if (typeof dispose === 'function')
                    disposers.push(dispose);
            }
            catch (error) {
                ctx.logger?.('dsh-geo-seo')?.warn?.(`tool registration failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        ctx.logger?.('dsh-geo-seo')?.info?.(`registered ${disposers.length}/${tools.length} model tools`);
        return () => {
            for (const dispose of disposers.reverse())
                dispose();
        };
    };
    // The tool registry is provided by dsh-tools, which can come up after this
    // plugin: ask cordis to call us when it exists instead of probing once now.
    const injector = ctx.inject;
    if (typeof injector === 'function') {
        injector.call(ctx, ['tools'], (injected) => {
            const registry = injected?.tools;
            if (registry === undefined || typeof registry.register !== 'function')
                return;
            return registerTools(registry);
        });
        return;
    }
    const toolRegistry = readOptionalService(ctx, 'tools');
    if (toolRegistry !== undefined && typeof toolRegistry.register === 'function') {
        ctx.effect?.(() => registerTools(toolRegistry));
    }
}
