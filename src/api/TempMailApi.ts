import type { TempMailMessage } from '../shared/types/Mail';
import { ApiClient } from './ApiClient';
import { ApiPaths } from './ApiEndpoints';
import type {
  ChangePasswordPayload,
  DomainsPayload,
  EmailGetPayload,
  EmailViewPayload,
  LoginPayload,
  RandomEmailPayload,
  RegisterPayload,
} from './ApiTypes';

/**
 * Typed facade over the Cheapluxury TempMail REST API.
 * Each method maps to exactly one documented endpoint - no hidden chaining,
 * so callers stay in control of when they spend a request against the rate limit.
 */
export class TempMailApi {
  constructor(private readonly client: ApiClient) {}

  /** `GET /domains` - every domain currently accepting registrations. */
  async listDomains(): Promise<string[]> {
    const payload = await this.client.get<DomainsPayload>(ApiPaths.domains);
    const domains = Array.isArray(payload?.domains) ? payload.domains : [];
    return domains
      .filter((domain): domain is string => typeof domain === 'string')
      .map((domain) => domain.trim().toLowerCase())
      .filter((domain) => domain.length > 0);
  }

  /** `POST /register` - claim a specific address on a specific domain. */
  async register(email: string, password: string): Promise<string> {
    const payload = await this.client.post<RegisterPayload>(ApiPaths.register, {
      email,
      password,
    });
    return payload?.email ?? email;
  }

  /** `GET /random_email` - server-side address + password shortcut. */
  async randomEmail(): Promise<{ email: string; password: string }> {
    return this.client.get<RandomEmailPayload>(ApiPaths.randomEmail);
  }

  /** `POST /login` - authenticates and returns the current inbox snapshot. */
  async login(email: string, password: string): Promise<TempMailMessage[]> {
    const payload = await this.client.post<LoginPayload>(ApiPaths.login, { email, password });
    return normalizeMessages(payload?.emails);
  }

  /** `POST /email/get` - inbox snapshot without a full login handshake. */
  async getEmails(email: string, password: string): Promise<TempMailMessage[]> {
    const payload = await this.client.post<EmailGetPayload>(ApiPaths.emailGet, {
      email,
      password,
    });
    return normalizeMessages(payload?.emails);
  }

  /** `POST /email/view` - one message resolved by its `Message-ID`. */
  async viewEmail(email: string, password: string, messageId: string): Promise<TempMailMessage> {
    const payload = await this.client.post<EmailViewPayload>(ApiPaths.emailView, {
      email,
      password,
      message_id: messageId,
    });
    return normalizeMessage(payload?.email);
  }

  /** `POST /change_password` - rotates a mailbox password. */
  async changePassword(email: string, currentPassword: string, newPassword: string): Promise<string> {
    const payload = await this.client.post<ChangePasswordPayload>(ApiPaths.changePassword, {
      email,
      current_password: currentPassword,
      new_password: newPassword,
    });
    return payload?.email ?? email;
  }
}

/** Coerces an unknown array into well-formed messages, dropping junk entries. */
export function normalizeMessages(raw: unknown): TempMailMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => normalizeMessage(entry));
}

/** Fills in every documented field so downstream code never sees `undefined`. */
export function normalizeMessage(raw: unknown): TempMailMessage {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<TempMailMessage>;

  return {
    id: typeof source.id === 'number' ? source.id : 0,
    from_addr: typeof source.from_addr === 'string' ? source.from_addr : '',
    to_addr: typeof source.to_addr === 'string' ? source.to_addr : '',
    subject: typeof source.subject === 'string' ? source.subject : '(no subject)',
    date: typeof source.date === 'string' ? source.date : '',
    body_text: typeof source.body_text === 'string' ? source.body_text : '',
    body_html: typeof source.body_html === 'string' ? source.body_html : '',
    inline_images:
      typeof source.inline_images === 'object' && source.inline_images !== null
        ? source.inline_images
        : {},
    has_attachments: source.has_attachments === true,
    size: typeof source.size === 'number' ? source.size : 0,
    flags: Array.isArray(source.flags) ? source.flags.filter((f) => typeof f === 'string') : [],
    message_id: typeof source.message_id === 'string' ? source.message_id : '',
    in_reply_to: typeof source.in_reply_to === 'string' ? source.in_reply_to : null,
    references: typeof source.references === 'string' ? source.references : null,
  };
}
