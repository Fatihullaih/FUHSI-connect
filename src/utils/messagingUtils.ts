import { DirectMessage, ChatConversation, CampusNotification, ChatReport, PreservedChatMessage } from '../types';
import { pushServerDbSync } from './apiSync';
import { saveDirectMessageToFirestore } from '../lib/firestoreSync';
import { evaluateChatMessage } from './safetyFilter';

export const DIRECT_MESSAGES_KEY = 'fuhsi_direct_messages_db';
export const CONVERSATIONS_KEY = 'fuhsi_conversations_db';
export const CHAT_REPORTS_KEY = 'fuhsi_chat_reports_db';

/**
 * Accurately extracts and preserves the last 5 messages strictly between the reporter and reported user
 * at the exact moment of reporting in correct chronological order.
 */
export function extractPreservedReportEvidence(
  reporterNickname: string,
  reportedNickname: string,
  currentActiveMessages: DirectMessage[] = []
): PreservedChatMessage[] {
  const cleanReporter = normalizeNickname(reporterNickname);
  const cleanReported = normalizeNickname(reportedNickname);

  if (!cleanReporter || !cleanReported) return [];

  // Combine stored messages and current active messages for completeness
  const storedMessages = getStoredDirectMessages();
  const msgMap = new Map<string, DirectMessage>();

  // Filter ONLY messages strictly between reporter and reported user
  [...storedMessages, ...currentActiveMessages].forEach((m) => {
    const s = normalizeNickname(m.senderNickname);
    const r = normalizeNickname(m.receiverNickname);
    const isDirectMatch = (s === cleanReporter && r === cleanReported) || (s === cleanReported && r === cleanReporter);
    if (isDirectMatch && m.text && m.text.trim()) {
      msgMap.set(m.id, m);
    }
  });

  const matched = Array.from(msgMap.values());

  // Sort strictly by actual recorded timestamp in chronological order (oldest to newest)
  matched.sort((a, b) => {
    const tA = new Date(a.timestamp || 0).getTime() || 0;
    const tB = new Date(b.timestamp || 0).getTime() || 0;
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  // Preserve the last 5 messages in exact chronological order
  const lastFive = matched.slice(-5);

  return lastFive.map((m) => {
    const d = new Date(m.timestamp);
    const isValidDate = !isNaN(d.getTime());
    const formattedTime = isValidDate
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
      : formatMessageTime(m.timestamp);
    const formattedDate = isValidDate
      ? d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Recorded';

    const normalizedSender = m.senderNickname.startsWith('@')
      ? m.senderNickname
      : `@${m.senderNickname}`;

    return {
      id: m.id,
      sender: normalizedSender,
      text: m.text,
      time: formattedTime,
      date: formattedDate,
      timestamp: m.timestamp || new Date().toISOString(),
    };
  });
}

/**
 * Normalize nickname for consistent key lookups
 */
export const normalizeNickname = (nick: string): string => {
  if (!nick) return '';
  return nick.trim().toLowerCase().replace(/^@/, '');
};

/**
 * Robustly parses any message timestamp (ISO string, epoch ms, Date, or formatted time) into epoch milliseconds.
 * Guaranteed never to return NaN.
 */
export function parseMessageTimestampMs(msg?: { timestamp?: string | number | Date; id?: string; createdAt?: string } | null): number {
  if (!msg) return 0;
  if (typeof msg.timestamp === 'number' && !isNaN(msg.timestamp)) return msg.timestamp;
  if (msg.timestamp instanceof Date && !isNaN(msg.timestamp.getTime())) return msg.timestamp.getTime();
  if (typeof msg.timestamp === 'string') {
    const t = Date.parse(msg.timestamp);
    if (!isNaN(t)) return t;
    const timeMatch = msg.timestamp.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (timeMatch) {
      const now = new Date();
      let hrs = parseInt(timeMatch[1], 10);
      const mins = parseInt(timeMatch[2], 10);
      if (/PM/i.test(timeMatch[3]) && hrs < 12) hrs += 12;
      if (/AM/i.test(timeMatch[3]) && hrs === 12) hrs = 0;
      now.setHours(hrs, mins, 0, 0);
      return now.getTime();
    }
  }
  if (typeof msg.id === 'string') {
    const m = msg.id.match(/(?:dm|msg|sys_group)_(\d{10,14})/);
    if (m && m[1]) {
      const parsed = parseInt(m[1], 10);
      if (!isNaN(parsed) && parsed > 1600000000000) return parsed;
    }
  }
  return 0;
}

/**
 * Format a human-friendly date divider banner between chat messages (e.g. 'Today', 'Yesterday', 'Oct 15, 2024')
 */
export function formatMessageDateDivider(dateInput?: string | number | Date): string {
  if (!dateInput) return 'Today';
  const ms = parseMessageTimestampMs({ timestamp: dateInput });
  if (!ms) return 'Today';
  const date = new Date(ms);
  const now = new Date();
  
  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  const isCurrentYear = date.getFullYear() === now.getFullYear();
  if (isCurrentYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Cleanly extracts a pure student nickname (e.g. '@deji', '@ayo', '@fadlullah') from any raw nickname,
 * user ID, or conversation ID string (e.g. 'deji', '@deji', 'conv_admin_deji', 'conv_deji_admin', 'conv_fatih_deji', '@conv_admin_deji').
 */
export function extractPureStudentHandle(rawInput: string | undefined | null, currentMyNickname?: string): string {
  if (!rawInput) return '@Student';
  let s = String(rawInput).trim();

  // Strip prefixes like author_, chat_author_, item_seller_, user_
  s = s.replace(/^(author_|chat_author_|item_seller_|user_)/i, '');
  
  // Remove leading @ symbols
  s = s.replace(/^@+/, '').trim();

  const cleanMy = currentMyNickname ? normalizeNickname(currentMyNickname) : '';

  // If formatted as a conversation ID with conv_ prefix
  while (s.startsWith('conv_')) {
    s = s.substring(5);
  }

  if (s.includes('__')) {
    const parts = s.split('__').map((p) => normalizeNickname(p)).filter(Boolean);
    const other = parts.find((p) => p !== cleanMy && p !== 'conv' && p !== 'admin') || parts.find((p) => p !== cleanMy) || parts[0];
    if (other) s = other;
  } else if (s.includes('_')) {
    if (cleanMy && s.toLowerCase().startsWith(`${cleanMy}_`)) {
      s = s.substring(cleanMy.length + 1);
    } else if (cleanMy && s.toLowerCase().endsWith(`_${cleanMy}`)) {
      s = s.substring(0, s.length - cleanMy.length - 1);
    } else if (s.toLowerCase().startsWith('admin_')) {
      s = s.substring(6);
    } else if (s.toLowerCase().endsWith('_admin')) {
      s = s.substring(0, s.length - 6);
    } else {
      const parts = s.split('_').filter(Boolean);
      const other = parts.find((p) => normalizeNickname(p) !== cleanMy && normalizeNickname(p) !== 'conv' && normalizeNickname(p) !== 'admin');
      if (other) s = other;
    }
  }

  s = s.replace(/^@+/, '').trim();
  if (!s || s === 'conv' || s.toLowerCase() === 'undefined' || s.toLowerCase() === 'null') {
    return '@Student';
  }
  return `@${s}`;
}

/**
 * Deterministically generate a conversation ID between two usernames
 */
export function getConversationId(userA: string, userB: string): string {
  const cleanA = normalizeNickname(userA);
  const cleanB = normalizeNickname(userB);

  // If one of them is admin desk
  if (cleanA.includes('admin') || cleanA.includes('desk') || cleanA.includes('modula')) {
    return `conv_admin_${cleanB}`;
  }
  if (cleanB.includes('admin') || cleanB.includes('desk') || cleanB.includes('modula')) {
    return `conv_admin_${cleanA}`;
  }

  const sorted = [cleanA, cleanB].sort();
  return `conv_${sorted[0]}_${sorted[1]}`;
}

export const formatMessageTime = (dateInput?: string | number | Date): string => {
  if (!dateInput || dateInput === 'Just now' || dateInput === 'Live Desk') {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (typeof dateInput === 'string' && /^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) {
    return timeStr;
  }
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
};

/**
 * Get all stored direct messages
 */
export function getStoredDirectMessages(): DirectMessage[] {
  try {
    const stored = localStorage.getItem(DIRECT_MESSAGES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error reading direct messages from storage:', err);
  }
  return [];
}

/**
 * Get all stored conversations
 */
export function getStoredConversations(): ChatConversation[] {
  try {
    const stored = localStorage.getItem(CONVERSATIONS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Strictly filter out any conversations with group_ ids or otherUser 'group'
        const clean = parsed.filter(
          (c) =>
            c &&
            c.id &&
            !c.id.startsWith('group_') &&
            normalizeNickname(c.otherUserNickname) !== 'group'
        );
        if (clean.length !== parsed.length) {
          try {
            localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(clean));
          } catch (e) {}
        }
        return clean;
      }
    }
  } catch (err) {
    console.error('Error reading conversations:', err);
  }
  return [];
}

/**
 * Get active conversations for a specific user, filtering out deleted ones
 */
export function getUserConversations(userNickname: string): ChatConversation[] {
  if (!userNickname) return [];
  const cleanMe = normalizeNickname(userNickname);
  const allMessages = getStoredDirectMessages();
  const storedConvs = getStoredConversations();

  // Find all conversation IDs this user is part of
  const convMap = new Map<string, { otherUser: string; lastMsg: DirectMessage; count: number }>();

  allMessages.forEach((msg) => {
    // CRITICAL: Group messages belong exclusively inside group chats and MUST NOT create or show as 1-on-1 direct conversations!
    if (
      msg.isGroupMessage ||
      msg.groupId ||
      (msg.conversationId && msg.conversationId.startsWith('group_')) ||
      msg.receiverNickname === 'group'
    ) {
      return;
    }

    const sender = normalizeNickname(msg.senderNickname);
    const receiver = normalizeNickname(msg.receiverNickname);

    if (sender === cleanMe || receiver === cleanMe) {
      const rawOther = sender === cleanMe ? msg.receiverNickname : msg.senderNickname;
      const other = extractPureStudentHandle(rawOther, userNickname);
      const convId = msg.conversationId || getConversationId(msg.senderNickname, msg.receiverNickname);
      
      const existing = convMap.get(convId);
      if (!existing) {
        convMap.set(convId, { otherUser: other, lastMsg: msg, count: 1 });
      } else {
        // Keep the latest message
        convMap.set(convId, { otherUser: other, lastMsg: msg, count: existing.count + 1 });
      }
    }
  });

  const result: ChatConversation[] = [];

  convMap.forEach((data, convId) => {
    const stored = storedConvs.find((c) => c.id === convId);
    if (stored && stored.isDeletedBy && stored.isDeletedBy.includes(cleanMe)) {
      return; // Skipped because deleted by user
    }

    const cleanOther = normalizeNickname(data.otherUser);
    // Lookup user avatar and verification from users cache
    let otherAvatarKey = '1';
    let otherAvatarUrl: string | undefined;
    let otherIsVerified = false;
    let otherBadgeType = 'GREEN';
    let otherBadgeTitle = 'FUHSI Student';

    try {
      const uStr = localStorage.getItem('fuhsi_users_db');
      if (uStr) {
        const uList: any[] = JSON.parse(uStr);
        const match = uList.find(
          (u) => normalizeNickname(u.nickname) === cleanOther || u.id === data.otherUser
        );
        if (match) {
          otherAvatarKey = match.avatarKey || '1';
          otherAvatarUrl = match.avatarUrl;
          otherIsVerified = Boolean(match.isVerified || match.verificationStatus === 'approved');
          otherBadgeType = match.badgeType || 'GREEN';
          otherBadgeTitle = match.badgeTitle || 'FUHSI Student';
        }
      }
    } catch (e) {}

    // Calculate unread count specifically for incoming unread messages for this user
    const unreadMessagesCount = allMessages.filter((m) => {
      const mConvId = m.conversationId || getConversationId(m.senderNickname, m.receiverNickname);
      return mConvId === convId && normalizeNickname(m.receiverNickname) === cleanMe && !m.isRead;
    }).length;

    result.push({
      id: convId,
      otherUserNickname: data.otherUser.startsWith('@') ? data.otherUser : `@${data.otherUser}`,
      otherUserAvatarKey: otherAvatarKey,
      otherUserAvatarUrl: otherAvatarUrl,
      otherUserIsVerified: otherIsVerified,
      otherUserBadgeType: otherBadgeType,
      otherUserBadgeTitle: otherBadgeTitle,
      lastMessage: data.lastMsg.text,
      lastTimestamp: formatMessageTime(data.lastMsg.timestamp),
      lastSenderNickname: data.lastMsg.senderNickname,
      lastMessageIsRead: Boolean(data.lastMsg.isRead),
      itemId: data.lastMsg.itemId,
      itemTitle: data.lastMsg.itemTitle,
      itemPrice: data.lastMsg.itemPrice,
      meetupPoint: data.lastMsg.meetupPoint,
      unreadCount: unreadMessagesCount,
      updatedAt: data.lastMsg.timestamp,
    });
  });

  // Sort newest first
  return result.sort((a, b) => {
    const tA = new Date(a.updatedAt || 0).getTime() || 0;
    const tB = new Date(b.updatedAt || 0).getTime() || 0;
    return tB - tA;
  });
}

/**
 * Returns the exact count of distinct active conversations/senders that have at least 1 unread message for the current user.
 * - 1 sender with 10 unread messages -> count = 1
 * - 2 different senders each with unread messages -> count = 2
 * - 3 different senders with unread messages -> count = 3
 */
export function getDistinctUnreadSendersCount(userNickname: string): number {
  if (!userNickname) return 0;
  const cleanMe = normalizeNickname(userNickname);
  if (!cleanMe) return 0;

  try {
    const allMessages = getStoredDirectMessages();
    const storedConvs = getStoredConversations();

    const distinctSendersOrConvs = new Set<string>();

    allMessages.forEach((msg) => {
      if (!msg || msg.isRead) return;

      // Group messages are counted separately in groups block below, NEVER count here
      if (
        msg.isGroupMessage ||
        msg.groupId ||
        (msg.conversationId && msg.conversationId.startsWith('group_')) ||
        msg.receiverNickname === 'group'
      ) {
        return;
      }

      const receiverClean = normalizeNickname(msg.receiverNickname);
      if (receiverClean !== cleanMe) return;

      const senderClean = normalizeNickname(msg.senderNickname);
      if (!senderClean || senderClean === cleanMe) return;

      const convId = msg.conversationId || getConversationId(msg.senderNickname, msg.receiverNickname);

      // Check if user has explicitly deleted this conversation
      const storedConv = storedConvs.find((c) => c.id === convId);
      if (storedConv && storedConv.isDeletedBy && storedConv.isDeletedBy.includes(cleanMe)) {
        return;
      }

      distinctSendersOrConvs.add(convId || senderClean);
    });

    // Also count any groups with unread messages for this user
    try {
      const gRaw = localStorage.getItem('fuhsi_chat_groups_db');
      if (gRaw) {
        const groups: any[] = JSON.parse(gRaw);
        if (Array.isArray(groups)) {
          let lastReadMap: Record<string, string> = {};
          try {
            const lrRaw = localStorage.getItem(`fuhsi_group_last_read_${cleanMe}`);
            if (lrRaw) lastReadMap = JSON.parse(lrRaw);
          } catch (e) {}

          groups.forEach((g) => {
            if (!g || g.isDeleted) return;
            const isMember = (g.memberNicknames || []).some(
              (m: string) => normalizeNickname(m) === cleanMe
            );
            const isCreator = normalizeNickname(g.createdBy) === cleanMe;
            const isAdmin = (g.adminNicknames || []).some(
              (a: string) => normalizeNickname(a) === cleanMe
            );
            if (!isMember && !isCreator && !isAdmin) return;

            const lastReadTime = lastReadMap[g.id] || null;
            const hasUnread = allMessages.some((m) => {
              if (!m) return false;
              if (m.groupId !== g.id && m.conversationId !== g.id) return false;
              if (normalizeNickname(m.senderNickname) === cleanMe) return false;
              if (m.isDeletedForEveryone) return false;
              if (m.deletedForUsers && m.deletedForUsers.some((u: string) => normalizeNickname(u) === cleanMe)) return false;
              if (m.readByUsers && m.readByUsers.some((u: string) => normalizeNickname(u) === cleanMe)) return false;
              if (lastReadTime) {
                const msgTime = new Date(m.timestamp || 0).getTime();
                const rTime = new Date(lastReadTime).getTime();
                if (msgTime <= rTime) return false;
              }
              return true;
            });

            if (hasUnread) {
              distinctSendersOrConvs.add(g.id);
            }
          });
        }
      }
    } catch (gErr) {
      console.error('Error checking unread groups count:', gErr);
    }

    return distinctSendersOrConvs.size;
  } catch (err) {
    console.error('Error calculating distinct unread senders count:', err);
    return 0;
  }
}

/**
 * Delete / Remove conversation for a user
 */
export function deleteConversationForUser(conversationId: string, userNickname: string): void {
  if (!conversationId || !userNickname) return;
  const clean = normalizeNickname(userNickname);
  try {
    const stored = getStoredConversations();
    const existing = stored.find((c) => c.id === conversationId);
    let updated: ChatConversation[];
    if (existing) {
      const deletedBy = existing.isDeletedBy || [];
      if (!deletedBy.includes(clean)) {
        deletedBy.push(clean);
      }
      updated = stored.map((c) => (c.id === conversationId ? { ...c, isDeletedBy: deletedBy } : c));
    } else {
      updated = [
        ...stored,
        {
          id: conversationId,
          otherUserNickname: '',
          lastMessage: '',
          lastTimestamp: '',
          unreadCount: 0,
          isDeletedBy: [clean],
        },
      ];
    }
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updated));
    pushServerDbSync({ chatConversations: updated } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_conversation_deleted', { detail: { conversationId, userNickname } }));
    }
  } catch (err) {
    console.error('Error deleting conversation:', err);
  }
}

/**
 * Submit a Chat Moderation Report
 */
export function submitChatReport(report: ChatReport): void {
  try {
    let reports: ChatReport[] = [];
    const raw = localStorage.getItem(CHAT_REPORTS_KEY);
    if (raw) reports = JSON.parse(raw);

    reports = [report, ...reports];
    localStorage.setItem(CHAT_REPORTS_KEY, JSON.stringify(reports));

    pushServerDbSync({ chatReports: reports } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_chat_report_submitted', { detail: report }));
    }
  } catch (err) {
    console.error('Error submitting chat report:', err);
  }
}

/**
 * Get all submitted chat reports (for Admin Console)
 */
export function getStoredChatReports(): ChatReport[] {
  try {
    const raw = localStorage.getItem(CHAT_REPORTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.error('Error reading chat reports:', err);
  }
  return [];
}

/**
 * Update chat report status (Admin action)
 */
export function updateChatReportStatus(
  reportId: string, 
  status: 'ACTION_TAKEN' | 'RESOLVED' | 'DISMISSED',
  actionNote?: string
): void {
  try {
    const reports = getStoredChatReports();
    const updated = reports.map((r) => 
      r.id === reportId 
        ? { ...r, status, actionNote: actionNote !== undefined ? actionNote : r.actionNote } 
        : r
    );
    localStorage.setItem(CHAT_REPORTS_KEY, JSON.stringify(updated));
    pushServerDbSync({ chatReports: updated } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_chat_report_updated', { detail: { reportId, status, actionNote } }));
    }
  } catch (err) {
    console.error('Error updating chat report:', err);
  }
}

/**
 * Save new direct message, evaluate safety, update conversations, and send notification
 */
export function sendDirectMessage(msg: DirectMessage): {
  updatedMessages: DirectMessage[];
  warningMessage?: string;
  isBlocked?: boolean;
} {
  // Safety evaluation before dispatching
  const evalResult = evaluateChatMessage(msg.text, msg.senderNickname);

  if (!evalResult.isAllowed) {
    return {
      updatedMessages: getStoredDirectMessages(),
      warningMessage: evalResult.warningMessage,
      isBlocked: true,
    };
  }

  const effectiveText = evalResult.sanitizedText || msg.text;

  const safeMsg: DirectMessage = {
    ...msg,
    text: effectiveText,
    isRead: false,
    isSafetyWarning: evalResult.actionTaken === 'REPLACED_CONTACT_INFO',
    violationNotice: evalResult.actionTaken === 'REPLACED_CONTACT_INFO' ? evalResult.warningMessage : undefined,
  };

  const allMessages = getStoredDirectMessages();
  const updatedMessages = [...allMessages, safeMsg];
  
  try {
    localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
  } catch (err) {
    console.error('Error saving direct message:', err);
  }

  // Save to Firestore real-time collection
  saveDirectMessageToFirestore(safeMsg).catch((err) => {
    console.error('Error saving direct message to Firestore:', err);
  });

  // Update conversations or groups preview
  const isGroupMsg = Boolean(
    safeMsg.isGroupMessage ||
    safeMsg.groupId ||
    (safeMsg.conversationId && safeMsg.conversationId.startsWith('group_')) ||
    safeMsg.receiverNickname === 'group'
  );

  if (isGroupMsg) {
    const targetGroupId = safeMsg.groupId || (safeMsg.conversationId?.startsWith('group_') ? safeMsg.conversationId : undefined);
    if (targetGroupId) {
      try {
        const groupsRaw = localStorage.getItem('fuhsi_chat_groups_db');
        if (groupsRaw) {
          const groups = JSON.parse(groupsRaw);
          if (Array.isArray(groups)) {
            const idx = groups.findIndex((g: any) => g.id === targetGroupId);
            if (idx >= 0) {
              groups[idx] = {
                ...groups[idx],
                lastMessage: safeMsg.text,
                lastMessageSender: safeMsg.senderNickname,
                lastTimestamp: formatMessageTime(safeMsg.timestamp),
                updatedAt: typeof safeMsg.timestamp === 'string' && safeMsg.timestamp.includes('T') ? safeMsg.timestamp : new Date().toISOString(),
              };
              localStorage.setItem('fuhsi_chat_groups_db', JSON.stringify(groups));
            }
          }
        }
      } catch (e) {
        console.error('Error updating group preview:', e);
      }
    }
  } else {
    // Update conversations ONLY for direct 1-on-1 messages, never for groups
    updateConversationList(safeMsg);
  }

  // Note: Normal chat messages belong exclusively to Chat/Conversations and are NOT sent to Notifications.

  // Push sync to server
  try {
    pushServerDbSync({ directMessages: updatedMessages } as any).catch(console.error);
  } catch (e) {
    console.error(e);
  }

  // Dispatch custom window event so all active UI components refresh immediately
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated', { detail: safeMsg }));
  }

  return {
    updatedMessages,
    warningMessage: evalResult.warningMessage,
    isBlocked: false,
  };
}

/**
 * Update conversations store with last message snippet
 */
export function updateConversationList(msg: DirectMessage): void {
  // CRITICAL: Group messages belong exclusively inside groups and MUST NEVER update or create direct chat conversations!
  if (
    !msg ||
    msg.isGroupMessage ||
    msg.groupId ||
    (msg.conversationId && msg.conversationId.startsWith('group_')) ||
    msg.receiverNickname === 'group'
  ) {
    return;
  }

  try {
    const stored = localStorage.getItem(CONVERSATIONS_KEY);
    let convs: ChatConversation[] = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(convs)) convs = [];

    const convId = msg.conversationId || getConversationId(msg.senderNickname, msg.receiverNickname);
    const existingIdx = convs.findIndex((c) => c.id === convId);

    const updatedConv: ChatConversation = {
      id: convId,
      otherUserNickname: msg.senderNickname.includes('Admin') ? msg.senderNickname : (msg.receiverNickname.includes('Admin') ? msg.senderNickname : msg.receiverNickname),
      lastMessage: msg.text,
      lastTimestamp: formatMessageTime(msg.timestamp),
      itemId: msg.itemId,
      itemTitle: msg.itemTitle,
      itemPrice: msg.itemPrice,
      meetupPoint: msg.meetupPoint,
      unreadCount: (existingIdx >= 0 ? convs[existingIdx].unreadCount : 0) + 1,
      isDeletedBy: [], // unhide if a new message arrives
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      convs[existingIdx] = {
        ...convs[existingIdx],
        ...updatedConv,
        isDeletedBy: [],
      };
    } else {
      convs.unshift(updatedConv);
    }

    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(convs));
    pushServerDbSync({ chatConversations: convs } as any).catch(console.error);
  } catch (err) {
    console.error('Error updating conversations:', err);
  }
}

