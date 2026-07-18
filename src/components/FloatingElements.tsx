import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface FloatingElementsProps {
  className?: string;
}

export function FloatingElements({ className }: FloatingElementsProps) {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    let rafId: number | undefined;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        rafId = undefined;
      });
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className={cn("fixed inset-0 pointer-events-none overflow-hidden z-0", className)}>
      {/* Large gradient orb - moves slowly */}
      <div 
        className="absolute w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl"
        style={{
          top: '10%',
          right: '-10%',
          transform: `translateY(${scrollY * 0.1}px)`,
        }}
      />
      
      {/* Secondary orb - moves medium speed */}
      <div 
        className="absolute w-[400px] h-[400px] rounded-full bg-accent/5 blur-3xl"
        style={{
          bottom: '20%',
          left: '-5%',
          transform: `translateY(${-scrollY * 0.15}px)`,
        }}
      />
      
      {/* Geometric shapes */}
      <div 
        className="absolute w-24 h-24 border border-border/10 rotate-45"
        style={{
          top: '30%',
          right: '15%',
          transform: `translateY(${scrollY * 0.3}px) rotate(${45 + scrollY * 0.02}deg)`,
        }}
      />
      
      <div 
        className="absolute w-16 h-16 border border-primary/10 rounded-full"
        style={{
          top: '60%',
          left: '10%',
          transform: `translateY(${-scrollY * 0.25}px) scale(${1 + scrollY * 0.0002})`,
        }}
      />

      {/* Floating lines */}
      <div 
        className="absolute w-px h-32 bg-gradient-to-b from-transparent via-border/20 to-transparent"
        style={{
          top: '40%',
          left: '25%',
          transform: `translateY(${scrollY * 0.4}px)`,
        }}
      />
      
      <div 
        className="absolute w-32 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
        style={{
          top: '70%',
          right: '20%',
          transform: `translateX(${-scrollY * 0.2}px)`,
        }}
      />
    </div>
  );
}
