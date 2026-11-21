import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().default(''),
  nickname: text('nickname').notNull(),
  accountType: text('account_type').notNull().default('Student'),
  realName: text('real_name').default(''),
  matricNumber: text('matric_number').default(''),
  department: text('department').default(''),
  level: text('level').default(''),
  phone: text('phone').default(''),
  bio: text('bio').default(''),
  avatarKey: text('avatar_key').default('1'),
  avatarUrl: text('avatar_url').default(''),
  badgeType: text('badge_type').default('BLUE'),
  badgeTitle: text('badge_title').default(''),
  reputationScore: integer('reputation_score').notNull().default(100),
  isVerified: boolean('is_verified').notNull().default(false),
  verificationStatus: text('verification_status').default('unverified'),
  isApproved: boolean('is_approved').notNull().default(true),
  isDeclined: boolean('is_declined').notNull().default(false),
  isBanned: boolean('is_banned').notNull().default(false),
  isAdmin: boolean('is_admin').notNull().default(false),
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').notNull().default(1),
  profileData: jsonb('profile_data').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  sessionId: text('session_id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  isAdmin: boolean('is_admin').notNull().default(false),
  sessionVersion: integer('session_version').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revokedAt: timestamp('revoked_at'),
  ip: text('ip').default(''),
  userAgent: text('user_agent').default(''),
});

export const posts = pgTable('posts', {
  id: text('id').primaryKey(),
  authorUid: text('author_uid').notNull().default(''),
  authorNickname: text('author_nickname').notNull(),
  content: text('content').notNull().default(''),
  category: text('category').default('Campus Feed'),
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  authorUid: text('author_uid').default(''),
  authorNickname: text('author_nickname').notNull(),
  content: text('content').notNull().default(''),
  payload: jsonb('payload').$type<Record<string, any>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appCollections = pgTable('app_collections', {
  key: text('key').primaryKey(),
  data: jsonb('data').$type<any>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const auditLogsTable = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  event: text('event').notNull(),
  actorId: text('actor_id').notNull(),
  actorNickname: text('actor_nickname').default(''),
  actorIsAdmin: boolean('actor_is_admin').notNull().default(false),
  targetId: text('target_id'),
  ip: text('ip').default(''),
  userAgent: text('user_agent').default(''),
  status: text('status').notNull(),
  details: text('details'),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userUid],
    references: [users.uid],
  }),
}));
