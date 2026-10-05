CREATE TABLE `provider_lyrics` (
    `recording_id` text PRIMARY KEY NOT NULL REFERENCES recordings(id),
    `provider` text NOT NULL,
    `status` text NOT NULL,
    `package_json` text,
    `fetched_at` integer NOT NULL,
    `expires_at` integer NOT NULL
);
