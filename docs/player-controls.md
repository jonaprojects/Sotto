# Discovery player controls

Shuffle rearranges only upcoming cards in the current discovery session. The selected card and preceding cards retain their order. Turning it off restores the upcoming cards to the original server-provided order. New batches are added without duplicate recordings and their upcoming cards are shuffled when enabled.

Repeat cycles Off → All → One → Off. One restarts the exact current recording at zero using the playback adapter. All wraps to the first session card only after the catalog is exhausted; it waits for additional batches before then. Manual Next and Previous still change songs when Repeat one is active. Repeat all permits transport-button navigation across the session boundary. Non-adjacent navigation jumps directly rather than animating through intermediate songs.

Shuffle and repeat are Sotto session controls: Spotify receives individual approved recording playback commands. They do not modify an external Spotify playlist or account setting.

The speaker opens a horizontal volume slider, percentage, and mute/restore control. Escape and outside click dismiss it. Muting retains the last nonzero level for restoration. Volume is retained by the playback adapter across track changes and device reconnects, and queued changes apply the latest requested level. The setting is local to this page session.

The main transport keeps a centered play button, 44px touch targets, accent indicators for active modes, and a distinct Repeat one icon. Volume shares the existing timeline row so the dock height stays compact. Translation help sits beside track metadata.

Behavior follows [Spotify’s Now Playing controls](https://support.spotify.com/kr-en/article/now-playing/). Regression tests cover shuffle identity/history preservation, repeat end-of-session decisions, and volume clamping, reconnects, and rapid changes.
