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
    // 固定扩展 ID（khfhjjhjhclfaaabnjnecemgknfloohp）：无论从哪个文件夹加载，ID 都一样，
    // 重新安装后才能从 Chrome 同步存储里找回之前的设置和 API Key
    ...(browser !== 'firefox' && {
      key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnUZIDk7Dl3OPrzBalk9PMjOzikQaISxu/6lPmeQob3tXhdFTw2f5qYjCUgXGVnTeGqsjzD0LRp1rqtDi1uSN4HdY3FPDHDDTMqZusVqz1Oo0UHj+PgH9EfGCdOKWMvhNa9hMmJRag8hRbY2O2KwmtoACbGb72A56fvzajbN1SfFLUhk3bYjNO8iV+5Gwja2VDPvzmamLQDVtGp520ktYp64chPblbHqto0TieVAQnau8r6tAuXN8gc/cN7Unm2P8qmW4EgKy2pQh4wSJo2EbxMJs9+57qU16fgtJAh9jcyf1rSITtMczWlKV3CvRIE5xTcF36sej5uZiGKht5eEw0QIDAQAB',
    }),
    description: '用大模型把网页翻译成双语对照，保留链接和格式，只翻译看得到的部分。',
    // scripting：安装或更新后，把内容脚本注入到已经打开的标签页，不用手动刷新
    permissions: ['storage', 'activeTab', 'contextMenus', 'scripting'],
    // background 需要访问用户配置的任意 API 地址（OpenAI 或兼容接口）
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-translation': {
        suggested_key: { default: 'Alt+A' },
        description: '翻译 / 还原当前页面',
      },
    },
    ...(browser === 'firefox' && {
      // 128 起支持 MAIN world 内容脚本（YouTube 字幕拦截需要）；同时声明支持安卓版 Firefox。
      // 网页文字会发给用户配置的 AI 服务，按 Firefox 要求如实声明 websiteContent
      browser_specific_settings: {
        gecko: { id: 'ai-translate@andylzc', strict_min_version: '128.0', data_collection_permissions: { required: ['websiteContent'] } },
        gecko_android: { strict_min_version: '128.0' },
      },
    }),
  }),
});
