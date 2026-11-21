import { desc, eq, inArray } from 'drizzle-orm';
import { db, isCloudSqlConfigured } from './index.ts';
import {
  appCollections,
  auditLogsTable,
  comments,
  posts,
  sessions,
  users,
} from './schema.ts';

export interface CloudSqlSessionRecord {
  sessionId: string;
  userId: string;
  isAdmin: boolean;
  sessionVersion: number;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
  ip?: string;
  userAgent?: string;
}

export async function getOrCreateUser(uid: string, email: string, nickname?: string) {
  try {
    const cleanUid = String(uid).trim();
    const cleanEmail = String(email || '').trim();
    const handle = String(nickname || `@${cleanEmail.split('@')[0] || cleanUid.slice(0, 12)}`).trim();

    const result = await db
      .insert(users)
      .values({
        uid: cleanUid,
        email: cleanEmail,
        nickname: handle,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw Object.assign(new Error('Database query failed. Please try again later.'), { cause: error });
  }
}

export async function getUsers() {
  try {
    return await db.select().from(users);
  } catch (error) {
    console.error('Database query failed in getUsers:', error);
    throw Object.assign(new Error('Database query failed. Please try again later.'), { cause: error });
  }
}

export async function upsertAppUserToCloudSql(u: any): Promise<void> {
  if (!isCloudSqlConfigured() || !u || !u.id) return;
  try {
    const uid = String(u.id).trim();
    const nickname = String(u.nickname || `@${uid}`).trim();
    const email = String(u.studentEmail || u.email || '').trim();
    const profileCopy: Record<string, any> = { ...u };
    delete profileCopy.password;
    delete profileCopy.savedPassword;
    delete profileCopy.passwordHash;

    const now = new Date();
    const createdDate = u.createdAt ? new Date(u.createdAt) : now;
    const updatedDate = u.updatedAt ? new Date(u.updatedAt) : now;

    await db
      .insert(users)
      .values({
        uid,
        email,
        nickname,
        accountType: String(u.accountType || 'Student'),
        realName: String(u.realName || ''),
        matricNumber: String(u.matricNumber || ''),
        department: String(u.department || ''),
        level: String(u.level || ''),
        phone: String(u.emergencyHomePhone || u.phoneNumber || ''),
        bio: String(u.bio || ''),
        avatarKey: String(u.avatarKey || '1'),
        avatarUrl: String(u.avatarUrl || ''),
        badgeType: String(u.badgeType || 'BLUE'),
        badgeTitle: String(u.badgeTitle || ''),
        reputationScore: Number.isFinite(Number(u.reputationScore)) ? Number(u.reputationScore) : 100,
        isVerified: Boolean(u.isVerified),
        verificationStatus: String(u.verificationStatus || 'unverified'),
        isApproved: u.isApproved !== false,
        isDeclined: Boolean(u.isDeclined),
        isBanned: Boolean(u.isBanned),
        isAdmin: Boolean(u.isAdmin),
        passwordHash: typeof u.passwordHash === 'string' ? u.passwordHash : null,
        sessionVersion: Number(u.sessionVersion) || 1,
        profileData: profileCopy,
        createdAt: Number.isNaN(createdDate.getTime()) ? now : createdDate,
        updatedAt: Number.isNaN(updatedDate.getTime()) ? now : updatedDate,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          nickname,
          accountType: String(u.accountType || 'Student'),
          realName: String(u.realName || ''),
          matricNumber: String(u.matricNumber || ''),
          department: String(u.department || ''),
          level: String(u.level || ''),
          phone: String(u.emergencyHomePhone || u.phoneNumber || ''),
          bio: String(u.bio || ''),
          avatarKey: String(u.avatarKey || '1'),
          avatarUrl: String(u.avatarUrl || ''),
          badgeType: String(u.badgeType || 'BLUE'),
          badgeTitle: String(u.badgeTitle || ''),
          reputationScore: Number.isFinite(Number(u.reputationScore)) ? Number(u.reputationScore) : 100,
          isVerified: Boolean(u.isVerified),
          verificationStatus: String(u.verificationStatus || 'unverified'),
          isApproved: u.isApproved !== false,
          isDeclined: Boolean(u.isDeclined),
          isBanned: Boolean(u.isBanned),
          isAdmin: Boolean(u.isAdmin),
          ...(typeof u.passwordHash === 'string' && u.passwordHash ? { passwordHash: u.passwordHash } : {}),
          sessionVersion: Number(u.sessionVersion) || 1,
          profileData: profileCopy,
          updatedAt: now,
        },
      });
  } catch (error) {
    console.error('Database query failed in upsertAppUserToCloudSql:', error);
    throw Object.assign(new Error('Failed to persist user account to database.'), { cause: error });
  }
}

export async function upsertSessionToCloudSql(rec: CloudSqlSessionRecord): Promise<void> {
  if (!isCloudSqlConfigured() || !rec?.sessionId || !rec?.userId) return;
  try {
    await db
      .insert(sessions)
      .values({
        sessionId: rec.sessionId,
        userUid: String(rec.userId),
        isAdmin: Boolean(rec.isAdmin),
        sessionVersion: Number(rec.sessionVersion) || 1,
        createdAt: new Date(rec.createdAt || Date.now()),
        expiresAt: new Date(rec.expiresAt),
        revokedAt: rec.revokedAt ? new Date(rec.revokedAt) : null,
        ip: String(rec.ip || ''),
        userAgent: String(rec.userAgent || ''),
      })
      .onConflictDoUpdate({
        target: sessions.sessionId,
        set: {
          revokedAt: rec.revokedAt ? new Date(rec.revokedAt) : null,
          expiresAt: new Date(rec.expiresAt),
          sessionVersion: Number(rec.sessionVersion) || 1,
        },
      });
  } catch (error) {
    console.error('Database query failed in upsertSessionToCloudSql:', error);
  }
}

export async function getSessionFromCloudSql(sessionId: string): Promise<CloudSqlSessionRecord | null> {
  if (!isCloudSqlConfigured() || !sessionId) return null;
  try {
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionId, sessionId))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      sessionId: row.sessionId,
      userId: row.userUid,
      isAdmin: row.isAdmin,
      sessionVersion: row.sessionVersion,
      createdAt: row.createdAt.getTime(),
      expiresAt: row.expiresAt.getTime(),
      revokedAt: row.revokedAt ? row.revokedAt.getTime() : undefined,
      ip: row.ip || undefined,
      userAgent: row.userAgent || undefined,
    };
  } catch (error) {
    console.error('Database query failed in getSessionFromCloudSql:', error);
    return null;
  }
}

