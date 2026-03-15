import { DigestCard } from "@/components/digest-card";
import { PageHeader } from "@/components/page-header";
import { RecommendationCard } from "@/components/recommendation-card";
import { getDashboardSnapshot } from "@/server/dashboard/service";

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <div className="stack">
      <PageHeader
        eyebrow="Dashboard"
        title="昨日 ACG 雷达"
        description="聚合昨日新闻、近期查询、推荐和本地库状态，打开页面即可看到最新概览。"
      />

      <div className="grid cols-3">
        <section className="panel metric">
          <span className="muted">近期查询</span>
          <span className="metric-value">{snapshot.recentQueries.length}</span>
        </section>
        <section className="panel metric">
          <span className="muted">本地文件</span>
          <span className="metric-value">{snapshot.librarySummary.totalFiles}</span>
        </section>
        <section className="panel metric">
          <span className="muted">追踪番剧</span>
          <span className="metric-value">{snapshot.librarySummary.trackedSeries}</span>
        </section>
      </div>

      <DigestCard digest={snapshot.digest} />

      <section className="panel stack">
        <h2 className="section-title">推荐精选</h2>
        <div className="grid cols-3">
          {snapshot.recommendationHighlights.map((item) => (
            <RecommendationCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div className="card-title">
          <h2 className="section-title">最近查询</h2>
          <span className="meta">上次扫描：{snapshot.librarySummary.lastScanLabel}</span>
        </div>
        {snapshot.recentQueries.length === 0 ? (
          <div className="empty">还没有查询记录，去 Ask 页试试吧。</div>
        ) : (
          <ul className="list">
            {snapshot.recentQueries.map((query, index) => (
              <li key={`${query.query}-${index}`} className="list-item">
                <div className="card-title">
                  <strong>{query.query}</strong>
                  <span className="chip">{query.type}</span>
                </div>
                <div className="meta">{new Date(query.answeredAt).toLocaleString("zh-CN")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
