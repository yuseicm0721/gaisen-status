const $ = selector => document.querySelector(selector);
const STALE_AFTER = 20 * 60000;
const dateTime = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});
const clock = new Intl.DateTimeFormat('ja-JP', {timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit'});
let current = null, range = 30, refreshing = false;
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
function renderOverall(services) {
  const stale = services.some(service => !fresh(service));
  const failed = services.filter(service => service.status !== 'up').length;
  const state = stale ? 'unknown' : failed === services.length ? 'down' : failed ? 'degraded' : 'up';
  $('#current-status').dataset.state = state;
  $('#overall-title').textContent = {up: '正常に稼働しています', down: '障害を検知しています', degraded: '一部で障害を検知しています', unknown: '最新の状態を確認できていません'}[state];
  $('#overall-description').textContent = {up: '監視しているページへの接続を確認できています。', down: 'ページにアクセスしにくい状態です。復旧状況はこちらでお知らせします。', degraded: '一部のページにアクセスしにくい状態です。', unknown: '監視結果の更新が遅れています。最終確認の日時をご確認ください。'}[state];
  const oldest = Math.min(...services.map(s => Date.parse(s.checkedAt)));
  $('#checked-at').textContent = '最終確認：' + (Number.isFinite(oldest) ? format(new Date(oldest).toISOString()) + '（日本時間）' : '確認できていません');
}
function renderServices(services) {
  const nodes = services.map(service => {
    const card = element('article', 'service-card');
    const top = element('div', 'service-top'), copy = element('div');
    copy.append(element('h3', '', service.name), element('p', 'service-description', service.description));
    const state = fresh(service) ? service.status : 'unknown';
    top.append(copy, element('span', 'status-badge ' + state, {up: '正常', down: '障害を検知', degraded: '応答が不安定', unknown: '最新状況は未確認'}[state]));
    const meta = element('div', 'service-meta');
    const response = element('span', '', '応答時間 ');
    response.append(element('b', '', state === 'up' && Number.isFinite(service.responseTime) ? Math.round(service.responseTime).toLocaleString('ja-JP') + ' ms' : '—'));
    meta.append(response, element('span', '', '最終確認 ' + (Number.isFinite(Date.parse(service.checkedAt)) ? clock.format(new Date(service.checkedAt)) : '—')));
    card.append(top, meta);
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
    label.append(element('h3', '', service.name), element('span', '', '監視開始 ' + format(service.startedAt)));
    const bars = element('div', 'day-bars');
    bars.style.setProperty('--days', range);
    bars.dataset.count = range;
    bars.setAttribute('role', 'group');
    bars.setAttribute('aria-label', service.name + 'の日ごとの稼働履歴。左右の矢印キーで日付を移動できます');
    const days = new Map(service.days.map(day => [day.date, day]));
    for (let i = 0; i < range; i++) {
      const date = jstDate(start + i * 86400000), day = days.get(date);
      const state = !day ? 'unknown' : day.failed > 0 ? 'down' : 'up';
      const description = date.replaceAll('-', '/') + '：' + (!day ? '計測データなし' : (state === 'up' ? '計測範囲で正常' : '障害を検知') + '。監視 ' + day.checks + '回、障害検知 ' + day.failed + '回、計測時間 ' + Math.round(day.observedSeconds / 60) + '分');
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
  if (!data.incidentsAvailable) {
    root.replaceChildren(element('p', 'notice', '現在、お知らせを取得できていません。時間をおいてご確認ください。'));
    return;
  }
  if (!data.incidents.length) {
    const panel = element('div', 'empty-incidents');
    const copy = element('div');
    copy.append(element('h3', '', 'これまでに記録されたお知らせはありません'), element('p', '', '監視開始以降の障害とメンテナンス情報を、こちらに掲載します。'));
    const icon = element('span', 'empty-icon', '✓'); icon.setAttribute('aria-hidden', 'true');
    panel.append(icon, copy); root.replaceChildren(panel); return;
  }
  root.replaceChildren(...data.incidents.map(item => {
    const card = element('article', 'incident');
    const top = element('div', 'incident-head');
    const maintenance = item.type === 'maintenance', open = item.state === 'open';
    const title = maintenance ? item.title : (item.services.join('・') || 'ガイセンNOW') + 'の接続障害';
    top.append(element('h3', '', title), element('span', 'status-badge ' + (open ? 'degraded' : 'up'), maintenance ? (open ? 'お知らせ' : '終了') : (open ? '障害を検知' : '復旧済み')));
    const times = element('p', '', '発生：' + format(item.startedAt) + (item.resolvedAt ? ' ／ 復旧：' + format(item.resolvedAt) : ''));
    const link = element('a', '', '記録を見る ↗');
    if (/^https:\/\/github\.com\/yuseicm0721\/gaisen-status\/issues\/\d+$/.test(item.url)) link.href = item.url;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    card.append(top, times, link); return card;
  }));
}
function render(data) {
  renderOverall(data.services); renderServices(data.services); renderHistory(data.services); renderIncidents(data);
  const main = data.services.find(s => s.slug === 'website');
  for (const period of main.periods) {
    const strong = $('#uptime-' + period.days);
    if (!strong) continue;
    strong.replaceChildren(document.createTextNode(period.uptime === null ? '集計中' : period.uptime.toFixed(2)), ...(period.uptime === null ? [] : [element('small', '', '%')]));
  }
  $('#metrics-note').textContent = '監視開始：' + format(main.startedAt) + '。開始以降、計測できた時間をもとに集計しています。';
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch('/status/data.json', {cache: 'no-store', signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Status data unavailable');
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.services) || !data.services.length || !data.services.some(s => s.slug === 'website') || data.services.some(s => !['up','down','degraded'].includes(s.status) || !Array.isArray(s.days) || !Array.isArray(s.periods)) || !Array.isArray(data.incidents)) throw new Error('Invalid status data');
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
  if (current) renderHistory(current.services);
}));
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
