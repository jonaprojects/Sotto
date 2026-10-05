"""Local LibreTranslate service with a persistent, versioned whole-line cache."""
import os
import sqlite3
import sys
import logging
import threading
import queue
import itertools
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.sites-runtime' / 'translation'
RUNTIME.mkdir(parents=True, exist_ok=True)
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
# Keep downloaded models and configuration with this project.
for name, directory in [('XDG_DATA_HOME', 'data'), ('XDG_CONFIG_HOME', 'config'), ('XDG_CACHE_HOME', 'cache')]:
    os.environ[name] = str(RUNTIME / directory)
os.environ['ARGOS_DEVICE_TYPE'] = 'cpu'
os.environ['ARGOS_INTER_THREADS'] = '1'
os.environ['ARGOS_INTRA_THREADS'] = '2'

import minisbd.models
minisbd.models.cache_dir = str(RUNTIME / 'cache' / 'minisbd')
from libretranslate.main import get_parser
from libretranslate.app import create_app
from flask import request, jsonify
from waitress import serve

args = get_parser().parse_args(['--host', '127.0.0.1', '--port', '5000', '--load-only', 'it,en', '--disable-web-ui', '--disable-files-translation'])
app = create_app(args)
logging.getLogger('argostranslate.utils').setLevel(logging.WARNING)
app.config['MAX_CONTENT_LENGTH'] = 262144
CACHE = RUNTIME / 'translations.sqlite'
VERSION = 'libretranslate-1.9.6-it-en-1'
with sqlite3.connect(CACHE) as connection:
    connection.execute('CREATE TABLE IF NOT EXISTS translations (version TEXT, source TEXT, target TEXT, text TEXT, translation TEXT NOT NULL, PRIMARY KEY(version,source,target,text))')

jobs = queue.PriorityQueue()
sequence = itertools.count()
pending = set()
failed_until = {}
pending_lock = threading.Lock()

def cached_lines(texts):
    with sqlite3.connect(CACHE) as connection:
        return [connection.execute('SELECT translation FROM translations WHERE version=? AND source=? AND target=? AND text=?', (VERSION, 'it', 'en', text)).fetchone() for text in texts]

def translate_jobs():
    from argostranslate.translate import translate
    from translation_batch import translate_lines
    while True:
        priority, _, texts = jobs.get()
        try:
            missing = [text for text, row in zip(texts, cached_lines(texts)) if not row]
            # Catalog jobs already supply lyric line boundaries. Batching avoids
            # running sentence detection separately for thousands of short lines.
            if priority == 1:
                for start in range(0, len(missing), 16):
                    batch = missing[start:start + 16]
                    output = translate_lines(batch)
                    with sqlite3.connect(CACHE) as connection:
                        connection.executemany('INSERT OR REPLACE INTO translations VALUES (?,?,?,?,?)', [(VERSION, 'it', 'en', text, translated) for text, translated in zip(batch, output)])
            else:
                for text in missing:
                    translated = translate(text, 'it', 'en')
                    if translated.strip():
                        with sqlite3.connect(CACHE) as connection:
                            connection.execute('INSERT OR REPLACE INTO translations VALUES (?,?,?,?,?)', (VERSION, 'it', 'en', text, translated))
        except Exception:
            logging.error('Local translation job failed; original lyrics remain available.')
            with pending_lock:
                failed_until[texts] = time.monotonic() + 60
        finally:
            with pending_lock:
                pending.discard(texts)
            jobs.task_done()

threading.Thread(target=translate_jobs, daemon=True).start()

@app.post('/sotto/translate')
def nonblocking_translation():
    data = request.get_json(silent=True) or {}
    texts = data.get('q')
    if data.get('source') != 'it' or data.get('target') != 'en' or not isinstance(texts, list) or not texts or len(texts) > 500 or not all(isinstance(t, str) and 0 < len(t) <= 5000 for t in texts):
        return jsonify(error='Expected Italian lyric lines for English translation.'), 400
    rows = cached_lines(texts)
    if all(rows):
        return jsonify(translatedText=[row[0] for row in rows])
    key = tuple(texts)
    with pending_lock:
        if failed_until.get(key, 0) > time.monotonic():
            return jsonify(error='Translation temporarily unavailable.'), 503
        if key not in pending:
            if len(pending) >= 100:
                return jsonify(error='Translation queue is full.'), 503
            pending.add(key)
            jobs.put((1 if data.get('background') else 0, next(sequence), key))
    return jsonify(status='pending'), 202

@app.before_request
def cached_translation():
    if request.path != '/translate' or request.method != 'POST':
        return None
    data = request.get_json(silent=True) or {}
    if data.get('source') != 'it' or data.get('target') != 'en' or data.get('format', 'text') != 'text':
        return jsonify(error='This local service supports Italian to English text only.'), 400
    texts = data.get('q')
    if not isinstance(texts, list) or not texts or len(texts) > 500 or not all(isinstance(t, str) and 0 < len(t) <= 5000 for t in texts):
        return jsonify(error='Expected an array of lyric lines.'), 400
    with sqlite3.connect(CACHE) as connection:
        rows = [connection.execute('SELECT translation FROM translations WHERE version=? AND source=? AND target=? AND text=?', (VERSION, 'it', 'en', text)).fetchone() for text in texts]
    if all(rows):
        response = jsonify(translatedText=[row[0] for row in rows])
        response.headers['X-Sotto-Translation-Cache'] = 'hit'
        return response
    return None

@app.after_request
def persist_translation(response):
    if request.path == '/translate' and request.method == 'POST' and response.status_code == 200:
        data = request.get_json(silent=True) or {}
        texts = data.get('q', [])
        output = (response.get_json(silent=True) or {}).get('translatedText')
        if isinstance(output, list) and len(output) == len(texts) and all(isinstance(t, str) and t.strip() for t in output):
            with sqlite3.connect(CACHE) as connection:
                connection.executemany('INSERT OR REPLACE INTO translations VALUES (?,?,?,?,?)', [(VERSION, 'it', 'en', text, translated) for text, translated in zip(texts, output)])
    response.headers['Cache-Control'] = 'no-store'
    return response

print('Sotto translation service ready at http://127.0.0.1:5000', flush=True)
serve(app, host='127.0.0.1', port=5000, threads=2)
