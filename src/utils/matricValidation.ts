import { UserProfile } from '../types';
import { isUserPermanentlyDeleted } from './userDbUtils';

/**
 * Official FUHSI Departments & Academic Programmes with their official matriculation course abbreviations.
 */
export const FUHSI_DEPARTMENT_MAPPINGS: Record<string, { primary: string; aliases: string[] }> = {
  'Medicine and Surgery': {
    primary: 'MBS',
    aliases: ['MBS', 'MBBS', 'MED'],
  },
  'Nursing Science': {
    primary: 'NSC',
    aliases: ['NSC', 'NUR', 'NRS'],
  },
  'Medical Laboratory Science': {
    primary: 'MLS',
    aliases: ['MLS', 'MLT'],
  },
  'Doctor of Physiotherapy': {
    primary: 'DPT',
    aliases: ['DPT', 'PHY', 'PHT', 'PTH'],
  },
  'Audiology': {
    primary: 'AUD',
    aliases: ['AUD'],
  },
  'Pharmacology': {
    primary: 'PHM',
    aliases: ['PHM', 'PCO', 'PHA', 'PHAR'],
  },
  'Nutrition and Dietetics': {
    primary: 'NUT',
    aliases: ['NUT', 'HND', 'NUD', 'NAD', 'NTD'],
  },
  'Information Technology and Health Informatics': {
    primary: 'ITH',
    aliases: ['ITH', 'ICT', 'INF', 'ITHI', 'ITE'],
  },
  'Microbiology': {
    primary: 'MCB',
    aliases: ['MCB', 'MIC'],
  },
  'Biochemistry': {
    primary: 'BCH',
    aliases: ['BCH', 'BIO'],
  },
  'Biotechnology and Molecular Biology': {
    primary: 'BMB',
    aliases: ['BMB', 'BTC'],
  },
  'Environmental Health Science': {
    primary: 'EHS',
    aliases: ['EHS', 'ENV'],
  },
  'Prosthetics and Orthotics': {
    primary: 'PRT',
    aliases: ['PRT', 'PRO'],
  },
};

/**
 * Official Matriculation Year Prefix to Academic Level Mapping
 * New Mapping:
 * 25/ = 200L
 * 24/ = 300L
 * 23/ = 400L
 * 22/ = 500L
 * 
 * Note: 100L students have not been issued matriculation numbers yet.
 * Student registration is currently unavailable for 100L.
 */
export const MATRIC_YEAR_TO_LEVEL_MAP: Record<string, string> = {
  '25': '200L',
  '24': '300L',
  '23': '400L',
  '22': '500L',
};

export const LEVEL_TO_MATRIC_YEAR_MAP: Record<string, string> = {
  '200L': '25',
  '300L': '24',
  '400L': '23',
  '500L': '22',
};

/**
 * Normalizes a matriculation number for canonical comparison and database storage.
 * Strips whitespace, converts to uppercase, replaces hyphens/multiple slashes with '/',
 * and strips leading 'FUHSI/'.
 * Both '24/MLS/0042' and 'FUHSI/24/MLS/0042' normalize to the canonical format '24/MLS/0042'.
 */
export function normalizeMatricNumber(raw?: string): string {
  if (!raw) return '';
  let cleaned = String(raw).trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '/');
  cleaned = cleaned.replace(/^FUHSI\//, '');
  cleaned = cleaned.replace(/^20(\d{2}\/)/, '$1'); // Converts e.g. 2024/ to 24/
  cleaned = cleaned.replace(/\/+/g, '/');
  return cleaned;
}

/**
 * Returns the canonical display matriculation number (e.g. FUHSI/24/MLS/0042)
 */
export function formatDisplayMatricNumber(raw?: string): string {
  const norm = normalizeMatricNumber(raw);
  if (!norm) return '';
  return norm.startsWith('FUHSI/') ? norm : `FUHSI/${norm}`;
}

/**
 * Resolves the department configuration from a given department string (handling slight variations)
 */
