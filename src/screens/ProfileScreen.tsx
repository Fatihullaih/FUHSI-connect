import React, { useState, useEffect, useMemo } from 'react';
import { UserProfile, Post, Comment, FollowRecord } from '../types';
import { compressImageFile, optimizeAvatarImage } from '../utils/imageUtils';
import { calculateUserPoints, getUserPointsBreakdown } from '../utils/reputationUtils';
import { getFollowersCount, getFollowingCount, normalizeHandle } from '../utils/followUtils';
import { FollowersListModal } from '../components/FollowersListModal';
import { 
  User, 
  Lock, 
  Calendar, 
  Mail, 
  Camera, 
  Upload, 
  Trash2, 
  Link, 
  Save, 
  UserPlus, 
  Users,
  X, 
  MessageSquare, 
  FileText, 
  Settings, 
  ArrowLeft,
  Award,
  Sparkles,
  Maximize2,
  LogOut,
  LogIn,
  Bookmark,
  AlertTriangle,
  Info,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
  GraduationCap,
  ChevronRight,
  RefreshCw,
  Globe,
  Check,
  Eye,
  Shield
} from 'lucide-react';
import { ThemeMode, getStoredTheme, setStoredTheme } from '../utils/themeUtils';
import { formatJoinDate } from '../utils/userDbUtils';
import { AvatarIcon } from '../components/AvatarIcon';
import { VerificationBadge } from '../components/VerificationBadge';
import { PostCard } from '../components/PostCard';
import { ProfilePictureModal } from '../components/ProfilePictureModal';
import { VerificationModal } from '../components/VerificationModal';
import { formatRelativeTime, getTimestampMs } from '../utils/dateUtils';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, isModulaAccount } from '../utils/userDbUtils';
import { ImageCropModal } from '../components/ImageCropModal';

export type SettingsSubpage = 'main' | 'edit_profile' | 'display_mode' | 'privacy_visibility' | 'delete_account' | 'logout_confirm';

