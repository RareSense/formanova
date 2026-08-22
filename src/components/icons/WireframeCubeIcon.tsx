import React from 'react';

interface WireframeCubeIconProps {
  className?: string;
}

/**
 * Isometric wireframe box, used as a quiet marker beside CAD file-format text.
 *
 * Deliberately generic rather than McNeel's Rhino mark: the logo is a
 * trademark we have no licence to ship, and a plain wireframe reads the same
 * at 12px while matching the geometric line icons used elsewhere.
 */
export const WireframeCubeIcon: React.FC<WireframeCubeIconProps> = ({ className = 'h-4 w-4' }) => {
  return (
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
      <path d="M12 2 21 7l-9 5-9-5 9-5Z" />
      <path d="M3 7v10l9 5 9-5V7" />
      <path d="M12 12v10" />
    </svg>
  );
};
