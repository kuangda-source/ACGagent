"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
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

export function DigestCard({ digest }: { digest: DailyDigestView }) {
  const rootRef = useRef<HTMLElement | null>(null);
  const activeTrackRef = useRef<HTMLDivElement | null>(null);
  const [activeArticle, setActiveArticle] = useState<NewsArticleSummary | null>(null);
  const [briefById, setBriefById] = useState<Record<string, NewsBriefView>>({});
  const [loadingArticleId, setLoadingArticleId] = useState<string | null>(null);
  const [briefError, setBriefError] = useState("");
  const [hoveredBySection, setHoveredBySection] = useState<Record<string, string | null>>({});
  const briefRef = useRef<Record<string, NewsBriefView>>({});

  useEffect(() => {
    briefRef.current = briefById;
  }, [briefById]);

  const groupedSections = useMemo(
    () =>
      sectionConfig.map((section) => ({
        ...section,
        items: toSorted(digest.highlights.filter((item) => section.categories.has(item.category))).slice(0, 10)
      })),
    [digest.highlights]
  );

  const activeBrief = activeArticle ? briefById[activeArticle.id] : null;

  async function fetchBrief(
    article: NewsArticleSummary,
    options?: {
      forceRefresh?: boolean;
      silent?: boolean;
    }
  ) {
    const forceRefresh = options?.forceRefresh ?? false;
    const silent = options?.silent ?? false;

    if (!forceRefresh && (briefRef.current[article.id] || loadingArticleId === article.id)) {
      return;
    }

    if (!silent) {
      setLoadingArticleId(article.id);
    }
    try {
      const response = await fetch("/api/news/brief", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ...article,
          forceRefresh
        })
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
      if (!silent) {
        setBriefError("生成浓缩摘要失败，请稍后重试。");
      }
    } finally {
      if (!silent) {
        setLoadingArticleId((current) => (current === article.id ? null : current));
      }
    }
  }

  async function openBrief(article: NewsArticleSummary, options?: { forceRefresh?: boolean }) {
    setActiveArticle(article);
    setBriefError("");
    await fetchBrief(article, {
      forceRefresh: options?.forceRefresh ?? false,
      silent: false
    });
  }

  function onArticleKeyDown(event: ReactKeyboardEvent<HTMLElement>, article: NewsArticleSummary) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void openBrief(article);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const articles = [...digest.highlights];
    let cursor = 0;

    async function worker() {
      while (!cancelled) {
        const article = articles[cursor];
        cursor += 1;

        if (!article) {
          break;
        }

        if (briefRef.current[article.id]) {
          continue;
        }

        await fetchBrief(article, { silent: true });
      }
    }

    void Promise.all([worker(), worker()]);
    return () => {
      cancelled = true;
    };
  }, [digest.id, digest.highlights]);

  function resolveWheelStep(deltaX: number, deltaY: number, deltaMode: number, containerWidth: number) {
    const dominantDelta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
    if (Math.abs(dominantDelta) < 0.5) {
      return 0;
    }

    let step = dominantDelta;
    if (deltaMode === 1) {
      step *= 36;
    } else if (deltaMode === 2) {
      step *= containerWidth;
    }
    return step * 1.2;
  }

  function scrollTrackWithWheel(track: HTMLDivElement, event: { deltaX: number; deltaY: number; deltaMode: number }) {
    if (track.scrollWidth <= track.clientWidth) {
      return false;
    }

    const step = resolveWheelStep(event.deltaX, event.deltaY, event.deltaMode, track.clientWidth);
    if (Math.abs(step) < 0.5) {
      return false;
    }

    track.scrollLeft += step;
    return true;
  }

  function onTrackWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const consumed = scrollTrackWithWheel(event.currentTarget, {
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaMode: event.deltaMode
    });

    if (!consumed) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    const onWindowWheel = (event: WheelEvent) => {
      const track = activeTrackRef.current;
      if (!track || !document.body.contains(track)) {
        return;
      }

      const consumed = scrollTrackWithWheel(track, {
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode
      });

      if (!consumed) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("wheel", onWindowWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWindowWheel);
    };
  }, []);

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
    <section ref={rootRef} className="panel stack">
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
          const hoveredId = hoveredBySection[section.key] ?? null;
          return (
            <section key={section.key} className="digest-row-section">
              <div className="card-title">
                <h3 className="section-title">{section.title}</h3>
                <span className="meta">{section.items.length} 条</span>
              </div>

              {section.items.length === 0 ? (
                <div className="empty">暂无内容</div>
              ) : (
                <div
                  className={`digest-row-track ${hoveredId ? "has-hover" : ""}`}
                  onWheel={onTrackWheel}
                  onMouseEnter={(event) => {
                    activeTrackRef.current = event.currentTarget;
                  }}
                  onMouseLeave={(event) => {
                    if (activeTrackRef.current === event.currentTarget) {
                      activeTrackRef.current = null;
                    }
                  }}
                >
                  {section.items.map((article) => {
                    const isHovered = hoveredId === article.id;
                    const isDimmed = Boolean(hoveredId && hoveredId !== article.id);
                    return (
                    <article
                      key={article.id}
                      className={`list-item digest-row-item ${isHovered ? "is-hovered" : ""} ${
                        isDimmed ? "is-dimmed" : ""
                      }`}
                      role="button"
                      tabIndex={0}
                      aria-label={`查看新闻浓缩：${article.title}`}
                      onClick={() => void openBrief(article)}
                      onKeyDown={(event) => onArticleKeyDown(event, article)}
                      onMouseEnter={() => setHoveredBySection((current) => ({ ...current, [section.key]: article.id }))}
                      onMouseLeave={() => setHoveredBySection((current) => ({ ...current, [section.key]: null }))}
                    >
                      <div className="card-title">
                        <h4 className="news-title-button">{article.title}</h4>
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noreferrer"
                          className="button ghost news-link"
                          onClick={(event) => event.stopPropagation()}
                        >
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
                  )})}
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

            {loadingArticleId === activeArticle.id ? <div className="empty">正在读取浓缩信息...</div> : null}
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
              <button type="button" className="button ghost" onClick={() => void openBrief(activeArticle, { forceRefresh: true })}>
                重新生成浓缩
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
