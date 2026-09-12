import { UserProfile } from '../types';
import { INITIAL_USER_PROFILE } from '../data/initialData';
import { pushServerDbSync, mergeUsers } from './apiSync';
import { saveUserToFirestore, saveUsersBatchToFirestore } from '../lib/firestoreSync';
import { isDemoUser } from './postGenerator';
import { getUserBadgeInfo } from './verificationUtils';

export { getUserBadgeInfo };

export const USER_DB_KEY = 'fuhsi_users_db';
export const DELETED_USERS_KEY = 'fuhsi_deleted_users_db';

export interface DeletedUserEntry {
  id?: string;
  nickname?: string;
  studentEmail?: string;
  matricNumber?: string;
  deletedAt: string;
}

/**
 * Retrieve all permanently deleted user records
 */
export function getDeletedUsersList(): DeletedUserEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const stored = localStorage.getItem(DELETED_USERS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Error reading deleted users list:', err);
    return [];
  }
}

/**
 * Check whether a user or identifier has been permanently deleted
 */
export function isUserPermanentlyDeleted(userOrIdentifier?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrIdentifier) return false;
  const deletedList = getDeletedUsersList();
  if (deletedList.length === 0) return false;

  let targetId = '';
  let targetNick = '';
  let targetEmail = '';
  let targetMatric = '';

  if (typeof userOrIdentifier === 'string') {
    const clean = userOrIdentifier.trim().toLowerCase().replace(/^@/, '');
    targetNick = clean;
    if (userOrIdentifier.includes('@')) {
      targetEmail = userOrIdentifier.trim().toLowerCase();
    }
  } else if (typeof userOrIdentifier === 'object') {
    if (userOrIdentifier.id) targetId = String(userOrIdentifier.id).trim();
    if (userOrIdentifier.nickname) targetNick = String(userOrIdentifier.nickname).trim().toLowerCase().replace(/^@/, '');
    if (userOrIdentifier.studentEmail) targetEmail = String(userOrIdentifier.studentEmail).trim().toLowerCase();
    if (userOrIdentifier.matricNumber) targetMatric = String(userOrIdentifier.matricNumber).trim().toUpperCase();
  }

  return deletedList.some((entry) => {
    const eId = entry.id ? String(entry.id).trim() : '';
    const eNick = entry.nickname ? String(entry.nickname).trim().toLowerCase().replace(/^@/, '') : '';
    const eEmail = entry.studentEmail ? String(entry.studentEmail).trim().toLowerCase() : '';
    const eMatric = entry.matricNumber ? String(entry.matricNumber).trim().toUpperCase() : '';

    if (targetId && eId && targetId === eId) return true;
    if (targetNick && eNick && targetNick === eNick) return true;
    if (targetEmail && eEmail && targetEmail === eEmail) return true;
    if (targetMatric && eMatric && targetMatric === eMatric) return true;
    return false;
  });
}

/**
 * Mark a user account as permanently deleted across the device and all storage
 */
