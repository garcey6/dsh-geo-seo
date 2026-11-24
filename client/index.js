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

    function PanelFrame() {
      return React.createElement('iframe', {
        src: panelUrl(),
        title: 'GEO / SEO',
        style: frameStyle,
        allow: 'clipboard-write',
      });
    }

    const guideEntries = [
      {
        id: 'open',
        title: 'GEO / SEO',
        description: 'Score the project, read the deductions, generate assets and watch the trend.',
      },
    ];

    const definition = {
      id: TAB_ID,
      kind: KIND,
      priority: 'extension',
      keepMounted: true,
      title: function title() {
        return 'GEO / SEO';
      },
      guide: guideEntries,
    };

    /**
     * Register the tab type, then the keyed body seat. If the host rejects the
     * guide declaration (older contract), retry without it rather than losing
     * the whole panel.
     */
    function registerTab(ctx) {
      const registry = ctx.sidebarRightTabs;
      if (!registry || typeof registry.register !== 'function') return undefined;
      try {
        return registry.register(definition);
      } catch (error) {
        console.warn('[dsh-geo-seo] tab registration rejected, retrying without the guide entry', error);
      }
      try {
        const fallback = Object.assign({}, definition);
        delete fallback.guide;
        return registry.register(fallback);
      } catch (error) {
        console.warn('[dsh-geo-seo] tab registration failed', error);
        return undefined;
      }
    }

    function apply(ctx) {
      if (!ctx || !ctx.slots || typeof ctx.slots.register !== 'function') return;
      if (typeof ctx.effect !== 'function') return;
      ctx.effect(function registerPanel() {
        const disposers = [];
        const disposeTab = registerTab(ctx);
        if (typeof disposeTab === 'function') disposers.push(disposeTab);
        try {
          const disposeBody = ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, PanelFrame);
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
