import React from 'react';

interface TextToCadIconProps {
  className?: string;
}

/**
 * Text to CAD: written lines beside a ring.
 *
 * Drawn as plain strokes in a single `currentColor`, matching PeopleIcon and
 * RingIcon. The illustrated version this replaced carried three colour tiers
 * and about a hundred paths, which read as a blob at chip size and did not
 * belong beside the other two marks.
 *
 * Shares its ring with [[ImageToCadIcon]] so the CAD pair reads as a family.
 */
export const TextToCadIcon: React.FC<TextToCadIconProps> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {/* Written lines */}
    <path d="M2.75 8.5h7" />
    <path d="M2.75 12.5h5.5" />
    <path d="M2.75 16.5h4" />
    {/* Ring */}
    <circle cx="17" cy="15.5" r="4.5" />
    <path d="M17 5.5l3 3-3 3-3-3z" />
  </svg>
);
