CREATE TABLE `catalog_reviews` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`language_status` text NOT NULL,
	`reviewer` text NOT NULL,
	`evidence_json` text NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `feed_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`order_json` text NOT NULL,
	`preference_revision` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `learning_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`version` integer NOT NULL,
	`rights_json` text NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `line_translations` (
	`line_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `lyric_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lyric_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`package_id`) REFERENCES `learning_packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lyric_timings` (
	`line_id` text PRIMARY KEY NOT NULL,
	`start_ms` integer NOT NULL,
	`end_ms` integer NOT NULL,
	FOREIGN KEY (`line_id`) REFERENCES `lyric_lines`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `oauth_pending` (
	`state_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`encrypted` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_mappings` (
	`recording_id` text PRIMARY KEY NOT NULL,
	`spotify_uri` text NOT NULL,
	`match_status` text NOT NULL,
	`evidence_json` text NOT NULL,
	`metadata_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`recording_id`) REFERENCES `recordings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`artist_id` text NOT NULL,
	`isrc` text,
	`duration_ms` integer NOT NULL,
	`genres_json` text NOT NULL,
	`moods_json` text NOT NULL,
	`explicit` integer,
	`source_url` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spotify_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`encrypted` text NOT NULL,
	`expires_at` integer NOT NULL,
	`version` text NOT NULL,
	`refresh_lock` text,
	`lock_expires` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `word_aliases` (
	`legacy_id` text PRIMARY KEY NOT NULL,
	`sense_id` text NOT NULL,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `word_occurrences` (
	`line_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`surface` text NOT NULL,
	`sense_id` text,
	PRIMARY KEY(`line_id`, `ordinal`),
	FOREIGN KEY (`line_id`) REFERENCES `lyric_lines`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sense_id`) REFERENCES `word_senses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `word_senses` (
	`id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`translation` text NOT NULL,
	`lemma` text NOT NULL,
	`grammar` text NOT NULL
);
