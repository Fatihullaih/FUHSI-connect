import React from 'react';
import { X, Download, Maximize2 } from 'lucide-react';

interface ImagePreviewModalProps {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  title = 'Image Preview',
  onClose,
}) => {
  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `FUHSI_Connect_Media_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (e) {
      // Fallback
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `FUHSI_Connect_Media_${Date.now()}.jpg`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="w-full max-w-5xl flex items-center justify-between z-10 text-white pb-2">
        <div className="flex items-center gap-2">
          <Maximize2 className="w-5 h-5 text-teal-400" />
          <span className="font-extrabold text-sm sm:text-base text-slate-100">{title}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs shadow-lg transition-all active:scale-95 cursor-pointer"
            title="Save / Download Image to device"
          >
            <Download className="w-4 h-4" />
            <span>Download Image</span>
          </button>

          <button
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer"
            title="Close Preview"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Full Size Image */}
      <div className="flex-1 flex items-center justify-center w-full max-w-5xl overflow-hidden py-2 relative group">
        <img
          src={imageUrl}
          alt="Full size preview"
          className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800/80 select-none"
        />
      </div>

      {/* Bottom Hint */}
      <div className="text-slate-400 text-xs font-medium pt-2 text-center">
        Tap "Download Image" to save to your phone or computer.
      </div>
    </div>
  );
};
