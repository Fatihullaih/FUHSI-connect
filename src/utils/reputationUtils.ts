import { Post, Comment, UserProfile, Report } from '../types';
import { isDemoUser, isDemoNickname, isDemoPost } from './postGenerator';
import { isGuestAccount, isModulaAccount } from './userDbUtils';

export const REPUTATION_RULES = {
  PROFILE_COMPLETION: 20,
  CREATE_THREAD: 2,
  RECEIVE_LIKE: 1,
  RECEIVE_COMMENT: 1,
  RECEIVE_REPOST: 1,
  PERFORM_REPOST: 1,
  SPAM_PENALTY: 20,
  OFFENSIVE_PENALTY: 20,
  MULTIPLE_REPORTS_PENALTY: 20,
};

/**
 * Calculates a user's total points dynamically based on actual activity on the platform according to official specifications:
 * 
 * How Users Earn Points:
 * - Create a quality post (+2)
 * - Receive a like on a thread (+1)
 * - Receive a comment on a thread (+1)
 * - Receive a repost/quote of a thread (+1)
 * - Complete profile (+20, one-time reward)
 * 
 * How Users Lose Points:
 * - Spam (-20)
 * - Offensive post (-20)
 * - Multiple valid reports (-20)
 * 
 * Anti-Abuse Rules:
 * - Liking your own post earns 0 points
 * - Commenting on your own post earns 0 points
 * - Reposting or quoting your own post earns 0 points
 * - Only interactions from other users count toward a user's points
 */
