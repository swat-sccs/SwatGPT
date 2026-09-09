import { NavLink, Link } from 'react-router-dom';
import { Users, Flag, Gauge, ArrowLeft, MessagesSquare, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TranslationKeys } from '~/hooks';
import type { TAdminCapability } from './access';
import { AdminCapability, useAdminAccess } from './access';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type NavItem = {
  to: string;
  end?: boolean;
  labelKey: TranslationKeys;
  capability: TAdminCapability;
  Icon: LucideIcon;
};

export const ADMIN_ROOT = '/d/admin';

const items: NavItem[] = [
  {
    to: ADMIN_ROOT,
    end: true,
    labelKey: 'com_admin_nav_overview',
    capability: AdminCapability.USAGE,
    Icon: Gauge,
  },
  {
    to: `${ADMIN_ROOT}/users`,
    labelKey: 'com_admin_nav_users',
    capability: AdminCapability.USAGE,
    Icon: Users,
  },
  {
    to: `${ADMIN_ROOT}/conversations`,
    labelKey: 'com_admin_nav_conversations',
    capability: AdminCapability.CONVERSATIONS,
    Icon: MessagesSquare,
  },
  {
    to: `${ADMIN_ROOT}/flags`,
    labelKey: 'com_admin_nav_flags',
    capability: AdminCapability.CONVERSATIONS,
    Icon: Flag,
  },
  {
    to: `${ADMIN_ROOT}/controls`,
    labelKey: 'com_admin_nav_controls',
    capability: AdminCapability.CONTROLS,
    Icon: SlidersHorizontal,
  },
];

export default function Nav() {
  const localize = useLocalize();
  const { has } = useAdminAccess();

  return (
    <nav
      aria-label={localize('com_admin_nav_label')}
      className="flex shrink-0 flex-col gap-1 border-b border-border-light bg-surface-primary-alt p-3 md:w-56 md:border-b-0 md:border-r"
    >
      <Link
        to="/c/new"
        className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {localize('com_admin_back_to_chat')}
      </Link>
      <h1 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {localize('com_admin_title')}
      </h1>
      <ul className="flex flex-row flex-wrap gap-1 md:flex-col">
        {items
          .filter((item) => has(item.capability))
          .map(({ to, end, labelKey, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-surface-hover',
                    isActive && 'bg-surface-active font-medium',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {localize(labelKey)}
              </NavLink>
            </li>
          ))}
      </ul>
    </nav>
  );
}
