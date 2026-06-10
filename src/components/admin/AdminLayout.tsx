import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ScanEye } from 'lucide-react';

const TABS = [
  { label: 'Promo Codes', to: '/admin/promo-codes' },
  { label: 'Generations', to: '/admin/generations' },
  { label: 'Feedback', to: '/admin/feedback' },
  { label: 'AI Fixes', to: '/admin/ai-fixes' },
  { label: 'Preset Library', to: '/admin/preset-library' },
];

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8 md:pt-12">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <ScanEye className="h-6 w-6 text-foreground" />
          <h1 className="text-2xl md:text-3xl font-display font-semibold text-foreground">
            Admin
          </h1>
        </div>

        {/* Tab nav */}
        <nav className="flex gap-1 border-b mb-0">
          {TABS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Page content rendered by nested route */}
      <Outlet />
    </div>
  );
}
