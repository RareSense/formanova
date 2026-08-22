import React from 'react';

interface ImageToCadIconProps {
  className?: string;
}

/**
 * Image to CAD: a reference picture beside a ring.
 *
 * Same construction as [[TextToCadIcon]] and the same shared ring, so the two
 * CAD marks read as a pair. Plain strokes in a single `currentColor` to match
 * PeopleIcon and RingIcon.
 */
export const ImageToCadIcon: React.FC<ImageToCadIconProps> = ({ className = 'h-5 w-5' }) => (
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
    {/* Reference picture */}
    <rect x="2.5" y="8" width="8.5" height="8.5" rx="1.25" />
    <circle cx="5.4" cy="10.9" r="0.9" />
    <path d="M3 14.75l2.3-2.1 1.7 1.5 1.6-1.9 2.4 2.6" />
    {/* Ring */}
    <circle cx="17" cy="15.5" r="4.5" />
    <path d="M17 5.5l3 3-3 3-3-3z" />
  </svg>
);
