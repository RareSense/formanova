export function FacebookChannelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14.8 5h-1.5A3.3 3.3 0 0 0 10 8.3V20" />
      <path d="M8 11.2h6.4" />
    </svg>
  );
}

export function WhatsAppChannelIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 4a8 8 0 0 0-6.8 12.2L4.4 20l3.9-.9A8 8 0 1 0 12 4Z" />
      <path d="M9.2 8.8c.3-.3.7-.3.9.1l.6 1.1c.1.2.1.5-.1.7l-.4.4c.6 1.1 1.5 2 2.6 2.6l.4-.4c.2-.2.5-.2.7-.1l1.1.6c.4.2.4.7.1.9-.4.4-.9.6-1.5.5-2.5-.4-4.4-2.3-4.8-4.8-.1-.6 0-1.1.4-1.5Z" />
    </svg>
  );
}
