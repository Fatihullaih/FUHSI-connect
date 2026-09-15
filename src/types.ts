export type PrivacyMode = 'Anonymous' | 'Nickname' | 'Public';

export type PostCategory = 'General' | 'Academic' | 'Events' | 'Confessions' | 'Marketplace' | 'LostAndFound';

export type PostStatus = 'Active' | 'UnderReview' | 'Removed';

export type BadgeType = 'NONE' | 'BLUE' | 'GOLD' | 'GREEN' | 'ORANGE' | 'RED' | 'PURPLE';

export interface UserProfile {
  id: string;
  nickname: string;
  accountType?: 'Student' | 'Guest' | string;
  realNameHidden?: string;
  realName?: string;
  matricNumber?: string;
  studentId?: string;
  studentEmail?: string;
  emergencyHomePhone?: string;
  department: string;
  level: string;
  bio: string;
  avatarKey?: string;
  avatarId?: string;
  avatarUrl?: string;
  joinedDate?: string;
  createdAt?: string;
  badgeType?: BadgeType;
  badgeTitle?: string;
  badge?: string;
  reputationScore?: number;
  reputationPoints?: number;
  isVerified?: boolean;
  verificationStatus?: 'pending' | 'approved' | 'rejected' | string;
  studentConversionStatus?: 'none' | 'pending' | 'approved' | 'declined' | 'rejected';
  isStudentSubscribed?: boolean;
  isApproved?: boolean;
  isDeclined?: boolean;
  declineReason?: string;
  isAdmin?: boolean;
  isPremiumUser?: boolean;
  strikes?: number;
  isBanned?: boolean;
  privacyMode?: PrivacyMode;
  isPrivate?: boolean;
  defaultPostAudience?: 'everyone' | 'followers';
  password?: string;
  savedPassword?: string;
  lastActiveAt?: string;
  isOnline?: boolean;
  updatedAt?: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorNickname: string;
  authorAccountType?: 'Student' | 'Guest' | string;
  authorBadgeType?: BadgeType | string;
  authorBadgeTitle?: string;
  authorAvatarKey?: string;
  authorAvatarId?: string;
  authorAvatarUrl?: string;
  isVerified?: boolean;
  authorIsVerified?: boolean;
  content: string;
  imageUrl?: string;
  imageUrls?: string[];
  timestamp: string;
  upvotes?: number;
  userVote?: 'up' | 'down' | null;
  parentId?: string;
  replyToNickname?: string;
  likesCount?: number;
  likes?: number;
  likedBy?: string[];
  isLikedByMe?: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Post {
  id: string;
  authorNickname: string;
  authorAccountType?: 'Student' | 'Guest' | string;
  authorBadgeType?: BadgeType | string;
  authorBadgeTitle?: string;
  authorAvatarKey?: string;
  authorAvatarId?: string;
  authorAvatarUrl?: string;
  authorPoints?: number;
  authorDepartment?: string;
  authorLevel?: string;
  department?: string;
  targetDepartment?: string;
  isDepartmentPriority?: boolean;
  category?: PostCategory;
  categoryTag?: string;
  content: string;
  text?: string;
  imageUrl?: string;
  imageUrls?: string[];
  imageResName?: string;
  videoUri?: string;
  timestamp: string;
  likesCount?: number;
  likes?: number;
  likedBy?: string[];
  upvotes?: number;
  downvotes?: number;
  commentsCount?: number;
  commentCount?: number;
  shareCount?: number;
  bookmarks?: number;
  isLikedByMe?: boolean;
  isBookmarkedByMe?: boolean;
  isBookmarked?: boolean;
  userVote?: 'up' | 'down' | null;
  isGhostMode?: boolean;
  isSponsored?: boolean;
  sponsorName?: string;
  sponsorActionUrl?: string;
  nickname?: string;
  customNickname?: string;
  isVerified?: boolean;
  createdAt?: string;
  timeAgo?: string;
  pollQuestion?: string;
  pollOptions?: PollOption[];
  pollVotesByUser?: Record<string, string>;
  pollOptA?: string;
  pollOptB?: string;
  pollVotesA?: number;
  pollVotesB?: number;
  userVotedOpt?: 'A' | 'B' | string;
  isFlagged?: boolean;
  flagReason?: string;
  isQuarantined?: boolean;
  status?: PostStatus;
  audience?: 'everyone' | 'followers';
  updatedAt?: string;
  isEdited?: boolean;
}

export interface MarketplaceItem {
  id: string;
  title: string;
  category: string;
  sellerNickname: string;
  sellerPhone: string;
  askingPrice: number;
  adminApprovedPrice?: number;
  conditionTag: string;
  description: string;
  meetupPoint: string;
  imageUrls: string[];
  viewCount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SOLD' | 'REMOVED';
  soldAt?: string;
  createdAt?: string;
  buyerDmIntentsCount: number;
  adminNote?: string;
  sellerRatingStars?: number;
  sellerRatingTag?: string;
  updatedAt?: string;
  isFeatured?: boolean;
  featuredDays?: number;
  isHousing?: boolean;
  propertyLocation?: string;
  rentDuration?: string;
  roomType?: string;
}

export interface MarketplaceReport {
  id: string;
  type: 'LISTING' | 'SELLER';
  itemId?: string;
  itemTitle?: string;
  sellerNickname: string;
  reporterNickname: string;
  reason: 'Fake item' | 'Fraud/scam' | 'Fake transfer' | 'Misleading listing' | 'Item not as described' | 'Seller misconduct' | 'Other marketplace problems' | string;
  details?: string;
  timestamp: string;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  actionTaken?: string;
}

export interface CommunityFundSummary {
  totalFundRaised: number;
  currentMonthBalance: number;
  activeDonorsCount: number;
  lastAuditDate: string;
  allocationBreakdown: {
    serversAndMaintenancePct: number; // 40%
    featureDevelopmentPct: number;    // 30%
    campusActivitiesPct: number;       // 20%
    emergencyReservePct: number;       // 10%
  };
  recentExpenditures: Array<{
    id: string;
    description: string;
    amount: number;
    category: string;
    date: string;
  }>;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  senderNickname: string;
  receiverNickname: string;
  text: string;
  timestamp: string;
  itemId?: string;
  itemTitle?: string;
  itemPrice?: number;
  meetupPoint?: string;
  isPledgeConfirmed?: boolean;
  isSafetyWarning?: boolean;
  violationNotice?: string;
  isRead?: boolean;
  readAt?: string;
  replyToMessageId?: string;
  replyToText?: string;
  replyToSender?: string;
  reactions?: Record<string, string[]>;
  isDeletedForEveryone?: boolean;
  deletedForUsers?: string[];
  isGroupMessage?: boolean;
  groupId?: string;
  senderAvatarKey?: string;
  senderAvatarUrl?: string;
  isSystemMessage?: boolean;
  readByUsers?: string[];
  mentionedNicknames?: string[];
}

export interface ChatGroup {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  avatarKey?: string;
  createdBy: string;
  createdAt: string;
  adminNicknames: string[];
  memberNicknames: string[];
  lastMessage?: string;
  lastMessageSender?: string;
  lastTimestamp?: string;
  unreadCount?: number;
  hasUnreadMention?: boolean;
  isDeleted?: boolean;
  updatedAt?: string;
}

export interface ChatConversation {
  id: string;
  otherUserNickname: string;
  otherUserAvatarKey?: string;
  otherUserAvatarUrl?: string;
  otherUserBadgeType?: BadgeType | string;
  otherUserBadgeTitle?: string;
  otherUserIsVerified?: boolean;
  participants?: string[];
  lastMessage: string;
  lastTimestamp: string;
  lastSenderNickname?: string;
  lastMessageIsRead?: boolean;
  itemId?: string;
  itemTitle?: string;
  itemPrice?: number;
  meetupPoint?: string;
  unreadCount: number;
  isDeletedBy?: string[];
  updatedAt?: string;
}

export interface PreservedChatMessage {
  id?: string;
  sender: string;
  text: string;
  time: string;
  date?: string;
  timestamp: string;
}

export interface FollowRecord {
  id: string;
  followerNickname: string;
  followingNickname: string;
  createdAt: string;
}

export interface ChatReport {
  id: string;
  conversationId: string;
  reportedNickname: string;
  reporterNickname: string;
  reason: string;
  notes?: string;
  messageSnippet: string;
  recentMessages?: PreservedChatMessage[];
  timestamp: string;
  status: 'PENDING' | 'ACTION_TAKEN' | 'RESOLVED' | 'DISMISSED';
  actionNote?: string;
}

export interface VerificationRequest {
  id: string;
  applicantNickname: string;
  applicantFullName?: string;
  applicantEmail?: string;
  applicantPhone?: string;
  department?: string;
  level?: string;
  category: string;
  accountType?: 'Student' | 'Executive' | 'Organization' | 'Guest' | string;
  requestType?: 'VERIFICATION' | 'STUDENT_CONVERSION';
  positionTitle?: string;
  matricNumber?: string;
  proofDetails?: string;
  paymentRef?: string;
  amountPaid?: number;
  statement: string;
  timestamp: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  assignedBadgeType?: BadgeType;
  assignedBadgeTitle?: string;
}

export interface Report {
  id: string;
  postId: string;
  reporterNickname: string;
  reason: string;
  timestamp: string;
  status: 'PENDING' | 'DISMISSED' | 'QUARANTINED';
}

export interface ModerationReport {
  id: string;
  postId: string;
  postContent: string;
  postAuthor: string;
  reportedBy: string;
  reason: string;
  timestamp: string;
  status: 'Pending' | 'Approved' | 'Dismissed' | 'ActionTaken';
  notes?: string;
}

export interface LeaderboardUser {
  rank: number;
  nickname: string;
  department: string;
  level: string;
  avatarKey: string;
  badgeType: BadgeType;
  reputationScore: number;
  title: string;
}

export interface DepartmentRanking {
  name: string;
  code: string;
  totalPoints: number;
  activeStudents: number;
  topContributor: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  category: 'Academic' | 'Administrative' | 'Hostel' | 'Exam' | 'General';
  publisher: string;
  date: string;
  urgent: boolean;
  read?: boolean;
}

export interface Resource {
  id: string;
  title: string;
  courseCode: string;
  department: string;
  level: string;
  fileType: 'PDF' | 'DOCX' | 'PPTX' | 'ZIP';
  fileSize: string;
  uploaderNickname: string;
  downloads: number;
  rating: number;
  dateAdded: string;
}

export interface AchievementBadge {
  id: string;
  title: string;
  icon: string;
  description: string;
  isUnlocked: boolean;
  progressPct: number;
  unlockedAt?: string;
  category: 'Engagement' | 'Academic' | 'Community' | 'Verification';
  rewardPoints: number;
}

export interface VerificationEligibilityCandidate {
  id: string;
  nickname: string;
  realName: string;
  matricNumber: string;
  emergencyHomePhone: string;
  department: string;
  level: string;
  accountAgeDays: number;
  reputationScore: number;
  likesReceived: number;
  commentsCount: number;
  qualityPostsCount: number;
  strikes: number;
  status: 'ELIGIBLE_PENDING_ADMIN' | 'APPROVED_VERIFIED' | 'REJECTED';
  submittedAt: string;
}

export interface WeeklyRankingItem {
  rank: number;
  nickname: string;
  department: string;
  level: string;
  avatarKey: string;
  badgeType: BadgeType;
  badgeTitle?: string;
  metricLabel: string;
  metricValue: string;
  changeTag?: string;
}

export interface WeeklyTrendingPost {
  rank: number;
  nickname: string;
  category: string;
  snippet: string;
  engagement: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  location: string;
  date: string;
  time: string;
  category: 'Seminar' | 'Sports' | 'Social' | 'Workshop' | 'Health';
  organizer: string;
  description: string;
  rsvpCount: number;
  isRsvped?: boolean;
}

export interface CampusNotification {
  id: string;
  type: 'VERIFICATION' | 'LIKE' | 'COMMENT' | 'ADMIN' | 'MARKET' | 'TARGETED_DEPT' | 'TARGETED_FACULTY' | 'DIRECT_MESSAGE' | 'ADMIN_TRADE_DESK';
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  targetDepartment?: string;
  postId?: string;
  senderNickname?: string;
  conversationId?: string;
  actionType?: 'REPLY_ADMIN' | 'OPEN_TRADE_CHAT' | 'VIEW_MARKET' | string;
  itemId?: string;
}

export interface HelpDeskInquiry {
  id: string;
  ticketId: string;
  fullName: string;
  email: string;
  nickname?: string;
  matricNumber?: string;
  department?: string;
  level?: string;
  category: 'REGISTRATION_APPEAL' | 'RE_APPROVAL' | 'LOGIN_ISSUE' | 'VERIFICATION_ASSIST' | 'GENERAL_SUPPORT';
  categoryLabel: string;
  message: string;
  status: 'PENDING' | 'RESOLVED' | 'UNDER_REVIEW';
  createdAt: string;
  resolvedAt?: string;
  adminNotes?: string;
  adminReply?: string;
}


