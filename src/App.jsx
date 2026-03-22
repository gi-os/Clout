import { useState, useEffect, useCallback } from "react";
import { api, getToken, setToken, clearToken, setAuthErrorHandler, mapUser, mapTxn } from "./api.js";

// ─── Styles ──────────────────────────────────────────────────────────────────
const G = {
  bg:      "#0a0a0a",
  surface: "#141414",
  card:    "#1c1c1c",
  border:  "#2a2a2a",
  gold:    "#f5c542",
  goldDim: "#a38420",
  red:     "#ff4d4d",
  green:   "#4dff91",
  text:    "#f0f0f0",
  muted:   "#666",
  font:    "'DM Mono', 'Courier New', monospace",
  radius:  "12px",
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = 18 }) {
  const color = score > 0 ? G.green : score < 0 ? G.red : G.muted;
  return (
    <span style={{ fontFamily: G.font, fontSize: size, fontWeight: 700, color, letterSpacing: "-1px" }}>
      {score > 0 ? "+" : ""}{score}
    </span>
  );
}

function Avatar({ user, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: G.card, border: `2px solid ${G.border}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.5, flexShrink: 0,
    }}>
      {user.avatar}
    </div>
  );
}

function TxnCard({ txn, users }) {
  const from = users.find(u => u.id === txn.fromId);
  const to   = users.find(u => u.id === txn.toId);
  const pos  = txn.points > 0;
  const ago  = (() => {
    const s = Math.floor((Date.now() - txn.ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  })();

  return (
    <div style={{
      background: G.card, border: `1px solid ${G.border}`,
      borderLeft: `3px solid ${pos ? G.green : G.red}`,
      borderRadius: G.radius, padding: "14px 16px", marginBottom: 10,
      animation: "fadeSlide 0.3s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Avatar user={from || { avatar: "?" }} size={28} />
        <span style={{ color: G.gold, fontFamily: G.font, fontSize: 13, fontWeight: 600 }}>{from?.displayName}</span>
        <span style={{ color: G.muted, fontSize: 12 }}>{"\u2192"}</span>
        <Avatar user={to || { avatar: "?" }} size={28} />
        <span style={{ color: G.text, fontFamily: G.font, fontSize: 13, fontWeight: 600 }}>{to?.displayName}</span>
        <ScoreBadge score={txn.points} size={15} />
        <span style={{ color: G.muted, fontSize: 11, marginLeft: "auto" }}>{ago}</span>
      </div>
      {txn.reason && (
        <div style={{ color: G.muted, fontSize: 13, paddingLeft: 4, fontStyle: "italic" }}>
          &ldquo;{txn.reason}&rdquo;
        </div>
      )}
    </div>
  );
}

function Leaderboard({ users }) {
  const sorted = [...users].sort((a, b) => b.score - a.score);
  const medals = ["\u{1F947}","\u{1F948}","\u{1F949}"];
  return (
    <div>
      {sorted.map((u, i) => (
        <div key={u.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          background: i === 0 ? `${G.gold}18` : G.card,
          border: `1px solid ${i === 0 ? G.goldDim : G.border}`,
          borderRadius: G.radius, padding: "12px 14px", marginBottom: 8,
          transition: "all 0.2s",
        }}>
          <span style={{ fontSize: 20, width: 28 }}>{medals[i] || `#${i+1}`}</span>
          <Avatar user={u} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: G.font, fontSize: 14, fontWeight: 600, color: G.text }}>{u.displayName}</div>
            {u.type === "proxy" && <div style={{ fontSize: 10, color: G.muted }}>proxy acct</div>}
          </div>
          <ScoreBadge score={u.score} size={22} />
        </div>
      ))}
    </div>
  );
}

