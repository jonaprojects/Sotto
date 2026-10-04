# Listening interface decisions

Reviewed 4 October 2026 against primary product and accessibility documentation.

- Spotify's [Now Playing](https://support.spotify.com/kr-en/article/now-playing/) groups playback controls and places the mobile player just above navigation. Sotto groups title, artist, progress, Play/Pause and song skipping in one bottom dock. The skip icons switch tracks; lyric replay remains next to each line.
- Spotify's [lyrics updates](https://newsroom.spotify.com/2026-02-04/lyric-translations-offline-previews/) reinforce synchronized lyrics and translations as part of the listening experience. Sotto gives lyrics the main screen area, emphasizes the current line, and presents English immediately underneath. Translation modes are available next to playback.
- Spotify puts additional options behind a secondary menu. Sotto places speed, timing adjustment and source attribution in Learning settings, retaining a single main Play/Pause action.
- [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Techniques/css/C44) recommends 44 × 44 CSS-pixel targets under the enhanced criterion. Playback, replay, settings and modal controls have at least 44-pixel targets; the Play button is 56 pixels. Inline word targets follow the lyric typography rather than adding large gaps within sentences.
- Native vertical scroll snapping remains the primary feed navigation. Visible hints, previous/next controls and arrow-key navigation provide alternatives. Reduced-motion preferences disable smooth transitions; safe-area padding protects controls on phones.

These are design choices informed by these references, not a claim of full accessibility conformance. The demo uses approximate lyric timestamps and historical streaming recordings.
