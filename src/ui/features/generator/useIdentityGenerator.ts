import { useCallback, useState } from 'react';
import type { AccountRecord } from '../../../shared/types/Account';
import type { RegenerableField } from '../../../shared/types/Messages';
import { makeBackgroundCall } from '../../hooks/useAsyncTask';
import { useToast } from '../../hooks/useToast';
import { useUiStore } from '../../state/UiStore';

const generateIdentities = makeBackgroundCall(
  (count: number, persist: boolean) => ({ type: 'identity/generate', count, persist }) as const,
);

const regenerateFieldOnAccount = makeBackgroundCall(
  (account: AccountRecord, field: RegenerableField) =>
    ({ type: 'identity/regenerate', account, field }) as const,
);

const requestMailbox = makeBackgroundCall(
  (accountId: string | null) => ({ type: 'mailbox/create', accountId }) as const,
);

const applyAutofill = makeBackgroundCall((account: AccountRecord) => ({
  type: 'autofill/apply',
  payload: {
    displayName: account.discordDisplayName,
    email: account.email,
    password: account.discordPassword,
    birthday: account.birthday,
    username: account.discordUsername,
  },
}) as const);

export interface GeneratorApi {
  /** Generates `count` identities and reserves a mailbox for each. */
  generate: (count: number) => Promise<AccountRecord[]>;
  /** Pure-CPU preview that never touches the network. */
  preview: (count: number) => Promise<AccountRecord[]>;
  /** Mints a fresh mailbox for the account currently on screen. */
  remintMailbox: (accountId: string) => Promise<void>;
  /** Re-rolls one field, keeping the mailbox and every other value intact. */
  regenerateField: (account: AccountRecord, field: RegenerableField) => Promise<AccountRecord | null>;
  /** Field currently being re-rolled, or null when idle. */
  regenerating: RegenerableField | null;
  fillPage: (account: AccountRecord) => Promise<{ filled: number; matched: string[] }>;
  busy: boolean;
  /** 0-100, driven by how many accounts of the batch have landed. */
  progress: number;
}

/**
 * Orchestrates the generate button.
 *
 * The busy flag and progress figure are intentionally coarse: a batch is a
 * sequence of independent `await`s, so the UI reports how many have landed
 * rather than pretending to know a precise percentage.
 */
export function useIdentityGenerator(): GeneratorApi {
  const toast = useToast();
  const setDraft = useUiStore((state) => state.setDraft);
  const setBatchDrafts = useUiStore((state) => state.setBatchDrafts);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [regenerating, setRegenerating] = useState<RegenerableField | null>(null);

  const generate = useCallback(
    async (count: number) => {
      setBusy(true);
      setProgress(12);

      try {
        setProgress(35);
        const result = await generateIdentities(count, true);
        setProgress(100);

        const [first] = result.accounts;
        if (first) setDraft(first);
        setBatchDrafts(result.accounts);

        toast.success(
          result.accounts.length === 1
            ? 'Identity generated'
            : `Generated ${result.accounts.length} identities`,
          result.accounts.length === 1
            ? `${first?.email ?? ''} reserved and saved to the vault.`
            : 'All mailboxes reserved. Open the vault to review them.',
        );

        return result.accounts;
      } catch (error) {
        toast.error(
          'Generation failed',
          error instanceof Error ? error.message : 'The generator could not complete.',
        );
        return [];
      } finally {
        setBusy(false);
        setTimeout(() => setProgress(0), 400);
      }
    },
    [setBatchDrafts, setDraft, toast],
  );

  const preview = useCallback(
    async (count: number) => {
      setBusy(true);
      try {
        const result = await generateIdentities(count, false);
        const [first] = result.accounts;
        if (first) setDraft(first);
        return result.accounts;
      } catch (error) {
        toast.error('Preview failed', error instanceof Error ? error.message : 'Unknown error.');
        return [];
      } finally {
        setBusy(false);
      }
    },
    [setDraft, toast],
  );

  const remintMailbox = useCallback(
    async (accountId: string) => {
      setBusy(true);
      try {
        const result = await requestMailbox(accountId);

        if (result.account) {
          setDraft(result.account);
          toast.success('New mailbox reserved', result.email);
        }

        // The vault list lives in a separate hook, so signal a refresh.
        window.dispatchEvent(new CustomEvent('dra:vault-changed'));
      } catch (error) {
        toast.error(
          'Could not reserve a mailbox',
          error instanceof Error ? error.message : 'Unknown error.',
        );
      } finally {
        setBusy(false);
      }
    },
    [setDraft, toast],
  );

  const regenerateField = useCallback(
    async (account: AccountRecord, field: RegenerableField) => {
      setRegenerating(field);

      try {
        const updated = await regenerateFieldOnAccount(account, field);
        setDraft(updated);
        // The vault list is owned by a separate hook; nudge it to refetch.
        window.dispatchEvent(new CustomEvent('dra:vault-changed'));

        toast.success('Field regenerated', readField(updated, field));
        return updated;
      } catch (error) {
        toast.error(
          'Could not regenerate',
          error instanceof Error ? error.message : 'Unknown error.',
        );
        return null;
      } finally {
        setRegenerating(null);
      }
    },
    [setDraft, toast],
  );

  const fillPage = useCallback(
    async (account: AccountRecord) => {
      try {
        const result = await applyAutofill(account);

        if (result.filled === 0) {
          toast.warn(
            'No fields filled',
            'Open the signup form and try again, or fill the fields manually.',
          );
        } else {
          toast.success(
            `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}`,
            result.matched.join(' · '),
          );
        }

        return result;
      } catch (error) {
        toast.error(
          'Autofill failed',
          error instanceof Error ? error.message : 'The page is not reachable.',
        );
        return { filled: 0, matched: [] };
      }
    },
    [toast],
  );
/** Reads the freshly regenerated value so the toast can confirm what changed. */
function readField(account: AccountRecord, field: RegenerableField): string {
  switch (field) {
    case 'displayName':
      return account.discordDisplayName;
    case 'username':
      return `@${account.discordUsername}`;
    case 'password':
      return `${account.discordPassword.length} character password`;
    case 'birthday':
      return account.birthday;
    default: {
      const unreachable: never = field;
      return String(unreachable);
    }
  }
}

  return { generate, preview, remintMailbox, regenerateField, fillPage, busy, progress, regenerating };
}
