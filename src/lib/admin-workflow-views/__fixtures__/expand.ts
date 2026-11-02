/**
 * Test helper: opens every closed section and step (anything with aria-expanded="false"),
 * level by level, so tests can check the collapsed content of the admin detail page.
 */
import { fireEvent } from '@testing-library/react';

export function expandAll(root: ParentNode, maxLevels = 10): void {
  for (let level = 0; level < maxLevels; level += 1) {
    const closed = Array.from(root.querySelectorAll<HTMLElement>('button[aria-expanded="false"]'));
    if (!closed.length) return;
    closed.forEach((button) => fireEvent.click(button));
  }
}

/** Opens one closed section by its title (Steps, Input payload, Complaint, Technical). */
export function openSection(root: ParentNode, title: string): void {
  const heading = Array.from(root.querySelectorAll('section > div h3, section h3, section [id^="admin-section-"]'))
    .find((el) => el.textContent === title);
  const button = heading?.closest('button');
  if (button && button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
}
