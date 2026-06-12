'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard,
  Package,
  Factory,
  Users,
  FileText,
  Zap,
  Send,
  TrendingUp,
  BarChart3,
  Shield,
  Settings,
  ChevronDown,
  Globe,
  Bell,
  LogOut,
  Building2,
  Briefcase,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { User, Organization } from '@/types/domain';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  group?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'overview' },
  { label: 'Products', href: '/products', icon: Package, group: 'data' },
  { label: 'Facilities', href: '/facilities', icon: Factory, group: 'data' },
  { label: 'Suppliers', href: '/suppliers', icon: Users, group: 'data' },
  { label: 'Documents', href: '/documents', icon: FileText, group: 'compliance' },
  { label: 'Emissions', href: '/emissions', icon: Zap, group: 'compliance' },
  { label: 'Submissions', href: '/submissions', icon: Send, group: 'compliance' },
  { label: 'Financial impact', href: '/financial', icon: TrendingUp, group: 'reporting' },
  { label: 'Reports', href: '/reports', icon: BarChart3, group: 'reporting' },
  { label: 'Audit log', href: '/audit', icon: Shield, group: 'reporting' },
  { label: 'Settings', href: '/settings', icon: Settings, group: 'admin' },
];

const GROUP_LABELS: Record<string, string> = {
  overview: '',
  data: 'Data',
  compliance: 'Compliance',
  reporting: 'Reporting',
  admin: 'Admin',
};

interface AppSidebarProps {
  user: User & { org: Organization };
  unreadNotifications: number;
}

export function AppSidebar({ user, unreadNotifications }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Group nav items
  const groups = ['overview', 'data', 'compliance', 'reporting', 'admin'];

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const planColors: Record<string, string> = {
    enterprise: 'badge-accent',
    professional: 'badge-success',
    consultant: 'badge-accent',
    starter: 'badge-neutral',
    trial: 'badge-warning',
  };

  return (
    <aside className="sidebar">
      {/* Logo / Org header */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[hsl(var(--border))]">
        <div className="w-8 h-8 rounded-lg bg-[hsl(var(--accent))] flex items-center justify-center flex-shrink-0">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate text-[hsl(var(--ink-primary))]">
            {user.org.name}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={clsx('badge text-[10px]', planColors[user.org.plan] ?? 'badge-neutral')}>
              {user.org.plan.charAt(0).toUpperCase() + user.org.plan.slice(1)}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => {
          const items = NAV_ITEMS.filter((i) => i.group === group);
          const label = GROUP_LABELS[group];
          return (
            <div key={group} className="mb-1">
              {label && (
                <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--ink-tertiary))]">
                  {label}
                </div>
              )}
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx('sidebar-nav-item mb-0.5', active && 'active')}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/dashboard' && unreadNotifications > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(var(--danger))] px-1 text-[10px] font-semibold text-white">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-[hsl(var(--border))] px-3 py-3">
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-[hsl(var(--accent-muted))] flex items-center justify-center flex-shrink-0">
            <span className="text-[11px] font-semibold text-[hsl(var(--accent))]">
              {(user.full_name ?? user.role)
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate text-[hsl(var(--ink-primary))]">
              {user.full_name ?? 'User'}
            </div>
            <div className="text-xs text-[hsl(var(--ink-tertiary))] capitalize">
              {user.role}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="p-1.5 rounded hover:bg-[hsl(var(--surface-sunken))] text-[hsl(var(--ink-tertiary))] hover:text-[hsl(var(--ink-secondary))] transition-colors"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
