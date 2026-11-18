import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'sidebar' | 'compact' | 'icon';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'sidebar' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Sankalpa app"
        title="Install App"
        className={`flex items-center justify-center gap-2 rounded-lg bg-[#4338CA] text-white hover:bg-[#3730A3] dark:bg-[#6366F1] dark:hover:bg-[#4F46E5] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          variant === 'sidebar'
            ? 'w-full px-3.5 py-2.5 text-xs font-semibold'
            : variant === 'icon'
            ? 'w-10 h-10 p-0 text-xs font-semibold'
            : 'px-3 py-1.5 text-xs font-semibold min-h-[40px]'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        {variant !== 'icon' && <span>Install App</span>}
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          aria-label="Install Sankalpa on iOS"
          title="Install on iOS"
          className={`flex items-center justify-center gap-2 rounded-lg border border-[#E5E5E0] dark:border-[#232834] text-[#141413] dark:text-[#F3F4F6] hover:bg-black/5 dark:hover:bg-white/5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            variant === 'sidebar'
              ? 'w-full px-3.5 py-2.5 text-xs font-medium'
              : variant === 'icon'
              ? 'w-10 h-10 p-0 text-xs font-medium'
              : 'px-3 py-1.5 text-xs font-medium min-h-[40px]'
          }`}
        >
          <Share className="w-3.5 h-3.5 shrink-0" />
          {variant !== 'icon' && <span>Install on iOS</span>}
        </button>

        {showGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#13161D] border border-[#E5E5E0] dark:border-[#232834] p-6">
              <div className="flex items-center justify-between">
                <h3 id="ios-install-title" className="font-display text-lg font-semibold text-[#141413] dark:text-[#F3F4F6]">
                  Install Sankalpa on iOS
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close iOS install instructions"
                  className="p-2 rounded-lg text-[#5A5A55] hover:bg-black/5 dark:text-[#9CA3AF] dark:hover:bg-white/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="mt-4 space-y-2.5 text-sm text-[#5A5A55] dark:text-[#9CA3AF]">
                <li>1. Tap the <strong>Share</strong> icon in Safari’s toolbar.</li>
                <li>2. Scroll down and select <strong>Add to Home Screen</strong>.</li>
                <li>3. Launch Sankalpa offline from your home screen.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#141413] dark:bg-[#F3F4F6] text-white dark:text-[#141413] py-2.5 text-sm font-medium cursor-pointer"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
