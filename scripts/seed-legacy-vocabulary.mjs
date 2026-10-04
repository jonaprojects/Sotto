import {words} from '../lib/catalog.ts';
import {writeFile} from 'node:fs/promises';
import {sqlString} from './catalog-tools.mjs';
const output=process.argv[2]||'.sites-runtime/legacy-vocabulary.sql';const sql=['BEGIN TRANSACTION;'];for(const w of Object.values(words)){const id=`legacy:${w.id}`;sql.push(`INSERT INTO word_senses(id,text,translation,lemma,grammar) VALUES (${[id,w.text,w.translation,w.lemma,w.grammar].map(sqlString).join(',')}) ON CONFLICT(id) DO NOTHING;`,`INSERT INTO word_aliases(legacy_id,sense_id) VALUES (${[w.id,id].map(sqlString).join(',')}) ON CONFLICT(legacy_id) DO NOTHING;`);}sql.push('COMMIT;');await writeFile(output,sql.join('\n'));console.log('Exported legacy aliases; existing vocabulary rows are unchanged.');
