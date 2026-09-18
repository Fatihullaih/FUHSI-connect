import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  INITIAL_USER_PROFILE,
  INITIAL_POSTS,
  INITIAL_COMMENTS,
  INITIAL_MARKETPLACE_ITEMS,
  INITIAL_PENDING_MARKETPLACE_ITEMS,
  INITIAL_VERIFICATION_REQUESTS,
  INITIAL_REPORTS,
} from './data/initialData';
import fuhsiLogo from './assets/images/fuhsi_logo_1785485694958.jpg';
import { calculateUserPoints } from './utils/reputationUtils';
import { getApprovedMembersCount, getStoredUsers, saveStoredUsers, upsertUser, isGuestAccount, isUserPermanentlyDeleted, markUserPermanentlyDeleted, isModulaAccount, sanitizeModulaProfile, formatJoinDate } from './utils/userDbUtils';
import {
  fetchServerDb,
  pushServerDbSync,
  mergeUsers,
  mergePosts,
  mergeComments,
  mergeMarketplaceItems,
  mergeVerificationRequests,
  mergeReports,
  mergeVerifCandidates,
  mergeDirectMessages,
  mergeFollows,
  uploadAvatarToServer,
} from './utils/apiSync';
import {
  subscribeUsers,
  subscribePosts,
  subscribeComments,
  subscribeVerificationRequests,
  subscribeMarketplaceApproved,
  subscribeAllDirectMessages,
  subscribeFollows,
  savePostToFirestore,
  deletePostFromFirestore,
  saveCommentToFirestore,
  deleteCommentFromFirestore,
  saveMarketplaceApprovedToFirestore,
  saveVerificationRequestToFirestore,
  deleteVerificationRequestFromFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  saveFollowToFirestore,
  deleteFollowFromFirestore,
  deleteMarketplaceApprovedFromFirestore,
  seedFirestoreInitialDataIfNeeded,
  purgeAllExceptAdminFromFirestore,
  cleanupModulaFirestoreDoc,
} from './lib/firestoreSync';
import { initTheme, getStoredTheme, setStoredTheme, ThemeMode } from './utils/themeUtils';
import { UserProfile, Post, Comment, MarketplaceItem, VerificationRequest, Report, BadgeType, PollOption, DirectMessage, FollowRecord } from './types';
import { getStoredFollows, saveStoredFollows, toggleFollowState, recordFollowNotification } from './utils/followUtils';
import { toggleUserLike, isItemLikedByUser, getEffectiveLikesCount } from './utils/reactionUtils';
import {
  isDemoUser,
  isDemoNickname,
  isDemoPost,
  isDemoComment,
  isDemoVerificationRequest,
  isDemoMarketplaceItem,
  isDemoDirectMessage,
} from './utils/postGenerator';
import { FeedScreen } from './screens/FeedScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { CampusHubScreen } from './screens/CampusHubScreen';
import { ModerationScreen } from './screens/ModerationScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SearchScreen } from './screens/SearchScreen';
import { NotificationScreen } from './screens/NotificationScreen';
import { ChatsScreen } from './screens/ChatsScreen';
import { CreatePostModal } from './components/CreatePostModal';
import { PostDetailModal } from './components/PostDetailModal';
import { AuthorProfileModal } from './components/AuthorProfileModal';
import { FollowersListModal } from './components/FollowersListModal';
import { PWAInstallModal } from './components/PWAInstallModal';
import { AuthModal } from './components/AuthModal';
import { VerificationBadge } from './components/VerificationBadge';
import { AvatarIcon } from './components/AvatarIcon';
import { DynamicFeedIcon, LeaderboardIcon, StorefrontIcon } from './components/NavIcons';
import { Smartphone, Search, Bell, Trophy, LogIn, LogOut, User, Shield, X, ArrowLeft, Sparkles, CheckCircle2, Users, Sun, Moon, MessageCircle } from 'lucide-react';
import { getUserNotifications, getReadNotificationIds, getUserConversations, getDistinctUnreadSendersCount } from './utils/messagingUtils';
import { updateActiveUserPresence } from './utils/presenceUtils';
import { isUserMatchingAudience } from './utils/audienceUtils';

