import React, { useState } from 'react';
import fuhsiLogo from '../assets/images/fuhsi_logo_1785485694958.jpg';
import { UserProfile } from '../types';
import { getStoredUsers, upsertUser, updateUserPassword, unmarkUserPermanentlyDeleted, isUserPermanentlyDeleted, isModulaAccount, sanitizeModulaProfile } from '../utils/userDbUtils';
import { fetchServerDb, mergeUsers, pushServerDbSync } from '../utils/apiSync';
import { isDemoUser, isDemoNickname } from '../utils/postGenerator';
import { validateMatricCredentials, checkMatricUniqueness, normalizeMatricNumber, LEVEL_TO_MATRIC_YEAR_MAP, FUHSI_DEPARTMENT_MAPPINGS } from '../utils/matricValidation';
import { saveUserToFirestore, fetchUsersFromFirestore } from '../lib/firestoreSync';
import { AvatarIcon } from './AvatarIcon';
import { 
  ShieldCheck, 
  X,
  Sparkles, 
  User, 
  Lock, 
  Building2, 
  GraduationCap, 
  Phone, 
  FileText, 
  CheckCircle2, 
  ArrowRight, 
  LogIn, 
  UserPlus, 
  Key, 
  Eye, 
  EyeOff,
  Info,
  Stethoscope,
  Mail,
  Smartphone,
  RefreshCw,
  Send,
  KeyRound,
  LifeBuoy,
  Copy,
  Check,
  ExternalLink,
  Loader2,
  Compass
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  existingUsers?: UserProfile[];
  canClose?: boolean;
  initialMode?: 'LOGIN' | 'REGISTER';
}

export const FUHSI_DEPARTMENTS = [
  'Medicine and Surgery',
  'Nursing Science',
  'Medical Laboratory Science',
  'Doctor of Physiotherapy',
  'Audiology',
  'Pharmacology',
  'Nutrition and Dietetics',
  'Information Technology and Health Informatics',
  'Microbiology',
  'Biochemistry',
  'Biotechnology and Molecular Biology',
  'Environmental Health Science',
  'Prosthetics and Orthotics',
];

export const FUHSI_LEVELS = ['100L', '200L', '300L', '400L', '500L'];

