import test from 'node:test';
import assert from 'node:assert/strict';
import { isChinese, promptPlaceholders, renderPrompt, PROMPT_PLACEHOLDERS, } from '../src/core/prompt.js';
import { PROMPTS, PROMPT_RULE_IDS } from '../src/core/prompts.js';
import { ADVISORY_RULES, RULES } from '../src/core/rules.js';
test('known placeholders are filled from the finding', () => {
    const rendered = renderPrompt('Fix {file} line {line} for {plugin}.', {
        file: 'README.md',
        line: 12,
        plugin: 'sample-plugin',
    });
    assert.equal(rendered, 'Fix README.md line 12 for sample-plugin.');
});
test('an unknown placeholder disappears so the prompt stays paste-ready', () => {
    const rendered = renderPrompt('Fix {file} {whatever} now.', { file: 'README.md' });
    assert.equal(rendered, 'Fix README.md now.');
    assert.ok(!/[{}]/.test(rendered));
});
test('missing items join in the language of the template', () => {
    assert.equal(renderPrompt('缺少 {missing}。', { missing: ['a', 'b', 'c'] }), '缺少 a、b 和 c。');
    assert.equal(renderPrompt('Missing {missing}.', { missing: ['a', 'b'] }), 'Missing a and b.');
    assert.equal(renderPrompt('Missing {missing}.', { missing: ['only'] }), 'Missing only.');
});
test('absent values fall back to readable wording instead of empty holes', () => {
    const zh = renderPrompt('请检查 {file} 的 {title}。', {});
    assert.match(zh, /相关文件/);
    assert.match(zh, /这个问题/);
    const en = renderPrompt('Check {file} for {title}.', {});
    assert.match(en, /relevant file/);
    assert.ok(!/[{}]/.test(zh + en));
});
test('isChinese and promptPlaceholders describe the template', () => {
    assert.equal(isChinese('请检查 README.md'), true);
    assert.equal(isChinese('Check README.md'), false);
    assert.deepEqual(promptPlaceholders('{file} and {line} and {file}'), ['file', 'line']);
    for (const placeholder of promptPlaceholders('{file}/{missing}/{plugin}/{title}/{suggestion}/{line}')) {
        assert.ok(PROMPT_PLACEHOLDERS.includes(placeholder), placeholder);
    }
});
test('every scoring rule and advisory ships panel copy', () => {
    const expected = [...RULES.map((rule) => rule.id), ...ADVISORY_RULES.map((rule) => rule.id)].sort();
    assert.deepEqual([...PROMPT_RULE_IDS].sort(), expected);
    for (const rule of RULES) {
        assert.ok(['high', 'medium', 'low'].includes(rule.priority), rule.id);
        assert.ok(rule.impact.length > 10 && rule.impactZh.length > 3, rule.id);
        assert.ok(isChinese(rule.promptTemplate), rule.id + ' zh template must be Chinese');
        assert.ok(!isChinese(rule.promptTemplateEn), rule.id + ' en template must be English');
    }
    for (const rule of ADVISORY_RULES) {
        assert.equal(rule.priority, 'low', rule.id);
    }
});
test('prompt templates stay short and resolve to a single paste-ready paragraph', () => {
    for (const [ruleId, copy] of Object.entries(PROMPTS)) {
        assert.ok(copy.promptTemplate.length >= 24, ruleId + ' zh template is too short');
        assert.ok(copy.promptTemplate.length <= 200, ruleId + ' zh template is too long');
        assert.ok(copy.promptTemplateEn.length <= 320, ruleId + ' en template is too long');
        for (const template of [copy.promptTemplate, copy.promptTemplateEn]) {
            assert.ok(template.split('\n').length <= 5, ruleId + ' template has too many lines');
            const rendered = renderPrompt(template, {
                plugin: 'sample-plugin',
                file: 'README.md',
                line: 3,
                missing: ['config', 'env'],
                title: 'A title',
                suggestion: 'Do the thing.',
            });
            assert.ok(!/[{}]/.test(rendered), ruleId + ': ' + rendered);
            assert.ok(rendered.length > 10, ruleId + ': ' + rendered);
            assert.ok(!/\s{2,}/.test(rendered), ruleId + ': double space in ' + rendered);
        }
    }
});
