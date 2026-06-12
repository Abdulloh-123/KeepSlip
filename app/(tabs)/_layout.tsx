import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Receipt, Search, User, Plus } from 'lucide-react-native';
import { trackEvent } from '@/lib/analytics';

const TAB_BAR_HEIGHT = 72;
const FAB_SIZE = 56;

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#F3F4F6',
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: '#0D9488',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: {
          fontFamily: 'DMSans-Medium',
          fontSize: 11,
        },
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Receipts',
          tabBarIcon: ({ color, size }) => (
            <Receipt size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Search size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.tabSlots}>
        {state.routes.slice(0, 2).map((route: any) => (
          <TabButton
            key={route.key}
            route={route}
            descriptors={descriptors}
            navigation={navigation}
            isFocused={state.routes[state.index]?.key === route.key}
          />
        ))}
        <View style={styles.fabSlot}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => {
              void trackEvent('add_receipt_opened', {}, 'tabs');
              router.push('/add-receipt');
            }}
            activeOpacity={0.85}
          >
            <Plus size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        {state.routes.slice(2).map((route: any) => (
          <TabButton
            key={route.key}
            route={route}
            descriptors={descriptors}
            navigation={navigation}
            isFocused={state.routes[state.index]?.key === route.key}
          />
        ))}
      </View>
    </View>
  );
}

function TabButton({ route, descriptors, navigation, isFocused }: any) {
  const { options } = descriptors[route.key];
  const label = options.title ?? route.name;
  const color = isFocused ? '#0D9488' : '#9CA3AF';

  const onPress = () => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      void trackEvent('tab_selected', { tab: route.name }, 'tabs');
      navigation.navigate(route.name);
    }
  };

  const Icon = options.tabBarIcon?.({ color, size: 24, focused: isFocused });

  return (
    <TouchableOpacity
      style={styles.tab}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {Icon}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
  },
  tabSlots: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontFamily: 'DMSans-Medium',
    fontSize: 11,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
});
