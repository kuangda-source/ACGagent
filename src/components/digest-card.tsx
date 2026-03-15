"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyDigestView, NewsArticleSummary, NewsBriefView } from "@/lib/types";

const sectionConfig = [
  {
    key: "anime",
    title: "动漫资讯",
    categories: new Set(["anime", "industry", "event", "other"])
  },
  {
    key: "comic",
    title: "漫画资讯",
    categories: new Set(["comic"])
  },
  {
    key: "game",
    title: "游戏资讯",
    categories: new Set(["game"])
  }
] as const;

function categoryLabel(category: string) {
  switch (category) {
    case "anime":
      return "动漫";
    case "comic":
      return "漫画";
    case "game":
      return "游戏";
    case "industry":
      return "业界";
    case "event":
      return "活动";
    default:
      return "其他";
  }
}

function toSorted(items: NewsArticleSummary[]) {
  return [...items].sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
}

function featuredIndex(length: number) {
  if (length <= 0) {
    return -1;
  }
  return Math.floor(length / 2);
}

export function DigestCard({ digest }: { digest: DailyDigestView }) {
  const [activeArticle, setActiveArticle] = useState<NewsArticleSummary | null>(null);
  const [briefById, setBriefById] = useState<Record<string, NewsBriefView>>({});
  const [loadingArticleId, setLoadingArticleId] = useState<string | null>(null);
  const [briefError, setBriefError] = useState("");

  const groupedSections = useMemo(
    () =>
      sectionConfig.map((section) => ({
        ...section,
        items: toSorted(digest.highlights.filter((item) => section.categories.has(item.category)))
      })),
    [digest.highlights]
  );

  const activeBrief = activeArticle ? briefById[activeArticle.id] : null;

  async function openBrief(article: NewsArticleSummary) {
    setActiveArticle(article);
    setBriefError("");

    if (briefById[article.id] || loadingArticleId === article.id) {
      return;
    }

    setLoadingArticleId(article.id);
    try {
      const response = await fetch("/api/news/brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(article)
      });

      if (!response.ok) {
        throw new Error("摘要服务不可用");
      }

      const payload = (await response.json()) as NewsBriefView;
      setBriefById((current) => ({
        ...current,
        [article.id]: payload
      }));
    } catch {
      setBriefError("生成浓缩摘要失败，请稍后重试。");
    } finally {
      setLoadingArticleId((current) => (current === article.id ? null : current));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveArticle(null);
      }
    }

    if (!activeArticle) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeArticle]);

  return (
    <section className="panel stack">
      <div className="card-title">
        <div>
          <h2 className="section-title">{digest.title}</h2>
          <div className="meta">
            <span>{digest.digestDate}</span>
            <span>{digest.highlights.length} 条精选</span>
          </div>
        </div>
        <span className="chip accent-chip">日报</span>
      </div>

      <p className="muted">{digest.summary}</p>

      <div className="digest-rows">
        {groupedSections.map((section) => {
          const highlightAt = featuredIndex(section.items.length);
          return (
            <section key={section.key} className="digest-row-section">
              <div className="card-title">
                <h3 className="section-title">{section.title}</h3>
                <span className="meta">{section.items.length} 条</span>
              </div>

              {section.items.length === 0 ? (
                <div className="empty">暂无内容</div>
              ) : (
                <div className="digest-row-track">
                  {section.items.map((article, index) => (
                    <article key={article.id} className={`list-item digest-row-item ${index === highlightAt ? "is-featured" : ""}`}>
                      <div className="card-title">
                        <button type="button" className="news-title-button" onClick={() => void openBrief(article)}>
                          {article.title}
                        </button>
                        <a href={article.url} target="_blank" rel="noreferrer" className="button ghost news-link">
                          查看来源
                        </a>
                      </div>
                      <div className="meta">
                        <span>{article.sourceName}</span>
                        <span>{categoryLabel(article.category)}</span>
                        <span>{new Date(article.publishedAt).toLocaleString("zh-CN")}</span>
                      </div>
                      <p className="muted">{article.summary}</p>
                      {article.originalTitle && article.originalTitle !== article.title ? <p className="meta">原标题：{article.originalTitle}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {activeArticle ? (
        <div className="news-brief-backdrop" onClick={() => setActiveArticle(null)}>
          <section className="news-brief-modal" onClick={(event) => event.stopPropagation()}>
            <div className="card-title">
              <h3 className="section-title">新闻浓缩</h3>
              <button type="button" className="button ghost" onClick={() => setActiveArticle(null)}>
                关闭
              </button>
            </div>

            <p className="headline">{activeArticle.title}</p>
            <p className="meta">
              <span>{activeArticle.sourceName}</span>
              <span>{categoryLabel(activeArticle.category)}</span>
              <span>{new Date(activeArticle.publishedAt).toLocaleString("zh-CN")}</span>
            </p>

            {loadingArticleId === activeArticle.id ? <div className="empty">正在生成浓缩信息...</div> : null}
            {briefError ? <div className="empty">{briefError}</div> : null}

            {!loadingArticleId && activeBrief ? (
              <div className="stack">
                <p>{activeBrief.brief}</p>
                {activeBrief.keyPoints.length > 0 ? (
                  <ul className="news-brief-list">
                    {activeBrief.keyPoints.map((point, index) => (
                      <li key={`${activeBrief.articleId}-${index}`}>{point}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {!loadingArticleId && !activeBrief ? <p className="muted">{activeArticle.summary}</p> : null}

            <div className="actions">
              <a href={activeArticle.url} target="_blank" rel="noreferrer" className="button secondary">
                查看原文
              </a>
              <button type="button" className="button ghost" onClick={() => void openBrief(activeArticle)}>
                重新生成浓缩
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
