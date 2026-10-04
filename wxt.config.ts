import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'AI 双语翻译',
    description: '用大模型把网页翻译成双语对照，保留链接和格式，只翻译看得到的部分。',
    permissions: ['storage', 'activeTab', 'contextMenus'],
    // background 需要访问用户配置的任意 API 地址（OpenAI 或兼容接口）
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+A' },
        description: '翻译 / 还原当前页面',
      },
    },
    ...(browser === 'firefox' && {
      browser_specific_settings: { gecko: { id: 'ai-translate@andylzc', strict_min_version: '121.0' } },
    }),
  }),
});
