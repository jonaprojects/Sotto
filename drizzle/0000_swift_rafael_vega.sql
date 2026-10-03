CREATE TABLE `vocabulary` (
	`user_id` text NOT NULL,
	`word_id` text NOT NULL,
	`status` text NOT NULL,
	`encounters` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`)
);
