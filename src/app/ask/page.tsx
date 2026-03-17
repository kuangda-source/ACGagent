"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { WorkDetail, WorkType } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { WorkDetailCard } from "@/components/work-detail-card";

type AskResponse =
  | { status: "found"; match: WorkDetail }
  | { status: "not_found"; suggestions: string[] }
  | { error: string };

interface RecentQuery {
  query: string;
  type: WorkType;
  answeredAt: string;
}

interface DashboardResponse {
  recentQueries?: RecentQuery[];
}

interface RunAskOptions {
  updateUrl: boolean;
}

export default function AskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lastTriggeredKeyRef = useRef("");

  const [query, setQuery] = useState("");
  const [type, setType] = useState<WorkType>("ANIME");
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [recentQueries, setRecentQueries] = useState<RecentQuery[]>([]);

  const placeholder = useMemo(() => (type === "ANIME" ? "例如：葬送的芙莉莲" : "例如：P5R"), [type]);

  async function loadRecentQueries() {
    try {
      const response = await fetch("/api/dashboard", {
        method: "GET",
        cache: "no-store"
      });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as DashboardResponse;
      setRecentQueries(payload.recentQueries ?? []);
    } catch {
      // Keep silent; Ask core flow should not be blocked.
    }
  }

  function updateAskUrl(nextQuery: string, nextType: WorkType) {
    const params = new URLSearchParams();
    params.set("q", nextQuery);
    params.set("type", nextType);
    router.replace(`/ask?${params.toString()}`, { scroll: false });
  }

  async function runAsk(nextQuery: string, nextType: WorkType, options: RunAskOptions) {
    const trimmed = nextQuery.trim();
    if (!trimmed) {
      return;
    }

    const requestKey = `${nextType}:${trimmed}`;
    lastTriggeredKeyRef.current = requestKey;
    setQuery(trimmed);
    setType(nextType);
    if (options.updateUrl) {
      updateAskUrl(trimmed, nextType);
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, type: nextType })
      });
      const payload = (await response.json()) as AskResponse;
      setResult(payload);
      void loadRecentQueries();
    } catch {
      setResult({ error: "请求失败，请稍后重试。" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecentQueries();
  }, []);

  useEffect(() => {
    const queryFromUrl = (searchParams.get("q") ?? "").trim();
    if (!queryFromUrl) {
      return;
    }
    const typeFromUrl = searchParams.get("type") === "GAME" ? "GAME" : "ANIME";
    const requestKey = `${typeFromUrl}:${queryFromUrl}`;
    if (lastTriggeredKeyRef.current === requestKey) {
      return;
    }
    void runAsk(queryFromUrl, typeFromUrl, { updateUrl: false });
  }, [searchParams]);

  async function submit() {
    await runAsk(query, type, { updateUrl: true });
  }

  async function quickOpenRecent(item: RecentQuery) {
    await runAsk(item.query, item.type, { updateUrl: true });
  }

  async function clearRecentQueries() {
    setClearing(true);
    try {
      await fetch("/api/ask/history", { method: "DELETE" });
      setRecentQueries([]);
    } finally {
      setClearing(false);
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
              <option value="ANIME">动漫</option>
              <option value="GAME">游戏</option>
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

      <section className="panel stack recent-query-panel">
        <div className="card-title">
          <h2 className="section-title">最近查询</h2>
          <div className="actions">
            <span className="meta">已保存 {recentQueries.length} 条（窗口约显示 5 条）</span>
            <button type="button" className="button ghost" onClick={clearRecentQueries} disabled={clearing}>
              {clearing ? "清空中..." : "清空记录"}
            </button>
          </div>
        </div>
        {recentQueries.length === 0 ? (
          <div className="empty">还没有查询记录，先搜索一个作品试试。</div>
        ) : (
          <div className="recent-query-scroll">
            <ul className="recent-query-list">
              {recentQueries.map((item, index) => (
                <li key={`${item.query}-${item.answeredAt}-${index}`} className="recent-query-item">
                  <div className="card-title">
                    <button type="button" className="recent-query-title-btn" onClick={() => void quickOpenRecent(item)}>
                      {item.query}
                    </button>
                    <span className="chip">{item.type === "ANIME" ? "动漫" : "游戏"}</span>
                  </div>
                  <div className="meta">{new Date(item.answeredAt).toLocaleString("zh-CN")}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
