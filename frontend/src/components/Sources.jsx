export default function Sources({ items }) {
  if (!items?.length) return null;
  const strip = (t) => t ? t.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1').replace(/[*_#`~>]/g, '').trim() : '';
  return (
    <section className="sources" aria-label="Sources">
      <h4>Sources</h4>
      <ul>
        {items.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              <span className="s-title">{s.title}</span>
              <span className="s-domain">{s.domain}</span>
              {s.snippet && <span className="s-snip">{strip(s.snippet)}</span>}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
