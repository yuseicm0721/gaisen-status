import {normalizeCode} from '../docs/status-errors.js';

export function incidentFromIssue(issue) {
  const maintenance = issue.labels.some(label => label.name === 'maintenance');
  // Read only Upptime's explicit result line, never a number in a title or URL.
  const match = (issue.body || '').match(/^\s*-\s*HTTP code:\s*(\d+)\s*$/mi);
  const code = match ? normalizeCode(match[1]) : null;
  return {
    id: issue.number, type: maintenance ? 'maintenance' : 'incident', source: 'upptime',
    services: ['ガイセンNOW'], title: maintenance ? issue.title : null,
    state: issue.state, startedAt: issue.created_at, resolvedAt: issue.closed_at, url: issue.html_url,
    ...(maintenance ? {} : {code, status: /degraded performance/.test(issue.title) ? 'degraded' : 'down'}),
  };
}
