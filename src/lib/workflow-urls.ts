export interface WorkflowStartResponseLike {
  workflow_id?: string | null;
  status_url?: string | null;
  result_url?: string | null;
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function normalizeWorkflowUrl(url: string): string {
  if (!url) return url;
  if (isAbsoluteHttpUrl(url) || url.startsWith('/api/')) return url;
  if (url.startsWith('/')) return `/api${url}`;
  return `/api/${url}`;
}

export function resolveWorkflowPollingUrls(start: WorkflowStartResponseLike): {
  workflowId: string;
  statusUrl: string;
  resultUrl: string;
} {
  const workflowId = start.workflow_id?.trim();
  if (!workflowId) {
    throw new Error('No workflow_id returned');
  }

  return {
    workflowId,
    statusUrl: normalizeWorkflowUrl(start.status_url?.trim() || `/status/${encodeURIComponent(workflowId)}`),
    resultUrl: normalizeWorkflowUrl(start.result_url?.trim() || `/result/${encodeURIComponent(workflowId)}`),
  };
}
