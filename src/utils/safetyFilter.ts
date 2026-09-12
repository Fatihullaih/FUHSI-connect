/**
 * FUHSI Connect Safety & Privacy Guard Engine
 *
 * Automatic monitoring for:
 * 1. Phone numbers, emails, social handles, external direct contact info (Preventing external PII exchange).
 * 2. Bullying, verbal harassment, sexual harassment, threats, and hate speech.
 * 3. Automatic warnings, blocking, strike logging, and temporary chat restrictions.
 */

import { pushServerDbSync } from './apiSync';

export interface ChatViolationRecord {
  id: string;
  userNickname: string;
  violationType: 'CONTACT_INFO' | 'HARASSMENT' | 'SEXUAL_HARASSMENT' | 'THREAT' | 'HATE_SPEECH';
  reason: string;
  messageSnippet: string;
  timestamp: string;
  severity: 'WARNING' | 'STRIKE' | 'RESTRICTION';
}

export interface ChatRestrictionInfo {
  userNickname: string;
  isRestricted: boolean;
  reason: string;
  restrictedAt: string;
  restrictedUntil: string;
  durationDays: number;
}

export interface ModerationEvaluationResult {
  isAllowed: boolean;
  sanitizedText: string;
  violationType?: 'CONTACT_INFO' | 'HARASSMENT' | 'SEXUAL_HARASSMENT' | 'THREAT' | 'HATE_SPEECH';
  reason?: string;
  warningMessage?: string;
  actionTaken: 'PASSED' | 'REPLACED_CONTACT_INFO' | 'BLOCKED_HARASSMENT' | 'USER_RESTRICTED';
}

const CHAT_RESTRICTIONS_STORAGE_KEY = 'fuhsi_chat_restrictions_db';
const CHAT_VIOLATIONS_STORAGE_KEY = 'fuhsi_chat_violations_db';

/**
 * Word-to-digit conversion map for checking spelled-out evasion attempts
 */
const WORD_DIGITS: Record<string, string> = {
  zero: '0', oh: '0', o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};

/**
 * Check if text contains phone numbers or direct contact exchange attempts
 */
