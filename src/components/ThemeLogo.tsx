import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import logoBlack from '@/assets/formanova-logo-black-tagline.png';
import logoWhite from '@/assets/formanova-logo-white-tagline.png';
import logoPlainBlack from '@/assets/formanova-logo-black.webp';
import logoPlainWhite from '@/assets/formanova-logo-white.webp';

const DARK_THEMES = new Set(['dark', 'cyberpunk', 'retro', 'fashion', 'luxury', 'synthwave', 'neon']);

interface ThemeLogoProps {
  className?: string;
  width?: number;
  height?: number;
  /** 'plain' renders the wordmark without the tagline. */
  variant?: 'tagline' | 'plain';
}

export function ThemeLogo({ className, width = 234, height = 56, variant = 'tagline' }: ThemeLogoProps) {
  const { theme } = useTheme();
  const isDark = DARK_THEMES.has(theme);
  const src = variant === 'plain'
    ? (isDark ? logoPlainWhite : logoPlainBlack)
    : (isDark ? logoWhite : logoBlack);

  return (
    <img
      src={src}
      alt="FormaNova"
      className={cn('w-auto object-contain', className)}
      width={width}
      height={height}
    />
  );
}
