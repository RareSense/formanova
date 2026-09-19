export type CadStatusTone = 'success' | 'warning' | 'error';

export interface CadStatusNotice {
  tone: CadStatusTone;
  title: string;
  message: string;
}

/** Short, user-facing copy for CAD runs that finish without a new model. */
export function cadStatusNotice(reasonCode?: string): CadStatusNotice {
  switch (reasonCode) {
    case 'nothing_to_fix':
      return {
        tone: 'success',
        title: 'Nothing to change',
        message: 'Your ring already looks good. No new version was needed.',
      };
    case 'no_safe_fix':
      return {
        tone: 'warning',
        title: 'No safe change found',
        message: 'We could not make a safe improvement. Your current version is unchanged.',
      };
    case 'requirement_conflict':
      return {
        tone: 'warning',
        title: 'Details do not match',
        message: 'The description and reference images conflict. Update one and try again.',
      };
    default:
      return {
        tone: 'error',
        title: 'AI is overwhelmed',
        message: 'There are many requests right now. Please try again in a few hours.',
      };
  }
}