export const calculateUserPoints = (
  nickname?: string,
  userProfile?: Partial<UserProfile> | null,
  allPosts: Post[] = [],
  allComments: Comment[] = [],
  allReports: Report[] = []
): number => {
  if (!nickname) return REPUTATION_RULES.PROFILE_COMPLETION;

  const normTarget = nickname.toLowerCase().replace(/^@/, '').trim();

  let points = 0;

  // 1. Complete profile (one-time reward = +20)
  const isProfileComplete = Boolean(
    userProfile?.nickname ||
    userProfile?.department ||
    userProfile?.level ||
    userProfile?.bio ||
    userProfile?.studentEmail ||
    userProfile?.realName ||
    userProfile?.isVerified ||
    userProfile?.isApproved
  );

  if (isProfileComplete) {
    points += REPUTATION_RULES.PROFILE_COMPLETION;
  }

  // Find all threads created by this user
  const myPosts = (allPosts || []).filter((p) => {
    const author = (p.authorNickname || p.nickname || (p as any).customNickname || '')
      .toLowerCase()
      .replace(/^@/, '')
      .trim();
    return author === normTarget;
  });

  // 2. Create a quality post (+2 per post)
  // Exclude removed posts
  const qualityPosts = myPosts.filter((p) => p.status !== 'Removed');
  points += qualityPosts.length * REPUTATION_RULES.CREATE_THREAD;

  // 3. Receive a like on a thread (+1 per like from OTHER users)
  // Anti-abuse: Liking your own post earns 0 points
  myPosts.forEach((p) => {
    let likesFromOthers = 0;
    if (Array.isArray(p.likedBy) && p.likedBy.length > 0) {
      likesFromOthers = p.likedBy.filter((k) => {
        const norm = (k || '').toLowerCase().replace(/^@/, '').trim();
        return norm && norm !== normTarget;
      }).length;
    } else {
      const totalLikes = p.likesCount ?? p.upvotes ?? 0;
      const isSelfLiked = Boolean(p.isLikedByMe || p.userVote === 'up');
      likesFromOthers = Math.max(0, totalLikes - (isSelfLiked ? 1 : 0));
    }
    points += likesFromOthers * REPUTATION_RULES.RECEIVE_LIKE;
  });

  // 4. Receive a comment on a thread (+1 per active top-level comment from OTHER users)
  // Anti-abuse: Commenting on your own post earns 0 points. Nested replies do NOT count toward main thread comments.
  myPosts.forEach((p) => {
    let otherCommentsCount = 0;

    // Only active top-level comments from other users
    (allComments || []).forEach((c) => {
      if (c && c.postId === p.id && !c.parentId) {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          otherCommentsCount++;
        }
      }
    });

    points += otherCommentsCount * REPUTATION_RULES.RECEIVE_COMMENT;
  });

  // 5. Receive a repost/quote of a thread (+1 per repost/quote from OTHER users)
  // Anti-abuse: Reposting/quoting your own post earns 0 points
  myPosts.forEach((p) => {
    let count = 0;
    if (Array.isArray(p.repostedBy) && p.repostedBy.length > 0) {
      const uniqueOthers = new Set(
        p.repostedBy
          .map((k) => (k || '').toLowerCase().replace(/^@/, '').trim())
          .filter((k) => k && k !== normTarget)
      );
      count = uniqueOthers.size;
    } else {
      count = p.repostsCount ?? p.shareCount ?? 0;
    }
    points += count * REPUTATION_RULES.RECEIVE_REPOST;
  });

  // 5b. Reposting/sharing another peer's thread (+1 per unique peer post reposted)
  // Anti-abuse: Self-reposting yields 0 points. Repeated undo/repost does not duplicate points.
  const uniquePeerPostsReposted = new Set<string>();
  (allPosts || []).forEach((p) => {
    if (!p) return;
    const authorNorm = (p.authorNickname || p.nickname || '').toLowerCase().replace(/^@/, '').trim();
    if (authorNorm === normTarget) return; // Cannot earn points for reposting own post

    // Check if user is in repostedBy
    const inRepostedBy = Array.isArray(p.repostedBy) && p.repostedBy.some((k) => {
      return (k || '').toLowerCase().replace(/^@/, '').trim() === normTarget;
    });

    // Or if this is a repost post created by target user referencing this peer post
    const isMyRepostItem = p.isRepost && (p.reposterNickname || p.authorNickname || '')
      .toLowerCase().replace(/^@/, '').trim() === normTarget;

    if (inRepostedBy || (isMyRepostItem && p.repostedPostId)) {
      uniquePeerPostsReposted.add(p.repostedPostId || p.id);
    }
  });
  points += uniquePeerPostsReposted.size * REPUTATION_RULES.PERFORM_REPOST;

  // 6. Penalties:
  // - Spam (-20)
  // - Offensive post (-20)
  myPosts.forEach((p) => {
    const flagReason = (p.flagReason || '').toLowerCase();
    if (flagReason.includes('spam')) {
      points -= REPUTATION_RULES.SPAM_PENALTY;
    }
    if (flagReason.includes('offensive') || flagReason.includes('abuse') || flagReason.includes('hate')) {
      points -= REPUTATION_RULES.OFFENSIVE_PENALTY;
    }
  });

  // - Multiple valid reports (-20)
  const validReportsForUser = (allReports || []).filter((r) => {
    const reporter = (r.reporterNickname || '').toLowerCase().replace(/^@/, '').trim();
    return reporter !== normTarget;
  }).length;

  if (validReportsForUser >= 2 || (userProfile?.strikes && userProfile.strikes >= 2)) {
    points -= REPUTATION_RULES.MULTIPLE_REPORTS_PENALTY;
  }

  // Calculated points directly follow official rules without artificial overrides
  return Math.max(0, points);
};

/**
 * Returns a breakdown object showing how points were earned and deducted for a user
 */