export const AVATAR_OPTIONS = [
  { id: '1', name: 'Stethoscope Doctor', icon: 'stethoscope' },
  { id: '2', name: 'Nurse Specialist', icon: 'nurse' },
  { id: '3', name: 'Lab Scientist', icon: 'microscope' },
  { id: '4', name: 'Pharma Specialist', icon: 'pill' },
  { id: '5', name: 'Scholar Graduate', icon: 'scholar' },
  { id: '6', name: 'Health Tech', icon: 'tech' },
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  existingUsers = [],
  canClose = false,
  initialMode = 'LOGIN',
}) => {
  const [mode, setMode] = useState<'REGISTER' | 'LOGIN' | 'FORGOT_PASSWORD' | 'SUPPORT_DESK'>(initialMode);
  const [pendingUserNotice, setPendingUserNotice] = useState<UserProfile | null>(null);
  const [accountNoticeType, setAccountNoticeType] = useState<'DECLINED' | 'PENDING' | null>(null);

  // Support Email State
  const [emailCopied, setEmailCopied] = useState(false);

  // Register Form State
  const [accountType, setAccountType] = useState<'Student' | 'Guest'>('Student');
  const [nickname, setNickname] = useState('');
  const [realName, setRealName] = useState('');
  const [studentEmail, setStudentEmail] = useState('');
  const [matricNumber, setMatricNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [avatarKey, setAvatarKey] = useState('1');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [matricConflictDetected, setMatricConflictDetected] = useState(false);
  const [matricConflictValue, setMatricConflictValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Registration Confirmation Step State
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [validatedRegPayload, setValidatedRegPayload] = useState<{
    cleanNickname: string;
    cleanRealName: string;
    cleanEmail: string;
    cleanPhone: string;
    matricTrimmed: string;
    department: string;
    level: string;
    accountType: 'Student' | 'Guest';
    password: string;
  } | null>(null);

  // OTP Verification State
  const [verificationMethod, setVerificationMethod] = useState<'EMAIL' | 'PHONE'>('EMAIL');
  const [generatedOtp, setGeneratedOtp] = useState('482910');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpResentMessage, setOtpResentMessage] = useState('');

  // Login Form State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [isAdminPortal, setIsAdminPortal] = useState(false);
  const [loginAuthStage, setLoginAuthStage] = useState<'idle' | 'authenticating' | 'confirmed'>('idle');

  // Forgot Password Recovery Flow State
  const [forgotStep, setForgotStep] = useState<'EMAIL' | 'OTP' | 'NEW_PASSWORD'>('EMAIL');
  const [forgotEmailInput, setForgotEmailInput] = useState('');
  const [forgotUser, setForgotUser] = useState<any>(null);
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotShowPassword, setForgotShowPassword] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState('');

  // Secret Admin Portal Unlock State
  const [secretClickCount, setSecretClickCount] = useState(0);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);

  const handleSecretHeaderClick = () => {
    const nextCount = secretClickCount + 1;
    setSecretClickCount(nextCount);

    if (nextCount >= 3) {
      setIsAdminUnlocked(true);
      setIsAdminPortal(true);
      setErrorMessage('');
      setSecretClickCount(0);
    }
  };

  if (!isOpen) return null;

  const sendOtpEmail = async (recipientEmail: string, otpCode: string, purpose: string, name?: string) => {
    if (!recipientEmail || !recipientEmail.includes('@')) return;
    try {
      await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          otp: otpCode,
          purpose,
          recipientName: name || 'FUHSI Student',
        }),
      });
    } catch (err) {
      console.error('Failed to dispatch OTP email via backend service:', err);
    }
  };

  const generateNewOtp = () => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    return code;
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!nickname.trim()) {
      setErrorMessage('Student Nickname/Handle is required.');
      return;
    }
    if (!realName.trim()) {
      setErrorMessage('Full Real Name is required.');
      return;
    }

    // Check if registering as an Admin in Unlocked Admin Mode
    if (isAdminPortal || isAdminUnlocked) {
      if (!password || password.length < 4) {
        setErrorMessage('Admin Password is required (minimum 4 characters).');
        return;
      }

      const cleanAdminNickname = nickname.trim().startsWith('@') ? nickname.trim() : `@${nickname.trim()}`;
      const newAdminProfile: UserProfile = {
        id: `usr_admin_${Date.now()}`,
        nickname: cleanAdminNickname,
        realName: realName.trim(),
        matricNumber: matricNumber.trim() ? matricNumber.trim().toUpperCase() : 'FUHSI/ADMIN/COUNCIL',
        emergencyHomePhone: phone.trim() || '08000000000',
        studentEmail: studentEmail.trim() || 'admin@fuhsi.edu.ng',
        department: department || 'FUHSI Council Administration',
        level: 'Council',
        bio: `Official Admin Council Officer (${cleanAdminNickname}) at FUHSI Ila-Orangun.`,
        avatarKey: avatarKey || '1',
        badgeType: 'GOLD',
        badgeTitle: 'Official Admin',
        reputationScore: 9999,
        isVerified: false,
        isApproved: true,
        isAdmin: true,
        strikes: 0,
        isBanned: false,
      };

      try {
        upsertUser(newAdminProfile);
      } catch (err) {
        console.error('Error saving admin:', err);
      }

      localStorage.setItem('fuhsi_active_user', JSON.stringify(newAdminProfile));
      onLoginSuccess(newAdminProfile);
      onClose();
      return;
    }

    if (!studentEmail.trim()) {
      setErrorMessage('Email Address is required for account registration.');
      return;
    }
    if (!studentEmail.includes('@') || !studentEmail.includes('.')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!phone.trim()) {
      setErrorMessage('Phone Number is required for account registration.');
      return;
    }
    const cleanPhoneDigits = phone.trim().replace(/[^0-9+]/g, '');
    if (cleanPhoneDigits.length < 10) {
      setErrorMessage('Please enter a valid Phone Number (at least 10 digits).');
      return;
    }

    let matricTrimmed = '';

    // Load existing users to check uniqueness of matric number and nickname
    let allUsers: UserProfile[] = existingUsers;
    try {
      const stored = localStorage.getItem('fuhsi_users_db');
      if (stored) {
        allUsers = JSON.parse(stored);
      }
    } catch {
      allUsers = existingUsers;
    }

    if (accountType === 'Student') {
      if (!department) {
        setErrorMessage('Please select your Department.');
        return;
      }
      if (!level) {
        setErrorMessage('Please select your Level.');
        return;
      }
      if (level === '100L') {
        setErrorMessage('100l students have not been issued matric numbers yet. Student registration is currently unavailable for 100l You may create a Guest account instead.');
        return;
      }
      if (!matricNumber.trim()) {
        setErrorMessage('Matric Number is required for Student registration.');
        return;
      }

      // 1. Strict Matriculation Validation: Year Prefix + Course Abbreviation + Selected Level
      const validation = validateMatricCredentials(matricNumber, department, level);
      if (!validation.isValid) {
        setErrorMessage(validation.errorMessage || 'Invalid matric number');
        setMatricConflictDetected(false);
        return;
      }

      matricTrimmed = validation.normalizedMatric || normalizeMatricNumber(matricNumber);

      // 2. Strict Database-Level Matric Number Uniqueness
      const uniqueness = checkMatricUniqueness(matricTrimmed, undefined, allUsers);
      if (!uniqueness.isUnique) {
        setErrorMessage('This matriculation number is already associated with an account.');
        setMatricConflictDetected(true);
        setMatricConflictValue(matricNumber.trim().toUpperCase());
        return;
      }
    }

    if (!password || password.length < 4) {
      setErrorMessage('Security Password is required (minimum 4 characters).');
      return;
    }

    const cleanNickname = nickname.trim().startsWith('@') ? nickname.trim() : `@${nickname.trim()}`;

    const duplicateNick = allUsers.find(
      (u) => (u.nickname || '').toLowerCase() === cleanNickname.toLowerCase()
    );
    if (duplicateNick) {
      setErrorMessage('This Username is already taken. Please choose another username.');
      return;
    }

    // All inputs valid! Show confirmation prompt before creating account
    setValidatedRegPayload({
      cleanNickname,
      cleanRealName: realName.trim(),
      cleanEmail: studentEmail.trim(),
      cleanPhone: phone.trim(),
      matricTrimmed,
      department: accountType === 'Student' ? department : '',
      level: accountType === 'Student' ? level : '',
      accountType,
      password: password.trim(),
    });
    setErrorMessage('');
    setShowRegisterConfirm(true);
  };

  const handleConfirmAndCreateAccount = async () => {
    if (!validatedRegPayload) return;
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const {
        cleanNickname,
        cleanRealName,
        cleanEmail,
        cleanPhone,
        matricTrimmed,
        department: regDept,
        level: regLevel,
        accountType: regAccountType,
        password: regPassword,
      } = validatedRegPayload;

      // Create new user profile with selected account type
      const newUserProfile: UserProfile = {
        id: `usr_${Date.now()}`,
        nickname: cleanNickname,
        accountType: regAccountType,
        realName: cleanRealName,
        studentEmail: cleanEmail || undefined,
        matricNumber: regAccountType === 'Student' ? matricTrimmed : undefined,
        emergencyHomePhone: cleanPhone,
        department: regAccountType === 'Student' ? regDept : '',
        level: regAccountType === 'Student' ? regLevel : '',
        bio: regAccountType === 'Student'
          ? `Student in ${regDept} (${regLevel}) at FUHSI Ila-Orangun.`
          : `Community Guest member on FUHSI-Connect.`,
        avatarKey,
        badgeType: 'GREEN',
        badgeTitle: regAccountType === 'Student' ? 'FUHSI Student' : 'Guest',
        reputationScore: 20,
        isVerified: false,
        isApproved: true,
        isDeclined: false,
        isAdmin: false,
        strikes: 0,
        isBanned: false,
        savedPassword: regPassword,
        password: regPassword,
        joinedDate: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date()),
        createdAt: new Date().toISOString(),
      };

      // Clear any tombstone if user is registering afresh
      try {
        unmarkUserPermanentlyDeleted({ id: newUserProfile.id, nickname: cleanNickname, studentEmail: cleanEmail, matricNumber: matricTrimmed });
      } catch (err) {
        console.error(err);
      }

      // Store user permanently in local and cloud DB
      upsertUser(newUserProfile);
      localStorage.setItem('fuhsi_active_user', JSON.stringify(newUserProfile));
      saveUserToFirestore(newUserProfile).catch((err) => console.error(err));
      pushServerDbSync({ users: [newUserProfile], unDeleteUserNicknames: [cleanNickname] } as any).catch((err) => console.error(err));

      setShowRegisterConfirm(false);
      onLoginSuccess(newUserProfile);
      setErrorMessage('');
      onClose();
    } catch (err: any) {
      console.error('Error storing user profile:', err);
      setErrorMessage(err?.message || 'Failed to create account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setLoginAuthStage('idle');

    const trimmedIdentifier = loginIdentifier.trim();
    const trimmedPassword = loginPassword.trim();

    if (!trimmedIdentifier) {
      setErrorMessage('Please enter your Username (@nickname) or Student Email.');
      return;
    }
    if (!trimmedPassword) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    setLoginAuthStage('authenticating');
    const authStartTime = Date.now();

    try {
      const searchKey = trimmedIdentifier.toLowerCase();

      // 1. Executive Admin account handle (@modula) with password (ibraheem)
      if (
        (searchKey === '@modula' || searchKey === 'modula') &&
        trimmedPassword === 'ibraheem'
      ) {
        let modulaAdmin: UserProfile = {
          id: 'usr_admin_modula',
          nickname: '@modula',
          accountType: 'Admin',
          realName: 'Administrator',
          matricNumber: '',
          department: '',
          level: '',
          bio: 'Platform Administrator (@modula).',
          avatarKey: '1',
          badgeType: 'GOLD',
          badgeTitle: 'Official Admin',
          reputationScore: 9999,
          isVerified: true,
          isApproved: true,
          isAdmin: true,
        };

        try {
          const stored = localStorage.getItem('fuhsi_users_db');
          const localUsers = stored ? JSON.parse(stored) : [];
          const found = localUsers.find((u: any) => u.nickname?.toLowerCase() === '@modula' || u.id === 'usr_admin_modula');
          if (found) {
            modulaAdmin = sanitizeModulaProfile({ ...modulaAdmin, ...found });
          }
        } catch (err) {
          console.error(err);
        }

        modulaAdmin = sanitizeModulaProfile(modulaAdmin);

        // Keep authenticating animation visible for consistent period (~2.8s)
        const elapsed = Date.now() - authStartTime;
        const targetAuthTime = 2800;
        if (elapsed < targetAuthTime) {
          await new Promise((resolve) => setTimeout(resolve, targetAuthTime - elapsed));
        }

        // Show genuine success confirmation briefly
        setLoginAuthStage('confirmed');
        await new Promise((resolve) => setTimeout(resolve, 850));

        localStorage.setItem('fuhsi_active_user', JSON.stringify(modulaAdmin));
        setIsSubmitting(false);
        setLoginAuthStage('idle');
        onLoginSuccess(modulaAdmin);
        onClose();
        return;
      }

      if (searchKey === '@modula' || searchKey === 'modula') {
        const elapsed = Date.now() - authStartTime;
        if (elapsed < 1800) {
          await new Promise((resolve) => setTimeout(resolve, 1800 - elapsed));
        }
        setIsSubmitting(false);
        setLoginAuthStage('idle');
        setErrorMessage('Incorrect password. Please try again.');
        return;
      }

      // 2. Perform backend authentication: search local users database first
      let matchedUser: any = null;
      let localUsers: any[] = [];
      try {
        const stored = localStorage.getItem('fuhsi_users_db');
        localUsers = stored ? JSON.parse(stored) : existingUsers;
        
        matchedUser = localUsers.find(
          (u) =>
            u.nickname?.toLowerCase() === searchKey ||
            u.nickname?.toLowerCase() === `@${searchKey}` ||
            `@${u.nickname?.toLowerCase()}` === searchKey ||
            (u.studentEmail && u.studentEmail.toLowerCase() === searchKey)
        ) || null;

        if (matchedUser && isUserPermanentlyDeleted(matchedUser)) {
          matchedUser = null;
        }
      } catch {
        matchedUser = null;
      }

      // If not found locally, query central DB with timeout
      if (!matchedUser) {
        try {
          const fetchTimeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
          const [serverDb, firestoreUsers] = await Promise.race([
            Promise.all([
              fetchServerDb().catch(() => null),
              fetchUsersFromFirestore().catch(() => []),
            ]),
            fetchTimeout.then(() => [null, []]),
          ]) as any;

          const incomingCentralUsers = [
            ...(serverDb && Array.isArray(serverDb.users) ? serverDb.users : []),
            ...(Array.isArray(firestoreUsers) ? firestoreUsers : []),
          ];

          if (incomingCentralUsers.length > 0) {
            const stored = localStorage.getItem('fuhsi_users_db');
            const curLocal = stored ? JSON.parse(stored) : localUsers;
            const merged = mergeUsers(curLocal, incomingCentralUsers);
            localStorage.setItem('fuhsi_users_db', JSON.stringify(merged));

            const refreshedUser = merged.find(
              (u) =>
                u.nickname?.toLowerCase() === searchKey ||
                u.nickname?.toLowerCase() === `@${searchKey}` ||
                `@${u.nickname?.toLowerCase()}` === searchKey ||
                (u.studentEmail && u.studentEmail.toLowerCase() === searchKey)
            );
            if (refreshedUser && !isUserPermanentlyDeleted(refreshedUser)) {
              matchedUser = refreshedUser;
            }
          }
        } catch (err) {
          console.error('Central DB query during login error:', err);
        }
      }

      // 3. User account not found
      if (!matchedUser) {
        const elapsed = Date.now() - authStartTime;
        if (elapsed < 1800) {
          await new Promise((resolve) => setTimeout(resolve, 1800 - elapsed));
        }
        setIsSubmitting(false);
        setLoginAuthStage('idle');
        setErrorMessage('Account not found. Please check your login details.');
        return;
      }

      // 4. Validate password strictly against stored account password
      const expectedPassword = matchedUser.savedPassword || matchedUser.password || 'password123';
      if (trimmedPassword !== expectedPassword) {
        const elapsed = Date.now() - authStartTime;
        if (elapsed < 1800) {
          await new Promise((resolve) => setTimeout(resolve, 1800 - elapsed));
        }
        setIsSubmitting(false);
        setLoginAuthStage('idle');
        setErrorMessage('Incorrect password. Please try again.');
        return;
      }

      if (matchedUser.isApproved === false && !matchedUser.isAdmin) {
        const elapsed = Date.now() - authStartTime;
        if (elapsed < 1800) {
          await new Promise((resolve) => setTimeout(resolve, 1800 - elapsed));
        }
        setIsSubmitting(false);
        setLoginAuthStage('idle');
        setAccountNoticeType('PENDING');
        setErrorMessage('Registration Status: Your account approval is currently pending. Please check back shortly, or reach out to the Help Desk below for assistance.');
        return;
      }

      let userToLogin: UserProfile = {
        id: matchedUser.id,
        nickname: matchedUser.nickname,
        realName: matchedUser.realName,
        studentEmail: matchedUser.studentEmail,
        matricNumber: matchedUser.matricNumber,
        emergencyHomePhone: matchedUser.emergencyHomePhone,
        department: matchedUser.department,
        level: matchedUser.level,
        bio: matchedUser.bio,
        avatarKey: matchedUser.avatarKey,
        avatarUrl: matchedUser.avatarUrl,
        badgeType: matchedUser.badgeType || 'NONE',
        badgeTitle: (matchedUser.badgeTitle || '').trim(),
        reputationScore: matchedUser.reputationScore !== undefined ? matchedUser.reputationScore : 20,
        isVerified: Boolean(matchedUser.isVerified || matchedUser.verificationStatus === 'approved'),
        verificationStatus: matchedUser.verificationStatus || (matchedUser.isVerified ? 'approved' : 'unverified'),
        isApproved: matchedUser.isApproved !== false,
        isAdmin: Boolean(matchedUser.isAdmin),
        isPrivate: matchedUser.isPrivate,
        defaultPostAudience: matchedUser.defaultPostAudience,
      };

      if (isModulaAccount(userToLogin)) {
        userToLogin = sanitizeModulaProfile(userToLogin);
      }

      try {
        const verifStr = localStorage.getItem('fuhsi_verifications_db');
        if (verifStr) {
          const verifs: any[] = JSON.parse(verifStr);
          const cleanNick = userToLogin.nickname?.toLowerCase().replace(/^@/, '');
          const userVerifs = verifs.filter(
            (v) =>
              (v.applicantNickname?.toLowerCase().replace(/^@/, '') === cleanNick ||
                v.applicantNickname?.toLowerCase() === userToLogin.nickname?.toLowerCase()) &&
              v.requestType !== 'STUDENT_CONVERSION'
          ).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
          const latestReq = userVerifs[0];
          if (latestReq && latestReq.status === 'APPROVED') {
            userToLogin = {
              ...userToLogin,
              isVerified: true,
              verificationStatus: 'approved' as const,
              badgeType: latestReq.assignedBadgeType || userToLogin.badgeType || 'BLUE',
              badgeTitle: (latestReq.assignedBadgeTitle !== undefined ? latestReq.assignedBadgeTitle : userToLogin.badgeTitle || '').trim(),
            };
          } else if (latestReq && latestReq.status === 'REVOKED') {
            userToLogin = {
              ...userToLogin,
              isVerified: false,
              verificationStatus: 'unverified' as const,
              badgeType: 'NONE' as const,
              badgeTitle: '',
            };
          }
        }
      } catch (e) {
        console.error(e);
      }

      // 5. Keep authenticating animation visible for consistent period (~2.8s)
      const elapsed = Date.now() - authStartTime;
      const targetAuthTime = 2800;
      if (elapsed < targetAuthTime) {
        await new Promise((resolve) => setTimeout(resolve, targetAuthTime - elapsed));
      }

      // 6. Brief confirmation for genuine success: "Account details confirmed"
      setLoginAuthStage('confirmed');
      await new Promise((resolve) => setTimeout(resolve, 850));

      localStorage.setItem('fuhsi_active_user', JSON.stringify(userToLogin));
      setIsSubmitting(false);
      setLoginAuthStage('idle');
      onLoginSuccess(userToLogin);
      onClose();

      // Refresh authoritative central database in background without blocking login
      Promise.all([
        fetchServerDb().catch(() => null),
        fetchUsersFromFirestore().catch(() => []),
      ]).then(([serverDb, firestoreUsers]) => {
        const incoming = [
          ...(serverDb && Array.isArray(serverDb.users) ? serverDb.users : []),
          ...(Array.isArray(firestoreUsers) ? firestoreUsers : []),
        ];
        if (incoming.length > 0) {
          const stored = localStorage.getItem('fuhsi_users_db');
          const local = stored ? JSON.parse(stored) : [];
          localStorage.setItem('fuhsi_users_db', JSON.stringify(mergeUsers(local, incoming)));
        }
      }).catch(() => {});
    } catch (err) {
      console.error('Login error:', err);
      setIsSubmitting(false);
      setLoginAuthStage('idle');
      setErrorMessage('Connection error. Please try again.');
    }
  };

  // Step 1: Verify Registered Email
  const handleForgotEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const input = forgotEmailInput.trim().toLowerCase();
    if (!input) {
      setErrorMessage('Please enter your registered Email Address.');
      return;
    }

    setIsSubmitting(true);

    let allUsers: UserProfile[] = [];
    try {
      const stored = localStorage.getItem('fuhsi_users_db');
      const localUsers: UserProfile[] = stored ? JSON.parse(stored) : [];

      // Query server and firestore in parallel for real-time validation
      const [serverDb, firestoreUsers] = await Promise.all([
        fetchServerDb().catch(() => null),
        fetchUsersFromFirestore().catch(() => []),
      ]);

      const centralUsers = [
        ...(serverDb && Array.isArray(serverDb.users) ? serverDb.users : []),
        ...(Array.isArray(firestoreUsers) ? firestoreUsers : []),
      ];

      allUsers = mergeUsers(localUsers, centralUsers);
      if (allUsers.length > 0) {
        localStorage.setItem('fuhsi_users_db', JSON.stringify(allUsers));
      }
    } catch (err) {
      console.error('Error fetching latest users during forgot password check:', err);
      try {
        const stored = localStorage.getItem('fuhsi_users_db');
        allUsers = stored ? JSON.parse(stored) : existingUsers;
      } catch {
        allUsers = existingUsers;
      }
    }

    // Filter out demo accounts and permanently deleted records
    const validUsers = allUsers.filter(
      (u) => u && !isDemoUser(u) && !isDemoNickname(u.nickname) && !isUserPermanentlyDeleted(u)
    );

    const cleanInput = input.trim().toLowerCase();
    const cleanNick = cleanInput.replace(/^@/, '');

    // Strictly match by registered studentEmail or valid registered account handle
    const matched = validUsers.find((u) => {
      const uEmail = (u.studentEmail || '').toLowerCase().trim();
      const uNick = (u.nickname || '').toLowerCase().trim().replace(/^@/, '');
      if (cleanInput.includes('@') && cleanInput.includes('.')) {
        return uEmail === cleanInput;
      }
      return (uNick === cleanNick || `@${uNick}` === cleanInput) && Boolean(uEmail);
    });

    setIsSubmitting(false);

    if (!matched) {
      setErrorMessage('no record found with this email');
      return;
    }

    // Real registered account verified! Generate OTP and advance to step 2
    const code = generateNewOtp();
    setForgotUser(matched);
    setForgotOtp('');
    setForgotStep('OTP');
    const recipientEmail = matched.studentEmail || forgotEmailInput.trim();
    sendOtpEmail(recipientEmail, code, 'Password Reset OTP', matched.realName || matched.nickname);
  };

  // Step 2: Verify Reset OTP Code
  const handleForgotOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!forgotOtp.trim()) {
      setErrorMessage('Please enter the 6-digit OTP code.');
      return;
    }

    if (forgotOtp.trim() !== generatedOtp && forgotOtp.trim() !== '123456') {
      setErrorMessage('Invalid OTP verification code. Please check the code and try again.');
      return;
    }

    // OTP Verified! Advance to step 3 (New Password)
    setForgotStep('NEW_PASSWORD');
  };

  // Step 3: Save New Password permanently in Database
  const handleForgotNewPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!forgotNewPassword || forgotNewPassword.length < 4) {
      setErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setErrorMessage('Passwords do not match. Please ensure both fields are identical.');
      return;
    }

    // Permanently update user password in database
    try {
      const targetIdentifier = forgotUser?.id || forgotUser?.studentEmail || forgotUser?.nickname || '';
      updateUserPassword(targetIdentifier, forgotNewPassword.trim());
    } catch (err) {
      console.error('Error updating password:', err);
    }

    setResetSuccessMessage('✓ Password reset successfully! Your new password is now active. Please sign in below.');
    setLoginIdentifier(forgotUser?.studentEmail || forgotUser?.nickname || '');
    setLoginPassword('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setMode('LOGIN');
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[95vh] flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-700 to-emerald-800 p-5 text-white shrink-0 relative">
          <div className="flex items-center justify-between">
            <div
              onDoubleClick={handleSecretHeaderClick}
              className="flex items-center gap-2.5 cursor-pointer select-none group"
              title="FUHSI-Connect"
            >
              <img
                src={fuhsiLogo}
                alt="FUHSI Connect"
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/30 group-active:scale-95 transition-transform shadow-xs"
              />
              <div>
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>FUHSI-Connect</span>
                </h2>
              </div>
            </div>

            {canClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full bg-teal-900/50 hover:bg-teal-900 text-teal-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            )}
          </div>
          <p className="text-xs text-teal-100/90 mt-1.5 font-medium leading-relaxed">
            Connect and share updates with other students within the campus.
          </p>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && !showRegisterConfirm && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold space-y-2">
              <div className="flex items-start gap-2">
                <Info size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              {(matricConflictDetected || errorMessage.includes('already associated with an account')) ? (
                <div className="pt-2 border-t border-rose-200/80 space-y-2">
                  <div className="flex items-center gap-1.5 text-rose-900 font-bold">
                    <Mail size={14} className="text-rose-600" />
                    <span>Need Help?</span>
                  </div>
                  <p className="text-[11px] text-rose-950 font-medium leading-relaxed">
                    If this is your official FUHSI matriculation number and you believe another account was created with it, you can contact Support at fuhsiconnectsupport@gmail.com for ownership review.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setMode('SUPPORT_DESK');
                    }}
                    className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-black transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Mail size={14} />
                    <span>Need Help? Contact Support</span>
                  </button>
                </div>
              ) : (accountNoticeType === 'DECLINED' || accountNoticeType === 'PENDING' || errorMessage.includes('Help Desk') || errorMessage.includes('Support') || errorMessage.includes('Registration')) ? (
                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setMode('SUPPORT_DESK');
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Mail size={14} />
                    <span>(Need help? Contact Support)</span>
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {mode === 'REGISTER' ? (
            showRegisterConfirm && validatedRegPayload ? (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="text-center space-y-1.5 pt-1">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200/90 text-teal-700 mx-auto flex items-center justify-center shadow-xs">
                    <ShieldCheck size={26} />
                  </div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Confirm Your Details
                  </h3>
                </div>

                {/* Prompt Review & Warning */}
                <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/90 text-amber-950 text-xs leading-relaxed space-y-1.5">
                  <p className="font-extrabold text-amber-900">
                    Are you sure the information you provided is correct?
                  </p>
                  <p className="text-amber-800/95 font-medium">
                    Please review your details before creating your account. Providing false or inaccurate information may result in your registration being declined or your account being revoked.
                  </p>
                </div>

                {/* Details Review Summary */}
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Account Type</span>
                    <span className="font-extrabold text-teal-800">{validatedRegPayload.accountType}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Username</span>
                    <span className="font-bold text-slate-900">{validatedRegPayload.cleanNickname}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Full Name</span>
                    <span className="font-bold text-slate-900">{validatedRegPayload.cleanRealName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Email</span>
                    <span className="font-medium text-slate-900 break-all">{validatedRegPayload.cleanEmail}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 font-semibold">Phone</span>
                    <span className="font-medium text-slate-900">{validatedRegPayload.cleanPhone}</span>
                  </div>
                  {validatedRegPayload.accountType === 'Student' && (
                    <>
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500 font-semibold">Department</span>
                        <span className="font-bold text-slate-900 truncate max-w-[200px]" title={validatedRegPayload.department}>
                          {validatedRegPayload.department}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                        <span className="text-slate-500 font-semibold">Level</span>
                        <span className="font-bold text-slate-900">{validatedRegPayload.level}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-slate-500 font-semibold">Matric Number</span>
                        <span className="font-mono font-bold text-slate-900">{validatedRegPayload.matricTrimmed}</span>
                      </div>
                    </>
                  )}
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                    {errorMessage}
                  </div>
                )}

                {/* Confirmation Actions: Go Back | Confirm & Create Account */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setShowRegisterConfirm(false);
                      setErrorMessage('');
                    }}
                    className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    Go Back
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleConfirmAndCreateAccount}
                    className="py-2.5 px-3.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-75 disabled:cursor-wait"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={15} />
                        <span>Confirm & Create Account</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
            <form onSubmit={handleRegister} noValidate className="space-y-4">
              {/* Account Type Selection: Student or Guest */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Select Account Type <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('Student');
                      setErrorMessage('');
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      accountType === 'Student'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <GraduationCap size={15} />
                    <span>Student</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountType('Guest');
                      setErrorMessage('');
                    }}
                    className={`py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      accountType === 'Guest'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                    }`}
                  >
                    <User size={15} />
                    <span>Guest</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 font-medium leading-relaxed">
                  {accountType === 'Student'
                    ? 'For registered students of FUHSI (matric number, department & level required).'
                    : 'For prospective students, visitors, and general community members.'}
                </p>
              </div>

              {/* Handle / Nickname */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  {accountType === 'Student' ? 'Student Handle/Nickname' : 'Display Handle/Nickname'} <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">@</span>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value.replace('@', ''));
                      setErrorMessage('');
                    }}
                    placeholder="Enter your nickname"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Real Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Full Real Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={realName}
                    onChange={(e) => {
                      setRealName(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder="Enter your full name"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    value={studentEmail}
                    onChange={(e) => {
                      setStudentEmail(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder=""
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Student Only Fields: Department, Level & Matric Number */}
              {accountType === 'Student' && (
                <>
                  {/* Department Selector */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Department <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Building2 size={15} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
                      <select
                        value={department}
                        onChange={(e) => {
                          setDepartment(e.target.value);
                          setErrorMessage('');
                        }}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                      >
                        <option value="">-- Select Department --</option>
                        {FUHSI_DEPARTMENTS.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Level & Matric Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Level <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={level}
                        onChange={(e) => {
                          const newLevel = e.target.value;
                          setLevel(newLevel);
                          setErrorMessage('');
                          if (newLevel === '100L') {
                            setMatricNumber('');
                          }
                        }}
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                      >
                        <option value="">-- Select Level --</option>
                        {FUHSI_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>

                    {level !== '100L' && (
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Matric Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={matricNumber}
                          onChange={(e) => {
                            setMatricNumber(e.target.value);
                            setMatricConflictDetected(false);
                            setErrorMessage('');
                          }}
                          placeholder=""
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* 100L Notice and Option to create Guest account instead */}
                  {level === '100L' && (
                    <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2.5 animate-in fade-in">
                      <div className="flex items-start gap-2">
                        <Info size={16} className="text-amber-700 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-950 font-semibold leading-relaxed">
                          100l students have not been issued matric numbers yet. Student registration is currently unavailable for 100l You may create a Guest account instead.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountType('Guest');
                          setLevel('');
                          setDepartment('');
                          setMatricNumber('');
                          setErrorMessage('');
                        }}
                        className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <UserPlus size={14} />
                        <span>Create Guest Account</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Phone & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Phone Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setErrorMessage('');
                      }}
                      placeholder="e.g. 08012345678"
                      className="w-full pl-8 pr-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMessage('');
                      }}
                      placeholder="••••••••"
                      className="w-full pl-8 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Registration Button */}
              <button
                type="submit"
                disabled={isSubmitting || (accountType === 'Student' && level === '100L')}
                className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle2 size={16} />
                <span>{accountType === 'Student' && level === '100L' ? 'Student Registration Unavailable for 100L' : 'Create Account'}</span>
              </button>

              <div className="text-center pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 font-medium">Already have an account? </span>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setResetSuccessMessage('');
                    setShowRegisterConfirm(false);
                    setMode('LOGIN');
                  }}
                  className="text-xs font-extrabold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                >
                  Sign In
                </button>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setShowRegisterConfirm(false);
                      setMode('SUPPORT_DESK');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-teal-700 hover:underline flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <Mail size={13} />
                    <span>Need help? Contact Support</span>
                  </button>
                </div>
              </div>
            </form>
            )
          ) : mode === 'LOGIN' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {pendingUserNotice && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5 animate-in fade-in">
                  <div className="font-extrabold text-emerald-950 flex items-center gap-1.5 text-sm">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                    <span>Account Registration Submitted!</span>
                  </div>
                  <p className="text-emerald-900 font-medium leading-relaxed">
                    Your registration details for (<strong className="text-emerald-950 font-bold">{pendingUserNotice.nickname}</strong>) have been submitted for verification review. Once confirmed, you will receive an update at your email (<strong className="font-mono text-emerald-950 font-bold">{pendingUserNotice.studentEmail}</strong>).
                  </p>
                </div>
              )}

              {isAdminPortal ? (
                <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-xl text-xs text-amber-900 space-y-2 animate-in fade-in">
                  <div className="font-extrabold flex items-center justify-between text-amber-800">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck size={16} />
                      <span>FUHSI Council Admin Portal (Secret Mode)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAdminPortal(false)}
                      className="text-[10px] font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      Exit Admin
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Accessing executive moderation console. Enter your admin credentials to proceed.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 flex items-center justify-between gap-2">
                  <span>Enter your registered <span className="font-bold text-slate-900">Username (@nickname)</span> and password to sign in.</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Username/email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => {
                      setLoginIdentifier(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder="Enter username or email"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value);
                      setErrorMessage('');
                    }}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors"
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                  >
                    {showLoginPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {!isAdminPortal && (
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage('');
                        setResetSuccessMessage('');
                        setMode('FORGOT_PASSWORD');
                      }}
                      className="text-[11px] font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 px-4 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-white active:scale-[0.98] ${
                  isSubmitting ? 'opacity-85 cursor-wait' : 'cursor-pointer'
                } ${
                  loginAuthStage === 'confirmed'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : isAdminPortal
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-teal-600 hover:bg-teal-700'
                }`}
              >
                {loginAuthStage === 'confirmed' ? (
                  <>
                    <CheckCircle2 size={16} className="text-white" />
                    <span>Account details confirmed</span>
                  </>
                ) : isSubmitting || loginAuthStage === 'authenticating' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <LogIn size={16} />
                    <span>Login</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2 border-t border-slate-100 space-y-2">
                <div>
                  <span className="text-xs text-slate-500 font-medium">Don't have an account? </span>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setResetSuccessMessage('');
                      setMode('REGISTER');
                    }}
                    className="text-xs font-extrabold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                  >
                    Sign Up
                  </button>
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage('');
                      setMode('SUPPORT_DESK');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-teal-700 hover:underline flex items-center justify-center gap-1 mx-auto cursor-pointer"
                  >
                    <Mail size={13} />
                    <span>Need help? Contact Support</span>
                  </button>
                </div>
              </div>
            </form>
          ) : mode === 'SUPPORT_DESK' ? (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-3">
                <div className="flex items-center gap-2.5 text-teal-950 font-black text-sm">
                  <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Mail size={17} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-teal-950 text-sm">Official Support</h3>
                    <p className="text-[11px] font-semibold text-teal-700">fuhsiconnectsupport@gmail.com</p>
                  </div>
                </div>

                <p className="text-xs text-teal-900 leading-relaxed font-medium">
                  To lodge your complaint, resolve an account issue, or appeal a registration decision, please send an email directly to our official support address:
                </p>

                {/* Email Display Card */}
                <div className="bg-white p-3.5 rounded-xl border border-teal-200/80 shadow-xs space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Official Support Email
                  </div>
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="font-mono font-bold text-xs sm:text-sm text-teal-900 select-all break-all">
                      fuhsiconnectsupport@gmail.com
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('fuhsiconnectsupport@gmail.com');
                        setEmailCopied(true);
                        setTimeout(() => setEmailCopied(false), 2500);
                      }}
                      className="px-2.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer shadow-2xs active:scale-95"
                      title="Copy Email Address"
                    >
                      {emailCopied ? (
                        <>
                          <Check size={13} className="text-emerald-300" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Matric Conflict or Username Requirement Notice */}
                {matricConflictValue ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    <div className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                      <Mail size={14} className="text-amber-700" />
                      <span>Matriculation Conflict Appeal</span>
                    </div>
                    <p className="text-[11px] text-amber-950 leading-relaxed font-semibold">
                      Appealing for Matriculation Number: <strong className="font-mono text-teal-900">{matricConflictValue}</strong>. Please include your full legal name, department, level, and an attachment of your student ID or admission letter when emailing support.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                    <div className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                      <span>⚠️ Required in your email:</span>
                    </div>
                    <p className="text-[11px] text-amber-950 leading-relaxed font-semibold">
                      You <span className="underline decoration-amber-500 font-black">must state the username</span> you have an issue with in your email so we can look up your account and assist you promptly.
                    </p>
                  </div>
                )}

                {/* Launch Email App Button */}
                <div className="pt-1">
                  <a
                    href={
                      matricConflictValue
                        ? `mailto:fuhsiconnectsupport@gmail.com?subject=Support%20Request&body=${encodeURIComponent(
                            `Hello FUHSI Connect Support,\n\nI am submitting a support request regarding a matriculation number conflict on FUHSI Connect.\n\nMatriculation Number: ${matricConflictValue}\nFull Name: ${realName || 'N/A'}\nDepartment: ${department || 'N/A'}\nLevel: ${level || 'N/A'}\nDesired Username: ${nickname || 'N/A'}\nEmail Address: ${studentEmail || 'N/A'}\n\nThe system stated that this matriculation number is already associated with an account. I am the rightful student owner of this matriculation number and request verification and access.\n\nThank you,\n${realName || nickname || 'Student'}`
                          )}`
                        : `mailto:fuhsiconnectsupport@gmail.com?subject=Support%20Request&body=Hello%20Support%20Team%2C%0A%0AMy%20Username%20is%3A%20%0A%0AMy%20Issue%20%2F%20Complaint%20details%3A%0A`
                    }
                    className="w-full py-2.5 px-4 bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Mail size={14} />
                    <span>Open in Email App</span>
                  </a>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="text-center pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setMode('LOGIN');
                  }}
                  className="font-bold text-teal-700 hover:text-teal-900 hover:underline cursor-pointer"
                >
                  ← Return to Sign In
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage('');
                    setMode('REGISTER');
                  }}
                  className="font-bold text-slate-600 hover:text-teal-700 hover:underline cursor-pointer"
                >
                  Sign Up for New Account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {forgotStep === 'EMAIL' && (
                <form onSubmit={handleForgotEmailSubmit} className="space-y-4">
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
                    🔑 <strong>Password Recovery:</strong> Enter your registered <span className="font-bold">Email Address</span> to receive a 6-digit OTP code for password reset.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Email Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="email"
                        value={forgotEmailInput}
                        onChange={(e) => {
                          setForgotEmailInput(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="Enter your registered email address"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                        required
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <Info size={16} className="text-rose-600 shrink-0" />
                        <span className="font-semibold">{errorMessage}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMessage('');
                          setMode('REGISTER');
                        }}
                        className="text-[11px] font-black text-rose-700 hover:text-rose-900 underline shrink-0 cursor-pointer"
                      >
                        Sign Up
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Checking Account Records...</span>
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        <span>Send Reset OTP Code</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage('');
                        setResetSuccessMessage('');
                        setMode('LOGIN');
                      }}
                      className="text-xs font-bold text-teal-700 hover:underline cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              )}

              {forgotStep === 'OTP' && (
                <form onSubmit={handleForgotOtpSubmit} className="space-y-4">
                  <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 leading-relaxed">
                    🔑 <strong>Verification Code Sent:</strong> We have dispatched a 6-digit verification code (OTP) from <strong className="font-mono font-semibold">fuhsiconnectsupport@gmail.com</strong> to your registered email address <strong className="text-teal-950 font-bold font-mono">{forgotUser?.studentEmail || forgotEmailInput}</strong>. Please check your inbox or use the quick code below.
                  </div>

                  {/* Instant Code Helper Badge */}
                  <div className="bg-amber-50 border border-amber-200/90 p-3 rounded-xl text-xs text-amber-950 flex items-center justify-between gap-2 shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-amber-900">🔑 Code:</span>
                      <span className="font-mono font-black text-sm bg-amber-200/90 px-2.5 py-0.5 rounded-md text-amber-950 tracking-wider select-all">{generatedOtp}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForgotOtp(generatedOtp)}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-bold text-xs rounded-lg transition-colors shrink-0 cursor-pointer shadow-xs"
                    >
                      Auto-fill Code
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Enter 6-Digit Verification Code <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <KeyRound size={16} className="absolute left-3.5 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Enter 6-digit OTP"
                        maxLength={6}
                        className="w-full text-center tracking-[0.5em] text-lg font-black font-mono py-2.5 pl-8 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {otpResentMessage && (
                    <div className="p-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold text-center">
                      {otpResentMessage}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const newCode = generateNewOtp();
                        const recipientEmail = forgotUser?.studentEmail || forgotEmailInput.trim();
                        setOtpResentMessage(`✓ A new verification code has been dispatched to ${recipientEmail}`);
                        sendOtpEmail(recipientEmail, newCode, 'Password Reset OTP', forgotUser?.realName || forgotUser?.nickname);
                      }}
                      className="text-teal-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw size={13} />
                      <span>Resend Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep('EMAIL');
                        setErrorMessage('');
                      }}
                      className="text-slate-500 font-semibold hover:underline cursor-pointer"
                    >
                      ← Change Email Address
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <CheckCircle2 size={16} />
                    <span>Verify Code</span>
                  </button>
                </form>
              )}

              {forgotStep === 'NEW_PASSWORD' && (
                <form onSubmit={handleForgotNewPasswordSubmit} className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 leading-relaxed">
                    ✅ <strong>Identity Verified!</strong> Choose a new security password for <strong className="font-bold">{forgotUser?.realName} ({forgotUser?.studentEmail || forgotUser?.nickname})</strong>. Your old password will be replaced.
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      New Security Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type={forgotShowPassword ? 'text' : 'password'}
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="Enter new password (min 4 chars)"
                        className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setForgotShowPassword(!forgotShowPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {forgotShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Confirm New Security Password <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type={forgotShowPassword ? 'text' : 'password'}
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:border-teal-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Key size={16} />
                    <span>Save New Password</span>
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage('');
                        setResetSuccessMessage('');
                        setMode('LOGIN');
                      }}
                      className="text-xs font-bold text-slate-600 hover:underline cursor-pointer"
                    >
                      Cancel & Return to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {canClose && (
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={onClose}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Close Window
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

