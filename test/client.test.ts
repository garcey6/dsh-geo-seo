import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The client bundle ships as hand-written ESM-free JavaScript, so the only way
 * to test it is to load it the way the Harness client does: install a module
 * loader, let the bundle call it, then drive the factory with a fake `require`
 * and a fake client context.
 *
 * The fake context copies the lifecycle that made the first release fail on a
 * real profile: `ctx.inject` re-runs its callback when a service appears, and
 * `sidebarRightTabs` is NOT there on the first pass.
 */

interface TabDefinition {
  id: string;
  kind: string;
  priority?: string;
  keepMounted?: boolean;
  title: () => string;
  guide?: { id: string; order: number; title: () => string; description?: () => string }[];
}

interface SlotRegistration { name: string; key: string; inject: () => unknown }

interface FakeRegistry {
  registrations: TabDefinition[];
  register: (definition: TabDefinition) => () => void;
}

interface LoadedClient { id: string; inject: string[]; apply: (ctx: unknown) => void }

const CLIENT_PATH = new URL('../../client/index.js', import.meta.url);

function loadClient(): LoadedClient {
  const loaded: { id: string; factory: (require: (id: string) => unknown) => unknown }[] = [];
  const fakeWindow = {
    __ModuleLoader__: {
      load(definition: { id: string; factory: (require: (id: string) => unknown) => unknown }) {
        loaded.push(definition);
      },
    },
  };
  const fakeDocument = { baseURI: 'http://127.0.0.1:62671/' };
  const source = readFileSync(CLIENT_PATH, 'utf8');
  const run = new Function('window', 'document', 'console', source) as (
    window: unknown,
    document: unknown,
    console: unknown,
  ) => void;
  run(fakeWindow, fakeDocument, { warn() {}, error() {} });

  const entry = loaded[0];
  assert.ok(entry, 'the bundle must register exactly one module');
  const react = {
    createElement(type: unknown, props: Record<string, unknown>) {
      return { type, props };
    },
  };
  const client = entry.factory(() => react) as LoadedClient;
  return { id: entry.id, inject: client.inject, apply: client.apply };
}

function fakeRegistry(): FakeRegistry {
  const registrations: TabDefinition[] = [];
  return {
    registrations,
    register(definition: TabDefinition) {
      registrations.push(definition);
      return () => {
        const at = registrations.indexOf(definition);
        if (at >= 0) registrations.splice(at, 1);
      };
    },
  };
}

function fakeSlots(): { registrations: SlotRegistration[]; bodies: unknown[]; register: (r: SlotRegistration, body: unknown) => () => void; inject: (name: string, cb: () => unknown) => () => void } {
  const state = {
    registrations: [] as SlotRegistration[],
    bodies: [] as unknown[],
  };
  return {
    get registrations() {
      return state.registrations;
    },
    get bodies() {
      return state.bodies;
    },
    register(registration: SlotRegistration, body: unknown) {
      state.registrations.push(registration);
      state.bodies.push(body);
      return () => {
        const at = state.registrations.indexOf(registration);
        if (at >= 0) state.registrations.splice(at, 1);
      };
    },
    inject(_name: string, callback: () => unknown) {
      const dispose = callback() as () => void;
      return typeof dispose === 'function' ? dispose : () => {};
    },
  };
}

interface FakeCtx {
  ctx: unknown;
  /** Run the pending `inject` callback with whatever services exist now. */
  settle: () => void;
  registry: FakeRegistry;
  slots: ReturnType<typeof fakeSlots>;
  dispose: () => void;
}

/**
 * A client context whose `inject` behaves like cordis': the callback runs when
 * the declared services are available, and again whenever they change.
 */
