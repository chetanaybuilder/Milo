export default function WeatherCard({ data }) {
  if (!data) return null;
  const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null;
  const rows = [
    ['Feels like', `${data.feels_like}°`],
    ['Humidity', data.humidity != null ? `${data.humidity}%` : '–'],
    ['Wind', `${data.wind} km/h`],
    ['Precipitation', data.precipitation != null ? `${data.precipitation} mm` : '–'],
  ];
  return (
    <article className="weather" aria-label={`Weather in ${data.location}`}>
      <div className="w-head">
        <div>
          <h4>{data.location}</h4>
          <p>{data.conditions}</p>
        </div>
        <div className="w-temp">{data.temperature}<sup>°C</sup></div>
      </div>
      <dl>
        {rows.map(([k, v]) => (<div key={k}><dt>{k}</dt><dd>{v}</dd></div>))}
      </dl>
      {time && <p className="w-time">Updated {time}</p>}
    </article>
  );
}
