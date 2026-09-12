import React, { useState } from 'react';
import { UserProfile } from '../types';
import { Award, CheckCircle2, AlertCircle, ShieldCheck, CreditCard, Lock, X } from 'lucide-react';

interface VerificationApplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onSubmitApplication: (reqData: { realName: string; matricNumber: string; statement: string }) => void;
}

export const VerificationApplyModal: React.FC<VerificationApplyModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onSubmitApplication
}) => {
  const [realName, setRealName] = useState(userProfile?.realNameHidden || '');
  const [matricNumber, setMatricNumber] = useState(userProfile?.matricNumber || '');
  const [statement, setStatement] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const repScore = userProfile?.reputationScore || 2450;
  const isEligibleScore = repScore >= 3000;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim()) return;

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setSubmitted(true);
      onSubmitApplication({ realName, matricNumber, statement });
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-900 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-200 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-md">
              <Award className="fill-amber-950" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Official Verification Application</h2>
              <p className="text-xs text-amber-200">FUHSI Student Identity & Honor Review</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-300">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Application Submitted!</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Your verification review fee of <span className="font-bold text-slate-900">₦1,500</span> was confirmed. Your application is now queued for evaluation by the FUHSI Verification Board.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 w-fit mx-auto">
                Status: 🔔 Pending Credential Evaluation
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Close & Return
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Important Fee Disclaimer */}
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-1">
                <p className="font-bold flex items-center gap-1 text-sm">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Verification Application Fee: ₦1,500</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  ⚠️ <span className="font-extrabold">Notice:</span> The ₦1,500 fee covers the manual identity & academic credential review process—it is <span className="underline">not</span> buying a badge. If an account does not satisfy guidelines or is found submitting falsified details, the application cannot be approved.
                </p>
              </div>

              {/* Qualification Checklist */}
              <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-800 block">Verification Requirements Checklist:</span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className={`flex items-center gap-1.5 font-medium ${isEligibleScore ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                    <CheckCircle2 size={13} /> 3,000+ Rep Points ({repScore}/3,000)
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle2 size={13} /> Account Age &gt; 60 Days
                  </div>
                  <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                    <CheckCircle2 size={13} /> 0 Active Violations
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                    <Lock size={13} /> Credential Clearance
                  </div>
                </div>
              </div>

              {/* Input Fields */}
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Legal Name (Strictly Encrypted & Hidden):</label>
                  <input
                    type="text"
                    required
                    value={realName}
                    onChange={(e) => setRealName(e.target.value)}
                    placeholder="e.g. Adeyemo Oluwaseun Joseph"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">FUHSI Matriculation Number:</label>
                  <input
                    type="text"
                    required
                    value={matricNumber}
                    onChange={(e) => setMatricNumber(e.target.value)}
                    placeholder="Enter Matric Number"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-amber-600 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Statement of Academic & Campus Contributions:</label>
                  <textarea
                    required
                    rows={3}
                    value={statement}
                    onChange={(e) => setStatement(e.target.value)}
                    placeholder="Briefly state your academic resources shared, class roles, or study contributions to FUHSI..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-amber-600"
                  />
                </div>
              </div>

              {/* Payment Row */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-700" />
                  <span className="font-extrabold text-amber-950">Review Processing Fee</span>
                </div>
                <span className="font-black text-amber-900 text-sm">₦1,500</span>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-800 text-white font-extrabold rounded-2xl shadow-md hover:from-amber-700 hover:to-amber-900 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <span>Processing Application & Fee...</span>
                ) : (
                  <>
                    <Award size={18} />
                    <span>Pay ₦1,500 & Submit for Credential Review</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