export async function appendAuditLogToCloudSql(entry: {
  id: string;
  timestamp: string;
  event: string;
  actorId: string;
  actorNickname: string;
  actorIsAdmin: boolean;
  targetId?: string;
  ip: string;
  userAgent: string;
  status: string;
  details?: string;
}): Promise<void> {
  if (!isCloudSqlConfigured()) return;
  try {
    await db
      .insert(auditLogsTable)
      .values({
        id: entry.id,
        timestamp: new Date(entry.timestamp),
        event: entry.event,
        actorId: entry.actorId,
        actorNickname: entry.actorNickname,
        actorIsAdmin: entry.actorIsAdmin,
        targetId: entry.targetId || null,
        ip: entry.ip,
        userAgent: entry.userAgent,
        status: entry.status,
        details: entry.details || null,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error('Database query failed in appendAuditLogToCloudSql:', error);
  }
}

const COLLECTION_KEYS = [
  'marketplaceItems',
  'pendingMarketplaceItems',
  'verificationRequests',
  'reports',
  'verifCandidates',
  'sentEmails',
  'directMessages',
  'chatConversations',
  'chatReports',
  'chatRestrictions',
  'follows',
  'marketplaceReports',
  'helpDeskInquiries',
  'notifications',
  'supersededUsernames',
  'deletedUserIds',
  'deletedUserNicknames',
  'deletedPostIds',
  'deletedCommentIds',
  'verificationFee',
] as const;

export async function loadFullDbFromCloudSql(): Promise<{
  users: any[];
  posts: any[];
  comments: any[];
  sessions: CloudSqlSessionRecord[];
  collections: Record<string, any>;
  auditLogs: any[];
} | null> {
  if (!isCloudSqlConfigured()) return null;
  try {
    const [userRows, postRows, commentRows, sessionRows, collectionRows, auditRows] = await Promise.all([
      db.select().from(users),
      db.select().from(posts),
      db.select().from(comments),
      db.select().from(sessions),
      db.select().from(appCollections),
      db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.timestamp)).limit(2000),
    ]);

    const mappedUsers = userRows.map((row) => ({
      ...(row.profileData || {}),
      id: row.uid,
      nickname: row.nickname,
      studentEmail: row.email || (row.profileData as any)?.studentEmail || '',
      accountType: row.accountType,
      realName: row.realName ?? (row.profileData as any)?.realName ?? '',
      matricNumber: row.matricNumber ?? (row.profileData as any)?.matricNumber ?? '',
      department: row.department ?? (row.profileData as any)?.department ?? '',
      level: row.level ?? (row.profileData as any)?.level ?? '',
      emergencyHomePhone: row.phone || (row.profileData as any)?.emergencyHomePhone || '',
      bio: row.bio ?? (row.profileData as any)?.bio ?? '',
      avatarKey: row.avatarKey ?? (row.profileData as any)?.avatarKey ?? '1',
      avatarUrl: row.avatarUrl ?? (row.profileData as any)?.avatarUrl ?? '',
      badgeType: row.badgeType ?? (row.profileData as any)?.badgeType ?? 'BLUE',
      badgeTitle: row.badgeTitle ?? (row.profileData as any)?.badgeTitle ?? '',
      reputationScore: row.reputationScore,
      isVerified: row.isVerified,
      verificationStatus: row.verificationStatus ?? 'unverified',
      isApproved: row.isApproved,
      isDeclined: row.isDeclined,
      isBanned: row.isBanned,
      isAdmin: row.isAdmin,
      ...(row.passwordHash ? { passwordHash: row.passwordHash } : {}),
      sessionVersion: row.sessionVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }));

    const mappedPosts = postRows.map((row) => row.payload);
    const mappedComments = commentRows.map((row) => row.payload);
    const mappedSessions: CloudSqlSessionRecord[] = sessionRows.map((row) => ({
      sessionId: row.sessionId,
      userId: row.userUid,
      isAdmin: row.isAdmin,
      sessionVersion: row.sessionVersion,
      createdAt: row.createdAt.getTime(),
      expiresAt: row.expiresAt.getTime(),
      revokedAt: row.revokedAt ? row.revokedAt.getTime() : undefined,
      ip: row.ip || undefined,
      userAgent: row.userAgent || undefined,
    }));

    const collections: Record<string, any> = {};
    for (const row of collectionRows) {
      collections[row.key] = row.data;
    }

    const mappedAudits = auditRows.reverse().map((row) => ({
      id: row.id,
      timestamp: row.timestamp.toISOString(),
      event: row.event,
      actorId: row.actorId,
      actorNickname: row.actorNickname || '',
      actorIsAdmin: row.actorIsAdmin,
      ...(row.targetId ? { targetId: row.targetId } : {}),
      ip: row.ip || '',
      userAgent: row.userAgent || '',
      status: row.status,
      ...(row.details ? { details: row.details } : {}),
    }));

    return {
      users: mappedUsers,
      posts: mappedPosts,
      comments: mappedComments,
      sessions: mappedSessions,
      collections,
      auditLogs: mappedAudits,
    };
  } catch (error) {
    console.error('Database query failed in loadFullDbFromCloudSql:', error);
    throw Object.assign(new Error('Failed to load application state from Cloud SQL.'), { cause: error });
  }
}

