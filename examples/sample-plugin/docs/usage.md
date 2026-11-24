# Usage details

## Requirements

Node.js 22 or newer, and DeepSeek Harness 0.30 or newer.

## Tool reference

### count_words

Parameters: text (string, required).

Returns words, chars and the truncation flag, which is always false because the tool
rejects oversized input.

## Error handling

If the input exceeds maxChars the tool returns an error object with code TOO_LONG and
the limit, so the caller can split the text and retry.
