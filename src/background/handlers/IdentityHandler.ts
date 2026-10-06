import type { AccountRecord } from '../../shared/types/Account';
import type { ExtensionSettings } from '../../shared/types/Settings';
import type { GenerationResult, MailboxCreationResult } from '../../shared/types/Messages';
import { BATCH_MAX_COUNT, BATCH_MIN_COUNT } from '../../shared/constants/AppConstants';
import { Logger } from '../../shared/logger/Logger';
import { assembleAccount, patchAccount } from '../../identity/AccountAssembler';
import { createIdentities } from '../../identity/IdentityFactory';
import { generateBirthday, sanitizeAgeWindow } from '../../identity/BirthdayGenerator';
import { generateDisplayName } from '../../identity/DisplayNameGenerator';
import { generatePassword } from '../../identity/PasswordGenerator';
import { generateUsername } from '../../identity/UsernameGenerator';
import { createAvatarSeed, createId } from '../../shared/utils/Id';
import { AccountVault } from '../../storage/AccountVault';
import type { BackgroundContext } from '../BackgroundContext';
import { persistRegistry } from '../BackgroundContext';
import { HandlerError, requireInteger } from '../HandlerError';
import type { RegenerableField } from '../../shared/types/Messages';

/**
 * Generates identities and, when asked, reserves a mailbox for each one.
 *
 * Two distinct modes exist because they cost very different things:
 *  - preview  -> pure CPU, no network, safe to spam
 *  - persist  -> one `/register` call per account against the shared rate limit
 *
 * The UI's "Generate" button uses persist; the batch preview list uses preview.
 */
export async function handleIdentityGenerate(
  request: { type: 'identity/generate'; count: number; persist: boolean },
  ctx: BackgroundContext,
): Promise<GenerationResult> {
  const count = requireInteger(request.count, 'count', BATCH_MIN_COUNT, BATCH_MAX_COUNT);
  const settings = ctx.getSettings();

  if (!request.persist) {
    return generatePreview(ctx, settings, count);
  }

  return generateAndPersist(ctx, settings, count);
}

function generatePreview(
  ctx: BackgroundContext,
  settings: ExtensionSettings,
  count: number,
): GenerationResult {
  const reports = createIdentities({ settings, registry: ctx.registry }, count);

  const accounts = reports.map((report) =>
    assembleAccount({
      draft: report.draft,
      email: '',
      emailPassword: '',
      mailboxOrigin: 'generated',
    }),
  );

  Logger.info('identityGenerated', `Previewed ${accounts.length} identity draft(s).`, {
    count: accounts.length,
    reRolls: reports.reduce((sum, report) => sum + report.attempts - 1, 0),
  });

  return { accounts, persisted: false };
}

async function generateAndPersist(
  ctx: BackgroundContext,
  settings: ExtensionSettings,
  count: number,
): Promise<GenerationResult> {
  // Domains are refreshed once per batch, not once per account: the list is
  // identical for every address in the batch.
  if (settings.refreshDomainsBeforeGenerate) {
    await ctx.mailbox.refreshDomains(settings, false);
  }

  const reports = createIdentities({ settings, registry: ctx.registry }, count);
  const accounts: AccountRecord[] = [];
  const failures: string[] = [];

  for (const report of reports) {
    try {
      const mailbox = await ctx.mailbox.provision({
        settings,
        registry: ctx.registry,
      });

      accounts.push(
        assembleAccount({
          draft: report.draft,
          email: mailbox.email,
          emailPassword: mailbox.password,
          mailboxOrigin: 'registered',
        }),
      );
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (accounts.length === 0) {
    throw new HandlerError(
      'network',
      failures[0] ?? 'Could not create a mailbox for any generated identity.',
    );
  }

  for (const account of accounts) {
    await AccountVault.save(account);
  }

  await persistRegistry();

  Logger.success('batchGenerated', `Generated ${accounts.length} account(s).`, {
    requested: count,
    created: accounts.length,
    failed: failures.length,
  });

  return { accounts, persisted: true };
}

/**
 * Re-rolls a single field on an existing account.
 *
 * Useful when one value is rejected but the mailbox and identity are already
 * good: regenerating everything would waste the mailbox registration. The new
 * value is checked against the uniqueness registry just like a fresh draw, and
 * the old value is released so the name can be reused later.
 */
export async function handleIdentityRegenerate(
  request: { type: 'identity/regenerate'; account: AccountRecord; field: RegenerableField },
  ctx: BackgroundContext,
): Promise<AccountRecord> {
  const { account, field } = request;

  if (!account || typeof account.id !== 'string') {
    throw HandlerError.validation('An account is required to regenerate a field.');
  }

  const settings = ctx.getSettings();
  const next = regenerateField(account, field, settings);

  ctx.registry.forgetAccount(account);
  ctx.registry.indexAccount(next);
  await persistRegistry();

  const saved = await AccountVault.save(next);

  Logger.info('identityGenerated', `Regenerated the ${field} for ${account.discordDisplayName}.`);

  return saved.find((entry) => entry.id === account.id) ?? next;
}

function regenerateField(
  account: AccountRecord,
  field: RegenerableField,
  settings: ExtensionSettings,
): AccountRecord {
  switch (field) {
    case 'displayName': {
      const value = generateDisplayName(settings.displayNameFormat);
      return patchAccount(account, {
        discordDisplayName: value,
        avatarSeed: createAvatarSeed(createId('seed')),
      });
    }

    case 'username': {
      const value = generateUsername(settings.usernameStyle);
      return patchAccount(account, { discordUsername: value });
    }

    case 'password': {
      const value = generatePassword({
        length: settings.passwordLength,
        includeSymbols: settings.passwordIncludeSymbols,
        avoidAmbiguous: settings.passwordAvoidAmbiguous,
      }).value;
      return patchAccount(account, { discordPassword: value });
    }

    case 'birthday': {
      const value = generateBirthday(
        sanitizeAgeWindow({ minAge: settings.birthdayAgeMin, maxAge: settings.birthdayAgeMax }),
      );
      return patchAccount(account, { birthday: value });
    }

    default: {
      const unreachable: never = field;
      throw HandlerError.unsupported(`Cannot regenerate: ${String(unreachable)}`);
    }
  }
}

/** Reserves a mailbox without generating a fresh identity - used by "New mailbox". */
export async function handleMailboxCreate(
  request: { type: 'mailbox/create'; accountId: string | null },
  ctx: BackgroundContext,
): Promise<MailboxCreationResult> {
  const settings = ctx.getSettings();
  await ctx.mailbox.refreshDomains(settings, false);

  const mailbox = await ctx.mailbox.provision({ settings, registry: ctx.registry });

  if (!request.accountId) {
    return { ...mailbox, account: null };
  }

  const accounts = await AccountVault.list();
  const existing = accounts.find((entry) => entry.id === request.accountId);

  if (!existing) {
    throw HandlerError.notFound('That account is no longer in the vault.');
  }

  const updated: AccountRecord = {
    ...existing,
    email: mailbox.email,
    emailPassword: mailbox.password,
    mailboxOrigin: 'registered',
    status: 'mailboxReady',
    mailCount: 0,
    unreadCount: 0,
    lastVerificationCode: null,
    lastMailSyncAt: null,
  };

  const next = await AccountVault.save(updated);
  await persistRegistry();

  return {
    ...mailbox,
    account: next.find((entry) => entry.id === updated.id) ?? updated,
  };
}