export function markUserPermanentlyDeleted(user: { id?: string; nickname?: string; studentEmail?: string; matricNumber?: string }): void {
  if (!user) return;
  try {
    const list = getDeletedUsersList();
    const cleanNick = user.nickname ? user.nickname.trim().toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = user.studentEmail ? user.studentEmail.trim().toLowerCase() : '';
    const cleanMatric = user.matricNumber ? user.matricNumber.trim().toUpperCase() : '';
    const entry: DeletedUserEntry = {
      id: user.id || undefined,
      nickname: cleanNick || undefined,
      studentEmail: cleanEmail || undefined,
      matricNumber: cleanMatric || undefined,
      deletedAt: new Date().toISOString(),
    };
    const updated = [
      entry,
      ...list.filter((e) => {
        const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
        const eEmail = (e.studentEmail || '').toLowerCase();
        const eId = e.id || '';
        if (user.id && eId === user.id) return false;
        if (cleanNick && eNick === cleanNick) return false;
        if (cleanEmail && eEmail === cleanEmail) return false;
        return true;
      }),
    ];
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));

    // Remove from fuhsi_users_db
    const storedUsers = localStorage.getItem(USER_DB_KEY);
    if (storedUsers) {
      const users: UserProfile[] = JSON.parse(storedUsers);
      const filtered = users.filter((u) => {
        const uNick = (u.nickname || '').toLowerCase().replace(/^@/, '');
        const uEmail = (u.studentEmail || '').toLowerCase();
        if (user.id && u.id === user.id) return false;
        if (cleanNick && uNick === cleanNick) return false;
        if (cleanEmail && uEmail === cleanEmail) return false;
        return true;
      });
      localStorage.setItem(USER_DB_KEY, JSON.stringify(filtered));
    }

    // Check active user in local session
    const activeJson = localStorage.getItem('fuhsi_active_user');
    if (activeJson) {
      const activeUser: UserProfile = JSON.parse(activeJson);
      const aNick = (activeUser.nickname || '').toLowerCase().replace(/^@/, '');
      const aEmail = (activeUser.studentEmail || '').toLowerCase();
      if ((user.id && activeUser.id === user.id) || (cleanNick && aNick === cleanNick) || (cleanEmail && aEmail === cleanEmail)) {
        localStorage.removeItem('fuhsi_active_user');
      }
    }
  } catch (err) {
    console.error('Error marking user permanently deleted:', err);
  }
}

/**
 * Remove a user or identifier from the permanently deleted tombstone (e.g. if user is registering afresh)
 */
export function unmarkUserPermanentlyDeleted(user: { id?: string; nickname?: string; studentEmail?: string; matricNumber?: string }): void {
  if (!user) return;
  try {
    const list = getDeletedUsersList();
    const cleanNick = user.nickname ? user.nickname.trim().toLowerCase().replace(/^@/, '') : '';
    const cleanEmail = user.studentEmail ? user.studentEmail.trim().toLowerCase() : '';
    const cleanMatric = user.matricNumber ? user.matricNumber.trim().toUpperCase() : '';

    const updated = list.filter((e) => {
      const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
      const eEmail = (e.studentEmail || '').toLowerCase();
      const eMatric = (e.matricNumber || '').toUpperCase();
      const eId = e.id || '';

      if (user.id && eId === user.id) return false;
      if (cleanNick && eNick === cleanNick) return false;
      if (cleanEmail && eEmail === cleanEmail) return false;
      if (cleanMatric && eMatric === cleanMatric) return false;
      return true;
    });

    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error unmarking deleted user:', err);
  }
}

/**
 * Remove a user identity from the deleted tombstone (e.g. when creating a brand new account afresh)
 */
export function removeUserFromDeletedTombstone(nicknameOrEmail?: string): void {
  if (!nicknameOrEmail) return;
  try {
    const list = getDeletedUsersList();
    const clean = nicknameOrEmail.trim().toLowerCase().replace(/^@/, '');
    const updated = list.filter((e) => {
      const eNick = (e.nickname || '').toLowerCase().replace(/^@/, '');
      const eEmail = (e.studentEmail || '').toLowerCase();
      return eNick !== clean && eEmail !== clean && eEmail !== nicknameOrEmail.trim().toLowerCase();
    });
    localStorage.setItem(DELETED_USERS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Error removing user from deleted tombstone:', err);
  }
}

/**
 * Check if a user or user handle is the @modula Admin account
 */
export function isModulaAccount(userOrNickname?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrNickname) return false;
  if (typeof userOrNickname === 'string') {
    const clean = userOrNickname.trim().toLowerCase().replace(/^@/, '');
    return clean === 'modula';
  }
  if (typeof userOrNickname === 'object') {
    if (userOrNickname.id === 'usr_admin_modula') return true;
    const nick = (userOrNickname.nickname || '').trim().toLowerCase().replace(/^@/, '');
    if (nick === 'modula') return true;
  }
  return false;
}

/**
 * Sanitize a user object so that @modula never contains academic classification
 */
