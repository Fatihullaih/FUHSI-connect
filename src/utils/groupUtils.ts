import { ChatGroup, DirectMessage } from '../types';
import { 
  normalizeNickname, 
  formatMessageTime, 
  sendDirectMessage, 
  getStoredDirectMessages, 
  clearConversationHistoryForUser,
  parseMessageTimestampMs,
  DIRECT_MESSAGES_KEY 
} from './messagingUtils';
import { 
  saveChatGroupToFirestore, 
  deleteChatGroupFromFirestore, 
  saveDirectMessageToFirestore 
} from '../lib/firestoreSync';

export const CHAT_GROUPS_KEY = 'fuhsi_chat_groups_db';
export const GROUP_LAST_READ_KEY_PREFIX = 'fuhsi_group_last_read_';

// One-time purge trigger to ensure all previously created groups are wiped as requested
try {
  if (typeof window !== 'undefined' && localStorage.getItem('fuhsi_groups_purged_requested_v2') !== 'true') {
    localStorage.setItem(CHAT_GROUPS_KEY, JSON.stringify([]));
    localStorage.setItem('fuhsi_groups_purged_requested_v2', 'true');
    // Clear any group-related messages and conversations from local storage
    const storedDMs = localStorage.getItem('fuhsi_direct_messages_db');
    if (storedDMs) {
      try {
        const msgs = JSON.parse(storedDMs);
        if (Array.isArray(msgs)) {
          const filtered = msgs.filter((m: any) => !m.isGroupMessage && !m.groupId && !m.conversationId?.startsWith('group_'));
          localStorage.setItem('fuhsi_direct_messages_db', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
    const storedConvs = localStorage.getItem('fuhsi_chat_conversations_db');
    if (storedConvs) {
      try {
        const convs = JSON.parse(storedConvs);
        if (Array.isArray(convs)) {
          const filtered = convs.filter((c: any) => !c.id?.startsWith('group_') && normalizeNickname(c.otherUserNickname) !== 'group');
          localStorage.setItem('fuhsi_chat_conversations_db', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  }
} catch (e) {
  console.error('Error during group purge initialization:', e);
}

/**
 * Check if a group is a sample or seed group that must NOT exist
 */
export function isSampleGroup(group: Partial<ChatGroup>): boolean {
  if (!group) return false;
  const id = (group.id || '').toLowerCase();
  const name = (group.name || '').toLowerCase();
  return (
    id === 'group_fuhsi_scholars_hub' ||
    id === 'group_health_tech_innovators' ||
    id.includes('sample') ||
    id.includes('seed') ||
    id.includes('demo') ||
    name.includes('sample group') ||
    name === 'fuhsi academic & study hub' ||
    name === 'health sciences & innovation'
  );
}

/**
 * Get all stored chat groups (Strictly no sample groups)
 */
export function getStoredChatGroups(): ChatGroup[] {
  try {
    const raw = localStorage.getItem(CHAT_GROUPS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        // Strip out any sample/seed groups and deleted groups
        const cleaned = parsed.filter((g) => g && g.id && !isSampleGroup(g) && !g.isDeleted);
        if (cleaned.length !== parsed.length) {
          saveStoredChatGroups(cleaned);
          // Purge sample groups from Firestore
          parsed.forEach((g) => {
            if (isSampleGroup(g) && g.id) {
              deleteChatGroupFromFirestore(g.id).catch(() => {});
            }
          });
        }
        return cleaned;
      }
    }
  } catch (err) {
    console.error('Error reading chat groups from storage:', err);
  }

  // Never seed sample groups. Return empty array if none exist.
  return [];
}

/**
 * Save chat groups array to localStorage and dispatch event
 */
export function saveStoredChatGroups(groups: ChatGroup[]): void {
  try {
    const cleaned = (groups || []).filter((g) => g && g.id && !isSampleGroup(g));
    localStorage.setItem(CHAT_GROUPS_KEY, JSON.stringify(cleaned));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_groups_updated'));
    }
  } catch (err) {
    console.error('Error saving chat groups to storage:', err);
  }
}

/**
 * Per-user group last read timestamp tracker
 */
export function getGroupLastReadTime(groupId: string, userNickname: string): string | null {
  if (!groupId || !userNickname) return null;
  const cleanUser = normalizeNickname(userNickname);
  try {
    const raw = localStorage.getItem(`${GROUP_LAST_READ_KEY_PREFIX}${cleanUser}`);
    if (raw) {
      const map = JSON.parse(raw);
      return map[groupId] || null;
    }
  } catch (e) {
    console.error('Error reading group last read time:', e);
  }
  return null;
}

export function setGroupLastReadTime(groupId: string, userNickname: string, timestamp: string): void {
  if (!groupId || !userNickname) return;
  const cleanUser = normalizeNickname(userNickname);
  try {
    const key = `${GROUP_LAST_READ_KEY_PREFIX}${cleanUser}`;
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : {};
    map[groupId] = timestamp;
    localStorage.setItem(key, JSON.stringify(map));
  } catch (e) {
    console.error('Error saving group last read time:', e);
  }
}

/**
 * Get unread messages count and mention status for a specific user in a specific group.
 * If user was added to a group (even if open for a long time) and hasn't opened it,
 * all messages sent by other members/system are counted as unread!
 * If user is mentioned (@nickname) in any unread message, hasMention is true.
 */
export function getGroupUnreadStats(groupId: string, userNickname: string): { count: number; hasMention: boolean } {
  if (!groupId || !userNickname) return { count: 0, hasMention: false };
  const cleanMe = normalizeNickname(userNickname);
  const lastReadTime = getGroupLastReadTime(groupId, cleanMe);

  try {
    const allMessages = getStoredDirectMessages();
    let count = 0;
    let hasMention = false;

    allMessages.forEach((m) => {
      if (!m) return;
      const isThisGroup = m.groupId === groupId || m.conversationId === groupId;
      if (!isThisGroup) return;

      // Don't count user's own sent messages
      if (normalizeNickname(m.senderNickname) === cleanMe) return;

      // Don't count messages deleted for this user or deleted for everyone
      if (m.isDeletedForEveryone) return;
      if (m.deletedForUsers && m.deletedForUsers.some((u) => normalizeNickname(u) === cleanMe)) {
        return;
      }

      // Check if message was explicitly read by this user
      if (m.readByUsers && m.readByUsers.some((u) => normalizeNickname(u) === cleanMe)) {
        return;
      }

      // If user has a lastReadTime recorded for this group, messages sent before or at that time are considered read
      if (lastReadTime) {
        const msgTime = new Date(m.timestamp || 0).getTime();
        const readTime = new Date(lastReadTime).getTime();
        if (msgTime <= readTime) return;
      }

      count++;

      // Check if this unread message mentioned this user (strict check so other members do not see it)
      const isMentioned = (() => {
        if (!cleanMe) return false;
        if (Array.isArray(m.mentionedNicknames) && m.mentionedNicknames.length > 0) {
          return m.mentionedNicknames.some((u) => normalizeNickname(u) === cleanMe);
        }
        if (!m.text) return false;
        const escaped = cleanMe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`@${escaped}\\b`, 'i').test(m.text);
      })();

      if (isMentioned) {
        hasMention = true;
      }
    });

    return { count, hasMention };
  } catch (e) {
    console.error('Error calculating group unread stats:', e);
    return { count: 0, hasMention: false };
  }
}

export function getGroupUnreadCount(groupId: string, userNickname: string): number {
  return getGroupUnreadStats(groupId, userNickname).count;
}

/**
 * Mark all messages in a group as read for the specific user
 */
export function markGroupMessagesAsRead(groupId: string, userNickname: string): void {
  if (!groupId || !userNickname) return;
  const cleanMe = normalizeNickname(userNickname);
  const now = new Date().toISOString();

  setGroupLastReadTime(groupId, cleanMe, now);

  try {
    const allMessages = getStoredDirectMessages();
    let changed = false;

    const updatedMessages = allMessages.map((m) => {
      const isThisGroup = m.groupId === groupId || m.conversationId === groupId;
      if (!isThisGroup) return m;

      // Don't modify own messages
      if (normalizeNickname(m.senderNickname) === cleanMe) return m;

      const hasRead = m.readByUsers && m.readByUsers.some((u) => normalizeNickname(u) === cleanMe);
      if (!hasRead) {
        changed = true;
        const updatedMsg: DirectMessage = {
          ...m,
          readByUsers: [...(m.readByUsers || []), cleanMe],
        };
        saveDirectMessageToFirestore(updatedMsg).catch(console.error);
        return updatedMsg;
      }
      return m;
    });

    if (changed) {
      localStorage.setItem(DIRECT_MESSAGES_KEY, JSON.stringify(updatedMessages));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('fuhsi_direct_message_updated'));
        window.dispatchEvent(new CustomEvent('fuhsi_groups_updated'));
      }
    }
  } catch (err) {
    console.error('Error marking group messages as read:', err);
  }
}

/**
 * Merge groups from Firestore snapshot into localStorage, filtering sample groups
 */
export function mergeFirestoreGroupsIntoStorage(firestoreGroups: ChatGroup[]): void {
  try {
    if (!Array.isArray(firestoreGroups)) return;

    // Purge any sample groups from Firestore
    firestoreGroups.forEach((g) => {
      if (isSampleGroup(g) && g.id) {
        deleteChatGroupFromFirestore(g.id).catch(() => {});
      }
    });

    const validFirestore = firestoreGroups.filter(
      (g) => g && g.id && !isSampleGroup(g) && !g.isDeleted
    );

    const stored = getStoredChatGroups();
    const map = new Map<string, ChatGroup>();

    stored.forEach((g) => {
      if (!isSampleGroup(g)) map.set(g.id, g);
    });

    let changed = false;
    validFirestore.forEach((fg) => {
      const existing = map.get(fg.id);
      if (!existing) {
        map.set(fg.id, fg);
        changed = true;
      } else {
        const fgTime = new Date(fg.updatedAt || fg.createdAt || 0).getTime();
        const exTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        if (fgTime >= exTime || JSON.stringify(fg) !== JSON.stringify(existing)) {
          map.set(fg.id, { ...existing, ...fg });
          changed = true;
        }
      }
    });

    if (changed) {
      saveStoredChatGroups(Array.from(map.values()));
    }
  } catch (err) {
    console.error('Error merging Firestore groups into storage:', err);
  }
}

/**
 * Get groups for a specific user (either a member, creator, or admin)
 * Includes calculated unreadCount for this specific user, and dynamically computes
 * the ACTUAL latest message from group history so preview always shows the genuine latest message!
 */
export function getUserGroups(userNickname: string): ChatGroup[] {
  if (!userNickname) return [];
  const cleanMe = normalizeNickname(userNickname);
  const allGroups = getStoredChatGroups();

  // Check if user has explicitly left any group so they never see it again
  let leftGroups: string[] = [];
  try {
    const leftRaw = localStorage.getItem(`fuhsi_left_groups_${cleanMe}`);
    if (leftRaw) leftGroups = JSON.parse(leftRaw);
  } catch (e) {}

  const allMessages = getStoredDirectMessages();

  return allGroups
    .filter((group) => {
      if (!group || group.isDeleted || isSampleGroup(group)) return false;
      if (leftGroups.includes(group.id)) return false;

      const isMember = (group.memberNicknames || []).some(
        (m) => normalizeNickname(m) === cleanMe
      );
      const isCreator = normalizeNickname(group.createdBy) === cleanMe;
      const isAdmin = (group.adminNicknames || []).some(
        (a) => normalizeNickname(a) === cleanMe
      );
      return isMember || isCreator || isAdmin;
    })
    .map((group) => {
      const stats = getGroupUnreadStats(group.id, cleanMe);

      // Find all non-deleted messages for this group for this user
      const groupMsgs = allMessages.filter((m) => {
        if (!m) return false;
        const isThisGroup = m.groupId === group.id || m.conversationId === group.id;
        if (!isThisGroup) return false;
        if (m.isDeletedForEveryone) return false;
        if (m.deletedForUsers && m.deletedForUsers.some((u) => normalizeNickname(u) === cleanMe)) {
          return false;
        }
        return true;
      });

      // Sort chronological ascending
      groupMsgs.sort((a, b) => {
        const tA = parseMessageTimestampMs(a);
        const tB = parseMessageTimestampMs(b);
        if (tA !== tB) return tA - tB;
        return (a.id || '').localeCompare(b.id || '');
      });

      // The true last message in this group
      const latestMsg = groupMsgs.length > 0 ? groupMsgs[groupMsgs.length - 1] : null;
      const latestMsgTime = latestMsg ? parseMessageTimestampMs(latestMsg) : 0;
      const groupUpdateTime = new Date(group.updatedAt || group.createdAt || 0).getTime() || 0;

      // Determine which is genuinely the most recent: latestMsg or group's stored lastMessage
      const useStoredGroupMsg = !latestMsg || (Boolean(group.lastMessage) && groupUpdateTime > latestMsgTime + 4000);

      const lastMessageText = (!useStoredGroupMsg && latestMsg)
        ? latestMsg.text
        : (group.lastMessage || (latestMsg ? latestMsg.text : (group.description || 'Tap to start group conversation')));

      let lastSender = (!useStoredGroupMsg && latestMsg)
        ? (latestMsg.isSystemMessage ? '' : latestMsg.senderNickname)
        : (group.lastMessageSender || (latestMsg && !latestMsg.isSystemMessage ? latestMsg.senderNickname : ''));

      if (lastSender === 'FUHSI Group System' || lastSender === 'System') {
        lastSender = '';
      }

      const lastTimeFormatted = (!useStoredGroupMsg && latestMsg)
        ? formatMessageTime(latestMsg.timestamp)
        : (group.lastTimestamp || (latestMsg ? formatMessageTime(latestMsg.timestamp) : formatMessageTime(group.createdAt)));

      const sortTimestampIso = (!useStoredGroupMsg && latestMsg)
        ? (typeof latestMsg.timestamp === 'string' && latestMsg.timestamp.includes('T') ? latestMsg.timestamp : new Date(latestMsgTime).toISOString())
        : (group.updatedAt || group.createdAt || new Date().toISOString());

      return {
        ...group,
        lastMessage: lastMessageText,
        lastMessageSender: lastSender,
        lastTimestamp: lastTimeFormatted,
        updatedAt: sortTimestampIso,
        unreadCount: stats.count,
        hasUnreadMention: stats.hasMention,
      };
    })
    .sort((a, b) => {
      const tA = parseMessageTimestampMs({ timestamp: a.updatedAt || a.createdAt });
      const tB = parseMessageTimestampMs({ timestamp: b.updatedAt || b.createdAt });
      return tB - tA;
    });
}

/**
 * Check if a user is an admin of a group
 */
export function isUserGroupAdmin(group: ChatGroup, userNickname: string): boolean {
  if (!group || !userNickname) return false;
  const cleanUser = normalizeNickname(userNickname);
  const isCreator = normalizeNickname(group.createdBy) === cleanUser;
  const inAdminList = (group.adminNicknames || []).some(
    (a) => normalizeNickname(a) === cleanUser
  );
  return isCreator || inAdminList;
}

/**
 * Check if a user is the creator of a group
 */
export function isUserGroupCreator(group: ChatGroup, userNickname: string): boolean {
  if (!group || !userNickname) return false;
  return normalizeNickname(group.createdBy) === normalizeNickname(userNickname);
}

/**
 * Formats a group system message to ensure clean, concise presentation:
 * - Omits "FUHSI Group System" or "System" headers/captions.
 * - Shows the main body directly (e.g., "🚪 modula left the group", "👋 modula was removed by @you", "🎯 Group created by @you").
 * - Displays @you for the current viewer if they performed or received the action, and clean handles without leading '@' for other members.
 */
export function formatGroupSystemMessage(rawText: string, viewerNickname?: string): string {
  if (!rawText) return '';
  let text = rawText.trim();

  // Strip any legacy or stray "FUHSI Group System: " or "System: " prefix
  text = text.replace(/^FUHSI\s+Group\s+System:\s*/i, '').replace(/^System:\s*/i, '');

  const cleanViewer = viewerNickname ? normalizeNickname(viewerNickname) : '';

  // 1. Leave group: 🚪 <user> left the group
  const leaveMatch = text.match(/^🚪\s*@?([a-zA-Z0-9_]+)\s+left\s+the\s+group/i);
  if (leaveMatch) {
    const leaver = normalizeNickname(leaveMatch[1]);
    if (cleanViewer && leaver === cleanViewer) {
      return '🚪 You left the group';
    }
    return `🚪 ${leaver} left the group`;
  }

  // 2. Member removed: 👋 <target> was removed by <actor>
  const removeMatch = text.match(/^👋\s*@?([a-zA-Z0-9_]+)\s+was\s+removed\s+by\s+@?([a-zA-Z0-9_]+)/i);
  if (removeMatch) {
    const target = normalizeNickname(removeMatch[1]);
    const actor = normalizeNickname(removeMatch[2]);
    if (cleanViewer && target === cleanViewer && actor === cleanViewer) {
      return '🚪 You left the group';
    }
    if (cleanViewer && target === cleanViewer) {
      return `👋 You were removed by ${actor}`;
    }
    if (cleanViewer && actor === cleanViewer) {
      return `👋 ${target} was removed by @you`;
    }
    return `👋 ${target} was removed by ${actor}`;
  }

  // 3. Group created:
  // e.g. 🎯 Group created by <creator> [· Added ...] OR 🎯 @creator created the group "..."
  if (text.startsWith('🎯')) {
    const legacyMatch = text.match(/^🎯\s*@?([a-zA-Z0-9_]+)\s+created\s+the\s+group(?:\s+"([^"]*)")?(?:\s+and\s+added\s+(.*))?/i);
    if (legacyMatch) {
      const creator = normalizeNickname(legacyMatch[1]);
      const rawAdded = legacyMatch[3] || '';
      const addedList = rawAdded
        .split(',')
        .map((s) => normalizeNickname(s))
        .filter(Boolean);

      const isCreatorMe = cleanViewer && creator === cleanViewer;
      const creatorText = isCreatorMe ? '@you' : creator;

      let addedText = '';
      if (addedList.length > 0) {
        const cleanedAdded = addedList
          .map((m) => (cleanViewer && m === cleanViewer ? 'you' : m))
          .join(', ');
        addedText = ` · Added ${cleanedAdded}`;
      }
      return `🎯 Group created by ${creatorText}${addedText}`;
    }

    const modernMatch = text.match(/^🎯\s*Group\s+created\s+by\s+@?([a-zA-Z0-9_]+)(?:\s*·\s*Added\s*(.*))?/i);
    if (modernMatch) {
      const creator = normalizeNickname(modernMatch[1]);
      const rawAdded = modernMatch[2] || '';
      const addedList = rawAdded
        .split(',')
        .map((s) => normalizeNickname(s))
        .filter(Boolean);

      const isCreatorMe = cleanViewer && creator === cleanViewer;
      const creatorText = isCreatorMe ? '@you' : creator;

      let addedText = '';
      if (addedList.length > 0) {
        const cleanedAdded = addedList
          .map((m) => (cleanViewer && m === cleanViewer ? 'you' : m))
          .join(', ');
        addedText = ` · Added ${cleanedAdded}`;
      }
      return `🎯 Group created by ${creatorText}${addedText}`;
    }
  }

  // 4. Added members: 👤 <actor> added <members> to the group
  const addMatch = text.match(/^👤\s*@?([a-zA-Z0-9_]+)\s+added\s+(.*?)\s+to\s+the\s+group/i);
  if (addMatch) {
    const actor = normalizeNickname(addMatch[1]);
    const rawMembers = addMatch[2] || '';
    const memberList = rawMembers
      .split(',')
      .map((s) => normalizeNickname(s))
      .filter(Boolean);

    const isActorMe = cleanViewer && actor === cleanViewer;
    const actorText = isActorMe ? '@you' : actor;

    const viewerInMembers = cleanViewer && memberList.includes(cleanViewer);
    let membersDisplay = '';
    if (viewerInMembers) {
      const others = memberList.filter((m) => m !== cleanViewer);
      membersDisplay = others.length > 0 ? `you and ${others.join(', ')}` : 'you';
    } else {
      membersDisplay = memberList.join(', ');
    }

    return `👤 ${actorText} added ${membersDisplay} to the group`;
  }

  // 5. Promoted to Admin: ⭐ <actor> promoted <target> to Group Admin
  const promoteMatch = text.match(/^⭐\s*@?([a-zA-Z0-9_]+)\s+promoted\s+@?([a-zA-Z0-9_]+)\s+to\s+Group\s+Admin/i);
  if (promoteMatch) {
    const actor = normalizeNickname(promoteMatch[1]);
    const target = normalizeNickname(promoteMatch[2]);
    if (cleanViewer && actor === cleanViewer) {
      return `⭐ @you promoted ${target} to Group Admin`;
    }
    if (cleanViewer && target === cleanViewer) {
      return `⭐ ${actor} promoted you to Group Admin`;
    }
    return `⭐ ${actor} promoted ${target} to Group Admin`;
  }

  // 6. Removed as Admin: 🛡️ <actor> removed <target> as Group Admin
  const demoteMatch = text.match(/^🛡️\s*@?([a-zA-Z0-9_]+)\s+removed\s+@?([a-zA-Z0-9_]+)\s+as\s+Group\s+Admin/i);
  if (demoteMatch) {
    const actor = normalizeNickname(demoteMatch[1]);
    const target = normalizeNickname(demoteMatch[2]);
    if (cleanViewer && actor === cleanViewer) {
      return `🛡️ @you removed ${target} as Group Admin`;
    }
    if (cleanViewer && target === cleanViewer) {
      return `🛡️ ${actor} removed you as Group Admin`;
    }
    return `🛡️ ${actor} removed ${target} as Group Admin`;
  }

  // 7. Updated group profile: ✏️ <actor> updated the group profile
  const updateMatch = text.match(/^✏️\s*@?([a-zA-Z0-9_]+)\s+updated\s+the\s+group\s+profile/i);
  if (updateMatch) {
    const actor = normalizeNickname(updateMatch[1]);
    if (cleanViewer && actor === cleanViewer) {
      return `✏️ @you updated the group profile`;
    }
    return `✏️ ${actor} updated the group profile`;
  }

  // Generic fallback: format @mentions
  if (cleanViewer) {
    text = text.replace(/@([a-zA-Z0-9_]+)/g, (_, nick) => {
      const clean = normalizeNickname(nick);
      if (clean === cleanViewer) return '@you';
      return clean;
    });
  }

  return text;
}

/**
 * Send an automated group system notification message into the chat stream
 */
export function sendGroupSystemMessage(
  groupId: string, 
  text: string, 
  actorNickname?: string
): DirectMessage {
  const cleanActor = actorNickname ? normalizeNickname(actorNickname) : undefined;
  const sysMsg: DirectMessage = {
    id: `sys_group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    conversationId: groupId,
    senderNickname: 'System',
    receiverNickname: 'group',
    text,
    timestamp: new Date().toISOString(),
    isGroupMessage: true,
    groupId,
    isSystemMessage: true,
    readByUsers: cleanActor ? [cleanActor] : [],
  };

  sendDirectMessage(sysMsg);
  return sysMsg;
}

/**
 * Create a new Chat Group
 */
export function createChatGroup(params: {
  name: string;
  description?: string;
  avatarUrl?: string;
  avatarKey?: string;
  creatorNickname: string;
  initialMemberNicknames: string[];
}): ChatGroup {
  const cleanCreator = normalizeNickname(params.creatorNickname);
  const creatorDisplay = `@${cleanCreator}`;

  const cleanMembers = new Set<string>();
  cleanMembers.add(creatorDisplay);

  const addedMembersList: string[] = [];
  (params.initialMemberNicknames || []).forEach((m) => {
    const cleanM = normalizeNickname(m);
    if (cleanM && cleanM !== cleanCreator) {
      cleanMembers.add(`@${cleanM}`);
      addedMembersList.push(cleanM);
    }
  });

  const creationMsg = addedMembersList.length > 0
    ? `🎯 Group created by ${cleanCreator} · Added ${addedMembersList.join(', ')}`
    : `🎯 Group created by ${cleanCreator}`;

  const newGroup: ChatGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: params.name.trim(),
    description: (params.description || '').trim(),
    avatarUrl: params.avatarUrl || '',
    avatarKey: params.avatarKey || String(Math.floor(Math.random() * 6) + 1),
    createdBy: creatorDisplay,
    createdAt: new Date().toISOString(),
    adminNicknames: [creatorDisplay],
    memberNicknames: Array.from(cleanMembers),
    lastMessage: creationMsg,
    lastMessageSender: cleanCreator,
    lastTimestamp: formatMessageTime(new Date()),
    unreadCount: 0,
    updatedAt: new Date().toISOString(),
  };

  const stored = getStoredChatGroups();
  const updated = [newGroup, ...stored];
  saveStoredChatGroups(updated);

  // Sync with Firestore in background
  saveChatGroupToFirestore(newGroup).catch((err) =>
    console.error('Error syncing new group to Firestore:', err)
  );

  // Mark group as read immediately for the creator
  setGroupLastReadTime(newGroup.id, creatorDisplay, new Date().toISOString());

  // Send system message into chat stream (marked read for creator, unread for all added members)
  sendGroupSystemMessage(newGroup.id, creationMsg, cleanCreator);

  return newGroup;
}

/**
 * Update Group Name, Description, or Picture
 */
export function updateGroupInfo(
  groupId: string,
  updates: Partial<Pick<ChatGroup, 'name' | 'description' | 'avatarUrl' | 'avatarKey'>>,
  actorNickname: string
): ChatGroup | null {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return null;

  const current = stored[index];
  if (!isUserGroupAdmin(current, actorNickname)) {
    throw new Error('Only group admins can update group information');
  }

  const cleanActor = normalizeNickname(actorNickname);
  const sysText = `✏️ ${cleanActor} updated the group profile`;

  const updated: ChatGroup = {
    ...current,
    ...updates,
    lastMessage: sysText,
    lastMessageSender: cleanActor,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  sendGroupSystemMessage(groupId, sysText, cleanActor);

  return updated;
}

/**
 * Add members to an existing group
 */
export function addGroupMembers(
  groupId: string,
  newMemberNicknames: string[],
  actorNickname: string
): ChatGroup | null {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return null;

  const current = stored[index];
  if (!isUserGroupAdmin(current, actorNickname)) {
    throw new Error('Only group admins can add new members');
  }

  const cleanActor = normalizeNickname(actorNickname);
  const currentMembers = new Set(current.memberNicknames || []);
  const added: string[] = [];

  newMemberNicknames.forEach((m) => {
    const cleanM = normalizeNickname(m);
    const formatted = `@${cleanM}`;
    if (!Array.from(currentMembers).some((cm) => normalizeNickname(cm) === cleanM)) {
      currentMembers.add(formatted);
      added.push(cleanM);
    }
  });

  if (added.length === 0) return current;

  const addedList = added.join(', ');
  const systemMsgText = `👤 ${cleanActor} added ${addedList} to the group`;

  const updated: ChatGroup = {
    ...current,
    memberNicknames: Array.from(currentMembers),
    lastMessage: systemMsgText,
    lastMessageSender: cleanActor,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  sendGroupSystemMessage(groupId, systemMsgText, cleanActor);

  return updated;
}

/**
 * Remove a member from the group
 */
export function removeGroupMember(
  groupId: string,
  targetNickname: string,
  actorNickname: string
): ChatGroup | null {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return null;

  const current = stored[index];
  if (!isUserGroupAdmin(current, actorNickname)) {
    throw new Error('Only group admins can remove members');
  }

  const cleanTarget = normalizeNickname(targetNickname);
  const cleanCreator = normalizeNickname(current.createdBy);
  const cleanActor = normalizeNickname(actorNickname);

  if (cleanTarget === cleanCreator) {
    throw new Error('The group creator cannot be removed');
  }

  // Only creator can remove another admin
  const isTargetAdmin = (current.adminNicknames || []).some(
    (a) => normalizeNickname(a) === cleanTarget
  );
  if (isTargetAdmin && cleanActor !== cleanCreator) {
    throw new Error('Only the group creator can remove an admin');
  }

  const updatedMembers = (current.memberNicknames || []).filter(
    (m) => normalizeNickname(m) !== cleanTarget
  );
  const updatedAdmins = (current.adminNicknames || []).filter(
    (a) => normalizeNickname(a) !== cleanTarget
  );

  const systemMsgText = `👋 ${cleanTarget} was removed by ${cleanActor}`;

  const updated: ChatGroup = {
    ...current,
    memberNicknames: updatedMembers,
    adminNicknames: updatedAdmins,
    lastMessage: systemMsgText,
    lastMessageSender: cleanActor,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  sendGroupSystemMessage(groupId, systemMsgText, cleanActor);

  return updated;
}

/**
 * Promote or Demote a group member as Admin
 */
export function toggleGroupAdmin(
  groupId: string,
  targetNickname: string,
  actorNickname: string,
  makeAdmin: boolean
): ChatGroup | null {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return null;

  const current = stored[index];
  if (!isUserGroupAdmin(current, actorNickname)) {
    throw new Error('Only group admins can assign admin privileges');
  }

  const cleanTarget = normalizeNickname(targetNickname);
  const cleanCreator = normalizeNickname(current.createdBy);
  const cleanActor = normalizeNickname(actorNickname);

  // The creator is always admin
  if (cleanTarget === cleanCreator && !makeAdmin) {
    throw new Error('The group creator cannot be dismissed as admin');
  }

  // If dismissing an admin, only creator can do so
  if (!makeAdmin && cleanActor !== cleanCreator) {
    throw new Error('Only the group creator can dismiss other admins');
  }

  const targetTag = `@${cleanTarget}`;

  let updatedAdmins = [...(current.adminNicknames || [])];

  if (makeAdmin) {
    if (!updatedAdmins.some((a) => normalizeNickname(a) === cleanTarget)) {
      updatedAdmins.push(targetTag);
    }
  } else {
    updatedAdmins = updatedAdmins.filter((a) => normalizeNickname(a) !== cleanTarget);
  }

  const systemMsgText = makeAdmin
    ? `⭐ ${cleanActor} promoted ${cleanTarget} to Group Admin`
    : `🛡️ ${cleanActor} removed ${cleanTarget} as Group Admin`;

  const updated: ChatGroup = {
    ...current,
    adminNicknames: updatedAdmins,
    lastMessage: systemMsgText,
    lastMessageSender: cleanActor,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  sendGroupSystemMessage(groupId, systemMsgText, cleanActor);

  return updated;
}

/**
 * Leave a group
 */
export function leaveGroup(groupId: string, userNickname: string): ChatGroup | null {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return null;

  const current = stored[index];
  const cleanMe = normalizeNickname(userNickname);

  const updatedMembers = (current.memberNicknames || []).filter(
    (m) => normalizeNickname(m) !== cleanMe
  );
  const updatedAdmins = (current.adminNicknames || []).filter(
    (a) => normalizeNickname(a) !== cleanMe
  );

  // If creator leaves, assign creator to next admin or first member
  let newCreator = current.createdBy;
  if (normalizeNickname(current.createdBy) === cleanMe) {
    if (updatedAdmins.length > 0) {
      newCreator = updatedAdmins[0];
    } else if (updatedMembers.length > 0) {
      newCreator = updatedMembers[0];
      updatedAdmins.push(newCreator);
    }
  }

  const systemMsgText = `🚪 ${cleanMe} left the group`;

  const updated: ChatGroup = {
    ...current,
    createdBy: newCreator,
    memberNicknames: updatedMembers,
    adminNicknames: updatedAdmins,
    lastMessage: systemMsgText,
    lastMessageSender: cleanMe,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  // Permanently record that this user left this group so it never resurfaces for them
  try {
    const leftKey = `fuhsi_left_groups_${cleanMe}`;
    const rawLeft = localStorage.getItem(leftKey);
    const leftList: string[] = rawLeft ? JSON.parse(rawLeft) : [];
    if (!leftList.includes(groupId)) {
      leftList.push(groupId);
      localStorage.setItem(leftKey, JSON.stringify(leftList));
    }
  } catch (e) {}

  // Clear messages locally for the leaving user
  clearConversationHistoryForUser(groupId, userNickname);

  sendGroupSystemMessage(groupId, systemMsgText, cleanMe);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('fuhsi_group_left', { detail: { groupId } }));
  }

  return updated;
}

/**
 * Delete an entire group
 */
export function deleteChatGroup(groupId: string, actorNickname: string): boolean {
  const stored = getStoredChatGroups();
  const target = stored.find((g) => g.id === groupId);
  if (!target) return false;

  const cleanActor = normalizeNickname(actorNickname);
  const isCreator = normalizeNickname(target.createdBy) === cleanActor;
  const isSiteAdmin = cleanActor.includes('admin') || cleanActor.includes('modula');

  if (!isCreator && !isSiteAdmin) {
    throw new Error('Only the group creator or site administrator can delete this group');
  }

  const remaining = stored.filter((g) => g.id !== groupId);
  saveStoredChatGroups(remaining);
  deleteChatGroupFromFirestore(groupId).catch(console.error);

  return true;
}

/**
 * Update the last message on a group
 */
export function updateGroupLastMessage(
  groupId: string,
  lastMessage: string,
  senderNickname: string
): void {
  const stored = getStoredChatGroups();
  const index = stored.findIndex((g) => g.id === groupId);
  if (index === -1) return;

  const current = stored[index];
  const updated: ChatGroup = {
    ...current,
    lastMessage,
    lastMessageSender: senderNickname,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);
}
