import type { RecommendationResult } from "@/lib/types";

export function RecommendationCard({ item }: { item: RecommendationResult }) {
  return (
    <article className="panel stack">
      <div className="card-title">
        <div>
          <h3 className="section-title">{item.title}</h3>
          <div className="meta">
            <span>Score {item.score}</span>
            <span>{item.priceLabel}</span>
            {item.discountPercent != null ? <span>-{item.discountPercent}%</span> : null}
          </div>
        </div>
        <span className="chip accent-chip">推荐</span>
      </div>

      <div className="chip-row">
        {item.genres.map((genre) => (
          <span key={genre} className="chip">
            #{genre}
          </span>
        ))}
      </div>

      <div className="meta">
        <span>{item.platforms.join(" / ")}</span>
      </div>

      <p className="muted">{item.rationale}</p>

      {item.storeUrl ? (
        <div className="actions">
          <a href={item.storeUrl} target="_blank" rel="noreferrer" className="button secondary">
            前往 Steam 商店
          </a>
        </div>
      ) : null}
    </article>
  );
}