export function detectContactInformation(text: string): { containsContactInfo: boolean; detectedReason?: string } {
  if (!text) return { containsContactInfo: false };

  const rawLower = text.toLowerCase();

  // 1. Standard & spaced Nigerian phone numbers: 080, 081, 070, 090, 091, +234
  // Matches: 08012345678, 080 1234 5678, 080-1234-5678, +234 801 234 5678, 0 8 0 1 2 3 4 5 6 7 8
  const nigerianPhonePattern = /(?:(?:\+?234|0)[\s\-._/]*[789][\s\-._/]*[01](?:[\s\-._/]*\d){8})/gi;
  if (nigerianPhonePattern.test(text)) {
    return { containsContactInfo: true, detectedReason: 'Nigerian phone number detected' };
  }

  // 2. Generic international or 10-13 digit phone numbers
  const genericPhonePattern = /\b(?:\+?\d{1,3}[\s\-._/]*)?(?:\(?\d{2,4}\)?[\s\-._/]*)?\d{3,4}[\s\-._/]*\d{3,4}\b/gi;
  const genericMatches = text.match(genericPhonePattern);
  if (genericMatches) {
    for (const match of genericMatches) {
      const digitsOnly = match.replace(/\D/g, '');
      // If it has 10 to 14 consecutive/formatted digits, it's a contact phone number
      if (digitsOnly.length >= 10 && digitsOnly.length <= 14) {
        return { containsContactInfo: true, detectedReason: 'Direct phone number detected' };
      }
    }
  }

  // 3. Spelled out numbers evasion: "zero eight zero three...", "oh eight one..."
  const words = rawLower.split(/[\s\-.,/]+/);
  let consecutiveDigits = '';
  for (const w of words) {
    if (WORD_DIGITS[w]) {
      consecutiveDigits += WORD_DIGITS[w];
    } else if (/^\d+$/.test(w)) {
      consecutiveDigits += w;
    } else {
      if (consecutiveDigits.length >= 8 && (consecutiveDigits.startsWith('0') || consecutiveDigits.startsWith('234'))) {
        return { containsContactInfo: true, detectedReason: 'Spelled-out phone number detected' };
      }
      consecutiveDigits = '';
    }
  }
  if (consecutiveDigits.length >= 8 && (consecutiveDigits.startsWith('0') || consecutiveDigits.startsWith('234'))) {
    return { containsContactInfo: true, detectedReason: 'Spelled-out phone number detected' };
  }

  // 4. Standard and obfuscated email addresses: test@gmail.com, test [at] domain [dot] com
  const standardEmailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
  if (standardEmailPattern.test(text)) {
    return { containsContactInfo: true, detectedReason: 'Email address detected' };
  }

  const obfuscatedEmailPattern = /[A-Za-z0-9._%+-]+\s*(?:\[at\]|\(at\)|\bat\b|@)\s*[A-Za-z0-9.-]+\s*(?:\[dot\]|\(dot\)|\bdot\b|\.)\s*(?:com|org|net|edu|ng|io|co)\b/gi;
  if (obfuscatedEmailPattern.test(rawLower)) {
    return { containsContactInfo: true, detectedReason: 'Obfuscated email address detected' };
  }

  // 5. Direct WhatsApp / Telegram / Social links or handles
  const messagingLinkPattern = /(?:https?:\/\/)?(?:www\.)?(?:wa\.me|t\.me|telegram\.me|instagram\.com|ig\.me|twitter\.com|x\.com|facebook\.com|fb\.me|snapchat\.com)\/[a-zA-Z0-9_.+]+/gi;
  if (messagingLinkPattern.test(text)) {
    return { containsContactInfo: true, detectedReason: 'Direct messaging link detected' };
  }

  // 6. "call me on", "reach me on", "whatsapp me at" phrases followed by digits
  const phrasePattern = /(?:call|text|whatsapp|dm|reach|ring|msg)\s*(?:me|us)?\s*(?:on|at|via|with|number)?\s*[:\-\s]*([0-9\s\-+().]{6,})/gi;
  if (phrasePattern.test(rawLower)) {
    return { containsContactInfo: true, detectedReason: 'Contact solicitation phrase detected' };
  }

  return { containsContactInfo: false };
}

/**
 * Check for harassment, abusive behavior, threats, hate speech, or sexual harassment
 */
