import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import App from '../App';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { AuthModal } from '../components/auth/AuthModal';

function TestAuthConsumer() {
  const { status, user, logout } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{status}</span>
      <span data-testid="auth-user">{user ? JSON.stringify(user) : 'null'}</span>
      <button type="button" onClick={logout}>
        Trigger Logout
      </button>
    </div>
  );
}

describe('Optional Authentication Foundation — Phase 1', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it('initializes in guest mode by default with no user data or token', () => {
    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('guest');
    expect(screen.getByTestId('auth-user')).toHaveTextContent('null');
  });

  it('renders Sign Up (primary), Login (secondary), and Model Info in the Header without Supported Crops link', () => {
    render(<App initialView="diagnose" />);

    // Model Info link is now active in navigation
    const modelInfoLinks = screen.queryAllByRole('link', { name: /model info/i });
    expect(modelInfoLinks.length).toBeGreaterThan(0);

    // Supported crops link removed from navigation
    const supportedCropsLinks = screen.queryAllByRole('link', { name: /supported crops/i });
    expect(supportedCropsLinks).toHaveLength(0);

    // Primary action: Sign Up
    const signUpButton = screen.getByRole('button', { name: /^sign up$/i });
    expect(signUpButton).toBeInTheDocument();
    expect(signUpButton).toHaveClass('bg-[#FFB700]');

    // Secondary action: Login
    const loginButton = screen.getByRole('button', { name: /^login$/i });
    expect(loginButton).toBeInTheDocument();
  });

  it('ensures diagnosis workbench is completely accessible to guest without login walls', () => {
    render(<App initialView="diagnose" />);

    // No modal is open initially
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Plant disease diagnosis workbench is present and interactive
    expect(
      screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/upload crop or leaf image/i)).toBeInTheDocument();
  });

  it('ensures crop recommendation feature is fully accessible as a guest without redirect', () => {
    render(<App initialView="diagnose" />);

    // Click "Get Recommendations" from bonus features
    const getRecsBtn = screen.getByRole('button', { name: /try crop recommendation — get recommendations/i });
    fireEvent.click(getRecsBtn);

    // Navigates directly to CropRecommendationPage without login redirect
    expect(
      screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('navigates to dedicated Login view when Login is clicked and returns to app on Continue as Guest', () => {
    render(<App initialView="diagnose" />);

    const loginButton = screen.getByRole('button', { name: /^login$/i });
    fireEvent.click(loginButton);

    // Dedicated Login view rendered
    expect(screen.getByRole('heading', { name: /sign in to agrinexa ai/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

    // Verifies the notice is visible
    expect(
      screen.getByText(/authentication is optional\. guest users can freely use plant diagnosis and crop recommendations without registering/i)
    ).toBeInTheDocument();

    // Click Continue as Guest returns to home
    const continueGuestBtn = screen.getByRole('button', { name: /continue as guest/i });
    fireEvent.click(continueGuestBtn);

    expect(screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })).toBeInTheDocument();
  });

  it('navigates to dedicated Sign Up view when Sign Up is clicked and allows switching to Login', () => {
    render(<App initialView="diagnose" />);

    const signUpButton = screen.getByRole('button', { name: /^sign up$/i });
    fireEvent.click(signUpButton);

    // Dedicated Sign Up view rendered
    expect(screen.getByRole('heading', { name: /create an agrinexa ai account/i, level: 1 })).toBeInTheDocument();

    // Switch to Sign In from link
    const signInSwitch = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(signInSwitch);

    expect(screen.getByRole('heading', { name: /sign in to agrinexa ai/i, level: 1 })).toBeInTheDocument();
  });

  it('preserves and returns to previous relevant page (crop recommendation) after skipping auth', () => {
    render(<App initialView="diagnose" />);

    // Go to Crop Recommendation
    const getRecsBtn = screen.getByRole('button', { name: /try crop recommendation — get recommendations/i });
    fireEvent.click(getRecsBtn);
    expect(screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })).toBeInTheDocument();

    // Navigate to Login
    const loginButton = screen.getByRole('button', { name: /^login$/i });
    fireEvent.click(loginButton);
    expect(screen.getByRole('heading', { name: /sign in to agrinexa ai/i, level: 1 })).toBeInTheDocument();

    // Return to Previous Page
    const returnBtn = screen.getByRole('button', { name: /return to previous page/i });
    fireEvent.click(returnBtn);

    // Returns directly to Crop Recommendation page
    expect(screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })).toBeInTheDocument();
  });

  it('allows switching between Sign In and Sign Up modes in the auth modal', () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);

    // Default mode is Sign In
    expect(screen.getByText(/sign in to agrinexa ai/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit sign in/i })).toBeInTheDocument();

    // Switch to Sign Up
    const signUpTab = screen.getByRole('tab', { name: /^sign up$/i });
    fireEvent.click(signUpTab);

    expect(screen.getByText(/create an account/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit sign up/i })).toBeInTheDocument();
  });

  it('closes auth modal when Continue as Guest or Return to App is clicked', () => {
    const onClose = vi.fn();
    const { rerender } = render(<AuthModal isOpen={true} onClose={onClose} />);

    // Click "Continue as Guest"
    const continueGuestBtn = screen.getByRole('button', { name: /continue as guest/i });
    fireEvent.click(continueGuestBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<AuthModal isOpen={true} onClose={onClose} />);
    const returnBtn = screen.getByRole('button', { name: /return to app/i });
    fireEvent.click(returnBtn);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not invent fake login success or fake user IDs upon form submission', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ detail: 'Invalid email or password' }),
    } as any);

    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    const emailInput = screen.getByLabelText(/email address/i);
    const passwordInput = screen.getByLabelText(/password/i);
    fireEvent.change(emailInput, { target: { value: 'test@farmer.org' } });
    fireEvent.change(passwordInput, { target: { value: 'secret123' } });

    const submitBtn = screen.getByRole('button', { name: /submit sign in/i });
    fireEvent.click(submitBtn);

    // Verifies notification/error is rendered without pretending login succeeded
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it('closes auth modal on Escape key press', () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes auth modal when clicking the backdrop overlay', () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: /account authentication/i });
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('preserves initial workbench view across multi-step auth page navigation and guest return', () => {
    render(<App initialView="diagnose" />);

    // 1. Navigate to Crop Recommendation
    const cropNavButtons = screen.getAllByRole('button', { name: /crop recommendation/i });
    fireEvent.click(cropNavButtons[0]);
    expect(screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })).toBeInTheDocument();

    // 2. Click Sign Up in top-right Header
    const signUpBtn = screen.getByRole('button', { name: /^sign up$/i });
    fireEvent.click(signUpBtn);
    expect(screen.getByRole('heading', { name: /create an agrinexa ai account/i, level: 1 })).toBeInTheDocument();

    // 3. Switch to Sign In from link
    const signInSwitch = screen.getByRole('button', { name: /^sign in$/i });
    fireEvent.click(signInSwitch);
    expect(screen.getByRole('heading', { name: /sign in to agrinexa ai/i, level: 1 })).toBeInTheDocument();

    // 4. Click "Return to Previous Page"
    const returnBtn = screen.getByRole('button', { name: /return to previous page/i });
    fireEvent.click(returnBtn);

    // 5. Verifies user is restored directly to Crop Recommendation without data loss
    expect(screen.getByRole('heading', { name: /^crop recommendation$/i, level: 1 })).toBeInTheDocument();

    // 6. Click Home link from Header -> navigates back to Home
    const homeLinks = screen.getAllByRole('link', { name: /^home$/i });
    fireEvent.click(homeLinks[0]);
    expect(screen.getByRole('heading', { name: /plant disease diagnosis/i, level: 1 })).toBeInTheDocument();
  });
});
