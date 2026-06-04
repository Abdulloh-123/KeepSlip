import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import type { Receipt } from '@/types/receipt';

const CATEGORY_COLORS: Record<string, string> = {
  'Food & Drink': '#F59E0B',
  'Transport': '#3B82F6',
  'Tools & Materials': '#8B5CF6',
  'Office': '#6B7280',
  'Clothing': '#EC4899',
  'Health': '#10B981',
  'Entertainment': '#EF4444',
  'Accommodation': '#F97316',
  'Utilities': '#14B8A6',
  'Other': '#9CA3AF',
};

const SOURCE_LABELS: Record<string, string> = {
  manual_scan: 'Scanned',
  email_agent: 'Imported',
  store_tap: 'Store tap',
};

function categoryColor(category: string | null): string {
  return CATEGORY_COLORS[category ?? ''] ?? '#22C55E';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' });
}

interface Props {
  receipt: Receipt;
  onPress: () => void;
}

export function ReceiptCard({ receipt, onPress }: Props) {
  const color = categoryColor(receipt.category);
  const sourceLabel = SOURCE_LABELS[receipt.source] ?? receipt.source.replace(/_/g, ' ');

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.avatar, { backgroundColor: color + '33' }]}>
        <Text style={[styles.avatarText, { color }]}>
          {receipt.merchant_name.slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.merchant} numberOfLines={1}>
          {receipt.merchant_name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatDate(receipt.date)} · {sourceLabel}
        </Text>
      </View>
      <Text style={styles.amount}>${receipt.total_amount.toFixed(2)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 13,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  merchant: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 15,
    color: '#0C0C0C',
  },
  sub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 12,
    color: '#6B7280',
  },
  amount: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 16,
    color: '#0C0C0C',
  },
});
