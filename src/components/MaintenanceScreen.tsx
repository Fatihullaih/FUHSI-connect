import React, { useEffect, useState } from 'react';
import { RefreshCw, Wrench } from 'lucide-react';
import fuhsiLogo from '../assets/images/fuhsi_logo_1785485694958.jpg';
import { initTheme } from '../utils/themeUtils';
import { MAINTENANCE_MESSAGE, MAINTENANCE_TITLE } from '../config/maintenance';

export const MaintenanceScreen: React.FC = () => {
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    const cleanup = initTheme();
    return cleanup;
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between px-4 py-8 sm:px-8 sm:py-12">
      <div className="flex-1 flex items-center justify-center">
        <section
          aria-labelledby="maintenance-heading"
          className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm p-6 sm:p-10 text-center space-y-6"
        >
          <div className="flex justify-center">
            {!logoError ? (
              <div className="w-20 h-20 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-teal-800 flex items-center justify-center">
                <img
                  src={fuhsiLogo}
                  alt="FUHSI Connect"
                  referrerPolicy="no-referrer"
                  onError={() => setLogoError(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl border border-slate-200 dark:border-slate-700 bg-teal-800 text-white flex items-center justify-center">
                <Wrench className="w-8 h-8" aria-hidden="true" />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-teal-700 dark:text-teal-400 tracking-wide">
              FUHSI Connect <span aria-hidden="true">·</span> Campus Notice
            </p>
            <h1
              id="maintenance-heading"
              className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight text-balance"
            >
              {MAINTENANCE_TITLE}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto">
              {MAINTENANCE_MESSAGE}
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-5">
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Your account details, posts, and messages remain safely preserved until service resumes.
            </p>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleRefresh}
                className="min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-teal-800 hover:bg-teal-900 active:scale-[0.98] text-white text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Check Back Again</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="pt-8 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          FUHSI Connect – Student Campus App <span aria-hidden="true">·</span>{' '}
          <span className="italic">Powered by Al-Faatihy</span>
        </p>
      </footer>
    </div>
  );
};
