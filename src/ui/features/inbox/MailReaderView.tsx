import { useMemo, useState, type ReactNode } from 'react';
import { ExternalLink, ImageOff, ShieldAlert } from 'lucide-react';
import type { TempMailMessage } from '../../../shared/types/Mail';
import { sanitizeMailHtml } from '../../../email/MailBodySanitizer';
import { extractReadableText, parseFromHeader } from '../../../email/MailTextExtractor';
import { extractActionLinks, extractVerificationCode } from '../../../email/VerificationCodeExtractor';
import { formatDateTime } from '../../lib/FormatDate';
import { formatBytes } from '../../lib/FormatUnits';
import { Avatar } from '../../components/Data';
import { Button, Chip } from '../../components/Primitives';
import { useCopy } from '../../hooks/useCopy';

export interface MailReaderViewProps {
  message: TempMailMessage;
  loadRemoteImages: boolean;
  clipboardClearSeconds: number;
}

type BodyMode = 'html' | 'text';

/**
 * Message reader.
 *
 * The HTML body is untrusted, so it is sanitized with DOMPurify and then
 * rendered inside a sandboxed iframe with no `allow-scripts`. Sanitization is
 * the first line of defence and the sandbox is the second; neither substitutes
 * for the other, which is why both are present.
 */
export function MailReaderView({
  message,
  loadRemoteImages,
  clipboardClearSeconds,
}: MailReaderViewProps): ReactNode {
  const { copy } = useCopy(clipboardClearSeconds);
  const [mode, setMode] = useState<BodyMode>(message.body_text ? 'text' : 'html');

  const { displayName, address } = useMemo(
    () => parseFromHeader(message.from_addr),
    [message.from_addr],
  );

  const sanitized = useMemo(
    () =>
      sanitizeMailHtml(message.body_html, {
        allowRemoteImages: loadRemoteImages,
        inlineImages: message.inline_images,
      }),
    [message.body_html, message.inline_images, loadRemoteImages],
  );

  const plainText = useMemo(() => {
    const fromText = message.body_text?.trim();
    return fromText ? fromText : extractReadableText(message.body_html);
  }, [message.body_text, message.body_html]);

  const verification = useMemo(
    () =>
      extractVerificationCode({
        subject: message.subject,
        bodyText: message.body_text,
        bodyHtml: message.body_html,
      }),
    [message.subject, message.body_text, message.body_html],
  );

  const actionLinks = useMemo(
    () => extractActionLinks(message.body_text, message.body_html),
    [message.body_text, message.body_html],
  );

  const sandboxedHtml = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>
  html,body{margin:0;padding:16px;background:#fff;color:#1a1a1a;
    font:14px/1.55 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    word-break:break-word;overflow-wrap:anywhere;}
  img{max-width:100%;height:auto;}
  table{max-width:100%;}
  a{color:#0060df;}
</style></head><body>${sanitized.html}</body></html>`,
    [sanitized.html],
  );

  return (
    <div className="MailReader">
      <header className="MailReader__header">
        <h2 className="MailReader__subject">{message.subject || '(no subject)'}</h2>

        <div className="MailReader__from">
          <Avatar seed={address || displayName} label={displayName} size="sm" />
          <span style={{ color: 'var(--text-secondary)' }}>{displayName}</span>
          {address && address !== displayName ? <span>&lt;{address}&gt;</span> : null}
          <span>·</span>
          <span>{formatDateTime(parseLocalDate(message.date))}</span>
          {message.size > 0 ? (
            <>
              <span>·</span>
              <span>{formatBytes(message.size)}</span>
            </>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button
            variant={mode === 'text' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('text')}
          >
            Text
          </Button>
          <Button
            variant={mode === 'html' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setMode('html')}
            disabled={!message.body_html}
          >
            Original
          </Button>

          <div style={{ marginLeft: 'auto' }}>
            {message.has_attachments ? <Chip tone="warning">Has attachments</Chip> : null}
          </div>
        </div>
      </header>

      {verification ? (
        <div className="VerificationBanner">
          <span className="VerificationBanner__code">{verification.code}</span>
          <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minWidth: 0 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Likely verification code
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Found in the {verification.source} · {verification.confidence} confidence
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void copy(verification.code, 'Verification code')}
          >
            Copy code
          </Button>
        </div>
      ) : null}

      {sanitized.blockedRemoteCount > 0 ? (
        <div className="MailReader__notice">
          <ImageOff size={14} aria-hidden="true" />
          {sanitized.blockedRemoteCount} remote image
          {sanitized.blockedRemoteCount === 1 ? '' : 's'} blocked. Enable remote content in Settings to
          load them.
        </div>
      ) : null}

      <div className="MailReader__body">
        {mode === 'html' ? (
          <iframe
            title="Email content"
            className="MailReader__frame"
            // Empty sandbox: even a sanitizer bypass cannot execute script here.
            sandbox=""
            referrerPolicy="no-referrer"
            srcDoc={sandboxedHtml}
          />
        ) : (
          <pre className="MailReader__plain">{plainText || 'This message has no readable body.'}</pre>
        )}
      </div>

      {actionLinks.length > 0 ? (
        <div className="Toolbar" style={{ borderTop: '1px solid var(--divider)', borderBottom: 0 }}>
          <ShieldAlert size={14} style={{ color: 'var(--yellow)' }} aria-hidden="true" />
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Links:</span>

          {actionLinks.map((link) => (
            <Button
              key={link.url}
              variant="ghost"
              size="sm"
              icon={<ExternalLink size={13} />}
              onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
              title={link.url}
            >
              {link.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Local-naive timestamp, matching the backend's own format. */
function parseLocalDate(value: string): number | null {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
