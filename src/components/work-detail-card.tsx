import type { WorkDetail } from "@/lib/types";
import { formatPrice } from "@/lib/utils";

export function WorkDetailCard({ work }: { work: WorkDetail }) {
  const primaryRating = work.ratings[0];

  return (
    <article className="panel stack">
      <div className="card-title">
        <div className="stack">
          <h2 className="section-title">{work.title}</h2>
          <div className="meta">
            <span>{work.type === "ANIME" ? "Anime" : "Game"}</span>
            {work.releaseYear ? <span>{work.releaseYear}</span> : null}
            {work.episodeCount ? <span>{work.episodeCount} 集</span> : null}
            {work.creator ? <span>{work.creator}</span> : null}
          </div>
        </div>
        {primaryRating ? (
          <span className="chip accent-chip">
            {primaryRating.source} {primaryRating.value}/{primaryRating.scale}
          </span>
        ) : null}
      </div>

      <p className="muted">{work.description}</p>

      <div className="chip-row">
        {work.genres.map((genre) => (
          <span key={genre} className="chip">
            #{genre}
          </span>
        ))}
      </div>

      {work.type === "GAME" ? (
        <div className="grid cols-3">
          <div className="list-item">
            <strong>当前价格</strong>
            <div>{formatPrice(work.currentPrice, work.currency)}</div>
          </div>
          <div className="list-item">
            <strong>原价</strong>
            <div>{formatPrice(work.originalPrice, work.currency)}</div>
          </div>
          <div className="list-item">
            <strong>史低</strong>
            <div>{work.lowestPrice != null ? formatPrice(work.lowestPrice, work.currency) : "暂无历史低价"}</div>
          </div>
        </div>
      ) : null}

      {work.reviewSummary ? <div className="list-item">{work.reviewSummary}</div> : null}

      <div className="stack">
        <h3>评分与资料来源</h3>
        <ul className="list">
          {work.ratings.map((rating) => (
            <li key={`${rating.source}-${rating.url ?? rating.value}`} className="list-item">
              <strong>{rating.source}</strong> {rating.value}/{rating.scale}
              {rating.label ? ` · ${rating.label}` : ""}
              {rating.votes ? ` · ${rating.votes.toLocaleString()} votes` : ""}
            </li>
          ))}
        </ul>
      </div>

      <div className="stack">
        <h3>合规来源</h3>
        <div className="actions">
          {work.officialResources.map((resource) => (
            <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer" className="button secondary">
              {resource.label}
            </a>
          ))}
        </div>
      </div>
    </article>
  );
}