/**
 * Mark all incoming direct messages in a conversation as read by the viewing user
 */
export function markConversationMessagesAsRead(conversationId: string, readerNickname: string): void {
  if (!conversationId || !readerNickname) return;
  const cleanReader = normalizeNickname(readerNickname);
  let changed = false;

  const allMessages = getStoredDirectMessages();
  const isGroup = conversationId.startsWith('group_');

  if (isGroup) {
    try {
      const key = `fuhsi_group_last_read_${cleanReader}`;
      const raw = localStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      map[conversationId] = new Date().toISOString();
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {}
  }

  const updatedMessages = allMessages.map((msg) => {
    const msgConvId = msg.conversationId || getConversationId(msg.senderNickname, msg.receiverNickname);
    const isTargetConv = msgConvId === conversationId || (msg.isGroupMessage && msg.groupId === conversationId);
    
    // Direct message handling
    const isIncomingToMe = normalizeNickname(msg.receiverNickname) === cleanReader;
    if (isTargetConv && isIncomingToMe && !msg.isRead) {
      changed = true;
      const updatedMsg: DirectMessage = {
        ...msg,
        isRead: true,
        readAt: new Date().toISOString(),
      };
      saveDirectMessageToFirestore(updatedMsg).catch((err) => {
        console.error('Error updating read status in Firestore:', err);
      });
      return updatedMsg;
    }

    // Group message handling
    if (isTargetConv && (msg.isGroupMessage || isGroup)) {
      const isNotMe = normalizeNickname(msg.senderNickname) !== cleanReader;
      const alreadyRead = msg.readByUsers && msg.readByUsers.some((u) => normalizeNickname(u) === cleanReader);
      if (isNotMe && !alreadyRead) {
        changed = true;
        const updatedMsg: DirectMessage = {
          ...msg,
          readByUsers: [...(msg.readByUsers || []), cleanReader],
        };
        saveDirectMessageToFirestore(updatedMsg).catch((err) => {
          console.error('Error updating group message read status in Firestore:', err);
        });
        return updatedMsg;
      }
    }

    return msg;
  });

  if (changed) {
    try {
      localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
    } catch (e) {
      console.error('Error storing updated direct messages:', e);
    }

    // Reset unread count for this conversation in conversations list
    try {
      const storedConvs = getStoredConversations();
      const updatedConvs = storedConvs.map((c) => {
        if (c.id === conversationId) {
          return { ...c, unreadCount: 0 };
        }
        return c;
      });
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updatedConvs));
      pushServerDbSync({ directMessages: updatedMessages, chatConversations: updatedConvs } as any).catch(console.error);
    } catch (e) {
      console.error(e);
    }

    // Also mark related notifications for this conversation as read
    try {
      const notifs = getUserNotifications(readerNickname);
      let notifChanged = false;
      const updatedNotifs = notifs.map((n) => {
        if (n.conversationId === conversationId && !n.isRead) {
          notifChanged = true;
          return { ...n, isRead: true };
        }
        return n;
      });
      if (notifChanged) {
        localStorage.setItem(`fuhsi_user_notifications_${cleanReader}`, JSON.stringify(updatedNotifs));
      }
    } catch (e) {
      console.error(e);
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated', { detail: { conversationId, readerNickname } }));
      window.dispatchEvent(new CustomEvent('fuhsi_notification_read_updated', { detail: { nickname: readerNickname } }));
    }
  }
}