export function getDepartmentMapping(department: string): { name: string; primary: string; aliases: string[] } | null {
  if (!department) return null;
  const target = department.trim().toLowerCase();

  for (const [deptName, config] of Object.entries(FUHSI_DEPARTMENT_MAPPINGS)) {
    if (deptName.toLowerCase() === target) {
      return { name: deptName, ...config };
    }
  }

  // Keyword fuzzy matching
  for (const [deptName, config] of Object.entries(FUHSI_DEPARTMENT_MAPPINGS)) {
    const dLower = deptName.toLowerCase();
    if (
      (target.includes('lab') && dLower.includes('laboratory')) ||
      (target.includes('physio') && dLower.includes('physiotherapy')) ||
      (target.includes('nurs') && dLower.includes('nursing')) ||
      (target.includes('med') && dLower.includes('medicine')) ||
      (target.includes('audio') && dLower.includes('audiology')) ||
      (target.includes('pharma') && dLower.includes('pharmacology')) ||
      (target.includes('nutri') && dLower.includes('nutrition')) ||
      (target.includes('diet') && dLower.includes('dietetics')) ||
      (target.includes('informatics') && dLower.includes('informatics')) ||
      (target.includes('micro') && dLower.includes('microbiology')) ||
      (target.includes('biochem') && dLower.includes('biochemistry')) ||
      (target.includes('biotech') && dLower.includes('biotechnology')) ||
      (target.includes('environ') && dLower.includes('environmental')) ||
      (target.includes('prosthetic') && dLower.includes('prosthetics'))
    ) {
      return { name: deptName, ...config };
    }
  }

  return null;
}

/**
 * Finds which department a course code belongs to
 */
export function findDepartmentByAbbreviation(code: string): string | null {
  if (!code) return null;
  const cUpper = code.trim().toUpperCase();
  for (const [deptName, config] of Object.entries(FUHSI_DEPARTMENT_MAPPINGS)) {
    if (config.aliases.includes(cUpper)) {
      return deptName;
    }
  }
  return null;
}

export interface MatricValidationResult {
  isValid: boolean;
  errorMessage?: string;
  yearPrefix?: string;
  expectedLevel?: string;
  extractedAbbr?: string;
  expectedAbbr?: string;
  normalizedMatric?: string;
  isDuplicate?: boolean;
  conflictUser?: UserProfile;
}

export function is100LevelBlocked(level?: string): boolean {
  if (!level) return false;
  const clean = level.trim().toUpperCase().replace(/\s*LEVEL$/i, 'L');
  return clean === '100L';
}

/**
 * Comprehensive Validation for FUHSI Matriculation Numbers:
 * 1. 100L students are not issued matriculation numbers yet, and cannot register as Student.
 * 2. Matric Year Prefix must match selected Academic Level (25/ = 200L, 24/ = 300L, 23/ = 400L, 22/ = 500L).
 * 3. Course Abbreviation must match the selected Department/Programme (e.g. MLS -> Medical Laboratory Science, MBS -> Medicine and Surgery, MCB -> Microbiology).
 * 4. Matric Year + Course Abbreviation + Selected Level + 3-digit serial number are validated together.
 */
