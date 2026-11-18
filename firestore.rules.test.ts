/**
 * Phase 0 TDD Specification Tests ("Dirty Dozen" Payloads)
 * Verifies every malicious write/read attempt maps to PERMISSION_DENIED under firestore.rules.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Global Read on Admin Profile',
    operation: 'get',
    path: '/users/usr_admin_modula',
    auth: null,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Registration Admin & Verification Escalation',
    operation: 'create',
    path: '/users/student_attacker',
    auth: { uid: 'student_uid', email: 'attacker@fuhsi.edu.ng', email_verified: true },
    payload: {
      id: 'student_attacker',
      ownerUid: 'student_uid',
      nickname: '@attacker',
      isAdmin: true,
      isApproved: true,
      isVerified: true,
      badgeType: 'BLUE',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Plaintext Password / Shadow Field Injection',
    operation: 'create',
    path: '/users/student_attacker',
    auth: { uid: 'student_uid', email: 'attacker@fuhsi.edu.ng', email_verified: true },
    payload: {
      id: 'student_attacker',
      ownerUid: 'student_uid',
      nickname: '@attacker',
      isAdmin: false,
      isApproved: false,
      isVerified: false,
      badgeType: 'NONE',
      savedPassword: 'exposed_password',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Student Profile Update-Gap Privilege Escalation',
    operation: 'update',
    path: '/users/student_uid',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      isAdmin: true,
      badgeType: 'GREEN',
      badgeTitle: 'Fake Admin',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-Student PII Snooping',
    operation: 'get',
    path: '/users/victim_uid',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Unverified Email Spoofing Admin Bypass',
    operation: 'get',
    path: '/admins/usr_admin_modula',
    auth: { uid: 'spoof_uid', email: 'adepojufatih33@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Post Authorship Spoofing as Another UID',
    operation: 'create',
    path: '/posts/post_fake_1',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      id: 'post_fake_1',
      ownerUid: 'usr_admin_modula',
      authorId: 'usr_admin_modula',
      authorNickname: '@modula',
      content: 'Fraudulent official notice',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Seller Self-Approving Marketplace Pending Item',
    operation: 'update',
    path: '/marketplace_pending/item_1',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      status: 'APPROVED',
      approvedPrice: 1,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Third-Party Snooping Direct Messages Collection',
    operation: 'list',
    path: '/direct_messages',
    auth: { uid: 'third_party_uid', email: 'snooper@fuhsi.edu.ng', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Student Modifying Verification Subscription Fee Settings',
    operation: 'update',
    path: '/settings/verification_settings',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      verificationFee: 0,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid Document ID Poisoning Attack',
    operation: 'create',
    path: '/posts/invalid$id with spaces',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      id: 'invalid$id with spaces',
      ownerUid: 'student_uid',
      authorNickname: '@student',
      content: 'Poisoned doc ID',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Student Reopening Terminal Declined Verification Request',
    operation: 'update',
    path: '/verification_requests/req_1',
    auth: { uid: 'student_uid', email: 'student@fuhsi.edu.ng', email_verified: true },
    payload: {
      status: 'APPROVED',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
