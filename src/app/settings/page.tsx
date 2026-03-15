import { PageHeader } from "@/components/page-header";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/server/settings/service";

export default async function SettingsPage() {
  const initialSettings = await getSettings();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Settings"
        title="配置新闻时间、偏好和目录"
        description="这里可以管理新闻时间、代理、本地目录和大模型配置；保存后会直接用于后续请求。"
      />
      <SettingsForm initialSettings={initialSettings} />
    </div>
  );
}
