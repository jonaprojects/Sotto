# Sotto

A mobile-first Italian → English music-learning prototype built with React, Vinext and a Cloudflare Worker.

## Run

Install dependencies with `npm ci`, generate the production output with `npm run build`, apply the initial local migration using the Wrangler command in the starter README, then `npm run dev`.

Local preview authentication: `/signin-with-chatgpt?return_to=/`. This uses the starter's loopback-only mock identity; hosted access uses Sites authentication.

## Experience

Scroll, swipe, or use Up/Down to change songs. Space toggles playback. Select **Stream song** to use the visible YouTube IFrame player; practice mode advances a silent timeline. Select any Italian word to pause and inspect its meaning, lemma, and grammar. Save it or mark it learned. Vocabulary is stored per authenticated user in D1; no audio files are stored.

The catalog contains two Italian classics with learning excerpts and approximate timestamps. Adjust the lyric offset in settings for a recording. Timings are not yet production-aligned; embedding remains subject to YouTube availability, user interaction, and regional restrictions.

## Data model

`lib/catalog.ts` defines separate song records, lyric lines containing word IDs, timing records keyed by line ID, English line translations, and dictionary entries containing lemmas and grammatical information. D1's vocabulary table has a composite user/word key with status, encounter count and update time. Adding a licensed lyrics provider or larger catalog does not require changing the progress schema. API requests validate dictionary IDs, require server-side identity, check write origin and use prepared statements.

Photography: Bjorn Snelders and Laurenz Kleinheider / Unsplash. Source links are in Learning settings. Streaming sources: Tony Sandler’s Santa Lucia and Luciano Pavarotti’s official La donna è mobile audio on YouTube.

## Playback and feed update

The app now opens in YouTube streaming mode. Tap Play song to start audio. Native vertical scrolling snaps between full-height cards and transfers playback to the active song. Silent practice remains available on desktop. The second recording was replaced with an embeddable performance after error 150 was observed during testing.

## Audio-only listening

The lyrics feed now uses externally hosted Internet Archive MP3 streams, without a YouTube player or video. No audio files are saved in the app. The catalog uses Titta Ruffo's Santa Lucia (1923) and Enrico Caruso's La donna è mobile (1908); source URLs are attached to each song. HTMLAudioElement playback events and currentTime drive the lyric clock, play/pause, seeking, speed and volume. Swipe/scroll changes the active stream and pauses the previous one. One initial play gesture is required by browser autoplay rules. Lyrics remain learning excerpts with approximate timestamps.
