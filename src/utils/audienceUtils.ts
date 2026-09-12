export interface FacultyInfo {
  name: string;
  codes: string[];
  keywords: string[];
}

export const FACULTIES_MAP: Record<string, FacultyInfo> = {
  'Faculty of Allied Health Sciences': {
    name: 'Faculty of Allied Health Sciences',
    codes: ['NSC', 'MLS', 'DPT', 'AUD', 'EHS', 'ITH', 'HND', 'PRT'],
    keywords: [
      'nursing',
      'medical laboratory',
      'physiotherapy',
      'audiology',
      'environmental health',
      'information technology',
      'health informatics',
      'nutrition',
      'dietetics',
      'prosthetics',
      'orthotics',
    ],
  },
  'Faculty of Basic Medical Sciences': {
    name: 'Faculty of Basic Medical Sciences',
    codes: ['MBBS', 'PHM'],
    keywords: ['medicine', 'surgery', 'pharmacology'],
  },
  'Faculty of Science': {
    name: 'Faculty of Science',
    codes: ['BCH', 'MCB', 'BMB'],
    keywords: ['biochemistry', 'microbiology', 'biotechnology', 'molecular biology'],
  },
};

/**
 * Checks if a user's registered department belongs to the targeted audience (department or faculty).
 */
export function isUserMatchingAudience(userDepartment: string = '', targetAudience: string = ''): boolean {
  if (!targetAudience || targetAudience === 'General Campus' || targetAudience === 'General') {
    return false; // General posts do not send targeted alerts
  }

  const normUserDept = userDepartment.toLowerCase().trim();
  const normTarget = targetAudience.toLowerCase().trim();

  // 1. Direct equality or substring check (e.g. target "NSC", userDept "Nursing Science (NSC)")
  if (normUserDept.includes(normTarget) || normTarget.includes(normUserDept)) {
    return true;
  }

  // 2. Check if target is a Faculty
  for (const facultyKey of Object.keys(FACULTIES_MAP)) {
    if (facultyKey.toLowerCase().includes(normTarget) || normTarget.includes(facultyKey.toLowerCase())) {
      const faculty = FACULTIES_MAP[facultyKey];
      // Check codes
      for (const code of faculty.codes) {
        if (normUserDept.includes(code.toLowerCase())) return true;
      }
      // Check keywords
      for (const kw of faculty.keywords) {
        if (normUserDept.includes(kw.toLowerCase())) return true;
      }
    }
  }

  // 3. Extract 3-4 letter uppercase codes like MBBS, NSC, MLS, DPT, AUD, PHM, HND, ITH, MCB, BCH, BMB, EHS, PRT
  const targetCodes = targetAudience.match(/\b(MBBS|NSC|MLS|DPT|AUD|PHM|HND|ITH|MCB|BCH|BMB|EHS|PRT)\b/i);
  if (targetCodes) {
    const code = targetCodes[0].toLowerCase();
    if (normUserDept.includes(code)) return true;
  }

  return false;
}

/**
 * Returns whether a target audience string represents a Faculty (vs a specific Department).
 */
export function isFacultyTarget(targetAudience: string = ''): boolean {
  const normTarget = targetAudience.toLowerCase();
  return normTarget.includes('faculty');
}
