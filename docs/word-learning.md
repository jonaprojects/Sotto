# Word learning in the local beta

Hover a lyric word with a mouse (250 ms dwell), or click/tap it, to pause playback and open its definition. Closing resumes only if playback was active when the popup opened and the recording has not changed. Double-click or double-tap within 350 ms adds the word to Favorites directly.

The speaker button uses the browser's speech synthesis API with an available Italian voice. Voice availability depends on the browser and operating system; the popup explains when none is available. Browser voices may use a remote service. No speech service account or paid API is configured.

The star toggles Favorites. The plus opens a vocabulary family picker and lets the user create a named family. Vocabulary provides All words, Favorites, and family filters. Removing a membership retains the saved word and its learning progress.

LRCLIB words are split at Unicode word boundaries, preserving accents, apostrophes, punctuation, and exact lyric timing. IDs include recording, lyric context, and token position. English word translations use the existing local Italian-to-English translation service, are cached in D1, and are labelled machine translations. These isolated-word translations can be ambiguous. Base forms and grammar are displayed only when supplied by an annotated package; they are not inferred from the word translation.

Apply `drizzle/0003_word_learning.sql` to the local D1 database before using the new endpoints. This adds definitions, families, and memberships without changing existing vocabulary IDs or statuses.

Authenticated endpoints: `GET /api/words`, `GET /api/vocabulary/families`, and `POST /api/vocabulary/families` (`create`, `save`, `remove`). Family ownership and word identifiers are verified server-side, and mutations require a matching origin.

Run regression tests with `node --import ./tests/register.mjs --test tests/*.test.mjs`.
