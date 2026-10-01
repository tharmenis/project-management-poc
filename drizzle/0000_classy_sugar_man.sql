CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` text NOT NULL,
	`user_id` text,
	`channel` text,
	`event` text NOT NULL,
	`message_text` text,
	`payload_json` text,
	`api_response_json` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `executed_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`op_object_id` text,
	`undo_json` text,
	`executed_at` text NOT NULL,
	`undone_at` text
);
--> statement-breakpoint
CREATE TABLE `processed_messages` (
	`client_message_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`original_message` text NOT NULL,
	`candidates_json` text NOT NULL,
	`proposal_json` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `proposals_user_status_idx` ON `proposals` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user_links`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_links` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`op_user_id` text NOT NULL,
	`op_user_name` text NOT NULL,
	`token_ciphertext` text NOT NULL,
	`token_iv` text NOT NULL,
	`token_tag` text NOT NULL,
	`rc_user_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_links_op_user_id_unique` ON `user_links` (`op_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_links_rc_user_id_unique` ON `user_links` (`rc_user_id`);