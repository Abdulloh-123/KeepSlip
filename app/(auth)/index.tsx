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
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import type { AccountType } from '@/lib/supabase';
import { ERROR_COPY } from '@/lib/errors';
import { trackError, trackEvent } from '@/lib/analytics';

const emailRedirectTo = Linking.createURL('/');

function validateAuthForm(email: string, password: string): string | null {
  const trimmedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Enter a valid email address.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  return null;
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'welcome' | 'signin' | 'signup'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('individual');
  const [fullName, setFullName] = useState('');
  const [workField, setWorkField] = useState('');
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleSignUp() {
    setFormError('');
    const validationError = validateAuthForm(email, password);
    if (validationError) {
      setFormError(validationError);
      void trackEvent('auth_signup_failed', { reason: 'validation' }, 'auth');
      return;
    }
    if (fullName.trim().length < 2) {
      setFormError('Enter your name so we can set up your account.');
      void trackEvent('auth_signup_failed', { reason: 'missing_name' }, 'auth');
      return;
    }

    setLoading(true);
    try {
      void trackEvent('auth_signup_started', {
        account_type: accountType,
        has_work_field: Boolean(workField.trim()),
      }, 'auth');
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo,
          data: {
            account_type: accountType,
            full_name: fullName.trim(),
            work_field: workField.trim() || null,
          },
        },
      });
      if (error) {
        setFormError(ERROR_COPY.signUp);
        void trackError(error, {
          screen: 'auth',
          properties: { mode: 'signup', account_type: accountType },
        });
        void trackEvent('auth_signup_failed', { reason: 'provider_error' }, 'auth');
      } else {
        void trackEvent('auth_signup_succeeded', { account_type: accountType }, 'auth');
        Alert.alert('Check your email', 'We sent you a confirmation link.');
      }
    } catch (error) {
      setFormError(ERROR_COPY.signUp);
      void trackError(error, { screen: 'auth', properties: { mode: 'signup' } });
      void trackEvent('auth_signup_failed', { reason: 'unexpected_error' }, 'auth');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setFormError('');
    const validationError = validateAuthForm(email, password);
    if (validationError) {
      setFormError(validationError);
      void trackEvent('auth_signin_failed', { reason: 'validation' }, 'auth');
      return;
    }

    setLoading(true);
    try {
      void trackEvent('auth_signin_started', {}, 'auth');
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        setFormError(ERROR_COPY.auth);
        void trackError(error, { screen: 'auth', properties: { mode: 'signin' } });
        void trackEvent('auth_signin_failed', { reason: 'provider_error' }, 'auth');
      } else {
        void trackEvent('auth_signin_succeeded', {}, 'auth');
      }
    } catch (error) {
      setFormError(ERROR_COPY.auth);
      void trackError(error, { screen: 'auth', properties: { mode: 'signin' } });
      void trackEvent('auth_signin_failed', { reason: 'unexpected_error' }, 'auth');
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

        {mode === 'signup' ? (
          <View style={styles.profileFields}>
            <View style={styles.segmented}>
              {(['individual', 'business'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.segment,
                    accountType === type && styles.segmentActive,
                  ]}
                  onPress={() => setAccountType(type)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      accountType === type && styles.segmentTextActive,
                    ]}
                  >
                    {type === 'individual' ? 'Individual' : 'Business'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              textContentType="name"
              value={fullName}
              onChangeText={setFullName}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Field you work in (optional)"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              value={workField}
              onChangeText={setWorkField}
              editable={!loading}
            />
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#9CA3AF"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signup' ? 'newPassword' : 'password'}
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
  profileFields: {
    marginBottom: 4,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
  },
  segment: {
    flex: 1,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: '#fff',
  },
  segmentText: {
    fontFamily: 'DMSans-Medium',
    fontSize: 14,
    color: '#6B7280',
  },
  segmentTextActive: {
    fontFamily: 'DMSans-SemiBold',
    color: '#0D9488',
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
