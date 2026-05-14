import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('SSE event format', () => {
  // Replicate the write function from execution.controller.ts
  const formatEvent = (event: { kind: string; [key: string]: unknown }) => {
    return `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
  };

  it('produces a single string with event and data on separate lines', () => {
    const result = formatEvent({ kind: 'compile-start' });
    assert.equal(result, 'event: compile-start\ndata: {"kind":"compile-start"}\n\n');
  });

  it('ends with double newline', () => {
    const result = formatEvent({ kind: 'done', passed: 3, total: 3, exitCode: 0 });
    assert.ok(result.endsWith('\n\n'), 'SSE events must end with \\n\\n');
  });

  it('contains exactly one event: line and one data: line', () => {
    const result = formatEvent({ kind: 'error', message: 'timeout' });
    const lines = result.split('\n');
    const eventLines = lines.filter(l => l.startsWith('event:'));
    const dataLines = lines.filter(l => l.startsWith('data:'));
    assert.equal(eventLines.length, 1, 'should have exactly one event line');
    assert.equal(dataLines.length, 1, 'should have exactly one data line');
  });

  it('event kind matches the event line', () => {
    const result = formatEvent({ kind: 'stdout', text: 'hello world' });
    assert.ok(result.startsWith('event: stdout\n'), 'event line should match kind');
  });

  it('data line is valid JSON', () => {
    const result = formatEvent({ kind: 'test-pass', name: 'test "with quotes"' });
    const dataLine = result.split('\n').find(l => l.startsWith('data:'));
    assert.ok(dataLine, 'should have data line');
    const json = dataLine!.replace(/^data: /, '');
    assert.doesNotThrow(() => JSON.parse(json), 'data payload should be valid JSON');
    const parsed = JSON.parse(json);
    assert.equal(parsed.kind, 'test-pass');
    assert.equal(parsed.name, 'test "with quotes"');
  });
});