export const App: React.FC = () => {
  // Navigation State
  const [navIndex, setNavIndex] = useState(0);
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('fuhsi_active_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.nickname && !isUserPermanentlyDeleted(parsed) && (parsed.isApproved !== false || parsed.isAdmin)) {
            return true;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    return false;
  });
  const [appTotalMembers, setAppTotalMembers] = useState<number>(() => getApprovedMembersCount());
  const [activeChatRecipient, setActiveChatRecipient] = useState<{
    nickname: string;
    avatarKey?: string;
    avatarUrl?: string;
  } | null>(null);
  const [showFollowersDirectoryModal, setShowFollowersDirectoryModal] = useState<boolean>(false);

  // Dynamically calculate total registered community members based on approved user accounts only
  useEffect(() => {
    const updateCount = () => {
      setAppTotalMembers(getApprovedMembersCount());
    };
    updateCount();
    const timer = setInterval(updateCount, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initialize Theme Preference (Light / Dark Mode / System) from LocalStorage
  const [activeThemeMode, setActiveThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    const cleanup = initTheme();
    const handleThemeEvent = (e: any) => {
      if (e.detail) {
        setActiveThemeMode(e.detail);
      }
    };
    window.addEventListener('fuhsi-theme-changed', handleThemeEvent);
    return () => {
      cleanup();
      window.removeEventListener('fuhsi-theme-changed', handleThemeEvent);
    };
  }, []);

  const toggleQuickTheme = () => {
    const isDarkNow = document.documentElement.classList.contains('dark');
    const nextTheme: ThemeMode = isDarkNow ? 'light' : 'dark';
    setActiveThemeMode(nextTheme);
    setStoredTheme(nextTheme);
  };

  // App Core State with Persistent LocalStorage Initialization
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('fuhsi_active_user');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.nickname && !isUserPermanentlyDeleted(parsed)) {
            return isModulaAccount(parsed) ? sanitizeModulaProfile(parsed) : parsed;
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    return INITIAL_USER_PROFILE;
  });
  const lastProfileSaveTimestampRef = useRef<number>(0);
  
  const [posts, setPosts] = useState<Post[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_posts_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_POSTS;
  });

  const [comments, setComments] = useState<Comment[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_comments_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_COMMENTS;
  });

  const [marketplaceItems, setMarketplaceItems] = useState<MarketplaceItem[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_marketplace_approved_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_MARKETPLACE_ITEMS;
  });

  const [pendingMarketplaceItems, setPendingMarketplaceItems] = useState<MarketplaceItem[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_marketplace_pending_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_PENDING_MARKETPLACE_ITEMS;
  });

  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_verifications_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_VERIFICATION_REQUESTS;
  });

  const [reports, setReports] = useState<Report[]>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_reports_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_REPORTS;
  });

  const [userBookmarksMap, setUserBookmarksMap] = useState<Record<string, string[]>>(() => {
    try {
      const stored = localStorage.getItem('fuhsi_user_bookmarks_db');
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error(e);
    }
    return {};
  });

  // Real Following & Followers State (Persisted & Synced across all devices)
  const [allFollows, setAllFollows] = useState<FollowRecord[]>(() => getStoredFollows());

  // Active user bookmark IDs key
  const activeUserKey = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '');
  const myBookmarkedPostIds = userBookmarksMap[activeUserKey] || [];

  // Unread notifications and chat messages counter tracker
  const [notifTrigger, setNotifTrigger] = useState(0);

  useEffect(() => {
    const handleNotifUpdate = () => {
      setNotifTrigger((prev) => prev + 1);
    };
    window.addEventListener('fuhsi_notification_received', handleNotifUpdate);
    window.addEventListener('fuhsi_notification_read_updated', handleNotifUpdate);
    window.addEventListener('fuhsi_direct_message_updated', handleNotifUpdate);
    window.addEventListener('fuhsi_conversation_deleted', handleNotifUpdate);
    window.addEventListener('storage', handleNotifUpdate);

    // Heartbeat to guarantee instant update of active unread conversations
    const timer = setInterval(handleNotifUpdate, 2000);

    return () => {
      window.removeEventListener('fuhsi_notification_received', handleNotifUpdate);
      window.removeEventListener('fuhsi_notification_read_updated', handleNotifUpdate);
      window.removeEventListener('fuhsi_direct_message_updated', handleNotifUpdate);
      window.removeEventListener('fuhsi_conversation_deleted', handleNotifUpdate);
      window.removeEventListener('storage', handleNotifUpdate);
      clearInterval(timer);
    };
  }, []);

  const unreadNotificationCount = useMemo(() => {
    if (!userProfile?.nickname) return 0;
    const readMap = getReadNotificationIds(userProfile.nickname);
    const userNotifs = getUserNotifications(userProfile.nickname);

    let count = 0;
    userNotifs.forEach((n) => {
      const isRead = readMap[n.id] !== undefined ? readMap[n.id] : Boolean(n.isRead);
      if (!isRead) count++;
    });

    posts.forEach((p) => {
      const target = p.targetDepartment;
      if (!target || target === 'General Campus' || target === 'General') return;
      if (isUserMatchingAudience(userProfile.department, target)) {
        const id = `targeted_notif_${p.id}`;
        if (!readMap[id]) count++;
      }
    });

    return count;
  }, [userProfile?.nickname, userProfile?.department, posts, notifTrigger]);

  // Unread Chats Count for Navigation Badge (Distinct active conversations / senders with unread incoming messages)
  // - 1 user sending multiple unread messages = 1
  // - 2 different users sending unread messages = 2
  // - 3 different users = 3
  const unreadChatsCount = useMemo(() => {
    if (!userProfile?.nickname) return 0;
    try {
      return getDistinctUnreadSendersCount(userProfile.nickname);
    } catch (e) {
      return 0;
    }
  }, [userProfile?.nickname, notifTrigger]);

  // Auto Sync States to LocalStorage (pure local cache)
  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_user_bookmarks_db', JSON.stringify(userBookmarksMap));
    } catch (e) { console.error(e); }
  }, [userBookmarksMap]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_posts_db', JSON.stringify(posts));
    } catch (e) { console.error(e); }
  }, [posts]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_comments_db', JSON.stringify(comments));
    } catch (e) { console.error(e); }
  }, [comments]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_marketplace_approved_db', JSON.stringify(marketplaceItems));
    } catch (e) { console.error(e); }
  }, [marketplaceItems]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_marketplace_pending_db', JSON.stringify(pendingMarketplaceItems));
    } catch (e) { console.error(e); }
  }, [pendingMarketplaceItems]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_verifications_db', JSON.stringify(verificationRequests));
    } catch (e) { console.error(e); }
  }, [verificationRequests]);

  useEffect(() => {
    try {
      localStorage.setItem('fuhsi_reports_db', JSON.stringify(reports));
    } catch (e) { console.error(e); }
  }, [reports]);

  // Real-time Cloud Firestore Database Listener (Instant Sync across all devices)
  useEffect(() => {
    let isMounted = true;

    // Seed initial data to Firestore if Firestore is empty
    const initialUsers = getStoredUsers();
    seedFirestoreInitialDataIfNeeded(initialUsers, posts).catch((err) =>
      console.error('Firestore seed check failed:', err)
    );

    // 1. Subscribe Users in real-time from Firestore
    const unsubUsers = subscribeUsers((fsUsers) => {
      if (!isMounted) return;
      if (!fsUsers || fsUsers.length === 0) return;

      const validUsers = fsUsers.filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
      if (validUsers.length === 0) return;

      const localStoredUsers = getStoredUsers();
      const mergedUsers = mergeUsers(localStoredUsers, validUsers);
      localStorage.setItem('fuhsi_users_db', JSON.stringify(mergedUsers));
      setAppTotalMembers(mergedUsers.filter((u) => u.isApproved === true && !u.isDeclined).length);

      // Reconcile active logged-in user profile
      const activeUserJson = localStorage.getItem('fuhsi_active_user');
      if (activeUserJson) {
        try {
          const parsed = JSON.parse(activeUserJson);
          const cleanParsedNick = (parsed.nickname || '').toLowerCase().replace(/^@/, '');
          const found = mergedUsers.find(
            (u) => (u.id && parsed.id && u.id === parsed.id) ||
                   (u.nickname && u.nickname.toLowerCase().replace(/^@/, '') === cleanParsedNick)
          );

          const isDeleted = isUserPermanentlyDeleted(parsed);
          if (isDeleted && !parsed.isAdmin) {
            // User was removed/deleted from central database by Admin -> terminate session completely
            localStorage.removeItem('fuhsi_active_user');
            setUserProfile(INITIAL_USER_PROFILE);
            setIsLoggedIn(false);
          } else if (found) {
            if (found.isApproved === false && !parsed.isAdmin) {
              // Approval revoked -> user session must reflect pending review
              localStorage.removeItem('fuhsi_active_user');
              setUserProfile(INITIAL_USER_PROFILE);
              setIsLoggedIn(false);
              setShowAuthModal(true);
            } else {
              setUserProfile((prev) => {
                if (!prev) return isModulaAccount(found) ? sanitizeModulaProfile(found) : found;
                const prevTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
                const foundTime = found.updatedAt ? new Date(found.updatedAt).getTime() : 0;
                const isRecentlySaved = Date.now() - lastProfileSaveTimestampRef.current < 20000;
                const preferLocal = isRecentlySaved || prevTime >= foundTime;

                const nextAvatarUrl = preferLocal 
                  ? (prev.avatarUrl !== undefined ? prev.avatarUrl : found.avatarUrl) 
                  : (found.avatarUrl !== undefined ? found.avatarUrl : prev.avatarUrl);
                const nextAvatarKey = preferLocal 
                  ? (prev.avatarKey || found.avatarKey || 'caduceus') 
                  : (found.avatarKey || prev.avatarKey || 'caduceus');
                const nextPass = found.savedPassword || (found as any).password || prev.savedPassword || (prev as any).password;
                const nextRealName = preferLocal 
                  ? (prev.realNameHidden || prev.realName || found.realNameHidden || found.realName || '') 
                  : (found.realNameHidden || found.realName || prev.realNameHidden || prev.realName || '');
                const nextEmail = preferLocal 
                  ? (prev.studentEmail || found.studentEmail || '') 
                  : (found.studentEmail || prev.studentEmail || '');
                const nextPhone = preferLocal 
                  ? (prev.emergencyHomePhone || found.emergencyHomePhone || '') 
                  : (found.emergencyHomePhone || prev.emergencyHomePhone || '');
                const nextBio = preferLocal 
                  ? (prev.bio !== undefined ? prev.bio : (found.bio || '')) 
                  : (found.bio !== undefined ? found.bio : (prev.bio || ''));

                if (
                  prev.id === found.id &&
                  prev.nickname === (preferLocal ? prev.nickname : (found.nickname || prev.nickname)) &&
                  prev.avatarUrl === nextAvatarUrl &&
                  prev.avatarKey === nextAvatarKey &&
                  prev.bio === nextBio &&
                  (prev.realNameHidden || prev.realName || '') === nextRealName &&
                  (prev.studentEmail || '') === nextEmail &&
                  (prev.emergencyHomePhone || '') === nextPhone &&
                  prev.level === (preferLocal ? prev.level : (found.level || prev.level)) &&
                  prev.department === (preferLocal ? prev.department : (found.department || prev.department)) &&
                  prev.reputationScore === (found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore) &&
                  prev.isVerified === (found.isVerified !== undefined ? found.isVerified : prev.isVerified) &&
                  prev.isApproved === (found.isApproved !== undefined ? found.isApproved : prev.isApproved) &&
                  prev.savedPassword === nextPass
                ) {
                  return prev;
                }
                const updated: UserProfile = preferLocal
                  ? {
                      ...found,
                      ...prev,
                      nickname: prev.nickname || found.nickname,
                      realName: nextRealName,
                      realNameHidden: nextRealName,
                      studentEmail: nextEmail,
                      emergencyHomePhone: nextPhone,
                      department: isModulaAccount(prev) ? '' : (prev.department || found.department || ''),
                      level: isModulaAccount(prev) ? '' : (prev.level || found.level || ''),
                      bio: nextBio,
                      avatarUrl: nextAvatarUrl,
                      avatarKey: nextAvatarKey,
                      savedPassword: nextPass,
                      password: nextPass,
                      isApproved: found.isApproved !== undefined ? found.isApproved : prev.isApproved,
                      isDeclined: found.isDeclined !== undefined ? found.isDeclined : prev.isDeclined,
                      isVerified: found.isVerified !== undefined ? found.isVerified : prev.isVerified,
                      reputationScore: found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore,
                      updatedAt: prev.updatedAt || found.updatedAt || new Date().toISOString(),
                    }
                  : {
                      ...prev,
                      ...found,
                      nickname: found.nickname || prev.nickname,
                      realName: nextRealName,
                      realNameHidden: nextRealName,
                      studentEmail: nextEmail,
                      emergencyHomePhone: nextPhone,
                      department: isModulaAccount(found) ? '' : (found.department || prev.department || ''),
                      level: isModulaAccount(found) ? '' : (found.level || prev.level || ''),
                      bio: nextBio,
                      avatarUrl: nextAvatarUrl,
                      avatarKey: nextAvatarKey,
                      savedPassword: nextPass,
                      password: nextPass,
                      isApproved: found.isApproved !== undefined ? found.isApproved : prev.isApproved,
                      isDeclined: found.isDeclined !== undefined ? found.isDeclined : prev.isDeclined,
                      isVerified: found.isVerified !== undefined ? found.isVerified : prev.isVerified,
                      reputationScore: found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore,
                      updatedAt: found.updatedAt || prev.updatedAt || new Date().toISOString(),
                    };
                const finalUpdated = isModulaAccount(updated) ? sanitizeModulaProfile(updated) : updated;
                localStorage.setItem('fuhsi_active_user', JSON.stringify(finalUpdated));
                return finalUpdated;
              });
            }
          }
        } catch (e) {
          console.error('Error reconciling active user with Firestore users:', e);
        }
      }
    });

    // 2. Subscribe Posts in real-time from Firestore
    const unsubPosts = subscribePosts((fsPosts) => {
      if (!isMounted) return;
      const validPosts = (fsPosts || []).filter((p) => !isDemoPost(p));
      localStorage.setItem('fuhsi_posts_db', JSON.stringify(validPosts));
      setPosts(validPosts);
      setSelectedPost((prev) => {
        if (!prev) return null;
        const match = validPosts.find((p) => p.id === prev.id);
        return match || null;
      });
    });

    // 3. Subscribe Comments in real-time from Firestore
    const unsubComments = subscribeComments((fsComments) => {
      if (!isMounted) return;
      const validComments = (fsComments || []).filter((c) => !isDemoComment(c));
      localStorage.setItem('fuhsi_comments_db', JSON.stringify(validComments));
      setComments(validComments);
    });

    // 4. Subscribe Verification Requests in real-time from Firestore
    const unsubVerifs = subscribeVerificationRequests((fsVerifs) => {
      if (!isMounted) return;
      const validVerifs = (fsVerifs || []).filter((v) => !isDemoVerificationRequest(v));
      localStorage.setItem('fuhsi_verifications_db', JSON.stringify(validVerifs));
      setVerificationRequests(validVerifs);
    });

    // 5. Subscribe Marketplace Approved Items in real-time from Firestore
    const unsubMarketplace = subscribeMarketplaceApproved((fsItems) => {
      if (!isMounted) return;
      const validItems = (fsItems || []).filter((i) => i && i.id && !isDemoMarketplaceItem(i));
      localStorage.setItem('fuhsi_marketplace_approved_db', JSON.stringify(validItems));
      setMarketplaceItems(validItems);
    });

    // 6. Subscribe Direct Messages in real-time
    const unsubDirectMessages = subscribeAllDirectMessages((fsDirectMessages) => {
      if (!isMounted) return;
      const validMsgs = (fsDirectMessages || []).filter((d) => !isDemoDirectMessage(d));
      localStorage.setItem('fuhsi_direct_messages_db', JSON.stringify(validMsgs));
      setNotifTrigger((prev) => prev + 1);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated'));
      }
    });

    // 7. Subscribe Following & Followers in real-time
    const unsubFollows = subscribeFollows((fsFollows) => {
      if (!isMounted) return;
      const validFollows = (fsFollows || []).filter((f) => f && f.followerNickname && f.followingNickname);
      saveStoredFollows(validFollows);
      setAllFollows(validFollows);
    });

    return () => {
      isMounted = false;
      unsubUsers();
      unsubPosts();
      unsubComments();
      unsubVerifs();
      unsubMarketplace();
      unsubDirectMessages();
      unsubFollows();
    };
  }, []);

  // Periodic Cross-Device Central Database Synchronizer
  useEffect(() => {
    let isMounted = true;

    const syncWithCentralServerDb = async () => {
      const db = await fetchServerDb();
      if (!db || !isMounted) return;

      // 1. Sync Users List
      if (Array.isArray(db.users) && db.users.length > 0) {
        const validUsers = db.users.filter((u) => !isDemoUser(u) && !isDemoNickname(u.nickname));
        if (validUsers.length > 0) {
          const localStoredUsers = getStoredUsers();
          const mergedUsers = mergeUsers(localStoredUsers, validUsers);
          localStorage.setItem('fuhsi_users_db', JSON.stringify(mergedUsers));
          setAppTotalMembers(mergedUsers.filter((u) => u.isApproved === true && !u.isDeclined).length);

          const activeUserJson = localStorage.getItem('fuhsi_active_user');
          if (activeUserJson) {
            try {
              const parsed = JSON.parse(activeUserJson);
              const cleanParsedNick = (parsed.nickname || '').toLowerCase().replace(/^@/, '');
              const cleanParsedEmail = (parsed.studentEmail || '').toLowerCase().trim();
              const found = mergedUsers.find(
                (u) => (u.id && parsed.id && u.id === parsed.id) ||
                       (u.studentEmail && cleanParsedEmail && !cleanParsedEmail.includes('admin@fuhsi.edu.ng') && (u.studentEmail || '').toLowerCase().trim() === cleanParsedEmail) ||
                       (u.nickname && u.nickname.toLowerCase().replace(/^@/, '') === cleanParsedNick)
              );
              const isDeleted = isUserPermanentlyDeleted(parsed);
              if (isDeleted && !parsed.isAdmin) {
                localStorage.removeItem('fuhsi_active_user');
                setUserProfile(INITIAL_USER_PROFILE);
                setIsLoggedIn(false);
              } else if (found) {
                if (found.isApproved === false && !parsed.isAdmin) {
                  localStorage.removeItem('fuhsi_active_user');
                  setUserProfile(INITIAL_USER_PROFILE);
                  setIsLoggedIn(false);
                  setShowAuthModal(true);
                } else {
                  setUserProfile((prev) => {
                    if (!prev) return isModulaAccount(found) ? sanitizeModulaProfile(found) : found;
                    const prevTime = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
                    const foundTime = found.updatedAt ? new Date(found.updatedAt).getTime() : 0;
                    const isRecentlySaved = Date.now() - lastProfileSaveTimestampRef.current < 20000;
                    const preferLocal = isRecentlySaved || prevTime >= foundTime;

                    const nextAvatarUrl = preferLocal 
                      ? (prev.avatarUrl !== undefined ? prev.avatarUrl : found.avatarUrl) 
                      : (found.avatarUrl !== undefined ? found.avatarUrl : prev.avatarUrl);
                    const nextAvatarKey = preferLocal 
                      ? (prev.avatarKey || found.avatarKey || 'caduceus') 
                      : (found.avatarKey || prev.avatarKey || 'caduceus');
                    const nextPass = found.savedPassword || (found as any).password || prev.savedPassword || (prev as any).password;
                    const nextBio = preferLocal 
                      ? (prev.bio !== undefined ? prev.bio : (found.bio || '')) 
                      : (found.bio !== undefined ? found.bio : (prev.bio || ''));
                    const nextRealName = preferLocal 
                      ? (prev.realNameHidden || prev.realName || found.realNameHidden || found.realName || '') 
                      : (found.realNameHidden || found.realName || prev.realNameHidden || prev.realName || '');
                    const nextEmail = preferLocal 
                      ? (prev.studentEmail || found.studentEmail || '') 
                      : (found.studentEmail || prev.studentEmail || '');
                    const nextPhone = preferLocal 
                      ? (prev.emergencyHomePhone || found.emergencyHomePhone || '') 
                      : (found.emergencyHomePhone || prev.emergencyHomePhone || '');

                    if (
                      prev.id === found.id &&
                      prev.nickname === (preferLocal ? prev.nickname : (found.nickname || prev.nickname)) &&
                      prev.avatarUrl === nextAvatarUrl &&
                      prev.avatarKey === nextAvatarKey &&
                      prev.bio === nextBio &&
                      (prev.realNameHidden || prev.realName || '') === nextRealName &&
                      (prev.studentEmail || '') === nextEmail &&
                      (prev.emergencyHomePhone || '') === nextPhone &&
                      prev.level === (preferLocal ? prev.level : (found.level || prev.level)) &&
                      prev.department === (preferLocal ? prev.department : (found.department || prev.department)) &&
                      prev.reputationScore === (found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore) &&
                      prev.isVerified === (found.isVerified !== undefined ? found.isVerified : prev.isVerified) &&
                      prev.isApproved === (found.isApproved !== undefined ? found.isApproved : prev.isApproved) &&
                      prev.savedPassword === nextPass
                    ) {
                      return prev;
                    }
                    const updated: UserProfile = preferLocal
                      ? {
                          ...found,
                          ...prev,
                          nickname: prev.nickname || found.nickname,
                          realName: nextRealName,
                          realNameHidden: nextRealName,
                          studentEmail: nextEmail,
                          emergencyHomePhone: nextPhone,
                          department: isModulaAccount(prev) ? '' : (prev.department || found.department || ''),
                          level: isModulaAccount(prev) ? '' : (prev.level || found.level || ''),
                          bio: nextBio,
                          avatarUrl: nextAvatarUrl,
                          avatarKey: nextAvatarKey,
                          savedPassword: nextPass,
                          password: nextPass,
                          isApproved: found.isApproved !== undefined ? found.isApproved : prev.isApproved,
                          isDeclined: found.isDeclined !== undefined ? found.isDeclined : prev.isDeclined,
                          isVerified: found.isVerified !== undefined ? found.isVerified : prev.isVerified,
                          reputationScore: found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore,
                          updatedAt: prev.updatedAt || found.updatedAt || new Date().toISOString(),
                        }
                      : {
                          ...prev,
                          ...found,
                          nickname: found.nickname || prev.nickname,
                          realName: nextRealName,
                          realNameHidden: nextRealName,
                          studentEmail: nextEmail,
                          emergencyHomePhone: nextPhone,
                          department: isModulaAccount(found) ? '' : (found.department || prev.department || ''),
                          level: isModulaAccount(found) ? '' : (found.level || prev.level || ''),
                          bio: nextBio,
                          avatarUrl: nextAvatarUrl,
                          avatarKey: nextAvatarKey,
                          savedPassword: nextPass,
                          password: nextPass,
                          isApproved: found.isApproved !== undefined ? found.isApproved : prev.isApproved,
                          isDeclined: found.isDeclined !== undefined ? found.isDeclined : prev.isDeclined,
                          isVerified: found.isVerified !== undefined ? found.isVerified : prev.isVerified,
                          reputationScore: found.reputationScore !== undefined ? found.reputationScore : prev.reputationScore,
                          updatedAt: found.updatedAt || prev.updatedAt || new Date().toISOString(),
                        };
                    const finalUpdated = isModulaAccount(updated) ? sanitizeModulaProfile(updated) : updated;
                    localStorage.setItem('fuhsi_active_user', JSON.stringify(finalUpdated));
                    return finalUpdated;
                  });
                }
              }
            } catch (e) {
              console.error('Error updating active user profile from server db:', e);
            }
          }
        }
      }

      // 2. Sync Posts
      if (Array.isArray(db.posts)) {
        const validPosts = db.posts.filter((p) => !isDemoPost(p));
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(validPosts));
        setPosts((prev) => (JSON.stringify(prev) !== JSON.stringify(validPosts) ? validPosts : prev));
      }

      // 3. Sync Comments
      if (Array.isArray(db.comments)) {
        const validComments = db.comments.filter((c) => !isDemoComment(c));
        localStorage.setItem('fuhsi_comments_db', JSON.stringify(validComments));
        setComments((prev) => (JSON.stringify(prev) !== JSON.stringify(validComments) ? validComments : prev));
      }

      // 4. Sync Marketplace Approved Items
      if (Array.isArray(db.marketplaceItems)) {
        const validApproved = db.marketplaceItems.filter((i) => i && i.id && !isDemoMarketplaceItem(i));
        localStorage.setItem('fuhsi_marketplace_approved_db', JSON.stringify(validApproved));
        setMarketplaceItems((prev) => (JSON.stringify(prev) !== JSON.stringify(validApproved) ? validApproved : prev));
      }

      // 5. Sync Marketplace Pending Items
      if (Array.isArray(db.pendingMarketplaceItems)) {
        const validPending = db.pendingMarketplaceItems.filter((i) => i && i.id && !isDemoMarketplaceItem(i));
        localStorage.setItem('fuhsi_marketplace_pending_db', JSON.stringify(validPending));
        setPendingMarketplaceItems((prev) => (JSON.stringify(prev) !== JSON.stringify(validPending) ? validPending : prev));
      }

      // 6. Sync Verification Requests
      if (Array.isArray(db.verificationRequests)) {
        const validVerifs = db.verificationRequests.filter((v) => !isDemoVerificationRequest(v));
        localStorage.setItem('fuhsi_verifications_db', JSON.stringify(validVerifs));
        setVerificationRequests((prev) => (JSON.stringify(prev) !== JSON.stringify(validVerifs) ? validVerifs : prev));
      }

      // 7. Sync Reports
      if (Array.isArray(db.reports)) {
        localStorage.setItem('fuhsi_reports_db', JSON.stringify(db.reports));
        setReports((prev) => (JSON.stringify(prev) !== JSON.stringify(db.reports) ? db.reports : prev));
      }

      // 8. Sync Direct Messages
      if (Array.isArray(db.directMessages)) {
        const validDms = db.directMessages.filter((d) => !isDemoDirectMessage(d));
        localStorage.setItem('fuhsi_direct_messages_db', JSON.stringify(validDms));
        setNotifTrigger((prev) => prev + 1);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated'));
        }
      }

      // 9. Sync Following & Followers
      if (Array.isArray(db.follows)) {
        const validFollows = db.follows.filter((f) => f && f.followerNickname && f.followingNickname);
        saveStoredFollows(validFollows);
        setAllFollows((prev) => (JSON.stringify(prev) !== JSON.stringify(validFollows) ? validFollows : prev));
      }
    };

    // Initial sync immediately on mount
    syncWithCentralServerDb();

    // Poll server every 2.5 seconds
    const interval = setInterval(syncWithCentralServerDb, 2500);

    // Sync immediately when user switches back to this browser window / phone tab
    const handleFocus = () => syncWithCentralServerDb();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, []);

  useEffect(() => {
    if (userProfile && userProfile.nickname) {
      try {
        localStorage.setItem('fuhsi_active_user', JSON.stringify(userProfile));
      } catch (e) { console.error(e); }
    }
  }, [userProfile]);

  // Real-time Presence & Active Heartbeat Monitor
  useEffect(() => {
    if (!userProfile || !userProfile.nickname) return;

    // 1. Send initial online presence heartbeat
    updateActiveUserPresence(userProfile, true);

    // 2. Periodic heartbeat every 20 seconds while app is active
    const heartbeatInterval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        updateActiveUserPresence(userProfile, true);
      }
    }, 20000);

    // 3. User interaction throttle
    let lastActivityTime = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastActivityTime > 15000) {
        lastActivityTime = now;
        updateActiveUserPresence(userProfile, true);
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        updateActiveUserPresence(userProfile, true);
      }
    };

    const handleBeforeUnload = () => {
      updateActiveUserPresence(userProfile, false);
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('touchstart', handleUserActivity, { passive: true });
    window.addEventListener('click', handleUserActivity, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [userProfile?.nickname]);

  useEffect(() => {
    if (userProfile && userProfile.nickname) {
      const cleanNick = userProfile.nickname.toLowerCase().replace(/^@/, '');
      const appVerif = verificationRequests.find(
        (v) =>
          v.status === 'APPROVED' &&
          v.requestType !== 'STUDENT_CONVERSION' &&
          v.category !== 'Student Conversion Subscription' &&
          (v.applicantNickname?.toLowerCase().replace(/^@/, '') === cleanNick ||
            v.applicantNickname?.toLowerCase() === userProfile.nickname.toLowerCase())
      );
      if (appVerif && (!userProfile.isVerified || userProfile.verificationStatus !== 'approved')) {
        setUserProfile((prev) => ({
          ...prev,
          isVerified: true,
          verificationStatus: 'approved' as const,
          badgeType: appVerif.assignedBadgeType || prev.badgeType || 'BLUE',
          badgeTitle: appVerif.assignedBadgeTitle !== undefined ? (appVerif.assignedBadgeTitle || '').trim() : (prev.badgeTitle || '').trim(),
        }));
      }
    }
  }, [verificationRequests, userProfile?.nickname]);

  // Requirement: Session & Security - Restore authenticated user session on initial load or reload
  useEffect(() => {
    try {
      const activeUserJson = localStorage.getItem('fuhsi_active_user');
      if (activeUserJson) {
        let parsed = JSON.parse(activeUserJson);
        if (parsed && parsed.nickname && !isUserPermanentlyDeleted(parsed)) {
          const storedUsers = localStorage.getItem('fuhsi_users_db');
          if (storedUsers) {
            const list: UserProfile[] = JSON.parse(storedUsers);
            const found = list.find(
              (u) => u.id === parsed.id || u.nickname?.toLowerCase() === parsed.nickname?.toLowerCase()
            );
            if (found) {
              parsed = {
                ...parsed,
                ...found,
                avatarUrl: found.avatarUrl || parsed.avatarUrl,
              };
            }
          }
          if (isModulaAccount(parsed)) {
            parsed = sanitizeModulaProfile(parsed);
            localStorage.setItem('fuhsi_active_user', JSON.stringify(parsed));
          }
          setUserProfile(parsed);
          if (parsed.isApproved !== false || parsed.isAdmin) {
            setIsLoggedIn(true);
            setShowAuthModal(false);
          } else {
            setIsLoggedIn(false);
            setShowAuthModal(true);
          }
        } else {
          setIsLoggedIn(false);
          setShowAuthModal(true);
        }
      } else {
        setIsLoggedIn(false);
        setShowAuthModal(true);
      }
      cleanupModulaFirestoreDoc().catch(() => {});
    } catch (e) {
      console.error(e);
      setIsLoggedIn(false);
      setShowAuthModal(true);
    }
  }, []);

  // Filter & Selected Item Modals
  const [selectedFilter, setSelectedFilter] = useState('All Campus');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedAuthorPost, setSelectedAuthorPost] = useState<Post | null>(null);
  const [showCreatePostModal, setShowCreatePostModal] = useState(false);

  // Stack-based Navigation & Modal History State Support
  type ModalStackItem =
    | { type: 'postDetail'; post: Post }
    | { type: 'authorProfile'; post: Post }
    | { type: 'profile' }
    | { type: 'createPost' }
    | { type: 'auth' }
    | { type: 'pwa' }
    | { type: 'followersDirectory' };

  const [modalStack, setModalStack] = useState<ModalStackItem[]>([]);
  const [navHistory, setNavHistory] = useState<number[]>([0]);

  // Tab Navigation with History Tracking
  const handleNavChange = useCallback((newIndex: number) => {
    // Guest accounts do not have access to Campus Hub (Marketplace, 2) or Chats (4)
    if (isGuestAccount(userProfile) && (newIndex === 2 || newIndex === 4)) {
      return;
    }
    setNavIndex((prevNav) => {
      if (prevNav === newIndex) return prevNav;
      setNavHistory((prev) => [...prev, newIndex]);
      try {
        window.history.pushState({ type: 'nav', index: newIndex, time: Date.now() }, '');
      } catch (e) { console.error(e); }
      return newIndex;
    });
  }, [userProfile]);

  // Safety fallback: Ensure guests are never left on Hub&Fund or Chats
  useEffect(() => {
    if (isGuestAccount(userProfile) && (navIndex === 2 || navIndex === 4)) {
      setNavIndex(0);
    }
  }, [userProfile, navIndex]);

  // Modal Opener Helpers with History Tracking
  const openPostDetail = useCallback((post: Post) => {
    setSelectedPost(post);
    setModalStack((prev) => [...prev, { type: 'postDetail', post }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'postDetail', id: post.id, time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const openProfileModal = useCallback(() => {
    setShowProfileModal(true);
    setModalStack((prev) => [...prev, { type: 'profile' }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'profile', time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const openAuthorProfile = useCallback((post: Post) => {
    const targetNick = (post.authorNickname || (post as any).nickname || '').toLowerCase().replace(/^@/, '');
    const myNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '');

    // If the clicked profile is the current user's own profile, open My Profile directly
    if (myNick && targetNick === myNick) {
      openProfileModal();
      return;
    }

    let enrichedPost = { ...post };
    try {
      const storedUsers = localStorage.getItem('fuhsi_users_db');
      if (storedUsers) {
        const userList = JSON.parse(storedUsers);
        if (Array.isArray(userList)) {
          const found = userList.find((u: any) => u.nickname && u.nickname.toLowerCase().replace(/^@/, '') === targetNick);
          if (found) {
            enrichedPost.authorAvatarKey = found.avatarKey || post.authorAvatarKey || 'caduceus';
            enrichedPost.authorAvatarUrl = found.avatarUrl || post.authorAvatarUrl;
            enrichedPost.authorBadgeType = found.badgeType || post.authorBadgeType || 'NONE';
            enrichedPost.authorBadgeTitle = found.badgeTitle || post.authorBadgeTitle || '';
            (enrichedPost as any).authorIsVerified = found.isVerified ?? post.isVerified;
            enrichedPost.authorPoints = calculateUserPoints(found.nickname, found, posts, comments, reports);
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    setSelectedAuthorPost(enrichedPost);
    setModalStack((prev) => [...prev, { type: 'authorProfile', post: enrichedPost }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'authorProfile', id: enrichedPost.id, time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, [userProfile?.nickname, openProfileModal]);

  const openCreatePostModal = useCallback(() => {
    setShowCreatePostModal(true);
    setModalStack((prev) => [...prev, { type: 'createPost' }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'createPost', time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const openAuthModal = useCallback(() => {
    setShowAuthModal(true);
    setModalStack((prev) => [...prev, { type: 'auth' }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'auth', time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const openPwaModal = useCallback(() => {
    setShowPwaModal(true);
    setModalStack((prev) => [...prev, { type: 'pwa' }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'pwa', time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const openFollowersDirectory = useCallback(() => {
    setShowFollowersDirectoryModal(true);
    setModalStack((prev) => [...prev, { type: 'followersDirectory' }]);
    try {
      window.history.pushState({ type: 'modal', modalType: 'followersDirectory', time: Date.now() }, '');
    } catch (e) { console.error(e); }
  }, []);

  const handleStartChat = useCallback((recipientNickname: string, avatarKey?: string, avatarUrl?: string) => {
    if (isGuestAccount(userProfile)) return;
    setActiveChatRecipient({
      nickname: recipientNickname,
      avatarKey,
      avatarUrl,
    });
    // Close any open modals so student seamlessly navigates to chat
    setSelectedAuthorPost(null);
    setSelectedPost(null);
    setShowProfileModal(false);
    setShowCreatePostModal(false);
    setShowAuthModal(false);
    setShowPwaModal(false);
    setShowFollowersDirectoryModal(false);
    setModalStack([]);
    handleNavChange(4); // Switch to Chats screen
  }, [handleNavChange, userProfile]);

  // Close top modal via UI "X" / "Back" button
  const closeModalUI = useCallback(() => {
    if (window.history.state && window.history.state.type === 'modal') {
      window.history.back();
    } else {
      // Direct state pop if no history entry
      setModalStack((prevStack) => {
        if (prevStack.length === 0) {
          setSelectedPost(null);
          setSelectedAuthorPost(null);
          setShowProfileModal(false);
          setShowCreatePostModal(false);
          setShowAuthModal(false);
          setShowPwaModal(false);
          setShowFollowersDirectoryModal(false);
          return [];
        }
        const newStack = [...prevStack];
        newStack.pop();

        const lastPost = newStack.slice().reverse().find((item) => item.type === 'postDetail');
        setSelectedPost(lastPost ? (lastPost as any).post : null);

        const lastAuthor = newStack.slice().reverse().find((item) => item.type === 'authorProfile');
        setSelectedAuthorPost(lastAuthor ? (lastAuthor as any).post : null);

        setShowProfileModal(newStack.some((item) => item.type === 'profile'));
        setShowCreatePostModal(newStack.some((item) => item.type === 'createPost'));
        setShowAuthModal(newStack.some((item) => item.type === 'auth'));
        setShowPwaModal(newStack.some((item) => item.type === 'pwa'));
        setShowFollowersDirectoryModal(newStack.some((item) => item.type === 'followersDirectory'));

        return newStack;
      });
    }
  }, []);

  // PopState Event Handler
  useEffect(() => {
    const handlePopState = () => {
      setModalStack((prevStack) => {
        if (prevStack.length > 0) {
          const newStack = [...prevStack];
          newStack.pop();

          const lastPost = newStack.slice().reverse().find((item) => item.type === 'postDetail');
          setSelectedPost(lastPost ? (lastPost as any).post : null);

          const lastAuthor = newStack.slice().reverse().find((item) => item.type === 'authorProfile');
          setSelectedAuthorPost(lastAuthor ? (lastAuthor as any).post : null);

          setShowProfileModal(newStack.some((item) => item.type === 'profile'));
          setShowCreatePostModal(newStack.some((item) => item.type === 'createPost'));
          setShowAuthModal(newStack.some((item) => item.type === 'auth'));
          setShowPwaModal(newStack.some((item) => item.type === 'pwa'));
          setShowFollowersDirectoryModal(newStack.some((item) => item.type === 'followersDirectory'));

          return newStack;
        }

        // Handle navigation tab history if no modals open
        setNavHistory((prevNav) => {
          if (prevNav.length > 1) {
            const newNav = [...prevNav];
            newNav.pop();
            const prevTab = newNav[newNav.length - 1];
            setNavIndex(prevTab);
            return newNav;
          }
          return prevNav;
        });

        return [];
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Handlers for Feed
  const handleLikeClick = (post: Post) => {
    if (!userProfile || isGuestAccount(userProfile)) {
      setShowAuthModal(true);
      return;
    }

    const { nextLikedBy } = toggleUserLike(post.likedBy, userProfile);
    const nextCount = nextLikedBy.length;
    const nowIso = new Date().toISOString();

    const updated: Post = {
      ...post,
      likedBy: nextLikedBy,
      likesCount: nextCount,
      likes: nextCount,
      updatedAt: nowIso,
    };

    setPosts((prev) => {
      const updatedPosts = prev.map((p) => (p.id === post.id ? updated : p));
      try {
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
      } catch (e) {
        console.error(e);
      }
      return updatedPosts;
    });

    if (selectedPost && selectedPost.id === post.id) {
      setSelectedPost(updated);
    }

    setModalStack((prevStack) =>
      prevStack.map((item) => {
        if (item.type === 'postDetail' && item.post.id === post.id) {
          return { ...item, post: updated };
        }
        return item;
      })
    );

    savePostToFirestore(updated).catch((err) => console.error('Error saving like to Firestore:', err));
    pushServerDbSync({ posts: [updated] } as any);
  };

  const handleBookmarkClick = (post: Post) => {
    const userKey = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '');
    const currentList = userBookmarksMap[userKey] || [];
    const isBookmarked = currentList.includes(post.id);

    const updatedList = isBookmarked
      ? currentList.filter((id) => id !== post.id)
      : [...currentList, post.id];

    const updatedMap = {
      ...userBookmarksMap,
      [userKey]: updatedList,
    };

    setUserBookmarksMap(updatedMap);

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === post.id) {
          const nextState = !isBookmarked;
          const updated = { ...p, isBookmarkedByMe: nextState, isBookmarked: nextState };
          if (selectedPost && selectedPost.id === post.id) {
            setSelectedPost(updated);
          }
          savePostToFirestore(updated).catch((err) => console.error(err));
          return updated;
        }
        return p;
      })
    );
  };

  const handleDeletePost = (postId: string) => {
    deletePostFromFirestore(postId).catch((err) => console.error('Error deleting post from Firestore:', err));
    const updatedPosts = posts.filter((p) => p.id !== postId);
    const updatedComments = comments.filter((c) => c.postId !== postId);
    setPosts(updatedPosts);
    setComments(updatedComments);
    try {
      localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
      localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedComments));
    } catch (e) {
      console.error(e);
    }
    pushServerDbSync({ posts: updatedPosts, replacePosts: true, comments: updatedComments, replaceComments: true }).catch((err) =>
      console.error('Error syncing post deletion to server db:', err)
    );

    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost(null);
    }
    setModalStack((prevStack) =>
      prevStack.filter((item) => !(item.type === 'postDetail' && item.post?.id === postId))
    );
  };

  const handleEditPost = (postId: string, newContent: string) => {
    const cleanContent = newContent.trim();
    if (!cleanContent) return;
    const nowIso = new Date().toISOString();

    const updatedPosts = posts.map((p) => {
      if (p.id === postId) {
        const updated: Post = {
          ...p,
          content: cleanContent,
          text: cleanContent,
          updatedAt: nowIso,
          isEdited: true,
        };
        savePostToFirestore(updated).catch((err) => console.error('Error saving edited post to Firestore:', err));
        return updated;
      }
      return p;
    });

    setPosts(updatedPosts);
    try {
      localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
    } catch (e) {
      console.error(e);
    }

    pushServerDbSync({ posts: updatedPosts, replacePosts: true }).catch((err) => {
      console.error('Error pushing edited post to server:', err);
    });

    setModalStack((prevStack) =>
      prevStack.map((item) => {
        if (item.type === 'postDetail' && item.post.id === postId) {
          return {
            ...item,
            post: {
              ...item.post,
              content: cleanContent,
              text: cleanContent,
              updatedAt: nowIso,
              isEdited: true,
            },
          };
        }
        return item;
      })
    );

    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost((prev) =>
        prev ? { ...prev, content: cleanContent, text: cleanContent, updatedAt: nowIso, isEdited: true } : null
      );
    }
  };

  const handleDeleteComment = (commentId: string) => {
    deleteCommentFromFirestore(commentId).catch((err) => console.error('Error deleting comment from Firestore:', err));
    const updatedComments = comments.filter((c) => c.id !== commentId && c.parentId !== commentId);
    setComments(updatedComments);
    const updatedPosts = posts.map((p) => {
      if (selectedPost && p.id === selectedPost.id) {
        return { ...p, commentsCount: Math.max(0, (p.commentsCount || 1) - 1) };
      }
      return p;
    });
    setPosts(updatedPosts);
    try {
      localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedComments));
      localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
    } catch (e) {
      console.error(e);
    }
    pushServerDbSync({ comments: updatedComments, replaceComments: true, posts: updatedPosts, replacePosts: true }).catch((err) =>
      console.error('Error syncing comment deletion to server db:', err)
    );
  };

  const handleVotePoll = (post: Post, optionId: string) => {
    const currentNickname = (userProfile?.nickname || 'guest').toLowerCase();

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === post.id) {
          // Check if current user already voted on this account
          const existingVote =
            p.pollVotesByUser?.[currentNickname] ||
            p.pollVotesByUser?.[userProfile?.nickname || ''];
          if (existingVote) return p;

          const updatedVotesByUser = {
            ...(p.pollVotesByUser || {}),
            [currentNickname]: optionId,
          };

          // Update pollOptions array
          let updatedOptions = p.pollOptions;
          if (updatedOptions && updatedOptions.length > 0) {
            updatedOptions = updatedOptions.map((opt, idx) => {
              if (
                opt.id === optionId ||
                `opt_${idx}` === optionId ||
                opt.text === optionId ||
                (optionId === 'A' && idx === 0) ||
                (optionId === 'B' && idx === 1)
              ) {
                return { ...opt, votes: (opt.votes || 0) + 1 };
              }
              return opt;
            });
          }

          let votesA = p.pollVotesA || 0;
          let votesB = p.pollVotesB || 0;
          if (optionId === 'A' || optionId === 'opt_0') votesA += 1;
          if (optionId === 'B' || optionId === 'opt_1') votesB += 1;

          const updatedPost = {
            ...p,
            userVotedOpt: optionId,
            pollVotesByUser: updatedVotesByUser,
            pollOptions: updatedOptions,
            pollVotesA: votesA,
            pollVotesB: votesB,
          };
          savePostToFirestore(updatedPost).catch((err) => console.error(err));
          pushServerDbSync({ posts: [updatedPost] } as any).catch(console.error);
          return updatedPost;
        }
        return p;
      })
    );
  };

  const handleReportPost = (post: Post, reason: string) => {
    const newReport: Report = {
      id: `rep_${Date.now()}`,
      postId: post.id,
      reporterNickname: userProfile.nickname,
      reason,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };
    setReports((prev) => [newReport, ...prev]);
    setPosts((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, isFlagged: true, flagReason: reason } : p))
    );
    pushServerDbSync({ reports: [newReport] } as any).catch(console.error);
  };

  const handleCreatePost = (data: {
    content: string;
    department: string;
    targetDepartment?: string;
    category?: string;
    imageUrl?: string;
    imageUrls?: string[];
    imageResName?: string;
    pollQuestion?: string;
    pollOptions?: string[];
    pollOptA?: string;
    pollOptB?: string;
  }) => {
    const cleanContent = data.content.trim();
    const targetDept = data.targetDepartment || 'General Campus';
    const isPriority = targetDept !== 'General Campus';

    let formattedPollOptions: PollOption[] | undefined = undefined;
    if (data.pollQuestion && data.pollOptions && data.pollOptions.length > 0) {
      formattedPollOptions = data.pollOptions.map((optText, idx) => ({
        id: `opt_${idx}`,
        text: optText,
        votes: 0,
      }));
    } else if (data.pollQuestion && (data.pollOptA || data.pollOptB)) {
      formattedPollOptions = [
        { id: 'A', text: data.pollOptA || 'Option A', votes: 0 },
        { id: 'B', text: data.pollOptB || 'Option B', votes: 0 },
      ];
    }

    const newPost: Post = {
      id: `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      authorNickname: userProfile.nickname,
      authorBadgeType: userProfile.badgeType,
      authorBadgeTitle: userProfile.badgeTitle,
      isVerified: userProfile.isVerified,
      authorAvatarKey: userProfile.avatarKey,
      authorAvatarUrl: userProfile.avatarUrl,
      authorPoints: 0,
      authorDepartment: (isModulaAccount(userProfile) || isGuestAccount(userProfile)) ? '' : userProfile.department,
      authorLevel: (isModulaAccount(userProfile) || isGuestAccount(userProfile)) ? '' : userProfile.level,
      department: (isModulaAccount(userProfile) || isGuestAccount(userProfile)) ? 'General' : (data.department || 'General'),
      targetDepartment: targetDept,
      isDepartmentPriority: isPriority,
      category: (data.category as any) || 'General',
      content: cleanContent,
      imageUrl: data.imageUrl,
      imageUrls: data.imageUrls || (data.imageUrl ? [data.imageUrl] : undefined),
      imageResName: data.imageResName,
      isGhostMode: false,
      timestamp: new Date().toISOString(),
      likesCount: 0,
      likes: 0,
      likedBy: [],
      commentsCount: 0,
      isLikedByMe: false,
      isBookmarkedByMe: false,
      pollQuestion: data.pollQuestion,
      pollOptions: formattedPollOptions,
      pollVotesByUser: {},
      pollOptA: data.pollOptA || (data.pollOptions ? data.pollOptions[0] : undefined),
      pollOptB: data.pollOptB || (data.pollOptions ? data.pollOptions[1] : undefined),
      pollVotesA: 0,
      pollVotesB: 0,
      isFlagged: false,
    };

    const calculatedPoints = calculateUserPoints(userProfile.nickname, userProfile, [newPost, ...posts], comments, reports);
    newPost.authorPoints = calculatedPoints;

    savePostToFirestore(newPost).catch((err) => console.error('Error saving post to Firestore:', err));
    pushServerDbSync({ posts: [newPost] } as any).catch(console.error);

    setPosts((prev) => [newPost, ...prev]);
    // Recalculate exact points dynamically
    setUserProfile((prev) => ({
      ...prev,
      reputationScore: calculateUserPoints(prev.nickname, prev, [newPost, ...posts], comments, reports)
    }));
  };

  const handleAddComment = (
    postId: string,
    commentText: string,
    parentId?: string,
    replyToNickname?: string,
    imageUrl?: string
  ) => {
    const cleanText = commentText.trim();

    const newComment: Comment = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      postId,
      authorNickname: userProfile.nickname,
      authorBadgeType: userProfile.badgeType,
      authorBadgeTitle: userProfile.badgeTitle,
      isVerified: userProfile.isVerified,
      authorAvatarKey: userProfile.avatarKey,
      authorAvatarUrl: userProfile.avatarUrl,
      content: cleanText,
      imageUrl,
      timestamp: new Date().toISOString(),
      parentId,
      replyToNickname,
      likesCount: 0,
      likes: 0,
      likedBy: [],
      isLikedByMe: false,
    };

    const newCommentsList = [...comments, newComment];
    saveCommentToFirestore(newComment).catch((err) => console.error('Error saving comment to Firestore:', err));
    pushServerDbSync({ comments: [newComment] } as any).catch(console.error);
    setComments(newCommentsList);
    setPosts((prev) =>
      prev.map((p) => {
        if (p.id === postId) {
          const updatedP = { ...p, commentsCount: (p.commentsCount || 0) + 1 };
          savePostToFirestore(updatedP).catch(console.error);
          pushServerDbSync({ posts: [updatedP] } as any).catch(console.error);
          return updatedP;
        }
        return p;
      })
    );
    if (selectedPost && selectedPost.id === postId) {
      setSelectedPost((prev) => (prev ? { ...prev, commentsCount: (prev.commentsCount || 0) + 1 } : null));
    }
    // Recalculate exact points dynamically
    setUserProfile((prev) => ({
      ...prev,
      reputationScore: calculateUserPoints(prev.nickname, prev, posts, newCommentsList, reports)
    }));
  };

  const handleLikeComment = (commentId: string) => {
    if (!userProfile || isGuestAccount(userProfile)) {
      setShowAuthModal(true);
      return;
    }

    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const { nextLikedBy } = toggleUserLike(c.likedBy, userProfile);
          const nextCount = nextLikedBy.length;
          const updated: Comment = {
            ...c,
            likedBy: nextLikedBy,
            likesCount: nextCount,
            likes: nextCount,
          };
          saveCommentToFirestore(updated).catch((err) => console.error('Error saving comment like to Firestore:', err));
          pushServerDbSync({ comments: [updated] } as any);
          return updated;
        }
        return c;
      })
    );
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('fuhsi_active_user');
    } catch (e) {
      console.error(e);
    }
    setUserProfile(INITIAL_USER_PROFILE);
    setIsLoggedIn(false);
    setShowProfileModal(false);
    setShowAuthModal(true);
  };

  const handleDeleteAccount = async () => {
    if (!userProfile || !userProfile.id) return;
    const targetUserId = userProfile.id;
    const targetNickname = userProfile.nickname || '';
    const targetEmail = userProfile.studentEmail || '';
    const targetMatric = userProfile.matricNumber || '';

    try {
      // 1. Mark permanently deleted in tombstone to prevent resurrection
      markUserPermanentlyDeleted({
        id: targetUserId,
        nickname: targetNickname,
        studentEmail: targetEmail,
        matricNumber: targetMatric,
      });

      // 2. Remove user from local users DB
      const currentUsers = getStoredUsers();
      const updatedUsers = currentUsers.filter((u) => {
        if (targetUserId && u.id === targetUserId) return false;
        if (targetNickname && u.nickname?.toLowerCase() === targetNickname.toLowerCase()) return false;
        if (targetEmail && u.studentEmail?.toLowerCase() === targetEmail.toLowerCase()) return false;
        return true;
      });
      saveStoredUsers(updatedUsers);

      // 3. Purge user completely from Firestore collections (users, verifications, posts, comments, marketplace, etc.)
      await deleteUserFromFirestore(targetUserId, targetNickname, targetEmail);

      // 4. Push removal to central server DB
      pushServerDbSync({
        users: updatedUsers,
        replaceUsers: true,
        deletedUserIds: targetUserId ? [targetUserId] : [],
        deletedUserNicknames: targetNickname ? [targetNickname] : [],
      } as any).catch((err) => console.error('Error syncing user deletion to server:', err));

      // 5. Clean local state for posts and comments by this user
      const cleanNick = targetNickname.toLowerCase().replace(/^@/, '');
      setPosts((prev) =>
        prev.filter((p) => {
          const pNick = (p.authorNickname || '').toLowerCase().replace(/^@/, '');
          return pNick !== cleanNick;
        })
      );
      setComments((prev) =>
        prev.filter((c) => {
          const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '');
          return cNick !== cleanNick;
        })
      );

      // 6. Clear local active user session
      try {
        localStorage.removeItem('fuhsi_active_user');
      } catch (e) {
        console.error(e);
      }

      // 7. Reset state to logged-out initial profile
      setUserProfile(INITIAL_USER_PROFILE);
      setIsLoggedIn(false);
      setShowProfileModal(false);
      closeModalUI();

      // 8. Open Auth modal
      setShowAuthModal(true);
    } catch (err) {
      console.error('Error deleting account:', err);
      throw err;
    }
  };

  // Handlers for Marketplace
  const handleSubmitMarketplaceItem = async (itemData: {
    title: string;
    category: string;
    askingPrice: number;
    conditionTag: string;
    description: string;
    sellerPhone: string;
    meetupPoint: string;
    imageUrls: string[];
    isHousing?: boolean;
    propertyLocation?: string;
    rentDuration?: string;
    roomType?: string;
  }) => {
    const newItem: MarketplaceItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: itemData.title,
      category: itemData.category,
      sellerNickname: userProfile.nickname || 'Student',
      sellerPhone: itemData.sellerPhone,
      askingPrice: itemData.askingPrice,
      adminApprovedPrice: itemData.askingPrice,
      conditionTag: itemData.conditionTag,
      description: itemData.description,
      meetupPoint: itemData.meetupPoint,
      imageUrls: itemData.imageUrls,
      isHousing: itemData.isHousing,
      propertyLocation: itemData.propertyLocation,
      rentDuration: itemData.rentDuration,
      roomType: itemData.roomType,
      viewCount: 1,
      status: 'APPROVED',
      createdAt: new Date().toISOString(),
      buyerDmIntentsCount: 0,
    };

    // 1. Immediately insert into approved marketplace items state & local storage
    setMarketplaceItems((prev) => {
      const updated = [newItem, ...prev.filter((i) => i.id !== newItem.id)];
      try {
        localStorage.setItem('fuhsi_marketplace_approved_db', JSON.stringify(updated));
        localStorage.setItem('fuhsi_marketplace_db', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // 2. Persist directly to Cloud Firestore
    saveMarketplaceApprovedToFirestore(newItem).catch((err) =>
      console.error('Error saving new marketplace item to Firestore:', err)
    );

    // 3. Sync to central server db
    try {
      pushServerDbSync({ marketplaceItems: [newItem] });
    } catch (e) {
      console.error('Error syncing new marketplace item to server:', e);
    }

    // 4. Notify components and listeners
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_marketplace_updated'));
    }
  };

  const handleRecordDmBuyIntent = (itemId: string) => {
    setMarketplaceItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated = { ...item, buyerDmIntentsCount: (item.buyerDmIntentsCount || 0) + 1, updatedAt: new Date().toISOString() };
          saveMarketplaceApprovedToFirestore(updated).catch(console.error);
          pushServerDbSync({ marketplaceItems: [updated] } as any).catch(console.error);
          return updated;
        }
        return item;
      })
    );
  };

  const handleMarkAsSold = (itemId: string, ratingStars: number, ratingTag: string) => {
    const nowIso = new Date().toISOString();
    setMarketplaceItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const updated: MarketplaceItem = {
            ...item,
            status: 'SOLD',
            soldAt: nowIso,
            sellerRatingStars: ratingStars,
            sellerRatingTag: ratingTag,
            updatedAt: nowIso,
          };
          saveMarketplaceApprovedToFirestore(updated).catch((err) => console.error(err));
          pushServerDbSync({ marketplaceItems: [updated] } as any).catch(console.error);
          return updated;
        }
        return item;
      })
    );
  };

  // Dedicated Centralized Verification Application Handler with Real-time Firestore & Central Server Sync
  const handleSubmitVerification = async (data?: {
    accountType?: 'Student' | 'Executive' | 'Organization' | 'Guest' | string;
    positionTitle?: string;
    matricNumber?: string;
    department?: string;
    level?: string;
    proofDetails?: string;
    paymentRef?: string;
    amountPaid?: number;
    category?: string;
    statement?: string;
  }) => {
    if (!userProfile) return;

    const isGuest = isGuestAccount(userProfile);
    const accountType = data?.accountType || (isGuest ? 'Guest' : 'Student');
    const positionTitle = data?.positionTitle || '';
    const updatedUser: UserProfile = {
      ...userProfile,
      verificationStatus: 'pending',
    };
    setUserProfile(updatedUser);
    try {
      localStorage.setItem('fuhsi_active_user', JSON.stringify(updatedUser));
      const storedUsers = localStorage.getItem('fuhsi_users_db');
      let list: UserProfile[] = storedUsers ? JSON.parse(storedUsers) : [];
      const idx = list.findIndex(
        (u) => u.id === updatedUser.id || u.nickname?.toLowerCase() === updatedUser.nickname?.toLowerCase()
      );
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...updatedUser };
      } else {
        list.push(updatedUser);
      }
      localStorage.setItem('fuhsi_users_db', JSON.stringify(list));
    } catch (e) {
      console.error(e);
    }

    // Instantly save pending status to Firestore
    saveUserToFirestore(updatedUser).catch((err) => console.error('Error saving user verification status to Firestore:', err));

    const newReq: VerificationRequest = {
      id: `verif_req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      applicantNickname: userProfile.nickname || (isGuest ? 'Guest' : 'Student'),
      applicantFullName: userProfile.realName || userProfile.nickname || (isGuest ? 'Guest' : 'Student'),
      applicantEmail: userProfile.studentEmail || 'N/A',
      applicantPhone: userProfile.emergencyHomePhone || 'N/A',
      department: isGuest ? '' : (userProfile.department || data?.department || 'N/A'),
      level: isGuest ? '' : (userProfile.level || data?.level || 'N/A'),
      category: data?.category || (isGuest ? 'Guest Verification' : `${accountType} Verification`),
      accountType: isGuest ? 'Guest' : accountType,
      positionTitle: isGuest ? '' : positionTitle,
      matricNumber: isGuest ? '' : (userProfile.matricNumber || data?.matricNumber || 'N/A'),
      proofDetails: data?.proofDetails || (isGuest ? 'Guest Account Verification Request' : (positionTitle ? `Position Held: ${positionTitle}` : 'Standard Verification Request')),
      paymentRef: data?.paymentRef || `SQUADCO-9G4DX4-${Math.floor(100000 + Math.random() * 900000)}`,
      amountPaid: data?.amountPaid || 1500,
      statement: data?.statement || (isGuest ? 'Guest Account Verification' : `Category: ${accountType}${positionTitle ? ` | Position: ${positionTitle}` : ''} | Name: ${userProfile.realName || userProfile.nickname || 'Student'} | Dept: ${userProfile.department || 'FUHSI'} (${userProfile.level || 'N/A'})`),
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };

    // 1. Instantly save to Firestore
    await saveVerificationRequestToFirestore(newReq);

    // 2. Update local state and localStorage
    setVerificationRequests((prev) => {
      const updated = [newReq, ...prev.filter((r) => r.id !== newReq.id)];
      try {
        localStorage.setItem('fuhsi_verifications_db', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });

    // 3. Push to central server db sync
    try {
      pushServerDbSync({ verificationRequests: [newReq], users: [updatedUser] });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmitVerificationRequest = (category: string, statement: string) => {
    handleSubmitVerification({ category, statement });
  };

  // Handler for Admin approving or reassigning verification badge and title
  const handleApproveVerification = (
    reqIdOrNick: string,
    badgeType: BadgeType = 'BLUE',
    badgeTitle: string = ''
  ) => {
    const cleanInput = reqIdOrNick.toLowerCase().replace(/^@/, '');
    const assignedTitle = (badgeTitle || '').trim();

    // Find the target applicant nickname
    let targetApplicantNick = reqIdOrNick;
    const existingReq = verificationRequests.find(
      (v) =>
        v.id === reqIdOrNick ||
        (v.applicantNickname || '').toLowerCase().replace(/^@/, '') === cleanInput
    );
    if (existingReq) {
      targetApplicantNick = existingReq.applicantNickname;
    }
    const cleanTarget = targetApplicantNick.toLowerCase().replace(/^@/, '');

    // 1. Update verification requests list
    setVerificationRequests((prev) => {
      const updatedList = prev.map((v) => {
        const isMatch =
          v.id === reqIdOrNick ||
          (v.applicantNickname || '').toLowerCase().replace(/^@/, '') === cleanTarget;
        if (isMatch) {
          const approvedReq: VerificationRequest = {
            ...v,
            status: 'APPROVED' as const,
            assignedBadgeType: badgeType,
            assignedBadgeTitle: assignedTitle,
          };
          saveVerificationRequestToFirestore(approvedReq).catch((err) =>
            console.error('Error saving approved verification to Firestore:', err)
          );
          return approvedReq;
        }
        return v;
      });

      try {
        localStorage.setItem('fuhsi_verifications_db', JSON.stringify(updatedList));
        pushServerDbSync({ verificationRequests: updatedList });
      } catch (e) {}
      return updatedList;
    });

    // 2. Update active user profile if matching
    if (
      userProfile &&
      (userProfile.nickname.toLowerCase() === targetApplicantNick.toLowerCase() ||
        userProfile.nickname.toLowerCase().replace(/^@/, '') === cleanTarget ||
        userProfile.id === targetApplicantNick)
    ) {
      const updated = {
        ...userProfile,
        isVerified: true,
        verificationStatus: 'approved' as const,
        badgeType: badgeType,
        badgeTitle: assignedTitle,
      };
      setUserProfile(updated);
      saveUserToFirestore(updated).catch((err) => console.error(err));
      try {
        localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
      } catch (e) {}
    }

    // 3. Update user in fuhsi_users_db and Firestore
    try {
      const storedUsers = localStorage.getItem('fuhsi_users_db');
      let usersList: UserProfile[] = storedUsers ? JSON.parse(storedUsers) : [];
      let matched = false;
      usersList = usersList.map((u) => {
        const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
        if (uNick === cleanTarget || u.id === targetApplicantNick) {
          matched = true;
          const updatedUserRecord: UserProfile = {
            ...u,
            isVerified: true,
            verificationStatus: 'approved' as const,
            badgeType: badgeType,
            badgeTitle: assignedTitle,
          };
          saveUserToFirestore(updatedUserRecord).catch((err) => console.error(err));
          return updatedUserRecord;
        }
        return u;
      });

      if (!matched && userProfile && userProfile.nickname.toLowerCase().replace(/^@/, '') === cleanTarget) {
        const newUserRecord: UserProfile = {
          ...userProfile,
          isVerified: true,
          verificationStatus: 'approved' as const,
          badgeType: badgeType,
          badgeTitle: assignedTitle,
        };
        usersList.push(newUserRecord);
        saveUserToFirestore(newUserRecord).catch((err) => console.error(err));
      }
      localStorage.setItem('fuhsi_users_db', JSON.stringify(usersList));
      setNotifTrigger((prev) => prev + 1);
      pushServerDbSync({ users: usersList });
    } catch (e) {
      console.error(e);
    }

    // 4. Update all posts in state, localStorage & Firestore
    setPosts((prevPosts) => {
      const updatedPosts = prevPosts.map((p) => {
        const pNick = (p.authorNickname || '').toLowerCase().replace(/^@/, '');
        if (pNick === cleanTarget || p.authorNickname === targetApplicantNick) {
          const updatedPost = {
            ...p,
            isVerified: true,
            authorBadgeType: badgeType,
            authorBadgeTitle: assignedTitle,
            authorIsVerified: true,
          };
          savePostToFirestore(updatedPost).catch((err) => console.error(err));
          return updatedPost;
        }
        return p;
      });
      try {
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
      } catch (e) {}
      return updatedPosts;
    });

    // 5. Update all comments in state, localStorage & Firestore
    setComments((prevComments) => {
      const updatedComments = prevComments.map((c) => {
        const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '');
        if (cNick === cleanTarget || c.authorNickname === targetApplicantNick) {
          const updatedComment = {
            ...c,
            isVerified: true,
            authorIsVerified: true,
            authorBadgeType: badgeType,
            authorBadgeTitle: assignedTitle,
          };
          saveCommentToFirestore(updatedComment).catch((err) => console.error(err));
          return updatedComment;
        }
        return c;
      });
      try {
        localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedComments));
      } catch (e) {}
      return updatedComments;
    });

    // 6. Send in-app notification
    try {
      const notifKey = `fuhsi_user_notifications_${cleanTarget}`;
      const verifNotif = {
        id: `verif_appr_${Date.now()}`,
        type: 'VERIFICATION',
        title: '🎉 Account Verified!',
        message: `Congratulations! Your verification details have been updated. Your profile now displays your verified checkmark badge (${assignedTitle || badgeType}) across FUHSI Connect.`,
        timestamp: 'Just now',
        isRead: false,
      };
      let existingNotifs = [];
      const storedNotifs = localStorage.getItem(notifKey);
      if (storedNotifs) existingNotifs = JSON.parse(storedNotifs);
      localStorage.setItem(notifKey, JSON.stringify([verifNotif, ...existingNotifs]));
    } catch (e) {
      console.error(e);
    }
  };

  // Handler for Admin cancelling or revoking verification badge & title totally
  const handleRevokeVerification = (reqIdOrNick: string) => {
    const cleanInput = reqIdOrNick.toLowerCase().replace(/^@/, '');
    let targetApplicantNick = reqIdOrNick;
    const existingReq = verificationRequests.find(
      (v) =>
        v.id === reqIdOrNick ||
        (v.applicantNickname || '').toLowerCase().replace(/^@/, '') === cleanInput
    );
    if (existingReq) {
      targetApplicantNick = existingReq.applicantNickname;
    }
    const cleanTarget = targetApplicantNick.toLowerCase().replace(/^@/, '');

    // 1. Update verification requests list
    setVerificationRequests((prev) => {
      const updatedList = prev.map((v) => {
        const isMatch =
          v.id === reqIdOrNick ||
          (v.applicantNickname || '').toLowerCase().replace(/^@/, '') === cleanTarget;
        if (isMatch) {
          const revokedReq: VerificationRequest = {
            ...v,
            status: 'REJECTED' as const,
            assignedBadgeType: 'NONE',
            assignedBadgeTitle: '',
          };
          saveVerificationRequestToFirestore(revokedReq).catch((err) =>
            console.error('Error revoking verification in Firestore:', err)
          );
          return revokedReq;
        }
        return v;
      });
      try {
        localStorage.setItem('fuhsi_verifications_db', JSON.stringify(updatedList));
        pushServerDbSync({ verificationRequests: updatedList });
      } catch (e) {}
      return updatedList;
    });

    // 2. Update active user profile if matching
    if (
      userProfile &&
      (userProfile.nickname.toLowerCase() === targetApplicantNick.toLowerCase() ||
        userProfile.nickname.toLowerCase().replace(/^@/, '') === cleanTarget ||
        userProfile.id === targetApplicantNick)
    ) {
      const updatedUser: UserProfile = {
        ...userProfile,
        isVerified: false,
        verificationStatus: 'rejected' as const,
        badgeType: 'NONE' as const,
        badgeTitle: '',
      };
      setUserProfile(updatedUser);
      saveUserToFirestore(updatedUser).catch((err) => console.error(err));
      try {
        localStorage.setItem('fuhsi_active_user', JSON.stringify(updatedUser));
      } catch (e) {}
    }

    // 3. Update user in fuhsi_users_db, allUsers state and Firestore
    try {
      const storedUsers = localStorage.getItem('fuhsi_users_db');
      let usersList: UserProfile[] = storedUsers ? JSON.parse(storedUsers) : [];
      usersList = usersList.map((u) => {
        const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
        if (uNick === cleanTarget || u.id === targetApplicantNick) {
          const updatedRecord: UserProfile = {
            ...u,
            isVerified: false,
            verificationStatus: 'rejected' as const,
            badgeType: 'NONE' as const,
            badgeTitle: '',
          };
          saveUserToFirestore(updatedRecord).catch((err) => console.error(err));
          return updatedRecord;
        }
        return u;
      });
      localStorage.setItem('fuhsi_users_db', JSON.stringify(usersList));
      setNotifTrigger((prev) => prev + 1);
      pushServerDbSync({ users: usersList });
    } catch (e) {
      console.error(e);
    }

    // 4. Update all posts by user in state, localStorage & Firestore
    setPosts((prevPosts) => {
      const updatedPosts = prevPosts.map((p) => {
        const pNick = (p.authorNickname || '').toLowerCase().replace(/^@/, '');
        if (pNick === cleanTarget || p.authorNickname === targetApplicantNick) {
          const updatedPost = {
            ...p,
            isVerified: false,
            authorBadgeType: 'NONE' as const,
            authorBadgeTitle: '',
            authorIsVerified: false,
          };
          savePostToFirestore(updatedPost).catch((err) => console.error(err));
          return updatedPost;
        }
        return p;
      });
      try {
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
      } catch (e) {}
      return updatedPosts;
    });

    // 5. Update all comments by user in state, localStorage & Firestore
    setComments((prevComments) => {
      const updatedComments = prevComments.map((c) => {
        const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '');
        if (cNick === cleanTarget || c.authorNickname === targetApplicantNick) {
          const updatedComment = {
            ...c,
            isVerified: false,
            authorIsVerified: false,
            authorBadgeType: 'NONE' as const,
            authorBadgeTitle: '',
          };
          saveCommentToFirestore(updatedComment).catch((err) => console.error(err));
          return updatedComment;
        }
        return c;
      });
      try {
        localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedComments));
      } catch (e) {}
      return updatedComments;
    });
  };

  // Admin Handlers
  const handleAdminApproveMarketplaceItem = (id: string, approvedPrice: number, note: string) => {
    const item = pendingMarketplaceItems.find((i) => i.id === id);
    if (item) {
      const approvedItem: MarketplaceItem = {
        ...item,
        status: 'APPROVED',
        adminApprovedPrice: approvedPrice,
        adminNote: note,
      };
      setMarketplaceItems((prev) => [approvedItem, ...prev]);
      setPendingMarketplaceItems((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const handleAdminRejectMarketplaceItem = (id: string, note: string) => {
    setPendingMarketplaceItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleDeleteMarketplaceItem = (id: string) => {
    if (!id) return;

    // Track permanently deleted ID so it can never resurrect across reloads or device syncs
    try {
      const dStr = localStorage.getItem('fuhsi_deleted_marketplace_ids');
      const deletedIds: string[] = dStr ? JSON.parse(dStr) : [];
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('fuhsi_deleted_marketplace_ids', JSON.stringify(deletedIds));
      }
    } catch (e) {}

    let updatedApproved: MarketplaceItem[] = [];
    setMarketplaceItems((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      updatedApproved = updated;
      try {
        localStorage.setItem('fuhsi_marketplace_db', JSON.stringify(updated));
        localStorage.setItem('fuhsi_marketplace_approved_db', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    let updatedPendingList: MarketplaceItem[] = [];
    setPendingMarketplaceItems((prev) => {
      const updatedPending = prev.filter((i) => i.id !== id);
      updatedPendingList = updatedPending;
      try {
        localStorage.setItem('fuhsi_pending_marketplace_db', JSON.stringify(updatedPending));
        localStorage.setItem('fuhsi_marketplace_pending_db', JSON.stringify(updatedPending));
      } catch (e) {}
      return updatedPending;
    });

    // Sync to Server DB (replace flag ensures server purges it immediately)
    pushServerDbSync({
      marketplaceItems: updatedApproved,
      replaceMarketplaceItems: true,
      pendingMarketplaceItems: updatedPendingList,
      replacePendingMarketplaceItems: true,
    } as any);

    // Permanently remove from Cloud Firestore (both approved & pending collections)
    deleteMarketplaceApprovedFromFirestore(id).catch((err) => console.error('Error deleting marketplace item from Firestore:', err));

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_marketplace_item_deleted', { detail: id }));
      window.dispatchEvent(new CustomEvent('fuhsi_marketplace_updated'));
    }
  };

  const handleSaveUserProfile = (
    nickname: string,
    department: string,
    level: string,
    bio: string,
    avatarKey: string,
    emergencyPhone: string,
    avatarUrl?: string,
    realName?: string,
    studentEmail?: string
  ): string | null => {
    if (!userProfile) return 'Error: No active user profile.';

    const rawNick = nickname.trim();
    const lowerNick = rawNick.toLowerCase();
    if (lowerNick.includes('anonymous') || lowerNick.includes('anon')) {
      return 'Error: Nicknames containing "Anonymous" or "Anon" are forbidden. Please choose a unique student handle.';
    }

    const formattedNick = rawNick.startsWith('@') ? rawNick : `@${rawNick}`;

    // Verify nickname is not already used by another account
    const cleanNewNick = formattedNick.toLowerCase().replace(/^@/, '');
    const currentNickClean = (userProfile.nickname || '').toLowerCase().replace(/^@/, '');
    if (cleanNewNick !== currentNickClean) {
      const storedUsers = getStoredUsers();
      const existing = storedUsers.find(
        (u) =>
          u.id !== userProfile.id &&
          (u.nickname || '').toLowerCase().replace(/^@/, '') === cleanNewNick
      );
      if (existing) {
        return `Error: The handle "${formattedNick}" is already taken by another student. Please choose a different username.`;
      }
    }

    const newAvatarUrl = avatarUrl !== undefined ? avatarUrl : userProfile.avatarUrl;
    const newAvatarKey = avatarKey || userProfile.avatarKey || 'caduceus';

    const updated: UserProfile = sanitizeModulaProfile({
      ...userProfile,
      nickname: formattedNick,
      realName: realName !== undefined ? realName.trim() : userProfile.realName,
      realNameHidden: realName !== undefined ? realName.trim() : userProfile.realNameHidden,
      studentEmail: studentEmail !== undefined ? studentEmail.trim() : userProfile.studentEmail,
      emergencyHomePhone: emergencyPhone !== undefined ? emergencyPhone.trim() : userProfile.emergencyHomePhone,
      // Department and Matric Number for students; empty for @modula
      department: isModulaAccount(userProfile) ? '' : (department || userProfile.department || ''),
      matricNumber: isModulaAccount(userProfile) ? '' : userProfile.matricNumber,
      level: isModulaAccount(userProfile) ? '' : (level || userProfile.level || ''),
      accountType: isModulaAccount(userProfile) ? 'Admin' : userProfile.accountType,
      bio: bio !== undefined ? bio.trim() : userProfile.bio,
      avatarKey: newAvatarKey,
      avatarUrl: newAvatarUrl,
      updatedAt: new Date().toISOString(),
    });

    // Mark recent save timestamp to shield local state against stale race-condition server syncs
    lastProfileSaveTimestampRef.current = Date.now();

    // 1. Update React state
    setUserProfile(updated);

    // 2. Persist active user to localStorage
    try {
      localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
    } catch (e) {
      console.error('Error persisting active user:', e);
    }

    // 3. Persist to database (localStorage, Firestore, and server DB)
    try {
      upsertUser(updated);
      saveUserToFirestore(updated).catch((err) => {
        console.error('Error persisting user to Firestore:', err);
      });
      uploadAvatarToServer(updated.id, updated.nickname, newAvatarUrl || '').catch((err) => {
        console.error('Error uploading avatar to central server storage:', err);
      });
      pushServerDbSync({ users: [updated] }).catch((err) => {
        console.error('Error syncing user profile to server DB:', err);
      });
    } catch (e) {
      console.error('Error persisting user profile update:', e);
    }

    // 4. Propagate updated avatar and nickname across existing user posts and comments
    const oldNick = currentNickClean;
    const newNick = cleanNewNick;

    setPosts((prev) => {
      const updatedPosts = prev.map((p) => {
        const pNick = (p.authorNickname || p.nickname || '').toLowerCase().replace(/^@/, '');
        if (pNick === oldNick || pNick === newNick) {
          const updatedPost = {
            ...p,
            authorNickname: formattedNick,
            authorAvatarKey: newAvatarKey,
            authorAvatarUrl: newAvatarUrl,
          };
          savePostToFirestore(updatedPost).catch(console.error);
          return updatedPost;
        }
        return p;
      });
      try {
        localStorage.setItem('fuhsi_posts_db', JSON.stringify(updatedPosts));
        pushServerDbSync({ posts: updatedPosts, replacePosts: true } as any).catch(console.error);
      } catch (e) {}
      return updatedPosts;
    });

    setComments((prev) => {
      const updatedComments = prev.map((c) => {
        const cNick = (c.authorNickname || '').toLowerCase().replace(/^@/, '');
        if (cNick === oldNick || cNick === newNick) {
          const updatedComment = {
            ...c,
            authorNickname: formattedNick,
            authorAvatarKey: newAvatarKey,
            authorAvatarUrl: newAvatarUrl,
          };
          saveCommentToFirestore(updatedComment).catch(console.error);
          return updatedComment;
        }
        return c;
      });
      try {
        localStorage.setItem('fuhsi_comments_db', JSON.stringify(updatedComments));
        pushServerDbSync({ comments: updatedComments, replaceComments: true } as any).catch(console.error);
      } catch (e) {}
      return updatedComments;
    });

    // 5. Broadcast profile updated event
    try {
      window.dispatchEvent(new CustomEvent('fuhsi_profile_updated', { detail: updated }));
    } catch (e) {}

    return null;
  };

  const handleUpdatePrivacySettings = useCallback((isPrivate: boolean, defaultPostAudience: 'everyone' | 'followers') => {
    if (!userProfile) return;
    const updated: UserProfile = sanitizeModulaProfile({
      ...userProfile,
      isPrivate,
      defaultPostAudience,
      updatedAt: new Date().toISOString(),
    });

    setUserProfile(updated);

    try {
      localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
    } catch (e) {
      console.error('Error persisting active user privacy:', e);
    }

    try {
      upsertUser(updated);
      saveUserToFirestore(updated).catch((err) => {
        console.error('Error persisting user privacy to Firestore:', err);
      });
      pushServerDbSync({ users: [updated] }).catch((err) => {
        console.error('Error syncing user privacy to server DB:', err);
      });
    } catch (e) {
      console.error('Error updating user privacy settings:', e);
    }

    try {
      window.dispatchEvent(new CustomEvent('fuhsi_profile_updated', { detail: updated }));
    } catch (e) {}
  }, [userProfile]);

  // Memoized all stored registered users for follower profile information
  const allUsers = useMemo(() => {
    return getStoredUsers();
  }, [appTotalMembers, notifTrigger]);

  // Real-time Follow / Unfollow Handler (Syncs locally, Firestore and Server DB)
  const handleToggleFollow = useCallback((targetNickname: string) => {
    if (!userProfile?.nickname) return;
    const { updatedFollows, isNowFollowing, docId } = toggleFollowState(
      userProfile.nickname,
      targetNickname,
      allFollows
    );

    setAllFollows(updatedFollows);
    saveStoredFollows(updatedFollows);
    pushServerDbSync({ follows: updatedFollows, replaceFollows: true } as any);

    if (isNowFollowing) {
      const record = updatedFollows.find((f) => f.id === docId);
      if (record) {
        saveFollowToFirestore(record).catch(console.error);
      }
      // Record aggregated follower notification for the target user (applies to both Student and Guest)
      try {
        const notif = recordFollowNotification(userProfile.nickname, targetNickname);
        if (notif) {
          const cleanTarget = targetNickname.toLowerCase().replace(/^@/, '');
          const notifsKey = `fuhsi_user_notifications_${cleanTarget}`;
          const currentTargetNotifs = JSON.parse(localStorage.getItem(notifsKey) || '[]');
          pushServerDbSync({
            notifications: {
              [cleanTarget]: currentTargetNotifs,
            },
          } as any);
        }
      } catch (err) {
        console.error('Error recording follow notification:', err);
      }
    } else {
      deleteFollowFromFirestore(docId).catch(console.error);
    }
  }, [userProfile?.nickname, allFollows]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-2 sm:p-4">
        <AuthModal
          isOpen={true}
          canClose={true}
          onClose={() => {
            // Seamlessly allow exploring campus as guest if dismissed
            const guestUser: UserProfile = {
              id: `usr_guest_${Date.now()}`,
              nickname: `@Guest_${Math.floor(100 + Math.random() * 900)}`,
              accountType: 'Guest',
              realName: 'Campus Guest',
              studentEmail: '',
              department: 'General Campus',
              level: 'Guest',
              bio: 'Exploring FUHSI Connect campus network as guest.',
              avatarKey: 'caduceus',
              badgeType: 'NONE',
              badgeTitle: 'Guest',
              reputationScore: 10,
              isVerified: false,
              isApproved: true,
              isAdmin: false,
            };
            setUserProfile(guestUser);
            setIsLoggedIn(true);
            setShowAuthModal(false);
            try {
              localStorage.setItem('fuhsi_active_user', JSON.stringify(guestUser));
              upsertUser(guestUser);
            } catch {}
          }}
          onLoginSuccess={(user) => {
            setUserProfile(user);
            setIsLoggedIn(true);
            setShowAuthModal(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-['Plus_Jakarta_Sans',sans-serif] flex flex-col justify-between selection:bg-teal-500 selection:text-white">
      {/* Top App Header with Twitter-style Profile Picture Avatar on Left */}
      <header className="sticky top-0 z-30 bg-teal-800 text-white shadow-xs border-b border-teal-900/40">
        <div className="max-w-2xl mx-auto px-3.5 py-2 flex items-center justify-between">
          {/* Top-Left Profile Picture Avatar Trigger (Twitter Style) */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={openProfileModal}
              className="group relative flex items-center gap-2 p-1 rounded-full hover:bg-teal-700/80 transform-gpu transition-all duration-200 hover:scale-105 active:scale-95 text-left focus:outline-none focus:ring-2 focus:ring-teal-400/50 cursor-pointer"
              title="Click to check your Student Profile"
            >
              <div className="relative">
                <AvatarIcon
                  avatarKey={userProfile?.avatarKey || '1'}
                  avatarUrl={userProfile?.avatarUrl}
                  className="w-9 h-9 rounded-full ring-2 ring-teal-300/60 shadow-xs group-hover:scale-105 transition-transform"
                />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 border-2 border-teal-800 rounded-full" />
              </div>
              <div className="hidden sm:block leading-tight">
                <h2 className="font-extrabold text-xs text-white group-hover:text-teal-100 flex items-center gap-1">
                  <span>{userProfile?.nickname || '@Student'}</span>
                  <VerificationBadge
                    isVerified={Boolean(userProfile?.isVerified || userProfile?.verificationStatus === 'approved')}
                    badgeType={userProfile?.badgeType}
                    title={userProfile?.badgeTitle}
                    size={13}
                  />
                </h2>
                <p className="text-[10px] text-teal-200/90 font-medium">
                  {isModulaAccount(userProfile)
                    ? 'Check Profile'
                    : isGuestAccount(userProfile)
                    ? 'Guest • Check Profile'
                    : `${userProfile?.department || 'FUHSI'} • Check Profile`}
                </p>
              </div>
            </button>
          </div>

          {/* App Title & Logo */}
          <div
            onClick={() => handleNavChange(0)}
            className="flex items-center gap-2 cursor-pointer select-none py-0.5 transform-gpu transition-all duration-200 hover:scale-105 active:scale-95"
            title="FUHSI-Connect Campus Network"
          >
            <img
              src={fuhsiLogo}
              alt="FUHSI Connect Logo"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border-2 border-teal-300/60 shadow-xs transition-transform"
            />
            <div className="text-left leading-tight">
              <h1 className="font-black text-xs sm:text-sm tracking-tight text-white flex items-center gap-1">
                <span>FUHSI-Connect</span>
              </h1>
              <p className="text-[9px] text-teal-200/90 font-semibold tracking-wide">Campus Network</p>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2">
            {/* Dark/Light Mode Quick Toggle Button */}
            <button
              onClick={toggleQuickTheme}
              className="p-1.5 sm:p-2 rounded-full bg-teal-800/80 hover:bg-teal-700/90 border border-teal-600/50 text-amber-300 transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 shadow-xs flex items-center justify-center cursor-pointer"
              title="Toggle Low-Light Campus Mode (Dark/Light Theme)"
            >
              {typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? (
                <Sun size={16} className="text-amber-300 animate-spin-slow" />
              ) : (
                <Moon size={16} className="text-sky-200" />
              )}
            </button>

            {/* Live Total Registered Members Indicator Badge (Non-clickable community size indicator) */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-900/80 border border-teal-600/50 text-teal-100 text-xs font-black select-none pointer-events-none cursor-default"
              title="Total Approved Registered FUHSI Connect Members"
            >
              <Users size={13} className="text-teal-300 shrink-0" />
              <span>{appTotalMembers}</span>
            </div>

            {userProfile?.isAdmin && (
              <button
                onClick={() => handleNavChange(6)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all shadow-sm ${
                  navIndex === 6
                    ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-300'
                    : 'bg-amber-500/90 hover:bg-amber-400 text-slate-950'
                }`}
                title="Open FUHSI Moderation Council Portal"
              >
                <Shield size={14} className="fill-slate-900 shrink-0" />
                <span>Admin Console</span>
              </button>
            )}

            <button
              onClick={openPwaModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-700/80 hover:bg-teal-700 text-teal-100 hover:text-white border border-teal-500/40 text-xs font-bold transition-all shadow-xs"
            >
              <Smartphone size={14} className="text-teal-300" />
              <span className="hidden sm:inline">Install</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Screen Body */}
      <main className="flex-1 pb-20">
        {navIndex === 0 && (
          <FeedScreen
            posts={posts}
            userProfile={userProfile}
            allFollows={allFollows}
            selectedFilter={selectedFilter}
            onFilterSelect={setSelectedFilter}
            onLikeClick={handleLikeClick}
            onBookmarkClick={handleBookmarkClick}
            onCommentClick={openPostDetail}
            onDeletePost={handleDeletePost}
            onEditPost={handleEditPost}
            onAuthorClick={openAuthorProfile}
            onVotePoll={handleVotePoll}
            onReportPost={handleReportPost}
            onCreatePostClick={openCreatePostModal}
          />
        )}

        {navIndex === 1 && (
          <SearchScreen
            userProfile={userProfile}
            posts={posts}
            marketplaceItems={marketplaceItems}
            currentUserNickname={userProfile?.nickname}
            onSelectPost={openPostDetail}
            onLikeClick={handleLikeClick}
            onBookmarkClick={handleBookmarkClick}
            onCommentClick={openPostDetail}
            onAuthorClick={openAuthorProfile}
            onEditPost={handleEditPost}
            onDeletePost={handleDeletePost}
          />
        )}

        {navIndex === 2 && !isGuestAccount(userProfile) && (
          <CampusHubScreen
            userProfile={userProfile}
            approvedMarketplaceItems={marketplaceItems}
            pendingMarketplaceItems={pendingMarketplaceItems}
            onSubmitMarketplaceItem={handleSubmitMarketplaceItem}
            onRecordDmBuyIntent={handleRecordDmBuyIntent}
            onMarkAsSold={handleMarkAsSold}
            onDeleteMarketplaceItem={handleDeleteMarketplaceItem}
            onAuthorClick={openAuthorProfile}
            onOpenAdminConsole={() => handleNavChange(6)}
            onApplyVerificationWithFee={() =>
              handleSubmitVerificationRequest(
                'Verification Review Fee Paid (₦1,500)',
                'Applicant paid the ₦1,500 review processing fee and submitted credentials for admin verification.'
              )
            }
          />
        )}

        {navIndex === 3 && (
          <NotificationScreen
            userProfile={userProfile}
            allPosts={posts}
            onSelectPost={openPostDetail}
            onOpenTradeChat={(_convId) => {
              if (!isGuestAccount(userProfile)) {
                handleNavChange(4);
              }
            }}
            onOpenFollowersDirectory={openFollowersDirectory}
          />
        )}

        {navIndex === 4 && !isGuestAccount(userProfile) && (
          <ChatsScreen
            userProfile={userProfile}
            initialRecipient={activeChatRecipient}
            onClearInitialRecipient={() => setActiveChatRecipient(null)}
            onOpenProfile={(nickname: string) => {
              const dummyPost: Post = {
                id: `chat_author_${nickname}`,
                authorNickname: nickname,
                authorAvatarKey: 'caduceus',
                authorBadgeType: 'NONE',
                authorBadgeTitle: '',
                authorPoints: 0,
                timeAgo: '',
                category: 'General',
                categoryTag: 'General',
                content: '',
                text: '',
                timestamp: new Date().toISOString(),
                likesCount: 0,
                commentsCount: 0,
                isQuarantined: false,
                createdAt: '',
              };
              openAuthorProfile(dummyPost);
            }}
            allUsers={getStoredUsers()}
          />
        )}

        {navIndex === 5 && (
          <LeaderboardScreen
            userProfile={userProfile}
            activePosts={posts}
            onAuthorClick={openAuthorProfile}
            onSubmitVerificationRequest={handleSubmitVerificationRequest}
          />
        )}

        {navIndex === 6 && (
          userProfile?.isAdmin ? (
            <ModerationScreen
              userProfile={userProfile}
              flaggedPosts={posts.filter((p) => p.isQuarantined)}
              reports={reports}
              approvedMarketplaceItems={marketplaceItems}
              pendingMarketplaceItems={pendingMarketplaceItems}
              verificationRequests={verificationRequests}
              onAdminApproveMarketplaceItem={handleAdminApproveMarketplaceItem}
              onAdminRejectMarketplaceItem={handleAdminRejectMarketplaceItem}
              onDeleteMarketplaceItem={handleDeleteMarketplaceItem}
              onResolveReport={(repId: string) => setReports((prev) => prev.filter((r) => r.id !== repId))}
              onApproveVerification={handleApproveVerification}
              onRejectVerification={handleRevokeVerification}
              onRevokeVerification={handleRevokeVerification}
              onDeletePost={(postId) => setPosts((prev) => prev.filter((p) => p.id !== postId))}
            onUpdateBadge={(badgeType, badgeTitle) => {
              if (userProfile) {
                const updated = { ...userProfile, isVerified: true, verificationStatus: 'approved' as const, badgeType: badgeType || 'BLUE', badgeTitle: (badgeTitle || '').trim() };
                setUserProfile(updated);
                localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
              }
            }}
            onUpdateReputationScore={(newScore) => {
              if (userProfile) {
                const updated = { ...userProfile, reputationScore: newScore };
                setUserProfile(updated);
                localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
              }
            }}
          />
        ) : (
          <div className="max-w-md mx-auto my-12 p-6 bg-white rounded-2xl border border-rose-200 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto font-bold text-2xl">
              🛡️
            </div>
            <h2 className="text-lg font-extrabold text-slate-900">Access Restricted</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              This management console is restricted to authorized personnel. Please return to the campus feed.
            </p>
            <button
              onClick={() => setNavIndex(0)}
              className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs hover:bg-slate-800 transition-colors cursor-pointer shadow-md"
            >
              Return to Public Campus Feed
            </button>
          </div>
        )
      )}
      </main>

      {/* Stack-Based Modals Layer */}
      {modalStack.length > 0 ? (
        modalStack.map((item, idx) => {
          const stackZIndex = 70 + idx * 10;
          if (item.type === 'postDetail') {
            return (
              <PostDetailModal
                key={`modal_post_${item.post.id}_${idx}`}
                post={item.post}
                comments={(comments || []).filter((c) => c && c.postId === item.post.id)}
                userProfile={userProfile}
                zIndex={stackZIndex}
                onClose={closeModalUI}
                onAddComment={(text, parentId, replyToNickname, imageUrl) =>
                  handleAddComment(item.post.id, text, parentId, replyToNickname, imageUrl)
                }
                onLikeComment={handleLikeComment}
                onToggleLike={handleLikeClick}
                onToggleBookmark={handleBookmarkClick}
                onDeletePost={handleDeletePost}
                onEditPost={handleEditPost}
                onDeleteComment={handleDeleteComment}
                onVotePoll={handleVotePoll}
                onAuthorClick={(author) => {
                  const dummyPost: Post = {
                    id: `author_${author.nickname}`,
                    authorNickname: author.nickname,
                    authorAvatarKey: author.avatarKey || 'caduceus',
                    authorAvatarUrl: author.avatarUrl,
                    authorBadgeType: (author.badgeType as any) || 'NONE',
                    authorBadgeTitle: author.badgeTitle || '',
                    authorPoints: 0,
                    timeAgo: '',
                    category: 'General',
                    categoryTag: 'General',
                    content: '',
                    text: '',
                    timestamp: new Date().toISOString(),
                    likesCount: 0,
                    commentsCount: 0,
                    isQuarantined: false,
                    createdAt: '',
                  };
                  openAuthorProfile(dummyPost);
                }}
              />
            );
          }

          if (item.type === 'authorProfile') {
            return (
              <AuthorProfileModal
                key={`modal_author_${item.post.id || item.post.authorNickname}_${idx}`}
                authorNickname={item.post.authorNickname || (item.post as any).nickname || 'Student'}
                authorAvatarKey={item.post.authorAvatarKey || 'caduceus'}
                authorAvatarUrl={item.post.authorAvatarUrl}
                authorBadgeType={item.post.authorBadgeType as BadgeType}
                authorBadgeTitle={item.post.authorBadgeTitle}
                authorPoints={item.post.authorPoints}
                authorJoinedDate={formatJoinDate(allUsers.find((u) => (u.nickname || '').toLowerCase().replace(/^@/, '') === (item.post.authorNickname || '').toLowerCase().replace(/^@/, '')))}
                currentUserNickname={userProfile?.nickname || ''}
                userProfile={userProfile}
                allPosts={posts}
                allComments={comments}
                allFollows={allFollows}
                allUsers={allUsers}
                zIndex={stackZIndex}
                onClose={closeModalUI}
                onLikeClick={handleLikeClick}
                onBookmarkClick={handleBookmarkClick}
                onDeletePost={handleDeletePost}
                onEditPost={handleEditPost}
                onAuthorClick={openAuthorProfile}
                onCommentClick={openPostDetail}
                onToggleFollow={handleToggleFollow}
                onStartChat={(recipientNickname, avatarKey, avatarUrl) => {
                  handleStartChat(recipientNickname, avatarKey, avatarUrl);
                }}
              />
            );
          }

          if (item.type === 'profile') {
            return (
              <div
                key={`modal_profile_${idx}`}
                className="fixed inset-0 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150"
                style={{ zIndex: stackZIndex }}
              >
                <div className="w-full h-full max-w-3xl mx-auto bg-slate-50 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
                  <div className="sticky top-0 z-10 bg-teal-800 text-white p-3.5 sm:px-6 flex items-center justify-between border-b border-teal-900/40 shrink-0">
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={closeModalUI}
                        className="p-1.5 -ml-1.5 rounded-xl bg-teal-900/60 hover:bg-teal-900 text-teal-100 hover:text-white transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                        title="Return to previous page"
                      >
                        <ArrowLeft size={18} />
                        <span>Back</span>
                      </button>
                      <div className="h-4 w-px bg-teal-700/60 mx-1" />
                      <AvatarIcon avatarKey={userProfile?.avatarKey || 'caduceus'} avatarUrl={userProfile?.avatarUrl} className="w-8 h-8 rounded-full border border-teal-300" />
                      <div>
                        <h2 className="font-extrabold text-xs sm:text-sm text-white">Student Profile</h2>
                        <p className="text-[10px] text-teal-200">FUHSI Ila-Orangun Student Account</p>
                      </div>
                    </div>
                    <button
                      onClick={closeModalUI}
                      className="p-2 rounded-full bg-teal-900/60 hover:bg-teal-900 text-teal-200 hover:text-white transition-colors cursor-pointer"
                      title="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                    <ProfileScreen
                      userProfile={userProfile}
                      allPosts={posts}
                      allComments={comments}
                      allFollows={allFollows}
                      allUsers={allUsers}
                      bookmarkedPostIds={myBookmarkedPostIds}
                      onSaveProfile={(nickname, department, level, bio, avatarKey, emergencyPhone, avatarUrl, realName, studentEmail) => {
                        return handleSaveUserProfile(nickname, department, level, bio, avatarKey, emergencyPhone, avatarUrl, realName, studentEmail);
                      }}
                      onSubmitVerification={handleSubmitVerification}
                      onOpenAuthModal={() => {
                        closeModalUI();
                        openAuthModal();
                      }}
                      onLogout={handleLogout}
                      onDeleteAccount={handleDeleteAccount}
                      onLikeClick={handleLikeClick}
                      onBookmarkClick={handleBookmarkClick}
                      onCommentClick={openPostDetail}
                      onAuthorClick={openAuthorProfile}
                      onDeletePost={handleDeletePost}
                      onEditPost={handleEditPost}
                      onDeleteComment={handleDeleteComment}
                      onToggleFollow={handleToggleFollow}
                      onUpdatePrivacySettings={handleUpdatePrivacySettings}
                      onClose={closeModalUI}
                    />
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'createPost') {
            return (
              <CreatePostModal
                key={`modal_createPost_${idx}`}
                userProfile={userProfile}
                onClose={closeModalUI}
                onSubmit={handleCreatePost}
                onOpenVerification={(data) => {
                  if (userProfile) {
                    const updated = {
                      ...userProfile,
                      verificationStatus: 'pending' as const,
                    };
                    setUserProfile(updated);
                    localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
                  }
                }}
              />
            );
          }

          if (item.type === 'auth') {
            return (
              <AuthModal
                key={`modal_auth_${idx}`}
                isOpen={true}
                onClose={closeModalUI}
                onLoginSuccess={(user) => {
                  setUserProfile(user);
                  closeModalUI();
                }}
              />
            );
          }

          if (item.type === 'pwa') {
            return (
              <PWAInstallModal
                key={`modal_pwa_${idx}`}
                isOpen={true}
                onClose={closeModalUI}
              />
            );
          }

          return null;
        })
      ) : (
        <>
          {/* Profile Modal / Drawer (Triggered by Top-Left Profile Picture Avatar) */}
          {showProfileModal && (
            <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-150">
              <div className="w-full h-full max-w-3xl mx-auto bg-slate-50 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 overflow-hidden">
                <div className="sticky top-0 z-10 bg-teal-800 text-white p-3.5 sm:px-6 flex items-center justify-between border-b border-teal-900/40 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={closeModalUI}
                      className="p-1.5 -ml-1.5 rounded-xl bg-teal-900/60 hover:bg-teal-900 text-teal-100 hover:text-white transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to previous page"
                    >
                      <ArrowLeft size={18} />
                      <span>Back</span>
                    </button>
                    <div className="h-4 w-px bg-teal-700/60 mx-1" />
                    <AvatarIcon avatarKey={userProfile?.avatarKey || 'caduceus'} avatarUrl={userProfile?.avatarUrl} className="w-8 h-8 rounded-full border border-teal-300" />
                    <div>
                      <h2 className="font-extrabold text-xs sm:text-sm text-white">Student Profile</h2>
                      <p className="text-[10px] text-teal-200">FUHSI Ila-Orangun Student Account</p>
                    </div>
                  </div>
                  <button
                    onClick={closeModalUI}
                    className="p-2 rounded-full bg-teal-900/60 hover:bg-teal-900 text-teal-200 hover:text-white transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                  <ProfileScreen
                    userProfile={userProfile}
                    allPosts={posts}
                    allComments={comments}
                    allFollows={allFollows}
                    allUsers={allUsers}
                    bookmarkedPostIds={myBookmarkedPostIds}
                    onSaveProfile={(nickname, department, level, bio, avatarKey, emergencyPhone, avatarUrl, realName, studentEmail) => {
                      return handleSaveUserProfile(nickname, department, level, bio, avatarKey, emergencyPhone, avatarUrl, realName, studentEmail);
                    }}
                    onSubmitVerification={handleSubmitVerification}
                    onOpenAuthModal={() => {
                      closeModalUI();
                      openAuthModal();
                    }}
                    onLogout={handleLogout}
                    onDeleteAccount={handleDeleteAccount}
                    onLikeClick={handleLikeClick}
                    onBookmarkClick={handleBookmarkClick}
                    onCommentClick={openPostDetail}
                    onAuthorClick={openAuthorProfile}
                    onDeletePost={handleDeletePost}
                    onEditPost={handleEditPost}
                    onDeleteComment={handleDeleteComment}
                    onToggleFollow={handleToggleFollow}
                    onUpdatePrivacySettings={handleUpdatePrivacySettings}
                    onClose={closeModalUI}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Author Profile Details Modal (When clicking author name or avatar) */}
          {selectedAuthorPost && (
            <AuthorProfileModal
              authorNickname={selectedAuthorPost.authorNickname || selectedAuthorPost.nickname || 'Student'}
              authorAvatarKey={selectedAuthorPost.authorAvatarKey || 'caduceus'}
              authorAvatarUrl={selectedAuthorPost.authorAvatarUrl}
              authorBadgeType={selectedAuthorPost.authorBadgeType as BadgeType}
              authorBadgeTitle={selectedAuthorPost.authorBadgeTitle}
              authorPoints={selectedAuthorPost.authorPoints}
              authorJoinedDate={formatJoinDate(allUsers.find((u) => (u.nickname || '').toLowerCase().replace(/^@/, '') === (selectedAuthorPost.authorNickname || selectedAuthorPost.nickname || '').toLowerCase().replace(/^@/, '')))}
              currentUserNickname={userProfile?.nickname || ''}
              userProfile={userProfile}
              allPosts={posts}
              allComments={comments}
              allFollows={allFollows}
              allUsers={allUsers}
              zIndex={70}
              onClose={closeModalUI}
              onLikeClick={handleLikeClick}
              onBookmarkClick={handleBookmarkClick}
              onDeletePost={handleDeletePost}
              onAuthorClick={openAuthorProfile}
              onCommentClick={openPostDetail}
              onToggleFollow={handleToggleFollow}
              onStartChat={(recipientNickname, avatarKey, avatarUrl) => {
                handleStartChat(recipientNickname, avatarKey, avatarUrl);
              }}
            />
          )}

          {/* Followers / Connections Directory Modal */}
          {showFollowersDirectoryModal && userProfile && (
            <FollowersListModal
              targetNickname={userProfile.nickname}
              initialTab="followers"
              allFollows={allFollows}
              allUsers={allUsers}
              currentUserNickname={userProfile.nickname}
              onToggleFollow={handleToggleFollow}
              onSelectUser={(selectedNick) => {
                closeModalUI();
                const dummyPost: Post = {
                  id: `author_${selectedNick}`,
                  authorNickname: selectedNick,
                  authorAvatarKey: 'caduceus',
                  authorBadgeType: 'NONE' as any,
                  authorBadgeTitle: '',
                  authorPoints: 0,
                  timeAgo: '',
                  category: 'General',
                  categoryTag: 'General',
                  content: '',
                  text: '',
                  timestamp: new Date().toISOString(),
                  likesCount: 0,
                  commentsCount: 0,
                  isQuarantined: false,
                  createdAt: '',
                };
                openAuthorProfile(dummyPost);
              }}
              onClose={closeModalUI}
            />
          )}

          {/* Post Details Modal */}
          {selectedPost && (
            <PostDetailModal
              post={selectedPost}
              comments={(comments || []).filter((c) => c && c.postId === selectedPost.id)}
              userProfile={userProfile}
              zIndex={85}
              onClose={closeModalUI}
              onAddComment={(text, parentId, replyToNickname, imageUrl) => handleAddComment(selectedPost.id, text, parentId, replyToNickname, imageUrl)}
              onLikeComment={handleLikeComment}
              onToggleLike={handleLikeClick}
              onToggleBookmark={handleBookmarkClick}
              onDeletePost={handleDeletePost}
              onEditPost={handleEditPost}
              onDeleteComment={handleDeleteComment}
              onVotePoll={handleVotePoll}
              onAuthorClick={(author) => {
                const dummyPost: Post = {
                  id: `author_${author.nickname}`,
                  authorNickname: author.nickname,
                  authorAvatarKey: author.avatarKey || 'caduceus',
                  authorAvatarUrl: author.avatarUrl,
                  authorBadgeType: (author.badgeType as any) || 'NONE',
                  authorBadgeTitle: author.badgeTitle || '',
                  authorPoints: 0,
                  timeAgo: '',
                  category: 'General',
                  categoryTag: 'General',
                  content: '',
                  text: '',
                  timestamp: new Date().toISOString(),
                  likesCount: 0,
                  commentsCount: 0,
                  isQuarantined: false,
                  createdAt: '',
                };
                openAuthorProfile(dummyPost);
              }}
            />
          )}

          {/* Create Post Modal */}
          {showCreatePostModal && (
            <CreatePostModal
              userProfile={userProfile}
              onClose={closeModalUI}
              onSubmit={handleCreatePost}
              onOpenVerification={(data) => {
                if (userProfile) {
                  const updated = {
                    ...userProfile,
                    verificationStatus: 'pending' as const,
                  };
                  setUserProfile(updated);
                  localStorage.setItem('fuhsi_active_user', JSON.stringify(updated));
                }
              }}
            />
          )}

          {/* PWA App Install Modal */}
          <PWAInstallModal
            isOpen={showPwaModal}
            onClose={closeModalUI}
          />

          {/* Account Register & Login Modal */}
          {showAuthModal && !modalStack.some((item) => item.type === 'auth') && (
            <AuthModal
              isOpen={showAuthModal}
              onClose={closeModalUI}
              onLoginSuccess={(user) => {
                setUserProfile(user);
                closeModalUI();
              }}
            />
          )}
        </>
      )}

      {/* Bottom Footer Sticky Navigation Bar - Feed, Search, Hub&Fund, Notification, Chats, Ranking */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-1 sm:px-2">
          {/* 1. Feed */}
          <button
            onClick={() => handleNavChange(0)}
            className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer ${
              navIndex === 0 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
            }`}
          >
            <DynamicFeedIcon className="w-5 h-5 transition-transform group-hover:scale-105" />
            <span className="text-[10px] sm:text-[11px]">Feed</span>
          </button>

          {/* 2. Search */}
          <button
            onClick={() => handleNavChange(1)}
            className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer ${
              navIndex === 1 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
            }`}
          >
            <Search className="w-5 h-5 transition-transform group-hover:scale-105" />
            <span className="text-[10px] sm:text-[11px]">Search</span>
          </button>

          {/* 3. Hub&Fund (Only for non-Guest accounts) */}
          {!isGuestAccount(userProfile) && (
            <button
              onClick={() => handleNavChange(2)}
              className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer ${
                navIndex === 2 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
              }`}
            >
              <StorefrontIcon className="w-5 h-5 transition-transform group-hover:scale-105" />
              <span className="text-[10px] sm:text-[11px]">Hub&Fund</span>
            </button>
          )}

          {/* 4. Notification */}
          <button
            onClick={() => handleNavChange(3)}
            className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer relative ${
              navIndex === 3 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5 transition-transform group-hover:scale-105" />
              {unreadNotificationCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-3.5 h-3.5 px-1 bg-rose-600 text-white rounded-full text-[8.5px] font-black flex items-center justify-center animate-pulse">
                  {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                </span>
              )}
            </div>
            <span className="text-[10px] sm:text-[11px]">Notifications</span>
          </button>

          {/* 5. Chats (Only for non-Guest accounts) */}
          {!isGuestAccount(userProfile) && (
            <button
              onClick={() => handleNavChange(4)}
              className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer relative ${
                navIndex === 4 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
              }`}
            >
              <div className="relative">
                <MessageCircle className="w-5 h-5 transition-transform group-hover:scale-105" />
                {unreadChatsCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 min-w-3.5 h-3.5 px-1 bg-teal-600 text-white rounded-full text-[8.5px] font-black flex items-center justify-center animate-pulse">
                    {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-[11px]">Chats</span>
            </button>
          )}

          {/* 6. Ranking */}
          <button
            onClick={() => handleNavChange(5)}
            className={`group flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xl transform-gpu transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer ${
              navIndex === 5 ? 'text-teal-700 font-extrabold scale-105 shadow-xs bg-teal-50/70' : 'text-slate-500 hover:text-teal-800 hover:bg-slate-50'
            }`}
          >
            <LeaderboardIcon className="w-5 h-5 transition-transform group-hover:scale-105" />
            <span className="text-[10px] sm:text-[11px]">Ranking</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
