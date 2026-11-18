import React from 'react';

interface BrandLogoProps {
  compact?: boolean;
  iconOnly?: boolean;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ compact = false, iconOnly = false }) => {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg
        width={compact ? 26 : 30}
        height={compact ? 26 : 30}
        viewBox="0 0 512 512"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="512" height="512" rx="112" className="fill-[#141413] dark:fill-[#1F2430]" />
        <path
          d="M256 98L382 332H130L256 98Z"
          stroke="#F7F7F5"
          strokeWidth="28"
          strokeLinejoin="round"
        />
        <path
          d="M256 174L322 296H190L256 174Z"
          fill="#6366F1"
          fillOpacity="0.3"
          stroke="#818CF8"
          strokeWidth="16"
          strokeLinejoin="round"
        />
        <line
          x1="108"
          y1="382"
          x2="404"
          y2="382"
          stroke="#F59E0B"
          strokeWidth="24"
          strokeLinecap="round"
        />
        <circle cx="256" cy="98" r="18" fill="#F59E0B" />
      </svg>
      {!iconOnly && (
        <span className="font-display text-lg font-bold tracking-tight text-[#141413] dark:text-[#F3F4F6] whitespace-nowrap shrink-0">
          Sankalpa
        </span>
      )}
    </div>
  );
};
