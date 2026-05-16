import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui/button';
import { Menu, X, LogIn, LogOut, User, Image, BadgeCheck, ScanEye, Gem, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCredits } from '@/contexts/CreditsContext';
import { useGenerations } from '@/contexts/GenerationsContext';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeLogo } from '@/components/ThemeLogo';
import creditCoinIcon from '@/assets/icons/credit-coin.png';

type NavLink = { path: string; label: string; activePaths?: string[] };

export function isNavLinkActivePath(pathname: string, link: Pick<NavLink, 'path' | 'activePaths'>) {
  const activePaths = link.activePaths ?? [link.path];
  return activePaths.some((path) => (
    pathname === path || pathname.startsWith(path + '/')
  ));
}

function GenerationIndicator() {
  const { generations } = useGenerations();
  const navigate = useNavigate();
  const [showReady, setShowReady] = useState(false);
  const prevRunningCount = useRef(0);

  const runningGenerations = generations.filter(g => g.status === 'running');
  const runningCount = runningGenerations.length;
  const completedGenerations = generations.filter(g => g.status === 'completed');

  // Show "Ready" flash when running count drops to zero and we have completed items
  useEffect(() => {
    if (prevRunningCount.current > 0 && runningCount === 0 && completedGenerations.length > 0) {
      setShowReady(true);
      const t = setTimeout(() => setShowReady(false), 3000);
      return () => clearTimeout(t);
    }
    prevRunningCount.current = runningCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningCount, completedGenerations.length]);

  if (runningCount === 0 && !showReady) return null;

  const mostRecent = runningGenerations[runningGenerations.length - 1]
    ?? completedGenerations[completedGenerations.length - 1];

  const handleClick = () => {
    if (!mostRecent) return;
    if (mostRecent.status === 'completed') {
      navigate(`/studio/${mostRecent.jewelryType}`, {
        state: { asyncResult: { workflowId: mostRecent.workflowId, resultImages: mostRecent.resultImages } },
      });
    } else {
      navigate(`/studio/${mostRecent.jewelryType}`, {
        state: { viewGenerating: mostRecent.workflowId },
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 mr-3"
      aria-label={runningCount > 0 ? 'Generation in progress' : 'Generation ready'}
    >
      {runningCount > 0 ? (
        <>
          <Gem className="h-3.5 w-3.5 text-primary animate-spin flex-shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase hidden sm:inline">
            {runningCount > 1 ? `${runningCount} Generating\u2026` : 'Generating\u2026'}
          </span>
        </>
      ) : (
        <>
          <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
          <span className="font-mono text-[10px] tracking-[0.15em] text-muted-foreground uppercase hidden sm:inline">
            Ready
          </span>
        </>
      )}
    </button>
  );
}

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { credits, lastDelta } = useCredits();
  const isAdmin = useIsAdmin();
  const [visibleDelta, setVisibleDelta] = useState<{ amount: number; id: number } | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const rafId = useRef<number | undefined>();
  useEffect(() => {
    const handleScroll = () => {
      if (rafId.current) return;
      rafId.current = requestAnimationFrame(() => {
        setIsScrolled(window.scrollY > 20);
        rafId.current = undefined;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Show delta badge briefly when balance changes
  useEffect(() => {
    if (!lastDelta) return;
    setVisibleDelta(lastDelta);
    const timer = setTimeout(() => setVisibleDelta(null), 4000);
    return () => clearTimeout(timer);
  }, [lastDelta]);

  const navLinks: NavLink[] = [
    { path: '/', label: 'Home' },
    { path: '/studio', label: 'Photo Studio' },
    {
      path: '/studio-cad',
      label: 'CAD Studio',
      activePaths: ['/studio-cad', '/text-to-cad', '/cad-to-catalog'],
    },
    // { path: '/tutorial', label: 'Tutorial' }, // hidden for now
  ];

  const isNavLinkActive = (link: NavLink) => isNavLinkActivePath(location.pathname, link);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled
            ? 'bg-background/95 backdrop-blur-md border-b border-border/20 shadow-sm'
            : 'bg-background'
        }`}
      >
        <div className="flex h-16 lg:h-20 items-center justify-between px-4 md:px-8 lg:px-12">
          {/* Left side: Logo first, then Theme Switcher */}
          <div className="flex items-center gap-3 md:gap-4">
            {/* Logo - First at corner */}
            <Link to="/" className="flex items-center relative z-10">
              <ThemeLogo className="h-10 md:h-12 lg:h-14" />
            </Link>
            
            {/* Theme Switcher - After logo */}
            <div className="hidden lg:block">
              <ThemeSwitcher />
            </div>
          </div>

          {/* Desktop Navigation - Marta Style */}
          <nav className="hidden lg:flex items-center gap-4 lg:gap-6 flex-nowrap">
            {navLinks.map((link) => (
              <Link 
                key={link.path}
                to={link.path}
                className={`text-sm font-medium transition-colors whitespace-nowrap ${
                  isNavLinkActive(link)
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {link.label}
              </Link>
            ))}
            
            {/* User Profile / Auth Button */}
            {user ? (
              <div className="flex items-center gap-3">
                <GenerationIndicator />
                {/* Credit pill - clickable */}
                <div className="relative">
                  <Link
                    to="/credits"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/40 hover:border-border transition-colors"
                  >
                    <img src={creditCoinIcon} alt="" className="h-7 w-7 object-contain" width={28} height={28} loading="eager" decoding="sync" />
                    <span className="text-sm font-medium text-foreground">
                      {credits !== null ? credits : '—'}
                    </span>
                  </Link>
                  {/* Animated delta badge — CSS animation (no framer-motion) */}
                  {visibleDelta && (
                    <span
                      key={visibleDelta.id}
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2.5 py-1 rounded-full font-mono text-sm font-bold pointer-events-none whitespace-nowrap shadow-lg animate-credit-delta ${
                        visibleDelta.amount > 0
                          ? 'bg-primary/20 text-primary'
                          : 'bg-destructive/20 text-destructive'
                      }`}
                    >
                      {visibleDelta.amount > 0 ? '+' : ''}{visibleDelta.amount}
                    </span>
                  )}
                </div>

                {/* Profile dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button aria-label="Account menu" className="focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background rounded-full">
                      {user.avatar_url ? (
                        <img 
                          src={user.avatar_url} 
                          alt={user.full_name || 'User'} 
                          className="h-8 w-8 rounded-full object-cover aspect-square border border-border hover:border-foreground transition-colors"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors border border-border">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-popover border-border">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
                        {user.full_name || user.email?.split('@')[0]}
                        {user.is_verified && (
                          <BadgeCheck className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => navigate('/generations')}
                      className="text-sm"
                    >
                      <Image className="h-4 w-4 mr-2" />
                      Generations
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => navigate('/credits')}
                      className="text-sm"
                    >
                      <img src={creditCoinIcon} alt="" className="h-6 w-6 mr-2 object-contain" width={24} height={24} loading="eager" decoding="sync" />
                      My Credits
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem
                        onClick={() => navigate('/admin')}
                        className="text-sm"
                      >
                        <ScanEye className="h-4 w-4 mr-2" />
                        Admin
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => signOut()}
                      className="text-sm text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate('/login')}
                className="gap-2"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            )}
          </nav>

          {/* Mobile right-side group: Menu only */}
          <div className="flex lg:hidden items-center">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="relative z-10 h-9 w-9 flex-shrink-0"
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay - Marta Style */}
      <div 
        className={`fixed inset-0 z-40 bg-background transition-all duration-500 lg:hidden ${
          isMobileMenuOpen 
            ? 'opacity-100 pointer-events-auto' 
            : 'opacity-0 pointer-events-none'
        }`}
      >
        <nav className="flex flex-col items-center justify-center h-full gap-8">
          {navLinks.map((link, index) => (
            <Link 
              key={link.path}
              to={link.path}
              className={`font-display text-4xl tracking-wide transition-all duration-500 ${
                isNavLinkActive(link)
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              } ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: isMobileMenuOpen ? `${index * 100 + 200}ms` : '0ms' }}
            >
              {link.label}
            </Link>
          ))}
          
          {/* Mobile User Profile / Auth Button */}
          {user ? (
            <div
              className={`flex flex-col items-center gap-6 transition-all duration-500 ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: isMobileMenuOpen ? `${navLinks.length * 100 + 200}ms` : '0ms' }}
            >
              <div className="flex items-center gap-3">
                {user.avatar_url ? (
                  <img 
                    src={user.avatar_url} 
                    alt={user.full_name || 'User'} 
                    className="h-12 w-12 rounded-full object-cover aspect-square border border-border"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <span className="text-lg font-medium text-foreground flex items-center gap-2">
                  {user.full_name || user.email?.split('@')[0]}
                  {user.is_verified && (
                    <BadgeCheck className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </span>
              </div>
              
              <div className="flex flex-col gap-3">
                <Link to="/generations">
                  <Button variant="outline" size="lg" className="gap-2 w-full">
                    <Image className="h-5 w-5" />
                    Generations
                  </Button>
                </Link>
                <Link to="/credits">
                  <Button variant="outline" size="lg" className="gap-2 w-full">
                    <img src={creditCoinIcon} alt="" className="h-7 w-7 object-contain" width={28} height={28} loading="eager" decoding="sync" />
                    My Credits
                  </Button>
                </Link>
                {isAdmin && (
                  <Link to="/admin">
                    <Button variant="outline" size="lg" className="gap-2 w-full">
                      <ScanEye className="h-5 w-5" />
                      Admin
                    </Button>
                  </Link>
                )}
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => signOut()}
                  className="gap-2"
                >
                  <LogOut className="h-5 w-5" />
                  Sign Out
                </Button>
              </div>
            </div>
          ) : (
            <Link
              to="/login"
              className={`transition-all duration-500 ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              style={{ transitionDelay: isMobileMenuOpen ? `${navLinks.length * 100 + 200}ms` : '0ms' }}
            >
              <Button variant="default" size="lg" className="gap-2 w-full px-8">
                <LogIn className="h-5 w-5" />
                Sign In
              </Button>
            </Link>
          )}

          {/* Theme Switcher in mobile menu — below auth */}
          <div
            className={`transition-all duration-500 ${isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            style={{ transitionDelay: isMobileMenuOpen ? `${(navLinks.length + 1) * 100 + 200}ms` : '0ms' }}
          >
            <ThemeSwitcher />
          </div>
        </nav>
      </div>

      {/* Spacer for fixed header */}
      <div className="h-16 lg:h-20" />
    </>
  );
}
