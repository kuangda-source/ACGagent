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
        description="聚合昨日新闻、推荐和本地库状态，打开页面即可看到最新概览。"
        actionsAlign="top"
        actions={
          <div className="hero-metric-column">
            <section className="hero-mini-metric">
              <span className="hero-mini-label">昨日资讯</span>
              <span className="hero-mini-value">{snapshot.digest.highlights.length}</span>
            </section>
            <section className="hero-mini-metric">
              <span className="hero-mini-label">本地文件</span>
              <span className="hero-mini-value">{snapshot.librarySummary.totalFiles}</span>
            </section>
            <section className="hero-mini-metric">
              <span className="hero-mini-label">追踪番剧</span>
              <span className="hero-mini-value">{snapshot.librarySummary.trackedSeries}</span>
            </section>
          </div>
        }
      />

      <DigestCard digest={snapshot.digest} />

      <section className="panel stack">
        <h2 className="section-title">推荐精选</h2>
        <div className="grid cols-3">
          {snapshot.recommendationHighlights.map((item) => (
            <RecommendationCard key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
