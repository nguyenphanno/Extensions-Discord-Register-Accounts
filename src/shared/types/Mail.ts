/** A single message as returned by the temp-mail backend. */
export interface TempMailMessage {
  id: number;
  from_addr: string;
  to_addr: string;
  subject: string;
  /** Local-naive ISO timestamp, e.g. `2025-11-29T10:35:00`. */
  date: string;
  body_text: string;
  body_html: string;
  inline_images: Record<string, string>;
  has_attachments: boolean;
  size: number;
  flags: string[];
  message_id: string;
  in_reply_to: string | null;
  references: string | null;
}

/** Result of a verification-code scan over a message body. */
export interface VerificationCodeMatch {
  code: string;
  /** Where the code was found, so the UI can explain the hit. */
  source: 'subject' | 'text' | 'html';
  confidence: 'high' | 'medium';
}

/** Derived, UI-friendly view of a message. */
export interface MailSummary {
  id: number;
  subject: string;
  fromAddress: string;
  fromDisplayName: string;
  receivedAt: number | null;
  preview: string;
  hasAttachments: boolean;
  isUnread: boolean;
  size: number;
  verificationCode: string | null;
}
