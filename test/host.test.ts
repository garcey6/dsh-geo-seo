import test from 'node:test';
import assert from 'node:assert/strict';

import { apply } from '../src/index.js';
import { makeWorkspace, healthyReadme, isolatedState } from './helpers.js';

interface FakeRoute { kind: string; path: string; handler: (req: any, res: any) => unknown }

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writeHead: (status: number, headers?: Record<string, string>) => void;
  end: (chunk?: string) => void;
}

/**
 * Both services keep their registrations on `this`, exactly like the host
 * classes do. Calling a detached `register` therefore throws instead of
 * silently succeeding — which is the bug this fake exists to catch.
 */
class FakeWebServer {
  readonly routes: FakeRoute[] = [];
  register(this: FakeWebServer, route: FakeRoute): () => void {
    this.routes.push(route);
    return () => {
      const index = this.routes.indexOf(route);
      if (index >= 0) this.routes.splice(index, 1);
    };
  }
}

class FakeToolRegistry {
  readonly definitions: Array<{ name: string; parameters: any }> = [];
  register(this: FakeToolRegistry, definition: { name: string; parameters: any }): () => void {
    this.definitions.push(definition);
    return () => {};
  }
}

function fakeContext(): {
  ctx: any;
  routes: FakeRoute[];
  tools: string[];
  definitions: Array<{ name: string; parameters: any }>;
  warnings: string[];
  runEffects: () => void;
  effects: number;
} {
  const webServer = new FakeWebServer();
  const registry = new FakeToolRegistry();
  const state = {
    effects: [] as (() => unknown)[],
    warnings: [] as string[],
  };
  const ctx = {
    webServer,
    // The registry is reachable only through reflect, like the real host: a
    // plain `ctx.tools` read is what cordis rejects for undeclared services.
    reflect: {
      get(key: string) {
        return key === 'tools' ? registry : undefined;
      },
    },
    // The host hands out late-provided services through ctx.inject.
    inject(deps: string[], callback: (injected: any) => unknown) {
      assert.deepEqual(deps, ['tools']);
      return callback({ tools: registry });
    },
    effect(callback: () => unknown) {
      state.effects.push(callback);
    },
    logger: () => ({
      warn(message: string) { state.warnings.push(message); },
      info() {},
      debug() {},
    }),
  };
  const runEffects = (): void => {
    for (const effect of state.effects) effect();
  };
  return {
    ctx,
    routes: webServer.routes,
    definitions: registry.definitions,
    get tools(): string[] {
      return registry.definitions.map((definition) => definition.name);
    },
    warnings: state.warnings,
    runEffects,
    get effects() { return state.effects.length; },
  } as any;
}

function response(): FakeResponse {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers ?? {};
    },
    end(chunk) {
      if (chunk) this.body += chunk;
    },
  };
}

function request(method: string, url: string, body?: unknown): any {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return {
    method,
    url,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (payload) yield Buffer.from(payload, 'utf8');
    },
  };
}

async function call(route: FakeRoute, method: string, url: string, body?: unknown) {
  const res = response();
  await route.handler(request(method, url, body), res);
  let json: any = null;
  if ((res.headers['content-type'] ?? '').includes('json') && res.body) json = JSON.parse(res.body);
  return { res, json };
}

function setup(): { route: FakeRoute; tools: string[]; definitions: Array<{ name: string; parameters: any }> } {
  isolatedState();
  const fake = fakeContext();
  apply(fake.ctx, {});
  fake.runEffects();
  // A service the plugin could not reach is a warning, not a silent no-op.
  assert.deepEqual(fake.warnings, []);
  assert.equal(fake.routes.length, 1);
  return { route: fake.routes[0]!, tools: fake.tools, definitions: fake.definitions };
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
    for (const [key, node] of Object.entries<any>(schema.properties)) {
      assert.equal(typeof node.type, 'string', definition.name + '.' + key);
      assert.ok(!('required' in (node as any)), definition.name + '.' + key);
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
  assert.ok(generate.json.value.files.every((file: { written: boolean }) => !file.written));
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
