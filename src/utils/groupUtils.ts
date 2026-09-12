import { ChatGroup, DirectMessage } from '../types';
import { 
  normalizeNickname, 
  formatMessageTime, 
  sendDirectMessage, 
  getStoredDirectMessages, 
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

      // Check if this unread message mentioned this user
      const isMentioned =
        (Array.isArray(m.mentionedNicknames) && m.mentionedNicknames.some((u) => normalizeNickname(u) === cleanMe)) ||
        (m.text && (m.text.includes(`@${cleanMe}`) || (cleanMe && m.text.toLowerCase().includes(`@${cleanMe.toLowerCase()}`))));

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
 * Includes calculated unreadCount for this specific user
 */
export function getUserGroups(userNickname: string): ChatGroup[] {
  if (!userNickname) return [];
  const cleanMe = normalizeNickname(userNickname);
  const allGroups = getStoredChatGroups();

  return allGroups
    .filter((group) => {
      if (group.isDeleted || isSampleGroup(group)) return false;
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
      return {
        ...group,
        unreadCount: stats.count,
        hasUnreadMention: stats.hasMention,
      };
    })
    .sort((a, b) => {
      const tA = new Date(a.updatedAt || a.lastTimestamp || a.createdAt || 0).getTime() || 0;
      const tB = new Date(b.updatedAt || b.lastTimestamp || b.createdAt || 0).getTime() || 0;
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
    senderNickname: 'FUHSI Group System',
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
  const creatorDisplay = params.creatorNickname.startsWith('@')
    ? params.creatorNickname
    : `@${params.creatorNickname}`;

  const cleanMembers = new Set<string>();
  cleanMembers.add(creatorDisplay);

  const addedMembersList: string[] = [];
  (params.initialMemberNicknames || []).forEach((m) => {
    const formatted = m.startsWith('@') ? m : `@${m}`;
    cleanMembers.add(formatted);
    if (normalizeNickname(m) !== normalizeNickname(creatorDisplay)) {
      addedMembersList.push(formatted);
    }
  });

  const creationMsg = addedMembersList.length > 0
    ? `🎯 ${creatorDisplay} created the group "${params.name.trim()}" and added ${addedMembersList.join(', ')}`
    : `🎯 ${creatorDisplay} created the group "${params.name.trim()}"`;

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
    lastMessageSender: creatorDisplay,
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
  sendGroupSystemMessage(newGroup.id, creationMsg, creatorDisplay);

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

  const updated: ChatGroup = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  const actorTag = actorNickname.startsWith('@') ? actorNickname : `@${actorNickname}`;
  sendGroupSystemMessage(groupId, `✏️ ${actorTag} updated the group profile`);

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

  const currentMembers = new Set(current.memberNicknames || []);
  const added: string[] = [];

  newMemberNicknames.forEach((m) => {
    const formatted = m.startsWith('@') ? m : `@${m}`;
    if (!currentMembers.has(formatted)) {
      currentMembers.add(formatted);
      added.push(formatted);
    }
  });

  if (added.length === 0) return current;

  const actorTag = actorNickname.startsWith('@') ? actorNickname : `@${actorNickname}`;
  const addedList = added.join(', ');
  const systemMsgText = `👤 ${actorTag} added ${addedList} to the group`;

  const updated: ChatGroup = {
    ...current,
    memberNicknames: Array.from(currentMembers),
    lastMessage: systemMsgText,
    lastMessageSender: actorTag,
    lastTimestamp: formatMessageTime(new Date()),
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  sendGroupSystemMessage(groupId, systemMsgText, actorNickname);

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

  const updated: ChatGroup = {
    ...current,
    memberNicknames: updatedMembers,
    adminNicknames: updatedAdmins,
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  const actorTag = actorNickname.startsWith('@') ? actorNickname : `@${actorNickname}`;
  const targetTag = targetNickname.startsWith('@') ? targetNickname : `@${targetNickname}`;
  sendGroupSystemMessage(groupId, `👋 ${targetTag} was removed by ${actorTag}`);

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

  const targetTag = targetNickname.startsWith('@') ? targetNickname : `@${targetNickname}`;
  const actorTag = actorNickname.startsWith('@') ? actorNickname : `@${actorNickname}`;

  let updatedAdmins = [...(current.adminNicknames || [])];

  if (makeAdmin) {
    if (!updatedAdmins.some((a) => normalizeNickname(a) === cleanTarget)) {
      updatedAdmins.push(targetTag);
    }
  } else {
    updatedAdmins = updatedAdmins.filter((a) => normalizeNickname(a) !== cleanTarget);
  }

  const updated: ChatGroup = {
    ...current,
    adminNicknames: updatedAdmins,
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  if (makeAdmin) {
    sendGroupSystemMessage(groupId, `⭐ ${actorTag} promoted ${targetTag} to Group Admin`);
  } else {
    sendGroupSystemMessage(groupId, `🛡️ ${actorTag} removed ${targetTag} as Group Admin`);
  }

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

  const updated: ChatGroup = {
    ...current,
    createdBy: newCreator,
    memberNicknames: updatedMembers,
    adminNicknames: updatedAdmins,
    updatedAt: new Date().toISOString(),
  };

  stored[index] = updated;
  saveStoredChatGroups(stored);
  saveChatGroupToFirestore(updated).catch(console.error);

  const userTag = userNickname.startsWith('@') ? userNickname : `@${userNickname}`;
  sendGroupSystemMessage(groupId, `🚪 ${userTag} left the group`);

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
