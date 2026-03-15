"use client";

import { useState, useTransition } from "react";
import type { AppSettings } from "@/lib/types";

export function SettingsForm({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateApiKey(key: string, value: string) {
    updateField("apiKeys", {
      ...settings.apiKeys,
      [key]: value
    });
  }

  function submit() {
    startTransition(async () => {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        setMessage("保存失败，请检查输入。");
        return;
      }

      setMessage("设置已保存。代理与大模型配置会在后续请求中立即生效，建议刷新页面后重新生成一次日报。");
    });
  }

  return (
    <div className="panel form-grid">
      <div className="field">
        <label htmlFor="displayName">昵称</label>
        <input id="displayName" value={settings.displayName} onChange={(event) => updateField("displayName", event.target.value)} />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="timezone">时区</label>
          <input id="timezone" value={settings.timezone} onChange={(event) => updateField("timezone", event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="newsDigestTime">日报时间</label>
          <input id="newsDigestTime" value={settings.newsDigestTime} onChange={(event) => updateField("newsDigestTime", event.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="preferredTags">偏好标签（逗号分隔）</label>
        <input id="preferredTags" value={settings.preferredTags.join(", ")} onChange={(event) => updateField("preferredTags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
      </div>
      <div className="field">
        <label htmlFor="excludedTags">排除标签（逗号分隔）</label>
        <input id="excludedTags" value={settings.excludedTags.join(", ")} onChange={(event) => updateField("excludedTags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
      </div>
      <div className="field">
        <label htmlFor="preferredPlatforms">平台（逗号分隔）</label>
        <input id="preferredPlatforms" value={settings.preferredPlatforms.join(", ")} onChange={(event) => updateField("preferredPlatforms", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} />
      </div>
      <div className="grid cols-2">
        <label className="list-item" htmlFor="proxyEnabled" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input id="proxyEnabled" type="checkbox" checked={settings.proxyEnabled} onChange={(event) => updateField("proxyEnabled", event.target.checked)} />
          <span>启用网络代理</span>
        </label>
        <div className="field">
          <label htmlFor="proxyUrl">代理地址</label>
          <input id="proxyUrl" value={settings.proxyUrl} onChange={(event) => updateField("proxyUrl", event.target.value)} placeholder="http://127.0.0.1:7897" disabled={!settings.proxyEnabled} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="omdbApiKey">OMDb API Key（可选，用于 IMDb 评分补充）</label>
        <input id="omdbApiKey" value={settings.apiKeys.omdb ?? ""} onChange={(event) => updateApiKey("omdb", event.target.value)} placeholder="没有也可以，系统会只显示 AniList / MAL / Steam 数据" />
      </div>
      <section className="panel stack">
        <div className="card-title">
          <div>
            <h3 className="section-title">大模型配置</h3>
            <p className="muted">用于英文新闻翻译、中文雷达总结，以及后续问答和推荐解释。</p>
          </div>
        </div>
        <label className="list-item" htmlFor="llmEnabled" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input id="llmEnabled" type="checkbox" checked={settings.llmEnabled} onChange={(event) => updateField("llmEnabled", event.target.checked)} />
          <span>启用大模型增强</span>
        </label>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="llmBaseUrl">Base URL</label>
            <input id="llmBaseUrl" value={settings.llmBaseUrl} onChange={(event) => updateField("llmBaseUrl", event.target.value)} placeholder="https://coding.dashscope.aliyuncs.com/v1" disabled={!settings.llmEnabled} />
          </div>
          <div className="field">
            <label htmlFor="llmModel">Model</label>
            <input id="llmModel" value={settings.llmModel} onChange={(event) => updateField("llmModel", event.target.value)} placeholder="qwen3.5-plus" disabled={!settings.llmEnabled} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="llmApiKey">API Key</label>
          <input id="llmApiKey" type="password" value={settings.apiKeys.llm ?? ""} onChange={(event) => updateApiKey("llm", event.target.value)} placeholder="sk-..." disabled={!settings.llmEnabled} />
        </div>
        <div className="grid cols-2">
          <label className="list-item" htmlFor="llmTranslateNews" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input id="llmTranslateNews" type="checkbox" checked={settings.llmTranslateNews} onChange={(event) => updateField("llmTranslateNews", event.target.checked)} disabled={!settings.llmEnabled} />
            <span>新闻转中文</span>
          </label>
          <label className="list-item" htmlFor="llmSummarizeNews" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input id="llmSummarizeNews" type="checkbox" checked={settings.llmSummarizeNews} onChange={(event) => updateField("llmSummarizeNews", event.target.checked)} disabled={!settings.llmEnabled} />
            <span>日报总结增强</span>
          </label>
        </div>
      </section>
      <div className="field">
        <label htmlFor="libraryRoots">动漫库目录（每行一个，格式：标签|路径）</label>
        <textarea
          id="libraryRoots"
          value={settings.libraryRoots.map((root) => `${root.label}|${root.path}`).join("\n")}
          onChange={(event) =>
            updateField(
              "libraryRoots",
              event.target.value
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [label, path] = line.split("|");
                  return { label: label?.trim() || "Library", path: path?.trim() || label?.trim() || "" };
                })
                .filter((item) => item.path)
            )
          }
        />
      </div>
      <div className="actions">
        <button type="button" className="button" onClick={submit} disabled={pending}>
          {pending ? "保存中..." : "保存设置"}
        </button>
      </div>
      {message ? <div className="list-item">{message}</div> : null}
    </div>
  );
}
