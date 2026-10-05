// Prepare the local catalog once; SQLite cache also serves future app requests.
import { readFile, writeFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile('.sites-runtime/lrclib-coverage/packages.json', 'utf8'));
const total = rows.filter(r => r.package).length;
let completed = 0;
for (const row of rows.filter(r => r.package)) {
    const texts = [...new Set(row.package.lines.map(l => l.text))];
    let response;
    do {
        response = await fetch('http://127.0.0.1:5000/sotto/translate', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({q:texts,source:'it',target:'en',format:'text',background:true}), signal: AbortSignal.timeout(10000) });
        if (response.status === 202) await new Promise(resolve => setTimeout(resolve, 1000));
    } while (response.status === 202);
    if (!response.ok) throw new Error(`Local translation HTTP ${response.status}; existing cache is retained.`);
    const output = (await response.json()).translatedText;
    if (!Array.isArray(output) || output.length !== texts.length || !output.every(t => typeof t === 'string' && t.trim())) throw new Error('Incomplete translations; cache is retained.');
    completed++;
    console.log(`Cached translations ${completed}/${total}`);
    await writeFile('.sites-runtime/translation/warm-status.json', JSON.stringify({completed,total,updatedAt:Date.now()}));
}