export const getUserPointsBreakdown = (
  nickname?: string,
  userProfile?: Partial<UserProfile> | null,
  allPosts: Post[] = [],
  allComments: Comment[] = [],
  allReports: Report[] = []
) => {
  if (!nickname) {
    return {
      profileCompletion: 20,
      qualityPosts: 0,
      likesReceived: 0,
      commentsReceived: 0,
      repostsReceived: 0,
      spamPenalties: 0,
      offensivePenalties: 0,
      reportPenalties: 0,
      total: 20,
    };
  }

  const normTarget = nickname.toLowerCase().replace(/^@/, '').trim();

  const isProfileComplete = Boolean(
    userProfile?.nickname ||
    userProfile?.department ||
    userProfile?.level ||
    userProfile?.bio ||
    userProfile?.studentEmail ||
    userProfile?.realName ||
    userProfile?.isVerified ||
    userProfile?.isApproved
  );

  const profilePts = isProfileComplete ? REPUTATION_RULES.PROFILE_COMPLETION : 0;

  const myPosts = (allPosts || []).filter((p) => {
    const author = (p.authorNickname || p.nickname || (p as any).customNickname || '')
      .toLowerCase()
      .replace(/^@/, '')
      .trim();
    return author === normTarget;
  });

  const validPosts = myPosts.filter((p) => p.status !== 'Removed');
  const postPts = validPosts.length * REPUTATION_RULES.CREATE_THREAD;

  let totalLikesFromOthers = 0;
  myPosts.forEach((p) => {
    if (Array.isArray(p.likedBy) && p.likedBy.length > 0) {
      totalLikesFromOthers += p.likedBy.filter((k) => {
        const norm = (k || '').toLowerCase().replace(/^@/, '').trim();
        return norm && norm !== normTarget;
      }).length;
    } else {
      const totalLikes = p.likesCount ?? p.upvotes ?? 0;
      const isSelfLiked = Boolean(p.isLikedByMe || p.userVote === 'up');
      totalLikesFromOthers += Math.max(0, totalLikes - (isSelfLiked ? 1 : 0));
    }
  });
  const likePts = totalLikesFromOthers * REPUTATION_RULES.RECEIVE_LIKE;

  let totalCommentsFromOthers = 0;
  myPosts.forEach((p) => {
    (allComments || []).forEach((c) => {
      if (c && c.postId === p.id && !c.parentId) {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          totalCommentsFromOthers++;
        }
      }
    });
  });
  const commentPts = totalCommentsFromOthers * REPUTATION_RULES.RECEIVE_COMMENT;

  let totalRepostsReceived = 0;
  myPosts.forEach((p) => {
    if (Array.isArray(p.repostedBy) && p.repostedBy.length > 0) {
      const uniqueOthers = new Set(
        p.repostedBy
          .map((k) => (k || '').toLowerCase().replace(/^@/, '').trim())
          .filter((k) => k && k !== normTarget)
      );
      totalRepostsReceived += uniqueOthers.size;
    } else {
      totalRepostsReceived += p.repostsCount ?? p.shareCount ?? 0;
    }
  });
  const repostReceivedPts = totalRepostsReceived * REPUTATION_RULES.RECEIVE_REPOST;

  const uniquePeerPostsReposted = new Set<string>();
  (allPosts || []).forEach((p) => {
    if (!p) return;
    const authorNorm = (p.authorNickname || p.nickname || '').toLowerCase().replace(/^@/, '').trim();
    if (authorNorm === normTarget) return;

    const inRepostedBy = Array.isArray(p.repostedBy) && p.repostedBy.some((k) => {
      return (k || '').toLowerCase().replace(/^@/, '').trim() === normTarget;
    });
    const isMyRepostItem = p.isRepost && (p.reposterNickname || p.authorNickname || '')
      .toLowerCase().replace(/^@/, '').trim() === normTarget;

    if (inRepostedBy || (isMyRepostItem && p.repostedPostId)) {
      uniquePeerPostsReposted.add(p.repostedPostId || p.id);
    }
  });
  const repostMadeCount = uniquePeerPostsReposted.size;
  const repostMadePts = repostMadeCount * REPUTATION_RULES.PERFORM_REPOST;

  let spamPenalties = 0;
  let offensivePenalties = 0;

  myPosts.forEach((p) => {
    const flagReason = (p.flagReason || '').toLowerCase();
    if (flagReason.includes('spam')) spamPenalties += REPUTATION_RULES.SPAM_PENALTY;
    if (flagReason.includes('offensive') || flagReason.includes('abuse') || flagReason.includes('hate')) {
      offensivePenalties += REPUTATION_RULES.OFFENSIVE_PENALTY;
    }
  });

  const validReportsForUser = (allReports || []).filter((r) => {
    const reporter = (r.reporterNickname || '').toLowerCase().replace(/^@/, '').trim();
    return reporter !== normTarget;
  }).length;

  let reportPenalties = 0;
  if (validReportsForUser >= 2 || (userProfile?.strikes && userProfile.strikes >= 2)) {
    reportPenalties = REPUTATION_RULES.MULTIPLE_REPORTS_PENALTY;
  }

  let total = profilePts + postPts + likePts + commentPts + repostReceivedPts + repostMadePts - spamPenalties - offensivePenalties - reportPenalties;

  return {
    profileCompletion: profilePts,
    qualityPosts: postPts,
    postsCount: validPosts.length,
    likesReceived: likePts,
    likesCount: totalLikesFromOthers,
    commentsReceived: commentPts,
    commentsCount: totalCommentsFromOthers,
    repostsReceived: repostReceivedPts,
    repostsCount: totalRepostsReceived,
    repostsMade: repostMadePts,
    repostsMadeCount: repostMadeCount,
    spamPenalties,
    offensivePenalties,
    reportPenalties,
    total: Math.max(0, total),
  };
};

