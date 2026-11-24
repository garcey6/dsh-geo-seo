import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/index.js';
import { makeWorkspace, healthyReadme, isolatedState } from './helpers.js';
function fakeContext() {
    const state = {
        routes: [],
        tools: [],
        effects: [],
    };
    const ctx = {
        webServer: {
            register(route) {
                state.routes.push(route);
                return () => { };
            },
        },
        tools: {
            register(definition) {
                state.tools.push(definition.name);
                return () => { };
            },
        },
        effect(callback) {
            state.effects.push(callback);
        },
        logger: () => ({ warn() { }, info() { }, debug() { } }),
    };
    const runEffects = () => {
        for (const effect of state.effects)
            effect();
    };
    return {
        ctx,
        routes: state.routes,
        tools: state.tools,
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
    assert.equal(fake.routes.length, 1);
    return { route: fake.routes[0], tools: fake.tools };
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
