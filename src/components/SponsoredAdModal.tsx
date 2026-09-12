import React, { useState } from 'react';
import { Post } from '../types';
import { Megaphone, Sparkles, CheckCircle2, CreditCard, Lock, X } from 'lucide-react';

interface SponsoredAdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSponsoredPost: (newPost: Partial<Post>) => void;
}

export const SponsoredAdModal: React.FC<SponsoredAdModalProps> = ({
  isOpen,
  onClose,
  onAddSponsoredPost
}) => {
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('Cafeteria & Food');
  const [adContent, setAdContent] = useState('');
  const [whatsappLink, setWhatsappLink] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName || !adContent) return;

    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setSubmitted(true);
      onAddSponsoredPost({
        id: `post_sp_${Date.now()}`,
        authorNickname: `@${businessName.replace(/\s+/g, '_')}`,
        authorBadgeType: 'PURPLE',
        authorBadgeTitle: 'Campus Business',
        authorAvatarKey: 'pill',
        department: 'Services & Businesses',
        content: `⚡ SPONSORED: ${adContent}`,
        timestamp: 'Sponsored',
        likesCount: 12,
        commentsCount: 2,
        isLikedByMe: false,
        isBookmarkedByMe: false,
        isGhostMode: false,
        isSponsored: true,
        sponsorName: businessName,
        sponsorActionUrl: whatsappLink || 'https://wa.me/2348000000000',
        isFlagged: false
      });
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-purple-800 via-purple-900 to-slate-900 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-300 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-md">
              <Megaphone size={22} className="fill-amber-950" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Post Sponsored Business Ad</h2>
              <p className="text-xs text-purple-200">Promote Cafeterias, Barbers, Tutors & Printing</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4">
          {submitted ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-300">
                <CheckCircle2 size={36} />
              </div>
              <h3 className="text-xl font-black text-slate-900">Sponsored Ad Live!</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                Your sponsored business post for <span className="font-bold text-purple-900">{businessName}</span> is now published and clearly marked with a <span className="font-bold text-amber-800">📢 Sponsored</span> badge in student feeds!
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                Close & View Feed
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950 space-y-1">
                <p className="font-bold flex items-center gap-1 text-sm">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span>Reach 2,500+ FUHSI Students Directly</span>
                </p>
                <p className="text-[11px] leading-relaxed">
                  Ads are placed natively in student feeds, labeled transparently as Sponsored.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Campus Business Name:</label>
                <input
                  type="text"
                  required
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. MedChef Cafeteria, Ila Campus Barber & Spa"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-purple-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Business Category:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-purple-600"
                >
                  <option value="Cafeteria & Food">Cafeteria & Food</option>
                  <option value="Barbers & Hairdressers">Barbers & Hairdressers</option>
                  <option value="Photocopying & Printing">Photocopying & Printing</option>
                  <option value="Academic Tutors">Academic Tutors & Coaching</option>
                  <option value="POS & Laundry Services">POS & Laundry Services</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Promotional Offer Details:</label>
                <textarea
                  required
                  rows={3}
                  value={adContent}
                  onChange={(e) => setAdContent(e.target.value)}
                  placeholder="Describe your offer, pricing, location and student discount details..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:border-purple-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">WhatsApp / Contact Phone Number:</label>
                <input
                  type="tel"
                  value={whatsappLink}
                  onChange={(e) => setWhatsappLink(e.target.value)}
                  placeholder="e.g. 08031234567"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:border-purple-600"
                />
              </div>

              {/* Fee Bar */}
              <div className="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between text-xs">
                <span className="font-extrabold text-purple-950">Single Sponsored Post Fee</span>
                <span className="font-black text-purple-900 text-sm">₦1,000</span>
              </div>

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-3.5 bg-gradient-to-r from-purple-700 to-slate-900 text-white font-extrabold rounded-2xl shadow-md hover:from-purple-800 hover:to-black transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <span>Publishing Sponsored Ad...</span>
                ) : (
                  <>
                    <CreditCard size={18} />
                    <span>Pay ₦1,000 & Publish Sponsored Ad</span>
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
