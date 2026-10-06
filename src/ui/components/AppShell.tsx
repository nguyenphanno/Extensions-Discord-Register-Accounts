import type { ReactNode } from 'react';
import { bem, cx } from '../lib/ClassNames';

export interface AppShellProps {
  rail: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode;
  className?: string;
}

/**
 * Three-row shell: rail + content, with an optional status bar pinned to the
 * bottom. Every surface (popup, side panel, options) composes this so the
 * chrome stays identical everywhere.
 */
export function AppShell({ rail, children, statusBar, className }: AppShellProps): ReactNode {
  return (
    <div className={cx('AppShell', className)}>
      <div className="AppShell__body">
        {rail}
        <div className="AppShell__main">{children}</div>
      </div>
      {statusBar}
    </div>
  );
}

export interface PanelHeaderProps {
  logoUrl?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  leading?: ReactNode;
  inset?: boolean;
  /**
   * Popup variant: title only, no logo, no subtitle.
   * The 400px popup cannot fit a logo + title + subtitle + actions without the
   * title truncating, and the logo duplicates the one already in the rail.
   */
  compact?: boolean;
}

export function PanelHeader({
  logoUrl,
  title,
  subtitle,
  actions,
  leading,
  inset = false,
  compact = false,
}: PanelHeaderProps): ReactNode {
  const showLogo = !compact && Boolean(logoUrl);
  const showSubtitle = !compact && Boolean(subtitle);

  return (
    <header
      className={cx('PanelHeader', compact ? 'PanelHeader--compact' : null, inset ? 'PanelHeader--inset' : null)}
    >
      {leading}
      <div className="PanelHeader__brand">
        {showLogo ? <img className="PanelHeader__logo" src={logoUrl} alt="" /> : null}
        <div className="PanelHeader__text">
          <span className="PanelHeader__title">{title}</span>
          {showSubtitle ? <span className="PanelHeader__subtitle">{subtitle}</span> : null}
        </div>
      </div>
      {actions ? <div className="PanelHeader__actions">{actions}</div> : null}
    </header>
  );
}

export interface NavRailProps {
  children: ReactNode;
  footer?: ReactNode;
}

export function NavRail({ children, footer }: NavRailProps): ReactNode {
  return (
    <nav className="NavRail" aria-label="Primary">
      {children}
      <div className="NavRail__spacer" />
      {footer}
    </nav>
  );
}

export interface NavRailItemProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: number;
  onClick: () => void;
  hint?: string;
}

export function NavRailItem({
  label,
  icon,
  active,
  badge,
  onClick,
  hint,
}: NavRailItemProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ? `${label} (${hint})` : label}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      className={cx(bem('NavRailItem', { active }))}
    >
      <span className="NavRailItem__indicator" aria-hidden="true" />
      {icon}
      {badge && badge > 0 ? (
        <span className="NavRailItem__badge">{badge > 99 ? '99+' : badge}</span>
      ) : null}
    </button>
  );
}

export interface PaneProps {
  header?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  padded?: boolean;
  className?: string;
}

export function Pane({
  header,
  toolbar,
  footer,
  children,
  padded = false,
  className,
}: PaneProps): ReactNode {
  return (
    <div className={cx('Pane', className)}>
      {header}
      {toolbar}
      <div className={cx('Pane__scroll', padded ? 'Pane__scroll--padded' : null)}>{children}</div>
      {footer}
    </div>
  );
}
