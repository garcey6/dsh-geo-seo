import { readTextSafe } from './util.js';
export function readPackageJson(file) {
    const raw = readTextSafe(file);
    if (raw === undefined) {
        return { error: { file, message: 'package.json is missing or unreadable' } };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return {
            error: {
                file,
                message: 'package.json is not valid JSON: ' + (error instanceof Error ? error.message : String(error)),
            },
        };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { error: { file, message: 'package.json must contain a JSON object' } };
    }
    const data = parsed;
    const fact = {
        file,
        keywords: toStringArray(data['keywords']),
        bin: binNames(data['bin']),
        dependencies: Object.keys(asRecord(data['dependencies'])),
        devDependencies: Object.keys(asRecord(data['devDependencies'])),
        peerDependencies: Object.keys(asRecord(data['peerDependencies'])),
    };
    assign(fact, 'name', data['name']);
    assign(fact, 'version', data['version']);
    assign(fact, 'description', data['description']);
    assign(fact, 'license', typeof data['license'] === 'string' ? data['license'] : undefined);
    assign(fact, 'main', data['main']);
    assign(fact, 'types', data['types'] ?? data['typings']);
    assign(fact, 'type', data['type']);
    const author = data['author'];
    if (typeof author === 'string')
        fact.author = author;
    else if (isRecord(author))
        assign(fact, 'author', author['name']);
    const repository = data['repository'];
    if (typeof repository === 'string')
        fact.repository = repository;
    else if (isRecord(repository))
        assign(fact, 'repository', repository['url']);
    assign(fact, 'homepage', data['homepage']);
    return { fact };
}
function assign(fact, key, value) {
    if (typeof value === 'string' && value.trim()) {
        fact[key] = value.trim();
    }
}
function toStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}
function binNames(value) {
    if (typeof value === 'string')
        return [value];
    if (!isRecord(value))
        return [];
    return Object.keys(value);
}
function asRecord(value) {
    return isRecord(value) ? value : {};
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
