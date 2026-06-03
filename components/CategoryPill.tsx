import { TouchableOpacity, Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  active: boolean;
  onPress: () => void;
}

export function CategoryPill({ label, active, onPress }: Props) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#fff',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  pillActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  label: {
    fontFamily: 'DMSans-Medium',
    fontSize: 13,
    color: '#6B7280',
  },
  labelActive: {
    color: '#fff',
  },
});