export function sanitizeModulaProfile<T extends Partial<UserProfile>>(user: T): T {
  if (!isModulaAccount(user)) return user;
  return {
    ...user,
    department: '',
    level: '',
    accountType: 'Admin',
    matricNumber: '',
    isAdmin: true,
  };
}

export const DEFAULT_USERS_LIST: UserProfile[] = [
  {
    id: 'usr_admin_modula',
    nickname: '@modula',
    accountType: 'Admin',
    realName: 'Administrator',
    matricNumber: '',
    studentEmail: 'fuhsiconnectsupport@gmail.com',
    emergencyHomePhone: '08000000000',
    department: '',
    level: '',
    bio: 'Platform Administrator (@modula).',
    avatarKey: '1',
    badgeType: 'GOLD',
    badgeTitle: 'Official Admin',
    reputationScore: 9999,
    isVerified: true,
    isApproved: true,
    isDeclined: false,
    isAdmin: true,
  },
  {
    id: 'usr_student_adedeji_ayo_24prt007',
    nickname: '@Deji',
    accountType: 'Student',
    realName: 'Adedeji Ayo',
    matricNumber: '24/PRT/007',
    studentEmail: 'faithlucas.co@gmail.com',
    emergencyHomePhone: '091562232018',
    department: 'Prosthetics and Orthotics',
    level: '200L',
    bio: 'FUHSI Student | Prosthetics and Orthotics (200L)',
    avatarKey: 'caduceus',
    badgeType: 'BLUE',
    badgeTitle: '',
    reputationScore: 180,
    isVerified: true,
    isApproved: true,
    isDeclined: false,
    isAdmin: false,
  },
];

/**
 * Get all users stored in the database. If none exists, initializes default list.
 */
export function getStoredUsers(): UserProfile[] {
  try {
    const stored = localStorage.getItem(USER_DB_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Automatically filter out any demo/mock accounts and permanently deleted users, and sanitize @modula
        const realUsers = parsed
          .filter((u) => !isDemoUser(u) && !isUserPermanentlyDeleted(u))
          .map((u) => sanitizeModulaProfile(u));
        const filteredDefaults = DEFAULT_USERS_LIST
          .filter((u) => !isUserPermanentlyDeleted(u))
          .map((u) => sanitizeModulaProfile(u));
        const withDefaults = mergeUsers(filteredDefaults, realUsers).map((u) => sanitizeModulaProfile(u));
        const cleaned = withDefaults.filter((u) => !isUserPermanentlyDeleted(u));
        try {
          localStorage.setItem(USER_DB_KEY, JSON.stringify(cleaned));
        } catch (e) {
          console.error('Error auto-cleaning user database:', e);
        }
        return cleaned;
      }
    }
  } catch (err) {
    console.error('Error reading user database:', err);
  }

  // Fallback / First-time initialization
  const initialDefaults = DEFAULT_USERS_LIST
    .filter((u) => !isUserPermanentlyDeleted(u))
    .map((u) => sanitizeModulaProfile(u));
  try {
    localStorage.setItem(USER_DB_KEY, JSON.stringify(initialDefaults));
  } catch (e) {
    console.error('Error initializing user database:', e);
  }
  return initialDefaults;
}

/**
 * Save user list to database and sync across devices via Firestore and server API
 */
export function saveStoredUsers(users: UserProfile[]): void {
  const realOnly = users
    .map((u) => sanitizeModulaProfile(u))
    .filter((u) => !isDemoUser(u) && !isUserPermanentlyDeleted(u));
  const filteredDefaults = DEFAULT_USERS_LIST
    .filter((u) => !isUserPermanentlyDeleted(u))
    .map((u) => sanitizeModulaProfile(u));
  const cleaned = mergeUsers(realOnly.length > 0 ? realOnly : filteredDefaults, [])
    .map((u) => sanitizeModulaProfile(u))
    .filter((u) => !isUserPermanentlyDeleted(u));
  try {
    localStorage.setItem(USER_DB_KEY, JSON.stringify(cleaned));
  } catch (e) {
    console.error('Error saving user database:', e);
  }
  // Sync to Firestore cloud database
  saveUsersBatchToFirestore(cleaned).catch((err) => {
    console.error('Error batch saving users to Firestore:', err);
  });
  // Sync to central server database asynchronously
  pushServerDbSync({ users: cleaned, replaceUsers: true } as any).catch((err) => {
    console.error('Error syncing users to server:', err);
  });
}