function GivePointsModal({ currentUser, users, onSubmit, onClose }) {
  const [toId, setToId]       = useState("");
  const [pts, setPts]         = useState(1);
  const [reason, setReason]   = useState("");
  const [err, setErr]         = useState("");
  const [budget, setBudget]   = useState(null);
  const [loading, setLoading] = useState(false);

  const targets = users.filter(u =>
    u.id !== currentUser.id &&
    (u.type === "user" || (u.type === "proxy" && u.controlledBy?.includes(currentUser.id)))
  );

  useEffect(() => {
    if (!toId) { setBudget(null); return; }
    api.get(`/budget/${toId}`).then(setBudget).catch(() => setBudget(null));
  }, [toId]);

  const handle = async () => {
    if (!toId) return setErr("Pick someone.");
    const p = parseInt(pts);
    if (!p || p === 0) return setErr("Points can't be zero.");
    if (budget && Math.abs(p) > budget.remaining) {
      return setErr(`You only have ${budget.remaining} points left for this person today.`);
    }
    setLoading(true);
    setErr("");
    try {
      await onSubmit({ toId: parseInt(toId), points: p, reason });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", background: G.surface, border: `1px solid ${G.border}`,
    borderRadius: 8, padding: "10px 12px", color: G.text,
    fontFamily: G.font, fontSize: 14, boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000a", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: G.surface, borderRadius: "20px 20px 0 0",
        border: `1px solid ${G.border}`, padding: 24, width: "100%",
        maxWidth: 480, animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: G.font, fontSize: 18, fontWeight: 700, color: G.gold, marginBottom: 20 }}>
          {"\u26A1"} GIVE POINTS
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>TO</label>
          <select value={toId} onChange={e=>setToId(e.target.value)} style={{ ...inputStyle, appearance: "none" }}>
            <option value="">{"\u2014"} select {"\u2014"}</option>
            {targets.map(u => <option key={u.id} value={u.id}>{u.displayName}{u.type==="proxy"?" (proxy)":""}</option>)}
          </select>
          {budget && (
            <div style={{ color: budget.remaining > 0 ? G.muted : G.red, fontSize: 11, marginTop: 4 }}>
              {budget.remaining}/10 points remaining today
            </div>
          )}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>POINTS (negative = bad)</label>
          <input type="number" value={pts} onChange={e=>setPts(e.target.value)}
            min={budget ? -budget.remaining : -10} max={budget ? budget.remaining : 10}
            style={inputStyle} placeholder="e.g. +5 or -3" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>REASON (optional)</label>
          <input value={reason} onChange={e=>setReason(e.target.value)}
            style={inputStyle} placeholder="what did they do?" maxLength={120} />
        </div>

        {err && <div style={{ color: G.red, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", background: "transparent",
            border: `1px solid ${G.border}`, borderRadius: 10, color: G.muted,
            fontFamily: G.font, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handle} disabled={loading} style={{
            flex: 2, padding: "12px", background: loading ? G.goldDim : G.gold,
            border: "none", borderRadius: 10, color: "#000",
            fontFamily: G.font, fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer",
          }}>{loading ? "Sending..." : "Send \u26A1"}</button>
        </div>
      </div>
    </div>
  );
}

function AddProxyModal({ onSubmit, onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername]       = useState("");
  const [avatar, setAvatar]           = useState("\u{1F431}");
  const [err, setErr]                 = useState("");
  const [loading, setLoading]         = useState(false);
  const emojis = ["\u{1F431}","\u{1F436}","\u{1F438}","\u{1F916}","\u{1F47E}","\u{1F338}","\u{1F3B8}","\u{1F9F8}","\u{1F98A}","\u{1F43C}","\u{1F300}","\u{1F480}"];

  const inputStyle = {
    width: "100%", background: G.surface, border: `1px solid ${G.border}`,
    borderRadius: 8, padding: "10px 12px", color: G.text,
    fontFamily: G.font, fontSize: 14, boxSizing: "border-box", outline: "none",
  };

  const handle = async () => {
    if (!displayName.trim() || !username.trim()) return setErr("Fill in all fields.");
    setLoading(true);
    setErr("");
    try {
      await onSubmit({ username: username.toLowerCase().trim(), displayName: displayName.trim(), avatar });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#000a", zIndex: 100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: G.surface, borderRadius: "20px 20px 0 0",
        border: `1px solid ${G.border}`, padding: 24, width: "100%",
        maxWidth: 480, animation: "slideUp 0.25s ease",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: G.font, fontSize: 18, fontWeight: 700, color: G.gold, marginBottom: 20 }}>
          {"\u{1F3AD}"} ADD PROXY ACCOUNT
        </div>
        <div style={{ color: G.muted, fontSize: 12, marginBottom: 16 }}>
          For pets, NPCs, or people who don't have an account. You control this account.
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>AVATAR</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {emojis.map(e => (
              <button key={e} onClick={()=>setAvatar(e)} style={{
                fontSize: 22, background: avatar===e ? G.gold+"33" : G.card,
                border: `1px solid ${avatar===e ? G.gold : G.border}`,
                borderRadius: 8, padding: "6px 10px", cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>DISPLAY NAME</label>
          <input value={displayName} onChange={e=>setDisplayName(e.target.value)} style={inputStyle} placeholder="Basil the Cat" />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>USERNAME</label>
          <input value={username} onChange={e=>setUsername(e.target.value)} style={inputStyle} placeholder="basil" />
        </div>

        {err && <div style={{ color: G.red, fontSize: 12, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", background: "transparent",
            border: `1px solid ${G.border}`, borderRadius: 10, color: G.muted,
            fontFamily: G.font, fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handle} disabled={loading} style={{
            flex: 2, padding: "12px", background: loading ? G.goldDim : G.gold,
            border: "none", borderRadius: 10, color: "#000",
            fontFamily: G.font, fontSize: 14, fontWeight: 700, cursor: loading ? "wait" : "pointer",
          }}>{loading ? "Creating..." : "Create"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Auth Screens ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin, onSwitchToRegister }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState("");
  const [loading, setLoading]   = useState(false);

  const handle = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await api.post("/login", { username, password });
      setToken(data.token);
      onLogin(mapUser(data.user));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", background: "#1c1c1c", border: `1px solid ${G.border}`,
    borderRadius: 10, padding: "14px 16px", color: G.text,
    fontFamily: G.font, fontSize: 15, boxSizing: "border-box",
    outline: "none", marginBottom: 12,
  };

  return (
    <div style={{
      minHeight: "100vh", background: G.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: G.font,
    }}>
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u26A1"}</div>
        <div style={{ fontSize: 36, fontWeight: 900, color: G.gold, letterSpacing: "-2px" }}>CLOUT</div>
        <div style={{ fontSize: 12, color: G.muted, letterSpacing: "3px", marginTop: 4 }}>FRIEND SCORE SYSTEM</div>
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <input value={username} onChange={e=>setUsername(e.target.value)}
          style={inputStyle} placeholder="username" autoCapitalize="none" />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
          style={inputStyle} placeholder="password"
          onKeyDown={e=>e.key==="Enter"&&handle()} />
        {err && <div style={{ color: G.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button onClick={handle} disabled={loading} style={{
          width: "100%", padding: "14px", background: loading ? G.goldDim : G.gold,
          border: "none", borderRadius: 10, color: "#000",
          fontFamily: G.font, fontSize: 16, fontWeight: 700, cursor: loading ? "wait" : "pointer",
        }}>{loading ? "LOGGING IN..." : "LOG IN"}</button>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button onClick={onSwitchToRegister} style={{
            background: "transparent", border: `1px solid ${G.border}`,
            borderRadius: 10, padding: "10px 24px", color: G.muted,
            fontFamily: G.font, fontSize: 13, cursor: "pointer",
          }}>New here? Register</button>
        </div>
      </div>
    </div>
  );
}

function RegisterScreen({ onRegister, onSwitchToLogin }) {
  const [username, setUsername]     = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword]    = useState("");
  const [avatar, setAvatar]         = useState("\u{1F464}");
  const [catName, setCatName]       = useState("");
  const [err, setErr]               = useState("");
  const [loading, setLoading]       = useState(false);

  const emojis = ["\u{1F464}","\u{1F431}","\u{1F436}","\u{1F438}","\u{1F916}","\u{1F47E}","\u{1F338}","\u{1F3B8}","\u{1F9F8}","\u{1F98A}","\u{1F43C}","\u{1F300}"];

  const handle = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await api.post("/register", { username, displayName, password, avatar, catName });
      setToken(data.token);
      onRegister(mapUser(data.user));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%", background: "#1c1c1c", border: `1px solid ${G.border}`,
    borderRadius: 10, padding: "14px 16px", color: G.text,
    fontFamily: G.font, fontSize: 15, boxSizing: "border-box",
    outline: "none", marginBottom: 12,
  };

  return (
    <div style={{
      minHeight: "100vh", background: G.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, fontFamily: G.font,
    }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 4 }}>{"\u26A1"}</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: G.gold, letterSpacing: "-2px" }}>JOIN CLOUT</div>
        <div style={{ fontSize: 11, color: G.muted, letterSpacing: "2px", marginTop: 4 }}>PROVE YOU'RE A REAL ONE</div>
      </div>

      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: G.muted, fontSize: 11, fontFamily: G.font, display: "block", marginBottom: 6 }}>AVATAR</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {emojis.map(e => (
              <button key={e} onClick={()=>setAvatar(e)} style={{
                fontSize: 20, background: avatar===e ? G.gold+"33" : G.card,
                border: `1px solid ${avatar===e ? G.gold : G.border}`,
                borderRadius: 8, padding: "5px 9px", cursor: "pointer",
              }}>{e}</button>
            ))}
          </div>
        </div>

        <input value={displayName} onChange={e=>setDisplayName(e.target.value)}
          style={inputStyle} placeholder="display name (e.g. Giovanni)" />
        <input value={username} onChange={e=>setUsername(e.target.value)}
          style={inputStyle} placeholder="username (lowercase)" autoCapitalize="none" />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
          style={inputStyle} placeholder="password" />

        <div style={{
          background: G.card, border: `1px solid ${G.goldDim}`,
          borderRadius: 10, padding: "14px 16px", marginBottom: 12,
        }}>
          <label style={{ color: G.gold, fontSize: 12, fontFamily: G.font, display: "block", marginBottom: 8 }}>
            {"\u{1F431}"} What is my cat's name?
          </label>
          <input value={catName} onChange={e=>setCatName(e.target.value)}
            style={{ ...inputStyle, marginBottom: 0, background: G.surface }}
            placeholder="you gotta know this to join"
            onKeyDown={e=>e.key==="Enter"&&handle()} />
        </div>

        {err && <div style={{ color: G.red, fontSize: 12, marginBottom: 10 }}>{err}</div>}
        <button onClick={handle} disabled={loading} style={{
          width: "100%", padding: "14px", background: loading ? G.goldDim : G.gold,
          border: "none", borderRadius: 10, color: "#000",
          fontFamily: G.font, fontSize: 16, fontWeight: 700, cursor: loading ? "wait" : "pointer",
        }}>{loading ? "CREATING..." : "CREATE ACCOUNT"}</button>

        <div style={{ marginTop: 24, textAlign: "center" }}>
          <button onClick={onSwitchToLogin} style={{
            background: "transparent", border: `1px solid ${G.border}`,
            borderRadius: 10, padding: "10px 24px", color: G.muted,
            fontFamily: G.font, fontSize: 13, cursor: "pointer",
          }}>Already have an account? Log in</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [users, setUsers]             = useState([]);
  const [txns, setTxns]               = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab]                 = useState("feed");
  const [showGive, setShowGive]       = useState(false);
  const [showProxy, setShowProxy]     = useState(false);
  const [authScreen, setAuthScreen]   = useState("login"); // "login" | "register"
  const [booting, setBooting]         = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setCurrentUser(null);
    setUsers([]);
    setTxns([]);
  }, []);

  // Set up auth error handler
  useEffect(() => { setAuthErrorHandler(logout); }, [logout]);

  // Boot: check existing token
  useEffect(() => {
    const token = getToken();
    if (!token) { setBooting(false); return; }
    api.get("/me")
      .then(data => setCurrentUser(mapUser(data.user)))
      .catch(() => clearToken())
      .finally(() => setBooting(false));
  }, []);

  // Load initial data when logged in
  useEffect(() => {
    if (!currentUser) return;
    Promise.all([api.get("/users"), api.get("/txns")])
      .then(([u, t]) => {
        setUsers(u.users.map(mapUser));
        setTxns(t.txns.map(mapTxn));
      })
      .catch(() => {});
  }, [currentUser]);

  // Polling sync
  useEffect(() => {
    if (!currentUser) return;
    let lastSync = Date.now();
    const interval = setInterval(async () => {
      try {
        const data = await api.get(`/sync?since=${lastSync}`);
        lastSync = data.serverTime;
        if (data.users.length) {
          const mapped = data.users.map(mapUser);
          setUsers(prev => {
            const m = new Map(prev.map(u => [u.id, u]));
            mapped.forEach(u => m.set(u.id, u));
            return [...m.values()];
          });
        }
        if (data.txns.length) {
          const mapped = data.txns.map(mapTxn);
          setTxns(prev => {
            const ids = new Set(prev.map(t => t.id));
            const fresh = mapped.filter(t => !ids.has(t.id));
            return [...fresh, ...prev];
          });
        }
      } catch { /* ignore sync errors */ }
    }, 7000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Keep currentUser in sync with users state
  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated && updated.score !== currentUser.score) {
        setCurrentUser(updated);
      }
    }
  }, [users, currentUser]);

  const handleGivePoints = async ({ toId, points, reason }) => {
    const data = await api.post("/txns", { toId, points, reason });
    const newTxn = mapTxn(data.txn);
    const updatedTarget = mapUser(data.updatedUser);
    setTxns(prev => [newTxn, ...prev]);
    setUsers(prev => prev.map(u => u.id === updatedTarget.id ? updatedTarget : u));
  };

  const handleAddProxy = async ({ username, displayName, avatar }) => {
    const data = await api.post("/users/proxy", { username, displayName, avatar });
    setUsers(prev => [...prev, mapUser(data.user)]);
  };

  const handleAuth = (user) => {
    setCurrentUser(user);
  };

  if (booting) {
    return (
      <div style={{
        minHeight: "100vh", background: G.bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: G.font, color: G.muted,
      }}>
        {"\u26A1"}
      </div>
    );
  }

  if (!currentUser) {
    return authScreen === "register"
      ? <RegisterScreen onRegister={handleAuth} onSwitchToLogin={() => setAuthScreen("login")} />
      : <LoginScreen onLogin={handleAuth} onSwitchToRegister={() => setAuthScreen("register")} />;
  }

  const myTxns = txns.filter(t => t.toId === currentUser.id || t.fromId === currentUser.id);

  const tabStyle = (active) => ({
    flex: 1, padding: "12px 0", background: "transparent",
    border: "none", borderBottom: `2px solid ${active ? G.gold : "transparent"}`,
    color: active ? G.gold : G.muted, fontFamily: G.font, fontSize: 13,
    fontWeight: active ? 700 : 400, cursor: "pointer", transition: "all 0.2s",
    letterSpacing: "1px",
  });

  return (
    <div style={{ background: G.bg, minHeight: "100vh", maxWidth: 480, margin: "0 auto", fontFamily: G.font }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        background: G.bg, borderBottom: `1px solid ${G.border}`,
        padding: "14px 20px", display: "flex", alignItems: "center",
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: G.gold, letterSpacing: "-1px" }}>{"\u26A1"}CLOUT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Avatar user={currentUser} size={32} />
          <div>
            <div style={{ fontSize: 13, color: G.text, fontWeight: 600 }}>{currentUser.displayName}</div>
            <ScoreBadge score={currentUser.score} size={12} />
          </div>
          <button onClick={logout} style={{
            background: "transparent", border: `1px solid ${G.border}`,
            borderRadius: 6, padding: "4px 8px", color: G.muted, fontSize: 11,
            fontFamily: G.font, cursor: "pointer", marginLeft: 4,
          }}>out</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${G.border}` }}>
        {[["feed","FEED"],["board","RANKS"],["me","PROFILE"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={tabStyle(tab===t)}>{l}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "16px 16px 100px" }}>
        {tab === "feed" && (
          <>
            <div style={{ color: G.muted, fontSize: 11, letterSpacing: "2px", marginBottom: 12 }}>RECENT ACTIVITY</div>
            {txns.length === 0
              ? <div style={{ color: G.muted, textAlign: "center", marginTop: 60, fontSize: 14 }}>No activity yet.<br/>Give someone some points! {"\u26A1"}</div>
              : txns.map(t => <TxnCard key={t.id} txn={t} users={users} />)
            }
          </>
        )}

        {tab === "board" && (
          <>
            <div style={{ color: G.muted, fontSize: 11, letterSpacing: "2px", marginBottom: 12 }}>LEADERBOARD</div>
            <Leaderboard users={users} />
          </>
        )}

        {tab === "me" && (
          <>
            <div style={{
              background: G.card, border: `1px solid ${G.border}`,
              borderRadius: G.radius, padding: 20, marginBottom: 16, textAlign: "center",
            }}>
              <Avatar user={currentUser} size={64} />
              <div style={{ marginTop: 10, fontSize: 20, fontWeight: 700, color: G.text }}>{currentUser.displayName}</div>
              <div style={{ color: G.muted, fontSize: 12, marginBottom: 8 }}>@{currentUser.username}</div>
              <ScoreBadge score={currentUser.score} size={32} />
              <div style={{ color: G.muted, fontSize: 11, marginTop: 4 }}>total clout score</div>
            </div>

            <div style={{ color: G.muted, fontSize: 11, letterSpacing: "2px", marginBottom: 12 }}>YOUR HISTORY</div>
            {myTxns.length === 0
              ? <div style={{ color: G.muted, fontSize: 14, textAlign: "center", marginTop: 20 }}>Nothing yet.</div>
              : myTxns.map(t => <TxnCard key={t.id} txn={t} users={users} />)
            }

            <button onClick={() => setShowProxy(true)} style={{
              width: "100%", marginTop: 16, padding: "12px",
              background: "transparent", border: `1px dashed ${G.border}`,
              borderRadius: 10, color: G.muted, fontFamily: G.font,
              fontSize: 13, cursor: "pointer",
            }}>
              {"\u{1F3AD}"} Add Proxy Account (pet, NPC, etc.)
            </button>
          </>
        )}
      </div>

      {/* FAB */}
      <button onClick={() => setShowGive(true)} style={{
        position: "fixed", bottom: 28, right: "max(20px, calc(50% - 220px))",
        width: 58, height: 58, borderRadius: "50%",
        background: G.gold, border: "none",
        fontSize: 26, cursor: "pointer", zIndex: 20,
        boxShadow: `0 4px 20px ${G.gold}66`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{"\u26A1"}</button>

      {/* Modals */}
      {showGive && (
        <GivePointsModal
          currentUser={currentUser}
          users={users}
          onSubmit={handleGivePoints}
          onClose={() => setShowGive(false)}
        />
      )}
      {showProxy && (
        <AddProxyModal
          onSubmit={handleAddProxy}
          onClose={() => setShowProxy(false)}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        select option { background: ${G.card}; }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        input::placeholder, textarea::placeholder { color: ${G.muted}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${G.border}; border-radius: 2px; }
      `}</style>
    </div>
  );
}