export async function persistFullDbToCloudSql(dbObj: Record<string, any>): Promise<void> {
  if (!isCloudSqlConfigured() || !dbObj) return;
  try {
    const deletedUserIds = Array.isArray(dbObj.deletedUserIds)
      ? dbObj.deletedUserIds.map((id: any) => String(id).trim()).filter((id: string) => id && id !== 'usr_admin_modula')
      : [];
    if (deletedUserIds.length > 0) {
      await db.delete(users).where(inArray(users.uid, deletedUserIds)).catch(() => {});
    }

    const usersList = Array.isArray(dbObj.users) ? dbObj.users : [];
    for (const u of usersList) {
      if (u && u.id) {
        await upsertAppUserToCloudSql(u);
      }
    }

    const postsList = Array.isArray(dbObj.posts) ? dbObj.posts : [];
    for (const p of postsList) {
      if (!p || !p.id) continue;
      const pid = String(p.id);
      const now = new Date();
      await db
        .insert(posts)
        .values({
          id: pid,
          authorUid: String(p.authorId || ''),
          authorNickname: String(p.authorNickname || p.nickname || ''),
          content: String(p.content || ''),
          category: String(p.category || 'Campus Feed'),
          payload: p,
          createdAt: p.createdAt ? new Date(p.createdAt) : now,
          updatedAt: p.updatedAt ? new Date(p.updatedAt) : now,
        })
        .onConflictDoUpdate({
          target: posts.id,
          set: {
            authorUid: String(p.authorId || ''),
            authorNickname: String(p.authorNickname || p.nickname || ''),
            content: String(p.content || ''),
            category: String(p.category || 'Campus Feed'),
            payload: p,
            updatedAt: now,
          },
        });
    }

    const deletedPostIds = Array.isArray(dbObj.deletedPostIds)
      ? dbObj.deletedPostIds.map((id: any) => String(id).trim()).filter(Boolean)
      : [];
    if (deletedPostIds.length > 0) {
      await db.delete(posts).where(inArray(posts.id, deletedPostIds)).catch(() => {});
    }

    const commentsList = Array.isArray(dbObj.comments) ? dbObj.comments : [];
    for (const c of commentsList) {
      if (!c || !c.id) continue;
      const cid = String(c.id);
      const now = new Date();
      await db
        .insert(comments)
        .values({
          id: cid,
          postId: String(c.postId || ''),
          authorUid: String(c.authorId || ''),
          authorNickname: String(c.authorNickname || ''),
          content: String(c.content || ''),
          payload: c,
          createdAt: c.createdAt ? new Date(c.createdAt) : now,
          updatedAt: c.updatedAt ? new Date(c.updatedAt) : now,
        })
        .onConflictDoUpdate({
          target: comments.id,
          set: {
            authorUid: String(c.authorId || ''),
            authorNickname: String(c.authorNickname || ''),
            content: String(c.content || ''),
            payload: c,
            updatedAt: now,
          },
        });
    }

    const deletedCommentIds = Array.isArray(dbObj.deletedCommentIds)
      ? dbObj.deletedCommentIds.map((id: any) => String(id).trim()).filter(Boolean)
      : [];
    if (deletedCommentIds.length > 0) {
      await db.delete(comments).where(inArray(comments.id, deletedCommentIds)).catch(() => {});
    }

    const now = new Date();
    for (const key of COLLECTION_KEYS) {
      if (dbObj[key] !== undefined) {
        await db
          .insert(appCollections)
          .values({
            key,
            data: dbObj[key],
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: appCollections.key,
            set: {
              data: dbObj[key],
              updatedAt: now,
            },
          });
      }
    }
  } catch (error) {
    console.error('Database query failed in persistFullDbToCloudSql:', error);
    throw Object.assign(new Error('Failed to persist application state to Cloud SQL.'), { cause: error });
  }
}