export function validateMatricCredentials(
  matricRaw: string,
  department: string,
  level: string
): MatricValidationResult {
  const cleanSelectedLevel = (level || '').trim().toUpperCase().replace(/\s*LEVEL$/i, 'L');

  // 100 Level students have not been issued matric numbers yet
  if (cleanSelectedLevel === '100L') {
    return {
      isValid: false,
      errorMessage: '100l students have not been issued matric numbers yet. Student registration is currently unavailable for 100l You may create a Guest account instead.',
    };
  }

  if (!matricRaw || !matricRaw.trim()) {
    return {
      isValid: false,
      errorMessage: 'Matriculation number is required.',
    };
  }

  if (!department) {
    return {
      isValid: false,
      errorMessage: 'Please select your academic Department.',
    };
  }

  if (!level) {
    return {
      isValid: false,
      errorMessage: 'Please select your academic Level.',
    };
  }

  const norm = normalizeMatricNumber(matricRaw);
  const parts = norm.split('/');

  if (parts.length < 3) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      normalizedMatric: norm,
    };
  }

  const yearPrefix = parts[0];
  const extractedAbbr = parts[1].toUpperCase();
  const serialNumber = parts[2];

  // 1. Validate Year Prefix (must be 25 for 200L, 24 for 300L, 23 for 400L, 22 for 500L)
  const expectedLevel = MATRIC_YEAR_TO_LEVEL_MAP[yearPrefix];
  if (!expectedLevel) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      normalizedMatric: norm,
    };
  }

  // Enforce Year Prefix must match selected Level
  const cleanExpectedLevel = expectedLevel.trim().toUpperCase().replace(/\s*LEVEL$/i, 'L');
  if (cleanSelectedLevel !== cleanExpectedLevel) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      expectedLevel,
      normalizedMatric: norm,
    };
  }

  // 2. Validate Course Abbreviation
  if (!extractedAbbr || !/^[A-Z]{2,5}$/.test(extractedAbbr)) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      expectedLevel,
      extractedAbbr,
      normalizedMatric: norm,
    };
  }

  const deptMapping = getDepartmentMapping(department);
  if (!deptMapping) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      expectedLevel,
      normalizedMatric: norm,
    };
  }

  const isAbbrAllowed = deptMapping.aliases.includes(extractedAbbr);
  if (!isAbbrAllowed) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      expectedLevel,
      extractedAbbr,
      expectedAbbr: deptMapping.primary,
      normalizedMatric: norm,
    };
  }

  // 3. Validate Serial Number component
  if (!serialNumber || !/^\d{1,5}$/.test(serialNumber)) {
    return {
      isValid: false,
      errorMessage: 'Invalid matric number',
      yearPrefix,
      expectedLevel,
      extractedAbbr,
      normalizedMatric: norm,
    };
  }

  return {
    isValid: true,
    yearPrefix,
    expectedLevel,
    extractedAbbr,
    expectedAbbr: deptMapping.primary,
    normalizedMatric: norm,
  };
}

/**
 * Checks whether a matriculation number is already registered in the central database.
 * Strictly verifies against registered users and verification records, ignoring deleted accounts.
 */
export function checkMatricUniqueness(
  matricRaw: string,
  currentUserIdOrNickname?: string,
  additionalUsers?: UserProfile[]
): { isUnique: boolean; conflictUser?: UserProfile } {
  const norm = normalizeMatricNumber(matricRaw);
  if (!norm) return { isUnique: true };

  const cleanCurrent = (currentUserIdOrNickname || '').trim().toLowerCase().replace(/^@/, '');

  // 1. Check registered users in storage and passed user list
  let userList: UserProfile[] = [];
  try {
    const stored = localStorage.getItem('fuhsi_users_db');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) userList = parsed;
    }
  } catch (e) {
    console.error('Error reading users db in checkMatricUniqueness:', e);
  }

  if (additionalUsers && Array.isArray(additionalUsers)) {
    userList = [...userList, ...additionalUsers];
  }

  for (const u of userList) {
    if (!u || !u.matricNumber) continue;
    if (isUserPermanentlyDeleted(u)) continue;

    const uNick = (u.nickname || '').trim().toLowerCase().replace(/^@/, '');
    const uId = (u.id || '').trim();

    // Skip the current user if they are checking their own existing account
    if (cleanCurrent && (uNick === cleanCurrent || uId === cleanCurrent)) {
      continue;
    }

    const uMatricNorm = normalizeMatricNumber(u.matricNumber);
    if (uMatricNorm && uMatricNorm === norm) {
      return { isUnique: false, conflictUser: u };
    }
  }

  // 2. Check pending / approved verification records
  try {
    const vStored = localStorage.getItem('fuhsi_verifications_db');
    if (vStored) {
      const vList: any[] = JSON.parse(vStored);
      if (Array.isArray(vList)) {
        for (const req of vList) {
          if (!req || !req.matricNumber) continue;
          if (req.status === 'REJECTED') continue;

          const applicantNick = (req.applicantNickname || '').trim().toLowerCase().replace(/^@/, '');
          if (cleanCurrent && applicantNick === cleanCurrent) continue;

          const reqMatricNorm = normalizeMatricNumber(req.matricNumber);
          if (reqMatricNorm && reqMatricNorm === norm) {
            return {
              isUnique: false,
              conflictUser: {
                id: req.id,
                nickname: req.applicantNickname,
                realName: req.applicantFullName || req.applicantNickname,
                accountType: 'Student',
                matricNumber: req.matricNumber,
              } as UserProfile,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error('Error checking verifications db in checkMatricUniqueness:', e);
  }

  return { isUnique: true };
}
