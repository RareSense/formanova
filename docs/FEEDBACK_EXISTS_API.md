# "Has the user submitted feedback?" API + one-time-suppression pattern

Reference for a backend check used to permanently stop showing a UI nudge (the
post-generation coachmark) to users who have already submitted feedback / used
the human-fix flow. Captured here so it can be reused even though it is not
currently wired into the app.

Originated on the `tooltip` branch (the post-generation coachmark A/B work).

---

## 1. Backend endpoint

```
GET /api/my-feedback/exists
```

- Auth: goes through `authenticatedFetch` (sends the JWT bearer token).
- Response body: `{ "has_submitted": boolean }`
- Returns whether the authenticated user has ever submitted feedback before.
- Server-side, so it works across devices and browsers (unlike a localStorage
  flag, which is per-device).

## 2. Client wrapper

`src/lib/feedback-api.ts`:

```ts
import { authenticatedFetch } from '@/lib/authenticated-fetch';

export async function checkHasSubmittedFeedback(): Promise<boolean> {
  try {
    const res = await authenticatedFetch('/api/my-feedback/exists');
    if (!res.ok) return false;
    const data = await res.json();
    return data.has_submitted === true;
  } catch {
    return false;
  }
}
```

Notes:
- Fails closed: any non-OK response or thrown error returns `false` (treated as
  "has not submitted"), so a backend hiccup does not block the UI.
- Uses `authenticatedFetch` per AI_RULES.md rule 1 (protected backend calls).

## 3. Local "never again" flag (per device)

`src/lib/posthog-events.ts`:

```ts
const FIX_BUTTON_CLICKED_KEY = 'formanova_fix_button_ever_clicked';

export function hasClickedFixButton(): boolean {
  return localStorage.getItem(FIX_BUTTON_CLICKED_KEY) === '1';
}

export function markFixButtonClicked() {
  localStorage.setItem(FIX_BUTTON_CLICKED_KEY, '1');
}
```

Cheap local short-circuit so the backend call is skipped once we already know,
on this device, that the user has engaged.

## 4. How they were combined (gating effect)

In `StudioResultsStep.tsx` (component mount):

```ts
const [tooltipReady, setTooltipReady] = useState<'loading' | 'show' | 'blocked'>(() =>
  hasClickedFixButton() ? 'blocked' : 'loading'
);

useEffect(() => {
  if (tooltipReady !== 'loading') return;
  checkHasSubmittedFeedback().then(hasSubmitted => {
    if (hasSubmitted) {
      markFixButtonClicked();        // cache the answer locally
      setTooltipReady('blocked');    // already submitted before -> never show
    } else {
      setTooltipReady('show');
    }
  });
}, []);
```

Decision flow:
1. If the local flag is already set, block immediately (no network call).
2. Otherwise call `GET /api/my-feedback/exists`.
3. If `has_submitted` is true: set the local flag and block forever.
4. Otherwise allow the nudge to show.

## 5. What marked a user as "done" (permanent suppression)

The local flag (`markFixButtonClicked()`) was set when the user either:
- clicked the human-fix button, or
- permanently dismissed the coachmark (the coachmark's `onPermanentDismiss`
  callback called `markFixButtonClicked()`).

After that, every future generation evaluated `hasClickedFixButton() === true`
and blocked the nudge. The backend `checkHasSubmittedFeedback()` was the
cross-device backstop for users who had already submitted before the local flag
existed.

## 6. Two layers of dismissal (do not confuse them)

- Per generation (transient): remembered by `generationKey` (workflow id) in
  localStorage key `formanova_post_generation_coachmark_dismissed_v3`. Hides the
  nudge for that one result only; a new generation shows it again.
- Per user (permanent): the `formanova_fix_button_ever_clicked` flag plus the
  `/api/my-feedback/exists` backend check. Hides the nudge forever once the user
  has engaged or previously submitted feedback.

## 7. To reuse this

1. Confirm `GET /api/my-feedback/exists` still exists on the backend and returns
   `{ has_submitted: boolean }`.
2. Add `checkHasSubmittedFeedback()` to `src/lib/feedback-api.ts`.
3. Add the `formanova_fix_button_ever_clicked` helpers.
4. Gate the UI element on the loading/show/blocked state shown in section 4.
