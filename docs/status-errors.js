export function normalizeCode(value) {
  if (value === null || value === undefined || value === '') return null;
  const code = Number(value);
  return Number.isInteger(code) && (code === 0 || code >= 100 && code <= 599) ? code : null;
}

export function resultDescription(value, status, source) {
  const code = normalizeCode(value);
  if (code === null) {
    if (source === 'uptimerobot' && /^\d{1,9}$/.test(String(value))) return '監視エラー ' + value + '（UptimeRobotの記録）';
    return 'エラー番号の記録なし';
  }
  if (code === 0) return 'HTTP応答なし（接続失敗・タイムアウトなど）';
  if (code === 200 && status === 'down') return 'HTTP 200（ページ本文の確認に失敗）';
  if (code === 200 && status === 'degraded') return 'HTTP 200（応答時間の基準を超過）';
  return 'HTTP ' + code;
}
