import { defineTool } from '@deepseek-ai/dsh-tools';

export const inject = ['tools'];

export const Config = {
  maxChars: { type: 'number', default: 20000 },
  includeCjk: { type: 'boolean', default: true },
};

export function apply(ctx, config) {
  const maxChars = config?.maxChars ?? 20000;
  const includeCjk = config?.includeCjk ?? true;

  ctx.tools.register(
    defineTool({
      name: 'count_words',
      description: 'Count words and characters in a string.',
      parameters: { text: { type: 'string', required: true, description: 'Text to count' } },
      output: { schema: { type: 'json' } },
      async execute(args) {
        if (args.text.length > maxChars) {
          return { error: 'TOO_LONG', limit: maxChars };
        }
        const words = countWords(args.text, includeCjk);
        return { words, chars: args.text.length, truncated: false };
      },
    }),
  );

  return ctx.commands.register('sample.count', () => 'counted');
}

export function countWords(text, includeCjk) {
  return text.split(/\s+/).filter(Boolean).length;
}
