import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';

export default function WelcomeScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'welcome' | 'signin' | 'signup'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleSignUp() {
    setFormError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setFormError(ERROR_COPY.signUp);
      } else {
        Alert.alert('Check your email', 'We sent you a confirmation link.');
      }
    } catch {
      setFormError(ERROR_COPY.signUp);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setFormError('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setFormError(ERROR_COPY.auth);
      }
    } catch {
      setFormError(ERROR_COPY.auth);
    } finally {
      setLoading(false);
    }
    // navigation handled by onAuthStateChange in root layout
  }

  if (mode === 'welcome') {
    return (
      <View style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoMark}>
            <Text style={styles.logoText}>IR</Text>
          </View>
          <Text style={styles.headline}>All your receipts,{'\n'}one place.</Text>
          <Text style={styles.sub}>
            Scan paper receipts, upload files and photos, search everything.
          </Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => setMode('signup')}
          >
            <Text style={styles.primaryBtnText}>Get started — it's free</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setMode('signin')}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => setMode('welcome')}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.formTitle}>
          {mode === 'signup' ? 'Create account' : 'Welcome back'}
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!loading}
        />

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={mode === 'signup' ? handleSignUp : handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {mode === 'signup' ? 'Create account' : 'Sign in'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        >
          <Text style={styles.switchText}>
            {mode === 'signup'
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#0D9488',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  logoText: {
    fontFamily: 'DMSans-Bold',
    fontSize: 24,
    color: '#fff',
  },
  headline: {
    fontFamily: 'DMSans-Bold',
    fontSize: 32,
    color: '#111827',
    textAlign: 'center',
    lineHeight: 40,
    marginBottom: 16,
  },
  sub: {
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#0D9488',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontFamily: 'DMSans-SemiBold',
    fontSize: 16,
    color: '#fff',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#374151',
  },
  back: {
    marginBottom: 32,
  },
  backText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 16,
    color: '#0D9488',
  },
  formTitle: {
    fontFamily: 'DMSans-Bold',
    fontSize: 28,
    color: '#111827',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: 'DMSans-Regular',
    fontSize: 16,
    color: '#111827',
    marginBottom: 12,
  },
  switchText: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 20,
  },
  formError: {
    fontFamily: 'DMSans-Regular',
    fontSize: 14,
    color: '#DC2626',
    lineHeight: 20,
    marginBottom: 12,
  },
});
