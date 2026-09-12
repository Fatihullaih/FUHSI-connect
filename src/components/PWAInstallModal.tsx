import React from 'react';
import { Smartphone, Download, Share, PlusSquare, X, CheckCircle2, ShieldCheck } from 'lucide-react';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<PWAInstallModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2 text-teal-800">
            <Smartphone size={22} className="text-teal-600" />
            <h3 className="font-extrabold text-slate-900 text-base">Install FUHSI Connect App</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <p className="text-xs text-slate-600 mb-4 leading-relaxed">
          Install FUHSI Connect on your Android or iPhone home screen. Works instantly like WhatsApp Web or Xender without Play Store or App Store downloads!
        </p>

        {/* Android Instructions */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-3">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-2">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">🤖</span>
            <span>Android (Chrome or Brave)</span>
          </div>
          <ol className="text-xs text-slate-600 space-y-1.5 pl-6 list-decimal font-medium">
            <li>Tap the <strong>3 dots (⋮)</strong> menu in the top-right corner of your browser.</li>
            <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
            <li>Tap <strong>Install</strong> to add FUHSI Connect to your app drawer.</li>
          </ol>
        </div>

        {/* iPhone / iOS Instructions */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 mb-4">
          <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px]">🍏</span>
            <span>iPhone / iPad (Safari Browser)</span>
          </div>
          <ol className="text-xs text-slate-600 space-y-1.5 pl-6 list-decimal font-medium">
            <li>Tap the <strong>Share button</strong> <Share size={12} className="inline text-blue-600" /> at the bottom of Safari.</li>
            <li>Scroll down and tap <strong>"Add to Home Screen"</strong> <PlusSquare size={12} className="inline text-slate-700" />.</li>
            <li>Tap <strong>Add</strong> in the top-right corner.</li>
          </ol>
        </div>

        <div className="flex items-center gap-2 bg-teal-50 p-3 rounded-xl border border-teal-200/80 text-xs text-teal-900 font-medium mb-4">
          <ShieldCheck size={18} className="text-teal-700 shrink-0" />
          <span>Exclusive student network for Federal University of Health Sciences, Ila-Orangun.</span>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs py-2.5 rounded-xl transition-colors"
        >
          Got It, Thanks!
        </button>
      </div>
    </div>
  );
};
