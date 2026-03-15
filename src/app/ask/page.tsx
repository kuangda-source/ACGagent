"use client";

import { useMemo, useState } from "react";
import type { WorkDetail, WorkType } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { WorkDetailCard } from "@/components/work-detail-card";

type AskResponse =
  | { status: "found"; match: WorkDetail }
  | { status: "not_found"; suggestions: string[] }
  | { error: string };

export default function AskPage() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<WorkType>("ANIME");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);

  const placeholder = useMemo(() => (type === "ANIME" ? "例如：葬送的芙莉莲" : "例如：P5R"), [type]);

  async function submit() {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, type })
      });
      const payload = (await response.json()) as AskResponse;
      setResult(payload);
    } catch {
      setResult({ error: "请求失败，请稍后重试。" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack">
      <PageHeader eyebrow="Ask Agent" title="按标题或别名查资源" description="支持动漫和游戏关键词，返回评分、价格与合规来源。" />

      <section className="panel form-grid">
        <div className="grid cols-2">
          <div className="field">
            <label htmlFor="query">关键词</label>
            <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} />
          </div>
          <div className="field">
            <label htmlFor="type">类型</label>
            <select id="type" value={type} onChange={(event) => setType(event.target.value as WorkType)}>
              <option value="ANIME">Anime</option>
              <option value="GAME">Game</option>
            </select>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="button" onClick={submit} disabled={loading}>
            {loading ? "查询中..." : "开始查询"}
          </button>
        </div>
      </section>

      {!result ? null : "error" in result ? (
        <div className="panel">{result.error}</div>
      ) : result.status === "found" ? (
        <WorkDetailCard work={result.match} />
      ) : (
        <section className="panel stack">
          <h2 className="section-title">未找到匹配</h2>
          <div className="muted">你可以尝试这些关键词：</div>
          <div className="chip-row">
            {result.suggestions.map((item) => (
              <span key={item} className="chip">
                {item}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
