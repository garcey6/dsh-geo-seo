/**
 * The sidebar panel page. It is served as static HTML by the host route and
 * loaded in an iframe inside the sidebar tab, so the panel needs no bundler,
 * no Harness client packages, and keeps working across host UI refactors.
 * The markup lives in assets/panel.html to stay readable and editable.
 */
import fs from 'node:fs';
let cached;
function candidatePaths() {
    const here = import.meta.url;
    return [
        new URL('../../assets/panel.html', here).pathname,
        new URL('../assets/panel.html', here).pathname,
        new URL('./assets/panel.html', here).pathname,
    ];
}
/** Read the panel document once, then serve it from memory. */
export function panelHtml() {
    if (cached !== undefined)
        return cached;
    for (const candidate of candidatePaths()) {
        try {
            const text = fs.readFileSync(decodeURIComponent(candidate.replace(/^\/([A-Za-z]:)/, '$1')), 'utf8');
            cached = text;
            return text;
        }
        catch {
            // try the next candidate
        }
    }
    cached = '<!doctype html><meta charset="utf-8"><body style="font:13px system-ui;padding:16px">'
        + 'Panel assets are missing. Reinstall dsh-geo-seo so that assets/panel.html ships with the package.</body>';
    return cached;
}
