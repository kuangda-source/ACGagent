"use client";

import { useState } from "react";
import type { RecommendationResult } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { RecommendationCard } from "@/components/recommendation-card";

export default function RecommendPage() {
  const [likedTitles, setLikedTitles] = useState("Frieren, Bocchi the Rock!");
  const [preferredTags, setPreferredTags] = useState("journey, healing");
  const [excludedTags, setExcludedTags] = useState("horror");
  const [platform, setPlatform] = useState("Steam");
  const [items, setItems] = useState<RecommendationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit() {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          likedTitles: likedTitles.split(",").map((item) => item.trim()).filter(Boolean),
          preferredTags: preferredTags.split(",").map((item) => item.trim()).filter(Boolean),
          excludedTags: excludedTags.split(",").map((item) => item.trim()).filter(Boolean),
          platform
        })
      });
      const payload = (await response.json()) as { items?: RecommendationResult[]; error?: string };
      if (payload.error) {
        setMessage(payload.error);
      } else {
        setItems(payload.items ?? []);
      }
    } catch {
      setMessage("推荐请求失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Recommend" title="按偏好生成游戏推荐" description="结合标签、平台和排除条件，给出可解释的推荐结果。" />

      <section className="panel form-grid">
        <div className="field">
          <label htmlFor="likedTitles">喜欢的作品（逗号分隔）</label>
          <input id="likedTitles" value={likedTitles} onChange={(event) => setLikedTitles(event.target.value)} />
        </div>
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="preferredTags">偏好标签</label>
            <input id="preferredTags" value={preferredTags} onChange={(event) => setPreferredTags(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="excludedTags">排除标签</label>
            <input id="excludedTags" value={excludedTags} onChange={(event) => setExcludedTags(event.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="platform">平台</label>
          <input id="platform" value={platform} onChange={(event) => setPlatform(event.target.value)} />
        </div>
        <div className="actions">
          <button type="button" className="button" onClick={submit} disabled={loading}>
            {loading ? "生成中..." : "生成推荐"}
          </button>
        </div>
      </section>

      {message ? <section className="panel">{message}</section> : null}

      <section className="panel stack">
        <h2 className="section-title">推荐结果</h2>
        {items.length === 0 ? (
          <div className="empty">还没有结果，点击上面的按钮生成推荐。</div>
        ) : (
          <div className="grid cols-3">
            {items.map((item) => (
              <RecommendationCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