export const READ_NOTIFS_KEY_PREFIX = 'fuhsi_read_notif_ids_';

/**
 * Get IDs of notifications marked as read
 */
export function getReadNotificationIds(nickname: string): Record<string, boolean> {
  if (!nickname) return {};
  const clean = normalizeNickname(nickname);
  try {
    const stored = localStorage.getItem(`${READ_NOTIFS_KEY_PREFIX}${clean}`);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    }
  } catch (err) {
    console.error('Error reading read notification IDs:', err);
  }
  return {};
}

/**
 * Set read status for a specific notification ID
 */
export function setReadNotificationId(nickname: string, notifId: string, isRead: boolean): void {
  if (!nickname || !notifId) return;
  const clean = normalizeNickname(nickname);
  const key = `${READ_NOTIFS_KEY_PREFIX}${clean}`;
  try {
    const current = getReadNotificationIds(nickname);
    current[notifId] = isRead;
    localStorage.setItem(key, JSON.stringify(current));
  } catch (err) {
    console.error('Error saving read notification ID:', err);
  }
}

/**
 * Mark a list of notification IDs as read
 */
export function setAllNotificationIdsRead(nickname: string, notifIds: string[]): void {
  if (!nickname || !notifIds.length) return;
  const clean = normalizeNickname(nickname);
  const key = `${READ_NOTIFS_KEY_PREFIX}${clean}`;
  try {
    const current = getReadNotificationIds(nickname);
    notifIds.forEach((id) => {
      current[id] = true;
    });
    localStorage.setItem(key, JSON.stringify(current));
  } catch (err) {
    console.error('Error saving read notification IDs:', err);
  }
}

