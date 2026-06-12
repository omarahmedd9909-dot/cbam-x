'use client';

import { useState } from 'react';
import { Bell, Sun, Moon, Monitor, ChevronDown, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from 'next-themes';
import type { User, Organization } from '@/types/domain';

interface TopBarProps {
  user: User & { org: Organization };
  unreadNotifications: number;
}

// Get current quarter label
function getCurrentPeriod(): string {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  return `${now.getFullYear()}-Q${q}`;
}

export function TopBar({ user, unreadNotifications }: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const period = getCurrentPeriod();

  const themeIcon = theme === 'dark' ? Sun : theme === 'light' ? Moon : Monitor;
  const ThemeIcon = themeIcon;

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light');
    else if (theme === 'light') setTheme('system');
    else setTheme('dark');
  };

  return (
    <header className="h-12 flex items-center justify-between px-6 bg-[hsl(var(--surface-base))] border-b border-[hsl(var(--border))] flex-shrink-0">
      {/* Left: period context */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[hsl(var(--ink-tertiary))]">Reporting period</span>
          <button className="flex items-center gap-1.5 font-medium text-[hsl(var(--ink-primary))] hover:text-[hsl(var(--accent))] transition-colors">
            {period}
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="w-px h-4 bg-[hsl(var(--border))]" />
        <div className="text-xs text-[hsl(var(--ink-tertiary))]">
          EU CBAM Framework
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1">
        {/* Global search — Command K */}
        <button className="flex items-center gap-2 h-8 px-3 rounded-md text-[hsl(var(--ink-tertiary))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink-secondary))] transition-colors text-xs">
          <Search className="w-3.5 h-3.5" />
          <span>Search</span>
          <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[hsl(var(--border))] text-[10px] font-mono bg-[hsl(var(--surface-sunken))]">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <button
          onClick={cycleTheme}
          className="w-8 h-8 flex items-center justify-center rounded-md text-[hsl(var(--ink-tertiary))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink-secondary))] transition-colors"
          title="Toggle theme"
        >
          <ThemeIcon className="w-4 h-4" />
        </button>

        {/* Notifications */}
        <button className="relative w-8 h-8 flex items-center justify-center rounded-md text-[hsl(var(--ink-tertiary))] hover:bg-[hsl(var(--surface-sunken))] hover:text-[hsl(var(--ink-secondary))] transition-colors">
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[hsl(var(--danger))]" />
          )}
        </button>
      </div>
    </header>
  );
}
