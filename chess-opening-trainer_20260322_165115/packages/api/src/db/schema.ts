import { pgTable, text, timestamp, integer, real, boolean, unique } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const openings = pgTable('openings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  eco: text('eco').notNull(),
});

export const positions = pgTable('positions', {
  id: text('id').primaryKey(),
  openingId: text('opening_id').notNull().references(() => openings.id),
  fen: text('fen').notNull(),
  san: text('san').notNull(),
  moveNumber: integer('move_number').notNull(),
  parentId: text('parent_id'),
  trapTag: text('trap_tag'),
});

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  positionId: text('position_id').notNull().references(() => positions.id),
  state: text('state').notNull(),
  step: integer('step').notNull(),
  interval: real('interval').notNull(),
  easeFactor: real('ease_factor').notNull(),
  dueAt: timestamp('due_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  userPositionUnique: unique().on(table.userId, table.positionId),
}));

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  openingId: text('opening_id').notNull().references(() => openings.id),
});

export const sessionItems = pgTable('session_items', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  cardId: text('card_id').notNull().references(() => cards.id),
  grade: text('grade').notNull(),
  answeredAt: timestamp('answered_at').notNull(),
  hintUsed: boolean('hint_used').notNull(),
});

export const trapEncounters = pgTable('trap_encounters', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  positionId: text('position_id').notNull().references(() => positions.id),
  outcome: text('outcome').notNull(),
  encounteredAt: timestamp('encountered_at').notNull(),
});
