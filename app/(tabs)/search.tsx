import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Search as SearchIcon, X } from 'lucide-react-native';
import { useSearch } from '@/hooks/useSearch';
import { ReceiptCard } from '@/components/ReceiptCard';
import type { Receipt } from '@/types/receipt';

const FILTER_PILLS = ['All', 'This Month', 'Groceries', '< $100'] as const;
type FilterPill = (typeof FILTER_PILLS)[number];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterPill>('All');
  const { results, loading } = useSearch(query);

  const filtered = results.filter((r) => {
    if (activeFilter === 'This Month') {
      const now = new Date();
      const d = new Date(r.date);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (activeFilter === 'Groceries') {
      return r.category === 'Food & Drink';
    }
    if (activeFilter === '< $100') {
      return r.total_amount < 100;
    }
    return true;
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <SearchIcon size={14} color="#9CA3AF" />
          <TextInput
            style={styles.input}
            placeholder="Search receipts…"
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery('')}
              style={styles.clearBtn}
              activeOpacity={0.7}
            >
              <View style={styles.clearCircle}>
                <X size={10} color="#6B7280" />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.pillsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillsContent}>
          {FILTER_PILLS.map((pill) => (
            <TouchableOpacity
              key={pill}
              style={[styles.pill, activeFilter === pill && styles.pillActive]}
              onPress={() => setActiveFilter(pill)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillText, activeFilter === pill && styles.pillTextActive]}>
                {pill}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Results */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#0D9488" />
        </View>
      ) : query.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.hint}>Search by merchant, category, or amount</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.noResults}>No receipts match "{query}"</Text>
        </View>
      ) : (
        <>
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
          />
          {/* Result count footer */}
          <View style={styles.footer}>
            <SearchIcon size={14} color="#9CA3AF" />
            <Text style={styles.footerText}>
              {filtered.length} receipt{filtered.length !== 1 ? 's' : ''} match
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchWrap: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#374151',
  },
  clearBtn: {
    padding: 2,
  },
  clearCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillsRow: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pillsContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    borderRadius: 9999,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pillActive: {
    backgroundColor: '#0D9488',
  },
  pillText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: '#374151',
  },
  pillTextActive: {
    fontFamily: 'DMSans-SemiBold',
    color: '#fff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  hint: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  noResults: {
    fontFamily: 'DMSans-Regular',
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 0,
  },
  footerText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 12,
    color: '#6B7280',
  },
});
