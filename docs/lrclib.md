# LRCLIB integration in the existing local app

The local `.dev.vars` setting `LRCLIB_ENABLED=true` enables provider lyrics in `/beta`. No API key or paid account is needed. This flag is separate from approval of curated learning packages; provider availability never marks permissions as approved.

`provider_lyrics` caches synchronized packages separately from reviewed learning content. Positive matches expire after seven days, unavailable matches after one day. Provider requests are serial, delayed by 350 ms, and respect rate-limit cooldowns. Requests time out after eight seconds; a failed lookup retains a listening-only card.

The importer `node scripts/import-lrclib.mjs` uses the audit in `.sites-runtime/lrclib-coverage/results.json`, checkpoints locally, and writes `packages.sql`. Apply that SQL to the existing local database after migration `0002_provider_lyrics.sql`. Imported lyrics and checkpoints stay in ignored local runtime files and are not committed or published.

Matches require normalized title and artist equality and recording duration within two seconds. LRC parsing supports repeated timestamps, fractional seconds, offsets, simultaneous lines, and empty markers for lyric gaps. Every repeated occurrence has its own line ID. Lyrics follow the existing Spotify playback position and each line can be replayed with the seek control.

LRCLIB packages contain original text and timing only. They do not create translations, dictionary senses, grammatical information, or vocabulary entries. Translation controls remain disabled where translations are missing. The existing annotated-learning filter continues to include approved learning packages only.

The source link appears beneath lyrics. Settings clarify community accuracy limits and unresolved reuse and translation permissions. This is a local integration in the existing app, not a separate prototype or a hosted deployment. No provider terms exemption is claimed.

Local catalog expansion on 2026-10-04: 300 enabled recordings across 33 artists, with 233 synchronized packages and 67 listening-only records. These catalog language approvals are the owner's requested prototype auto-approvals, not manual full-recording verification. Parser tests cover introductions, gaps, repeated choruses and malformed timestamps. Actual alignment remains dependent on community timestamps matching the recording version.
