/**
 * dsh-geo-seo — sidebar panel (client bundle).
 *
 * The tab body is a same-origin iframe pointing at the host route the plugin
 * serves (…/geo-seo/api/panel). Keeping the interface in its own document
 * means the panel needs no Harness client packages, no bundler, and no JSX:
 * it only needs React to mount one node.
 */

window.__ModuleLoader__.load({
  id: 'dsh-geo-seo',
  factory(require) {
    const React = require('react');

    const TAB_ID = 'dsh-geo-seo';
    const KIND = 'geo-seo';
    const PANEL_PATH = 'geo-seo/api/panel';
    const BODY_SLOT = 'sidebar.right.pane.tab';
    const TAB_TITLE = 'GEO / SEO';
    const TAB_DESCRIPTION =
      'Score the project, read the deductions, generate assets and watch the trend.';

    /** Resolve the panel URL against the document base, never the origin root. */
    function panelUrl() {
      try {
        return new URL(PANEL_PATH, document.baseURI).href;
      } catch (error) {
        return '/' + PANEL_PATH;
      }
    }

    const frameStyle = {
      width: '100%',
      height: '100%',
      border: '0',
      display: 'block',
      background: 'transparent',
      colorScheme: 'normal',
    };

    /** The plugin context, published by apply() so the frame can read host services. */
    let hostContext = null;

    /** Base URL of the plugin's HTTP surface (everything before "/panel"). */
    function apiBase() {
      const url = panelUrl();
      const cut = url.lastIndexOf('/panel');
      return cut === -1 ? url : url.slice(0, cut);
    }

    async function postJson(endpoint, body) {
      const response = await fetch(apiBase() + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const payload = await response.json().catch(function () {
        return { ok: false, error: 'unreadable response' };
      });
      if (!payload || payload.ok !== true) {
        throw new Error(payload && payload.error ? payload.error : 'request failed');
      }
      return payload.value;
    }

    /**
     * Root of the session's workspace, read from the host service. The panel is
     * an iframe, so it cannot reach this itself: everything here travels on
     * window.__GEO_HOST__, injected into the frame on load.
     */
    function workspaceRoot() {
      try {
        const service =
          hostContext && typeof hostContext.get === 'function' ? hostContext.get('workspaces') : undefined;
        const snapshot =
          service && service.list && typeof service.list.getSnapshot === 'function'
            ? service.list.getSnapshot()
            : undefined;
        const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : [];
        for (const item of items) {
          if (item && typeof item.path === 'string' && item.path !== '') return item.path;
        }
      } catch (error) {
        /* a missing workspace service is a normal headless case */
      }
      return null;
    }

    function buildHostApi() {
      return {
        version: '1',
        getWorkspaceRoot: function () {
          return workspaceRoot();
        },
        pickDirectory: async function () {
          const value = await postJson('/pick-dir', {});
          return value && typeof value.path === 'string' ? value.path : null;
        },
        openFile: async function (filePath, line) {
          const value = await postJson('/open-file', { path: filePath, line: line });
          return value && value.opened === true;
        },
      };
    }

    /** Publish the bridge as early as the frame allows; the panel also polls for it. */
    function onFrameLoad(event) {
      const frame = event && event.target;
      const win = frame && frame.contentWindow;
      if (!win) return;
      try {
        win.__GEO_HOST__ = buildHostApi();
      } catch (error) {
        console.warn('[dsh-geo-seo] could not expose the host bridge to the panel', error);
      }
    }

    function PanelFrame() {
      return React.createElement('iframe', {
        src: panelUrl(),
        title: TAB_TITLE,
        style: frameStyle,
        allow: 'clipboard-write',
        onLoad: onFrameLoad,
      });
    }

    /**
     * One guide row, in the shape the host registry validates: `order` is a
     * number, and both texts are thunks so they re-evaluate on a locale change.
     * `id` is required and unique per provider since DSH 0.1.6-alpha.2; a
     * duplicate throws `sidebarRight: duplicate guide entry id`.
     */
    function guideRows() {
      return [
        {
          id: 'open',
          order: 100,
          title: function () {
            return TAB_TITLE;
          },
          description: function () {
            return TAB_DESCRIPTION;
          },
        },
      ];
    }

    /** The tab-type definition the registry accepts (see NativeTabRegistry). */
    function definition() {
      return {
        id: TAB_ID,
        kind: KIND,
        priority: 'extension',
        keepMounted: true,
        title: function () {
          return TAB_TITLE;
        },
        guide: guideRows(),
      };
    }

    /**
     * Register the tab type. A host that predates the guide contract (or
     * rejects one of its fields) must not cost the reader the whole panel, so
     * the second attempt drops the guide and keeps the type.
     */
    function registerTab(registry) {
      try {
        return registry.register(definition());
      } catch (error) {
        console.warn(
          '[dsh-geo-seo] tab registration was rejected, retrying without the guide entry',
          error,
        );
      }
      try {
        const fallback = definition();
        delete fallback.guide;
        return registry.register(fallback);
      } catch (error) {
        console.warn('[dsh-geo-seo] tab registration failed', error);
        return undefined;
      }
    }

    function apply(ctx) {
      if (!ctx || typeof ctx.inject !== 'function') return;
      hostContext = ctx;
      // Wait for the tab-type REGISTRY (a service), not for the slot
      // declaration: the native seat declares 'sidebar.right.pane.tab' BEFORE
      // it provides `sidebarRightTabs`, so a registration driven by the
      // declaration reads the service as missing — and because the declaration
      // never collapses, it registers nothing, permanently. `ctx.inject`
      // re-runs this body whenever the service appears or reappears, which is
      // the lifecycle both registrations need.
      ctx.inject(['sidebarRightTabs', 'slots'], function (injected) {
        const registry = injected.get('sidebarRightTabs');
        if (!registry || typeof registry.register !== 'function') return;
        const slots = injected.get('slots');
        if (!slots || typeof slots.register !== 'function') return;

        const disposers = [];
        const disposeTab = registerTab(registry);
        if (typeof disposeTab === 'function') disposers.push(disposeTab);
        try {
          const disposeBody = slots.inject(BODY_SLOT, function () {
            return slots.register(
              {
                name: BODY_SLOT,
                // The key is the type id above: the surface looks the body up
                // by the tab's implementation id.
                key: TAB_ID,
                inject: function () {
                  return {};
                },
              },
              PanelFrame,
            );
          });
          if (typeof disposeBody === 'function') disposers.push(disposeBody);
        } catch (error) {
          console.warn('[dsh-geo-seo] panel body slot is unavailable', error);
        }

        return function dispose() {
          for (const dispose of disposers.reverse()) {
            try {
              if (typeof dispose === 'function') dispose();
            } catch (error) {
              /* a failing disposer must not keep the others from running */
            }
          }
        };
      });
    }

    return { inject: ['slots'], apply: apply };
  },
});
