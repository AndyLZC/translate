/** 跟随系统深浅色：在 <html> 上切换 .dark */
export function applySystemTheme() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => document.documentElement.classList.toggle('dark', mq.matches);
  apply();
  mq.addEventListener('change', apply);
}
