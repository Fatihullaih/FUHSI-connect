import { Post, Comment, UserProfile, Report } from '../types';

export const REPUTATION_RULES = {
  PROFILE_COMPLETION: 20,
  CREATE_THREAD: 2,
  RECEIVE_LIKE: 1,
  RECEIVE_COMMENT: 1,
  RECEIVE_REPOST: 1,
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

  // 4. Receive a comment on a thread (+1 per comment from OTHER users)
  // Anti-abuse: Commenting on your own post earns 0 points
  myPosts.forEach((p) => {
    let otherCommentsCount = 0;

    // From top-level comments
    (allComments || []).forEach((c) => {
      if (c.postId === p.id) {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          otherCommentsCount++;
        }
      }
    });

    // From embedded post comments
    if ((p as any).comments && Array.isArray((p as any).comments)) {
      (p as any).comments.forEach((c: Comment) => {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          const existsInAll = (allComments || []).some((item) => item.id === c.id);
          if (!existsInAll) {
            otherCommentsCount++;
          }
        }
      });
    }

    points += otherCommentsCount * REPUTATION_RULES.RECEIVE_COMMENT;
  });

  // 5. Receive a repost/quote of a thread (+1 per repost/quote from OTHER users)
  // Anti-abuse: Reposting/quoting your own post earns 0 points
  myPosts.forEach((p) => {
    const repostsCount = p.shareCount || 0;
    points += repostsCount * REPUTATION_RULES.RECEIVE_REPOST;
  });

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
      if (c.postId === p.id) {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          totalCommentsFromOthers++;
        }
      }
    });

    if ((p as any).comments && Array.isArray((p as any).comments)) {
      (p as any).comments.forEach((c: Comment) => {
        const commentAuthor = (c.authorNickname || '').toLowerCase().replace(/^@/, '').trim();
        if (commentAuthor && commentAuthor !== normTarget) {
          const existsInAll = (allComments || []).some((item) => item.id === c.id);
          if (!existsInAll) {
            totalCommentsFromOthers++;
          }
        }
      });
    }
  });
  const commentPts = totalCommentsFromOthers * REPUTATION_RULES.RECEIVE_COMMENT;

  let totalReposts = 0;
  myPosts.forEach((p) => {
    totalReposts += p.shareCount || 0;
  });
  const repostPts = totalReposts * REPUTATION_RULES.RECEIVE_REPOST;

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

  let total = profilePts + postPts + likePts + commentPts + repostPts - spamPenalties - offensivePenalties - reportPenalties;

  return {
    profileCompletion: profilePts,
    qualityPosts: postPts,
    postsCount: validPosts.length,
    likesReceived: likePts,
    likesCount: totalLikesFromOthers,
    commentsReceived: commentPts,
    commentsCount: totalCommentsFromOthers,
    repostsReceived: repostPts,
    repostsCount: totalReposts,
    spamPenalties,
    offensivePenalties,
    reportPenalties,
    total: Math.max(0, total),
  };
};
