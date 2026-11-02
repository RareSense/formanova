/**
 * Small shared readers for step outputs. Pure functions only.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Tools answer either flat or wrapped as { result: {...} }. */
export function unwrapResult(output: unknown): Record<string, unknown> {
  const root = asRecord(output) ?? {};
  return asRecord(root.result) ?? root;
}

function errorText(value: unknown): string | null {
  if (typeof value === 'string') return text(value);
  const record = asRecord(value);
  if (!record) return null;
  return text(record.message) ?? text(record.detail) ?? text(record.user_message) ?? text(record.type) ?? null;
}

/**
 * Whether a recorded tool call failed. The admin API sends no is_success / is_retry, so
 * this is inferred from the output:
 *   - http_tool / gpu_launcher record a raised failure as output_data = { error: ... };
 *   - a "soft" failure keeps the tool's body, which then says ok: false or status: failed
 *     (the tool's success_when), usually with a user_message.
 * A missing or empty error field is not a failure.
 */
export function stepFailure(output: unknown): { failed: boolean; error: string | null } {
  const root = asRecord(output);
  if (!root) return { failed: false, error: null };
  if (root.error !== undefined && root.error !== null && root.error !== '') {
    return { failed: true, error: errorText(root.error) };
  }
  const body = unwrapResult(output);
  const status = typeof body.status === 'string' ? body.status.toLowerCase() : '';
  if (body.ok === false || status === 'failed' || status === 'error') {
    return { failed: true, error: text(body.user_message) ?? errorText(body.error) ?? errorText(body.failure) };
  }
  return { failed: false, error: null };
}
