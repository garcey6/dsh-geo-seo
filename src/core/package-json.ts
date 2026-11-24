/**
 * package.json reader for F1: name, version, description, keywords, deps,
 * entry points and the fields that later become machine-readable output.
 */
import type { PackageFact, ParseError } from './types.js';
import { readTextSafe } from './util.js';

export interface PackageReadResult {
  fact?: PackageFact;
  error?: ParseError;
}

export function readPackageJson(file: string): PackageReadResult {
  const raw = readTextSafe(file);
  if (raw === undefined) {
    return { error: { file, message: 'package.json is missing or unreadable' } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
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
  const data = parsed as Record<string, unknown>;

  const fact: PackageFact = {
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
  if (typeof author === 'string') fact.author = author;
  else if (isRecord(author)) assign(fact, 'author', author['name']);

  const repository = data['repository'];
  if (typeof repository === 'string') fact.repository = repository;
  else if (isRecord(repository)) assign(fact, 'repository', repository['url']);

  assign(fact, 'homepage', data['homepage']);

  return { fact };
}

function assign<K extends keyof PackageFact>(fact: PackageFact, key: K, value: unknown): void {
  if (typeof value === 'string' && value.trim()) {
    fact[key] = value.trim() as PackageFact[K];
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function binNames(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (!isRecord(value)) return [];
  return Object.keys(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
