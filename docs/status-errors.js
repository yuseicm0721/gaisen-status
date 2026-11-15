export function normalizeCode(value) {
  if (value === null || value === undefined || value === '') return null;
  const code = Number(value);
  return Number.isInteger(code) && (code === 0 || code >= 100 && code <= 599) ? code : null;
}

export function resultDescription(value, status) {
  const code = normalizeCode(value);
  if (code === null) return 'エラー番号の記録なし';
  if (code === 0) return 'HTTP応答なし（接続失敗・タイムアウトなど）';
  if (code === 200 && status === 'down') return 'HTTP 200（ページ本文の確認に失敗）';
  if (code === 200 && status === 'degraded') return 'HTTP 200（応答時間の基準を超過）';
  return 'HTTP ' + code;
}
