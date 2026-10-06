import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Database,
  Eraser,
  Gauge,
  HardDrive,
  Info,
  MonitorSmartphone,
  Moon,
  Palette,
  RotateCcw,
  Server,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import type { ExtensionSettings } from '../../../shared/types/Settings';
import type { VaultClearScope } from '../../../shared/types/Messages';
import { SETTINGS_BOUNDS } from '../../../shared/constants/StorageDefaults';
import { WordBank } from '../../../identity/wordbank/WordBank';
import { APP_NAME } from '../../../shared/constants/AppConstants';
import { formatBytes, formatDuration } from '../../lib/FormatUnits';
import { describeStrengthPolicy } from '../../lib/PasswordStrength';
import { Button, Chip } from '../../components/Primitives';
import {
  InfoRow,
  RangeRow,
  SectionCard,
  SelectField,
  SettingRow,
  TextField,
  ToggleRow,
} from '../../components/Fields';
import { useDomains } from '../../hooks/useDomains';

export interface SettingsViewProps {
  settings: ExtensionSettings;
  loading: boolean;
  update: (patch: Partial<ExtensionSettings>) => Promise<unknown>;
  reset: () => Promise<unknown>;
  onRequestClear: (scope: VaultClearScope) => void;
}

const DISPLAY_NAME_FORMATS = [
  { value: 'adjectiveNoun', label: 'SwiftFalcon' },
  { value: 'adjectiveNounNumber', label: 'SwiftFalcon42' },
  { value: 'verbAdjectiveNoun', label: 'DriftingFalcon' },
  { value: 'capitalizedFullName', label: 'Alex Hartley' },
  { value: 'lowercaseFullName', label: 'alex hartley' },
] as const;

const USERNAME_STYLES = [
  { value: 'lowercase', label: 'swiftfalcon' },
  { value: 'lowercaseDotSuffix', label: 'swift.falcon' },
  { value: 'lowercaseNumberSuffix', label: 'swiftfalcon2917' },
  { value: 'capitalized', label: 'SwiftFalcon' },
] as const;

const LOCAL_PART_STYLES = [
  { value: 'wordPairDigits', label: 'swiftfalcon4821' },
  { value: 'singleWordDigits', label: 'falcon6031' },
  { value: 'opaqueToken', label: 'n7kq2mp4zx' },
] as const;

const BIRTHDAY_PRESETS = [
  { value: '18-24', label: '18-24', min: 18, max: 24 },
  { value: '18-30', label: '18-30', min: 18, max: 30 },
  { value: '21-35', label: '21-35', min: 21, max: 35 },
  { value: '25-45', label: '25-45', min: 25, max: 45 },
] as const;

/**
 * Settings surface.
 *
 * Every control writes straight through to the background worker, which clamps
 * the value before persisting it. The UI therefore never validates bounds
 * itself: sliders cannot express an out-of-range value, and anything that slips
 * through is normalised on the way in.
 */
