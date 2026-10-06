import type { ActivityKind } from './Activity';
import type { AccountRecord, AccountStatus } from './Account';
import type { ExtensionSettings } from './Settings';
import type { MailSummary, TempMailMessage } from './Mail';

/**
 * The complete RPC surface between UI surfaces and the service worker.
 * Adding a variant here forces both sides to handle it at compile time.
 */
export type BackgroundRequest =
  | { type: 'settings/get' }
  | { type: 'settings/update'; patch: Partial<ExtensionSettings> }
  | { type: 'settings/reset' }
  | { type: 'identity/generate'; count: number; persist: boolean }
  | { type: 'identity/preview'; count: number }
  | { type: 'identity/regenerate'; account: AccountRecord; field: RegenerableField }
  | { type: 'vault/list' }
  | { type: 'vault/save'; account: AccountRecord }
  | { type: 'vault/delete'; id: string }
  | { type: 'vault/clear'; scope: VaultClearScope }
  | { type: 'vault/export'; format: ExportFormat }
  | { type: 'vault/import'; json: string }
  | { type: 'vault/setStatus'; id: string; status: AccountStatus }
  | { type: 'vault/patch'; id: string; patch: VaultPatch }
  | { type: 'mailbox/domains'; force: boolean }
  | { type: 'mailbox/create'; accountId: string | null }
  | { type: 'mailbox/inbox'; email: string; password: string }
  | { type: 'mailbox/read'; email: string; password: string; messageId: string }
  | { type: 'mailbox/changePassword'; email: string; currentPassword: string; newPassword: string }
  | { type: 'activity/list'; limit: number }
  | { type: 'activity/clear' }
  | { type: 'activity/stats' }
  | { type: 'autofill/apply'; payload: AutofillPayload }
  | { type: 'autofill/flow'; payload: AutofillPayload }
  | { type: 'autofill/applyCode'; code: string }
  | { type: 'autofill/ping' }
  | { type: 'vault/saveToken'; email?: string; id?: string; token: string }
  | { type: 'vault/captureToken'; id: string }
  | { type: 'vault/revokeToken'; id: string }
  | { type: 'launcher/openPanel' }
  | { type: 'launcher/openPopup' }
  | { type: 'launcher/status' }
  | { type: 'launcher/pasteCode' }
  | { type: 'launcher/captureToken' }
  | { type: 'launcher/notifyClosed' };

export type VaultClearScope = 'accounts' | 'activity' | 'settings' | 'everything';

/** Single fields the generator can re-roll without minting a new mailbox. */
export type RegenerableField = 'displayName' | 'username' | 'password' | 'birthday';

export type ExportFormat = 'json' | 'csv' | 'txt-tokens' | 'txt-full';

/** Fields a user may edit directly on a stored account. */
export interface VaultPatch {
  notes?: string;
  tags?: string[];
}

/** How the launcher UI ended up on screen. Mirrors `LauncherOpenResult` in the
 * background handler; declared here because the response map cannot import it. */
export interface LauncherOpenResult {
  opened: boolean;
  mode: 'panel' | 'window' | 'popup' | null;
  reason: string | null;
}

export interface AutofillPayload {
  displayName: string;
  email: string;
  password: string;
  birthday: string;
  username: string;
  /** Optional 4-8 digit code, filled by the dedicated `applyCode` request. */
  code?: string;
}

/** Discriminated result envelope - every handler resolves to one of these. */
export type BackgroundResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: BackgroundError };

export interface BackgroundError {
  code: BackgroundErrorCode;
  message: string;
  /** Populated for validation failures so the UI can highlight inputs. */
  fields?: Record<string, string>;
}

export type BackgroundErrorCode =
  | 'validation'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'unauthorized'
  | 'network'
  | 'unsupported'
  | 'internal';

/** Payload carried by every response - kept in one map for exhaustiveness. */
export interface ResponsePayloadMap {
  'settings/get': ExtensionSettings;
  'settings/update': ExtensionSettings;
  'settings/reset': ExtensionSettings;
  'identity/generate': GenerationResult;
  'identity/preview': GenerationResult;
  'identity/regenerate': AccountRecord;
  'vault/list': AccountRecord[];
  'vault/save': AccountRecord;
  'vault/delete': { id: string };
  'vault/clear': { scope: VaultClearScope; removed: number };
  'vault/export': { filename: string; content: string; mimeType: string };
  'vault/import': { imported: number; skipped: number; tokensOnly: number };
  'vault/setStatus': AccountRecord;
  'vault/patch': AccountRecord;
  'mailbox/domains': { domains: string[]; fetchedAt: number; fromCache: boolean };
  'mailbox/create': MailboxCreationResult;
  'mailbox/inbox': TempMailMessage[];
  'mailbox/read': TempMailMessage;
  'mailbox/changePassword': { email: string };
  'activity/list': ActivityLogEntryView[];
  'activity/clear': { removed: number };
  'activity/stats': ActivityStatsView;
  'autofill/apply': { filled: number; matched: string[] };
  'autofill/flow': { started: boolean };
  'autofill/applyCode': { filled: number; matched: string[] };
  'autofill/ping': { url: string; ready: boolean };
  'vault/saveToken': { saved: boolean; fetchedProfile: boolean };
  'vault/captureToken': { saved: boolean; fetchedProfile: boolean; token: string | null };
  'vault/revokeToken': AccountRecord;
  'launcher/openPanel': LauncherOpenResult;
  'launcher/openPopup': LauncherOpenResult;
  'launcher/status': { available: boolean; enabled: boolean; edge: 'right' | 'left'; compact: boolean };
  'launcher/pasteCode': { ok: boolean; message?: string };
  'launcher/captureToken': { ok: boolean; message?: string };
  'launcher/notifyClosed': { notified: boolean };
}

export interface GenerationResult {
  accounts: AccountRecord[];
  persisted: boolean;
}

export interface MailboxCreationResult {
  email: string;
  password: string;
  domain: string;
  localPart: string;
  account: AccountRecord | null;
}

export interface ActivityLogEntryView {
  id: string;
  at: number;
  kind: ActivityKind;
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
  detail?: Record<string, string | number | boolean>;
}

export interface ActivityStatsView {
  total: number;
  successes: number;
  warnings: number;
  errors: number;
  lastActivityAt: number | null;
}

/** Thin alias so the router can be typed generically without the map. */
export type AnyResponsePayload = ResponsePayloadMap[keyof ResponsePayloadMap];

export type { MailSummary, TempMailMessage, AccountRecord, ExtensionSettings };
