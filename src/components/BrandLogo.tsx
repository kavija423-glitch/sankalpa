import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  iconOnly?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, iconOnly = false }) => {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <img
        src="/assets/aistudio/image_9d796e30.png"
        alt={iconOnly ? 'Sankalpa' : ''}
        aria-hidden={!iconOnly}
        width={compact ? 28 : 32}
        height={compact ? 28 : 32}
        className={`${
          compact ? 'w-7 h-7 rounded-[7px]' : 'w-8 h-8 rounded-lg'
        } object-cover shrink-0 shadow-xs ring-1 ring-black/10 dark:ring-white/10`}
      />
      {!iconOnly && (
        <span className="font-display text-lg font-bold tracking-tight text-[#0F172A] dark:text-[#F1F5F9] whitespace-nowrap shrink-0">
          Sankalpa
        </span>
      )}
    </div>
  );
};
