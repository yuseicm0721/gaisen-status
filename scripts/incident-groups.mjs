// The monitors keep independent GitHub issues. The public service has one
// notification for each continuous, overlapping outage episode.
function interval(incident) {
  if (incident.type !== 'incident' || incident.source === 'uptimerobot' || !incident.services?.length) return null;
  const start = Date.parse(incident.startedAt);
  const end = incident.state === 'open' && !incident.resolvedAt ? Infinity : Date.parse(incident.resolvedAt);
  if (!Number.isFinite(start) || !(end >= start) || !['open', 'closed'].includes(incident.state)) return null;
  return {start, end};
}

export function groupPublicIncidents(incidents) {
  const separate = [], eligible = [];
  for (const incident of incidents) {
    const bounds = interval(incident);
    if (bounds) eligible.push({incident, ...bounds});
    else separate.push(incident);
  }
  eligible.sort((a, b) => a.start - b.start || String(a.incident.id).localeCompare(String(b.incident.id)));
  const groups = [];
  for (const item of eligible) {
    const previous = groups.at(-1);
    if (previous && item.start <= previous.end) {
      previous.items.push(item.incident);
      previous.end = Math.max(previous.end, item.end);
    } else groups.push({items: [item.incident], end: item.end});
  }
  const notifications = groups.map(({items, end}) => {
    if (items.length === 1) return items[0];
    const ids = items.map(item => String(item.id)).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
    const open = items.some(item => item.state === 'open');
    return {
      ...items[0], id: 'upptime-group-' + ids.join('-'), source: 'upptime',
      services: [...new Set(items.flatMap(item => item.services))],
      state: open ? 'open' : 'closed',
      resolvedAt: open ? null : new Date(end).toISOString(),
      records: items.map(item => ({id: item.id, services: item.services, state: item.state, startedAt: item.startedAt, resolvedAt: item.resolvedAt, url: item.url})),
    };
  });
  return [...separate, ...notifications].sort((a, b) => (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0));
}
