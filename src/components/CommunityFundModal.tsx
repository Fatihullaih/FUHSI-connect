import React, { useState } from 'react';
import { INITIAL_COMMUNITY_FUND } from '../data/initialData';
import { 
  Heart, 
  ShieldCheck, 
  Server, 
  Code2, 
  Award, 
  AlertCircle, 
  CheckCircle2, 
  DollarSign, 
  Sparkles, 
  X,
  Megaphone,
  ShoppingBag,
  CreditCard,
  PieChart,
  Lock
} from 'lucide-react';

interface CommunityFundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDonateSuccess?: (amount: number) => void;
}

export const CommunityFundModal: React.FC<CommunityFundModalProps> = ({
  isOpen,
  onClose,
  onDonateSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'transparency' | 'donate' | 'revenue_model'>('transparency');
  const [donateAmount, setDonateAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [donationDone, setDonationDone] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleDonationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setDonationDone(true);
      if (onDonateSuccess) {
        onDonateSuccess(donateAmount);
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-300 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-md">
              <Heart className="fill-amber-950" size={22} />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">FUHSI Community Fund</h2>
              <p className="text-xs text-teal-200">Transparent Financial Breakdown & Sustainable Campus Platform</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 mt-5 bg-black/20 p-1.5 rounded-xl border border-white/10 text-xs font-bold">
            <button
              onClick={() => { setActiveTab('transparency'); setDonationDone(false); }}
              className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'transparency' ? 'bg-white text-teal-950 shadow-sm' : 'text-slate-200 hover:text-white'
              }`}
            >
              <PieChart size={14} />
              <span>Monthly Allocation (100% Public)</span>
            </button>

            <button
              onClick={() => { setActiveTab('donate'); setDonationDone(false); }}
              className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'donate' ? 'bg-amber-400 text-amber-950 shadow-sm' : 'text-slate-200 hover:text-white'
              }`}
            >
              <Heart size={14} className="fill-current" />
              <span>❤️ Voluntary Donation</span>
            </button>

            <button
              onClick={() => { setActiveTab('revenue_model'); setDonationDone(false); }}
              className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'revenue_model' ? 'bg-white text-teal-950 shadow-sm' : 'text-slate-200 hover:text-white'
              }`}
            >
              <DollarSign size={14} />
              <span>Monetization Model</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* TAB 1: TRANSPARENCY REPORT */}
          {activeTab === 'transparency' && (
            <div className="space-y-6">
              {/* Financial Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Fund Raised</span>
                  <span className="text-lg font-black text-teal-800">₦{INITIAL_COMMUNITY_FUND.totalFundRaised.toLocaleString()}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Current Month Balance</span>
                  <span className="text-lg font-black text-purple-800">₦{INITIAL_COMMUNITY_FUND.currentMonthBalance.toLocaleString()}</span>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Active Student Donors</span>
                  <span className="text-lg font-black text-amber-600">{INITIAL_COMMUNITY_FUND.activeDonorsCount} Supporters</span>
                </div>
              </div>

              {/* Allocation Breakdown Bar & Formula */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-teal-600" />
                    <span>Transparent Fund Allocation Breakdown</span>
                  </h3>
                  <span className="text-[11px] font-bold text-teal-800 bg-teal-100 px-2.5 py-0.5 rounded-full">
                    {INITIAL_COMMUNITY_FUND.lastAuditDate}
                  </span>
                </div>

                {/* Visual Multi-color Progress Bar */}
                <div className="h-4 w-full rounded-full bg-slate-200 overflow-hidden flex border border-slate-300 shadow-inner">
                  <div className="bg-teal-600 h-full" style={{ width: '40%' }} title="40% App Maintenance" />
                  <div className="bg-purple-600 h-full" style={{ width: '30%' }} title="30% Feature Dev" />
                  <div className="bg-amber-500 h-full" style={{ width: '20%' }} title="20% Campus Activities" />
                  <div className="bg-rose-500 h-full" style={{ width: '10%' }} title="10% Emergency Reserve" />
                </div>

                {/* Legend Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-1.5 font-extrabold text-teal-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-600 shrink-0" />
                      <span>40% Servers</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Hosting, database, notifications & SSL</p>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-1.5 font-extrabold text-purple-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600 shrink-0" />
                      <span>30% Feature Dev</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">New tools, audio notes & search updates</p>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-1.5 font-extrabold text-amber-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span>20% Activities</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Quiz competitions & study data grants</p>
                  </div>

                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <div className="flex items-center gap-1.5 font-extrabold text-rose-800">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      <span>10% Reserve</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">Emergency capacity buffer & backups</p>
                  </div>
                </div>
              </div>

              {/* Recent Audited Expenditures List */}
              <div className="space-y-2">
                <h4 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider text-slate-400">
                  Recent Monthly Expenditures Log (Audited)
                </h4>
                <div className="space-y-2">
                  {INITIAL_COMMUNITY_FUND.recentExpenditures.map((exp) => (
                    <div key={exp.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">{exp.description}</span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                          <span className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                            {exp.category}
                          </span>
                          <span>{exp.date}</span>
                        </div>
                      </div>
                      <span className="font-black text-slate-900 font-mono">
                        -₦{exp.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VOLUNTARY DONATION */}
          {activeTab === 'donate' && (
            <div>
              {donationDone ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-300">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900">Thank You for Supporting FUHSI! ❤️</h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    Your voluntary contribution of <span className="font-bold text-teal-800">₦{donateAmount.toLocaleString()}</span> directly keeps FUHSI Connect free, fast, and secure for all students across campus!
                  </p>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 w-fit mx-auto flex items-center gap-2">
                    <Sparkles size={16} className="text-amber-600" />
                    <span>Unlocked Badge: ❤️ FUHSI Community Patron</span>
                  </div>
                  <button
                    onClick={() => setDonationDone(false)}
                    className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
                  >
                    Back to Fund Hub
                  </button>
                </div>
              ) : (
                <form onSubmit={handleDonationSubmit} className="space-y-5">
                  <div className="p-4 bg-teal-50 border border-teal-200 rounded-2xl space-y-1">
                    <h3 className="font-bold text-teal-950 text-sm flex items-center gap-1.5">
                      <Heart size={16} className="text-teal-700 fill-teal-700" />
                      <span>Voluntary Student & Alumni Contributions</span>
                    </h3>
                    <p className="text-xs text-teal-800 leading-relaxed">
                      FUHSI Connect is 100% student-centered. Every donation goes straight to server hosting, data quiz awards, and continuous feature updates.
                    </p>
                  </div>

                  {/* Preset Amount Grid */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 block">Select Donation Amount (₦):</label>
                    <div className="grid grid-cols-4 gap-2">
                      {[200, 500, 1000, 2500].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => { setDonateAmount(amt); setCustomAmount(''); }}
                          className={`py-3 px-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                            donateAmount === amt && !customAmount
                              ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs scale-102'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          ₦{amt.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 block">Or Custom Amount (₦):</label>
                    <input
                      type="number"
                      placeholder="e.g. 1500"
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        if (e.target.value) setDonateAmount(Number(e.target.value));
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-teal-600"
                    />
                  </div>

                  {/* Simulated Payment Gateway Selection */}
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <span className="font-bold text-slate-700 block">Select Preferred Payment Method:</span>
                    <div className="grid grid-cols-3 gap-2 text-slate-700">
                      <div className="p-2 rounded-lg bg-white border border-teal-600 text-teal-800 font-bold text-center flex items-center justify-center gap-1">
                        <CreditCard size={14} /> Card / USSD
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium text-center">
                        Bank Transfer
                      </div>
                      <div className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 font-medium text-center">
                        OPay / PalmPay
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-3.5 bg-gradient-to-r from-teal-700 to-amber-600 text-white font-extrabold rounded-2xl shadow-md hover:from-teal-800 hover:to-amber-700 transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <span>Processing Secure Transfer...</span>
                    ) : (
                      <>
                        <Heart size={18} className="fill-current" />
                        <span>Confirm ₦{donateAmount.toLocaleString()} Voluntary Contribution</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: ETHICAL MONETIZATION MODEL */}
          {activeTab === 'revenue_model' && (
            <div className="space-y-4">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-1">
                <p className="font-extrabold flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  <span>Our 4 Sustainable Revenue Pillars (No Student Exploitation)</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  FUHSI Connect avoids intrusive popups or aggressive paywalls. The core student experience remains 100% free!
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Pillar 1 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                      <Award size={16} className="text-amber-500" /> 1. Verification Review Fee
                    </span>
                    <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded text-[10px]">
                      ₦1,500 One-Time
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    When a student reaches 3,000+ reputation points, they may apply for official verification. The ₦1,500 fee covers human identity verification & manual admin review.
                  </p>
                </div>

                {/* Pillar 2 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                      <ShoppingBag size={16} className="text-teal-600" /> 2. Featured Marketplace
                    </span>
                    <span className="font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded text-[10px]">
                      ₦300–₦500 / 7 Days
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Listing items is 100% free. Student sellers can optionally pay ₦500 to pin their medical equipment, textbooks, or hostel gadgets at the top of the marketplace.
                  </p>
                </div>

                {/* Pillar 3 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                      <Megaphone size={16} className="text-purple-600" /> 3. Campus Business Ads
                    </span>
                    <span className="font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded text-[10px]">
                      Sponsored Business
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Campus vendors (cafeterias, barbers, print hubs, tutors) can post clearly labeled "Sponsored" announcements to promote services to students.
                  </p>
                </div>

                {/* Pillar 4 */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                      <Heart size={16} className="text-rose-500 fill-rose-500" /> 4. Community Donations
                    </span>
                    <span className="font-bold text-rose-800 bg-rose-100 px-2 py-0.5 rounded text-[10px]">
                      Voluntary
                    </span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    Voluntary contributions from generous students and alumni to maintain cloud servers and fund student quiz data awards.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <Lock size={12} /> Encrypted & Audited Monthly
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
