import { useState, useEffect, useCallback } from "react";

/* ============================================================
   EPISODIO V7 — TV Time clone
   Shows: TVMaze API (episode/season tracking)
   Movies: TMDB API (watched / to watch)
   TVMaze is free without a key; TMDB needs a free key.
   Persistence: localStorage (works in Capacitor WebView too).
   ============================================================ */

const T = {
  bg: "#0c0e09",
  surface: "#151810",
  surface2: "#1d2115",
  accent: "#c8f042",
  accentDim: "#8ba32e",
  text: "#e9ede0",
  muted: "#8a9180",
  ended: "#f0642f",
  border: "#262b1c",
};

/* ---------- storage (localStorage) ---------- */
const LS_KEY = "episodio_library_v1";
const store = {
  load() {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (!v) return {};
      const raw = JSON.parse(v);
      // migration from V3/V4 (shows only, bare-id keys)
      const lib = {};
      for (const [k, e] of Object.entries(raw)) {
        if (e.type) lib[k] = e;
        else lib[`tv-${e.show.id}`] = { type: "show", ...e };
      }
      return lib;
    } catch {
      return {};
    }
  },
  save(lib) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(lib));
    } catch {}
  },
};

/* ---------- TVMaze API (shows) ---------- */
async function apiSearchShows(q) {
  const r = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.map((x) => normalizeShow(x.show));
}
async function apiEpisodes(showId) {
  const r = await fetch(`https://api.tvmaze.com/shows/${showId}/episodes`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data = await r.json();
  return data.map((e) => ({
    id: e.id,
    season: e.season,
    number: e.number,
    name: e.name,
    airdate: e.airdate || "",
  }));
}
function normalizeShow(s) {
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    premiered: s.premiered ? s.premiered.slice(0, 4) : "?",
    ended: s.ended ? s.ended.slice(0, 4) : null,
    network: s.network?.name || s.webChannel?.name || "—",
    image: s.image?.medium || null,
    genres: s.genres || [],
  };
}

/* ---------- TMDB API (movies) ----------
   Free key: https://www.themoviedb.org/settings/api
   Put it in .env as VITE_TMDB_KEY (see .env.example). */
const TMDB_KEY = import.meta.env.VITE_TMDB_KEY;
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";

const TMDB_GENRES = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};