interface ProfileScreenProps {
  userProfile: UserProfile | null;
  allPosts?: Post[];
  allComments?: Comment[];
  allFollows?: FollowRecord[];
  allUsers?: UserProfile[];
  bookmarkedPostIds?: string[];
  onSaveProfile: (
    nickname: string,
    department: string,
    level: string,
    bio: string,
    avatarKey: string,
    emergencyPhone: string,
    avatarUrl?: string,
    realName?: string,
    studentEmail?: string
  ) => string | null;
  onSubmitVerification?: (data: {
    accountType?: 'Student' | 'Executive' | 'Organization' | 'Guest' | string;
    positionTitle?: string;
    matricNumber?: string;
    department?: string;
    level?: string;
    proofDetails?: string;
    paymentRef?: string;
    amountPaid?: number;
  }) => void;
  onOpenAuthModal?: () => void;
  onLikeClick?: (post: Post) => void;
  onBookmarkClick?: (post: Post) => void;
  onCommentClick?: (post: Post) => void;
  onAuthorClick?: (post: Post) => void;
  onDeletePost?: (postId: string) => void;
  onEditPost?: (postId: string, newContent: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onToggleFollow?: (targetNickname: string) => void;
  onUpdatePrivacySettings?: (
    isPrivate: boolean,
    defaultPostAudience: 'everyone' | 'followers',
    extraSettings?: {
      allowDirectMessagesFrom?: 'everyone' | 'followers';
      showActiveStatus?: boolean;
      searchDiscoverable?: boolean;
    }
  ) => void;
  onLogout?: () => void;
  onDeleteAccount?: () => Promise<void> | void;
  onClose?: () => void;
  onRepost?: (post: Post) => void;
  onUndoRepost?: (post: Post) => void;
  onQuote?: (post: Post, caption: string) => void;
  onSelectPost?: (post: Post) => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userProfile,
  allPosts = [],
  allComments = [],
  allFollows = [],
  allUsers = [],
  bookmarkedPostIds = [],
  onSaveProfile,
  onSubmitVerification,
  onOpenAuthModal,
  onLikeClick,
  onBookmarkClick,
  onCommentClick,
  onAuthorClick,
  onDeletePost,
  onEditPost,
  onDeleteComment,
  onToggleFollow,
  onUpdatePrivacySettings,
  onLogout,
  onDeleteAccount,
  onClose,
  onRepost,
  onUndoRepost,
  onQuote,
  onSelectPost,
}) => {
  const isOwnProfile = Boolean(userProfile);
  const isGuest = isGuestAccount(userProfile);
  const [activeTab, setActiveTab] = useState<'threads' | 'replies' | 'bookmarks'>('threads');
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null);
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [settingsSubpage, setSettingsSubpage] = useState<SettingsSubpage>('main');
  const [showPictureModal, setShowPictureModal] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showFollowersModal, setShowFollowersModal] = useState<{ open: boolean; tab: 'followers' | 'following' } | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showPointsBreakdown, setShowPointsBreakdown] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  // Edit Form state (owner personal details)
  const [nickname, setNickname] = useState(userProfile?.nickname || '@Student');
  const [realName, setRealName] = useState(userProfile?.realNameHidden || userProfile?.realName || '');
  const [studentEmail, setStudentEmail] = useState(userProfile?.studentEmail || '');
  const isMod = isModulaAccount(userProfile);
  const [department, setDepartment] = useState(isMod ? '' : (userProfile?.department || 'Medicine and Surgery (MBBS)'));
  const [level, setLevel] = useState(isMod ? '' : (userProfile?.level || '300L'));
  const [bio, setBio] = useState(userProfile?.bio || '');
  const [emergencyPhone, setEmergencyPhone] = useState(userProfile?.emergencyHomePhone || '');
  const [selectedAvatarKey, setSelectedAvatarKey] = useState(userProfile?.avatarKey || 'caduceus');
  const [avatarUrl, setAvatarUrl] = useState<string>(userProfile?.avatarUrl || '');

  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [isAvatarDirty, setIsAvatarDirty] = useState(false);
  const [isProcessingAvatar, setIsProcessingAvatar] = useState(false);
  const [cropImageSource, setCropImageSource] = useState<string | null>(null);

  // Theme Mode State (Persisted in Local Storage)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());

  // Privacy & Audience Settings State
  const [isAccountPrivate, setIsAccountPrivate] = useState<boolean>(Boolean(userProfile?.isPrivate));
  const [defaultPostAudience, setDefaultPostAudience] = useState<'everyone' | 'followers'>(
    userProfile?.defaultPostAudience || 'everyone'
  );
  const [allowDirectMessagesFrom, setAllowDirectMessagesFrom] = useState<'everyone' | 'followers'>(
    userProfile?.allowDirectMessagesFrom || 'everyone'
  );
  const [showActiveStatus, setShowActiveStatus] = useState<boolean>(
    userProfile?.showActiveStatus !== false
  );
  const [searchDiscoverable, setSearchDiscoverable] = useState<boolean>(
    userProfile?.searchDiscoverable !== false
  );
  const [privacySavedNotice, setPrivacySavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setIsAccountPrivate(Boolean(userProfile.isPrivate));
      setDefaultPostAudience(userProfile.defaultPostAudience || 'everyone');
      setAllowDirectMessagesFrom(userProfile.allowDirectMessagesFrom || 'everyone');
      setShowActiveStatus(userProfile.showActiveStatus !== false);
      setSearchDiscoverable(userProfile.searchDiscoverable !== false);
    }
  }, [
    userProfile?.isPrivate,
    userProfile?.defaultPostAudience,
    userProfile?.allowDirectMessagesFrom,
    userProfile?.showActiveStatus,
    userProfile?.searchDiscoverable,
  ]);

  const handleToggleAccountPrivacy = (newVal: boolean) => {
    setIsAccountPrivate(newVal);
    if (onUpdatePrivacySettings) {
      onUpdatePrivacySettings(newVal, defaultPostAudience, {
        allowDirectMessagesFrom,
        showActiveStatus,
        searchDiscoverable,
      });
    }
    setPrivacySavedNotice(newVal ? 'Account is now Private (followers only).' : 'Account is now Public (visible to all).');
    setTimeout(() => setPrivacySavedNotice(null), 3000);
  };

  const handleSetDefaultAudience = (audience: 'everyone' | 'followers') => {
    setDefaultPostAudience(audience);
    if (onUpdatePrivacySettings) {
      onUpdatePrivacySettings(isAccountPrivate, audience, {
        allowDirectMessagesFrom,
        showActiveStatus,
        searchDiscoverable,
      });
    }
    setPrivacySavedNotice(audience === 'followers' ? 'Default post audience set to Followers Only.' : 'Default post audience set to Everyone.');
    setTimeout(() => setPrivacySavedNotice(null), 3000);
  };

  const handleSetDirectMessagesPrivacy = (dmAudience: 'everyone' | 'followers') => {
    setAllowDirectMessagesFrom(dmAudience);
    if (onUpdatePrivacySettings) {
      onUpdatePrivacySettings(isAccountPrivate, defaultPostAudience, {
        allowDirectMessagesFrom: dmAudience,
        showActiveStatus,
        searchDiscoverable,
      });
    }
    setPrivacySavedNotice(dmAudience === 'followers' ? 'Direct messages restricted to Followers Only.' : 'Direct messages allowed from Everyone.');
    setTimeout(() => setPrivacySavedNotice(null), 3000);
  };

  const handleToggleActiveStatus = (val: boolean) => {
    setShowActiveStatus(val);
    if (onUpdatePrivacySettings) {
      onUpdatePrivacySettings(isAccountPrivate, defaultPostAudience, {
        allowDirectMessagesFrom,
        showActiveStatus: val,
        searchDiscoverable,
      });
    }
    setPrivacySavedNotice(val ? 'Online activity status is now visible.' : 'Online activity status is hidden.');
    setTimeout(() => setPrivacySavedNotice(null), 3000);
  };

  const handleToggleSearchDiscoverable = (val: boolean) => {
    setSearchDiscoverable(val);
    if (onUpdatePrivacySettings) {
      onUpdatePrivacySettings(isAccountPrivate, defaultPostAudience, {
        allowDirectMessagesFrom,
        showActiveStatus,
        searchDiscoverable: val,
      });
    }
    setPrivacySavedNotice(val ? 'Profile is discoverable in campus search.' : 'Profile is hidden from search suggestions.');
    setTimeout(() => setPrivacySavedNotice(null), 3000);
  };

  useEffect(() => {
    const handleThemeEvent = (e: any) => {
      if (e.detail) {
        setThemeMode(e.detail);
      }
    };
    window.addEventListener('fuhsi-theme-changed', handleThemeEvent);
    return () => window.removeEventListener('fuhsi-theme-changed', handleThemeEvent);
  }, []);

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    setStoredTheme(mode);
  };

  // Sync form state when userProfile changes, but NEVER while user is actively editing
  useEffect(() => {
    if (userProfile && settingsSubpage !== 'edit_profile') {
      setNickname(userProfile.nickname || '@Student');
      setRealName(userProfile.realNameHidden || userProfile.realName || '');
      setStudentEmail(userProfile.studentEmail || '');
      const isMod = isModulaAccount(userProfile);
      setDepartment(isMod ? '' : (userProfile.department || 'Medicine and Surgery (MBBS)'));
      setLevel(isMod ? '' : (userProfile.level || '300L'));
      setBio(userProfile.bio || '');
      setEmergencyPhone(userProfile.emergencyHomePhone || '');
      setSelectedAvatarKey(userProfile.avatarKey || 'caduceus');
      setAvatarUrl(userProfile.avatarUrl || '');
      setIsAvatarDirty(false);
    }
  }, [userProfile, settingsSubpage]);

  // Handle popstate for back button inside ProfileScreen
  useEffect(() => {
    const handlePopState = () => {
      if (showFollowersModal) {
        setShowFollowersModal(null);
        return;
      }
      if (confirmLogout) {
        setConfirmLogout(false);
        return;
      }
      if (showPictureModal) {
        setShowPictureModal(false);
        return;
      }
      if (showPointsBreakdown) {
        setShowPointsBreakdown(false);
        return;
      }
      if (settingsSubpage !== 'main') {
        if (settingsSubpage === 'edit_profile') {
          handleCancelEdit();
        } else {
          setSettingsSubpage('main');
        }
        return;
      }
      if (isEditingSettings) {
        setIsEditingSettings(false);
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [showFollowersModal, confirmLogout, showPictureModal, showPointsBreakdown, isEditingSettings, settingsSubpage]);

  const departments = [
    'Medicine and Surgery (MBBS)',
    'Nursing Science (NSC)',
    'Medical Laboratory Science (MLS)',
    'Doctor of Physiotherapy (DPT)',
    'Audiology (AUD)',
    'Pharmacology (PHM)',
    'Nutrition and Dietetics (HND)',
    'Information Technology and Health Informatics (ITH)',
    'Microbiology (MCB)',
    'Biochemistry (BCH)',
    'Biotechnology and Molecular Biology (BMB)',
    'Environmental Health Science (EHS)',
    'Prosthetics and Orthotics (PRT)',
  ];

  const levels = ['100L', '200L', '300L', '400L', '500L'];

  const avatarOptions = [
    { key: 'user', label: 'Student Icon 👤' },
    { key: 'grad', label: 'Scholar Cap 🎓' },
  ];

  // User posts (threads) sorted chronologically (newest first)
  const myNickname = userProfile?.nickname || '';
  const normMyNick = useMemo(() => normalizeHandle(myNickname), [myNickname]);

  const myPosts = (allPosts || [])
    .filter((p) => {
      if (!p) return false;
      const author = normalizeHandle(p.authorNickname || p.nickname || (p as any).customNickname || '');
      const reposter = normalizeHandle(p.reposterNickname || '');
      return (normMyNick && author === normMyNick) || (p.isRepost && reposter === normMyNick);
    })
    .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

  // User comments (replies) sorted chronologically (newest first)
  const myReplies = (allComments || [])
    .filter((c) => {
      if (!c) return false;
      const author = normalizeHandle(c.authorNickname || '');
      return normMyNick && author === normMyNick;
    })
    .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

  // Saved / Bookmarked posts (Strictly isolated per account)
  const bookmarkedPosts = (allPosts || [])
    .filter((p) => {
      if (!p) return false;
      if (bookmarkedPostIds && bookmarkedPostIds.length > 0) {
        return bookmarkedPostIds.includes(p.id);
      }
      return Boolean(p.isBookmarkedByMe);
    })
    .sort((a, b) => getTimestampMs(b.timestamp) - getTimestampMs(a.timestamp));

  const pointsEarned = calculateUserPoints(myNickname, userProfile, allPosts, allComments);
  const joinedDate = formatJoinDate(userProfile);

  // Dynamic real Following & Followers counts (Calculated from actual stored accounts)
  const myFollowersCount = useMemo(() => getFollowersCount(normMyNick, allFollows), [normMyNick, allFollows]);
  const myFollowingCount = useMemo(() => getFollowingCount(normMyNick, allFollows), [normMyNick, allFollows]);

  const handleOpenEditProfile = () => {
    if (userProfile) {
      setNickname(userProfile.nickname || '@Student');
      setRealName(userProfile.realNameHidden || userProfile.realName || '');
      setStudentEmail(userProfile.studentEmail || '');
      const isMod = isModulaAccount(userProfile);
      setDepartment(isMod ? '' : (userProfile.department || 'Medicine and Surgery (MBBS)'));
      setLevel(isMod ? '' : (userProfile.level || '300L'));
      setBio(userProfile.bio || '');
      setEmergencyPhone(userProfile.emergencyHomePhone || '');
      setSelectedAvatarKey(userProfile.avatarKey || 'caduceus');
      setAvatarUrl(userProfile.avatarUrl || '');
    }
    setIsAvatarDirty(false);
    setSaveErrorMessage(null);
    setIsEditingSettings(true);
    setSettingsSubpage('edit_profile');
    try { window.history.pushState({ subModal: 'editProfile' }, ''); } catch (e) { console.error(e); }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setSaveErrorMessage('Please select a valid image file.');
        return;
      }
      setSaveErrorMessage(null);
      setIsProcessingAvatar(true);

      const reader = new FileReader();
      reader.onload = () => {
        const rawResult = reader.result;
        setIsProcessingAvatar(false);
        if (typeof rawResult !== 'string') {
          setSaveErrorMessage('Failed to read image file.');
          return;
        }
        setCropImageSource(rawResult);
      };
      reader.onerror = () => {
        setIsProcessingAvatar(false);
        setSaveErrorMessage('Failed to read image file. Please try another image.');
      };
      reader.readAsDataURL(file);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleSelectPresetAvatar = (key: string) => {
    setSelectedAvatarKey(key);
    setAvatarUrl('');
    setIsAvatarDirty(true);
  };

  const handleRemoveAvatarPhoto = () => {
    setAvatarUrl('');
    setIsAvatarDirty(true);
  };

  const handleCancelEdit = () => {
    setIsAvatarDirty(false);
    if (userProfile) {
      setNickname(userProfile.nickname || '@Student');
      setRealName(userProfile.realNameHidden || userProfile.realName || '');
      setStudentEmail(userProfile.studentEmail || '');
      const isMod = isModulaAccount(userProfile);
      setDepartment(isMod ? '' : (userProfile.department || 'Medicine and Surgery (MBBS)'));
      setLevel(isMod ? '' : (userProfile.level || '300L'));
      setBio(userProfile.bio || '');
      setEmergencyPhone(userProfile.emergencyHomePhone || '');
      setSelectedAvatarKey(userProfile.avatarKey || 'caduceus');
      setAvatarUrl(userProfile.avatarUrl || '');
    }
    setSaveErrorMessage(null);
    setSettingsSubpage('main');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveErrorMessage(null);
    setShowSavedToast(false);

    const trimmedNick = nickname.trim();
    if (!trimmedNick) {
      setSaveErrorMessage('Please enter a valid display username / handle.');
      return;
    }

    if (studentEmail && !studentEmail.includes('@')) {
      setSaveErrorMessage('Please enter a valid email address.');
      return;
    }

    const isMod = isModulaAccount(userProfile);
    const error = onSaveProfile(
      trimmedNick,
      isMod ? '' : (department || userProfile?.department || ''),
      isMod ? '' : (level || userProfile?.level || ''),
      bio.trim(),
      selectedAvatarKey,
      emergencyPhone.trim(),
      avatarUrl,
      realName.trim(),
      studentEmail.trim()
    );

    if (error) {
      setSaveErrorMessage(error);
    } else {
      setIsAvatarDirty(false);
      setShowSavedToast(true);
      setSettingsSubpage('main');
      setTimeout(() => setShowSavedToast(false), 3000);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pb-24 px-2 sm:px-4 pt-2 space-y-4 font-sans text-slate-900">
      {/* Toast Notification */}
      {showSavedToast && (
        <div className="p-3.5 bg-emerald-600 text-white font-extrabold text-xs rounded-2xl text-center shadow-lg animate-in fade-in slide-in-from-top-2">
          ✓ Account settings updated! Your personal info remains strictly confidential to you.
        </div>
      )}

      {/* Main Profile Header Card */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs space-y-4 relative">
        {/* Header Bar with Back Button & Account Settings */}
        <div className="flex items-center justify-between">
          {onClose ? (
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-100 text-slate-600 transition-colors"
              title="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={() => {
              setSettingsSubpage('main');
              setIsEditingSettings(true);
              try { window.history.pushState({ subModal: 'accountSettings' }, ''); } catch (e) { console.error(e); }
            }}
            className="px-3 py-2 rounded-full bg-slate-100 hover:bg-teal-50 text-slate-800 hover:text-teal-800 transition-all border border-slate-200 shadow-2xs flex items-center gap-1.5 font-extrabold text-xs cursor-pointer"
            title="Account Settings"
          >
            <Settings size={15} className="text-teal-700" />
            <span className="hidden sm:inline">Account Settings</span>
            <span className="sm:hidden">Settings</span>
          </button>
        </div>

        {/* Profile Avatar & Info Row */}
        <div className="flex items-start justify-between gap-4">
          {/* Avatar Picture (Clickable for full size view) */}
          <div className="relative cursor-pointer" onClick={() => setShowPictureModal(true)}>
            <AvatarIcon
              avatarKey={userProfile?.avatarKey || 'caduceus'}
              avatarUrl={userProfile?.avatarUrl || ''}
              sizeClassName="w-20 h-20 sm:w-24 sm:h-24 rounded-full ring-4 ring-teal-500/20 object-cover shadow-md transition-transform hover:scale-105"
            />
          </div>
        </div>

        {/* Public Profile Overview (Username, Date Joined, Bio) */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {userProfile?.nickname || '@Student'}
              </h1>
              {isGuest && (
                <span className="text-xs text-slate-400 font-medium">
                  Guest
                </span>
              )}
              {(() => {
                const badgeInfo = getUserBadgeInfo(userProfile?.nickname, userProfile);
                if (badgeInfo.isVerified) {
                  return (
                    <VerificationBadge
                      isVerified={badgeInfo.isVerified}
                      badgeType={badgeInfo.badgeType}
                      title={badgeInfo.badgeTitle}
                      showTitle
                    />
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <p className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
            <Calendar size={13} className="text-slate-400 shrink-0" />
            <span>Joined {joinedDate}</span>
          </p>

          {userProfile?.bio && (
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 font-medium leading-relaxed pt-1.5">
              {userProfile.bio}
            </p>
          )}
        </div>

        {/* Stats Row: Total Threads & Total Points Earned */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-center">
            <span className="text-xs font-bold text-slate-500 uppercase block">Total Threads</span>
            <span className="text-lg sm:text-xl font-black text-slate-900">{myPosts.length}</span>
          </div>

          <div 
            onClick={() => setShowPointsBreakdown(true)}
            className="bg-teal-50/80 hover:bg-teal-100/90 transition-all p-3 rounded-2xl border border-teal-200/80 text-center cursor-pointer group shadow-2xs"
            title="Click to view full points breakdown"
          >
            <span className="text-xs font-bold text-teal-800 uppercase flex items-center justify-center gap-1 group-hover:text-teal-900">
              <Award size={13} className="text-teal-600 group-hover:scale-110 transition-transform" />
              <span>Total Points Earned</span>
            </span>
            <span className="text-lg sm:text-xl font-black text-teal-900 flex items-center justify-center gap-1">
              {pointsEarned.toLocaleString()} <span className="text-xs font-extrabold text-teal-700">pts</span>
              <Info size={12} className="text-teal-600 opacity-60 group-hover:opacity-100" />
            </span>
          </div>
        </div>

        {/* Real Following & Followers System (Calculated from actual accounts) */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-center gap-4 text-xs sm:text-sm font-extrabold text-slate-700">
          <button
            type="button"
            onClick={() => setShowFollowersModal({ open: true, tab: 'following' })}
            className="hover:text-teal-700 transition-colors cursor-pointer flex items-center gap-1.5 group"
            title="View accounts you are following"
          >
            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-teal-700">{myFollowingCount}</span>
            <span className="text-slate-500 group-hover:text-teal-700 font-bold">Following</span>
          </button>
          <span className="text-slate-300 font-bold">·</span>
          <button
            type="button"
            onClick={() => setShowFollowersModal({ open: true, tab: 'followers' })}
            className="hover:text-teal-700 transition-colors cursor-pointer flex items-center gap-1.5 group"
            title="View accounts following you"
          >
            <span className="text-sm sm:text-base font-black text-slate-900 group-hover:text-teal-700">{myFollowersCount}</span>
            <span className="text-slate-500 group-hover:text-teal-700 font-bold">Followers</span>
          </button>
        </div>
      </div>

      {/* POINTS BREAKDOWN MODAL */}
      {showPointsBreakdown && (() => {
        const bd = getUserPointsBreakdown(myNickname, userProfile, allPosts, allComments);
        return (
          <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-150">
            <div className="w-full h-full max-w-3xl mx-auto bg-white dark:bg-slate-900 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 dark:sm:border-slate-800 overflow-hidden">
              <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => setShowPointsBreakdown(false)}
                    className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                    title="Return to previous page"
                  >
                    <ArrowLeft size={18} />
                    <span>Back</span>
                  </button>
                  <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                  <div className="flex items-center gap-2 text-teal-800 dark:text-teal-400 font-extrabold text-sm sm:text-base">
                    <Award className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                    <span>Reputation Points Breakdown</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowPointsBreakdown(false)}
                  className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Official reputation calculation for <strong className="text-slate-800 dark:text-slate-200">{userProfile?.nickname || myNickname}</strong> based on campus activity:
                </p>

                <div className="space-y-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">👤 Profile Completion</span>
                    <span className="text-[10px] text-slate-500">One-time account reward</span>
                  </div>
                  <span className="font-extrabold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200">
                    +{bd.profileCompletion} pts
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">📝 Quality Threads Created</span>
                    <span className="text-[10px] text-slate-500">{bd.postsCount} posts × 2 pts</span>
                  </div>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                    +{bd.qualityPosts} pts
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">👍 Likes Received from Peers</span>
                    <span className="text-[10px] text-slate-500">{bd.likesCount} peer likes × 1 pt</span>
                  </div>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                    +{bd.likesReceived} pts
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">💬 Comments Received from Peers</span>
                    <span className="text-[10px] text-slate-500">{bd.commentsCount} peer comments × 1 pt</span>
                  </div>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                    +{bd.commentsReceived} pts
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-800 block">🔄 Reposts/Quotes Received</span>
                    <span className="text-[10px] text-slate-500">{bd.repostsCount} peer reposts × 1 pt</span>
                  </div>
                  <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                    +{bd.repostsReceived} pts
                  </span>
                </div>

                {(bd.spamPenalties > 0 || bd.offensivePenalties > 0 || bd.reportPenalties > 0) && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
                    <span className="font-bold text-rose-950 block">⚠️ Safety Penalties Deducted</span>
                    {bd.spamPenalties > 0 && <p className="text-[11px] text-rose-700">• Spam penalty: -{bd.spamPenalties} pts</p>}
                    {bd.offensivePenalties > 0 && <p className="text-[11px] text-rose-700">• Offensive post penalty: -{bd.offensivePenalties} pts</p>}
                    {bd.reportPenalties > 0 && <p className="text-[11px] text-rose-700">• Valid community reports penalty: -{bd.reportPenalties} pts</p>}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-black text-slate-900 text-sm">Total Calculated Points</span>
                <span className="font-black text-teal-800 text-lg bg-teal-50 px-3 py-1 rounded-xl border border-teal-200">
                  {bd.total.toLocaleString()} pts
                </span>
              </div>

              <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-[10px] text-amber-900 space-y-1">
                <span className="font-bold block">🔒 Anti-Abuse System Active:</span>
                <p className="leading-snug">
                  Liking, commenting on, or reposting your own threads earns <strong>0 points</strong>. Only verified interactions from other students count towards reputation points.
                </p>
              </div>

              <button
                onClick={() => setShowPointsBreakdown(false)}
                className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-extrabold text-xs transition-colors cursor-pointer shadow-xs"
              >
                Close Breakdown
              </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ACCOUNT SETTINGS SEPARATE PAGE */}
      {isEditingSettings && (
        <div className="fixed inset-0 z-50 w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-150">
          <div className="w-full h-full max-w-2xl mx-auto bg-white dark:bg-slate-900 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 dark:sm:border-slate-800 overflow-hidden">
            {settingsSubpage === 'main' && (
              /* CLEAN ACCOUNT SETTINGS MENU (CATEGORIES ONLY) */
              <>
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleCancelEdit();
                        setIsEditingSettings(false);
                      }}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to profile"
                    >
                      <ArrowLeft size={18} />
                      <span>Back</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                      <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        Account Settings
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
                  {/* 👤 Edit Profile */}
                  <button
                    type="button"
                    onClick={handleOpenEditProfile}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-teal-500 dark:hover:border-teal-400 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-lg shrink-0 border border-teal-200/60 dark:border-teal-800/60">
                        👤
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                          Edit Profile
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Change profile picture, bio, nickname, etc.
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors shrink-0" />
                  </button>

                  {/* 🎨 Display Mode */}
                  <button
                    type="button"
                    onClick={() => setSettingsSubpage('display_mode')}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-lg shrink-0 border border-indigo-200/60 dark:border-indigo-800/60">
                        🎨
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors">
                            Display Mode
                          </h3>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 capitalize">
                            {themeMode}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Light / Dark / System
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors shrink-0" />
                  </button>

                  {/* 🔒 Privacy & Visibility */}
                  <button
                    type="button"
                    onClick={() => setSettingsSubpage('privacy_visibility')}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-teal-500 dark:hover:border-teal-400 hover:bg-teal-50/40 dark:hover:bg-teal-950/20 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-lg shrink-0 border border-teal-200/60 dark:border-teal-800/60">
                        <Lock size={19} className="text-teal-600 dark:text-teal-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                            Privacy & Visibility
                          </h3>
                          {isAccountPrivate ? (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
                              <Lock size={10} />
                              <span>Private</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              Public
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          Control who can view your profile and posts
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors shrink-0" />
                  </button>

                  {/* 🔐 Get Verified */}
                  <button
                    type="button"
                    onClick={() => setShowVerificationModal(true)}
                    className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-sky-500 dark:hover:border-sky-400 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-sky-50 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 flex items-center justify-center text-lg shrink-0 border border-sky-200/60 dark:border-sky-800/60">
                        🔐
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-sky-700 dark:group-hover:text-sky-300 transition-colors">
                            Get Verified
                          </h3>
                          {userProfile?.isVerified && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 border border-sky-300">
                              Verified ✓
                            </span>
                          )}
                          {userProfile?.verificationStatus === 'pending' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              Pending
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {userProfile?.isVerified
                            ? 'Account is officially verified with badge & benefits'
                            : userProfile?.verificationStatus === 'pending'
                            ? 'Verification application is currently pending review'
                            : isGuest
                            ? 'Apply for official Guest verification checkmark badge & benefits'
                            : 'Apply for official student verification badge & benefits'}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors shrink-0" />
                  </button>

                  {/* ⚠️ Delete Account */}
                  {onDeleteAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteConfirmText('');
                        setDeleteErrorMessage(null);
                        setSettingsSubpage('delete_account');
                      }}
                      className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-rose-200/90 dark:border-rose-900/40 hover:border-rose-400 hover:bg-rose-50/50 dark:hover:bg-rose-950/20 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center text-lg shrink-0 border border-rose-200 dark:border-rose-900/60">
                          ⚠️
                        </div>
                        <div>
                          <h3 className="text-sm font-extrabold text-rose-700 dark:text-rose-400 group-hover:text-rose-800 dark:group-hover:text-rose-300 transition-colors">
                            Delete Account
                          </h3>
                          <p className="text-xs text-rose-600/80 dark:text-rose-400/80 font-medium">
                            Permanently delete the account after confirmation
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-rose-300 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors shrink-0" />
                    </button>
                  )}

                  {/* 🚪 Log Out */}
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('logout_confirm')}
                      className="w-full p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all text-left flex items-center justify-between group shadow-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center text-lg shrink-0 border border-slate-200 dark:border-slate-600">
                          🚪
                        </div>
                        <div>
                          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                            Log Out
                          </h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Log out of the current account
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors shrink-0" />
                    </button>
                  )}
                </div>
              </>
            )}

            {settingsSubpage === 'display_mode' && (
              /* DEDICATED DISPLAY MODE SUBPAGE */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to Settings"
                    >
                      <ArrowLeft size={18} />
                      <span>Settings</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm">
                        🎨
                      </div>
                      <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        Display Mode
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Appearance Preference
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Choose how FUHSI Connect looks on this device. Your choice is automatically saved.
                    </p>
                  </div>

                  {/* Light Mode Option */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange('light')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between group cursor-pointer ${
                      themeMode === 'light'
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400 ring-2 ring-amber-400/30 shadow-xs'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Sun size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            Light Mode
                          </h4>
                          {themeMode === 'light' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Clean, high-contrast day theme tailored for medical study reading and daylight use.
                        </p>
                      </div>
                    </div>
                    {themeMode === 'light' && (
                      <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0 mt-1">
                        <Check size={14} />
                      </div>
                    )}
                  </button>

                  {/* Dark Mode Option */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between group cursor-pointer ${
                      themeMode === 'dark'
                        ? 'bg-indigo-950/30 border-indigo-400 ring-2 ring-indigo-400/30 shadow-xs'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-900/60 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Moon size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            Dark Mode
                          </h4>
                          {themeMode === 'dark' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 border border-indigo-400/40">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Deep, eye-safe slate palette designed for low-light nocturnal study and battery saving.
                        </p>
                      </div>
                    </div>
                    {themeMode === 'dark' && (
                      <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 mt-1">
                        <Check size={14} />
                      </div>
                    )}
                  </button>

                  {/* System Default Option */}
                  <button
                    type="button"
                    onClick={() => handleThemeChange('system')}
                    className={`w-full p-4 rounded-2xl border text-left transition-all flex items-start justify-between group cursor-pointer ${
                      themeMode === 'system'
                        ? 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-500 ring-2 ring-teal-500/30 shadow-xs'
                        : 'bg-white dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700/80 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                        <Monitor size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                            System Default
                          </h4>
                          {themeMode === 'system' && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          Automatically synchronizes appearance with your operating system or browser theme settings.
                        </p>
                      </div>
                    </div>
                    {themeMode === 'system' && (
                      <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0 mt-1">
                        <Check size={14} />
                      </div>
                    )}
                  </button>

                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2.5">
                    <Info size={16} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span>Your display mode is remembered across restarts and applies to all screens and modals.</span>
                  </div>
                </div>
              </div>
            )}

            {settingsSubpage === 'privacy_visibility' && (
              /* DEDICATED PRIVACY & VISIBILITY SUBPAGE */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to Settings"
                    >
                      <ArrowLeft size={18} />
                      <span>Settings</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 flex items-center justify-center text-sm">
                        <Lock size={15} />
                      </div>
                      <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        Privacy & Visibility
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {privacySavedNotice && (
                    <div className="p-3 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-150">
                      <CheckCircle2 size={16} className="text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>{privacySavedNotice}</span>
                    </div>
                  )}

                  {/* Section 1: Private Account Toggle */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                            Private Account
                          </h3>
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-bold">
                            Followers Only
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          When turned on, only people you approve as followers can view your threads, replies, and activities.
                        </p>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={isAccountPrivate}
                        onClick={() => handleToggleAccountPrivacy(!isAccountPrivate)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          isAccountPrivate ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            isAccountPrivate ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                      isAccountPrivate
                        ? 'bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                      {isAccountPrivate ? (
                        <div className="flex items-start gap-2">
                          <Lock size={14} className="text-amber-600 shrink-0 mt-0.5" />
                          <span><strong>Account is Private:</strong> Non-followers who visit your profile will only see your handle and department. Your posts and replies are hidden until you follow them back.</span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <Globe size={14} className="text-slate-500 shrink-0 mt-0.5" />
                          <span><strong>Account is Public:</strong> Any student or campus visitor can read your threads, answers, and profile information.</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 2: Default Post Audience */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                        Default Post Audience
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Choose who can view new threads you post by default. You can also change this individually whenever posting.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSetDefaultAudience('everyone')}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                          defaultPostAudience === 'everyone'
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-100 ring-2 ring-teal-500/30 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${defaultPostAudience === 'everyone' ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            <Globe size={16} />
                          </div>
                          <div>
                            <div className="font-extrabold text-xs">Everyone</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">Campus-wide feed</div>
                          </div>
                        </div>
                        {defaultPostAudience === 'everyone' && <Check size={16} className="text-teal-600 dark:text-teal-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetDefaultAudience('followers')}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                          defaultPostAudience === 'followers'
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-100 ring-2 ring-teal-500/30 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${defaultPostAudience === 'followers' ? 'bg-teal-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                            <Users size={16} />
                          </div>
                          <div>
                            <div className="font-extrabold text-xs">Followers Only</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">Followers stream</div>
                          </div>
                        </div>
                        {defaultPostAudience === 'followers' && <Check size={16} className="text-teal-600 dark:text-teal-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Section 3: Direct Messages */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-3">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 dark:text-slate-100">
                        Direct Message Requests
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Control who can initiate private student chat messages with you.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSetDirectMessagesPrivacy('everyone')}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                          allowDirectMessagesFrom === 'everyone'
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-100 ring-2 ring-teal-500/30 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="font-extrabold text-xs">Everyone on Campus</div>
                        {allowDirectMessagesFrom === 'everyone' && <Check size={16} className="text-teal-600 dark:text-teal-400" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetDirectMessagesPrivacy('followers')}
                        className={`p-3.5 rounded-xl border flex items-center justify-between text-left transition-all cursor-pointer ${
                          allowDirectMessagesFrom === 'followers'
                            ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-900 dark:text-teal-100 ring-2 ring-teal-500/30 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="font-extrabold text-xs">Followers Only</div>
                        {allowDirectMessagesFrom === 'followers' && <Check size={16} className="text-teal-600 dark:text-teal-400" />}
                      </button>
                    </div>
                  </div>

                  {/* Section 4: Online Status & Search Discovery */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                          Show Online Activity Status
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Allow friends or followers to see when you are active
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={showActiveStatus}
                        onClick={() => handleToggleActiveStatus(!showActiveStatus)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          showActiveStatus ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            showActiveStatus ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-slate-100">
                          Include Profile in Campus Search
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Allow course mates to find your account by typing your handle
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={searchDiscoverable}
                        onClick={() => handleToggleSearchDiscoverable(!searchDiscoverable)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          searchDiscoverable ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                            searchDiscoverable ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/20 border border-teal-200/80 dark:border-teal-800/50 text-xs text-teal-800 dark:text-teal-300 flex items-start gap-2.5">
                    <Shield size={16} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span>Privacy preferences are synchronized automatically with your FUHSI account.</span>
                  </div>
                </div>
              </div>
            )}

            {settingsSubpage === 'delete_account' && (
              /* DEDICATED DELETE ACCOUNT SUBPAGE */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to Settings"
                    >
                      <ArrowLeft size={18} />
                      <span>Settings</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center text-sm">
                        ⚠️
                      </div>
                      <h2 className="font-black text-rose-700 dark:text-rose-400 text-sm sm:text-base">
                        Delete Account
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 space-y-3">
                    <h3 className="text-sm font-black text-rose-900 dark:text-rose-200 flex items-center gap-2">
                      <AlertTriangle size={17} className="text-rose-600 shrink-0" />
                      <span>Irreversible Permanent Action</span>
                    </h3>
                    <p className="text-xs text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                      Deleting your account cannot be undone. Once deleted:
                    </p>
                    <ul className="text-xs text-rose-700 dark:text-rose-300 space-y-1.5 list-disc pl-5">
                      <li>Your username, bio, and student credentials will be permanently erased.</li>
                      <li>All your threads, discussions, and replies will be removed.</li>
                      <li>All accrued points, badges, and verification status will be cleared.</li>
                      <li>Any active sessions on all devices will be terminated immediately.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 pt-2">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                      To confirm, type <span className="font-black text-rose-600">DELETE</span> or your nickname <span className="font-black text-slate-900 dark:text-white">{userProfile?.nickname?.replace(/^@/, '') || 'Student'}</span>:
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder='Type "DELETE" to confirm'
                      className="w-full text-xs rounded-xl border border-rose-300 dark:border-rose-800 p-3 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500 font-bold"
                    />
                  </div>

                  {deleteErrorMessage && (
                    <div className="p-3 bg-rose-100 dark:bg-rose-950/50 border border-rose-300 text-rose-900 dark:text-rose-200 text-xs font-bold rounded-xl text-center">
                      {deleteErrorMessage}
                    </div>
                  )}

                  <div className="pt-4 flex flex-col gap-2.5">
                    <button
                      type="button"
                      disabled={isDeletingAccount || (deleteConfirmText.trim() !== 'DELETE' && deleteConfirmText.trim().toLowerCase() !== (userProfile?.nickname || '').replace(/^@/, '').toLowerCase())}
                      onClick={async () => {
                        if (!onDeleteAccount) return;
                        setIsDeletingAccount(true);
                        setDeleteErrorMessage(null);
                        try {
                          await onDeleteAccount();
                          setIsEditingSettings(false);
                        } catch (err: any) {
                          setDeleteErrorMessage(err?.message || 'Failed to delete account. Please try again.');
                          setIsDeletingAccount(false);
                        }
                      }}
                      className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isDeletingAccount ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Deleting Account...</span>
                        </>
                      ) : (
                        <span>Permanently Delete My Account</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer text-center"
                    >
                      Keep My Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settingsSubpage === 'logout_confirm' && (
              /* DEDICATED LOG OUT CONFIRMATION SUBPAGE */
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to Settings"
                    >
                      <ArrowLeft size={18} />
                      <span>Settings</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-sm">
                        🚪
                      </div>
                      <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        Log Out
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-5">
                  <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center text-3xl shadow-xs border border-slate-200 dark:border-slate-700">
                    🚪
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                      Log out of {userProfile?.nickname || 'your account'}?
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                      You will be logged out of your session and returned to the Sign In / Register screen. You can log back in at any time with your credentials.
                    </p>
                  </div>

                  <div className="w-full flex flex-col gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingSettings(false);
                        if (onClose) onClose();
                        if (onLogout) onLogout();
                      }}
                      className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition-colors shadow-md cursor-pointer"
                    >
                      Yes, Log Out
                    </button>
                    <button
                      type="button"
                      onClick={() => setSettingsSubpage('main')}
                      className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Stay Logged In
                    </button>
                  </div>
                </div>
              </div>
            )}

            {settingsSubpage === 'edit_profile' && (
              /* DEDICATED EDIT PROFILE SUBPAGE */
              <form onSubmit={handleSave} className="flex flex-col h-full overflow-hidden">
                {/* Edit Profile Header */}
                <div className="p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"
                      title="Return to Settings"
                    >
                      <ArrowLeft size={18} />
                      <span>Settings</span>
                    </button>
                    <div className="h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" />
                    <div>
                      <h2 className="font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base">
                        Edit Profile
                      </h2>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                        Change profile picture, bio, nickname, etc.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      handleCancelEdit();
                      setIsEditingSettings(false);
                    }}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                  {/* Privacy Shield Notice */}
                  <div className="p-3 bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800/60 rounded-2xl text-[11px] text-teal-900 dark:text-teal-200 font-medium flex items-start gap-2">
                    <Lock className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                    <span>
                      🔒 <strong>Owner Privacy Protection:</strong> Other users only see your Nickname, Points, Threads, and Avatar. Your Full Name, Email, Phone, and Academic Registration details remain strictly confidential to you.
                    </span>
                  </div>

                  {/* Profile Picture Upload Section */}
                  <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
                    <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-teal-600" />
                      <span>Profile Picture</span>
                    </label>

                    <div className="flex items-center gap-4">
                      <div className="relative shrink-0">
                        <AvatarIcon
                          avatarKey={selectedAvatarKey}
                          avatarUrl={avatarUrl}
                          sizeClassName="w-16 h-16 rounded-full ring-2 ring-teal-500/30 object-cover shrink-0"
                        />
                        {isProcessingAvatar && (
                          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center">
                            <RefreshCw size={20} className="text-white animate-spin" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <label className={`py-2 px-3 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors ${isProcessingAvatar ? 'bg-teal-400 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-700 active:bg-teal-800'}`}>
                            {isProcessingAvatar ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                            <span>{isProcessingAvatar ? 'Uploading...' : 'Upload'}</span>
                            <input 
                              type="file" 
                              accept="image/*" 
                              onChange={handleImageFileUpload} 
                              className="hidden" 
                              disabled={isProcessingAvatar} 
                            />
                          </label>
                          {avatarUrl && (
                            <button
                              type="button"
                              onClick={handleRemoveAvatarPhoto}
                              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 size={12} />
                              <span>Remove</span>
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          Upload a profile picture directly, or choose a built-in icon below.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5">Built-in Icons:</label>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {avatarOptions.map(({ key, label }) => {
                          const isSelected = selectedAvatarKey === key && !avatarUrl;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleSelectPresetAvatar(key)}
                              className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all shrink-0 cursor-pointer ${
                                isSelected ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60 ring-2 ring-teal-500/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750'
                              }`}
                            >
                              <AvatarIcon avatarKey={key} sizeClassName="w-8 h-8" />
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Profile Form Details */}
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Display Username / Handle</label>
                      <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                        <Lock size={12} className="text-teal-600" />
                        Full Name (Confidential)
                      </label>
                      <input
                        type="text"
                        value={realName}
                        onChange={(e) => setRealName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                          <Mail size={12} className="text-teal-600" />
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={studentEmail}
                          onChange={(e) => setStudentEmail(e.target.value)}
                          placeholder="name@student.fuhsi.edu.ng"
                          className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                          <Lock size={12} className="text-teal-600" />
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={emergencyPhone}
                          onChange={(e) => setEmergencyPhone(e.target.value)}
                          placeholder="e.g. 08012345678"
                          className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    {/* Department & Academic Level - Students Only (Not for Guest or Admin @modula) */}
                    {!isGuestAccount(userProfile) && !isModulaAccount(userProfile) && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <Lock size={12} className="text-teal-600 dark:text-teal-400" />
                            <span>Academic Registration Data</span>
                          </span>
                          <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                            Department Locked 🔒
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {/* Department (Read-only / Immutable) */}
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                              Department (Permanent)
                            </label>
                            <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between select-none">
                              <span className="truncate">{userProfile?.department || department || 'FUHSI Department'}</span>
                              <Lock size={12} className="text-slate-400 shrink-0 ml-1" />
                            </div>
                          </div>

                          {/* Academic Level (Editable) */}
                          <div className="space-y-1">
                            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                              Academic Level
                            </label>
                            <select
                              value={level}
                              onChange={(e) => setLevel(e.target.value)}
                              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              {levels.map((l) => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-start gap-1 leading-snug">
                          <Info size={11} className="text-teal-600 shrink-0 mt-0.5" />
                          <span>
                            Department cannot be changed because it is linked to your matric credentials.
                          </span>
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Bio / Profile Description</label>
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={2}
                        placeholder={isGuestAccount(userProfile) ? "Guest Member | FUHSI Connect Community" : "FUHSI Student | Learning & Saving Lives 🩺"}
                        className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  {saveErrorMessage && (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs font-bold rounded-xl text-center">
                      {saveErrorMessage}
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Save size={14} />
                      Save Profile
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT PERMANENT CONFIRMATION MODAL */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-200 dark:border-rose-900 p-6 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                    Delete Account Permanently
                  </h3>
                  <p className="text-xs text-rose-600 font-bold">
                    This action cannot be undone
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => {
                  if (!isDeletingAccount) {
                    setShowDeleteConfirmModal(false);
                    setDeleteConfirmText('');
                    setDeleteErrorMessage(null);
                  }
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Warning details */}
            <div className="py-4 space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-950 dark:text-rose-200 space-y-2">
                <p className="font-extrabold text-rose-900 dark:text-rose-100">
                  Are you sure you want to permanently delete your account (<span className="font-mono text-slate-900 dark:text-white underline">{userProfile?.nickname || 'Account'}</span>)?
                </p>
                <p className="text-[11px] leading-relaxed text-rose-800 dark:text-rose-300">
                  All your data will be permanently wiped from the database:
                </p>
                <ul className="text-[11px] list-disc list-inside space-y-1 text-rose-800 dark:text-rose-300 font-medium">
                  <li>Profile details, matric credentials & avatar</li>
                  <li>All your published threads, campus posts & polls</li>
                  <li>All your replies, comments & feedback</li>
                  <li>{isGuest ? 'Verification applications & account records' : 'Verification applications & marketplace listings'}</li>
                  <li>Follow records, connections & helpdesk history</li>
                </ul>
                <p className="text-[11px] font-bold text-rose-900 dark:text-rose-200 pt-1">
                  Once deleted, your account will cease to exist and you will not be able to log in or recover any information.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  To confirm, type <strong className="font-mono text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">{userProfile?.nickname ? userProfile.nickname.replace(/^@/, '') : 'DELETE'}</strong> or <strong className="font-mono text-rose-600 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800">DELETE</strong> below:
                </label>
                <input
                  type="text"
                  disabled={isDeletingAccount}
                  value={deleteConfirmText}
                  onChange={(e) => {
                    setDeleteConfirmText(e.target.value);
                    setDeleteErrorMessage(null);
                  }}
                  placeholder="Type to confirm..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 text-slate-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
                />
              </div>

              {deleteErrorMessage && (
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900 text-center">
                  {deleteErrorMessage}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => {
                  setShowDeleteConfirmModal(false);
                  setDeleteConfirmText('');
                  setDeleteErrorMessage(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                Keep Account
              </button>
              <button
                type="button"
                disabled={
                  isDeletingAccount ||
                  (deleteConfirmText.trim().toLowerCase() !== 'delete' &&
                   deleteConfirmText.trim().toLowerCase() !== (userProfile?.nickname || '').toLowerCase().replace(/^@/, ''))
                }
                onClick={async () => {
                  const expectedNick = (userProfile?.nickname || '').toLowerCase().replace(/^@/, '');
                  const typed = deleteConfirmText.trim().toLowerCase();
                  if (typed !== 'delete' && typed !== expectedNick) {
                    setDeleteErrorMessage(`Please type "${expectedNick || 'DELETE'}" or "DELETE" to confirm.`);
                    return;
                  }
                  try {
                    setIsDeletingAccount(true);
                    setDeleteErrorMessage(null);
                    if (onDeleteAccount) {
                      await onDeleteAccount();
                    }
                    setShowDeleteConfirmModal(false);
                    setIsEditingSettings(false);
                    if (onClose) onClose();
                  } catch (err: any) {
                    setIsDeletingAccount(false);
                    setDeleteErrorMessage(err?.message || 'Failed to delete account from database. Please try again.');
                  }
                }}
                className={`flex-1 py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                  deleteConfirmText.trim().toLowerCase() === 'delete' ||
                  deleteConfirmText.trim().toLowerCase() === (userProfile?.nickname || '').toLowerCase().replace(/^@/, '')
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isDeletingAccount ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Purging Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL-SIZE PROFILE PICTURE LIGHTBOX MODAL */}
      {showPictureModal && (
        <ProfilePictureModal
          nickname={userProfile?.nickname || '@Student'}
          avatarUrl={userProfile?.avatarUrl || ''}
          avatarKey={userProfile?.avatarKey || 'caduceus'}
          isOwner={true}
          onClose={() => setShowPictureModal(false)}
          onUploadClick={() => {
            handleOpenEditProfile();
          }}
        />
      )}

      {/* TABS: Threads (Posts), Replies & Bookmarks */}
      <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('threads')}
            className={`flex-1 py-3 text-xs sm:text-sm font-extrabold text-center relative transition-colors ${
              activeTab === 'threads' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Threads ({myPosts.length})
            {activeTab === 'threads' && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-1 bg-teal-700 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('replies')}
            className={`flex-1 py-3 text-xs sm:text-sm font-extrabold text-center relative transition-colors ${
              activeTab === 'replies' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Replies ({myReplies.length})
            {activeTab === 'replies' && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-1 bg-teal-700 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex-1 py-3 text-xs sm:text-sm font-extrabold text-center relative transition-colors ${
              activeTab === 'bookmarks' ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            Bookmarks ({bookmarkedPosts.length})
            {activeTab === 'bookmarks' && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-1 bg-teal-700 rounded-full" />
            )}
          </button>
        </div>

        {/* TAB CONTENTS */}
        <div className="p-3 sm:p-4 space-y-3">
          {/* TAB 1: THREADS / POSTS */}
          {activeTab === 'threads' && (
            <div>
              {myPosts.length > 0 ? (
                <div className="space-y-3">
                  {myPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      comments={allComments.filter((c) => c.postId === post.id)}
                      allComments={allComments}
                      currentUserNickname={myNickname}
                      userProfile={userProfile}
                      onLikeClick={onLikeClick}
                      onBookmarkClick={onBookmarkClick}
                      onCommentClick={onCommentClick}
                      onAuthorClick={onAuthorClick}
                      onDeletePost={onDeletePost}
                      onEditPost={onEditPost}
                      onRepost={onRepost}
                      onUndoRepost={onUndoRepost}
                      onQuote={onQuote}
                      onSelectPost={onSelectPost}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <FileText className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-extrabold text-xs text-slate-700">No threads posted yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    When you share campus updates or academic resources on the feed, your threads will appear here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REPLIES / COMMENTS */}
          {activeTab === 'replies' && (
            <div>
              {myReplies.length > 0 ? (
                <div className="space-y-2.5">
                  {myReplies.map((reply) => {
                    const parentPost = allPosts.find((p) => p.id === reply.postId);
                    return (
                      <div
                        key={reply.id}
                        className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs space-y-2 hover:border-teal-300 transition-all shadow-2xs relative group"
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium gap-2">
                          <div 
                            onClick={() => {
                              if (parentPost && onCommentClick) {
                                onCommentClick(parentPost);
                              }
                            }}
                            className="flex items-center gap-1.5 font-extrabold text-teal-800 truncate cursor-pointer hover:underline flex-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span className="truncate">
                              Replying on: "{parentPost ? (parentPost.content.length > 40 ? parentPost.content.substring(0, 40) + '...' : parentPost.content) : 'Campus Thread'}"
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {parentPost && (
                              <button
                                type="button"
                                onClick={() => onCommentClick && onCommentClick(parentPost)}
                                className="text-[10px] text-teal-700 hover:underline font-extrabold cursor-pointer"
                              >
                                View thread →
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingReplyId(reply.id);
                              }}
                              className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete reply"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <p 
                          onClick={() => {
                            if (parentPost && onCommentClick) {
                              onCommentClick(parentPost);
                            }
                          }}
                          className="text-slate-800 font-semibold leading-relaxed pl-3.5 border-l-2 border-teal-500/50 cursor-pointer"
                        >
                          {reply.content}
                        </p>

                        <div className="text-[10px] text-slate-400 font-medium text-right">
                          {formatRelativeTime(reply.timestamp)}
                        </div>

                        {deletingReplyId === reply.id && (
                          <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2 animate-in fade-in">
                            <div className="flex items-center gap-2 text-rose-900 font-bold">
                              <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                              <span>Are you sure you want to delete your reply?</span>
                            </div>
                            <div className="flex items-center gap-2 justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingReplyId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-bold text-[11px] hover:bg-slate-300 transition-colors cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingReplyId(null);
                                  if (onDeleteComment) onDeleteComment(reply.id);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-extrabold text-[11px] hover:bg-rose-700 transition-colors shadow-xs cursor-pointer"
                              >
                                Yes, Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <MessageSquare className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-extrabold text-xs text-slate-700">No replies yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    When you comment on posts in the campus feed, your replies will be listed here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BOOKMARKS */}
          {activeTab === 'bookmarks' && (
            <div>
              {bookmarkedPosts.length > 0 ? (
                <div className="space-y-3">
                  {bookmarkedPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      comments={allComments.filter((c) => c.postId === post.id)}
                      allComments={allComments}
                      currentUserNickname={myNickname}
                      userProfile={userProfile}
                      onLikeClick={onLikeClick}
                      onBookmarkClick={onBookmarkClick}
                      onCommentClick={onCommentClick}
                      onAuthorClick={onAuthorClick}
                      onDeletePost={onDeletePost}
                      onEditPost={onEditPost}
                      onRepost={onRepost}
                      onUndoRepost={onUndoRepost}
                      onQuote={onQuote}
                      onSelectPost={onSelectPost}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <Bookmark className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="font-extrabold text-xs text-slate-700">No bookmarked posts</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Tap the bookmark icon on any campus thread to save it here for quick reference.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Verification Information & Application Modal */}
      {showVerificationModal && (
        <VerificationModal
          userProfile={userProfile}
          onClose={() => setShowVerificationModal(false)}
          onSubmitVerification={(data) => {
            onSubmitVerification?.(data);
          }}
        />
      )}

      {/* Followers & Following List Modal */}
      {showFollowersModal && (
        <FollowersListModal
          targetNickname={myNickname}
          initialTab={showFollowersModal.tab}
          allFollows={allFollows}
          allUsers={allUsers}
          currentUserNickname={myNickname}
          onToggleFollow={onToggleFollow}
          onSelectUser={(selectedNick) => {
            setShowFollowersModal(null);
            if (onAuthorClick) {
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
              onAuthorClick(dummyPost);
            }
          }}
          onClose={() => setShowFollowersModal(null)}
        />
      )}

      {/* Image Crop Modal for Profile Picture */}
      {cropImageSource && (
        <ImageCropModal
          imageSrc={cropImageSource}
          title="Crop Profile Picture"
          onClose={() => setCropImageSource(null)}
          onCropComplete={(croppedDataUrl) => {
            setAvatarUrl(croppedDataUrl);
            setIsAvatarDirty(true);
            setCropImageSource(null);
          }}
        />
      )}
    </div>
  );
};