/**
 * Find user by nickname
 */
export function findUserByNickname(nickname: string): UserProfile | undefined {
  if (!nickname) return undefined;
  const clean = nickname.trim().toLowerCase().replace(/^@/, '');
  const users = getStoredUsers();
  const found = users.find((u) => (u.nickname || '').trim().toLowerCase().replace(/^@/, '') === clean);
  return found ? sanitizeModulaProfile(found) : undefined;
}

/**
 * Check if a user or user handle is a Guest account
 */
export function isGuestAccount(userOrNickname?: Partial<UserProfile> | string | null | any): boolean {
  if (!userOrNickname) return false;
  if (isModulaAccount(userOrNickname)) return false;
  if (typeof userOrNickname === 'object') {
    if (userOrNickname.isAdmin) return false;
    if (userOrNickname.accountType === 'Admin') return false;
    if (userOrNickname.accountType === 'Guest') return true;
    if (userOrNickname.accountType === 'Student') return false;
    if (userOrNickname.badgeTitle === 'Guest') return true;
    if (userOrNickname.nickname) {
      const cleanNick = (userOrNickname.nickname || '').toLowerCase().replace(/^@/, '');
      if (cleanNick.startsWith('guest_') || cleanNick.startsWith('guest')) {
        return userOrNickname.accountType !== 'Student';
      }
      const dbUser = findUserByNickname(userOrNickname.nickname);
      if (dbUser?.accountType === 'Guest') return true;
      if (dbUser?.accountType === 'Student' || dbUser?.accountType === 'Admin') return false;
    }
    // Fallback: If user has no matricNumber and no academic department, consider them Guest
    if (!userOrNickname.matricNumber && (!userOrNickname.department || userOrNickname.department === 'FUHSI' || userOrNickname.department === 'General')) {
      return true;
    }
    return false;
  }
  const cleanNick = (userOrNickname || '').toLowerCase().replace(/^@/, '');
  if (cleanNick.startsWith('guest_') || cleanNick.startsWith('guest')) {
    const dbUser = findUserByNickname(userOrNickname);
    return dbUser?.accountType !== 'Student';
  }
  const dbUser = findUserByNickname(userOrNickname);
  if (dbUser?.accountType === 'Guest') return true;
  if (dbUser?.accountType === 'Student' || dbUser?.accountType === 'Admin') return false;
  return false;
}

/**
 * Get account category: 'Student' | 'Guest'
 */
export function getUserAccountType(userOrNickname?: Partial<UserProfile> | string | null | any): 'Student' | 'Guest' {
  return isGuestAccount(userOrNickname) ? 'Guest' : 'Student';
}

/**
 * Return appropriate subtitle string for any user identity:
 * - For Admin (@modula): '' (No academic classification)
 * - For Guest: 'Guest'
 * - For Student: 'Department • Level' (or department/FUHSI Student)
 */
export function getUserIdentitySubtitle(
  userOrNickname?: Partial<UserProfile> | string | null | any,
  fallbackDept?: string,
  fallbackLevel?: string
): string {
  if (isModulaAccount(userOrNickname)) {
    return '';
  }
  if (isGuestAccount(userOrNickname)) {
    return 'Guest';
  }
  let dept = fallbackDept;
  let lvl = fallbackLevel;
  if (typeof userOrNickname === 'object' && userOrNickname) {
    if (isModulaAccount(userOrNickname)) return '';
    if (userOrNickname.accountType === 'Guest') return 'Guest';
    dept = userOrNickname.department || dept;
    lvl = userOrNickname.level || lvl;
  } else if (typeof userOrNickname === 'string') {
    const dbUser = findUserByNickname(userOrNickname);
    if (dbUser) {
      if (isModulaAccount(dbUser)) return '';
      if (dbUser.accountType === 'Guest') return 'Guest';
      dept = dbUser.department || dept;
      lvl = dbUser.level || lvl;
    }
  }
  if (dept && lvl) {
    return `${dept} • ${lvl}`;
  }
  if (dept) return dept;
  return 'FUHSI Student';
}

