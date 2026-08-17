export interface PendingCardRegistration<TElement> {
  id: string;
  glbUrl: string;
  element: TElement;
}

/** Keeps the latest pre-renderer registration for each card and supports cleanup before flush. */
export class PendingCardRegistrationQueue<TElement> {
  private readonly registrations = new Map<string, PendingCardRegistration<TElement>>();

  upsert(registration: PendingCardRegistration<TElement>): void {
    this.registrations.set(registration.id, registration);
  }

  delete(id: string): void {
    this.registrations.delete(id);
  }

  drain(register: (registration: PendingCardRegistration<TElement>) => void): void {
    const pending = [...this.registrations.values()];
    this.registrations.clear();
    pending.forEach((registration) => register(registration));
  }

  clear(): void {
    this.registrations.clear();
  }
}