async function apiSearchMovies(q) {
  if (!TMDB_KEY || TMDB_KEY === "your_key_here") {
    throw new Error("VITE_TMDB_KEY missing in .env file");
  }
  const r = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(q)}&language=en-US&include_adult=false`
  );
  if (!r.ok) throw new Error(`HTTP ${r.status}${r.status === 401 ? " — invalid TMDB key" : ""}`);
  const data = await r.json();
  return (data.results || []).map((m) => ({
    id: m.id,
    name: m.title,
    year: m.release_date ? m.release_date.slice(0, 4) : "?",
    image: m.poster_path ? `${TMDB_IMG}${m.poster_path}` : null,
    genre: TMDB_GENRES[m.genre_ids?.[0]] || "—",
  }));
}

/* ---------- helpers ---------- */
const statusIt = (s) =>
  s === "Ended" ? "ENDED" : s === "Running" ? "RUNNING" : s === "To Be Determined" ? "TBD" : (s || "").toUpperCase();
const statusColor = (s) => (s === "Ended" ? T.ended : s === "Running" ? T.accent : T.muted);

/* ---------- components ---------- */
function Chip({ children, color }) {
  return (
    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: 1.5, color, border: `1px solid ${color}`, padding: "2px 7px", borderRadius: 3, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
const Badge = ({ status }) => <Chip color={statusColor(status)}>{statusIt(status)}</Chip>;

function Progress({ pct }) {
  return (
    <div style={{ height: 5, background: T.surface2, borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: T.accent, transition: "width .3s" }} />
    </div>
  );
}

function Poster({ item, size = 64 }) {
  return item.image ? (
    <img src={item.image} alt={item.name} style={{ width: size, height: size * 1.4, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size * 1.4, borderRadius: 6, flexShrink: 0, background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: size / 2.4, color: T.accentDim }}>
      {item.name[0]}
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  return (
    <div style={{ background: T.surface, borderLeft: `3px solid ${T.ended}`, borderRadius: 6, padding: "12px 14px", fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
      {msg}
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <button onClick={onRetry} style={btnGhost}>↻ retry</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
export default function App() {
  const [view, setView] = useState("library"); // library | search | detail
  const [library, setLibrary] = useState(() => store.load());
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("tv"); // tv | movie
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [current, setCurrent] = useState(null); // library key (tv-x / mv-x)
  const [episodes, setEpisodes] = useState([]);
  const [epLoading, setEpLoading] = useState(false);
  const [epError, setEpError] = useState(null);
  const [openSeason, setOpenSeason] = useState(null);

  const save = useCallback((lib) => {
    setLibrary(lib);
    store.save(lib);
  }, []);

  const doSearch = async (typeOverride) => {
    const type = typeOverride || searchType;
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      setResults(type === "tv" ? await apiSearchShows(query.trim()) : await apiSearchMovies(query.trim()));
    } catch (e) {
      setSearchError(`Network error (${e.message}). Check your connection.`);
    }
    setSearching(false);
  };

  const switchType = (type) => {
    setSearchType(type);
    setResults(null);
    setSearchError(null);
    if (query.trim()) doSearch(type);
  };

  const addShow = (show) => {
    const key = `tv-${show.id}`;
    if (library[key]) return;
    save({ ...library, [key]: { type: "show", show, watched: {} } });
  };
  const addMovie = (movie) => {
    const key = `mv-${movie.id}`;
    if (library[key]) return;
    save({ ...library, [key]: { type: "movie", movie, watched: false } });
  };
  const removeEntry = (key) => {
    const lib = { ...library };
    delete lib[key];
    save(lib);
    setView("library");
  };

  const loadEpisodes = useCallback(async (showId) => {
    setEpLoading(true);
    setEpError(null);
    try {
      setEpisodes(await apiEpisodes(showId));
    } catch (e) {
      setEpisodes([]);
      setEpError(`Couldn't load episodes (${e.message}).`);
    }
    setEpLoading(false);
  }, []);

  const openDetail = (key) => {
    setCurrent(key);
    setView("detail");
    setOpenSeason(null);
    setEpisodes([]);
    const entry = library[key];
    if (entry.type === "show") loadEpisodes(entry.show.id);
  };

  const toggleEp = (epId) => {
    const entry = library[current];
    const watched = { ...entry.watched };
    if (watched[epId]) delete watched[epId];
    else watched[epId] = true;
    save({ ...library, [current]: { ...entry, watched } });
  };
  const markSeason = (season, value) => {
    const entry = library[current];
    const watched = { ...entry.watched };
    episodes.filter((e) => e.season === season).forEach((e) => {
      if (value) watched[e.id] = true;
      else delete watched[e.id];
    });
    save({ ...library, [current]: { ...entry, watched } });
  };
  const toggleMovie = (key) => {
    const entry = library[key];
    save({ ...library, [key]: { ...entry, watched: !entry.watched } });
  };

  // cache total episode count for the library progress bar
  useEffect(() => {
    if (view !== "detail" || !current || episodes.length === 0) return;
    const entry = library[current];
    if (entry?.type === "show" && entry.show.totalEps !== episodes.length) {
      save({ ...library, [current]: { ...entry, show: { ...entry.show, totalEps: episodes.length } } });
    }
  }, [episodes, view, current]); // eslint-disable-line

  const libEntries = Object.entries(library);

  const page = { minHeight: "100vh", background: T.bg, color: T.text, fontFamily: "'JetBrains Mono', monospace", maxWidth: 480, margin: "0 auto", paddingBottom: 90 };
  const h1 = { fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 26, letterSpacing: -0.5, margin: 0 };

  /* ---------- library cards ---------- */
  const renderShowCard = (key, { show, watched }) => {
    const total = show.totalEps || null;
    const seen = Object.keys(watched).length;
    const pct = total ? Math.min(100, Math.round((seen / total) * 100)) : null;
    return (
      <div key={key} onClick={() => openDetail(key)} style={cardStyle}>
        <Poster item={show} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={cardTitle}>{show.name}</div>
            <Badge status={show.status} />
          </div>
          <div style={{ color: T.muted, fontSize: 11, margin: "5px 0 10px" }}>
            {show.network} · {show.premiered}
            {show.ended ? `–${show.ended}` : "–"}
          </div>
          {total ? (
            <>
              <Progress pct={pct} />
              <div style={{ fontSize: 11, color: T.muted, marginTop: 5 }}>
                <span style={{ color: T.accent }}>{seen}</span>/{total} episodes
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11, color: T.muted }}>{seen > 0 ? `${seen} episodes watched` : "open for episodes"}</div>
          )}
        </div>
      </div>
    );
  };

  const renderMovieCard = (key, { movie, watched }) => (
    <div key={key} onClick={() => openDetail(key)} style={cardStyle}>
      <Poster item={movie} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div style={cardTitle}>{movie.name}</div>
          <Chip color={T.accentDim}>MOVIE</Chip>
        </div>
        <div style={{ color: T.muted, fontSize: 11, margin: "5px 0 12px" }}>
          {movie.genre} · {movie.year}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMovie(key);
          }}
          style={watched ? { ...btnAccent, padding: "7px 12px", fontSize: 11 } : { ...btnOutline, padding: "7px 12px", fontSize: 11 }}
        >
          {watched ? "✓ Watched" : "To watch"}
        </button>
      </div>
    </div>
  );

  /* ---------- views ---------- */
  const renderLibrary = () => (
    <div style={{ padding: "24px 16px" }}>
      <h1 style={h1}>
        Watch<span style={{ color: T.accent }}>log</span>
      </h1>
      <p style={{ color: T.muted, fontSize: 12, margin: "4px 0 24px" }}>shows and movies, episode by episode</p>
      {libEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: T.muted, fontSize: 13, lineHeight: 1.7 }}>
          Nothing here yet.
          <br />
          Search for a show or movie and start tracking.
          <div style={{ marginTop: 20 }}>
            <button onClick={() => setView("search")} style={btnAccent}>Search</button>
          </div>
        </div>
      ) : (
        libEntries.map(([key, entry]) =>
          entry.type === "movie" ? renderMovieCard(key, entry) : renderShowCard(key, entry)
        )
      )}
    </div>
  );

  const renderSearch = () => (
    <div style={{ padding: "24px 16px" }}>
      <h1 style={h1}>Search</h1>
      <div style={{ display: "flex", gap: 8, margin: "16px 0 10px" }}>
        {[
          { id: "tv", label: "SHOWS" },
          { id: "movie", label: "MOVIES" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => switchType(t.id)}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              border: `1px solid ${searchType === t.id ? T.accent : T.border}`,
              background: searchType === t.id ? T.accent : "transparent",
              color: searchType === t.id ? T.bg : T.muted,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, margin: "0 0 18px" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
          placeholder={searchType === "tv" ? "Show title…" : "Movie title…"}
          style={{ flex: 1, minWidth: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px", color: T.text, fontFamily: "inherit", fontSize: 14, outline: "none" }}
        />
        <button onClick={() => doSearch()} style={btnAccent} disabled={searching}>
          {searching ? "…" : "Search"}
        </button>
      </div>
      {searchError && <ErrorBox msg={searchError} onRetry={() => doSearch()} />}
      {results &&
        (results.length === 0 ? (
          <p style={{ color: T.muted, fontSize: 13 }}>No results for “{query}”.</p>
        ) : (
          results.map((item) => {
            const key = searchType === "tv" ? `tv-${item.id}` : `mv-${item.id}`;
            return (
              <div key={key} style={{ display: "flex", gap: 14, alignItems: "center", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <Poster item={item} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>{item.name}</div>
                  <div style={{ color: T.muted, fontSize: 11, marginTop: 3 }}>
                    {searchType === "tv" ? (
                      <>
                        {item.network} · {item.premiered} · <span style={{ color: statusColor(item.status) }}>{statusIt(item.status)}</span>
                      </>
                    ) : (
                      <>
                        {item.genre} · {item.year}
                      </>
                    )}
                  </div>
                </div>
                {library[key] ? (
                  <span style={{ color: T.accentDim, fontSize: 11 }}>✓ added</span>
                ) : (
                  <button onClick={() => (searchType === "tv" ? addShow(item) : addMovie(item))} style={{ ...btnAccent, padding: "8px 14px" }}>
                    +
                  </button>
                )}
              </div>
            );
          })
        ))}
    </div>
  );

  const renderMovieDetail = (key, { movie, watched }) => (
    <div style={{ padding: "24px 16px" }}>
      <button onClick={() => setView("library")} style={btnGhost}>← back</button>
      <div style={{ display: "flex", gap: 16, margin: "18px 0" }}>
        <Poster item={movie} size={80} />
        <div style={{ flex: 1 }}>
          <h1 style={{ ...h1, fontSize: 22 }}>{movie.name}</h1>
          <div style={{ margin: "8px 0" }}>
            <Chip color={T.accentDim}>MOVIE</Chip>
          </div>
          <div style={{ color: T.muted, fontSize: 11, lineHeight: 1.6 }}>
            {movie.genre} · {movie.year}
          </div>
        </div>
      </div>
      <button onClick={() => toggleMovie(key)} style={{ ...(watched ? btnOutline : btnAccent), width: "100%", padding: "13px" }}>
        {watched ? "Mark as unwatched" : "✓ Mark as watched"}
      </button>
      <button onClick={() => removeEntry(key)} style={{ ...btnGhost, color: T.ended, marginTop: 20 }}>
        Remove from library
      </button>
    </div>
  );

  const renderShowDetail = (key, entry) => {
    const { show, watched } = entry;
    const total = episodes.length;
    const seen = episodes.filter((e) => watched[e.id]).length;
    const pct = total ? Math.round((seen / total) * 100) : 0;
    const nextEp = episodes.find((e) => !watched[e.id]);
    const seasons = [...new Set(episodes.map((e) => e.season))];

    return (
      <div style={{ padding: "24px 16px" }}>
        <button onClick={() => setView("library")} style={btnGhost}>← back</button>
        <div style={{ display: "flex", gap: 16, margin: "18px 0" }}>
          <Poster item={show} size={80} />
          <div style={{ flex: 1 }}>
            <h1 style={{ ...h1, fontSize: 22 }}>{show.name}</h1>
            <div style={{ margin: "8px 0" }}>
              <Badge status={show.status} />
            </div>
            <div style={{ color: T.muted, fontSize: 11, lineHeight: 1.6 }}>
              {show.network} · {show.premiered}
              {show.ended ? `–${show.ended}` : "–"}
              <br />
              {(show.genres || []).join(" / ")}
            </div>
          </div>
        </div>

        {show.status === "Ended" && (
          <div style={{ background: T.surface, borderLeft: `3px solid ${T.ended}`, borderRadius: 6, padding: "10px 14px", fontSize: 12, color: T.muted, marginBottom: 16 }}>
            Show ended{show.ended ? ` in ${show.ended}` : ""} — you can binge it with no waiting.
          </div>
        )}

        {epLoading ? (
          <p style={{ color: T.muted, fontSize: 13 }}>Loading episodes…</p>
        ) : epError ? (
          <ErrorBox msg={epError} onRetry={() => loadEpisodes(show.id)} />
        ) : total === 0 ? (
          <p style={{ color: T.muted, fontSize: 13 }}>No episodes available for this show.</p>
        ) : (
          <>
            <Progress pct={pct} />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.muted, margin: "6px 0 18px" }}>
              <span>
                <span style={{ color: T.accent }}>{seen}</span>/{total} episodes · {pct}%
              </span>
              {nextEp && (
                <span>
                  next: <span style={{ color: T.text }}>S{nextEp.season}E{nextEp.number}</span>
                </span>
              )}
            </div>

            {nextEp && (
              <button onClick={() => toggleEp(nextEp.id)} style={{ ...btnAccent, width: "100%", marginBottom: 20, padding: "13px" }}>
                ✓ Watched S{nextEp.season}E{nextEp.number} — {nextEp.name}
              </button>
            )}

            {seasons.map((s) => {
              const eps = episodes.filter((e) => e.season === s);
              const sSeen = eps.filter((e) => watched[e.id]).length;
              const allSeen = sSeen === eps.length;
              const open = openSeason === s;
              return (
                <div key={s} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 10, overflow: "hidden" }}>
                  <div onClick={() => setOpenSeason(open ? null : s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", cursor: "pointer" }}>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14 }}>Season {s}</span>
                    <span style={{ fontSize: 11, color: allSeen ? T.accent : T.muted }}>
                      {sSeen}/{eps.length} {open ? "▲" : "▼"}
                    </span>
                  </div>
                  {open && (
                    <div style={{ borderTop: `1px solid ${T.border}` }}>
                      <div style={{ padding: "8px 14px" }}>
                        <button onClick={() => markSeason(s, !allSeen)} style={{ ...btnGhost, fontSize: 11 }}>
                          {allSeen ? "Mark season unwatched" : "Mark whole season watched"}
                        </button>
                      </div>
                      {eps.map((e) => (
                        <div key={e.id} onClick={() => toggleEp(e.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 14px", borderTop: `1px solid ${T.border}`, cursor: "pointer", opacity: watched[e.id] ? 0.55 : 1 }}>
                          <span style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `1.5px solid ${watched[e.id] ? T.accent : T.muted}`, background: watched[e.id] ? T.accent : "transparent", color: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                            {watched[e.id] ? "✓" : ""}
                          </span>
                          <span style={{ fontSize: 12, color: T.muted, width: 42, flexShrink: 0 }}>
                            E{String(e.number).padStart(2, "0")}
                          </span>
                          <span style={{ fontSize: 12, flex: 1, textDecoration: watched[e.id] ? "line-through" : "none" }}>
                            {e.name}
                            {e.airdate && <span style={{ color: T.muted }}> · {e.airdate}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        <button onClick={() => removeEntry(key)} style={{ ...btnGhost, color: T.ended, marginTop: 16 }}>
          Remove from library
        </button>
      </div>
    );
  };

  const renderDetail = () => {
    const entry = library[current];
    if (!entry) return null;
    return entry.type === "movie" ? renderMovieDetail(current, entry) : renderShowDetail(current, entry);
  };

  return (
    <div style={page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${T.bg}; }
        button:active { transform: scale(.97); }
        button:disabled { opacity: .6; }
      `}</style>

      {view === "library" && renderLibrary()}
      {view === "search" && renderSearch()}
      {view === "detail" && renderDetail()}

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", display: "flex", background: T.surface, borderTop: `1px solid ${T.border}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[
          { id: "library", label: "Library" },
          { id: "search", label: "Search" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            style={{ flex: 1, padding: "14px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: 1, color: view === t.id || (view === "detail" && t.id === "library") ? T.accent : T.muted }}
          >
            {t.label.toUpperCase()}
          </button>
        ))}
      </nav>
    </div>
  );
}

const btnAccent = { background: "#c8f042", color: "#0c0e09", border: "none", borderRadius: 8, padding: "12px 18px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnOutline = { background: "transparent", color: "#c8f042", border: "1px solid #c8f042", borderRadius: 8, padding: "12px 18px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, cursor: "pointer" };
const btnGhost = { background: "none", border: "none", color: "#8a9180", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, cursor: "pointer", padding: 0 };
const cardStyle = { display: "flex", gap: 14, background: "#151810", border: "1px solid #262b1c", borderRadius: 10, padding: 12, marginBottom: 12, cursor: "pointer" };
const cardTitle = { fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.2 };
