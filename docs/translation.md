# Local Italian → English translation

Sotto uses LibreTranslate 1.9.6 with its Argos Italian/English models. No account, API key, paid service, or cloud deployment is required. Initial installation downloads packages/models; subsequent translations run on the local CPU.

## Run

On this configured Windows checkout, `npm run dev` starts the translator in a hidden background process. Start it independently with `powershell -NoProfile -File scripts/start-translation.ps1`. The service binds only `127.0.0.1:5000`, with one inference worker to bound CPU use. Logs are in `.sites-runtime/translation/server*.log`.

Set `LOCAL_TRANSLATION_URL=http://127.0.0.1:5000` in ignored `.dev.vars`. The learning endpoint uses it only when accessed through `127.0.0.1`; production remains unchanged. If unavailable or malformed, original lyrics remain available. Uncached songs show Italian lyrics immediately with a preparing status; the app checks every three seconds while the song is current. `/sotto/translate` queues work and returns 202, or cached translations with 200. One inference worker runs, while two HTTP workers keep cache reads responsive. App jobs take priority over catalog warming.

Whole lines are translated with their existing IDs/timestamps. Existing translations take priority; repeated choruses reuse translation results. Machine translations are labeled in the player and can be hidden with EN/IT. Translation does not provide word senses, lemmas, or grammatical annotations.

The versioned persistent cache lives in `.sites-runtime/translation/translations.sqlite`. Models and configuration also remain under that ignored directory. Do not publish these data files. To pretranslate the existing audited catalog, run `node scripts/warm-translations.mjs`; reruns reuse cached results.

Catalog warming translates batches of up to 16 whole lyric lines with the same installed Argos model and beam size. It preserves input order and original cache keys, with a casing retry if the model returns an empty heading. Interactive word requests keep the existing translation path. The warmer derives its total from available packages rather than assuming a fixed catalog size.

## Reinstall

Create `.sites-runtime/translation-venv` with Python 3.12's `-m venv`, then run its `Scripts/python.exe -m pip install -r scripts/translation-requirements.txt`. Start the service to download only Italian/English models. The Windows Python executable used on this machine is provided by the Codex workspace runtime.

Machine translations can mishandle slang and poetic expressions. Lyric reuse/translation permissions remain unverified; integration does not change existing rights manifests.