/**
 * Weekly Ranking Window (Sunday 00:00:00.000 -> Saturday 23:59:59.999)
 */
export interface WeeklyRankingWindow {
  start: Date;
  end: Date;
  startMs: number;
  endMs: number;
  label: string;
  daysRemaining: number;
  hoursRemaining: number;
}

export function getWeeklyRankingWindow(refDate: Date = new Date()): WeeklyRankingWindow {
  const now = new Date(refDate);
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Sunday at 00:00:00.000
  const sundayStart = new Date(now);
  sundayStart.setDate(now.getDate() - dayOfWeek);
  sundayStart.setHours(0, 0, 0, 0);

  // Saturday at 23:59:59.999
  const saturdayEnd = new Date(sundayStart);
  saturdayEnd.setDate(sundayStart.getDate() + 6);
  saturdayEnd.setHours(23, 59, 59, 999);

  const startMonth = sundayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endMonth = saturdayEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const label = `${startMonth} – ${endMonth}`;

  const msRemaining = Math.max(0, saturdayEnd.getTime() - now.getTime());
  const totalHoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));
  const daysRemaining = Math.floor(totalHoursRemaining / 24);
  const hoursRemaining = totalHoursRemaining % 24;

  return {
    start: sundayStart,
    end: saturdayEnd,
    startMs: sundayStart.getTime(),
    endMs: saturdayEnd.getTime(),
    label,
    daysRemaining,
    hoursRemaining,
  };
}

/**
 * Safely parse date from an item (post/comment) into millisecond epoch
 */
