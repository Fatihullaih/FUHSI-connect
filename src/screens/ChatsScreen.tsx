import React, { useState, useEffect, useMemo, useRef } from 'react';
import { UserProfile, ChatConversation, DirectMessage, ChatReport, ChatGroup } from '../types';
import { AvatarIcon } from '../components/AvatarIcon';
import { VerificationBadge } from '../components/VerificationBadge';
import { isDemoUser, isDemoNickname } from '../utils/postGenerator';
import { getUserBadgeInfo } from '../utils/verificationUtils';
import { isGuestAccount, isModulaAccount } from '../utils/userDbUtils';
import { 
  getStoredDirectMessages, 
  getUserConversations, 
  sendDirectMessage, 
  markConversationMessagesAsRead,
  deleteConversationForUser, 
  submitChatReport, 
  extractPreservedReportEvidence,
  getConversationId, 
  normalizeNickname,
  formatMessageTime,
  extractPureStudentHandle,
  reactToDirectMessage,
  deleteDirectMessageForMe,
  deleteDirectMessageForEveryone,
  clearConversationHistoryForUser,
  parseMessageTimestampMs,
  formatMessageDateDivider,
  DIRECT_MESSAGES_KEY
} from '../utils/messagingUtils';
import { 
  checkUserChatRestriction, 
  formatRestrictionRemainingTime 
} from '../utils/safetyFilter';
import { isUserOnline } from '../utils/presenceUtils';
import { 
  subscribeDirectMessagesByConversation, 
  subscribeChatGroups 
} from '../lib/firestoreSync';
import { 
  getUserGroups, 
  updateGroupLastMessage, 
  deleteChatGroup,
  leaveGroup,
  saveStoredChatGroups,
  getStoredChatGroups,
  mergeFirestoreGroupsIntoStorage,
  markGroupMessagesAsRead,
  setGroupLastReadTime,
  formatGroupSystemMessage
} from '../utils/groupUtils';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { ChatMessageActionsModal } from '../components/ChatMessageActionsModal';
import { ChatForwardModal } from '../components/ChatForwardModal';
import { ChatDeleteModal } from '../components/ChatDeleteModal';
import { CreateGroupModal } from '../components/CreateGroupModal';
import { GroupInfoModal } from '../components/GroupInfoModal';
import { 
  MessageSquare, 
  Search, 
  Send, 
  ShieldCheck, 
  ShieldAlert, 
  Trash2, 
  Lock, 
  AlertTriangle, 
  CheckCheck, 
  Sparkles, 
  ChevronLeft, 
  UserPlus, 
  X, 
  Flag, 
  Check, 
  Info,
  BadgeAlert,
  ArrowDown,
  Reply,
  Copy,
  Forward,
  Smile,
  MoreVertical,
  MessageSquarePlus,
  Plus,
  Users,
  Eraser,
  LogOut
} from 'lucide-react';

interface ChatsScreenProps {
  userProfile: UserProfile;
  onOpenProfile?: (nickname: string) => void;
  initialConversationId?: string;
  initialRecipientNickname?: string;
  initialRecipient?: { nickname: string; avatarKey?: string; avatarUrl?: string } | null;
  onClearInitialRecipient?: () => void;
  allUsers?: UserProfile[];
}

