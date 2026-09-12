import { UserProfile, Post, Notice, Resource, CampusEvent, ModerationReport, DepartmentRanking, Comment } from './types';

export const INITIAL_USER: UserProfile = {
  id: 'usr_admin_modula',
  nickname: '@modula',
  accountType: 'Admin',
  realName: 'Administrator',
  studentId: '',
  matricNumber: '',
  department: '',
  level: '',
  bio: 'Platform Administrator (@modula).',
  avatarId: 'caduceus',
  avatarKey: '1',
  reputationPoints: 9999,
  badge: 'Official Admin',
  badgeType: 'GOLD',
  badgeTitle: 'Official Admin',
  strikes: 0,
  isBanned: false,
  privacyMode: 'Nickname',
  isAdmin: true,
  isVerified: true,
  isApproved: true,
};

export const INITIAL_POSTS: Post[] = [];

export const INITIAL_COMMENTS: Record<string, Comment[]> = {};

export const INITIAL_NOTICES: Notice[] = [
  {
    id: 'not_1',
    title: 'First Semester Examination Schedule & Hall Allocations',
    content: 'The Management has published the draft examination timetable for 100L-400L students. Students are urged to cross-check course codes and report any conflicts to the Dean of Student Affairs by Friday.',
    category: 'Exam',
    publisher: 'Office of the Academic Registrar',
    date: 'July 28, 2026',
    urgent: true,
    read: false
  },
  {
    id: 'not_2',
    title: 'Mandatory Clinical Orientation for 300L Nursing & Medical Students',
    content: 'All 300L students proceeding for teaching hospital ward rotations must report at the Multipurpose Auditorium at 9:00 AM on Monday for mandatory infection control and lab safety briefing.',
    category: 'Academic',
    publisher: 'Faculty of Clinical Sciences',
    date: 'July 26, 2026',
    urgent: true,
    read: false
  },
  {
    id: 'not_3',
    title: 'Hostel Maintenance & Water Supply Upgrade Schedule',
    content: 'Routine maintenance of water treatment units at Male and Female Hall B will take place this Saturday between 7 AM and 12 PM. Water reservoirs will be pre-filled prior.',
    category: 'Hostel',
    publisher: 'Student Housing & Welfare',
    date: 'July 24, 2026',
    urgent: false,
    read: true
  }
];

export const INITIAL_RESOURCES: Resource[] = [
  {
    id: 'res_1',
    title: 'Neuroanatomy High-Yield Revision Summary & Mindmaps',
    courseCode: 'ANA 301',
    department: 'Medicine & Surgery',
    level: '300 Level',
    fileType: 'PDF',
    fileSize: '4.8 MB',
    uploaderNickname: 'Academic Desk',
    downloads: 342,
    rating: 4.9,
    dateAdded: 'July 25, 2026'
  },
  {
    id: 'res_2',
    title: 'Pharmacology Drug Classifications & Mechanisms Matrix',
    courseCode: 'PHA 302',
    department: 'Nursing Science',
    level: '300 Level',
    fileType: 'PDF',
    fileSize: '2.1 MB',
    uploaderNickname: 'Academic Desk',
    downloads: 215,
    rating: 4.8,
    dateAdded: 'July 22, 2026'
  },
  {
    id: 'res_3',
    title: 'Biostatistics Past Questions & Solved Worked Examples (2020-2025)',
    courseCode: 'STA 201',
    department: 'Public Health',
    level: '200 Level',
    fileType: 'DOCX',
    fileSize: '1.5 MB',
    uploaderNickname: 'Academic Desk',
    downloads: 512,
    rating: 5.0,
    dateAdded: 'July 20, 2026'
  },
  {
    id: 'res_4',
    title: 'Hematology Lab Practical Manual & Slide Diagnostics',
    courseCode: 'MLS 305',
    department: 'Medical Lab Science',
    level: '300 Level',
    fileType: 'PPTX',
    fileSize: '12.4 MB',
    uploaderNickname: 'Academic Desk',
    downloads: 189,
    rating: 4.7,
    dateAdded: 'July 18, 2026'
  }
];

export const INITIAL_EVENTS: CampusEvent[] = [
  {
    id: 'evt_1',
    title: 'FUHSI MedTech & Digital Health Innovation Summit 2026',
    location: 'Main University Auditorium',
    date: 'August 12, 2026',
    time: '10:00 AM - 3:30 PM',
    category: 'Seminar',
    organizer: 'FUHSI Innovation & Health Tech Society',
    description: 'Keynote speeches from leading Nigerian healthtech founders, student project demonstrations, and panel on AI in diagnostics.',
    rsvpCount: 142,
    isRsvped: true
  },
  {
    id: 'evt_2',
    title: 'Inter-Departmental Medical Football Tournament: Finals',
    location: 'FUHSI Sports Complex Pitch',
    date: 'August 08, 2026',
    time: '4:00 PM',
    category: 'Sports',
    organizer: 'Sports Directorate & SUG',
    description: 'Medicine & Surgery vs. Nursing Science in the grand finale of the Vice Chancellor Cup!',
    rsvpCount: 290,
    isRsvped: false
  },
  {
    id: 'evt_3',
    title: 'Free Community Health Outreach & Blood Pressure Drive',
    location: 'Ila-Orangun Central Market Square',
    date: 'August 15, 2026',
    time: '8:30 AM - 2:00 PM',
    category: 'Health',
    organizer: 'Public Health Association & Medical Students Org',
    description: 'Student-led community health awareness, screening, and health education under clinical supervisor guidance.',
    rsvpCount: 98,
    isRsvped: false
  }
];

export const INITIAL_MODERATION_REPORTS: ModerationReport[] = [];

export const DEPARTMENT_RANKINGS: DepartmentRanking[] = [
  {
    name: 'Medicine & Surgery',
    code: 'MED',
    totalPoints: 14250,
    activeStudents: 420,
    topContributor: '-'
  },
  {
    name: 'Nursing Science',
    code: 'NUR',
    totalPoints: 11800,
    activeStudents: 380,
    topContributor: '-'
  },
  {
    name: 'Medical Laboratory Science',
    code: 'MLS',
    totalPoints: 9400,
    activeStudents: 290,
    topContributor: '-'
  },
  {
    name: 'Public Health',
    code: 'PBH',
    totalPoints: 8900,
    activeStudents: 260,
    topContributor: '-'
  },
  {
    name: 'Physiotherapy',
    code: 'PTH',
    totalPoints: 7200,
    activeStudents: 190,
    topContributor: '-'
  },
  {
    name: 'Nutrition & Dietetics',
    code: 'NUT',
    totalPoints: 6100,
    activeStudents: 160,
    topContributor: '-'
  }
];