export function parseItemTimestamp(item: any): number {
  if (!item) return 0;
  if (item.createdAt) {
    const ms = new Date(item.createdAt).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  if (item.timestamp) {
    const ms = new Date(item.timestamp).getTime();
    if (!isNaN(ms) && ms > 0) return ms;
  }
  if (item.timeAgo) {
    const str = String(item.timeAgo).toLowerCase();
    const now = Date.now();
    if (str.includes('just now') || str.includes('now') || str.includes('sec')) return now;
    const mMatch = str.match(/(\d+)\s*m/);
    if (mMatch) return now - parseInt(mMatch[1], 10) * 60 * 1000;
    const hMatch = str.match(/(\d+)\s*h/);
    if (hMatch) return now - parseInt(hMatch[1], 10) * 3600 * 1000;
    const dMatch = str.match(/(\d+)\s*d/);
    if (dMatch) return now - parseInt(dMatch[1], 10) * 86400 * 1000;
  }
  return 0;
}

/**
 * Calculate weekly points earned by a user strictly during Sunday -> Saturday period.
 * 
 * Rules:
 * - Create a quality post (+2)
 * - Receive a like on a thread from others (+1)
 * - Receive a comment on a thread from others (+1)
 * - Receive a repost/share of a thread from others (+1)
 * - Profile completion (if registered/completed within this week: +20)
 * - Spam / offensive penalty within this week (-20)
 * - Self-likes, self-comments, self-reposts = 0
 */
export function calculateWeeklyUserPoints(
  nickname?: string,
  userProfile?: Partial<UserProfile> | null,
  allPosts: Post[] = [],
  allComments: Comment[] = [],
  allReports: Report[] = [],
  customWindow?: WeeklyRankingWindow
): number {
  if (!nickname) return 0;

  const currentWindow = customWindow || getWeeklyRankingWindow();
  const { startMs, endMs } = currentWindow;
  const normTarget = nickname.toLowerCase().replace(/^@/, '').trim();

  let points = 0;

  // 1. Profile completion reward if registered this week
  if (userProfile?.createdAt) {
    const regTime = new Date(userProfile.createdAt).getTime();
    if (regTime >= startMs && regTime <= endMs) {
      points += REPUTATION_RULES.PROFILE_COMPLETION;
    }
  }

  // Find all posts by this user
  const myPosts = (allPosts || []).filter((p) => {
    const author = (p.authorNickname || p.nickname || (p as any).customNickname || '')
      .toLowerCase()
      .replace(/^@/, '')
      .trim();
    return author === normTarget;
  });

  // 2. Posts created within current Sunday-Saturday window (+2 per post)
  myPosts.forEach((p) => {
    if (p.status === 'Removed') return;
    const postTime = parseItemTimestamp(p);
    // If created this week (or fresh with 0 timestamp)
    if (postTime >= startMs && postTime <= endMs) {
      points += REPUTATION_RULES.CREATE_THREAD;
    }
  });

  // 3. Likes received on posts active/created this week (+1 per like from others)
  myPosts.forEach((p) => {
    const postTime = parseItemTimestamp(p);
    const isThisWeekPost = postTime >= startMs && postTime <= endMs;
    let likesCount = 0;

    if (Array.isArray(p.likedBy) && p.likedBy.length > 0) {
      likesCount = p.likedBy.filter((k) => {
        const norm = (k || '').toLowerCase().replace(/^@/, '').trim();
        return norm && norm !== normTarget;
      }).length;
    } else {
      const totalLikes = p.likesCount ?? p.upvotes ?? 0;
      const isSelfLiked = Boolean(p.isLikedByMe || p.userVote === 'up');
      likesCount = Math.max(0, totalLikes - (isSelfLiked ? 1 : 0));
    }

    if (isThisWeekPost) {
      points += likesCount * REPUTATION_RULES.RECEIVE_LIKE;
    }
  });

  // 4. Comments received this week on user's posts from other users (+1 per active top-level comment)
  // Replies do NOT count toward main post comment points
  (allComments || []).forEach((c) => {
    if (!c || c.parentId) return;
    const commentTime = parseItemTimestamp(c);
    if (commentTime >= startMs && commentTime <= endMs) {
      const targetPost = myPosts.find((p) => p.id === c.postId);
      if (targetPost) {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          points += REPUTATION_RULES.RECEIVE_COMMENT;
        }
      }
    }
  });

  // 5. Reposts/shares on this week's posts received from other users (+1)
  myPosts.forEach((p) => {
    const postTime = parseItemTimestamp(p);
    if (postTime >= startMs && postTime <= endMs) {
      let count = 0;
      if (Array.isArray(p.repostedBy) && p.repostedBy.length > 0) {
        const uniqueOthers = new Set(
          p.repostedBy
            .map((k) => (k || '').toLowerCase().replace(/^@/, '').trim())
            .filter((k) => k && k !== normTarget)
        );
        count = uniqueOthers.size;
      } else {
        count = p.repostsCount ?? p.shareCount ?? 0;
      }
      points += count * REPUTATION_RULES.RECEIVE_REPOST;
    }
  });

  // 5b. Reposts performed by this user on peer posts during this week (+1)
  const weeklyPeerPostsReposted = new Set<string>();
  (allPosts || []).forEach((p) => {
    if (!p) return;
    const authorNorm = (p.authorNickname || p.nickname || '').toLowerCase().replace(/^@/, '').trim();
    if (authorNorm === normTarget) return;

    const postTime = parseItemTimestamp(p);
    const isThisWeek = postTime >= startMs && postTime <= endMs;
    const inRepostedBy = Array.isArray(p.repostedBy) && p.repostedBy.some((k) => {
      return (k || '').toLowerCase().replace(/^@/, '').trim() === normTarget;
    });
    const isMyRepostItem = p.isRepost && (p.reposterNickname || p.authorNickname || '')
      .toLowerCase().replace(/^@/, '').trim() === normTarget;

    if ((inRepostedBy || isMyRepostItem) && isThisWeek) {
      weeklyPeerPostsReposted.add(p.repostedPostId || p.id);
    }
  });
  points += weeklyPeerPostsReposted.size * REPUTATION_RULES.PERFORM_REPOST;

  // 6. Penalties for violations occurring this week
  myPosts.forEach((p) => {
    const postTime = parseItemTimestamp(p);
    if (postTime >= startMs && postTime <= endMs) {
      const flagReason = (p.flagReason || '').toLowerCase();
      if (flagReason.includes('spam')) points -= REPUTATION_RULES.SPAM_PENALTY;
      if (flagReason.includes('offensive') || flagReason.includes('abuse') || flagReason.includes('hate')) {
        points -= REPUTATION_RULES.OFFENSIVE_PENALTY;
      }
    }
  });

  return Math.max(0, points);
}