export function detectHarassmentAndAbuse(text: string): { 
  hasViolation: boolean; 
  violationType?: 'HARASSMENT' | 'SEXUAL_HARASSMENT' | 'THREAT' | 'HATE_SPEECH';
  reason?: string;
} {
  if (!text) return { hasViolation: false };
  const lower = text.toLowerCase();

  // 1. Severe Threats of Violence & Harm
  const threatPatterns = [
    /\b(?:i will|i'll|im gonna|i am going to|i'm going to)\s+(?:kill|murder|shoot|stab|beat|slap|destroy|attack|hurt|strangle|injure|hunt)\s+(?:you|your)/i,
    /\b(?:i know where you live|watch your back|you will regret this|prepare to die|you are dead|you're dead)\b/i,
    /\b(?:i will deal with you|i will expose you|i will leak your)\b/i,
  ];

  for (const pattern of threatPatterns) {
    if (pattern.test(lower)) {
      return {
        hasViolation: true,
        violationType: 'THREAT',
        reason: 'Direct threat of physical harm, violence, or intimidation',
      };
    }
  }

  // 2. Sexual Harassment & Inappropriate Explicit Solicitation
  const sexualHarassmentPatterns = [
    /\b(?:send(?: me)? (?:nudes|nude|naked pics|boobs|dick|pussy|sex video))\b/i,
    /\b(?:let'?s have sex|sleep with me|fuck me|touch my|suck my)\b/i,
    /\b(?:sexual favors?|naked photo|strip for me|send your body)\b/i,
    /\b(?:show me your (?:body|chest|breasts|panties))\b/i,
  ];

  for (const pattern of sexualHarassmentPatterns) {
    if (pattern.test(lower)) {
      return {
        hasViolation: true,
        violationType: 'SEXUAL_HARASSMENT',
        reason: 'Unsolicited sexual harassment, explicit solicitation, or inappropriate sexual advances',
      };
    }
  }

  // 3. Bullying & Abusive Language / Slurs
  const abusivePatterns = [
    /\b(?:you are (?:ugly|stupid|an idiot|worthless|retarded|a bastard|a fool|a bitch|a slut|a whore|scum|garbage|a loser))\b/i,
    /\b(?:kill yourself|go and die|nobody likes you|fucking idiot|shut the fuck up bitch)\b/i,
    /\b(?:bastard|asshole|bitch|whore|slut|motherfucker|dumbass)\b/i,
  ];

  for (const pattern of abusivePatterns) {
    if (pattern.test(lower)) {
      return {
        hasViolation: true,
        violationType: 'HARASSMENT',
        reason: 'Bullying, abusive language, or demeaning personal insults',
      };
    }
  }

  // 4. Hate Speech & Discriminatory Attacks
  const hatePatterns = [
    /\b(?:all (?:igbo|yoruba|hausa|fulani|christians|muslims) are (?:evil|criminals|dirty|termites|scum))\b/i,
  ];

  for (const pattern of hatePatterns) {
    if (pattern.test(lower)) {
      return {
        hasViolation: true,
        violationType: 'HATE_SPEECH',
        reason: 'Hate speech or discriminatory attacks against protected groups',
      };
    }
  }

  return { hasViolation: false };
}

/**
 * Check if a user currently has an active chat restriction
 */
export function checkUserChatRestriction(nickname: string): ChatRestrictionInfo {
  if (!nickname) {
    return {
      userNickname: '',
      isRestricted: false,
      reason: '',
      restrictedAt: '',
      restrictedUntil: '',
      durationDays: 0,
    };
  }

  const cleanNick = nickname.trim().toLowerCase().replace(/^@/, '');

  try {
    const raw = localStorage.getItem(CHAT_RESTRICTIONS_STORAGE_KEY);
    if (raw) {
      const list: ChatRestrictionInfo[] = JSON.parse(raw);
      const match = list.find((r) => r.userNickname.trim().toLowerCase().replace(/^@/, '') === cleanNick);
      if (match && match.isRestricted) {
        const until = new Date(match.restrictedUntil).getTime();
        const now = Date.now();
        if (until > now) {
          return match;
        } else {
          // Restriction expired, automatically clear
          clearChatRestriction(cleanNick);
        }
      }
    }
  } catch (e) {
    console.error('Error checking chat restriction:', e);
  }

  return {
    userNickname: cleanNick,
    isRestricted: false,
    reason: '',
    restrictedAt: '',
    restrictedUntil: '',
    durationDays: 0,
  };
}

/**
 * Record a violation against a user and apply restrictions if threshold is reached
 */
export function recordChatViolation(
  userNickname: string,
  violation: {
    violationType: 'CONTACT_INFO' | 'HARASSMENT' | 'SEXUAL_HARASSMENT' | 'THREAT' | 'HATE_SPEECH';
    reason: string;
    messageSnippet: string;
  }
): {
  strikesCount: number;
  isNowRestricted: boolean;
  restriction?: ChatRestrictionInfo;
} {
  const cleanNick = userNickname.trim().toLowerCase().replace(/^@/, '');
  const now = new Date();

  let violations: ChatViolationRecord[] = [];
  try {
    const raw = localStorage.getItem(CHAT_VIOLATIONS_STORAGE_KEY);
    if (raw) violations = JSON.parse(raw);
  } catch (e) {}

  const newRecord: ChatViolationRecord = {
    id: `viol_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    userNickname: cleanNick,
    violationType: violation.violationType,
    reason: violation.reason,
    messageSnippet: violation.messageSnippet.substring(0, 100),
    timestamp: now.toISOString(),
    severity: violation.violationType === 'THREAT' || violation.violationType === 'SEXUAL_HARASSMENT' ? 'RESTRICTION' : 'STRIKE',
  };

  violations.push(newRecord);
  try {
    localStorage.setItem(CHAT_VIOLATIONS_STORAGE_KEY, JSON.stringify(violations));
  } catch (e) {}

  // Calculate recent strikes for this user (last 7 days)
  const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const recentUserViolations = violations.filter(
    (v) => v.userNickname === cleanNick && new Date(v.timestamp).getTime() > oneWeekAgo
  );

  const strikesCount = recentUserViolations.length;
  let isNowRestricted = false;
  let durationDays = 2;

  // Immediate restriction for severe threats or sexual harassment, or repeated 2+ violations
  if (
    violation.violationType === 'THREAT' ||
    violation.violationType === 'SEXUAL_HARASSMENT' ||
    strikesCount >= 2
  ) {
    isNowRestricted = true;
    durationDays = strikesCount >= 4 ? 7 : 2;

    const restrictedUntil = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString();
    const restrictionInfo: ChatRestrictionInfo = {
      userNickname: cleanNick,
      isRestricted: true,
      reason: violation.reason,
      restrictedAt: now.toISOString(),
      restrictedUntil,
      durationDays,
    };

    applyChatRestriction(restrictionInfo);

    return {
      strikesCount,
      isNowRestricted: true,
      restriction: restrictionInfo,
    };
  }

  return {
    strikesCount,
    isNowRestricted: false,
  };
}

/**
 * Apply a chat restriction
 */
export function applyChatRestriction(info: ChatRestrictionInfo) {
  try {
    let list: ChatRestrictionInfo[] = [];
    const raw = localStorage.getItem(CHAT_RESTRICTIONS_STORAGE_KEY);
    if (raw) list = JSON.parse(raw);

    const cleanNick = info.userNickname.trim().toLowerCase().replace(/^@/, '');
    list = list.filter((r) => r.userNickname.trim().toLowerCase().replace(/^@/, '') !== cleanNick);
    list.push(info);

    localStorage.setItem(CHAT_RESTRICTIONS_STORAGE_KEY, JSON.stringify(list));

    // Push to server DB
    pushServerDbSync({ chatRestrictions: list } as any).catch(console.error);

    // Dispatch event
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_chat_restriction_updated', { detail: info }));
    }
  } catch (e) {
    console.error('Error applying chat restriction:', e);
  }
}

/**
 * Clear a chat restriction (e.g. by admin)
 */
export function clearChatRestriction(userNickname: string) {
  try {
    const cleanNick = userNickname.trim().toLowerCase().replace(/^@/, '');
    let list: ChatRestrictionInfo[] = [];
    const raw = localStorage.getItem(CHAT_RESTRICTIONS_STORAGE_KEY);
    if (raw) list = JSON.parse(raw);

    list = list.filter((r) => r.userNickname.trim().toLowerCase().replace(/^@/, '') !== cleanNick);
    localStorage.setItem(CHAT_RESTRICTIONS_STORAGE_KEY, JSON.stringify(list));

    pushServerDbSync({ chatRestrictions: list } as any).catch(console.error);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fuhsi_chat_restriction_updated', { detail: { userNickname: cleanNick, isRestricted: false } }));
    }
  } catch (e) {
    console.error('Error clearing chat restriction:', e);
  }
}

/**
 * Comprehensive Message Safety Evaluator
 * Allows normal communication, links, phone numbers, and peer-to-peer discussions.
 */
export function evaluateChatMessage(
  rawText: string,
  _senderNickname: string
): ModerationEvaluationResult {
  return {
    isAllowed: true,
    sanitizedText: rawText,
    actionTaken: 'PASSED',
  };
}

/**
 * Format remaining time for a restriction
 */
export function formatRestrictionRemainingTime(restrictedUntil: string): string {
  if (!restrictedUntil) return '2 days';
  const target = new Date(restrictedUntil).getTime();
  const diffMs = target - Date.now();
  if (diffMs <= 0) return 'Expired';

  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  if (diffHours > 24) {
    const days = Math.ceil(diffHours / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
}
