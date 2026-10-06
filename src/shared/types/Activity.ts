export type ActivityKind =
  | 'identityGenerated'
  | 'batchGenerated'
  | 'mailboxRegistered'
  | 'mailboxSynced'
  | 'verificationCodeFound'
  | 'accountSaved'
  | 'accountDeleted'
  | 'vaultCleared'
  | 'accountExported'
  | 'autofillApplied'
  | 'tokenHealthCheck'
  | 'settingsUpdated'
  | 'apiRequest'
  | 'apiError'
  | 'warning';

export type ActivitySeverity = 'info' | 'success' | 'warning' | 'error';

export interface ActivityEntry {
  id: string;
  at: number;
  kind: ActivityKind;
  severity: ActivitySeverity;
  message: string;
  /** Short machine-readable context, rendered as chips in the UI. */
  detail?: Record<string, string | number | boolean>;
}

export interface ActivityStats {
  total: number;
  successes: number;
  warnings: number;
  errors: number;
  lastActivityAt: number | null;
}