/**
 * Normalizes any department string into its canonical FUHSI department name.
 */
export function normalizeDepartmentName(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const clean = raw.trim();
  const lower = clean.toLowerCase();

  if (lower.includes('medicine') || lower.includes('mbbs') || lower.includes('surgery')) {
    return 'Medicine & Surgery';
  }
  if (lower.includes('nursing') || lower.includes('nsc') || lower.includes('nur')) {
    return 'Nursing Science';
  }
  if (lower.includes('lab') || lower.includes('mls') || lower.includes('laboratory')) {
    return 'Medical Laboratory Science';
  }
  if (lower.includes('physio') || lower.includes('dpt') || lower.includes('pht') || lower.includes('pth')) {
    return 'Physiotherapy';
  }
  if (lower.includes('audio') || lower.includes('aud')) {
    return 'Audiology';
  }
  if (lower.includes('pharm') || lower.includes('phm') || lower.includes('pco')) {
    return 'Pharmacology';
  }
  if (lower.includes('nutrit') || lower.includes('diet') || lower.includes('hnd') || lower.includes('nud')) {
    return 'Nutrition & Dietetics';
  }
  if (
    lower.includes('informat') ||
    lower.includes('health info') ||
    lower.includes('ith') ||
    lower.includes('ict') ||
    lower.includes('inf')
  ) {
    return 'Information Technology & Health Informatics';
  }
  if (lower.includes('microbio') || lower.includes('mcb') || lower.includes('mic')) {
    return 'Microbiology';
  }
  if (lower.includes('biochem') || lower.includes('bch')) {
    return 'Biochemistry';
  }
  if (lower.includes('biotech') || lower.includes('molecular') || lower.includes('bmb') || lower.includes('btc')) {
    return 'Biotechnology & Molecular Biology';
  }
  if (lower.includes('environ') || lower.includes('ehs') || lower.includes('env')) {
    return 'Environmental Health Science';
  }
  if (lower.includes('prosthet') || lower.includes('orthot') || lower.includes('prt') || lower.includes('pro')) {
    return 'Prosthetics & Orthotics';
  }

  return clean;
}

export interface DepartmentStandingItem {
  rank: number;
  name: string;
  activeStudents: number;
  totalPoints: number;
  topContributor: {
    nickname: string;
    points: number;
    avatarKey?: string;
    avatarUrl?: string;
  } | null;
}

/**
 * Calculates Department Standing strictly from real registered student accounts in the platform database.
 * 
 * Rules:
 * - Real registered students only (no guests, no demo accounts, no admin accounts).
 * - A student's department must come from their actual verified Student account information.
 * - Department points aggregate legitimate points generated by students belonging to that department.
 * - Departments with 0 active students are NOT displayed ("Do not display demo departments that have no actual registered users").
 * - Does not manipulate or artificially balance numbers; reflects actual activity.
 */