/**
 * Calculate the total count of approved, active community members
 */
export function getApprovedMembersCount(): number {
  const users = getStoredUsers();
  const approved = users.filter((u) => u.isApproved === true && !u.isDeclined);
  return approved.length;
}

/**
 * Add or update a user in the database
 */
export function upsertUser(user: UserProfile): UserProfile[] {
  const users = getStoredUsers();
  const normNick = (user.nickname || '').trim().toLowerCase().replace(/^@/, '');
  const normEmail = (user.studentEmail || '').trim().toLowerCase();

  const index = users.findIndex((u) => {
    if (u.id && user.id) return u.id === user.id;
    if (normNick && (u.nickname || '').trim().toLowerCase().replace(/^@/, '') === normNick) return true;
    if (normEmail && normEmail !== 'admin@fuhsi.edu.ng' && (u.studentEmail || '').trim().toLowerCase() === normEmail) return true;
    return false;
  });

  let updatedUser = sanitizeModulaProfile(user);
  if (index >= 0) {
    const existing = users[index];
    const existingPassword = (existing as any).savedPassword || (existing as any).password;
    const incomingPassword = (user as any).savedPassword || (user as any).password;
    const finalPassword = incomingPassword || existingPassword;
    users[index] = sanitizeModulaProfile({ 
      ...existing, 
      ...user,
      savedPassword: finalPassword,
      password: finalPassword,
    });
    updatedUser = users[index];
  } else {
    users.push(updatedUser);
  }

  // Save single user to Firestore immediately
  saveUserToFirestore(updatedUser).catch((err) => {
    console.error('Error saving single user to Firestore:', err);
  });

  saveStoredUsers(users);
  return users;
}

/**
 * Permanently update password for a specific user and sync to Firestore, server DB, and localStorage
 */
export function updateUserPassword(identifierOrEmail: string, newPassword: string): boolean {
  if (!identifierOrEmail || !newPassword) return false;
  const cleanId = identifierOrEmail.trim().toLowerCase().replace(/^@/, '');
  const users = getStoredUsers();

  const index = users.findIndex((u) => {
    if (u.id && u.id.toLowerCase() === cleanId) return true;
    if (u.nickname && u.nickname.trim().toLowerCase().replace(/^@/, '') === cleanId) return true;
    if (u.studentEmail && u.studentEmail.trim().toLowerCase() === cleanId) return true;
    return false;
  });

  if (index >= 0) {
    users[index] = {
      ...users[index],
      savedPassword: newPassword.trim(),
      password: newPassword.trim(),
    };

    saveUserToFirestore(users[index]).catch((err) => console.error('Error updating user password in Firestore:', err));
    saveStoredUsers(users);

    // Update active user profile in localStorage if matching
    try {
      const activeUserJson = localStorage.getItem('fuhsi_active_user');
      if (activeUserJson) {
        const active = JSON.parse(activeUserJson);
        const matchActive = (active.id === users[index].id) ||
          (active.nickname && active.nickname.toLowerCase().replace(/^@/, '') === cleanId) ||
          (active.studentEmail && active.studentEmail.toLowerCase() === cleanId);
        if (matchActive) {
          localStorage.setItem('fuhsi_active_user', JSON.stringify({
            ...active,
            savedPassword: newPassword.trim(),
            password: newPassword.trim(),
          }));
        }
      }
    } catch (e) {
      console.error('Error updating active user password:', e);
    }

    return true;
  }
  return false;
}
