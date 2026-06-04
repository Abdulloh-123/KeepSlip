import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import WelcomeScreen from '../app/(auth)/index';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'ireceipt://'),
}));

const mockAuth = supabase.auth as jest.Mocked<typeof supabase.auth>;

describe('WelcomeScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders welcome view with CTA buttons', () => {
    const { getByText } = render(<WelcomeScreen />);
    expect(getByText("Get started — it's free")).toBeTruthy();
    expect(getByText('I already have an account')).toBeTruthy();
  });

  it('navigates to sign-up form on primary CTA tap', () => {
    const { getByText, getByPlaceholderText } = render(<WelcomeScreen />);
    fireEvent.press(getByText("Get started — it's free"));
    expect(getByPlaceholderText('Email')).toBeTruthy();
  });

  it('navigates to sign-in form on secondary CTA tap', () => {
    const { getByText } = render(<WelcomeScreen />);
    fireEvent.press(getByText('I already have an account'));
    expect(getByText('Welcome back')).toBeTruthy();
  });

  it('calls signUp with email and password', async () => {
    (mockAuth.signUp as jest.Mock).mockResolvedValue({ error: null });
    const { getByText, getByPlaceholderText, getAllByText } = render(<WelcomeScreen />);

    fireEvent.press(getByText("Get started — it's free"));
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password123');
    fireEvent.press(getAllByText('Create account')[1]);

    await waitFor(() =>
      expect(mockAuth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: { emailRedirectTo: 'ireceipt://' },
      })
    );
  });

  it('shows error alert when signIn fails', async () => {
    (mockAuth.signInWithPassword as jest.Mock).mockResolvedValue({
      error: { message: 'Invalid credentials' },
    });
    const { getByText, getByPlaceholderText } = render(<WelcomeScreen />);

    fireEvent.press(getByText('I already have an account'));
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrongpass');
    fireEvent.press(getByText('Sign in'));

    await waitFor(() =>
      expect(mockAuth.signInWithPassword).toHaveBeenCalled()
    );
  });
});
