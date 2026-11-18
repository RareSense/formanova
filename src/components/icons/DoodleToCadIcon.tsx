import React from 'react';

interface DoodleToCadIconProps {
  className?: string;
}

/**
 * Doodle to CAD: a pen feeding a ring.
 *
 * TextToCadIcon with its written lines replaced by a pen: the same 200 x 128
 * box, the same RingIcon artwork translated right by 72, and the pen drawn at
 * the same 3.5-unit stroke so all three CAD marks carry one line weight.
 */
export const DoodleToCadIcon: React.FC<DoodleToCadIconProps> = ({ className = 'h-5 w-5' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 128"
    fill="currentColor"
    className={className}
    aria-hidden="true"
    focusable="false"
  >
    {/* Pen: body, collar line, nib */}
    <g fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M48.8 33L59.2 39L29.2 91L15 104L18.8 85Z" />
      <path d="M44.6 40.3L55 46.3" />
      <path d="M18.8 85L29.2 91" />
    </g>
    {/* Ring, from RingIcon */}
    <g transform="translate(72 0)">
      <path d="M70.086,33.487,87.57,15.53A1.81,1.81,0,0,0,87.7,13.2L77.7.659A1.807,1.807,0,0,0,76.333,0H51.667A1.807,1.807,0,0,0,50.3.659L40.3,13.2a1.81,1.81,0,0,0,.131,2.329L57.914,33.487a47.458,47.458,0,1,0,12.173,0ZM51.8,4.385l8.021,8.157H45.3Zm30.9,8.157H68.175L76.2,4.385Zm-14.034,3.5L64,29.493,59.334,16.042Zm3.7,0h9.817L66.938,31.7ZM64,11.8,55.842,3.5H72.158Zm-8.37,4.246L61.062,31.7,45.813,16.042ZM64,124.5a43.958,43.958,0,1,1,43.958-43.958A44.008,44.008,0,0,1,64,124.5Z" />
      <path d="M64,40.822a39.719,39.719,0,1,0,39.72,39.72A39.765,39.765,0,0,0,64,40.822Zm0,75.938a36.219,36.219,0,1,1,36.22-36.219A36.26,36.26,0,0,1,64,116.761Z" />
    </g>
  </svg>
);
