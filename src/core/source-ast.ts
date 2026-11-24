/**
 * F1 source inspection: what the plugin actually exports, which tools and
 * commands it registers, and which config keys its schema declares.
 *
 * This is deliberately a lexical pass, not a full compiler-API type check:
 * GEO scoring only needs names and line anchors, and a regex pass cannot be
 * broken by syntax the current TypeScript version does not understand yet.
 */
import type { SourceFact } from './types.js';

const EXPORT_FN = /^\s*export\s+(?:async\s+)?(?:function|const|class|let|var)\s+([A-Za-z_$][\w$]*)/;
const EXPORT_LIST = /^\s*export\s*\{([^}]*)\}/;
const EXPORT_DEFAULT = /^\s*export\s+default\b/;
const TOOL_NAME = /(?:name|id)\s*:\s*['"]([A-Za-z0-9_.:-]+)['"]/;
const TOOL_REGISTER = /ctx\.tools\.register\s*\(|\.tools\.register\s*\(|defineTool\s*\(/;
const COMMAND_REGISTER = /\.commands?\.register\s*\(|registerCommand\s*\(|ctx\.command\s*\(/;
const INJECT_DECL = /^\s*export\s+const\s+inject\s*=\s*\[([^\]]*)\]/;
const CONFIG_SCHEMA = /^\s*export\s+const\s+Config\s*=|Schema\.object\s*\(/;

export function inspectSource(file: string, raw: string): SourceFact {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const fact: SourceFact = {
    file,
    exports: [],
    tools: [],
    commands: [],
    hasConfigSchema: false,
    configKeys: [],
    injects: [],
  };

  let pendingToolRegistration = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    const fn = EXPORT_FN.exec(line);
    if (fn?.[1]) fact.exports.push({ name: fn[1], line: lineNumber });

    const list = EXPORT_LIST.exec(line);
    if (list?.[1]) {
      for (const part of list[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0];
        if (name) fact.exports.push({ name, line: lineNumber });
      }
    }

    if (EXPORT_DEFAULT.test(line)) fact.exports.push({ name: 'default', line: lineNumber });

    const inject = INJECT_DECL.exec(line);
    if (inject?.[1]) {
      fact.injects.push(
        ...inject[1]
          .split(',')
          .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
          .filter((item) => item.length > 0),
      );
    }

    if (CONFIG_SCHEMA.test(line)) fact.hasConfigSchema = true;

    if (TOOL_REGISTER.test(line)) pendingToolRegistration = true;

    if (TOOL_REGISTER.test(line) || COMMAND_REGISTER.test(line)) {
      const name = TOOL_NAME.exec(line);
      if (name?.[1]) {
        if (COMMAND_REGISTER.test(line)) fact.commands.push({ name: name[1], line: lineNumber });
        else fact.tools.push({ name: name[1], line: lineNumber });
        pendingToolRegistration = false;
      } else if (pendingToolRegistration) {
        // The name may be on one of the next few lines of the object literal.
        for (let lookahead = 1; lookahead <= 6; lookahead += 1) {
          const candidate = lines[index + lookahead];
          if (!candidate) break;
          const inner = TOOL_NAME.exec(candidate);
          if (inner?.[1]) {
            fact.tools.push({ name: inner[1], line: index + lookahead + 1 });
            pendingToolRegistration = false;
            break;
          }
        }
      }
    }
  });

  fact.hasConfigSchema = fact.hasConfigSchema || /export\s+const\s+Config\b/.test(raw);
  fact.configKeys = configKeys(raw);
  fact.exports = dedupeByName(fact.exports);
  fact.tools = dedupeByName(fact.tools);
  fact.commands = dedupeByName(fact.commands);
  return fact;
}

/** Reads the top-level keys of an exported Config schema object. */
function configKeys(raw: string): string[] {
  const keys: string[] = [];
  const match = /export\s+const\s+Config\s*=\s*\{([\s\S]*?)\n\}/.exec(raw);
  if (match?.[1]) {
    for (const line of match[1].split('\n')) {
      const key = /^\s{2}([A-Za-z_$][\w$]*)\s*:/.exec(line);
      if (key?.[1]) keys.push(key[1]);
    }
  }
  const schema = /Schema\.object\s*\(\s*\{([\s\S]*?)\}\s*\)/.exec(raw);
  if (keys.length === 0 && schema?.[1]) {
    for (const line of schema[1].split('\n')) {
      const key = /^\s{2}([A-Za-z_$][\w$]*)\s*:/.exec(line);
      if (key?.[1]) keys.push(key[1]);
    }
  }
  return [...new Set(keys)];
}

function dedupeByName(items: { name: string; line: number }[]): { name: string; line: number }[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
