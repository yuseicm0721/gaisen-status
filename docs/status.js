import {resultDescription} from './status-errors.js';
const $ = selector => document.querySelector(selector);
const STALE_AFTER = 20 * 60000;
const dateTime = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
const clock = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit'});
let current = null, range = 30, refreshing = false, incidentLimit = 5;
const format = value => Number.isFinite(Date.parse(value)) ? dateTime.format(new Date(value)) : '確認できていません';
const jstDate = time => new Date(time + 9 * 3600000).toISOString().slice(0, 10);
const fresh = service => {
  const time = Date.parse(service.checkedAt);
  return Number.isFinite(time) && time <= Date.now() + 300000 && Date.now() - time <= STALE_AFTER;
};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function statusState(services) {
  if (services.some(service => !fresh(service))) return 'unknown';
  if (services.every(service => service.status === 'up')) return 'up';
  if (services.every(service => service.status === 'down')) return 'down';
  return 'degraded';
}
function publicService(data) { return data.service || data.services[0]; }
function renderOverall(services) {
  const state = statusState(services);
  $('#current-status').dataset.state = state;
  $('#overall-title').textContent = {up: '正常に稼働しています', down: '障害を検知しています', degraded: '応答が遅れています', unknown: '最新の状態を確認できていません'}[state];
  $('#overall-description').textContent = {up: 'ガイセンNOWへの接続を確認できています。', down: 'ページにアクセスしにくい状態です。復旧状況はこちらでお知らせします。', degraded: '応答が遅い状態を検知しています。', unknown: '監視結果の更新が遅れています。最終確認の日時をご確認ください。'}[state];
  const oldest = Math.min(...services.map(s => Date.parse(s.checkedAt)));
  $('#checked-at').textContent = '最終確認：' + (Number.isFinite(oldest) ? format(new Date(oldest).toISOString()) + '（日本時間）' : '確認できていません');
}
function renderServices(data) {
  const nodes = [publicService(data)].map(service => {
    const card = element('article', 'service-card');
    const top = element('div', 'service-top'), copy = element('div');
    copy.append(element('h3', '', service.name), element('p', 'service-description', service.description));
    const state = statusState([service]);
    top.append(copy, element('span', 'status-badge ' + state, {up: '正常', down: '障害を検知', degraded: '応答遅延', unknown: '最新状況は未確認'}[state]));
    const meta = element('div', 'service-meta');
    const response = element('span', '', '応答時間 ');
    response.append(element('b', '', state === 'up' && Number.isFinite(service.responseTime) ? Math.round(service.responseTime).toLocaleString('ja-JP') + ' ms' : '—'));
    meta.append(response, element('span', '', '最終確認 ' + (Number.isFinite(Date.parse(service.checkedAt)) ? clock.format(new Date(service.checkedAt)) : '—')));
    card.append(top, meta);
    if (fresh(service)) card.append(element('p', 'service-result', '最終確認の応答：' + resultDescription(service.code, service.status)));
    return card;
  });
  $('#services').replaceChildren(...nodes);
}
function renderHistory(services) {
  const midnight = Date.parse(jstDate(Date.now()) + 'T00:00:00+09:00');
  const start = midnight - (range - 1) * 86400000;
  $('#history').replaceChildren(...services.map(service => {
    const row = element('div', 'history-row');
    const label = element('div', 'history-label');
    label.append(element('h3', '', service.name), element('span', '', '履歴 ' + format(service.historyStartedAt || service.startedAt) + '〜'));
    const bars = element('div', 'day-bars');
    bars.style.setProperty('--days', range);
    bars.dataset.count = range;
    bars.setAttribute('role', 'group');
    bars.setAttribute('aria-label', service.name + 'の日ごとの稼働履歴。左右の矢印キーで日付を移動できます');
    const days = new Map(service.days.map(day => [day.date, day]));
    for (let i = 0; i < range; i++) {
      const date = jstDate(start + i * 86400000), day = days.get(date);
      const downtime = day ? day.observedSeconds - day.upSeconds : 0;
      const state = !day ? 'unknown' : downtime > 0 && (day.partialSeconds || 0) >= downtime - 0.001 ? 'degraded' : day.failed > 0 || downtime > 0 ? 'down' : 'up';
      const historical = day?.sources?.includes('uptimerobot');
      const stateText = {up:'計測範囲で正常', down:'障害を検知', degraded:'応答遅延を検知'}[state];
      const detail = !day ? '計測データなし' : day.observedSeconds > 0
        ? stateText + '。稼働率 ' + (day.upSeconds / day.observedSeconds * 100).toFixed(3) + '%、障害時間 ' + Math.round(downtime / 60) + '分' + (historical ? '（UptimeRobot' + (day.sources.includes('upptime') ? '・新しい監視' : '') + 'の記録）' : '')
        : stateText + '。稼働率は集計中です';
      const description = date.replaceAll('-', '/') + '：' + detail;
      const button = element('button', 'day-bar ' + state);
      button.type = 'button';
      button.title = description;
      button.setAttribute('aria-label', description);
      button.setAttribute('aria-pressed', 'false');
      button.tabIndex = i === range - 1 ? 0 : -1;
      button.addEventListener('click', () => {
        document.querySelectorAll('.day-bar[aria-pressed=true]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        bars.querySelectorAll('button').forEach(b => b.tabIndex = -1);
        button.setAttribute('aria-pressed', 'true');
        button.tabIndex = 0;
        $('#history-detail').textContent = service.name + ' ／ ' + description;
      });
      button.addEventListener('keydown', event => {
        const buttons = [...bars.children];
        const index = buttons.indexOf(button);
        const next = {ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: buttons.length - 1}[event.key];
        if (next === undefined) return;
        event.preventDefault();
        const target = buttons[Math.max(0, Math.min(next, buttons.length - 1))];
        target.focus(); target.click();
      });
      bars.append(button);
    }
    const axis = element('div', 'history-axis');
    axis.append(element('span', '', jstDate(start).slice(5).replace('-', '/')), element('span', '', '今日'));
    row.append(label, bars, axis);
    return row;
  }));
}
function renderIncidents(data) {
  const root = $('#incidents');
  const notices = [];
  if (!data.incidentsAvailable) {
    notices.push(element('p', 'notice', '最新のお知らせを取得できていません。保存済みの過去の記録を表示しています。'));
  }
  if (!data.incidents.length) {
    if (notices.length) { root.replaceChildren(...notices); return; }
    const panel = element('div', 'empty-incidents');
    const copy = element('div');
    copy.append(element('h3', '', 'これまでに記録されたお知らせはありません'), element('p', '', '監視開始以降の障害とメンテナンス情報を、こちらに掲載します。'));
    const icon = element('span', 'empty-icon', '✓'); icon.setAttribute('aria-hidden', 'true');
    panel.append(icon, copy); root.replaceChildren(panel); return;
  }
  const cards = data.incidents.slice(0, incidentLimit).map(item => {
    const card = element('article', 'incident');
    const top = element('div', 'incident-head');
    const maintenance = item.type === 'maintenance', open = item.state === 'open';
    const title = maintenance ? item.title : 'ガイセンNOWの接続障害';
    top.append(element('h3', '', title), element('span', 'status-badge ' + (open ? 'degraded' : 'up'), maintenance ? (open ? 'お知らせ' : '終了') : (open ? '障害を検知' : '復旧済み')));
    const times = element('p', '', '発生：' + format(item.startedAt) + (item.resolvedAt ? ' ／ 復旧：' + format(item.resolvedAt) : ''));
    card.append(top, times);
    if (!maintenance) {
      const codes = item.codes?.length ? item.codes : [item.code];
      const details = [...new Set(codes.map(code => resultDescription(code, item.status, item.source)))];
      card.append(element('p', 'incident-error', '検知時の応答：' + details.join(' ／ ')));
    }
    if (item.source === 'uptimerobot') card.append(element('p', 'incident-source', 'UptimeRobotの過去の記録'));
    else if (/^https:\/\/github\.com\/yuseicm0721\/gaisen-status\/issues\/\d+$/.test(item.url)) {
      const link = element('a', '', '記録を見る ↗');
      link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    }
    return card;
  });
  if (data.incidents.length > incidentLimit) {
    const button = element('button', 'load-more-incidents', '過去のお知らせをもっと見る（残り' + (data.incidents.length - incidentLimit) + '件）');
    button.type = 'button';
    button.addEventListener('click', () => { incidentLimit += 10; renderIncidents(current); });
    cards.push(button);
  }
  root.replaceChildren(...notices, ...cards);
}
function render(data) {
  renderOverall([publicService(data)]); renderServices(data); renderHistory([publicService(data)]); renderIncidents(data);
  const main = publicService(data);
  for (const period of main.periods) {
    const strong = $('#uptime-' + period.days);
    if (!strong) continue;
    strong.replaceChildren(document.createTextNode(period.uptime === null ? '集計中' : period.uptime.toFixed(2)), ...(period.uptime === null ? [] : [element('small', '', '%')]));
  }
  $('#metrics-note').textContent = data.historicalImport
    ? '履歴の開始：' + format(main.historyStartedAt) + '。UptimeRobotの過去の記録と、新しい監視結果を集計しています。'
    : '監視開始：' + format(main.startedAt) + '。開始以降、計測できた時間をもとに集計しています。';
  $('#history-source').hidden = !data.historicalImport;
  if (data.historicalImport) $('#history-source').textContent = format(data.historicalImport.coverage.end) + '以前はUptimeRobotの記録です。以降はガイセンNOWの監視結果です。';
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch('/status/data.json', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Status data unavailable');
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.services) || !data.services.length || data.services.some(s => !['up','down','degraded'].includes(s.status) || !Array.isArray(s.days) || !Array.isArray(s.periods)) || !Array.isArray(data.incidents)) throw new Error('Invalid status data');
    current = data; render(data);
    $('#refresh-notice').hidden = true;
  } catch (error) {
    if (current) render(current);
    else {
      $('#current-status').dataset.state = 'unknown';
      $('#overall-title').textContent = '稼働状況を取得できていません';
      $('#overall-description').textContent = '時間をおいて、もう一度ご確認ください。';
      $('#services').replaceChildren(element('p', 'loading-text', '現在の状態は確認できていません。'));
      $('#history').replaceChildren(element('p', 'loading-text', '履歴を読み込めませんでした。'));
      $('#incidents').replaceChildren(element('p', 'loading-text', 'お知らせを読み込めませんでした。'));
    }
    $('#refresh-notice').textContent = '監視結果の更新に接続できませんでした。表示は約1分ごとに更新を試みます。';
    $('#refresh-notice').hidden = false;
  } finally { refreshing = false; }
}
document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
  range = Number(button.dataset.range);
  document.querySelectorAll('[data-range]').forEach(b => b.setAttribute('aria-pressed', b === button ? 'true' : 'false'));
  if (current) renderHistory([publicService(current)]);
}));
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
