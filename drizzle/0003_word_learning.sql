CREATE TABLE `provider_word_senses` (
	`id` text PRIMARY KEY NOT NULL,
	`recording_id` text NOT NULL,
	`line_id` text NOT NULL,
	`text` text NOT NULL,
	`translation` text NOT NULL,
	`lemma` text NOT NULL,
	`grammar` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vocabulary_families` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vocabulary_families_user_name` ON `vocabulary_families` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `vocabulary_memberships` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`family_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`, `family_id`)
);
