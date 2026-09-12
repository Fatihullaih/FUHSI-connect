import React, { useState } from 'react';
import { MarketplaceItem } from '../types';
import { Sparkles, CheckCircle2, ShoppingBag, CreditCard, Flame, X } from 'lucide-react';

interface FeaturedBoostModalProps {
  item: MarketplaceItem | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirmBoost: (itemId: string, days: number, price: number) => void;
}

export const FeaturedBoostModal: React.FC<FeaturedBoostModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirmBoost
}) => {
  const [selectedPlan, setSelectedPlan] = useState<{ days: number; price: number }>({ days: 7, price: 500 });
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !item) return null;

  const handleBoost = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onConfirmBoost(item.id, selectedPlan.days, selectedPlan.price);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200">
        
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-2 text-slate-300 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-amber-400 text-amber-950 flex items-center justify-center font-black shadow-md">
              <Sparkles size={22} className="fill-amber-950" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Boost Marketplace Listing</h2>
              <p className="text-xs text-teal-200">Featured Listing Promotion</p>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Target Item Summary */}
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
            {item.imageUrls && item.imageUrls[0] && (
              <img src={item.imageUrls[0]} alt={item.title} className="w-14 h-14 rounded-xl object-cover border border-slate-200" />
            )}
            <div>
              <span className="font-extrabold text-slate-900 text-xs block line-clamp-1">{item.title}</span>
              <span className="text-[11px] font-bold text-teal-800">Asking Price: ₦{item.askingPrice.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 block">{item.category}</span>
            </div>
          </div>

          {/* Value Props */}
          <div className="space-y-2 text-xs">
            <span className="font-bold text-slate-800 block">Why Boost Your Listing?</span>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <div className="flex items-center gap-2 text-teal-900 font-semibold">
                <Flame size={14} className="text-amber-500" /> Pinned at the very top of Campus Marketplace
              </div>
              <div className="flex items-center gap-2 text-teal-900 font-semibold">
                <Sparkles size={14} className="text-teal-600" /> Eye-catching "🔥 Featured" gold badge
              </div>
              <div className="flex items-center gap-2 text-teal-900 font-semibold">
                <CheckCircle2 size={14} className="text-emerald-600" /> Up to 4x faster buyer DM inquiry intents
              </div>
            </div>
          </div>

          {/* Boost Duration Options */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 block">Select Boost Package:</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPlan({ days: 3, price: 300 })}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  selectedPlan.days === 3
                    ? 'bg-teal-50 border-teal-600 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-black text-slate-900 block">3 Days Boost</span>
                <span className="text-sm font-extrabold text-teal-800">₦300</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPlan({ days: 7, price: 500 })}
                className={`p-3.5 rounded-2xl border text-left transition-all relative cursor-pointer ${
                  selectedPlan.days === 7
                    ? 'bg-amber-50 border-amber-500 shadow-xs'
                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="absolute -top-2 right-2 text-[9px] font-black bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full border border-amber-500 shadow-2xs">
                  BEST VALUE
                </span>
                <span className="text-xs font-black text-slate-900 block">7 Days Boost</span>
                <span className="text-sm font-extrabold text-amber-900">₦500</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleBoost}
            disabled={isProcessing}
            className="w-full py-3.5 bg-gradient-to-r from-teal-700 to-amber-600 text-white font-extrabold rounded-2xl shadow-md hover:from-teal-800 hover:to-amber-700 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <span>Boosting Listing...</span>
            ) : (
              <>
                <CreditCard size={18} />
                <span>Pay ₦{selectedPlan.price} & Boost Listing</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