export function calculateDepartmentStandings(
  allUsers: UserProfile[] = [],
  allPosts: Post[] = [],
  allComments: Comment[] = [],
  allReports: Report[] = []
): DepartmentStandingItem[] {
  // Deduplicate and filter real student accounts
  const seenUsers = new Set<string>();
  const validStudents: UserProfile[] = [];

  allUsers.forEach((u) => {
    if (!u) return;
    const cleanNick = (u.nickname || '').trim().toLowerCase().replace(/^@/, '');
    if (!cleanNick || seenUsers.has(cleanNick)) return;
    seenUsers.add(cleanNick);

    // Filter out demo accounts
    if (isDemoUser(u) || isDemoNickname(cleanNick)) return;
    // Filter out guest accounts - Guests must NEVER be included in a departmental Student ranking!
    if (isGuestAccount(u) || u.accountType === 'Guest' || cleanNick.startsWith('guest_')) return;
    // Filter out Admin/Modula accounts
    if (isModulaAccount(u) || u.isAdmin) return;
    // Must have a real department
    if (!u.department || !u.department.trim()) return;

    validStudents.push(u);
  });

  // Group by canonical department
  const deptMap = new Map<
    string,
    {
      name: string;
      students: Array<{ user: UserProfile; points: number }>;
    }
  >();

  validStudents.forEach((student) => {
    const canonicalName = normalizeDepartmentName(student.department);
    if (!canonicalName) return;

    const studentPoints = calculateUserPoints(student.nickname, student, allPosts, allComments, allReports);

    if (!deptMap.has(canonicalName)) {
      deptMap.set(canonicalName, {
        name: canonicalName,
        students: [],
      });
    }

    deptMap.get(canonicalName)!.students.push({
      user: student,
      points: studentPoints,
    });
  });

  // Convert to array
  const results: DepartmentStandingItem[] = [];

  deptMap.forEach((entry) => {
    if (entry.students.length === 0) return; // Only show departments with registered students

    const totalPoints = entry.students.reduce((acc, curr) => acc + curr.points, 0);
    // Find top contributor in this department
    const sortedStudents = [...entry.students].sort((a, b) => b.points - a.points);
    const top = sortedStudents[0];

    results.push({
      rank: 0, // Assigned below
      name: entry.name,
      activeStudents: entry.students.length,
      totalPoints,
      topContributor: top
        ? {
            nickname: top.user.nickname,
            points: top.points,
            avatarKey: top.user.avatarKey,
            avatarUrl: top.user.avatarUrl,
          }
        : null,
    });
  });

  // Sort by totalPoints descending, then activeStudents descending
  results.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return b.activeStudents - a.activeStudents;
  });

  // Assign 1-indexed ranks
  results.forEach((dept, index) => {
    dept.rank = index + 1;
  });

  return results;
}

export interface TrendingPostItem {
  rank: number;
  post: Post;
  totalEngagement: number;
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
}

/**
 * Calculates the Top 5 Trending Posts based on real-time engagement (likes, comments, shares).
 * 
 * Rules:
 * - Real central platform data only (no demo posts, no removed/quarantined posts).
 * - Maximum of 5 posts.
 * - Dynamic ranking based on actual engagement generated on each post.
 * - Comments = number of active top-level comments (replies excluded).
 */
export function calculateTopTrendingPosts(
  allPosts: Post[] = [],
  allCommentsOrLimit?: Comment[] | number,
  limitArg?: number
): TrendingPostItem[] {
  let allComments: Comment[] | null = null;
  let limit = 5;

  if (Array.isArray(allCommentsOrLimit)) {
    allComments = allCommentsOrLimit;
    if (typeof limitArg === 'number') {
      limit = limitArg;
    }
  } else if (typeof allCommentsOrLimit === 'number') {
    limit = allCommentsOrLimit;
  }

  const validPosts = (allPosts || []).filter((p) => {
    if (!p) return false;
    if (p.status === 'Removed' || p.isQuarantined) return false;
    if (isDemoPost(p)) return false;
    return true;
  });

  const scoredPosts = validPosts.map((p) => {
    const likes = p.likesCount ?? (Array.isArray(p.likedBy) ? p.likedBy.length : 0);
    const comments = Array.isArray(allComments)
      ? allComments.filter((c) => c && c.postId === p.id && !c.parentId).length
      : (p.commentsCount ?? 0);
    const shares = p.repostsCount ?? (Array.isArray(p.repostedBy) ? p.repostedBy.length : (p.shareCount ?? 0));
    // Comments and shares indicate deeper engagement, weighted slightly higher
    const totalEngagement = likes * 1 + comments * 2 + shares * 2;

    return {
      post: p,
      likesCount: likes,
      commentsCount: comments,
      sharesCount: shares,
      totalEngagement,
    };
  });

  // Sort descending by totalEngagement, breaking ties by recency
  scoredPosts.sort((a, b) => {
    if (b.totalEngagement !== a.totalEngagement) {
      return b.totalEngagement - a.totalEngagement;
    }
    const timeA = parseItemTimestamp(a.post);
    const timeB = parseItemTimestamp(b.post);
    return timeB - timeA;
  });

  const top = scoredPosts.slice(0, limit);

  return top.map((item, idx) => ({
    rank: idx + 1,
    post: item.post,
    totalEngagement: item.totalEngagement,
    likesCount: item.likesCount,
    commentsCount: item.commentsCount,
    sharesCount: item.sharesCount,
  }));
}

