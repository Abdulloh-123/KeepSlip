export type ReceiptSource =
  | 'manual_scan'
  | 'email_agent'
  | 'store_tap'
  | 'manual_scan + email_agent';

export type AttachmentType = 'none' | 'pdf' | 'image' | 'link_only';

export interface LineItem {
  description: string;
  amount: number;
}

export interface Receipt {
  id: string;
  user_id: string;
  source: ReceiptSource;
  merchant_name: string;
  date: string; // ISO 8601 date string
  total_amount: number;
  currency: string; // ISO 4217
  category: string | null;
  is_business: boolean;
  line_items: LineItem[];
  image_url: string | null;
  pdf_url: string | null;
  email_source: string | null;
  email_message_id: string | null;
  email_rfc822_message_id: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  attachment_type: AttachmentType | null;
  raw_text: string | null;
  created_at: string;
}

export type ReceiptInsert = Omit<
  Receipt,
  'id' | 'user_id' | 'created_at' | 'email_message_id' | 'email_rfc822_message_id' | 'email_subject' | 'email_received_at'
> & {
  email_message_id?: string | null;
  email_rfc822_message_id?: string | null;
  email_subject?: string | null;
  email_received_at?: string | null;
};

export const CATEGORIES = [
  'Food & Drink',
  'Transport',
  'Tools & Materials',
  'Office',
  'Clothing',
  'Health',
  'Entertainment',
  'Accommodation',
  'Utilities',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];