function fakeCtx(options: { withRegistry: boolean }): FakeCtx {
  const registry = fakeRegistry();
  const slots = fakeSlots();
  let pending: (() => unknown) | undefined;
  let settleDispose: (() => void) | undefined;

  const ctx = {
    started: false,
    get(name: string) {
      if (name === 'sidebarRightTabs') return ctx.started ? registry : undefined;
      if (name === 'slots') return slots;
      return undefined;
    },
    inject(_deps: string[], callback: (injected: { get: (name: string) => unknown }) => unknown) {
      pending = () => callback({ get: (name: string) => ctx.get(name) });
      return () => {
        if (settleDispose) settleDispose();
      };
    },
  };
  ctx.started = options.withRegistry;

  return {
    ctx,
    registry,
    slots,
    settle: () => {
      if (pending === undefined) return;
      const result = pending();
      settleDispose = typeof result === 'function' ? (result as () => void) : undefined;
    },
    dispose: () => {
      if (settleDispose) settleDispose();
    },
  };
}

test('client bundle registers the module under the package name', () => {
  const client = loadClient();
  assert.equal(client.id, 'dsh-geo-seo');
  assert.deepEqual(client.inject, ['slots']);
});

test('a registry that appears late still gets the tab type and its body seat', () => {
  const client = loadClient();
  const fake = fakeCtx({ withRegistry: false });
  client.apply(fake.ctx);

  // First pass: the native seat has declared the slot, the registry is absent.
  fake.settle();
  assert.equal(fake.registry.registrations.length, 0, 'nothing may be registered without the registry');

  // The service appears; the declaration-driven path would never retry.
  (fake.ctx as { started: boolean }).started = true;
  fake.settle();

  const [definition] = fake.registry.registrations;
  assert.ok(definition, 'the tab type must be registered once the registry exists');
  assert.equal(definition.id, 'dsh-geo-seo');
  assert.equal(definition.kind, 'geo-seo');
  assert.equal(definition.priority, 'extension');
  assert.equal(definition.keepMounted, true);
  assert.equal(definition.title(), 'GEO / SEO');

  const [guide] = definition.guide ?? [];
  assert.ok(guide, 'the guide entry is what lists the panel on the start page');
  assert.equal(guide.id, 'open');
  assert.equal(typeof guide.order, 'number');
  assert.equal(typeof guide.title, 'function');
  assert.equal(guide.title(), 'GEO / SEO');
  assert.equal(typeof guide.description, 'function');

  const [slot] = fake.slots.registrations;
  assert.ok(slot, 'the body seat must be registered for the tab to render');
  assert.equal(slot.name, 'sidebar.right.pane.tab');
  assert.equal(slot.key, definition.id);

  const body = fake.slots.bodies[0] as () => { type: unknown; props: Record<string, unknown> };
  const element = body();
  assert.equal(element.type, 'iframe');
  assert.equal(element.props.src, 'http://127.0.0.1:62671/geo-seo/api/panel');
  assert.equal(element.props.title, 'GEO / SEO');
});

test('disposing the seat releases the type and the body together', () => {
  const client = loadClient();
  const fake = fakeCtx({ withRegistry: true });
  client.apply(fake.ctx);
  fake.settle();
  assert.equal(fake.registry.registrations.length, 1);
  assert.equal(fake.slots.registrations.length, 1);

  fake.dispose();
  assert.equal(fake.registry.registrations.length, 0);
  assert.equal(fake.slots.registrations.length, 0);
});

test('a host that rejects the guide entry keeps the tab type', () => {
  const client = loadClient();
  const fake = fakeCtx({ withRegistry: true });
  const rejectGuide = fake.registry.register;
  fake.registry.register = (definition: TabDefinition) => {
    if (definition.guide !== undefined) throw new Error('sidebarRight: duplicate guide entry id');
    return rejectGuide(definition);
  };
  client.apply(fake.ctx);
  fake.settle();

  assert.equal(fake.registry.registrations.length, 1);
  assert.equal(fake.registry.registrations[0]?.guide, undefined);
  assert.equal(fake.registry.registrations[0]?.id, 'dsh-geo-seo');
  assert.equal(fake.slots.registrations.length, 1);
});
