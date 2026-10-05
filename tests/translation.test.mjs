import test from 'node:test';
import assert from 'node:assert/strict';
import { translatePackage } from '../lib/translation.ts';
const pack = { id: 'test', recordingId: 'song', version: 1, rights: { translate: false }, lines: [
    { id: 'a', text: 'Ciao', translation: '', startMs: 1000, endMs: 2000, tokens: [] },
    { id: 'b', text: 'Ciao', translation: '', startMs: 3000, endMs: 4000, tokens: [] },
    { id: 'c', text: 'Amore', translation: 'Love', startMs: 5000, endMs: 6000, tokens: [] },
] };
test('whole-line translations retain timestamps, existing translations and repeated occurrences', async () => {
    const result = await translatePackage(pack, 'http://127.0.0.1:5000', async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body).q, ['Ciao']);
        return Response.json({ translatedText: ['Hello'] });
    });
    assert.deepEqual(result.lines.map(l => l.translation), ['Hello', 'Hello', 'Love']);
    assert.deepEqual(result.lines.map(l => [l.id, l.startMs, l.endMs]), pack.lines.map(l => [l.id, l.startMs, l.endMs]));
    assert.equal(pack.lines[0].translation, '');
    assert.equal(result.rights.translate, false);
});
test('offline, malformed, or non-local providers retain original lyrics', async () => {
    for (const response of [new Response('', {status: 503}), Response.json({translatedText: []}), Response.json({translatedText: [null]})]) {
        assert.equal(await translatePackage(pack, 'http://127.0.0.1:5000', async () => response), pack);
    }
    assert.equal(await translatePackage(pack, 'http://127.0.0.1:5000', async () => { throw Error('offline'); }), pack);
    assert.equal(await translatePackage(pack, 'https://example.com', async () => { throw Error('must not fetch'); }), pack);
    assert.equal(await translatePackage(pack, 'invalid'), pack);
});
test('uncached translations return a pending package without delaying original lyrics', async () => {
    const result = await translatePackage(pack, 'http://127.0.0.1:5000', async () => Response.json({status:'pending'}, {status:202}));
    assert.equal(result.translationStatus, 'pending');
    assert.deepEqual(result.lines, pack.lines);
});
