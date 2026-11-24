import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/index.js';
import { makeWorkspace, healthyReadme, isolatedState } from './helpers.js';
/**
 * Both services keep their registrations on `this`, exactly like the host
 * classes do. Calling a detached `register` therefore throws instead of
 * silently succeeding — which is the bug this fake exists to catch.
 */
class FakeWebServer {
    routes = [];
    register(route) {
        this.routes.push(route);
        return () => {
            const index = this.routes.indexOf(route);
            if (index >= 0)
                this.routes.splice(index, 1);
        };
    }
}
class FakeToolRegistry {
    definitions = [];
    register(definition) {
        this.definitions.push(definition);
        return () => { };
    }
}
function fakeContext() {
    const webServer = new FakeWebServer();
    const registry = new FakeToolRegistry();
    const state = {
        effects: [],
        warnings: [],
    };
    const ctx = {
        webServer,
        // The registry is reachable only through reflect, like the real host: a
        // plain `ctx.tools` read is what cordis rejects for undeclared services.
        reflect: {
            get(key) {
                return key === 'tools' ? registry : undefined;
            },
        },
        // The host hands out late-provided services through ctx.inject.
        inject(deps, callback) {
            assert.deepEqual(deps, ['tools']);
            return callback({ tools: registry });
        },
        effect(callback) {
            state.effects.push(callback);
        },
        logger: () => ({
            warn(message) { state.warnings.push(message); },
            info() { },
            debug() { },
        }),
    };
    const runEffects = () => {
        for (const effect of state.effects)
            effect();
    };
    return {
        ctx,
        routes: webServer.routes,
        definitions: registry.definitions,
        get tools() {
            return registry.definitions.map((definition) => definition.name);
        },
        warnings: state.warnings,
        runEffects,
        get effects() { return state.effects.length; },
    };
}
function response() {
    return {
        statusCode: 0,
        headers: {},
        body: '',
        writeHead(status, headers) {
            this.statusCode = status;
            this.headers = headers ?? {};
        },
        end(chunk) {
            if (chunk)
                this.body += chunk;
        },
    };
}
function request(method, url, body) {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    return {
        method,
        url,
        headers: {},
        async *[Symbol.asyncIterator]() {
            if (payload)
                yield Buffer.from(payload, 'utf8');
        },
    };
}
async function call(route, method, url, body) {
    const res = response();
    await route.handler(request(method, url, body), res);
    let json = null;
    if ((res.headers['content-type'] ?? '').includes('json') && res.body)
        json = JSON.parse(res.body);
    return { res, json };
}
function setup() {
    isolatedState();
    const fake = fakeContext();
    apply(fake.ctx, {});
    fake.runEffects();
    // A service the plugin could not reach is a warning, not a silent no-op.
    assert.deepEqual(fake.warnings, []);
    assert.equal(fake.routes.length, 1);
    return { route: fake.routes[0], tools: fake.tools, definitions: fake.definitions };
}
test('apply registers one namespaced route and the documented tools', () => {
    const { route, tools } = setup();
    assert.equal(route.kind, 'prefix');
    assert.equal(route.path, '/geo-seo/api');
    assert.deepEqual(tools.sort(), [
        'geo_seo_audit',
        'geo_seo_check',
        'geo_seo_generate',
        'geo_seo_monitor',
        'geo_seo_questions',
    ]);
});
test('every tool ships raw JSON Schema, as the host registry requires', () => {
    const { definitions } = setup();
    assert.equal(definitions.length, 5);
    for (const definition of definitions) {
        const schema = definition.parameters;
        assert.equal(schema.type, 'object', definition.name);
        assert.equal(typeof schema.properties, 'object', definition.name);
        assert.ok(Object.keys(schema.properties).length > 0, definition.name);
        // The host rejects shorthand definitions that skip the `properties` layer.
        for (const [key, node] of Object.entries(schema.properties)) {
            assert.equal(typeof node.type, 'string', definition.name + '.' + key);
            assert.ok(!('required' in node), definition.name + '.' + key);
        }
    }
});
test('the panel route serves a self-contained page', async () => {
    const { route } = setup();
    const { res } = await call(route, 'GET', '/geo-seo/api/panel');
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] ?? '', /text\/html/);
    assert.ok(res.body.length > 1000);
    assert.match(res.body, /GEO \/ SEO/);
    // No external assets: the panel must work offline.
    assert.ok(!/src="https?:/.test(res.body));
});
test('the questions route exposes the whole bank', async () => {
    const { route } = setup();
    const { res, json } = await call(route, 'GET', '/geo-seo/api/questions');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(json.value.questions));
    assert.ok(json.value.questions.length >= 20);
});
test('check and generate run against a real directory', async () => {
    const { route } = setup();
    const dir = makeWorkspace({ 'README.md': healthyReadme(), 'package.json': JSON.stringify({ name: 'sample-plugin', version: '1.2.3' }) });
    const check = await call(route, 'POST', '/geo-seo/api/check', { dir });
    assert.equal(check.res.statusCode, 200);
    assert.equal(check.json.ok, true);
    assert.equal(typeof check.json.value.report.summary.total, 'number');
    assert.ok(check.json.value.report.dimensions.length === 7);
    const generate = await call(route, 'POST', '/geo-seo/api/generate', { dir, dryRun: true });
    assert.equal(generate.res.statusCode, 200);
    assert.ok(generate.json.value.files.every((file) => !file.written));
});
test('a bad target is a 400 with a readable message, and unknown routes are 404', async () => {
    const { route } = setup();
    const missing = await call(route, 'POST', '/geo-seo/api/check', { dir: 'C:/definitely/not/here' });
    assert.equal(missing.res.statusCode, 400);
    assert.equal(missing.json.ok, false);
    assert.match(missing.json.error, /not a directory|not found/i);
    const notFound = await call(route, 'GET', '/geo-seo/api/nope');
    assert.equal(notFound.res.statusCode, 404);
});
test('the assets route reports what exists next to the project', async () => {
    const { route } = setup();
    const dir = makeWorkspace({ 'README.md': healthyReadme() });
    const { res, json } = await call(route, 'GET', '/geo-seo/api/assets?dir=' + encodeURIComponent(dir));
    assert.equal(res.statusCode, 200);
    assert.equal(json.ok, true);
    assert.deepEqual(json.value.files.map((file) => file.name), ['llms.txt', 'llms-full.txt', 'ai.txt', 'structured-data.jsonld']);
    // Nothing was generated yet, so every row is missing rather than current.
    assert.ok(json.value.files.every((file) => file.status === 'missing'));
    assert.equal(typeof json.value.verification.ok, 'boolean');
});
test('preview refuses an unknown asset and serves a generated one', async () => {
    const { route } = setup();
    const dir = makeWorkspace({ 'README.md': healthyReadme() });
    const before = await call(route, 'GET', '/geo-seo/api/preview?dir=' + encodeURIComponent(dir) + '&name=llms.txt');
    assert.equal(before.res.statusCode, 400);
    assert.match(before.json.error, /not generated yet/i);
    const traversal = await call(route, 'GET', '/geo-seo/api/preview?dir=' + encodeURIComponent(dir) + '&name=../README.md');
    assert.equal(traversal.res.statusCode, 400);
    assert.match(traversal.json.error, /unknown asset/i);
    const generated = await call(route, 'POST', '/geo-seo/api/generate', { dir, force: true });
    assert.equal(generated.res.statusCode, 200);
    const after = await call(route, 'GET', '/geo-seo/api/preview?dir=' + encodeURIComponent(dir) + '&name=llms.txt');
    assert.equal(after.res.statusCode, 200);
    assert.equal(after.json.value.name, 'llms.txt');
    assert.ok(after.json.value.content.length > 0);
    assert.equal(after.json.value.truncated, false);
});
test('directory picking and file opening degrade to null/false without electron', async () => {
    const { route } = setup();
    const picked = await call(route, 'POST', '/geo-seo/api/pick-dir', {});
    assert.equal(picked.res.statusCode, 200);
    // A headless host has no dialog; the panel falls back to the text field.
    assert.equal(picked.json.value.path, null);
    const dir = makeWorkspace({ 'README.md': healthyReadme() });
    const opened = await call(route, 'POST', '/geo-seo/api/open-file', { dir, path: 'README.md', line: 3 });
    assert.equal(opened.res.statusCode, 200);
    assert.equal(opened.json.value.opened, false);
    assert.equal(opened.json.value.line, 3);
    const missing = await call(route, 'POST', '/geo-seo/api/open-file', { dir });
    assert.equal(missing.res.statusCode, 400);
    assert.match(missing.json.error, /path is required/i);
});
test('monitor samples can be imported and are then summarised', async () => {
    const { route } = setup();
    const dir = makeWorkspace({ 'README.md': healthyReadme() });
    const imported = await call(route, 'POST', '/geo-seo/api/monitor/import', {
        dir,
        runs: [
            {
                at: '2026-01-02T03:04:05.000Z',
                platform: 'chatgpt',
                answers: [
                    { questionId: 'q01', mentioned: true, cited: false },
                    { questionId: 'q02', mentioned: true, cited: true },
                ],
            },
        ],
    });
    assert.equal(imported.res.statusCode, 200);
    assert.equal(imported.json.value.imported, 1);
    const monitor = await call(route, 'GET', '/geo-seo/api/monitor?dir=' + encodeURIComponent(dir));
    assert.equal(monitor.res.statusCode, 200);
    assert.equal(monitor.json.value.runs.length, 1);
    assert.equal(monitor.json.value.runs[0].at, '2026-01-02T03:04:05.000Z');
    const empty = await call(route, 'POST', '/geo-seo/api/monitor/import', { dir, runs: [] });
    assert.equal(empty.res.statusCode, 400);
    assert.match(empty.json.error, /runs must be a non-empty array/i);
});
