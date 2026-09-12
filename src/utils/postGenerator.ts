import { Post, UserProfile, Comment, VerificationRequest, MarketplaceItem, DirectMessage } from '../types';

export const DEMO_NICKNAMES = new Set([
  // Explicitly requested demo accounts to permanently remove
  'ayo',
  'ekuru',
  'ila_campus_prints',
  'ila_campus_print',
  'ilacampusprints',
  'labpro_mls',
  'labpromls',
  'nursequeen_ila',
  'nursequeenila',
  'medicstudent_2024',
  'medicstudent2024',
  'fuhsi_sug_official',
  'fuhsisug_official',
  'fuhsisugofficial',
  'yi',
  'y_i',

  // Prior demo seeds & placeholder handles (excluding real student Deji)
  'samuel obafemi',
  'samuel_obafemi',
  'dr_chidi',
  'tech_senior',
  'nurse_folake',
  'scamtrap_007',
  'anonharasser',
  'peerguardian',
  'hostelrep',
  'mediccadet_ila',
  'nursetutor_faith',
  'biochementhusiast',
  'mls_lablead',
  'sug_welfareexec',
  'physiogenius',
  'pharmd_scholar',
  'anatomypro_ila',
  'publichealth_hero',
  'medicpioneer_24',
  'nursechisom',
  'dribrahim',
  'tunde',
  'medscholar',
  'nurseprecious',
  'anatomywizard',
  'pharmacadet',
  'statmaster_fuhsi',
  'fuhsileader',
  'nurse_grace',
  'pathology_guru',
  'gadget_plug_campus',
  'medstudent_2026',
  'doctor_in_making',
  'nursing_student_a',
  'freshman_fuhsi',
  'labpro_ila',
  'campusscout',
  'healthtechlead',
]);

export function isDemoNickname(nick?: string | null): boolean {
  if (!nick) return false;
  const raw = String(nick).trim().toLowerCase();
  const clean = raw.replace(/^@+/, '').replace(/\s+/g, '_');
  const cleanNoUnderscore = clean.replace(/_/g, '');

  // Real student whitelist - NEVER treat Deji or admin as demo
  if (
    clean === 'deji' ||
    clean === 'adedeji' ||
    clean.startsWith('deji') ||
    clean === 'modula' ||
    clean === 'fatih'
  ) {
    return false;
  }

  // Ghost handle - strictly removed
  if (clean === 'yi' || cleanNoUnderscore === 'yi' || clean === 'y_i') {
    return true;
  }

  if (DEMO_NICKNAMES.has(clean) || DEMO_NICKNAMES.has(cleanNoUnderscore) || DEMO_NICKNAMES.has(raw)) {
    return true;
  }

  // Check specific prefixes and patterns
  if (
    clean.startsWith('demo_') ||
    clean.startsWith('sample_') ||
    clean.startsWith('mock_') ||
    clean === 'ayo' ||
    clean === 'ekuru' ||
    clean.includes('ila_campus_print') ||
    clean.includes('labpro_mls') ||
    clean.includes('nursequeen_ila') ||
    clean.includes('medicstudent_2024') ||
    clean.includes('fuhsi_sug_official')
  ) {
    return true;
  }

  return false;
}

export function isDemoUser(u: Partial<UserProfile> | null | undefined): boolean {
  if (!u) return false;
  if (u.isAdmin || u.nickname === '@modula' || u.id === 'usr_admin_modula') return false;

  const emailLower = (u.studentEmail || '').toLowerCase();
  const matricUpper = (u.matricNumber || '').toUpperCase();
  const realNameLower = (u.realName || '').toLowerCase();
  const deptLower = (u.department || '').toLowerCase();

  // REAL Main Account Whitelist: Adedeji Ayo (24/PRT/007, Prosthetics and Orthotics, faithlucas.co@gmail.com)
  if (
    emailLower === 'faithlucas.co@gmail.com' ||
    matricUpper === '24/PRT/007' ||
    u.id === 'usr_student_adedeji_ayo_24prt007' ||
    (realNameLower.includes('adedeji') && deptLower.includes('prosthetics'))
  ) {
    return false;
  }

  // Explicitly purge the fake/demo Medicine & Surgery Deji account
  if (
    u.id === 'usr_student_deji' ||
    emailLower === 'deji@fuhsi.edu.ng' ||
    matricUpper === 'FUHSI/MED/2023/048' ||
    (realNameLower === 'deji' && deptLower.includes('medicine'))
  ) {
    return true;
  }

  const cleanNick = (u.nickname || '').trim().toLowerCase().replace(/^@+/, '');
  // Real user Deji whitelist
  if (cleanNick === 'deji' || cleanNick === 'adedeji') {
    return false;
  }

  // Ghost user @Yi
  if (cleanNick === 'yi' || cleanNick === 'y_i') {
    return true;
  }

  if (isDemoNickname(u.nickname) || isDemoNickname(u.realName)) return true;

  if (u.studentEmail) {
    if (
      emailLower.includes('ekuru') ||
      emailLower.includes('ilacampusprints') ||
      emailLower.includes('labpro') ||
      emailLower.includes('nursequeen') ||
      emailLower.includes('medicstudent') ||
      emailLower.includes('fuhsisug') ||
      emailLower.includes('demo') ||
      emailLower.includes('example.com')
    ) {
      return true;
    }
  }

  if (u.id && (u.id.startsWith('demo_') || u.id.startsWith('sample_') || u.id.startsWith('mock_') || u.id.startsWith('user_001') || u.id.startsWith('post_author_'))) {
    return true;
  }

  return false;
}

export function isDemoPost(p: Partial<Post> | null | undefined): boolean {
  if (!p) return false;
  if (isDemoNickname(p.authorNickname || p.nickname || p.customNickname)) return true;
  if (p.id && (p.id.startsWith('sample_') || p.id.startsWith('demo_') || p.id.startsWith('mock_') || p.id.startsWith('post_seed_') || p.id.startsWith('gen_'))) return true;
  return false;
}

export function isDemoComment(c: Partial<Comment> | null | undefined): boolean {
  if (!c) return false;
  if (isDemoNickname(c.authorNickname || (c as any).nickname)) return true;
  if (c.replyToNickname && isDemoNickname(c.replyToNickname)) return true;
  return false;
}

export function isDemoVerificationRequest(v: Partial<VerificationRequest> | null | undefined): boolean {
  if (!v) return false;
  if (isDemoNickname(v.applicantNickname)) return true;
  return false;
}

export function isDemoMarketplaceItem(m: Partial<MarketplaceItem> | null | undefined): boolean {
  if (!m) return false;
  if (isDemoNickname(m.sellerNickname)) return true;
  return false;
}

export function isDemoDirectMessage(d: Partial<DirectMessage> | null | undefined): boolean {
  if (!d) return false;
  if (isDemoNickname(d.senderNickname) || isDemoNickname(d.receiverNickname)) return true;
  return false;
}

export const generateMorePosts = (_count: number = 5, _startOffset: number = 0): Post[] => {
  return [];
};


