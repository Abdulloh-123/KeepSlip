import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useReceipts } from '@/hooks/useReceipts';
import { ReceiptCard } from '@/components/ReceiptCard';
import { CATEGORIES } from '@/types/receipt';
import type { Receipt } from '@/types/receipt';

const CATEGORY_FILTERS = ['All', ...CATEGORIES] as const;

function formatMonthYear(date: Date) {
  return date.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

export default function ReceiptListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { receipts, loading, error, refresh, thisMonthSpend, thisMonthCount } = useReceipts();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [refreshing, setRefreshing] = useState(false);

  const filtered =
    activeCategory === 'All'
      ? receipts
      : receipts.filter((r) => r.category === activeCategory);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Teal header */}
      <View style={styles.header}>
        <View style={styles.appBar}>
          <Text style={styles.appName}>KeepSlip</Text>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>K</Text>
          </View>
        </View>
        <View style={styles.amtBlock}>
          <Text style={styles.amtLabel}>THIS MONTH</Text>
          <Text style={styles.amtValue}>${thisMonthSpend.toFixed(0)}</Text>
          <Text style={styles.amtSub}>
            {thisMonthCount} receipt{thisMonthCount !== 1 ? 's' : ''} · {formatMonthYear(new Date())}
          </Text>
        </View>
      </View>

      {/* Category filter pills */}
      <View style={styles.pillsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContent}>
          {CATEGORY_FILTERS.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.pill, activeCategory === cat && styles.pillActive]}
              onPress={() => setActiveCategory(cat)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, activeCategory === cat && styles.pillTextActive]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Receipt list */}
      {loading && !refreshing ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0D9488" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load receipts</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No receipts yet</Text>
          <Text style={styles.emptyBody}>
            Tap + to scan a paper receipt or import from Gmail
          </Text>
        </View>
      ) : (
        <FlashList
          data={filtered}
          estimatedItemSize={80}
          keyExtractor={(item: Receipt) => item.id}
          renderItem={({ item }: { item: Receipt }) => (
            <ReceiptCard
              receipt={item}
              onPress={() => router.push(`/receipt/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0D9488"
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#0D9488',
    paddingBottom: 24,
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  appName: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 22,
    color: '#fff',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F766E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 15,
    color: '#fff',
  },
  amtBlock: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 6,
  },
  amtLabel: {
    fontFamily: 'DMSans-Bold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.5,
  },
  amtValue: {
    fontFamily: 'CabinetGrotesk-Bold',
    fontSize: 48,
    color: '#fff',
    lineHeight: 56,
  },
  amtSub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  pillsRow: {
    backgroundColor: '#fff',
  },
  pillsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    borderRadius: 9999,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pillActive: {
    backgroundColor: '#0D9488',
  },
  pillText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#6B7280',
  },
  pillTextActive: {
    fontFamily: 'DMSans-SemiBold',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 100,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 18,
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#EF4444',
    marginBottom: 8,
  },
  retryText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 15,
    color: '#0D9488',
  },
});