export function SettingsView({
  settings,
  loading,
  update,
  reset,
  onRequestClear,
}: SettingsViewProps): ReactNode {
  const domains = useDomains();
  const [storageBytes, setStorageBytes] = useState<number | null>(null);

  const measureStorage = useCallback(async () => {
    try {
      const snapshot = await chrome.storage.local.get(null);
      setStorageBytes(new Blob([JSON.stringify(snapshot)]).size);
    } catch {
      setStorageBytes(null);
    }
  }, []);

  useEffect(() => {
    void measureStorage();
  }, [measureStorage]);

  const bank = WordBank.size;
  const birthdayPreset =
    BIRTHDAY_PRESETS.find(
      (preset) => preset.min === settings.birthdayAgeMin && preset.max === settings.birthdayAgeMax,
    )?.value ?? 'custom';


  return (
    <div className="OptionsContent">
      <SectionCard
        icon={<Server size={15} />}
        title="Mailbox service"
        description="Where temporary mailboxes are created. Credentials are only ever sent to this origin."
      >
        <TextField
          id="apiBaseUrl"
          label="API base URL"
          value={settings.apiBaseUrl}
          onChange={(value) => void update({ apiBaseUrl: value })}
          mono
          disabled={loading}
          placeholder="https://cheapluxurymail.xyz"
          hint="HTTPS only. Changing this changes where your mailbox credentials are sent."
        />

        <SettingRow
          label="Mailbox domain"
          description={`${domains.domains.length} available${domains.fromCache ? ' (cached)' : ''}. Pin one, or leave on auto to spread addresses across the pool.`}
          control={
            <>
              <SelectField
                id="pinnedDomain"
                ariaLabel="Pinned mailbox domain"
                value={settings.pinnedDomain ?? ''}
                disabled={loading}
                onChange={(value) => void update({ pinnedDomain: value || null })}
                options={[
                  { value: '', label: 'Auto (rotate)' },
                  ...domains.domains.map((domain) => ({ value: domain, label: domain })),
                ]}
              />
              <Button variant="ghost" size="sm" onClick={() => void domains.refresh(true)}>
                Refresh
              </Button>
            </>
          }
        />

        <ToggleRow
          id="refreshDomainsBeforeGenerate"
          label="Refresh domains before generating"
          description="Fetches the live list once per batch instead of trusting the cache."
          checked={settings.refreshDomainsBeforeGenerate}
          onChange={(checked) => void update({ refreshDomainsBeforeGenerate: checked })}
        />

        <InfoRow
          icon={<Gauge size={13} />}
          label="Cached domains"
          value={
            domains.fetchedAt
              ? `${domains.domains.length} · ${new Date(domains.fetchedAt).toLocaleTimeString()}`
              : 'not cached yet'
          }
        />
      </SectionCard>

      <SectionCard
        icon={<Wand2 size={15} />}
        title="Identity generator"
        description={`Word pools hold ${bank.adjectives} adjectives, ${bank.nouns} nouns and ${bank.verbs} verbs - about ${WordBank.pairSpace.toLocaleString()} two-word combinations.`}
      >
        <SettingRow
          label="Display name format"
          control={
            <SelectField
              id="displayNameFormat"
              ariaLabel="Display name format"
              value={settings.displayNameFormat}
              disabled={loading}
              onChange={(value) => void update({ displayNameFormat: value })}
              options={DISPLAY_NAME_FORMATS}
            />
          }
        />

        <SettingRow
          label="Username style"
          description="Discord accepts a-z, 0-9, dots and underscores only."
          control={
            <SelectField
              id="usernameStyle"
              ariaLabel="Username style"
              value={settings.usernameStyle}
              disabled={loading}
              onChange={(value) => void update({ usernameStyle: value })}
              options={USERNAME_STYLES}
            />
          }
        />

        <SettingRow
          label="Email local part"
          control={
            <SelectField
              id="emailLocalPartStyle"
              ariaLabel="Email local part style"
              value={settings.emailLocalPartStyle}
              disabled={loading}
              onChange={(value) => void update({ emailLocalPartStyle: value })}
              options={LOCAL_PART_STYLES}
            />
          }
        />

        <RangeRow
          id="passwordLength"
          label="Password length"
          description={describeStrengthPolicy()}
          value={settings.passwordLength}
          min={SETTINGS_BOUNDS.passwordLength.min}
          max={SETTINGS_BOUNDS.passwordLength.max}
          onChange={(value) => void update({ passwordLength: value })}
          format={(value) => `${value} chars`}
        />

        <RangeRow
          id="emailDigitSuffixLength"
          label="Digit suffix length"
          description="Appended to readable local parts to keep them unique."
          value={settings.emailDigitSuffixLength}
          min={SETTINGS_BOUNDS.emailDigitSuffixLength.min}
          max={SETTINGS_BOUNDS.emailDigitSuffixLength.max}
          onChange={(value) => void update({ emailDigitSuffixLength: value })}
          format={(value) => `${value} digits`}
        />

        <ToggleRow
          id="passwordIncludeSymbols"
          label="Include symbols in passwords"
          description="Adds !@#$%^&*_-+=? to the character pool."
          checked={settings.passwordIncludeSymbols}
          onChange={(checked) => void update({ passwordIncludeSymbols: checked })}
        />

        <ToggleRow
          id="passwordAvoidAmbiguous"
          label="Avoid ambiguous characters"
          description="Drops O, 0, I, l and 1 so a hand-typed password is not misread."
          checked={settings.passwordAvoidAmbiguous}
          onChange={(checked) => void update({ passwordAvoidAmbiguous: checked })}
        />

        <ToggleRow
          id="enforceUniqueIdentities"
          label="Enforce unique identities"
          description="Re-rolls until the display name and handle have never been used before."
          checked={settings.enforceUniqueIdentities}
          onChange={(checked) => void update({ enforceUniqueIdentities: checked })}
        />

        <SettingRow
          label="Date of birth window"
          description={`Currently ${settings.birthdayAgeMin}-${settings.birthdayAgeMax} years old.`}
          control={
            <SelectField
              id="birthdayWindow"
              ariaLabel="Date of birth window"
              value={birthdayPreset}
              disabled={loading}
              onChange={(value) => {
                const preset = BIRTHDAY_PRESETS.find((entry) => entry.value === value);
                if (preset) void update({ birthdayAgeMin: preset.min, birthdayAgeMax: preset.max });
              }}
              options={[
                ...BIRTHDAY_PRESETS.map((preset) => ({
                  value: preset.value as string,
                  label: preset.label,
                })),
                { value: 'custom', label: 'Custom' },
              ]}
            />
          }
        />
      </SectionCard>

      <SectionCard
        icon={<Gauge size={15} />}
        title="Mailbox behaviour"
        description="How often the extension reads your mailboxes and what it does with the content."
      >
        <ToggleRow
          id="autoSyncMailbox"
          label="Automatic mailbox refresh"
          description="Polls your mailboxes on a background schedule so new codes appear without a manual refresh."
          checked={settings.autoSyncMailbox}
          onChange={(checked) => void update({ autoSyncMailbox: checked })}
        />

        <RangeRow
          id="mailboxSyncIntervalSeconds"
          label="Refresh interval"
          description="How often each mailbox is polled. Shorter intervals spend more of the rate limit."
          value={settings.mailboxSyncIntervalSeconds}
          min={SETTINGS_BOUNDS.mailboxSyncIntervalSeconds.min}
          max={SETTINGS_BOUNDS.mailboxSyncIntervalSeconds.max}
          step={5}
          onChange={(value) => void update({ mailboxSyncIntervalSeconds: value })}
          format={formatDuration}
        />

        <ToggleRow
          id="loadRemoteMailImages"
          label="Load remote images in messages"
          description="Off by default: remote images are the standard tracking-pixel mechanism and reveal that the mail was opened."
          checked={settings.loadRemoteMailImages}
          onChange={(checked) => void update({ loadRemoteMailImages: checked })}
        />

        <ToggleRow
          id="notifyOnVerificationCode"
          label="Highlight verification codes"
          description="Extracts a likely 6-digit code from each message and surfaces it as a one-click copy."
          checked={settings.notifyOnVerificationCode}
          onChange={(checked) => void update({ notifyOnVerificationCode: checked })}
        />
      </SectionCard>

      <SectionCard
        icon={<ShieldCheck size={15} />}
        title="Discord sessions"
        description="How captured tokens are re-validated and how long their secrets stay in the vault."
      >
        <ToggleRow
          id="tokenHealthCheckEnabled"
          label="Token health check"
          description="Re-checks every stored Discord token on a schedule and marks revoked ones as dead. A network failure never changes a status."
          checked={settings.tokenHealthCheckEnabled}
          onChange={(checked) => void update({ tokenHealthCheckEnabled: checked })}
        />

        <RangeRow
          id="tokenHealthCheckIntervalHours"
          label="Health check interval"
          description="Hours between sweeps. Shorter intervals find dead tokens sooner and spend more requests."
          value={settings.tokenHealthCheckIntervalHours}
          min={SETTINGS_BOUNDS.tokenHealthCheckIntervalHours.min}
          max={SETTINGS_BOUNDS.tokenHealthCheckIntervalHours.max}
          step={SETTINGS_BOUNDS.tokenHealthCheckIntervalHours.step}
          onChange={(value) => void update({ tokenHealthCheckIntervalHours: value })}
          format={(value) => `${value}h`}
        />
      </SectionCard>

      <SectionCard
        icon={<Palette size={15} />}
        title="Appearance"
        description="Both themes use Discord's own palette so the extension feels native."
      >
        <SettingRow
          label="Theme"
          control={
            <SelectField
              id="theme"
              ariaLabel="Theme"
              value={settings.theme}
              onChange={(value) => void update({ theme: value })}
              options={[
                { value: 'discordDark', label: 'Discord Dark' },
                { value: 'discordMidnight', label: 'Midnight' },
              ]}
            />
          }
        />

        <ToggleRow
          id="reduceMotion"
          label="Reduce motion"
          description="Disables transitions and entrance animations."
          checked={settings.reduceMotion}
          onChange={(checked) => void update({ reduceMotion: checked })}
        />

        <ToggleRow
          id="revealSecretsByDefault"
          label="Reveal secrets by default"
          description="Shows passwords in plain text when a card opens. Off is safer on a shared screen."
          checked={settings.revealSecretsByDefault}
          onChange={(checked) => void update({ revealSecretsByDefault: checked })}
        />

        <ToggleRow
          id="confirmDestructiveActions"
          label="Confirm destructive actions"
          description="Ask before deleting an account or clearing stored data."
          checked={settings.confirmDestructiveActions}
          onChange={(checked) => void update({ confirmDestructiveActions: checked })}
        />
      </SectionCard>

      <SectionCard
        icon={<MonitorSmartphone size={15} />}
        title="In-page launcher"
        description="A small floating pill appears on Discord so the tools are one click away without reaching for the toolbar."
      >
        <ToggleRow
          id="showPageLauncher"
          label="Show the launcher on Discord"
          description="Inject a draggable launcher into discord.com pages. It only acts when you click it."
          checked={settings.showPageLauncher}
          onChange={(checked) => void update({ showPageLauncher: checked })}
        />

        <SettingRow
          label="Launcher side"
          control={
            <SelectField
              id="launcherEdge"
              ariaLabel="Launcher side"
              value={settings.launcherEdge}
              onChange={(value) => void update({ launcherEdge: value })}
              options={[
                { value: 'right', label: 'Bottom right' },
                { value: 'left', label: 'Bottom left' },
              ]}
            />
          }
        />

        <ToggleRow
          id="launcherCompact"
          label="Start collapsed"
          description="Show only a 40px circle until you hover it."
          checked={settings.launcherCompact}
          onChange={(checked) => void update({ launcherCompact: checked })}
        />
      </SectionCard>

      <SectionCard
        icon={<HardDrive size={15} />}
        title="Storage & data"
        description="Everything is stored locally in this browser profile. Nothing is uploaded anywhere."
      >
        <RangeRow
          id="clipboardClearSeconds"
          label="Clipboard auto-clear"
          description="Seconds before a copied secret is wiped. Set to 0 to disable."
          value={settings.clipboardClearSeconds}
          min={SETTINGS_BOUNDS.clipboardClearSeconds.min}
          max={SETTINGS_BOUNDS.clipboardClearSeconds.max}
          step={5}
          onChange={(value) => void update({ clipboardClearSeconds: value })}
          format={(value) => (value === 0 ? 'off' : `${value}s`)}
        />

        <RangeRow
          id="maxStoredAccounts"
          label="Maximum stored accounts"
          description="Oldest records are dropped once the cap is reached."
          value={settings.maxStoredAccounts}
          min={SETTINGS_BOUNDS.maxStoredAccounts.min}
          max={SETTINGS_BOUNDS.maxStoredAccounts.max}
          step={10}
          onChange={(value) => void update({ maxStoredAccounts: value })}
        />

        <InfoRow
          icon={<Database size={13} />}
          label="Local storage used"
          value={storageBytes === null ? 'unavailable' : formatBytes(storageBytes)}
        />

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant="dangerOutline"
            size="sm"
            onClick={() => onRequestClear('accounts')}
            icon={<Eraser size={14} />}
          >
            Clear accounts
          </Button>
          <Button variant="dangerOutline" size="sm" onClick={() => onRequestClear('activity')}>
            Clear activity log
          </Button>
          <Button variant="dangerOutline" size="sm" onClick={() => onRequestClear('everything')}>
            Clear everything
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void reset()} icon={<RotateCcw size={14} />}>
            Reset settings
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        icon={<Info size={15} />}
        title={`About ${APP_NAME}`}
        description="A local-only toolkit for preparing account registrations."
      >
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Chip tone="accent" icon={<Sparkles size={11} />}>
            Manifest V3
          </Chip>
          <Chip icon={<Moon size={11} />}>Offline-capable generator</Chip>
          <Chip tone="success">No telemetry</Chip>
        </div>

        <p className="SettingRow__description">
          This extension prepares credentials and reserves a temporary mailbox. It does not solve
          captchas, submit registration forms, spoof device fingerprints or rotate proxies. Those stay
          manual on purpose: they are the behaviours platform anti-abuse systems are built to detect,
          and automating them is outside this tool&apos;s scope.
        </p>

        <InfoRow label="Version" value={chrome.runtime.getManifest().version} />
        <InfoRow label="Extension ID" value={chrome.runtime.id.slice(0, 12)} />
      </SectionCard>
    </div>
  );
}