/**
 * Helper to identify if a notification is an ordinary chat / direct message
 * (which must never appear under Notifications or count towards the notification badge).
 */
export function isChatMessageNotification(notif: CampusNotification | any): boolean {
  if (!notif) return false;
  if (notif.type === 'DIRECT_MESSAGE' || notif.type === 'ADMIN_TRADE_DESK') return true;
  if (typeof notif.id === 'string' && notif.id.startsWith('notif_dm_')) return true;
  if (notif.actionType === 'OPEN_TRADE_CHAT' && notif.conversationId && !notif.itemId && !notif.postId) return true;
  const title = typeof notif.title === 'string' ? notif.title.toLowerCase() : '';
  if (title.startsWith('💬 message from') || title.includes('council notice / message')) return true;
  return false;
}

/**
 * Get user-specific notifications (strictly excluding ordinary chat/direct messages)
 */
export function getUserNotifications(nickname: string): CampusNotification[] {
  if (!nickname) return [];
  const clean = normalizeNickname(nickname);
  const key = `fuhsi_user_notifications_${clean}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Strictly filter out ordinary chat messages
        const validNotifs = parsed.filter((n) => !isChatMessageNotification(n));
        // If stale chat notifications were purged, clean up localStorage
        if (validNotifs.length !== parsed.length) {
          try {
            localStorage.setItem(key, JSON.stringify(validNotifs));
          } catch (e) {}
        }
        return validNotifs;
      }
    }
  } catch (err) {
    console.error('Error reading user notifications:', err);
  }
  return [];
}

/**
 * Send a platform notification to a specific user (chat messages are strictly prohibited here)
 */
export function sendUserNotification(targetNickname: string, notif: CampusNotification): void {
  if (!targetNickname || !notif) return;
  // Strictly enforce separation: Chat messages must never enter the Notifications system
  if (isChatMessageNotification(notif)) {
    return;
  }

  const clean = normalizeNickname(targetNickname);
  const key = `fuhsi_user_notifications_${clean}`;
  
  const preparedNotif: CampusNotification = {
    ...notif,
    timestamp: notif.timestamp ? formatMessageTime(notif.timestamp) : formatMessageTime(),
  };

  try {
    const current = getUserNotifications(targetNickname);
    // Deduplicate identical notifications within short timeframe
    const exists = current.some((n) => n.id === preparedNotif.id);
    if (!exists) {
      const updated = [preparedNotif, ...current];
      localStorage.setItem(key, JSON.stringify(updated));
    }
  } catch (err) {
    console.error('Error storing user notification:', err);
  }

  // Dispatch window event for live badges
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_notification_received', { detail: { targetNickname, notif: preparedNotif } }));
  }
}

/**
 * Mark a user notification as read
 */
export function markNotificationAsRead(nickname: string, notifId: string): void {
  if (!nickname || !notifId) return;
  const clean = normalizeNickname(nickname);
  const key = `fuhsi_user_notifications_${clean}`;
  try {
    const current = getUserNotifications(nickname);
    const updated = current.map((n) => (n.id === notifId ? { ...n, isRead: true } : n));
    localStorage.setItem(key, JSON.stringify(updated));
    setReadNotificationId(nickname, notifId, true);
  } catch (err) {
    console.error('Error marking notification read:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_notification_read_updated', { detail: { nickname, notifId } }));
  }
}

/**
 * Mark all notifications as read for a user
 */
export function markAllNotificationsAsRead(nickname: string): void {
  if (!nickname) return;
  const clean = normalizeNickname(nickname);
  const key = `fuhsi_user_notifications_${clean}`;
  try {
    const current = getUserNotifications(nickname);
    const updated = current.map((n) => ({ ...n, isRead: true }));
    localStorage.setItem(key, JSON.stringify(updated));
    const allIds = current.map((n) => n.id);
    setAllNotificationIdsRead(nickname, allIds);
  } catch (err) {
    console.error('Error marking all notifications read:', err);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_notification_read_updated', { detail: { nickname } }));
  }
}

/**
 * Toggle an emoji reaction on a direct message
 */
export function reactToDirectMessage(
  messageId: string, 
  emoji: string, 
  userNickname: string,
  fallbackMsg?: DirectMessage
): DirectMessage | null {
  if (!messageId || !emoji || !userNickname) return null;
  const cleanUser = normalizeNickname(userNickname);
  const userTag = userNickname.startsWith('@') ? userNickname : `@${userNickname}`;

  const allMessages = getStoredDirectMessages();
  let updatedMsg: DirectMessage | null = null;
  let found = false;

  let updatedMessages = allMessages.map((m) => {
    if (m.id === messageId) {
      found = true;
      const reactions = { ...(m.reactions || {}) };
      const currentReactors = reactions[emoji] || [];
      const alreadyReacted = currentReactors.some((u) => normalizeNickname(u) === cleanUser);

      if (alreadyReacted) {
        reactions[emoji] = currentReactors.filter((u) => normalizeNickname(u) !== cleanUser);
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
      } else {
        reactions[emoji] = [...currentReactors, userTag];
      }

      updatedMsg = { ...m, reactions };
      return updatedMsg;
    }
    return m;
  });

  // If message wasn't in local storage yet, use fallbackMsg if provided
  if (!found && fallbackMsg && fallbackMsg.id === messageId) {
    const reactions = { ...(fallbackMsg.reactions || {}) };
    const currentReactors = reactions[emoji] || [];
    const alreadyReacted = currentReactors.some((u) => normalizeNickname(u) === cleanUser);

    if (alreadyReacted) {
      reactions[emoji] = currentReactors.filter((u) => normalizeNickname(u) !== cleanUser);
      if (reactions[emoji].length === 0) {
        delete reactions[emoji];
      }
    } else {
      reactions[emoji] = [...currentReactors, userTag];
    }

    updatedMsg = { ...fallbackMsg, reactions };
    updatedMessages = [updatedMsg, ...updatedMessages];
  }

  if (updatedMsg) {
    localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
    saveDirectMessageToFirestore(updatedMsg).catch(console.error);
    pushServerDbSync({ directMessages: updatedMessages } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated', { detail: updatedMsg }));
    }
  }

  return updatedMsg;
}

/**
 * Delete a direct message for the current user only ("Delete for me")
 */
export function deleteDirectMessageForMe(
  messageId: string, 
  userNickname: string,
  fallbackMsg?: DirectMessage
): DirectMessage | null {
  if (!messageId || !userNickname) return null;
  const cleanUser = normalizeNickname(userNickname);

  const allMessages = getStoredDirectMessages();
  let updatedMsg: DirectMessage | null = null;
  let found = false;

  let updatedMessages = allMessages.map((m) => {
    if (m.id === messageId) {
      found = true;
      const deletedFor = Array.isArray(m.deletedForUsers) ? [...m.deletedForUsers] : [];
      if (!deletedFor.some((u) => normalizeNickname(u) === cleanUser)) {
        deletedFor.push(cleanUser);
      }
      updatedMsg = { ...m, deletedForUsers: deletedFor };
      return updatedMsg;
    }
    return m;
  });

  // If message wasn't in local storage yet, use fallbackMsg
  if (!found && fallbackMsg && fallbackMsg.id === messageId) {
    const deletedFor = Array.isArray(fallbackMsg.deletedForUsers) ? [...fallbackMsg.deletedForUsers] : [];
    if (!deletedFor.some((u) => normalizeNickname(u) === cleanUser)) {
      deletedFor.push(cleanUser);
    }
    updatedMsg = { ...fallbackMsg, deletedForUsers: deletedFor };
    updatedMessages = [updatedMsg, ...updatedMessages];
  }

  if (updatedMsg) {
    localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
    saveDirectMessageToFirestore(updatedMsg).catch(console.error);
    pushServerDbSync({ directMessages: updatedMessages } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated', { detail: updatedMsg }));
    }
  }

  return updatedMsg;
}

/**
 * Delete a direct message for everyone ("Delete for everyone")
 */
export function deleteDirectMessageForEveryone(
  messageId: string,
  fallbackMsg?: DirectMessage
): DirectMessage | null {
  if (!messageId) return null;

  const allMessages = getStoredDirectMessages();
  let updatedMsg: DirectMessage | null = null;
  let found = false;

  let updatedMessages = allMessages.map((m) => {
    if (m.id === messageId) {
      found = true;
      updatedMsg = {
        ...m,
        isDeletedForEveryone: true,
        text: '🚫 This message was deleted',
      };
      return updatedMsg;
    }
    return m;
  });

  // If message wasn't in local storage yet, use fallbackMsg
  if (!found && fallbackMsg && fallbackMsg.id === messageId) {
    updatedMsg = {
      ...fallbackMsg,
      isDeletedForEveryone: true,
      text: '🚫 This message was deleted',
    };
    updatedMessages = [updatedMsg, ...updatedMessages];
  }

  if (updatedMsg) {
    localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
    saveDirectMessageToFirestore(updatedMsg).catch(console.error);
    pushServerDbSync({ directMessages: updatedMessages } as any).catch(console.error);

    // Also update conversations if this was the last message
    try {
      const storedConvs = getStoredConversations();
      const updatedConvs = storedConvs.map((c) => {
        if (c.id === (updatedMsg as DirectMessage).conversationId) {
          return {
            ...c,
            lastMessage: '🚫 This message was deleted',
          };
        }
        return c;
      });
      localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(updatedConvs));
      pushServerDbSync({ chatConversations: updatedConvs } as any).catch(console.error);
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated', { detail: updatedMsg }));
    }
  }

  return updatedMsg;
}

/**
 * Clear all chat history in a conversation or group strictly for the current user.
 * This marks all matching messages as deleted for this user only, leaving other members' chat history untouched.
 */
export function clearConversationHistoryForUser(
  conversationOrGroupId: string,
  userNickname: string
): boolean {
  if (!conversationOrGroupId || !userNickname) return false;
  const cleanUser = normalizeNickname(userNickname);
  if (!cleanUser) return false;

  try {
    const allMessages = getStoredDirectMessages();
    let changed = false;

    const updatedMessages = allMessages.map((m) => {
      const isTarget =
        m.conversationId === conversationOrGroupId ||
        m.groupId === conversationOrGroupId ||
        (m.senderNickname && m.receiverNickname && getConversationId(m.senderNickname, m.receiverNickname) === conversationOrGroupId);

      if (isTarget) {
        const deletedFor = Array.isArray(m.deletedForUsers) ? [...m.deletedForUsers] : [];
        if (!deletedFor.some((u) => normalizeNickname(u) === cleanUser)) {
          deletedFor.push(cleanUser);
          changed = true;
          const updatedMsg = { ...m, deletedForUsers: deletedFor };
          saveDirectMessageToFirestore(updatedMsg).catch(console.error);
          return updatedMsg;
        }
      }
      return m;
    });

    if (changed) {
      localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
      pushServerDbSync({ directMessages: updatedMessages } as any).catch(console.error);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated'));
      }
    }
    return true;
  } catch (err) {
    console.error('Error clearing chat history for user:', err);
    return false;
  }
}