export const ChatsScreen: React.FC<ChatsScreenProps> = ({
  userProfile,
  onOpenProfile,
  initialConversationId,
  initialRecipientNickname,
  initialRecipient,
  onClearInitialRecipient,
  allUsers = [],
}) => {
  const isCurrentUserGuest = isGuestAccount(userProfile);

  if (isCurrentUserGuest) {
    return null;
  }

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [activeGroup, setActiveGroup] = useState<ChatGroup | null>(null);
  const [groupDeleteModalTarget, setGroupDeleteModalTarget] = useState<ChatGroup | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [activeRecipient, setActiveRecipient] = useState<{
    nickname: string;
    avatarKey?: string;
    avatarUrl?: string;
    badgeType?: string;
    badgeTitle?: string;
    isVerified?: boolean;
  } | null>(null);

  const [activeMessages, setActiveMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DirectMessage | null>(null);
  const [selectedMessageForAction, setSelectedMessageForAction] = useState<DirectMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DirectMessage | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<DirectMessage | null>(null);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('HARASSMENT');
  const [reportNotes, setReportNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'warning' | 'error' | 'success' } | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [presenceTick, setPresenceTick] = useState(0);

  // Group @ Mention states
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCursorIndex, setMentionCursorIndex] = useState<number>(-1);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const myNickname = userProfile?.nickname || '@Student';
  const cleanMyNickname = normalizeNickname(myNickname);

  // Live presence tick & event listener
  useEffect(() => {
    const timer = setInterval(() => {
      setPresenceTick((t) => t + 1);
    }, 4000);

    const handlePresenceEvent = () => setPresenceTick((t) => t + 1);
    window.addEventListener('fuhsi_presence_updated', handlePresenceEvent);
    window.addEventListener('fuhsi_users_updated', handlePresenceEvent);

    return () => {
      clearInterval(timer);
      window.removeEventListener('fuhsi_presence_updated', handlePresenceEvent);
      window.removeEventListener('fuhsi_users_updated', handlePresenceEvent);
    };
  }, []);

  // Check if current user is restricted
  const restrictionInfo = useMemo(() => {
    return checkUserChatRestriction(cleanMyNickname);
  }, [cleanMyNickname, conversations]);

  // Clean recipient display handle (e.g. '@deji') - strictly pure student nickname, never conv_admin_deji
  const cleanRecipientDisplay = useMemo(() => {
    if (!activeRecipient?.nickname) return '@Student';
    return extractPureStudentHandle(activeRecipient.nickname, myNickname);
  }, [activeRecipient, myNickname]);

  // Check if recipient is online / active in real-time
  const isRecipientOnline = useMemo(() => {
    if (!activeRecipient) return false;
    const cleanTarget = normalizeNickname(cleanRecipientDisplay);
    let match = allUsers.find(
      (u) => normalizeNickname(u.nickname) === cleanTarget || u.id === cleanTarget
    );
    if (!match) {
      try {
        const uStr = localStorage.getItem('fuhsi_users_db');
        if (uStr) {
          const uList: UserProfile[] = JSON.parse(uStr);
          match = uList.find(
            (u) => normalizeNickname(u.nickname) === cleanTarget || u.id === cleanTarget
          );
        }
      } catch (e) {}
    }
    return isUserOnline(match);
  }, [activeRecipient, cleanRecipientDisplay, allUsers, presenceTick]);

  // Filter messages excluding those deleted for the current user
  const visibleMessages = useMemo(() => {
    return activeMessages.filter((msg) => {
      if (!msg) return false;
      if (msg.deletedForUsers && msg.deletedForUsers.some((u) => normalizeNickname(u) === cleanMyNickname)) {
        return false;
      }
      return true;
    });
  }, [activeMessages, cleanMyNickname]);

  // Group @ Mention Members calculation
  const matchingMentionMembers = useMemo(() => {
    if (!activeGroup || mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const members = activeGroup.memberNicknames || [];
    return members
      .filter((m) => {
        const clean = normalizeNickname(m);
        if (clean === cleanMyNickname) return false;
        if (!q) return true;
        return clean.toLowerCase().includes(q);
      })
      .map((nick) => {
        const clean = normalizeNickname(nick);
        const match = allUsers.find(
          (u) => normalizeNickname(u.nickname) === clean || u.id === clean
        );
        return {
          nickname: nick.startsWith('@') ? nick : `@${nick}`,
          cleanNickname: clean,
          realName: match?.realName || clean,
          avatarKey: match?.avatarKey || '1',
          avatarUrl: match?.avatarUrl,
          department: match?.department,
          badgeType: match?.badgeType || 'GREEN',
        };
      })
      .slice(0, 8);
  }, [activeGroup, mentionQuery, cleanMyNickname, allUsers]);

  const insertMention = (memberNickname: string) => {
    if (mentionCursorIndex < 0) return;
    const before = inputText.slice(0, mentionCursorIndex);
    const after = inputText.slice(mentionCursorIndex + 1 + (mentionQuery?.length || 0));
    const tag = memberNickname.startsWith('@') ? memberNickname : `@${memberNickname}`;
    const nextText = `${before}${tag} ${after}`;
    setInputText(nextText);
    setMentionQuery(null);
    setMentionCursorIndex(-1);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = before.length + tag.length + 1;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 40);
  };

  // Load conversations and groups
  const refreshConversations = () => {
    if (!myNickname) return;
    let userConvs = getUserConversations(myNickname);
    if (isCurrentUserGuest) {
      userConvs = userConvs.filter((c) => isModulaAccount(c.otherUserNickname));
    }
    setConversations((prev) => {
      if (prev.length === userConvs.length) {
        const isSame = prev.every((p, i) => {
          const u = userConvs[i];
          return (
            p.id === u.id &&
            p.unreadCount === u.unreadCount &&
            p.lastMessage === u.lastMessage &&
            p.lastTimestamp === u.lastTimestamp &&
            p.otherUserNickname === u.otherUserNickname
          );
        });
        if (isSame) return prev;
      }
      return userConvs;
    });

    const userGroups = getUserGroups(myNickname);
    setGroups(userGroups);
  };

  useEffect(() => {
    refreshConversations();

    const handleUpdate = () => refreshConversations();
    window.addEventListener('fuhsi_direct_message_updated', handleUpdate);
    window.addEventListener('fuhsi_conversation_deleted', handleUpdate);
    window.addEventListener('fuhsi_chat_restriction_updated', handleUpdate);
    window.addEventListener('fuhsi_group_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    const unsubGroups = subscribeChatGroups((firestoreGroups) => {
      if (firestoreGroups) {
        mergeFirestoreGroupsIntoStorage(firestoreGroups);
        refreshConversations();
      }
    });

    // Heartbeat to guarantee update of unread counts without rapid re-renders
    const timer = setInterval(handleUpdate, 4000);

    return () => {
      window.removeEventListener('fuhsi_direct_message_updated', handleUpdate);
      window.removeEventListener('fuhsi_conversation_deleted', handleUpdate);
      window.removeEventListener('fuhsi_chat_restriction_updated', handleUpdate);
      window.removeEventListener('fuhsi_group_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      clearInterval(timer);
      if (unsubGroups) unsubGroups();
    };
  }, [myNickname]);

  // Handle initial recipient or conversation
  useEffect(() => {
    if (initialRecipient && initialRecipient.nickname) {
      handleSelectRecipient(initialRecipient.nickname, initialRecipient.avatarKey, initialRecipient.avatarUrl);
      if (onClearInitialRecipient) onClearInitialRecipient();
    } else if (initialRecipientNickname) {
      handleSelectRecipient(initialRecipientNickname);
    } else if (initialConversationId) {
      setActiveConvId(initialConversationId);
    }
  }, [initialRecipient, initialRecipientNickname, initialConversationId]);

  // Resolve recipient or group metadata independently so message subscriptions don't tear down
  useEffect(() => {
    if (!activeConvId) {
      setActiveRecipient(null);
      setActiveGroup(null);
      return;
    }

    if (activeConvId.startsWith('group_')) {
      const match = groups.find((g) => g.id === activeConvId) || getUserGroups(cleanMyNickname).find((g) => g.id === activeConvId);
      setActiveGroup(match || null);
      setActiveRecipient(null);
      return;
    }

    setActiveGroup(null);
    const conv = conversations.find((c) => c.id === activeConvId);
    if (conv) {
      const pureNick = extractPureStudentHandle(conv.otherUserNickname, myNickname);
      setActiveRecipient({
        nickname: pureNick,
        avatarKey: conv.otherUserAvatarKey || '1',
        avatarUrl: conv.otherUserAvatarUrl,
        badgeType: conv.otherUserBadgeType,
        badgeTitle: conv.otherUserBadgeTitle,
        isVerified: conv.otherUserIsVerified,
      });
    } else {
      // Resolve for new conversations with no existing message records
      const rawTarget = initialRecipient?.nickname || initialRecipientNickname || activeConvId;
      const pureNick = extractPureStudentHandle(rawTarget, myNickname);
      const cleanTarget = normalizeNickname(pureNick);
      const userMatch = allUsers.find(
        (u) => normalizeNickname(u.nickname) === cleanTarget || u.id === cleanTarget || u.studentEmail?.toLowerCase() === cleanTarget
      );

      setActiveRecipient((prev) => {
        if (prev && normalizeNickname(prev.nickname) === cleanTarget && prev.avatarKey) {
          return prev;
        }
        const isGuest = isGuestAccount(userMatch);
        return {
          nickname: pureNick,
          avatarKey: initialRecipient?.avatarKey || userMatch?.avatarKey || '1',
          avatarUrl: initialRecipient?.avatarUrl || userMatch?.avatarUrl,
          badgeType: userMatch?.badgeType || 'GREEN',
          badgeTitle: isGuest ? 'Guest' : (userMatch?.badgeTitle || 'FUHSI Student'),
          isVerified: Boolean(userMatch?.isVerified || userMatch?.verificationStatus === 'approved'),
        };
      });
    }
  }, [activeConvId, conversations, groups, initialRecipientNickname, allUsers, cleanMyNickname]);

  // Load messages and subscribe to Firestore for activeConvId ONLY
  useEffect(() => {
    if (!activeConvId) {
      setActiveMessages([]);
      return;
    }

    // 1. Populate cached local messages
    const localMsgs = getStoredDirectMessages()
      .filter((m) => {
        if (!m) return false;
        const matchesConv = (m.conversationId || getConversationId(m.senderNickname, m.receiverNickname)) === activeConvId || m.groupId === activeConvId;
        return matchesConv;
      })
      .sort((a, b) => {
        const tA = parseMessageTimestampMs(a);
        const tB = parseMessageTimestampMs(b);
        if (tA !== tB) return tA - tB;
        return (a.id || '').localeCompare(b.id || '');
      });
    setActiveMessages(localMsgs);

    // Mark incoming messages as read by this user
    markConversationMessagesAsRead(activeConvId, myNickname);

    // 2. Subscribe to Firestore real-time messages for this conversation
    const unsubscribe = subscribeDirectMessagesByConversation(
      activeConvId,
      (firestoreMsgs) => {
        if (firestoreMsgs && firestoreMsgs.length > 0) {
          // Merge incoming Firestore messages into local storage so utils can find them
          try {
            const stored = getStoredDirectMessages();
            const storedMap = new Map<string, DirectMessage>();
            stored.forEach((m) => storedMap.set(m.id, m));
            let sChanged = false;
            firestoreMsgs.forEach((fm) => {
              const existing = storedMap.get(fm.id);
              if (!existing || JSON.stringify(existing) !== JSON.stringify(fm)) {
                storedMap.set(fm.id, fm);
                sChanged = true;
              }
            });
            if (sChanged) {
              localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(Array.from(storedMap.values())));
            }
          } catch (err) {
            console.error(err);
          }

          setActiveMessages((prev) => {
            const map = new Map<string, DirectMessage>();
            prev.forEach((m) => map.set(m.id, m));
            firestoreMsgs.forEach((m) => map.set(m.id, m));
            const list = Array.from(map.values());
            list.sort((a, b) => {
              const tA = parseMessageTimestampMs(a);
              const tB = parseMessageTimestampMs(b);
              if (tA !== tB) return tA - tB;
              return (a.id || '').localeCompare(b.id || '');
            });
            return list;
          });

          // Check if any incoming message to me is unread, and mark as read
          const hasUnreadIncoming = firestoreMsgs.some(
            (m) =>
              (normalizeNickname(m.receiverNickname) === cleanMyNickname && !m.isRead) ||
              ((m.isGroupMessage || activeConvId.startsWith('group_')) &&
                normalizeNickname(m.senderNickname) !== cleanMyNickname &&
                (!m.readByUsers || !m.readByUsers.some((u) => normalizeNickname(u) === cleanMyNickname)))
          );
          if (hasUnreadIncoming) {
            markConversationMessagesAsRead(activeConvId, myNickname);
            if (activeConvId.startsWith('group_')) {
              markGroupMessagesAsRead(activeConvId, myNickname);
            }
          }
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeConvId]);

  // Auto scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [activeConvId]);

  // Smooth scroll only when new messages are added
  const prevMsgLengthRef = useRef(0);
  useEffect(() => {
    if (activeMessages.length > prevMsgLengthRef.current) {
      scrollToBottom('smooth');
    }
    prevMsgLengthRef.current = activeMessages.length;
  }, [activeMessages.length]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  // Select or initiate chat with a recipient
  const handleSelectRecipient = (targetNickname: string, avatarKey?: string, avatarUrl?: string) => {
    const pureTarget = extractPureStudentHandle(targetNickname, myNickname);
    const cleanTarget = normalizeNickname(pureTarget);
    if (cleanTarget === cleanMyNickname) {
      showToast('You cannot start a conversation with yourself.', 'info');
      return;
    }

    const convId = getConversationId(myNickname, pureTarget);
    if (isCurrentUserGuest && !isModulaAccount(pureTarget)) {
      showToast('Guest accounts can only exchange private messages directly with Campus Administration (@modula).', 'info');
      return;
    }
    setActiveConvId(convId);

    // Resolve user details
    const userMatch = allUsers.find(
      (u) => normalizeNickname(u.nickname) === cleanTarget || u.id === cleanTarget || u.id === targetNickname
    );

    const isGuest = isGuestAccount(userMatch);
    setActiveRecipient({
      nickname: pureTarget,
      avatarKey: avatarKey || userMatch?.avatarKey || '1',
      avatarUrl: avatarUrl || userMatch?.avatarUrl,
      badgeType: userMatch?.badgeType || 'GREEN',
      badgeTitle: isGuest ? 'Guest' : (userMatch?.badgeTitle || 'FUHSI Student'),
      isVerified: Boolean(userMatch?.isVerified || userMatch?.verificationStatus === 'approved'),
    });
    setActiveGroup(null);

    setShowNewChatModal(false);
  };

  // Select a group conversation
  const handleSelectGroup = (group: ChatGroup) => {
    setActiveConvId(group.id);
    setActiveGroup(group);
    setActiveRecipient(null);
    markGroupMessagesAsRead(group.id, myNickname);
    refreshConversations();
  };

  const handleGroupCreated = (newGroup: ChatGroup) => {
    setShowCreateGroupModal(false);
    refreshConversations();
    setActiveConvId(newGroup.id);
    setActiveGroup(newGroup);
    setActiveRecipient(null);
    showToast(`Group "${newGroup.name}" created!`, 'success');
  };

  const handleGroupUpdated = (updatedGroup: ChatGroup) => {
    setActiveGroup(updatedGroup);
    refreshConversations();
  };

  const handleLeaveOrDeleteGroup = (groupId: string) => {
    if (activeConvId === groupId) {
      setActiveConvId(null);
      setActiveGroup(null);
    }
    refreshConversations();
  };

  const handleDeleteOrLeaveGroupClick = (e: React.MouseEvent, group: ChatGroup) => {
    e.stopPropagation();
    setGroupDeleteModalTarget(group);
  };

  const handleConfirmExitAndDeleteGroup = (group: ChatGroup) => {
    const isCreator = normalizeNickname(group.createdBy) === cleanMyNickname;
    if (isCreator) {
      deleteChatGroup(group.id, myNickname);
      showToast(`Group "${group.name}" deleted for all members.`, 'info');
    } else {
      leaveGroup(group.id, myNickname);
      showToast(`Exited and removed group "${group.name}".`, 'info');
    }
    clearConversationHistoryForUser(group.id, myNickname);
    handleLeaveOrDeleteGroup(group.id);
  };

  const handleConfirmClearGroupHistoryOnly = (group: ChatGroup) => {
    try {
      clearConversationHistoryForUser(group.id, myNickname);
      if (activeConvId === group.id) {
        setActiveMessages([]);
      }
      refreshConversations();
      showToast(`Message history for "${group.name}" cleared on your device.`, 'success');
    } catch (err: any) {
      showToast('Failed to clear group message history', 'error');
    }
  };

  const showToast = (text: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Send message
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !activeConvId || (!activeRecipient && !activeGroup)) return;

    if (restrictionInfo.isRestricted) {
      showToast(`Chat Restricted: ${restrictionInfo.reason} (${formatRestrictionRemainingTime(restrictionInfo.restrictedUntil)} remaining).`, 'error');
      return;
    }

    setIsSending(true);

    if (activeGroup) {
      const cleanSender = normalizeNickname(myNickname);
      // Extract mentioned usernames from input text
      const mentionMatches = Array.from(inputText.matchAll(/@([a-zA-Z0-9_]+)/g));
      const mentionedNicknames = Array.from(
        new Set(mentionMatches.map((m) => normalizeNickname(m[1])).filter(Boolean))
      );

      const newMsg: DirectMessage = {
        id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        conversationId: activeGroup.id,
        senderNickname: myNickname.startsWith('@') ? myNickname : `@${myNickname}`,
        receiverNickname: 'group',
        text: inputText.trim(),
        timestamp: new Date().toISOString(),
        isGroupMessage: true,
        groupId: activeGroup.id,
        readByUsers: [cleanSender],
        mentionedNicknames: mentionedNicknames.length > 0 ? mentionedNicknames : undefined,
        ...(replyingTo ? {
          replyToMessageId: replyingTo.id,
          replyToText: replyingTo.text,
          replyToSender: replyingTo.senderNickname,
        } : {}),
      };

      const result = sendDirectMessage(newMsg);

      if (result.isBlocked) {
        showToast(result.warningMessage || '⚠️ Message blocked by safety filter.', 'error');
        setIsSending(false);
        return;
      }

      if (result.warningMessage) {
        showToast(result.warningMessage, 'warning');
      }

      setGroupLastReadTime(activeGroup.id, myNickname, new Date().toISOString());
      updateGroupLastMessage(activeGroup.id, inputText.trim(), myNickname);
      setInputText('');
      setMentionQuery(null);
      setMentionCursorIndex(-1);
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      setIsSending(false);
      refreshConversations();
      return;
    }

    const newMsg: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: activeConvId,
      senderNickname: myNickname.startsWith('@') ? myNickname : `@${myNickname}`,
      receiverNickname: cleanRecipientDisplay,
      text: inputText.trim(),
      timestamp: new Date().toISOString(),
      ...(replyingTo ? {
        replyToMessageId: replyingTo.id,
        replyToText: replyingTo.text,
        replyToSender: replyingTo.senderNickname,
      } : {}),
    };

    const result = sendDirectMessage(newMsg);

    if (result.isBlocked) {
      showToast(result.warningMessage || '⚠️ Message blocked by safety filter.', 'error');
      setIsSending(false);
      return;
    }

    if (result.warningMessage) {
      showToast(result.warningMessage, 'warning');
    }

    setInputText('');
    setReplyingTo(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setIsSending(false);
    refreshConversations();
  };

  // Toggle emoji reaction on message
  const handleReactToMessage = (messageId: string, emoji: string) => {
    const targetMsg = activeMessages.find((m) => m.id === messageId);
    reactToDirectMessage(messageId, emoji, myNickname, targetMsg);
    setActiveMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          const reactions = { ...(m.reactions || {}) };
          const reactors = reactions[emoji] || [];
          const userTag = myNickname.startsWith('@') ? myNickname : `@${myNickname}`;
          const cleanMe = normalizeNickname(myNickname);
          const hasReacted = reactors.some((u) => normalizeNickname(u) === cleanMe);
          if (hasReacted) {
            reactions[emoji] = reactors.filter((u) => normalizeNickname(u) !== cleanMe);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji] = [...reactors, userTag];
          }
          return { ...m, reactions };
        }
        return m;
      })
    );
  };

  // Copy message text
  const handleCopyMessage = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('Message copied to clipboard', 'success');
      }).catch(() => {
        showToast('Failed to copy message', 'error');
      });
    } else {
      showToast('Clipboard not supported', 'info');
    }
  };

  // Forward message to selected student
  const handleForwardTo = (targetNickname: string) => {
    if (!forwardingMessage) return;
    const cleanTarget = normalizeNickname(targetNickname);
    const targetDisplay = targetNickname.startsWith('@') ? targetNickname : `@${targetNickname}`;
    const targetConvId = getConversationId(cleanMyNickname, cleanTarget);

    const fwdMsg: DirectMessage = {
      id: `dm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: targetConvId,
      senderNickname: myNickname.startsWith('@') ? myNickname : `@${myNickname}`,
      receiverNickname: targetDisplay,
      text: forwardingMessage.text,
      timestamp: new Date().toISOString(),
    };

    const result = sendDirectMessage(fwdMsg);
    if (result.isBlocked) {
      showToast(result.warningMessage || 'Forwarding blocked by safety filter.', 'error');
      return;
    }

    showToast(`Forwarded to ${targetDisplay}`, 'success');
    refreshConversations();
  };

  // Delete message for me
  const handleDeleteForMe = (messageId: string) => {
    const targetMsg = activeMessages.find((m) => m.id === messageId);
    deleteDirectMessageForMe(messageId, myNickname, targetMsg);
    setActiveMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          const deletedFor = Array.isArray(m.deletedForUsers) ? [...m.deletedForUsers] : [];
          if (!deletedFor.includes(cleanMyNickname)) deletedFor.push(cleanMyNickname);
          return { ...m, deletedForUsers: deletedFor };
        }
        return m;
      })
    );
    showToast('Message deleted for you', 'info');
  };

  // Delete message for everyone
  const handleDeleteForEveryone = (messageId: string) => {
    const targetMsg = activeMessages.find((m) => m.id === messageId);
    deleteDirectMessageForEveryone(messageId, targetMsg);
    setActiveMessages((prev) =>
      prev.map((m) => {
        if (m.id === messageId) {
          return {
            ...m,
            isDeletedForEveryone: true,
            text: '🚫 This message was deleted',
          };
        }
        return m;
      })
    );
    showToast('Message deleted for everyone', 'info');
    refreshConversations();
  };

  // Delete conversation
  const handleDeleteConversation = (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (window.confirm('Delete this conversation? It will be removed from your chat list.')) {
      deleteConversationForUser(convId, myNickname);
      if (activeConvId === convId) {
        setActiveConvId(null);
        setActiveRecipient(null);
      }
      refreshConversations();
      showToast('Conversation deleted.', 'info');
    }
  };

  // Submit report
  const handleSubmitReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecipient || !activeConvId) return;

    // Securely extract strictly the last 5 messages from @reporter ↔ @reportedUser in exact chronological order
    const preservedEvidence = extractPreservedReportEvidence(
      myNickname,
      activeRecipient.nickname,
      activeMessages
    );

    const report: ChatReport = {
      id: `chatreport_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      conversationId: activeConvId,
      reportedNickname: activeRecipient.nickname.startsWith('@') ? activeRecipient.nickname : `@${activeRecipient.nickname}`,
      reporterNickname: myNickname.startsWith('@') ? myNickname : `@${myNickname}`,
      reason: reportReason,
      notes: reportNotes.trim() || undefined,
      messageSnippet: preservedEvidence[preservedEvidence.length - 1]?.text || activeMessages[activeMessages.length - 1]?.text || 'Chat conversation reported',
      recentMessages: preservedEvidence,
      timestamp: new Date().toISOString(),
      status: 'PENDING',
    };

    submitChatReport(report);
    setShowReportModal(false);
    setReportNotes('');
    showToast('Report submitted. The moderation case has been securely created for review.', 'success');
  };

  // Filtered conversations
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase().replace(/^@/, '');
    return conversations.filter(
      (c) =>
        (c.otherUserNickname && c.otherUserNickname.toLowerCase().includes(q)) ||
        (c.lastMessage && c.lastMessage.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groups;
    const q = searchQuery.toLowerCase().trim();
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description && g.description.toLowerCase().includes(q)) ||
        (g.lastMessage && g.lastMessage.toLowerCase().includes(q))
    );
  }, [groups, searchQuery]);

  // Tab filtering flags
  const showDirect = activeTab === 'all' || activeTab === 'direct';
  const showGroups = activeTab === 'all' || activeTab === 'groups';

  type ChatListItem = 
    | { type: 'group'; data: ChatGroup; sortTime: number }
    | { type: 'direct'; data: ChatConversation; sortTime: number };

  const combinedChatList = useMemo(() => {
    const list: ChatListItem[] = [];
    if (showGroups) {
      filteredGroups.forEach((g) => {
        list.push({
          type: 'group',
          data: g,
          sortTime: new Date(g.updatedAt || g.createdAt || 0).getTime(),
        });
      });
    }
    if (showDirect) {
      filteredConversations.forEach((c) => {
        list.push({
          type: 'direct',
          data: c,
          sortTime: new Date(c.lastTimestamp || 0).getTime(),
        });
      });
    }
    list.sort((a, b) => b.sortTime - a.sortTime);
    return list;
  }, [showGroups, showDirect, filteredGroups, filteredConversations]);

  // Filtered students for New Chat
  const eligibleNewChatStudents = useMemo(() => {
    if (isCurrentUserGuest) {
      return allUsers.filter((u) => isModulaAccount(u));
    }
    const q = newChatSearch.toLowerCase().replace(/^@/, '');
    return allUsers
      .filter((u) => {
        if (!u || isDemoUser(u) || isDemoNickname(u.nickname)) return false;
        if (u.isDeclined || u.verificationStatus === 'declined') return false;
        const nick = normalizeNickname(u.nickname);
        if (!nick || nick === cleanMyNickname) return false;
        if (nick === 'yi' || nick === '@yi') return false;
        if (!q) return true;
        return nick.includes(q);
      })
      .slice(0, 15);
  }, [allUsers, newChatSearch, cleanMyNickname, isCurrentUserGuest]);

  // Suggested quick messages
  const quickReplies = [
    'Hello 👋',
    'How are you doing?',
    'Are you on campus today?',
    'When is the next lecture?',
    'Thanks for the update!',
    'See you around campus!',
  ];

  const quickRepliesGroup = [
    'Hello everyone 👋',
    'Any updates on today’s class?',
    'When is our group meeting?',
    'Thanks for sharing!',
    'See you all around campus!',
    'Noted, thank you!',
  ];

  const displayedQuickReplies = activeGroup ? quickRepliesGroup : quickReplies;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto bg-slate-50 border-x border-slate-200 shadow-xs overflow-hidden">
      {/* Toast Banner */}
      {toastMessage && (
        <div 
          className={`px-4 py-2.5 text-xs font-bold flex items-center justify-between z-50 transition-all ${
            toastMessage.type === 'error'
              ? 'bg-rose-600 text-white'
              : toastMessage.type === 'warning'
              ? 'bg-amber-500 text-slate-900'
              : toastMessage.type === 'success'
              ? 'bg-emerald-600 text-white'
              : 'bg-teal-700 text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'error' || toastMessage.type === 'warning' ? (
              <AlertTriangle size={15} className="shrink-0" />
            ) : (
              <Check size={15} className="shrink-0" />
            )}
            <span className="leading-snug">{toastMessage.text}</span>
          </div>
          <button 
            onClick={() => setToastMessage(null)} 
            className="p-1 hover:bg-black/10 rounded-lg cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Layout: Split Screen on Desktop, Toggle on Mobile */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Conversation List (Hidden on mobile when conversation is active) */}
        <div 
          className={`w-full md:w-80 lg:w-96 bg-white border-r border-slate-200 flex flex-col shrink-0 ${
            activeConvId ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between gap-2 bg-white sticky top-0 z-10">
            <div>
              <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <span>Chats</span>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" title="Live connection active" />
              </h1>
              <p className="text-[11px] font-bold text-slate-400 mt-0.5">
                {conversations.length} direct • {groups.length} group{groups.length !== 1 ? 's' : ''}
              </p>
            </div>
            {!isCurrentUserGuest && (
              <div className="flex items-center gap-1.5">
                <button
                  id="chats-header-create-group-btn"
                  onClick={() => setShowCreateGroupModal(true)}
                  className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Create a Group"
                >
                  <Users size={14} />
                  <span>+ Group</span>
                </button>
              </div>
            )}
          </div>

          {/* Chat Category Tabs */}
          <div className="flex border-b border-slate-100 px-3 pt-2 pb-1.5 gap-1 bg-slate-50/70 shrink-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              All ({conversations.length + groups.length})
            </button>
            <button
              onClick={() => setActiveTab('direct')}
              className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'direct'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              Direct ({conversations.length})
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`px-3 py-1 text-xs font-extrabold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                activeTab === 'groups'
                  ? 'bg-teal-700 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Users size={11} />
              <span>Groups ({groups.length})</span>
            </button>
          </div>

          {/* Safety & Privacy Notice */}
          <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200/80 text-[11px] font-extrabold text-slate-700 flex items-center gap-1.5 select-none">
            <Lock size={13} className="text-teal-700 shrink-0" />
            <span>Private & Protected</span>
          </div>

          {/* Restriction Banner (If User is Restricted) */}
          {restrictionInfo.isRestricted && (
            <div className="m-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 space-y-1.5">
              <div className="flex items-center gap-1.5 font-extrabold text-xs text-rose-800">
                <BadgeAlert size={15} className="text-rose-600 shrink-0" />
                <span>Chat Restricted</span>
              </div>
              <p className="text-[11px] leading-snug font-medium text-rose-700">
                Your chat access has been temporarily restricted because of repeated violations of the FUHSI Connect community rules.
              </p>
              <div className="text-[10px] bg-white/70 p-2 rounded-xl border border-rose-100 space-y-0.5 font-bold">
                <div>Reason: <span className="font-medium text-rose-800">{restrictionInfo.reason}</span></div>
                <div>Duration: <span className="font-extrabold text-rose-900">{formatRestrictionRemainingTime(restrictionInfo.restrictedUntil)} remaining</span></div>
              </div>
            </div>
          )}

          {/* Search Box */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username, groups or messages..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/70 border border-transparent focus:border-teal-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Conversations & Groups Combined List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {combinedChatList.length === 0 ? (
              <div className="p-8 text-center space-y-3 my-auto">
                <div className="w-12 h-12 bg-teal-50 text-teal-700 rounded-2xl flex items-center justify-center mx-auto border border-teal-100">
                  <MessageSquare size={22} />
                </div>
                <h3 className="text-xs font-black text-slate-800">
                  {activeTab === 'groups' ? 'No Groups Joined Yet' : 'No Conversations Yet'}
                </h3>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  {activeTab === 'groups'
                    ? 'Create a study group or team chat with your fellow students!'
                    : 'Start a chat with students using the floating chat button or create a group.'}
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    onClick={() => setShowCreateGroupModal(true)}
                    className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-extrabold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    + Create Group
                  </button>
                  <button
                    onClick={() => setShowNewChatModal(true)}
                    className="px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    Find Students
                  </button>
                </div>
              </div>
            ) : (
              combinedChatList.map((item) => {
                if (item.type === 'group') {
                  const group = item.data;
                  const isSelected = group.id === activeConvId;
                  const hasUnread = (group.unreadCount || 0) > 0;
                  const isCreator = normalizeNickname(group.createdBy) === cleanMyNickname;

                  // Check if last message is an automated group system event
                  const isSystemMsg = Boolean(
                    group.lastMessageSender === 'FUHSI Group System' ||
                    group.lastMessageSender === 'System' ||
                    (group.lastMessage && /^(🚪|👋|🎯|👤|⭐|🛡️|✏️)/.test(group.lastMessage.trim()))
                  );

                  // Format last message for display
                  let lastMsgText = group.lastMessage || group.description || 'Tap to start group conversation';
                  if (isSystemMsg && group.lastMessage) {
                    lastMsgText = formatGroupSystemMessage(group.lastMessage, cleanMyNickname);
                  } else if (lastMsgText.includes('@')) {
                    lastMsgText = lastMsgText.replace(/@([a-zA-Z0-9_]+)/g, (fullMatch, nick) => {
                      const cleanMentioned = normalizeNickname(nick);
                      if (cleanMentioned === cleanMyNickname) {
                        return '@you';
                      }
                      // For other users they didn't mention, the mention sign does not appear
                      return nick;
                    });
                  }

                  const senderPrefix = isSystemMsg
                    ? ''
                    : group.lastMessageSender && normalizeNickname(group.lastMessageSender) === cleanMyNickname
                    ? 'You: '
                    : group.lastMessageSender
                    ? `${group.lastMessageSender}: `
                    : '';

                  return (
                    <div
                      key={group.id}
                      id={`group-item-${group.id}`}
                      onClick={() => handleSelectGroup(group)}
                      className={`p-3.5 sm:px-4 flex items-center gap-3 cursor-pointer transition-all group relative border-b border-slate-100 ${
                        isSelected
                          ? 'bg-teal-100/70 border-l-[5px] border-l-teal-700 shadow-xs'
                          : hasUnread
                          ? 'bg-emerald-50/95 hover:bg-emerald-100/80 border-l-[5px] border-l-emerald-600 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 border-l-[5px] border-l-transparent'
                      }`}
                    >
                      {/* Group Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className={`w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-800 flex items-center justify-center overflow-hidden border transition-all shadow-2xs ${
                            hasUnread
                              ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-xs'
                              : 'border-slate-200'
                          }`}
                        >
                          {group.avatarUrl ? (
                            <img
                              src={group.avatarUrl}
                              alt={group.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Users size={19} className="text-white" />
                          )}
                        </div>
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-emerald-600 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xs animate-bounce">
                            {group.unreadCount}
                          </span>
                        )}
                        {group.hasUnreadMention && (
                          <span
                            className="absolute -bottom-1 -right-1 w-5 h-5 bg-amber-500 text-white rounded-full text-[11px] font-black flex items-center justify-center border-2 border-white shadow-xs animate-pulse"
                            title="You were mentioned in this group"
                          >
                            @
                          </span>
                        )}
                      </div>

                      {/* Group Meta Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <div className="flex items-center gap-1.5 truncate">
                            <span
                              className={`truncate ${
                                hasUnread
                                  ? 'font-black text-slate-950 text-sm tracking-tight'
                                  : 'font-bold text-slate-900 text-xs'
                              }`}
                            >
                              {group.name}
                            </span>
                            <span className="px-1.5 py-0.2 bg-teal-100 text-teal-800 rounded text-[9px] font-black uppercase tracking-wider shrink-0">
                              Group
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {hasUnread ? (
                              <span className="text-[10px] font-black text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-full">
                                {group.lastTimestamp || 'New'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-slate-400">
                                {group.lastTimestamp || `${group.memberNicknames?.length || 0} members`}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-[11px] truncate leading-tight min-w-0 flex-1">
                            {hasUnread && (
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0 inline-block shadow-xs animate-pulse" />
                            )}
                            <p
                              className={`truncate leading-tight ${
                                hasUnread
                                  ? 'font-black text-slate-950 text-xs'
                                  : 'text-slate-500 font-normal text-[11px]'
                              }`}
                            >
                              {group.lastMessage ? `${senderPrefix}${lastMsgText}` : (group.description || 'Tap to start group conversation')}
                            </p>
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {hasUnread && (
                              <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black leading-tight flex items-center gap-1 shadow-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-ping shrink-0" />
                                <span>{group.unreadCount} NEW</span>
                              </span>
                            )}
                            {group.hasUnreadMention && (
                              <span
                                className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black leading-tight shadow-xs flex items-center gap-1 animate-pulse"
                                title="You were mentioned in this group"
                              >
                                <span className="text-[11px] font-black leading-none">@</span>
                                <span className="text-[9px] font-black uppercase tracking-tight leading-none">Mention</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Leave / Delete Group Action */}
                      <button
                        onClick={(e) => handleDeleteOrLeaveGroupClick(e, group)}
                        className="opacity-70 sm:opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer shrink-0 ml-1"
                        title={isCreator ? 'Delete or clear group' : 'Leave or clear group'}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                }

                const conv = item.data;
                const isSelected = conv.id === activeConvId;
                const hasUnread = (conv.unreadCount || 0) > 0;
                const isLastMsgFromMe = Boolean(
                  conv.lastSenderNickname && normalizeNickname(conv.lastSenderNickname) === cleanMyNickname
                );

                return (
                  <div
                    key={conv.id}
                    id={`conv-item-${conv.id}`}
                    onClick={() => {
                      setActiveConvId(conv.id);
                      setActiveGroup(null);
                      setActiveRecipient({
                        nickname: extractPureStudentHandle(conv.otherUserNickname, myNickname),
                        avatarKey: conv.otherUserAvatarKey || '1',
                        avatarUrl: conv.otherUserAvatarUrl,
                        badgeType: conv.otherUserBadgeType,
                        badgeTitle: conv.otherUserBadgeTitle,
                        isVerified: conv.otherUserIsVerified,
                      });
                    }}
                    className={`p-3.5 sm:px-4 flex items-center gap-3 cursor-pointer transition-all group relative border-b border-slate-100 ${
                      isSelected
                        ? 'bg-teal-100/70 border-l-[5px] border-l-teal-700 shadow-xs'
                        : hasUnread
                        ? 'bg-emerald-50/95 hover:bg-emerald-100/80 border-l-[5px] border-l-emerald-600 shadow-2xs'
                        : 'bg-white hover:bg-slate-50 border-l-[5px] border-l-transparent'
                    }`}
                  >
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div
                        className={`w-11 h-11 rounded-2xl bg-teal-900 flex items-center justify-center overflow-hidden border transition-all ${
                          hasUnread
                            ? 'border-emerald-500 ring-2 ring-emerald-500/50 shadow-xs'
                            : 'border-slate-200'
                        }`}
                      >
                        <AvatarIcon
                          avatarKey={conv.otherUserAvatarKey}
                          avatarUrl={conv.otherUserAvatarUrl}
                          sizeClassName="w-full h-full object-cover"
                        />
                      </div>
                      {hasUnread && (
                        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-emerald-600 text-white rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xs animate-bounce">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>

                    {/* Meta info: username & nickname, last message, unread status */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span
                            className={`truncate ${
                              hasUnread ? 'font-black text-slate-950 text-sm tracking-tight' : 'font-bold text-slate-700 text-xs'
                            }`}
                          >
                            {extractPureStudentHandle(conv.otherUserNickname, myNickname)}
                          </span>
                          {(() => {
                            const bInfo = getUserBadgeInfo(conv.otherUserNickname);
                            return (
                              <VerificationBadge
                                isVerified={bInfo.isVerified}
                                badgeType={bInfo.badgeType as any}
                                size={12}
                              />
                            );
                          })()}
                        </div>
                        <span
                          className={`shrink-0 ${
                            hasUnread
                              ? 'text-[10px] font-black text-emerald-800 bg-emerald-200/70 px-2 py-0.5 rounded-full'
                              : 'text-[10px] font-medium text-slate-400'
                          }`}
                        >
                          {conv.lastTimestamp}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-[11px] truncate leading-tight min-w-0 flex-1">
                          {isLastMsgFromMe ? (
                            conv.lastMessageIsRead ? (
                              <span title="Read" className="inline-flex shrink-0 text-sky-500">
                                <CheckCheck size={13} className="text-sky-500 stroke-[2.5]" />
                              </span>
                            ) : (
                              <span title="Sent (Delivered)" className="inline-flex shrink-0 text-slate-400">
                                <CheckCheck size={13} className="text-slate-400 stroke-[1.75]" />
                              </span>
                            )
                          ) : hasUnread ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0 inline-block shadow-xs animate-pulse" />
                          ) : null}
                          <p
                            className={`truncate ${
                              hasUnread ? 'font-black text-slate-950 text-xs' : 'font-normal text-slate-500 text-[11px]'
                            }`}
                          >
                            {conv.lastMessage}
                          </p>
                        </div>

                        {hasUnread && (
                          <span className="shrink-0 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black leading-tight flex items-center gap-1 shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-ping shrink-0" />
                            <span>{conv.unreadCount} NEW</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Delete Conversation action */}
                    <button
                      onClick={(e) => handleDeleteConversation(e, conv.id)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer shrink-0 ml-1"
                      title="Delete conversation"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Active Chat Stream */}
        <div 
          className={`flex-1 bg-slate-50 flex-col justify-between overflow-hidden ${
            activeConvId ? 'flex' : 'hidden md:flex items-center justify-center'
          }`}
        >
          {activeConvId && (activeRecipient || activeGroup) ? (
            <>
              {/* Conversation Top Header */}
              <div className="p-3 sm:px-4 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                {activeGroup ? (
                  /* Group Top Header */
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => {
                        setActiveConvId(null);
                        setActiveRecipient(null);
                        setActiveGroup(null);
                      }}
                      className="md:hidden p-1.5 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors cursor-pointer"
                      title="Back to conversation list"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <div
                      onClick={() => setShowGroupInfoModal(true)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-teal-700 to-emerald-800 flex items-center justify-center overflow-hidden border border-slate-200 cursor-pointer shrink-0 hover:scale-105 transition-transform shadow-2xs"
                      title="View Group Info"
                    >
                      {activeGroup.avatarUrl ? (
                        <img
                          src={activeGroup.avatarUrl}
                          alt={activeGroup.name}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <Users size={20} className="text-white" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div
                        onClick={() => setShowGroupInfoModal(true)}
                        className="flex items-center gap-1.5 cursor-pointer group leading-tight"
                      >
                        <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                          {activeGroup.name}
                        </h2>
                        <span className="px-1.5 py-0.2 bg-teal-100 text-teal-800 rounded text-[9px] font-black uppercase tracking-wider">
                          Group
                        </span>
                      </div>
                      <p
                        onClick={() => setShowGroupInfoModal(true)}
                        className="text-[10px] text-slate-500 font-medium truncate cursor-pointer hover:text-teal-700 mt-0.5"
                      >
                        {activeGroup.memberNicknames?.length || 0} members • Tap for details
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Direct 1-on-1 Top Header */
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      onClick={() => {
                        setActiveConvId(null);
                        setActiveRecipient(null);
                        setActiveGroup(null);
                      }}
                      className="md:hidden p-1.5 hover:bg-slate-100 text-slate-700 rounded-xl transition-colors cursor-pointer"
                      title="Back to conversation list"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <div 
                      onClick={() => onOpenProfile && onOpenProfile(cleanRecipientDisplay)}
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-teal-900 flex items-center justify-center overflow-hidden border border-slate-200 cursor-pointer shrink-0 hover:scale-105 transition-transform"
                      title="View student profile"
                    >
                      <AvatarIcon
                        avatarKey={activeRecipient?.avatarKey}
                        avatarUrl={activeRecipient?.avatarUrl}
                        sizeClassName="w-full h-full object-cover"
                      />
                    </div>

                    <div className="min-w-0">
                      <div 
                        onClick={() => onOpenProfile && onOpenProfile(cleanRecipientDisplay)}
                        className="flex items-center gap-1.5 cursor-pointer group leading-tight"
                      >
                        <h2 className="text-xs sm:text-sm font-black text-slate-900 truncate group-hover:text-teal-700 transition-colors">
                          {cleanRecipientDisplay}
                        </h2>
                        {(() => {
                          const bInfo = getUserBadgeInfo(cleanRecipientDisplay);
                          return (
                            <VerificationBadge
                              isVerified={bInfo.isVerified}
                              badgeType={bInfo.badgeType as any}
                              size={13}
                            />
                          );
                        })()}
                      </div>

                      <div className="flex items-center gap-1 text-[10px] font-bold mt-0.5 leading-tight">
                        {isRecipientOnline ? (
                          <span className="flex items-center gap-1 text-emerald-600 font-extrabold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 inline-block animate-pulse" />
                            <span>• Online</span>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-slate-400 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 inline-block" />
                            <span>• Offline</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Top Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {activeGroup ? (
                    <button
                      onClick={() => setShowGroupInfoModal(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-[11px] font-bold border border-teal-200 flex items-center gap-1 transition-all cursor-pointer"
                      title="Group Info and Members"
                    >
                      <Info size={14} className="text-teal-700" />
                      <span className="hidden sm:inline">Group Info</span>
                    </button>
                  ) : (
                    <button
                      id="btn-report-chat"
                      onClick={() => setShowReportModal(true)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-[11px] font-bold border border-slate-200 flex items-center gap-1 transition-all cursor-pointer"
                      title="Report Harassment, Threats, or Prohibited Content"
                    >
                      <ShieldAlert size={13} className="text-rose-500" />
                      <span className="hidden sm:inline">Report</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Permanent Protected conversation banner (Fixed, does not scroll with message stream) */}
              <div className="px-3.5 py-1.5 bg-teal-50 border-b border-teal-100/90 flex items-center gap-1.5 text-[11px] font-extrabold text-teal-800 shrink-0 select-none">
                <ShieldCheck size={13} className="text-teal-600 shrink-0" />
                <span>{activeGroup ? 'Secure group discussion' : 'Protected conversation'}</span>
              </div>

              {/* Chat Message Stream */}
              <div 
                ref={chatContainerRef}
                onScroll={handleScroll}
                className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-2 relative"
              >
                {visibleMessages.length === 0 ? (
                  <div className="py-12 text-center space-y-2">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto border border-slate-200 text-teal-700 shadow-2xs">
                      {activeGroup ? <Users size={20} /> : <MessageSquare size={20} />}
                    </div>
                    <h4 className="text-xs font-black text-slate-800">
                      {activeGroup ? `Welcome to ${activeGroup.name}` : 'No Messages Yet'}
                    </h4>
                    <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                      {activeGroup ? 'Send a message to start this group conversation!' : `Say hello to ${cleanRecipientDisplay}!`}
                    </p>
                  </div>
                ) : (
                  visibleMessages.map((msg, idx) => {
                    const isMe = normalizeNickname(msg.senderNickname) === cleanMyNickname;
                    const prevMsg = idx > 0 ? visibleMessages[idx - 1] : null;
                    const showDateDivider = !prevMsg || (() => {
                      const prevTime = parseMessageTimestampMs(prevMsg);
                      const currTime = parseMessageTimestampMs(msg);
                      if (!prevTime || !currTime) return false;
                      const prevDate = new Date(prevTime).toDateString();
                      const currDate = new Date(currTime).toDateString();
                      return prevDate !== currDate;
                    })();

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && (
                          <div className="flex justify-center my-3 select-none">
                            <span className="px-3 py-1 bg-slate-200/90 text-slate-700 text-[10px] font-extrabold rounded-full shadow-2xs">
                              {formatMessageDateDivider(msg.timestamp)}
                            </span>
                          </div>
                        )}
                        <ChatMessageItem
                          key={msg.id}
                          msg={msg}
                          isMe={isMe}
                          myNickname={myNickname}
                          onReply={(m) => {
                            setReplyingTo(m);
                            if (textareaRef.current) {
                              textareaRef.current.focus();
                            }
                          }}
                          onOpenMenu={(m) => {
                            setSelectedMessageForAction(m);
                          }}
                          onReact={(msgId, emoji) => {
                            handleReactToMessage(msgId, emoji);
                          }}
                          onScrollToMessage={(targetMsgId) => {
                            const el = document.getElementById(`msg-${targetMsgId}`);
                            if (el) {
                              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              el.classList.add('ring-2', 'ring-teal-400');
                              setTimeout(() => {
                                el.classList.remove('ring-2', 'ring-teal-400');
                              }, 1500);
                            }
                          }}
                        />
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />

                {/* Floating Scroll to Bottom */}
                {showScrollBottom && (
                  <button
                    onClick={() => scrollToBottom('smooth')}
                    className="sticky bottom-2 right-2 ml-auto p-2 bg-teal-700 hover:bg-teal-800 text-white rounded-full shadow-lg transition-all cursor-pointer flex items-center justify-center"
                    title="Scroll to bottom"
                  >
                    <ArrowDown size={14} />
                  </button>
                )}
              </div>

              {/* Quick Reply Suggestions */}
              <div className="bg-slate-100/90 border-t border-slate-200/80 px-3 py-1.5 shrink-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] font-extrabold text-slate-400 flex items-center gap-1 shrink-0">
                  <Sparkles size={11} className="text-teal-600" />
                  <span>Quick:</span>
                </span>
                {displayedQuickReplies.map((reply, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInputText(reply);
                      if (textareaRef.current) {
                        textareaRef.current.focus();
                      }
                    }}
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-teal-50 hover:text-teal-800 hover:border-teal-300 text-slate-700 border border-slate-200 text-[10px] font-bold whitespace-nowrap shadow-2xs transition-all cursor-pointer shrink-0"
                  >
                    {reply}
                  </button>
                ))}
              </div>

              {/* Replying Preview Bar */}
              {replyingTo && (
                <div className="px-3.5 py-2 bg-teal-50 border-t border-teal-200/90 flex items-center justify-between gap-2 text-xs shrink-0 animate-in slide-in-from-bottom-2 duration-150">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                      <Reply size={13} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-extrabold text-[11px] text-teal-950">Replying to</span>
                        <span className="font-bold text-[11px] text-teal-700 truncate">{replyingTo.senderNickname}</span>
                      </div>
                      <p className="text-[11px] text-slate-600 truncate max-w-xs sm:max-w-md italic">
                        {replyingTo.text}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-teal-100 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Cancel reply"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}

              {/* Message Composer */}
              <div className="p-3 bg-white border-t border-slate-200 shrink-0 relative">
                {/* Mention autocomplete dropdown */}
                {activeGroup && mentionQuery !== null && matchingMentionMembers.length > 0 && (
                  <div className="absolute bottom-full left-3 right-3 mb-2 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-40 max-h-56 overflow-y-auto divide-y divide-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1 text-teal-800">
                        <span className="text-teal-700 font-black text-xs">@</span> Mention Group Member
                      </span>
                      <span className="text-[9px] text-slate-400 font-semibold">Tap member to insert</span>
                    </div>
                    {matchingMentionMembers.map((member) => (
                      <button
                        key={member.cleanNickname}
                        type="button"
                        onClick={() => insertMention(member.nickname)}
                        className="w-full px-3 py-2.5 text-left hover:bg-teal-50/80 flex items-center gap-3 transition-colors cursor-pointer group"
                      >
                        <AvatarIcon
                          avatarKey={member.avatarKey}
                          avatarUrl={member.avatarUrl}
                          className="w-8 h-8 rounded-xl shrink-0"
                          size={16}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-black text-slate-900 group-hover:text-teal-900 truncate">
                              {member.nickname}
                            </span>
                            <VerificationBadge badgeType={member.badgeType} />
                          </div>
                          {member.realName && member.realName !== member.cleanNickname && (
                            <p className="text-[11px] text-slate-500 truncate">
                              {member.realName} {member.department ? `• ${member.department}` : ''}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {restrictionInfo.isRestricted ? (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-center text-xs font-bold text-rose-800 flex items-center justify-center gap-1.5">
                    <BadgeAlert size={15} />
                    <span>You cannot send messages while chat is restricted ({formatRestrictionRemainingTime(restrictionInfo.restrictedUntil)} remaining).</span>
                  </div>
                ) : (
                  <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={inputText}
                      onChange={(e) => {
                        const val = e.target.value;
                        const cursorPos = e.target.selectionStart || val.length;
                        setInputText(val);
                        e.target.style.height = 'auto';
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

                        if (activeGroup) {
                          const textBeforeCursor = val.slice(0, cursorPos);
                          const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);
                          if (mentionMatch) {
                            setMentionQuery(mentionMatch[1]);
                            setMentionCursorIndex(mentionMatch.index ?? -1);
                          } else {
                            setMentionQuery(null);
                            setMentionCursorIndex(-1);
                          }
                        } else {
                          setMentionQuery(null);
                          setMentionCursorIndex(-1);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && mentionQuery !== null) {
                          e.preventDefault();
                          setMentionQuery(null);
                          setMentionCursorIndex(-1);
                          return;
                        }
                        // Normal Enter key inserts next line (WhatsApp behavior).
                        // Ctrl+Enter or Cmd+Enter will send.
                        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={
                        activeGroup
                          ? `Message ${activeGroup.name}... (type @ to mention, Enter for new line)`
                          : `Message ${cleanRecipientDisplay}... (Enter for new line)`
                      }
                      className="flex-1 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium resize-none max-h-[120px] min-h-[42px] leading-relaxed transition-all"
                    />

                    <button
                      type="submit"
                      disabled={!inputText.trim() || isSending}
                      className="h-10 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-extrabold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Send size={13} />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            /* Desktop Empty State when no conversation is selected */
            <div className="p-8 text-center space-y-3 my-auto">
              <div className="w-16 h-16 bg-teal-50 text-teal-700 rounded-3xl flex items-center justify-center mx-auto border border-teal-100 shadow-xs">
                <MessageSquare size={28} />
              </div>
              <h2 className="text-sm font-black text-slate-800">Select a Conversation</h2>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                Choose a conversation from the left or click <strong className="text-teal-700 font-bold">New Chat</strong> to connect with students.
              </p>
              <button
                onClick={() => setShowNewChatModal(true)}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                Start New Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center border border-teal-100">
                  <UserPlus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Start New Chat</h3>
                  <p className="text-[10px] text-slate-400 font-bold">Select any student to start chatting</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewChatModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={newChatSearch}
                  onChange={(e) => setNewChatSearch(e.target.value)}
                  placeholder="Type student nickname (e.g. @Fatty)..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100/80 border border-transparent focus:border-teal-500 focus:bg-white rounded-xl outline-none font-medium text-slate-800"
                />
              </div>
            </div>

            {/* Student Directory List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50 p-2">
              {eligibleNewChatStudents.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-medium">
                  No matching students found.
                </div>
              ) : (
                eligibleNewChatStudents.map((student) => (
                  <div
                    key={student.id || student.nickname}
                    onClick={() => handleSelectRecipient(student.nickname, student.avatarKey, student.avatarUrl)}
                    className="p-2.5 px-3 flex items-center justify-between rounded-2xl hover:bg-teal-50/70 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-teal-900 flex items-center justify-center overflow-hidden border border-slate-200">
                        <AvatarIcon
                          avatarKey={student.avatarKey}
                          avatarUrl={student.avatarUrl}
                          sizeClassName="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-slate-900 group-hover:text-teal-800">
                            {student.nickname}
                          </span>
                          {(() => {
                            const bInfo = getUserBadgeInfo(student.nickname, student);
                            return (
                              <VerificationBadge
                                isVerified={bInfo.isVerified}
                                badgeType={bInfo.badgeType as any}
                                size={12}
                              />
                            );
                          })()}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">
                          {isGuestAccount(student) ? 'Guest' : (student.badgeTitle || 'FUHSI Student')}
                        </p>
                      </div>
                    </div>

                    <button className="px-3 py-1 bg-teal-700 text-white rounded-xl text-[11px] font-bold shadow-2xs group-hover:bg-teal-800 transition-colors">
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Conversation Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Report Conversation</h3>
                  <p className="text-[11px] text-slate-500 font-bold">Reporting {activeRecipient?.nickname}</p>
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitReport} className="p-4 space-y-3.5">
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  Violation Category:
                </label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full text-xs font-bold bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  <option value="HARASSMENT">Harassment & Bullying</option>
                  <option value="SEXUAL_HARASSMENT">Sexual Harassment & Inappropriate Behavior</option>
                  <option value="THREAT">Direct Threat & Intimidation</option>
                  <option value="CONTACT_INFO_SOLICITING">Soliciting Private Contact Information</option>
                  <option value="SCAM">Scam or Fraudulent Activity</option>
                  <option value="OTHER">Other Community Policy Violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 mb-1">
                  Additional Details / Notes (Optional):
                </label>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  rows={3}
                  placeholder="Explain what happened and why you are reporting this conversation."
                  className="w-full text-xs font-medium bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-slate-800 outline-none focus:ring-2 focus:ring-teal-500 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3.5 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  Submit Report
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message Actions / Long-Press Modal */}
      {selectedMessageForAction && (
        <ChatMessageActionsModal
          message={selectedMessageForAction}
          myNickname={myNickname}
          onClose={() => setSelectedMessageForAction(null)}
          onReact={handleReactToMessage}
          onReply={(msg) => {
            setReplyingTo(msg);
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }}
          onCopy={handleCopyMessage}
          onForward={(msg) => {
            setForwardingMessage(msg);
          }}
          onDeleteRequest={(msg) => {
            setMessageToDelete(msg);
          }}
        />
      )}

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <ChatForwardModal
          message={forwardingMessage}
          conversations={conversations}
          allUsers={allUsers}
          myNickname={myNickname}
          onClose={() => setForwardingMessage(null)}
          onForwardTo={handleForwardTo}
        />
      )}

      {/* Delete Message Confirmation Modal */}
      {messageToDelete && (
        <ChatDeleteModal
          message={messageToDelete}
          myNickname={myNickname}
          onClose={() => setMessageToDelete(null)}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
        />
      )}

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <CreateGroupModal
          myNickname={myNickname}
          allUsers={allUsers}
          onClose={() => setShowCreateGroupModal(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}

      {/* Group Info / Settings Modal */}
      {showGroupInfoModal && activeGroup && (
        <GroupInfoModal
          group={activeGroup}
          myNickname={myNickname}
          allUsers={allUsers}
          onClose={() => setShowGroupInfoModal(false)}
          onGroupUpdated={handleGroupUpdated}
          onGroupLeftOrDeleted={handleLeaveOrDeleteGroup}
          onOpenProfile={onOpenProfile}
        />
      )}

      {/* Group Chat Exit / Delete / Clear Confirmation Modal */}
      {groupDeleteModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm sm:max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-black text-slate-900 truncate">
                  Delete Group Chat
                </h3>
                <p className="text-xs text-slate-500 font-bold truncate">
                  "{groupDeleteModalTarget.name}"
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 font-medium leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
              Deleting this group chat will serve as <strong className="text-slate-900 font-black">exiting the group</strong> and removing it from your chat list along with all group messages.
              <br /><br />
              Alternatively, you can choose to <strong className="text-slate-900 font-black">Clear Message History</strong> to delete messages on your device only without leaving the group.
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const grp = groupDeleteModalTarget;
                  setGroupDeleteModalTarget(null);
                  handleConfirmExitAndDeleteGroup(grp);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-black shadow-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <LogOut size={14} />
                <span>Exit & Delete Group</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const grp = groupDeleteModalTarget;
                  setGroupDeleteModalTarget(null);
                  handleConfirmClearGroupHistoryOnly(grp);
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 hover:border-teal-200 border border-slate-200 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Eraser size={14} />
                <span>Clear Message History Only (Stay in Group)</span>
              </button>

              <button
                type="button"
                onClick={() => setGroupDeleteModalTarget(null)}
                className="w-full py-2 px-4 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-50 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) for New Chat (Like Create Post on Feed / Post Item on Marketplace) */}
      <button
        id="chats-new-chat-fab"
        onClick={() => setShowNewChatModal(true)}
        className={`fixed bottom-20 sm:bottom-8 right-4 sm:right-8 z-40 bg-teal-700 hover:bg-teal-800 active:scale-95 text-white rounded-full p-4 sm:px-5 sm:py-3.5 shadow-2xl items-center gap-2 transition-all hover:scale-105 border border-teal-500/40 group cursor-pointer ${
          activeConvId ? 'hidden md:flex' : 'flex'
        }`}
        title="Start New Chat"
      >
        <MessageSquarePlus size={20} className="group-hover:rotate-6 transition-transform duration-200" />
        <span className="hidden sm:inline font-bold text-xs tracking-wide">New Chat</span>
      </button>
    </div>
  );
};
