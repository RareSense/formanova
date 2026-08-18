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
    expect(screen.getByText('Complex designs can take up to 1 hour')).toBeTruthy();
    expect(screen.getByText(/3DM download links/).textContent).toContain('cad@example.com');
    expect(screen.getByText(/safely leave this page/i)).toBeTruthy();
    expect(screen.queryByText(/generation history/i)).toBeNull();
    expect(screen.queryByText(/elapsed/i)).toBeNull();

    const status = screen.getByRole('status');
    expect(status.querySelector('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keep Creating' }));
    expect(onKeepCreating).toHaveBeenCalledOnce();
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

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Use a different email' }));
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

  it('requests WhatsApp/iMessage delivery through the alt-channel form', async () => {
    const onRequestAltDelivery = vi.fn().mockResolvedValue(true);
    render(
      <GenerationProgress
        visible
        currentStep="building"
        onRequestAltDelivery={onRequestAltDelivery}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Prefer WhatsApp or iMessage instead?' }));
    fireEvent.click(screen.getByRole('radio', { name: 'iMessage' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(screen.getByRole('alert').textContent).toContain('Enter a valid phone number.');
    expect(onRequestAltDelivery).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+1 555 123 4567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onRequestAltDelivery).toHaveBeenCalledWith('imessage', '+1 555 123 4567'));
    await waitFor(() => expect(screen.queryByLabelText('Phone number')).toBeNull());
  });

  it('shows the confirmed alt-delivery channel and lets the user change it', () => {
    render(
      <GenerationProgress
        visible
        currentStep="building"
        onRequestAltDelivery={vi.fn()}
        altDeliveryPreference={{ channel: 'whatsapp', contact: '+1 555 123 4567' }}
        altDeliveryRequested
      />,
    );

    expect(screen.getByText(/reach out on/i).textContent).toContain('WhatsApp');
    expect(screen.getByText(/reach out on/i).textContent).toContain('+1 555 123 4567');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(screen.getByLabelText('Phone number')).toBeTruthy();
  });
});
