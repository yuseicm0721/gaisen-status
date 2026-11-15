document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const header = document.querySelector('.site-header');
  if (!toggle || !header) return;
  const close = () => { header.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'メニューを開く'); };
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  });
  header.querySelectorAll('nav a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && header.classList.contains('open')) { close(); toggle.focus(); } });
  document.addEventListener('click', event => { if (!header.contains(event.target)) close(); });
});
