import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  ArrowLeft,
  ShieldCheck, 
  ShieldAlert,
  CheckCircle, 
  Award, 
  Sparkles, 
  Clock, 
  Check, 
  AlertCircle,
  CreditCard,
  Building2,
  Lock,
  ArrowRight,
  UserCheck,
  Building,
  Crown,
  ExternalLink
} from 'lucide-react';
import { UserProfile } from '../types';
import { VerificationBadge } from './VerificationBadge';
import { subscribeVerificationFee } from '../lib/firestoreSync';
import { isGuestAccount } from '../utils/userDbUtils';

interface VerificationModalProps {
  userProfile: UserProfile | null;
  onClose: () => void;
  onSubmitVerification?: (data: {
    accountType: 'Student' | 'Executive' | 'Organization' | 'Guest' | string;
    positionTitle: string;
    matricNumber?: string;
    department?: string;
    level?: string;
    proofDetails?: string;
    paymentRef: string;
    amountPaid: number;
  }) => void;
  embedded?: boolean;
  onBackToSettings?: () => void;
}

export const VerificationModal: React.FC<VerificationModalProps> = ({
  userProfile,
  onClose,
  onSubmitVerification,
  embedded = false,
  onBackToSettings,
}) => {
  // Read dynamic fee set by Admin or default to 1500
  const [feeAmount, setFeeAmount] = useState<number>(() => {
    try {
      const storedFee = localStorage.getItem('fuhsi_verification_fee');
      if (storedFee) {
        const parsed = parseInt(storedFee, 10);
        if (!isNaN(parsed) && parsed >= 0) return parsed;
      }
    } catch {
      // ignore error
    }
    return 1500;
  });

  // Real-time synchronization of Verification Fee across all devices and clients
  useEffect(() => {
    // 1. Subscribe to Firestore settings
    const unsubscribe = subscribeVerificationFee((newFee) => {
      if (typeof newFee === 'number' && !isNaN(newFee) && newFee >= 0) {
        setFeeAmount(newFee);
        try {
          localStorage.setItem('fuhsi_verification_fee', newFee.toString());
        } catch (e) {}
      }
    });

    // 2. Listen to custom window events (cross-component / sync)
    const handleFeeEvent = (e: any) => {
      const fee = e.detail;
      if (typeof fee === 'number' && !isNaN(fee)) {
        setFeeAmount(fee);
      }
    };
    window.addEventListener('fuhsi_verification_fee_updated', handleFeeEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('fuhsi_verification_fee_updated', handleFeeEvent);
    };
  }, []);

  const isGuest = isGuestAccount(userProfile);
  const [accountType, setAccountType] = useState<'Student' | 'Executive' | 'Organization' | 'Guest'>(
    isGuest ? 'Guest' : 'Student'
  );
  const [positionTitle, setPositionTitle] = useState('');

  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);
  const [submittedPaymentRef, setSubmittedPaymentRef] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const isAlreadyVerified = useMemo(() => {
    if (!userProfile?.isVerified) return false;
    return userProfile.verificationStatus === 'approved' || userProfile.verificationStatus === 'verified';
  }, [userProfile]);

  const isPending = useMemo(() => {
    if (isAlreadyVerified) return false;
    if (isSubmittedSuccess) return true;
    if (userProfile?.verificationStatus === 'pending') {
      try {
        const vStr = localStorage.getItem('fuhsi_verifications_db');
        if (vStr && userProfile?.nickname) {
          const vList: any[] = JSON.parse(vStr);
          const cleanNick = (userProfile.nickname || '').toLowerCase().replace(/^@/, '');
          const myRequests = vList.filter(
            (v) =>
              (v.applicantNickname?.toLowerCase().replace(/^@/, '') === cleanNick ||
                v.applicantNickname?.toLowerCase() === userProfile.nickname?.toLowerCase())
          );
          if (myRequests.length > 0) {
            const latest = myRequests[0];
            if (latest.status === 'REVOKED' || latest.status === 'DECLINED' || latest.status === 'REJECTED') {
              return false;
            }
            return latest.status === 'PENDING';
          }
        }
      } catch (e) {}
      return true;
    }
    return false;
  }, [isAlreadyVerified, isSubmittedSuccess, userProfile]);

  const handleSubscribe = () => {
    setErrorMsg('');
    const effAccountType = isGuest ? 'Guest' : accountType;
    const ref = `VERIF-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
    setSubmittedPaymentRef(ref);

    if (onSubmitVerification) {
      onSubmitVerification({
        accountType: effAccountType,
        positionTitle: isGuest ? '' : positionTitle.trim(),
        matricNumber: isGuest ? '' : (userProfile?.matricNumber || 'N/A'),
        department: isGuest ? '' : (userProfile?.department || 'N/A'),
        level: isGuest ? '' : (userProfile?.level || 'N/A'),
        proofDetails: isGuest
          ? 'Guest Verification Application'
          : (positionTitle.trim() ? `Position Held: ${positionTitle.trim()}` : 'Student Verification Application'),
        paymentRef: ref,
        amountPaid: feeAmount,
      });
    }

    setIsSubmittedSuccess(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubscribe();
    try {
      const link = document.createElement('a');
      link.href = 'https://pay.squadco.com/9G4DX4';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.location.href = 'https://pay.squadco.com/9G4DX4';
    }
  };

  return (
    <div className={embedded ? "flex flex-col h-full overflow-hidden bg-white dark:bg-slate-900" : "fixed inset-0 z-50 w-full h-full bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden animate-in fade-in duration-150"}>
      <div className={embedded ? "flex flex-col h-full overflow-hidden" : "w-full h-full max-w-3xl mx-auto bg-white dark:bg-slate-900 flex flex-col shadow-2xl sm:border-x sm:border-slate-200 dark:sm:border-slate-800 overflow-hidden"}>
        
        {/* Top Bar Navigation */}
        <div className={embedded ? "p-4 sm:px-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0 z-10" : "bg-teal-800 dark:bg-slate-950 text-white p-4 sm:px-6 flex items-center justify-between border-b border-teal-900/40 dark:border-slate-800 shrink-0 z-10"}>
          <div className="flex items-center gap-2.5">
            <button
              onClick={embedded ? (onBackToSettings || onClose) : onClose}
              className={embedded ? "p-1.5 -ml-1.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer" : "p-1.5 -ml-1.5 rounded-xl bg-teal-900/60 hover:bg-teal-900 text-teal-100 hover:text-white dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors flex items-center gap-1 font-bold text-xs sm:text-sm cursor-pointer"}
              title={embedded ? "Return to Settings" : "Return to previous page"}
            >
              <ArrowLeft size={18} />
              <span>{embedded ? "Settings" : "Back"}</span>
            </button>
            <div className={embedded ? "h-4 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden sm:block" : "h-4 w-px bg-teal-700/60 dark:bg-slate-800 mx-1 hidden sm:block"} />
            <div className="flex items-center gap-2">
              <div className={embedded ? "w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/40 text-sky-600 dark:text-sky-300 flex items-center justify-center text-sm" : "w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300"}>
                <ShieldCheck className="w-4 h-4" />
              </div>
              <h2 className={embedded ? "font-black text-slate-900 dark:text-slate-100 text-sm sm:text-base" : "font-black text-sm sm:text-base text-white tracking-tight"}>
                Get Verified
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className={embedded ? "p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer" : "p-2 rounded-full bg-teal-900/60 hover:bg-teal-900 text-teal-200 hover:text-white dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 transition-colors cursor-pointer"}
            title="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Main Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">

          {/* Intro Description */}
          <div className="bg-gradient-to-br from-teal-800 via-teal-900 to-emerald-900 dark:from-teal-950 dark:via-slate-900 dark:to-slate-950 text-white rounded-2xl p-4 sm:p-5 shadow-sm space-y-2 border border-teal-700/40 dark:border-teal-800/40">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Get Verified on FUHSI Connect
            </h1>
            <p className="text-xs sm:text-sm text-teal-100 dark:text-slate-300 font-medium leading-relaxed">
              Verification provides additional benefits and helps users access exclusive features on the platform, establishing high trust for students, campus executives, and student organizations.
            </p>
          </div>

          {/* Current Status Banner */}
          {isAlreadyVerified ? (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center gap-3 shadow-xs">
              <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
              <div className="font-extrabold text-sm text-emerald-900 flex items-center gap-2">
                <span>Your Account is Verified</span>
                <VerificationBadge isVerified badgeType={userProfile?.badgeType} title={userProfile?.badgeTitle} showTitle />
              </div>
            </div>
          ) : isPending ? (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <Clock className="w-6 h-6 text-amber-600 shrink-0" />
                <div>
                  <span className="font-extrabold text-sm text-amber-900">Application Pending</span>
                  <p className="text-xs text-amber-800 font-medium mt-0.5">
                    Reference: <strong className="font-mono text-slate-900">{submittedPaymentRef || 'PENDING'}</strong>
                  </p>
                </div>
              </div>
              <a
                href="https://pay.squadco.com/9G4DX4"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-black transition-colors shrink-0 cursor-pointer"
              >
                <span>Payment Page</span>
                <ExternalLink size={13} />
              </a>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200/90 text-slate-800 flex items-center gap-3 shadow-xs">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
              <div className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                <span>Account Not Verified</span>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold uppercase tracking-wider">Unverified</span>
              </div>
            </div>
          )}

          {/* Verification Benefits */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Verification Benefits
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-800 font-bold">
              {(isGuest
                ? [
                    'Verification Checkmark',
                    'Editable Threads',
                    'Higher Trust & Credibility',
                    'Eligibility for Future Features',
                  ]
                : [
                    'Verified Checkmark',
                    'Higher Trust and Credibility',
                    'Editable Thread',
                    'Handle Marketplace',
                    'Priority Support',
                    'Eligibility for Future Premium Features',
                  ]
              ).map((benefit, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-2.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Form & Fee Section (if not yet verified/pending) */}
          {!isAlreadyVerified && !isPending && (
            <form onSubmit={handleFormSubmit} className="pt-3 border-t border-slate-200 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Verification Category (Student accounts only) */}
              {!isGuest && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Verification Category
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => { setAccountType('Student'); }}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        accountType === 'Student' 
                          ? 'bg-sky-50 border-sky-400 text-sky-900 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <UserCheck size={16} className={accountType === 'Student' ? 'text-sky-600' : ''} />
                      <span>Student</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setAccountType('Executive'); }}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        accountType === 'Executive' 
                          ? 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Crown size={16} className={accountType === 'Executive' ? 'text-emerald-600' : ''} />
                      <span>Executive</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => { setAccountType('Organization'); }}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                        accountType === 'Organization' 
                          ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Building size={16} className={accountType === 'Organization' ? 'text-amber-600' : ''} />
                      <span>Organization</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Additional Position (Student accounts only) */}
              {!isGuest && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Additional Position Held (Optional)
                  </label>
                  <input
                    type="text"
                    value={positionTitle}
                    onChange={(e) => setPositionTitle(e.target.value)}
                    placeholder="e.g. Class Representative, Departmental President, SUG Executive, Club President"
                    className="w-full text-xs rounded-xl border border-slate-300 p-2.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    If you hold any leadership or official campus position, enter it here. Otherwise, leave this field empty.
                  </p>
                </div>
              )}

              {/* Verification Fee Display */}
              <div className="bg-sky-50 dark:bg-slate-900 text-slate-900 dark:text-white rounded-2xl p-4 border border-sky-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div>
                  <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider block">
                    Verification Fee
                  </span>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                    ₦{feeAmount.toLocaleString()}
                  </div>
                </div>

                <div className="text-right text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  <Lock size={12} className="text-emerald-500 dark:text-emerald-400" />
                  <span>Secure Payment</span>
                </div>
              </div>

              {/* Subscribe Button */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-extrabold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                
                <a
                  href="https://pay.squadco.com/9G4DX4"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleSubscribe}
                  className="bg-teal-700 hover:bg-teal-800 text-white px-6 py-3 rounded-full text-xs font-black transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
                >
                  <CreditCard size={16} />
                  <span>Subscribe</span>
                  <ArrowRight size={14} />
                </a>
              </div>
            </form>
          )}

          {(isAlreadyVerified || isPending) && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={embedded && onBackToSettings ? onBackToSettings : onClose}
                className="bg-teal-800 hover:bg-teal-900 dark:bg-slate-800 dark:hover:bg-slate-700 text-white px-6 py-2.5 rounded-full text-xs font-black transition-colors cursor-pointer"
              >
                {embedded ? 'Back to Settings' : 'Close Window'}
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
