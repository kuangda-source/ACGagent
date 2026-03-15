"use client";

import { useEffect, useState } from "react";
import type { LibraryScanResult } from "@/lib/types";
import { PageHeader } from "@/components/page-header";

export default function LibraryPage() {
  const [result, setResult] = useState<LibraryScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadLast() {
    try {
      const response = await fetch("/api/library/scan");
      const payload = (await response.json()) as { result?: LibraryScanResult; error?: string };
      if (payload.result) {
        setResult(payload.result);
      }
    } catch {
      // Ignore initial fetch error.
    }
  }

  async function triggerScan() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/library/scan", { method: "POST" });
      const payload = (await response.json()) as { result?: LibraryScanResult; error?: string };
      if (payload.error) {
        setMessage(payload.error);
      } else if (payload.result) {
        setResult(payload.result);
      }
    } catch {
      setMessage("扫描失败，请检查目录配置或权限。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLast();
  }, []);

  return (
    <div className="stack">
      <PageHeader eyebrow="Library" title="扫描本地番剧/游戏资源" description="读取设置页中的目录，识别标题和集数，给出缺集提示。" />

      <section className="panel">
        <div className="actions">
          <button type="button" className="button" onClick={triggerScan} disabled={loading}>
            {loading ? "扫描中..." : "开始扫描"}
          </button>
        </div>
        {message ? <p className="muted">{message}</p> : null}
      </section>

      <section className="panel stack">
        <div className="card-title">
          <h2 className="section-title">扫描结果</h2>
          <span className="meta">{result ? new Date(result.scannedAt).toLocaleString("zh-CN") : "尚未扫描"}</span>
        </div>

        {!result ? (
          <div className="empty">还没有扫描结果。</div>
        ) : (
          <>
            <div className="meta">Root: {result.rootPath}</div>
            <div className="meta">文件数：{result.entries.length}</div>

            {result.missingEpisodeHints.length > 0 ? (
              <div className="stack">
                <h3>缺集提示</h3>
                <ul className="list">
                  {result.missingEpisodeHints.map((hint) => (
                    <li key={hint.title} className="list-item">
                      <strong>{hint.title}</strong> 缺少：{hint.missingEpisodes.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ul className="list">
              {result.entries.slice(0, 80).map((entry) => (
                <li key={entry.filePath} className="list-item">
                  <div className="card-title">
                    <strong>{entry.detectedTitle}</strong>
                    <span className="meta">{entry.episode?.episodeNumber ? `EP${entry.episode.episodeNumber}` : "未识别集数"}</span>
                  </div>
                  <div className="meta">{entry.fileName}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
