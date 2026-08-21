import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';

import { CadSolidityNotice } from './CadSolidityNotice';

/**
 * A part that is not a closed solid cannot be cast or 3D printed. The whole
 * reason this component exists is so a jeweler learns that in the app rather
 * than from their manufacturer, so the tests are about it appearing exactly
 * when it should and never when it should not.
 */

describe('CadSolidityNotice', () => {
  it('warns when parts are not closed solids', () => {
    render(<CadSolidityNotice notAllSolid />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/not all parts are solid/i)).toBeInTheDocument();
  });

  it('renders nothing when every part is solid', () => {
    // Silence is the correct output for a good file. A permanent badge that
    // sometimes means "fine" teaches people to ignore it.
    const { container } = render(<CadSolidityNotice notAllSolid={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when solidity is unknown', () => {
    // Legacy workflows never reported solidity. Absent must not read as a
    // warning, or every old run raises an alarm nobody can act on.
    const { container } = render(<CadSolidityNotice notAllSolid={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what to do about it, not just that something is wrong', () => {
    render(<CadSolidityNotice notAllSolid />);
    const explanation = screen.getByRole('status').getAttribute('title') ?? '';
    expect(explanation.toLowerCase()).toContain('cast');
  });

  it('announces politely rather than interrupting', () => {
    // It appears next to a finished model the user is already looking at;
    // an assertive live region would talk over them.
    render(<CadSolidityNotice notAllSolid />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});
