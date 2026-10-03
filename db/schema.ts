// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const vocabulary = sqliteTable('vocabulary', { userId:text('user_id').notNull(),wordId:text('word_id').notNull(),status:text('status').notNull(),encounters:integer('encounters').notNull().default(1),updatedAt:integer('updated_at').notNull() }, t=>[primaryKey({columns:[t.userId,t.wordId]})]);
