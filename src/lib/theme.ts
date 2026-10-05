import { getSettings, watchSettings, type Settings } from './settings';
import { getTheme, isDark } from './themes';

/**
 * 设置页、弹窗：按设置切换深浅色（.dark）并覆盖主题色变量。
 * 跟随系统时，系统深浅色变化也会实时切换。
 */
export function initTheme() {
  let current: Settings | null = null;
  const apply = () => {
    if (!current) return;
    const root = document.documentElement;
    const dark = isDark(current.appearance);
    root.classList.toggle('dark', dark);
    const c = getTheme(current.accentTheme)[dark ? 'dark' : 'light'];
    root.style.setProperty('--primary', c.primary);
    root.style.setProperty('--primary-foreground', c.primaryFg);
    root.style.setProperty('--accent', c.accent);
    root.style.setProperty('--accent-foreground', c.accentFg);
    root.style.setProperty('--ring', c.primary);
    root.style.setProperty('--link', c.link);
  };
  // 先按系统深浅色渲染，避免读设置前闪一下白
  document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);
  void getSettings().then((s) => {
    current = s;
    apply();
  });
  watchSettings((s) => {
    current = s;
    apply();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', apply);
}
