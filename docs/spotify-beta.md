# Spotify beta setup and rollout

The live `/` demo is retained. The new `/beta` implementation is staged locally and must not replace the live release until the feasibility and pilot gates pass. Premium is required for playback, but a Premium account alone does not provide developer API access.

## Current delivery status

Implemented: normalized D1 schema, encrypted PKCE connection, playback adapter, explicit taste settings, deterministic paginated discovery, compact vertical feed, owner review tools, rights-gated learning packages, and legacy vocabulary aliases. Automated tests use isolated fixtures; they do not establish real Spotify playback or language verification.

A local MusicBrainz import collected 320 **unreviewed candidates**, with four recorded artist identity issues (including the initial Annalisa ambiguity, subsequently resolved with an explicit seed ID). The candidates currently span 25 artists. Candidates have no Spotify match or language approval. They are not the 50-song pilot or 200-song beta. No modern lyrics or audio files were downloaded. The local checkpoint and SQL are ignored runtime files and are not deployed.

Outstanding: free developer app registration, actual Spotify authorization/playback and policy feasibility, Spotify matches, human language review, 50 approved recordings plus a 30-minute session, then 200 approved recordings from 30 artists plus a 90-minute session. No real mobile playback has been validated. Contemporary learning coverage is currently zero.

## 1. Owner creates a free Spotify developer application

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard) using your existing Premium account. Create an application and complete the account agreements yourself. Do not select any paid plan or enter payment information.
2. Register the exact HTTPS redirect URI: `https://sotto-music-languages.jonathegreatest.chatgpt.site/api/spotify/callback`. Do not alter the ChatGPT authentication callback.
3. Enable the Web API and Web Playback SDK as required by the current dashboard. Add beta accounts using Spotify's authorized development-user controls and current limits.
4. Supply only the **public Client ID** to configure Sotto. This implementation uses PKCE and does not need a client secret. Never send refresh tokens or secrets in chat.
5. Review the current [developer policy](https://developer.spotify.com/policy), [development-mode restrictions](https://developer.spotify.com/documentation/web-api/concepts/quota-modes), and [SDK requirements](https://developer.spotify.com/documentation/web-playback-sdk). Personal use is not an exemption. Spotify synchronization, content analysis and AI ingestion restrictions may prevent portions of the planned experience. If discovery/playback is unsuitable, retain the demo and stop rollout. Keep synchronized learning disabled until explicitly resolved.

## 2. Configuration and database

Use existing Sites secret/binding configuration; no new infrastructure. Do not commit credentials. `.dev.vars*`, `.sites-runtime`, and `.wrangler` are ignored.

| Setting | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Public developer application Client ID |
| `SPOTIFY_TOKEN_KEY` | Secret, cryptographically random value used for AES-GCM and signed feed cursors; retain securely |
| `SITE_ORIGIN` | `https://sotto-music-languages.jonathegreatest.chatgpt.site` |
| `CATALOG_OWNER_ID` | Server-derived ChatGPT user ID of the review owner |
| `SPOTIFY_POLICY_APPROVED` | `false` until discovery/player suitability is established |
| `SPOTIFY_BETA_ENABLED` | `false` until controlled feasibility testing is authorized and configured |
| `SPOTIFY_LEARNING_APPROVED` | `false` until Spotify learning synchronization suitability is established |

Apply the additive `drizzle/0001_short_kulan_gath.sql` to the existing D1 database using the approved Sites migration workflow before enabling beta. Do not recreate the database or drop the vocabulary table. Export aliases with `node --import ./tests/register.mjs scripts/seed-legacy-vocabulary.mjs .sites-runtime/legacy-vocabulary.sql`, then apply that SQL. Existing saved IDs remain intact; beta reads aggregate alias progress.

For local development, run `node scripts/run-framework.mjs dev`. Local ChatGPT authentication is a development mock; never substitute it for production identity. The checked-in test loader is needed only for isolated tests and TypeScript CLI imports, never production server startup. Local D1 migrations use the generated `dist/server/wrangler.json`, `--local --persist-to .wrangler/state`; remote migrations require the real hosting binding and remain gated.

## 3. Resumable catalog workflow

MusicBrainz core metadata is [CC0](https://musicbrainz.org/doc/About/Data_License). Genre and mood labels are editorial. Artist nationality and album metadata are never language evidence.

The collected draft is preserved in `data/catalog-candidates.json` and its conflict-safe `data/catalog-candidates.sql`; apply the SQL to populate the review queue. To resume that checkpoint locally, copy the JSON into `.sites-runtime/catalog.json`. Run `node scripts/import-catalog.mjs --artists 30 --releases 1 --tracks 320`. The importer serializes MusicBrainz requests at least 1.1 seconds apart, records IDs/ISRCs, excludes obvious live/remix/instrumental variants, checkpoints each recording, and exports draft SQL. Rerunning with the same bounds resumes without duplicate IDs or ISRCs. The initial checkpoint scans one release per resolved artist; for a broader release pass use a new named checkpoint and SQL output, then merge through the SQL's conflict-safe inserts. Review ambiguous identities in the checkpoint `issues` list; correct an explicit seed MBID only after checking the MusicBrainz identity.

Once Spotify access is configured, provide a short-lived importer token through the local process environment `SPOTIFY_IMPORT_ACCESS_TOKEN` and run `node scripts/import-catalog.mjs --resolve-spotify --artists 30 --releases 1 --tracks 320`. Do not put the token in a command argument, file, URL or log. Matching uses ISRC or exact normalized title/artist/version plus duration; ambiguous results remain unresolved. Quota exhaustion stops the import; ordinary rate limits stop with the server's Retry-After so the owner can resume later. Do not rebuild the catalog during page loads.

Apply the draft SQL locally first. Open `/beta/review` as the configured owner. Listen to the **full exact recording** through authorized playback, then record Italian-throughout verification, exact Spotify match, styles/moods, explicit designation, reviewer and supporting independently permitted source. Reject dialect-only, mixed-language, instrumental and uncertain recordings. Approval cannot be inferred from a title or artist. The owner UI lists 100 candidates per filtered view; approving/rejecting moves them out of pending so the remaining queue becomes visible. Import remains a local command.

## 4. Learning packages

Listening-only is the default. No paid lyrics provider is integrated. A package needs documented permission to display, store, translate and annotate, attribution, expiry/removal rules, exact recording match and reviewed timestamps. Public availability alone is insufficient.

Package shape is defined in `lib/discovery.ts`: an immutable package ID/version/recordingId, rights manifest, and ordered line occurrences with start/end milliseconds, original text, English translation, and tokens whose surfaces reconstruct the original line. Contextual senses have independent IDs, translation, lemma and grammar. Repeated choruses use distinct line IDs. Export a draft using `node --import ./tests/register.mjs scripts/import-learning.mjs package.json output.sql duration-ms`, apply it, then review at `/beta/review/learning`. Rights, timing and exact-recording approval are separate from the provider-level learning suitability flag. Invalid/expired packages are listening-only. Use new package and occurrence IDs for changed versions.

## 5. Validation and controlled rollout

Run `node --import ./tests/register.mjs --test tests/discovery.test.mjs tests/api.test.mjs tests/player.test.mjs` and `node node_modules/typescript/bin/tsc --noEmit` before building. Tests cover security boundaries, refresh rotation/disconnect races, feed rules, rights/timing validation, vocabulary retention, and mocked SDK rapid selection/buffering/device loss. They do not replace real acceptance.

For feasibility, enable policy and beta flags only in the controlled private test environment after configuration and policy review. Test OAuth consent/denial/state expiry, browser activation, play/pause/seek/track changes, token expiry/reconnect, unavailable tracks, offline, rate limits, quota exhaustion, and device transfer. Test the in-app browser explicitly; if SDK playback is unsupported, use the visible external-browser guidance. Keep learning disabled. Check 320px, 390px, desktop and a real mobile browser.

Pilot: approve at least 50 recordings and complete 30 minutes of discovery. Long-session beta: at least 200 recordings, 30 artists, all five buckets, and 90 minutes without unintended repeats. Check backward navigation, deliberate exhaustion/reshuffle, rights expiry and existing vocabulary. Check all these boxes before replacing the private live demo. Preserve the prior saved release `31b24024b8b6c0fff99bbd254509bd606f5f5536` for rollback. The existing live release is unchanged by local work.

Disconnect removes Spotify connection credentials, pending authorization and feed session records while retaining vocabulary and explicit preferences. Avoid collecting listening profiles, durations or derived metrics. Only aggregate operational failures/catalog counts should be monitored. No automation, paid provider, audio extraction or AI ingestion of Spotify content is introduced.
