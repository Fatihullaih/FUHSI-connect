import React, { useState } from 'react';
import { UserProfile, VerificationRequest, HelpDeskInquiry } from '../types';
import { validateMatricCredentials, checkMatricUniqueness, normalizeMatricNumber } from '../utils/matricValidation';
import { saveHelpDeskInquiryToFirestore } from '../lib/firestoreSync';
import { 
  X, 
  GraduationCap, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  CreditCard, 
  AlertCircle, 
  Check, 
  Sparkles, 
  ArrowRight,
  User,
  Hash,
  Building2,
  Lock,
  ExternalLink,
  LifeBuoy,
  Mail,
  Copy,
  ArrowLeft
} from 'lucide-react';

interface StudentConversionModalProps {
  userProfile: UserProfile | null;
  onClose: () => void;
  onSubmitConversion: (data: {
    fullName: string;
    matricNumber: string;
    department: string;
    level: string;
    email?: string;
    phone?: string;
    fee: number;
    paymentRef: string;
  }) => void;
}

const FUHSI_DEPARTMENTS = [
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

const LEVELS = ['100L', '200L', '300L', '400L', '500L'];

export const StudentConversionModal: React.FC<StudentConversionModalProps> = ({
  userProfile,
  onClose,
  onSubmitConversion,
}) => {
  const isPending = userProfile?.studentConversionStatus === 'pending';

  const [fullName, setFullName] = useState(userProfile?.realName || '');
  const [matricNumber, setMatricNumber] = useState(userProfile?.matricNumber || '');
  const [department, setDepartment] = useState(userProfile?.department || FUHSI_DEPARTMENTS[0]);
  const [level, setLevel] = useState(userProfile?.level || '100L');
  const [email, setEmail] = useState(userProfile?.studentEmail || '');
  const [phone, setPhone] = useState(userProfile?.emergencyHomePhone || '');
  
  const [step, setStep] = useState<'FORM' | 'PAYMENT' | 'SUCCESS'>(isPending ? 'SUCCESS' : 'FORM');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matricConflictDetected, setMatricConflictDetected] = useState(false);
  const [helpDeskMode, setHelpDeskMode] = useState(false);
  const [helpDeskSubmitted, setHelpDeskSubmitted] = useState(false);
  const [helpDeskTicketId, setHelpDeskTicketId] = useState('');
  const [appealMessage, setAppealMessage] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [paymentRef, setPaymentRef] = useState<string>('');

  const handleProceedToPayment = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMatricConflictDetected(false);

    if (!fullName.trim()) {
      setError('Please provide your Full Legal Name.');
      return;
    }
    if (!matricNumber.trim()) {
      setError('Please enter your FUHSI Matriculation Number.');
      return;
    }
    if (!department) {
      setError('Please select your academic Department.');
      return;
    }
    if (!level) {
      setError('Please select your Academic Level.');
      return;
    }

    // 1. Strict Matriculation Credentials Validation: Year Prefix + Course Abbreviation + Selected Level
    const validation = validateMatricCredentials(matricNumber, department, level);
    if (!validation.isValid) {
      setError(validation.errorMessage || 'Invalid matric number');
      setMatricConflictDetected(false);
      return;
    }

    const cleanMatric = validation.normalizedMatric || normalizeMatricNumber(matricNumber);

    // 2. Strict Database-Level Matric Number Uniqueness
    let allUsers: UserProfile[] = [];
    try {
      const stored = localStorage.getItem('fuhsi_users_db');
      if (stored) allUsers = JSON.parse(stored);
    } catch {
      allUsers = [];
    }

    const uniqueness = checkMatricUniqueness(cleanMatric, userProfile?.nickname, allUsers);
    if (!uniqueness.isUnique) {
      setError('This matriculation number is already associated with an account.');
      setMatricConflictDetected(true);
      return;
    }

    const generatedRef = `FUHSI-STU-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    setPaymentRef(generatedRef);
    setStep('PAYMENT');
  };

  const handleHelpDeskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAppeal(true);

    const ticketId = `HD-${Date.now().toString().slice(-6)}`;
    const inquiry: HelpDeskInquiry = {
      id: `inq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ticketId,
      fullName: fullName.trim() || userProfile?.realName || userProfile?.nickname || 'Guest Student',
      email: email.trim() || userProfile?.studentEmail || `${(userProfile?.nickname || 'guest').replace(/^@/, '')}@fuhsi.edu.ng`,
      nickname: userProfile?.nickname || '',
      matricNumber: matricNumber.trim().toUpperCase(),
      department,
      level,
      category: 'REGISTRATION_APPEAL',
      categoryLabel: 'Matriculation Conflict / Guest Conversion Appeal',
      message: appealMessage.trim() || `I am attempting to convert my Guest account to a Student account with matriculation number ${matricNumber.trim().toUpperCase()}, but the system indicates it is already in use. I am the rightful student owner and request verification.`,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    try {
      const localInquiries: HelpDeskInquiry[] = JSON.parse(localStorage.getItem('fuhsi_helpdesk_db') || '[]');
      localInquiries.unshift(inquiry);
      localStorage.setItem('fuhsi_helpdesk_db', JSON.stringify(localInquiries));
      await saveHelpDeskInquiryToFirestore(inquiry);
    } catch (err) {
      console.warn('Help desk local/firestore fallback:', err);
    }

    setIsSubmittingAppeal(false);
    setHelpDeskTicketId(ticketId);
    setHelpDeskSubmitted(true);
  };

  const handleConfirmPaymentAndSubmit = () => {
    setIsProcessing(true);
    setError(null);

    const ref = `SQUADCO-UQMA9Z-${Math.floor(100000 + Math.random() * 900000)}`;
    setPaymentRef(ref);

    // Redirect user to SquadCo Payment Gateway for Guest to Student Conversion
    try {
      window.open('https://pay.squadco.com/UQMA9Z', '_blank');
    } catch (e) {
      console.error(e);
    }

    setTimeout(() => {
      setIsProcessing(false);
      onSubmitConversion({
        fullName: fullName.trim(),
        matricNumber: matricNumber.trim().toUpperCase(),
        department,
        level,
        email: email.trim(),
        phone: phone.trim(),
        fee: 2000,
        paymentRef: ref,
      });
      setStep('SUCCESS');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 text-white p-5 sm:p-6 shrink-0 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-teal-100 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-300/30 flex items-center justify-center shrink-0">
              <GraduationCap size={26} className="text-teal-200" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-500/30 text-teal-200 border border-teal-400/30">
                Aspirant & Guest Conversion
              </span>
              <h2 className="text-lg sm:text-xl font-black text-white mt-0.5">
                Subscribe to Student Account
              </h2>
            </div>
          </div>
          <p className="text-xs text-teal-100/90 mt-2 font-medium">
            Upgrade from Guest to an official FUHSI Student Account to unlock student forums, departmental hubs, polls, and verified badge eligibility.
          </p>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-start gap-2.5">
              <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Details Form */}
          {step === 'FORM' && (
            <form onSubmit={handleProceedToPayment} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs space-y-1">
                <div className="flex items-center justify-between text-teal-950 font-black">
                  <span>Subscription Fee</span>
                  <span className="text-sm font-black text-emerald-700 font-mono">₦2,000</span>
                </div>
                <p className="text-[11px] text-teal-800 font-medium">
                  One-time student activation & credential validation fee for FUHSI Ila-Orangun aspirants/guests.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User size={13} className="text-teal-700" />
                  <span>Full Legal Name <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Adewale Babatunde Michael"
                  className="w-full text-xs sm:text-sm rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 placeholder:text-slate-400 placeholder:font-normal"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Hash size={13} className="text-teal-700" />
                  <span>Matriculation Number <span className="text-rose-500">*</span></span>
                </label>
                <input
                  type="text"
                  required
                  value={matricNumber}
                  onChange={(e) => setMatricNumber(e.target.value)}
                  placeholder=""
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full text-xs sm:text-sm font-mono uppercase rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 placeholder:text-slate-400 placeholder:font-normal"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Enter your official FUHSI Matriculation or UTME / JAMB admission registration number.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                    <Building2 size={13} className="text-teal-700" />
                    <span>Department <span className="text-rose-500">*</span></span>
                  </label>
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    {FUHSI_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Academic Level <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                  >
                    {LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Student Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. student@fuhsi.edu.ng"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08123456789"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 sm:p-3 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-teal-800 hover:bg-teal-900 text-white rounded-2xl font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Continue to ₦2,000 Subscription Payment</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: Fee Payment Confirmation */}
          {step === 'PAYMENT' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-xs text-slate-500 font-bold uppercase">Application Summary</span>
                  <span className="text-xs font-mono font-bold text-teal-800">{paymentRef}</span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-700">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Applicant:</span>
                    <span className="font-extrabold text-slate-900">{fullName} ({userProfile?.nickname})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Matric Number:</span>
                    <span className="font-mono font-bold text-slate-900">{matricNumber.toUpperCase()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Department:</span>
                    <span className="font-bold text-slate-900">{department} ({level})</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black">
                    <span className="text-slate-900">Total Due:</span>
                    <span className="text-emerald-700 font-mono">₦2,000</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
                <div className="flex items-center justify-between font-black text-emerald-900">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} className="text-emerald-700" />
                    <span>Instant University Student Gateway</span>
                  </div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                    SquadCo Pay
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-emerald-800">
                  Upon clicking confirm below, you will be directed to the SquadCo payment gateway (<strong>https://pay.squadco.com/UQMA9Z</strong>) to process your ₦2,000 subscription payment and submit your application.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  disabled={isProcessing}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Back to Edit
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPaymentAndSubmit}
                  disabled={isProcessing}
                  className="flex-2 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-extrabold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isProcessing ? (
                    <>
                      <Clock size={16} className="animate-spin" />
                      <span>Processing Payment...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Pay ₦2,000 & Submit Application</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Pending Review Notice */}
          {step === 'SUCCESS' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-inner">
                <Clock size={32} />
              </div>

              <div>
                <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300">
                  Application Pending Review
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-2">
                  Student Subscription Under Review
                </h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto mt-2 leading-relaxed">
                  Your application to convert your Guest account to a Student account (Matric: <strong className="font-mono text-slate-900">{matricNumber || userProfile?.matricNumber}</strong>) has been submitted.
                </p>
                {paymentRef && (
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    Reference: <strong className="font-mono text-slate-800">{paymentRef}</strong>
                  </p>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-left space-y-2 text-slate-700">
                <div className="flex items-center gap-2 font-bold text-slate-900">
                  <ShieldCheck size={16} className="text-teal-700" />
                  <span>What happens next?</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-600">
                  <li>Your matriculation credentials will be reviewed by admin.</li>
                  <li>Once approved, your account will switch from Guest to a standard Student account (Unverified).</li>
                  <li><strong>Important:</strong> Conversion does not automatically verify the account. To receive verified benefits (Verification badge, Marketplace, Edit Post, and Upload Video), you must separately click <strong>Get Verified</strong> in Account Settings.</li>
                  <li>If declined, your account will remain a Guest account.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                <a
                  href="https://pay.squadco.com/UQMA9Z"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex-1 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
                >
                  <span>Open SquadCo Pay (₦2,000)</span>
                  <ExternalLink size={14} />
                </a>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto py-3 px-5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-bold text-xs transition-colors cursor-pointer"
                >
                  Understood
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
