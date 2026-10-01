import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const userLinks = sqliteTable("user_links", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  opUserId: text("op_user_id").notNull().unique(),
  opUserName: text("op_user_name").notNull(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenTag: text("token_tag").notNull(),
  rcUserId: text("rc_user_id").unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  idHash: text("id_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => userLinks.id),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const processedMessages = sqliteTable("processed_messages", {
  clientMessageId: text("client_message_id").primaryKey(),
  userId: text("user_id").notNull(),
  receivedAt: text("received_at").notNull(),
});

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    channel: text("channel", { enum: ["web", "repl", "rocketchat"] }).notNull(),
    originalMessage: text("original_message").notNull(),
    candidatesJson: text("candidates_json", { mode: "json" }).notNull(),
    proposalJson: text("proposal_json", { mode: "json" }),
    status: text("status", {
      enum: ["clarifying", "pending", "confirmed", "cancelled", "expired", "failed"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [index("proposals_user_status_idx").on(table.userId, table.status)],
);

export const executedActions = sqliteTable("executed_actions", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  userId: text("user_id").notNull(),
  kind: text("kind", { enum: ["time_entry", "comment", "status"] }).notNull(),
  opObjectId: text("op_object_id"),
  undoJson: text("undo_json", { mode: "json" }),
  executedAt: text("executed_at").notNull(),
  undoneAt: text("undone_at"),
});

export const auditLog = sqliteTable("audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: text("ts").notNull(),
  userId: text("user_id"),
  channel: text("channel"),
  event: text("event").notNull(),
  messageText: text("message_text"),
  payloadJson: text("payload_json", { mode: "json" }),
  apiResponseJson: text("api_response_json", { mode: "json" }),
  error: text("error"),
});

export type UserLink = typeof userLinks.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type ExecutedAction = typeof executedActions.$inferSelect;
