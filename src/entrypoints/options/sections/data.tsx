import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, DatabaseBackup, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { exportSettings, importSettings } from '@/lib/backup';
import { sendMessage } from '@/lib/messaging';
import { settingsItem } from '@/lib/settings';
import { Group, PageHeader, Row, type SectionProps } from '../layout';
import { download } from '../util';

export function DataSection({ settings, update }: SectionProps) {
  const [backup, setBackup] = useState<{ exists: boolean; updatedAt: number } | null>(null);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    void sendMessage('backupStatus').then(setBackup).catch(() => setBackup(null));
    void sendMessage('cacheStats').then((r) => setCacheCount(r.count)).catch(() => setCacheCount(null));
  };
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader icon={<DatabaseBackup />} title="数据与备份" description="设置会自动备份到浏览器账号，重新安装插件后自动恢复，不用重新填 API Key。" />
      <div className="space-y-8">
        <Group title="同步备份">
          <Row
            label="备份设置到浏览器账号（含 API Key）"
            description="存放在 Chrome 账号 / Firefox Sync 的扩展同步存储里，只有本扩展能读取。登录浏览器账号后，重装插件或换电脑都能自动恢复。"
          >
            <Switch checked={settings.syncSettings} onCheckedChange={(v) => update({ syncSettings: v })} />
          </Row>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              {backup?.exists ? <Cloud className="size-4 text-success" /> : <CloudOff className="size-4" />}
              {backup?.exists ? `最近备份：${new Date(backup.updatedAt).toLocaleString()}` : '同步存储里还没有备份'}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!backup?.exists}
              onClick={async () => {
                const r = await sendMessage('restoreBackup');
                setMessage({ ok: r.ok, text: r.message });
              }}
            >
              <RefreshCw />
              从备份恢复
            </Button>
          </div>
        </Group>

        <Group title="导入 / 导出" description="导出为 JSON 文件，可手动备份或在另一台电脑导入。">
          <div className="flex flex-wrap gap-2 px-5 py-4">
            <Button variant="outline" size="sm" onClick={() => download('ai-translate-settings.json', exportSettings(settings, true))}>
              <Download />
              导出（含 API Key）
            </Button>
            <Button variant="outline" size="sm" onClick={() => download('ai-translate-settings-no-key.json', exportSettings(settings, false))}>
              <Download />
              导出（不含 Key）
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload />
              导入设置文件
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  await settingsItem.setValue(importSettings(await file.text(), settings));
                  setMessage({ ok: true, text: '已导入设置' });
                } catch (err) {
                  setMessage({ ok: false, text: `导入失败：${err instanceof Error ? err.message : String(err)}` });
                }
              }}
            />
          </div>
        </Group>

        {message && (
          <Alert variant={message.ok ? 'info' : 'destructive'}>
            <AlertTitle>{message.text}</AlertTitle>
          </Alert>
        )}

        <Group title="翻译缓存" description="按 原文 + 模型 + 目标语言 + 提示词 缓存在本地，重复访问的页面不再花费 token。">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
            <span>已缓存 {cacheCount?.toLocaleString() ?? '—'} 条</span>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                await sendMessage('clearCache');
                refresh();
              }}
            >
              <Trash2 />
              清空缓存
            </Button>
          </div>
        </Group>

        <Alert variant="warning">
          <AlertTitle>升级插件的推荐方式</AlertTitle>
          <AlertDescription>
            <p>把新版本解压覆盖到原来的文件夹，然后在 chrome://extensions 点扩展上的刷新按钮，所有设置都会保留。即使删除后重新安装，开启同步备份后也会自动恢复。</p>
          </AlertDescription>
        </Alert>
      </div>
    </>
  );
}
