import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GenerationProgress from '@/components/text-to-cad/GenerationProgress';

describe('GenerationProgress', () => {
  it('shows a compact background wait state without history or elapsed counters', () => {
    const onKeepCreating = vi.fn();
    render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        onSaveNotificationEmail={vi.fn()}
        onKeepCreating={onKeepCreating}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Your CAD is generating' })).toBeTruthy();
    expect(screen.getByText('up to 1 hour')).toBeTruthy();
    expect(screen.getByText('cad@example.com')).toBeTruthy();
    expect(screen.getByText(/You can leave this page/i)).toBeTruthy();
    expect(screen.queryByText(/generation history/i)).toBeNull();
    expect(screen.queryByText(/elapsed/i)).toBeNull();

    const status = screen.getByRole('status');
    expect(status.querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Creating' }));
    expect(onKeepCreating).toHaveBeenCalledOnce();
  });

  it('toggles result email off and hides the destination with it', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        emailEnabled
        onToggleEmailEnabled={onToggle}
        onSaveNotificationEmail={vi.fn()}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Email me when this is ready' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);

    rerender(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        emailEnabled={false}
        onToggleEmailEnabled={onToggle}
        onSaveNotificationEmail={vi.fn()}
      />,
    );

    // No destination is shown for mail that is not going to be sent.
    expect(screen.queryByText('cad@example.com')).toBeNull();
    expect(screen.getByRole('switch', { name: 'Email me when this is ready' })).toBeTruthy();
  });

  it('leaves edit mode when the toggle is switched off mid-edit', () => {
    // Switching off unmounts the form. Staying in editing state would also
    // hide Keep Creating, which is gated on not editing, with no way back.
    const props = {
      visible: true,
      currentStep: 'building',
      notificationEmail: 'cad@example.com',
      onSaveNotificationEmail: vi.fn(),
      onToggleEmailEnabled: vi.fn(),
      onKeepCreating: vi.fn(),
    } as const;
    const { rerender } = render(<GenerationProgress {...props} emailEnabled />);

    fireEvent.click(screen.getByRole('button', { name: /^Change/ }));
    expect(screen.queryByRole('button', { name: 'Keep Creating' })).toBeNull();

    rerender(<GenerationProgress {...props} emailEnabled={false} />);

    expect(screen.getByRole('button', { name: 'Keep Creating' })).toBeTruthy();
  });

  it('opens the input empty when no override is stored, not on the account email', () => {
    // Pre-filling with the account address would make the user clear it
    // before they could type their own.
    render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="account@example.com"
        storedNotificationEmail={null}
        onSaveNotificationEmail={vi.fn()}
      />,
    );

    expect(screen.getByText('account@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Change/ }));
    expect((screen.getByRole('textbox', { name: 'Notification email' }) as HTMLInputElement).value).toBe('');
  });

  it('opens the input on the stored override when there is one', () => {
    render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="work@example.com"
        storedNotificationEmail="work@example.com"
        onSaveNotificationEmail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Change/ }));
    expect((screen.getByRole('textbox', { name: 'Notification email' }) as HTMLInputElement).value).toBe('work@example.com');
  });

  it('validates the email and saves a valid replacement', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        onSaveNotificationEmail={onSave}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Change/ }));
    const input = screen.getByRole('textbox', { name: 'Notification email' });
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid email address.');
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('new@example.com'));
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Notification email' })).toBeNull());
  });

  it('supports cancel and exposes pending and server-error states', () => {
    const { rerender } = render(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        notificationEmailSaving
        notificationEmailError="Could not save this address."
        onSaveNotificationEmail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Change/ }));
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Could not save this address.');

    rerender(
      <GenerationProgress
        visible
        currentStep="building"
        notificationEmail="cad@example.com"
        onSaveNotificationEmail={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Notification email' })).toBeNull();
  });

  it('keeps loading and failure states accessible without nesting retry in the live region', async () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <GenerationProgress visible currentStep="_loading" />,
    );
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Loading model into viewport' })).toBeTruthy();

    rerender(
      <GenerationProgress visible currentStep="failed_final" failureMessage="The model failed." onRetry={onRetry} />,
    );
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The model failed.'));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('The model failed.');
    expect(alert.querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });



});
