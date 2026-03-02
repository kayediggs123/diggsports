import { useState, useRef, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, get } from "firebase/database";

// ── Firebase Config ──
const firebaseConfig = {
  apiKey: "AIzaSyCnLXyyMIPEjfBo8e0H2g1Z2K5FB8mKj6Q",
  authDomain: "diggsports.firebaseapp.com",
  databaseURL: "https://diggsports-default-rtdb.firebaseio.com",
  projectId: "diggsports",
  storageBucket: "diggsports.firebasestorage.app",
  messagingSenderId: "1081820686189",
  appId: "1:1081820686189:web:669e7b0422ae07e80c1c64",
  measurementId: "G-PMHER416F2",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ── Constants ──
const REGIONS = ["East", "West", "South", "Midwest"];
const REGION_COLORS = { East: "#3A86FF", West: "#E63946", South: "#2A9D8F", Midwest: "#F4A261" };
const SEED_COLORS = {
  1: "#C41E3A", 2: "#1D428A", 3: "#00843D", 4: "#FF8200",
  5: "#4B2E83", 6: "#CC0033", 7: "#003087", 8: "#8C1D40",
  9: "#FFC72C", 10: "#006747", 11: "#B3A369", 12: "#BA0C2F", "13-16": "#555",
};
const COLORS = [
  "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
  "#264653", "#6A0572", "#D62828", "#023E8A", "#0077B6",
  "#8338EC", "#FF006E", "#3A86FF", "#FB5607", "#FFBE0B",
];
const SAVE_KEY = "mm-auction-draft-save";

const buildDefaultSeedNames = () => {
  const n = {};
  REGIONS.forEach((r) => { for (let s = 1; s <= 12; s++) n[`${r}-${s}`] = ""; n[`${r}-13-16`] = ""; });
  return n;
};

const buildItems = (seedNames) => {
  const list = [];
  REGIONS.forEach((region) => {
    for (let s = 1; s <= 12; s++) {
      const name = seedNames[`${region}-${s}`]?.trim();
      list.push({ id: `${region}-${s}`, seed: s, region, label: name ? `#${s} ${name}` : `#${s} Seed`, shortLabel: name || `#${s}`, type: "single" });
    }
    const gn = seedNames[`${region}-13-16`]?.trim();
    list.push({ id: `${region}-13-16`, seed: "13-16", region, label: gn ? `13-16 ${gn}` : "13-16 Seeds", shortLabel: gn || "13-16", type: "group" });
  });
  return list;
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── localStorage helpers ──
const saveDraftLocal = (state) => {
  try {
    const s = { ...state, drafters: state.drafters.map((d) => ({ ...d, budget: d.budget === Infinity ? null : d.budget })) };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch (e) {}
};
const loadDraftLocal = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null;
    const d = JSON.parse(raw);
    d.drafters = d.drafters.map((x) => ({ ...x, budget: x.budget === null ? Infinity : x.budget }));
    return d;
  } catch (e) { return null; }
};
const clearSaveLocal = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

// ── Firebase helpers ──
const serializeState = (state) => ({
  ...state, drafters: state.drafters.map((d) => ({ ...d, budget: d.budget === Infinity ? -1 : d.budget })),
});
const deserializeState = (data) => {
  if (!data) return null;
  return { ...data, drafters: (data.drafters || []).map((d) => ({ ...d, budget: d.budget === -1 ? Infinity : d.budget })), log: data.log || [], availableItems: data.availableItems || [], draftOrder: data.draftOrder || [] };
};
const writeRoom = async (roomCode, state) => {
  try { await set(ref(db, `rooms/${roomCode}`), serializeState(state)); } catch (e) { console.error("Firebase write:", e); }
};

// ══════════════════════════════════════════
// ── MAIN COMPONENT ──
// ══════════════════════════════════════════
export default function MarchMadnessAuction() {
  const [phase, setPhase] = useState("setup");
  const [drafterNames, setDrafterNames] = useState(["", "", ""]);
  const [seedNames, setSeedNames] = useState(buildDefaultSeedNames());
  const [drafters, setDrafters] = useState([]);
  const [availableItems, setAvailableItems] = useState([]);
  const [draftOrder, setDraftOrder] = useState([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [currentItem, setCurrentItem] = useState(null);
  const [selectedWinner, setSelectedWinner] = useState(null);
  const [winningBid, setWinningBid] = useState("");
  const [log, setLog] = useState([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [budgetMode, setBudgetMode] = useState("unlimited");
  const [budgetAmount, setBudgetAmount] = useState(200);
  const [setupSeedTab, setSetupSeedTab] = useState("East");
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [copied, setCopied] = useState(false);
  // Room state
  const [role, setRole] = useState(null); // "host" | "viewer" | null
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const logRef = useRef(null);
  const listenerRef = useRef(null);

  useEffect(() => {
    const saved = loadDraftLocal();
    if (saved && (saved.phase === "draft" || saved.phase === "done")) setHasSavedDraft(true);
    return () => { if (listenerRef.current) off(listenerRef.current); };
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const hasBudget = budgetMode === "capped";
  const isViewer = role === "viewer";
  const isHost = role === "host";
  const isLive = isHost || isViewer;

  // ── Apply remote state (viewer) ──
  const applyRemoteState = useCallback((data) => {
    const state = deserializeState(data);
    if (!state) return;
    setPhase(state.phase); setDrafters(state.drafters); setAvailableItems(state.availableItems);
    setDraftOrder(state.draftOrder); setDraftIndex(state.draftIndex); setCurrentItem(state.currentItem);
    setLog(state.log); setBudgetMode(state.budgetMode || "unlimited"); setBudgetAmount(state.budgetAmount || 200);
    if (state.phase === "done") setShowConfetti(true);
  }, []);

  // ── Subscribe to room ──
  const subscribeToRoom = useCallback((code) => {
    if (listenerRef.current) off(listenerRef.current);
    const roomRef = ref(db, `rooms/${code}`);
    listenerRef.current = roomRef;
    onValue(roomRef, (snapshot) => { const data = snapshot.val(); if (data) applyRemoteState(data); });
  }, [applyRemoteState]);

  // ── Join room ──
  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a valid room code"); return; }
    setJoinError("");
    try {
      const snapshot = await get(ref(db, `rooms/${code}`));
      if (!snapshot.exists()) { setJoinError("Room not found. Check the code."); return; }
      setRoomCode(code); setRole("viewer");
      applyRemoteState(snapshot.val());
      setPhase(snapshot.val().phase || "draft");
      subscribeToRoom(code);
    } catch (e) { setJoinError("Connection error. Try again."); }
  };

  // ── Save helper ──
  const saveState = (snap) => {
    saveDraftLocal(snap);
    if (isHost && roomCode) writeRoom(roomCode, snap);
  };

  // ── Start draft ──
  const startDraft = () => {
    const names = drafterNames.filter((n) => n.trim());
    if (names.length < 2) return;
    const d = names.map((name, i) => ({ name, budget: hasBudget ? budgetAmount : Infinity, items: [], color: COLORS[i % COLORS.length] }));
    const builtItems = buildItems(seedNames);
    const shuffled = shuffle(builtItems);
    const initLog = [
      hasBudget ? `🏀 Draft started! ${names.length} drafters · $${budgetAmount} budget · ${builtItems.length} items` : `🏀 Draft started! ${names.length} drafters · No bid limits · ${builtItems.length} items`,
      `📢 [${shuffled[0].region}] ${shuffled[0].label} is up! (1 of ${shuffled.length})`,
    ];
    setDrafters(d); setAvailableItems(builtItems); setDraftOrder(shuffled); setDraftIndex(0);
    setCurrentItem(shuffled[0]); setPhase("draft"); setLog(initLog);
    const snap = { phase: "draft", drafters: d, availableItems: builtItems, draftOrder: shuffled, draftIndex: 0, currentItem: shuffled[0], log: initLog, budgetMode, budgetAmount };
    saveState(snap);
  };

  const startAsHost = () => { const code = generateRoomCode(); setRoomCode(code); setRole("host"); };
  const startSolo = () => { setRole(null); startDraft(); };
  const addDrafter = () => { if (drafterNames.length < 15) setDrafterNames([...drafterNames, ""]); };
  const removeDrafter = (idx) => { if (drafterNames.length > 2) setDrafterNames(drafterNames.filter((_, i) => i !== idx)); };

  // ── Advance to next item ──
  const advanceToNext = (nextIndex, order, avail, logArr, dftrs) => {
    if (nextIndex >= order.length) {
      setPhase("done"); setShowConfetti(true); setCurrentItem(null);
      const doneLog = [...logArr, "🏆 ALL ITEMS DRAFTED! The auction is complete!"];
      setLog(doneLog);
      saveState({ phase: "done", drafters: dftrs, availableItems: avail, draftOrder: order, draftIndex: nextIndex, currentItem: null, log: doneLog, budgetMode, budgetAmount });
      return;
    }
    const next = order[nextIndex];
    setCurrentItem(next); setDraftIndex(nextIndex); setSelectedWinner(null); setWinningBid("");
    const nextLog = [...logArr, `📢 [${next.region}] ${next.label} is up! (${nextIndex + 1} of ${order.length})`];
    setLog(nextLog);
    saveState({ phase: "draft", drafters: dftrs, availableItems: avail, draftOrder: order, draftIndex: nextIndex, currentItem: next, log: nextLog, budgetMode, budgetAmount });
  };

  // ── Confirm sale ──
  const confirmSale = () => {
    if (isViewer) return;
    const amount = parseInt(winningBid);
    if (selectedWinner === null || isNaN(amount) || amount < 1) return;
    if (hasBudget && amount > drafters[selectedWinner].budget) return;
    const winner = drafters[selectedWinner];
    const updatedDrafters = drafters.map((d, i) => i === selectedWinner ? { ...d, budget: hasBudget ? d.budget - amount : d.budget, items: [...d.items, { ...currentItem, price: amount }] } : d);
    const updatedAvailable = availableItems.filter((item) => item.id !== currentItem.id);
    setDrafters(updatedDrafters); setAvailableItems(updatedAvailable);
    const saleLog = [...log, `✅ [${currentItem.region}] ${currentItem.label} → ${winner.name} for $${amount}!`];
    setLog(saleLog);
    advanceToNext(draftIndex + 1, draftOrder, updatedAvailable, saleLog, updatedDrafters);
  };

  // ── Cancel / skip ──
  const cancelAuction = () => {
    if (isViewer) return;
    const cancelLog = [...log, `⏭️ ${currentItem.label} returned — no sale.`];
    const newOrder = [...draftOrder]; const removed = newOrder.splice(draftIndex, 1)[0]; newOrder.push(removed);
    setDraftOrder(newOrder);
    if (draftIndex >= newOrder.length) { advanceToNext(0, newOrder, availableItems, cancelLog, drafters); }
    else {
      const next = newOrder[draftIndex];
      setCurrentItem(next); setSelectedWinner(null); setWinningBid("");
      const nextLog = [...cancelLog, `📢 [${next.region}] ${next.label} is up! (${draftIndex + 1} of ${newOrder.length})`];
      setLog(nextLog);
      saveState({ phase: "draft", drafters, availableItems, draftOrder: newOrder, draftIndex, currentItem: next, log: nextLog, budgetMode, budgetAmount });
    }
  };

  // ── Excel download ──
  const loadSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX); s.onerror = () => reject(new Error("Failed")); document.head.appendChild(s);
  });

  const downloadExcel = async () => {
    try {
      const X = await loadSheetJS();
      const sum = drafters.map((d) => ({ Drafter: d.name, Teams: d.items.length, "Total Spent": totalSpent(d), ...(hasBudget ? { Remaining: d.budget === Infinity ? "N/A" : d.budget } : {}) }));
      const picks = []; drafters.forEach((d) => d.items.forEach((item) => picks.push({ Drafter: d.name, Region: item.region, Seed: item.seed, Team: item.shortLabel, Price: item.price })));
      const wb = X.utils.book_new();
      const ws1 = X.utils.json_to_sheet(sum); ws1["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]; X.utils.book_append_sheet(wb, ws1, "Summary");
      const ws2 = X.utils.json_to_sheet(picks); ws2["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 20 }, { wch: 10 }]; X.utils.book_append_sheet(wb, ws2, "All Picks");
      const out = X.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "march-madness-draft.xlsx";
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
      let csv = "Drafter,Region,Seed,Team,Price\n";
      drafters.forEach((d) => d.items.forEach((item) => { csv += `"${d.name}","${item.region}","${item.seed}","${item.shortLabel}",${item.price}\n`; }));
      const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "march-madness-draft.csv";
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    }
  };

  // ── Copy results ──
  const copyResults = () => {
    let text = "🏀 MARCH MADNESS DRAFT RESULTS\n" + "═".repeat(36) + "\n\n";
    drafters.forEach((d) => {
      text += `${d.name} — $${totalSpent(d)} spent\n`;
      REGIONS.forEach((r) => { const items = d.items.filter((i) => i.region === r); if (items.length) { text += `  ${r}:\n`; items.forEach((i) => { text += `    ${i.shortLabel} — $${i.price}\n`; }); } });
      text += "\n";
    });
    if (roomCode) text += `Room: ${roomCode}\n`;
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  };

  // ── Resume / Reset ──
  const resumeDraft = () => {
    const saved = loadDraftLocal(); if (!saved) return;
    setPhase(saved.phase); setDrafters(saved.drafters); setAvailableItems(saved.availableItems);
    setDraftOrder(saved.draftOrder); setDraftIndex(saved.draftIndex); setCurrentItem(saved.currentItem);
    setLog(saved.log); setBudgetMode(saved.budgetMode); setBudgetAmount(saved.budgetAmount);
    if (saved.phase === "done") setShowConfetti(true);
  };
  const startFresh = () => { clearSaveLocal(); setHasSavedDraft(false); };
  const resetDraft = () => {
    clearSaveLocal(); if (listenerRef.current) off(listenerRef.current);
    setPhase("setup"); setDrafters([]); setAvailableItems([]); setDraftOrder([]);
    setDraftIndex(0); setCurrentItem(null); setLog([]); setShowConfetti(false);
    setHasSavedDraft(false); setRole(null); setRoomCode(""); setJoinCode("");
  };

  const Confetti = () => {
    const ps = Array.from({ length: 80 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 2, duration: 2 + Math.random() * 2, color: COLORS[i % COLORS.length], size: 6 + Math.random() * 8 }));
    return (<div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9999 }}>
      {ps.map((p) => (<div key={p.id} style={{ position: "absolute", top: -20, left: `${p.left}%`, width: p.size, height: p.size, backgroundColor: p.color, borderRadius: Math.random() > 0.5 ? "50%" : "2px", animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards` }} />))}
    </div>);
  };

  const totalSpent = (d) => d.items.reduce((s, i) => s + i.price, 0);
  const seedKeys = [...Array.from({ length: 12 }, (_, i) => i + 1), "13-16"];
  const regionAvailable = (region) => availableItems.filter((i) => i.region === region);
  const totalLeft = availableItems.length;

  // ══════════════════════════════════════════
  // ── SETUP PHASE ──
  // ══════════════════════════════════════════
  if (phase === "setup") {
    const hostReady = isHost && roomCode && !drafters.length;
    return (
      <div style={S.page}><style>{globalCSS}</style>
        <div style={S.setupContainer}>
          <div style={S.logoArea}>
            <div style={S.basketballIcon}>🏀</div>
            <h1 style={S.mainTitle}>MARCH MADNESS</h1>
            <h2 style={S.subtitle}>AUCTION DRAFT</h2>
            <p style={S.tagline}>4 Regions · Seeds 1–12 individual · Seeds 13–16 grouped · 52 total items</p>
          </div>

          {hasSavedDraft && !isHost && (
            <div style={S.resumeBanner}>
              <div style={S.resumeText}><span style={{ fontSize: 20 }}>💾</span><span>You have a draft in progress!</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.resumeBtn} onClick={resumeDraft}>Resume Draft</button>
                <button style={S.resumeDiscardBtn} onClick={startFresh}>Discard</button>
              </div>
            </div>
          )}

          {!isHost && (
            <div style={{ ...S.setupCard, maxWidth: 720, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 style={S.cardTitle}>👀 JOIN A LIVE DRAFT</h3>
                  <p style={S.cardSubtitle}>Enter a room code to watch in real-time</p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input style={{ ...S.nameInput, width: 130, textAlign: "center", fontSize: 18, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: 4, textTransform: "uppercase" }}
                    placeholder="CODE" maxLength={6} value={joinCode}
                    onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
                  <button style={S.joinBtn} onClick={joinRoom}>JOIN</button>
                </div>
              </div>
              {joinError && <p style={S.errorHint}>{joinError}</p>}
            </div>
          )}

          {hostReady && (
            <div style={S.roomCodeBanner}>
              <div style={S.roomCodeLabel}>SHARE THIS ROOM CODE</div>
              <div style={S.roomCodeDisplay}>{roomCode}</div>
              <p style={S.roomCodeHint}>Others can join with this code to watch live</p>
              <button style={S.roomCodeCopyBtn} onClick={() => navigator.clipboard.writeText(roomCode)}>📋 Copy Code</button>
            </div>
          )}

          <div style={S.setupColumns}>
            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>DRAFTERS</h3>
              <p style={S.cardSubtitle}>{drafterNames.length} / 15</p>
              <div style={S.nameList}>
                {drafterNames.map((name, i) => (
                  <div key={i} style={S.nameRow}>
                    <div style={{ ...S.nameNumber, backgroundColor: COLORS[i % COLORS.length] }}>{i + 1}</div>
                    <input style={S.nameInput} placeholder={`Drafter ${i + 1}`} value={name}
                      onChange={(e) => { const u = [...drafterNames]; u[i] = e.target.value; setDrafterNames(u); }}
                      onKeyDown={(e) => e.key === "Enter" && i === drafterNames.length - 1 && addDrafter()} />
                    {drafterNames.length > 2 && <button style={S.removeBtn} onClick={() => removeDrafter(i)}>✕</button>}
                  </div>
                ))}
              </div>
              {drafterNames.length < 15 && <button style={S.addBtn} onClick={addDrafter}>+ Add Drafter</button>}
            </div>

            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>SEED NAMES</h3>
              <p style={S.cardSubtitle}>Optional — name each team per region</p>
              <div style={S.regionTabs}>
                {REGIONS.map((r) => (
                  <button key={r} style={{ ...S.regionTab, borderBottomColor: setupSeedTab === r ? REGION_COLORS[r] : "transparent", color: setupSeedTab === r ? REGION_COLORS[r] : "#5a6478" }}
                    onClick={() => setSetupSeedTab(r)}>{r}</button>
                ))}
              </div>
              <div style={S.seedNameScroll}>
                {seedKeys.map((key) => {
                  const fk = `${setupSeedTab}-${key}`;
                  return (<div key={fk} style={S.nameRow}>
                    <div style={{ ...S.seedTag, backgroundColor: SEED_COLORS[key] }}>{key === "13-16" ? "13-16" : `#${key}`}</div>
                    <input style={S.nameInput} placeholder={key === "13-16" ? "Group name" : `Seed ${key} team`}
                      value={seedNames[fk]} onChange={(e) => setSeedNames({ ...seedNames, [fk]: e.target.value })} />
                  </div>);
                })}
              </div>
            </div>
          </div>

          <div style={{ ...S.setupCard, maxWidth: 720, marginTop: 20 }}>
            <div style={S.settingBlock}>
              <span style={S.settingLabel}>BID LIMIT</span>
              <div style={S.toggleRow}>
                <button style={{ ...S.toggleBtn, ...(budgetMode === "unlimited" ? S.toggleBtnActive : {}) }} onClick={() => setBudgetMode("unlimited")}>
                  <span style={S.toggleIcon}>♾️</span><span>No Limit</span></button>
                <button style={{ ...S.toggleBtn, ...(budgetMode === "capped" ? S.toggleBtnActive : {}) }} onClick={() => setBudgetMode("capped")}>
                  <span style={S.toggleIcon}>💰</span><span>Set Max Budget</span></button>
              </div>
              {budgetMode === "capped" && (
                <div style={S.budgetInputRow}><span style={S.budgetDollar}>$</span>
                  <input style={S.budgetInputField} type="number" min={10} value={budgetAmount}
                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setBudgetAmount(v); }} />
                  <span style={S.budgetPerDrafter}>per drafter</span></div>
              )}
              <p style={S.settingHint}>{budgetMode === "unlimited" ? "No spending cap." : `$${budgetAmount} per drafter across all 52 items.`}</p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {!isHost ? (<>
                <button style={{ ...S.startBtn, flex: 1, opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                  onClick={startSolo} disabled={drafterNames.filter((n) => n.trim()).length < 2}>START SOLO 🏀</button>
                <button style={{ ...S.startBtnLive, flex: 1, opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                  onClick={startAsHost} disabled={drafterNames.filter((n) => n.trim()).length < 2}>HOST LIVE 📡</button>
              </>) : (
                <button style={{ ...S.startBtn, flex: 1, opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                  onClick={startDraft} disabled={drafterNames.filter((n) => n.trim()).length < 2}>START THE DRAFT 🏀</button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ── DRAFT / DONE PHASE ──
  // ══════════════════════════════════════════
  return (
    <div style={S.page}><style>{globalCSS}</style>
      {showConfetti && <Confetti />}

      <div style={S.header}>
        <span style={S.headerIcon}>🏀</span>
        <h1 style={S.headerTitle}>MARCH MADNESS AUCTION</h1>
        {isLive && <span style={S.liveBadge}>{isHost ? `📡 HOSTING · ${roomCode}` : `👀 VIEWING · ${roomCode}`}</span>}
        <span style={S.headerBadge}>{phase === "done" ? "COMPLETE" : `${totalLeft} left`}</span>
        {hasBudget && <span style={S.headerBadgeBudget}>${budgetAmount} budget</span>}
        {!isViewer && <span style={S.savedBadge}>💾 Auto-saved</span>}
      </div>

      {isViewer && (
        <div style={S.viewerBanner}><span style={{ fontSize: 16 }}>👀</span><span>You're watching live — results update automatically</span></div>
      )}

      <div style={S.draftLayout}>
        {/* Left: Draft Order */}
        <div style={S.leftPanel}>
          <h3 style={S.panelTitle}>DRAFT ORDER</h3>
          {phase === "done" ? (
            <div style={S.doneMessage}><div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div><p style={{ fontSize: 16, fontWeight: 700 }}>DONE!</p></div>
          ) : (
            <div style={S.seedList}>
              {draftOrder.slice(draftIndex).map((item, idx) => {
                const cur = idx === 0;
                const drafted = !availableItems.find((a) => a.id === item.id);
                if (drafted && !cur) return null;
                return (<div key={item.id} style={{ ...S.queueItem, backgroundColor: cur ? SEED_COLORS[item.seed] : "rgba(255,255,255,0.03)", borderLeft: `3px solid ${REGION_COLORS[item.region]}`, opacity: cur ? 1 : 0.5, transform: cur ? "scale(1.03)" : "scale(1)", boxShadow: cur ? `0 0 14px ${SEED_COLORS[item.seed]}50` : "none" }}>
                  <span style={{ ...S.queueRegion, color: cur ? "#fff" : REGION_COLORS[item.region] }}>{item.region}</span>
                  <span style={{ ...S.queueLabel, color: cur ? "#fff" : "#8b98b0" }}>{item.label}</span>
                  {cur && <span style={S.queueNow}>NOW</span>}
                  {!cur && <span style={S.queueIdx}>#{draftIndex + idx + 1}</span>}
                </div>);
              })}
            </div>
          )}
          {phase !== "done" && (
            <div style={{ marginTop: 16 }}>
              <h3 style={S.panelTitle}>REGION PROGRESS</h3>
              {REGIONS.map((r) => {
                const total = 13, left = regionAvailable(r).length, done = total - left;
                return (<div key={r} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: REGION_COLORS[r] }}></div>
                    <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{r}</span>
                    <span style={{ fontSize: 10, color: "#5a6478" }}>{done}/{total}</span>
                  </div>
                  <div style={S.budgetBar}><div style={{ ...S.budgetFill, width: `${(done / total) * 100}%`, backgroundColor: REGION_COLORS[r] }}></div></div>
                </div>);
              })}
            </div>
          )}
        </div>

        {/* Center: Auction */}
        <div style={S.centerPanel}>
          {currentItem ? (
            <div style={S.auctionBlock}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={S.auctionLabel}>{isViewer ? "CURRENT AUCTION" : "RECORD RESULT"}</div>
                <span style={{ ...S.regionPill, backgroundColor: REGION_COLORS[currentItem.region] }}>{currentItem.region}</span>
              </div>
              <div style={{ ...S.auctionSeed, backgroundColor: SEED_COLORS[currentItem.seed] }}>{currentItem.label}</div>

              {!isViewer && (<>
                <div style={S.fieldBlock}>
                  <label style={S.fieldLabel}>WHO WON?</label>
                  <div style={S.winnerGrid}>
                    {drafters.map((d, i) => {
                      const sel = selectedWinner === i, broke = hasBudget && d.budget < 1;
                      return (<button key={i} disabled={broke} style={{ ...S.winnerBtn, borderColor: sel ? d.color : "rgba(255,255,255,0.08)", background: sel ? `${d.color}20` : "rgba(255,255,255,0.03)", color: sel ? d.color : broke ? "#2a2e3a" : "#8b98b0", boxShadow: sel ? `0 0 12px ${d.color}30` : "none", cursor: broke ? "default" : "pointer" }}
                        onClick={() => !broke && setSelectedWinner(i)}>
                        <div style={{ ...S.winnerDot, backgroundColor: d.color, opacity: broke ? 0.2 : 1 }}></div>
                        <span style={S.winnerName}>{d.name}</span>
                        {hasBudget && <span style={S.winnerBudget}>${d.budget}</span>}
                      </button>);
                    })}
                  </div>
                </div>
                <div style={S.fieldBlock}>
                  <label style={S.fieldLabel}>WINNING BID</label>
                  <div style={S.bidInputRow}><span style={S.bidDollar}>$</span>
                    <input style={S.bidAmountInput} type="number" min={1}
                      max={hasBudget && selectedWinner !== null ? drafters[selectedWinner].budget : undefined}
                      placeholder="Amount" value={winningBid}
                      onChange={(e) => setWinningBid(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmSale()} />
                  </div>
                  {hasBudget && selectedWinner !== null && parseInt(winningBid) > drafters[selectedWinner].budget && (
                    <p style={S.errorHint}>Exceeds {drafters[selectedWinner].name}'s budget</p>
                  )}
                </div>
                <div style={S.auctionActions}>
                  <button style={{ ...S.soldBtn, opacity: selectedWinner !== null && winningBid && parseInt(winningBid) >= 1 && (!hasBudget || parseInt(winningBid) <= drafters[selectedWinner]?.budget) ? 1 : 0.3 }}
                    onClick={confirmSale} disabled={selectedWinner === null || !winningBid || parseInt(winningBid) < 1 || (hasBudget && parseInt(winningBid) > (drafters[selectedWinner]?.budget || 0))}>
                    🔨 CONFIRM SALE</button>
                  <button style={S.cancelBtn} onClick={cancelAuction}>Skip</button>
                </div>
              </>)}

              {isViewer && (
                <div style={S.viewerWaiting}><div style={S.spinner}></div><p style={{ color: "#8b98b0", marginTop: 10, fontSize: 14 }}>Waiting for host to record result...</p></div>
              )}
            </div>
          ) : phase !== "done" ? (
            <div style={S.waitingBlock}><div style={S.spinner}></div><p style={{ color: "#8b98b0", fontSize: 16, fontWeight: 600, marginTop: 12 }}>Loading draft...</p></div>
          ) : null}

          <div style={S.logContainer}>
            <h4 style={S.logTitle}>ACTIVITY LOG</h4>
            <div ref={logRef} style={S.logScroll}>
              {log.map((entry, i) => (
                <div key={i} style={{ ...S.logEntry, color: entry.startsWith("✅") ? "#4ADE80" : entry.startsWith("🏆") ? "#E9C46A" : "#8b98b0", fontWeight: entry.startsWith("✅") || entry.startsWith("🏆") ? 700 : 400 }}>{entry}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Budgets / Totals */}
        <div style={S.rightPanel}>
          <h3 style={S.panelTitle}>{hasBudget ? "BUDGETS" : "TOTALS"}</h3>
          {drafters.map((d, i) => (
            <div key={i} style={S.budgetCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ ...S.budgetDot, backgroundColor: d.color }}></div>
                <span style={S.budgetName}>{d.name}</span>
                <span style={S.budgetAmountText}>${hasBudget ? d.budget : totalSpent(d)}</span>
              </div>
              {hasBudget && (<div style={S.budgetBar}><div style={{ ...S.budgetFill, width: `${Math.max(0, (d.budget / budgetAmount) * 100)}%`, backgroundColor: d.color }}></div></div>)}
              <div style={S.budgetItemCount}>{d.items.length} team{d.items.length !== 1 ? "s" : ""}{hasBudget ? ` · $${totalSpent(d)} spent` : ""}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: Results */}
      <div style={S.resultsSection}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <h3 style={{ ...S.resultsSectionTitle, marginBottom: 0, flex: 1 }}>📋 DRAFT RESULTS</h3>
          <button style={S.copyBtn} onClick={copyResults}>{copied ? "✓ Copied!" : "📋 Copy"}</button>
          <button style={S.downloadBtn} onClick={downloadExcel}>📥 Excel</button>
          <button style={S.resetBtn} onClick={resetDraft}>🗑️ New Draft</button>
        </div>
        <div style={S.resultsGrid}>
          {drafters.map((d, i) => (
            <div key={i} style={{ ...S.resultCard, borderTop: `4px solid ${d.color}` }}>
              <div style={S.resultHeader}>
                <span style={S.resultName}>{d.name}</span>
                <span style={{ ...S.resultSpent, color: d.color }}>${totalSpent(d)}</span>
              </div>
              {hasBudget && <div style={S.resultBudgetLeft}>${d.budget} remaining</div>}
              {d.items.length === 0 ? <p style={S.noItems}>No teams yet</p> : (
                <div style={S.resultItemList}>
                  {REGIONS.map((region) => {
                    const ri = d.items.filter((item) => item.region === region);
                    if (!ri.length) return null;
                    return (<div key={region}>
                      <div style={{ ...S.resultRegionLabel, color: REGION_COLORS[region] }}>{region}</div>
                      {ri.map((item, j) => (<div key={j} style={S.resultItem}>
                        <span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[item.seed] }}>{item.shortLabel}</span>
                        <span style={S.resultPrice}>${item.price}</span>
                      </div>))}
                    </div>);
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// ── CSS ──
// ══════════════════════════════════════════
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  input:focus, button:focus { outline: none; }
  input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  ::selection { background: #E63946; color: #fff; }
  body { background: #0a0e17; }
  @keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideDown { 0% { opacity: 0; max-height: 0; margin-top: 0; } 100% { opacity: 1; max-height: 80px; margin-top: 12px; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
`;

// ══════════════════════════════════════════
// ── STYLES ──
// ══════════════════════════════════════════
const S = {
  page: { fontFamily: "'Source Sans 3', sans-serif", backgroundColor: "#0a0e17", color: "#e8e6e1", minHeight: "100vh" },
  setupContainer: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", background: "radial-gradient(ellipse at 50% 30%, #1a2340 0%, #0a0e17 70%)" },
  logoArea: { textAlign: "center", marginBottom: 28 },
  basketballIcon: { fontSize: 52, marginBottom: 6, filter: "drop-shadow(0 0 20px rgba(230,57,70,0.5))" },
  mainTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 46, fontWeight: 700, letterSpacing: 6, background: "linear-gradient(135deg, #E63946, #FF8200)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1 },
  subtitle: { fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 500, letterSpacing: 10, color: "#8b98b0", marginTop: 4 },
  tagline: { color: "#5a6478", marginTop: 10, fontSize: 13, letterSpacing: 1 },
  // Resume
  resumeBanner: { width: "100%", maxWidth: 720, marginBottom: 16, padding: "16px 20px", borderRadius: 12, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  resumeText: { display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: "#4ADE80" },
  resumeBtn: { padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, cursor: "pointer" },
  resumeDiscardBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#5a6478", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  // Room code
  roomCodeBanner: { width: "100%", maxWidth: 720, marginBottom: 16, padding: "24px 20px", borderRadius: 14, background: "rgba(58,134,255,0.08)", border: "1px solid rgba(58,134,255,0.3)", textAlign: "center" },
  roomCodeLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 4, color: "#3A86FF", marginBottom: 8 },
  roomCodeDisplay: { fontFamily: "'Oswald', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: 12, color: "#fff", textShadow: "0 0 30px rgba(58,134,255,0.4)" },
  roomCodeHint: { color: "#5a6478", fontSize: 13, marginTop: 8 },
  roomCodeCopyBtn: { marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(58,134,255,0.3)", background: "rgba(58,134,255,0.12)", color: "#3A86FF", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  // Join
  joinBtn: { padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #3A86FF, #023E8A)", color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, cursor: "pointer" },
  // Setup
  setupColumns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 720 },
  setupCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "22px 20px", backdropFilter: "blur(12px)" },
  cardTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: 3, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: "#5a6478", marginBottom: 14 },
  nameList: { display: "flex", flexDirection: "column", gap: 7 },
  nameRow: { display: "flex", alignItems: "center", gap: 8 },
  nameNumber: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  seedTag: { padding: "3px 8px", borderRadius: 5, color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 1, flexShrink: 0, textAlign: "center", minWidth: 38 },
  nameInput: { flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e8e6e1", fontSize: 13, fontFamily: "'Source Sans 3', sans-serif" },
  removeBtn: { width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(230,57,70,0.2)", color: "#E63946", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  addBtn: { marginTop: 8, padding: "7px 0", width: "100%", borderRadius: 7, border: "1px dashed rgba(255,255,255,0.15)", background: "transparent", color: "#5a6478", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  regionTabs: { display: "flex", gap: 0, marginBottom: 10 },
  regionTab: { flex: 1, padding: "8px 4px", background: "transparent", border: "none", borderBottom: "3px solid", fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 2, cursor: "pointer", transition: "all 0.15s" },
  seedNameScroll: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" },
  settingBlock: { marginBottom: 16 },
  settingLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3, color: "#5a6478", display: "block", marginBottom: 10 },
  toggleRow: { display: "flex", gap: 8 },
  toggleBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#5a6478", cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", fontSize: 13, fontWeight: 600, transition: "all 0.2s ease" },
  toggleBtnActive: { background: "rgba(230,57,70,0.12)", borderColor: "rgba(230,57,70,0.4)", color: "#E63946", boxShadow: "0 0 12px rgba(230,57,70,0.15)" },
  toggleIcon: { fontSize: 20 },
  budgetInputRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 12, animation: "slideDown 0.3s ease forwards", overflow: "hidden" },
  budgetDollar: { fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 700, color: "#4ADE80" },
  budgetInputField: { width: 100, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 20, fontFamily: "'Oswald', sans-serif", fontWeight: 700, textAlign: "center" },
  budgetPerDrafter: { fontSize: 13, color: "#5a6478", fontWeight: 600 },
  settingHint: { fontSize: 12, color: "#3e4a5e", marginTop: 8, fontStyle: "italic" },
  startBtn: { padding: "14px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #E63946, #FF8200)", color: "#fff", cursor: "pointer", fontSize: 17, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: 3 },
  startBtnLive: { padding: "14px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #3A86FF, #023E8A)", color: "#fff", cursor: "pointer", fontSize: 17, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: 3 },
  // Draft header
  header: { display: "flex", alignItems: "center", gap: 12, padding: "14px 24px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap" },
  headerIcon: { fontSize: 24 },
  headerTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 4, flex: 1 },
  headerBadge: { padding: "4px 14px", borderRadius: 20, background: "rgba(230,57,70,0.15)", color: "#E63946", fontWeight: 700, fontSize: 13 },
  headerBadgeBudget: { padding: "4px 14px", borderRadius: 20, background: "rgba(74,222,128,0.1)", color: "#4ADE80", fontWeight: 700, fontSize: 13 },
  savedBadge: { padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "#5a6478", fontSize: 11, fontWeight: 600 },
  liveBadge: { padding: "4px 14px", borderRadius: 20, background: "rgba(58,134,255,0.15)", color: "#3A86FF", fontWeight: 700, fontSize: 13, animation: "pulse 2s ease infinite" },
  viewerBanner: { display: "flex", alignItems: "center", gap: 10, padding: "10px 24px", background: "rgba(58,134,255,0.06)", borderBottom: "1px solid rgba(58,134,255,0.15)", color: "#3A86FF", fontSize: 14, fontWeight: 600 },
  // Draft layout
  draftLayout: { display: "grid", gridTemplateColumns: "230px 1fr 220px", gap: 0, minHeight: "55vh" },
  leftPanel: { padding: "16px 14px", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" },
  panelTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 3, color: "#5a6478", marginBottom: 10 },
  seedList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: "45vh", overflowY: "auto" },
  queueItem: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, transition: "all 0.2s ease" },
  queueRegion: { fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1, width: 52, flexShrink: 0, textTransform: "uppercase" },
  queueLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  queueNow: { padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", color: "#fff", fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2 },
  queueIdx: { fontFamily: "'Oswald', sans-serif", fontSize: 10, color: "#3e4a5e", flexShrink: 0 },
  spinner: { width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#E63946", animation: "spin 0.8s linear infinite" },
  doneMessage: { textAlign: "center", padding: "40px 0", color: "#8b98b0" },
  // Center
  centerPanel: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 },
  auctionBlock: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 },
  auctionLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 4, color: "#E63946" },
  regionPill: { padding: "3px 10px", borderRadius: 12, color: "#fff", fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 2 },
  auctionSeed: { display: "inline-block", padding: "12px 28px", borderRadius: 10, color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2, marginBottom: 20 },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3, color: "#5a6478", display: "block", marginBottom: 8 },
  winnerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  winnerBtn: { display: "flex", alignItems: "center", gap: 8, padding: "9px 11px", borderRadius: 8, border: "1px solid", cursor: "pointer", transition: "all 0.15s ease", fontFamily: "'Source Sans 3', sans-serif" },
  winnerDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  winnerName: { fontSize: 13, fontWeight: 600, flex: 1 },
  winnerBudget: { fontSize: 11, color: "#5a6478" },
  bidInputRow: { display: "flex", alignItems: "center", gap: 8 },
  bidDollar: { fontFamily: "'Oswald', sans-serif", fontSize: 26, fontWeight: 700, color: "#4ADE80" },
  bidAmountInput: { padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 22, fontFamily: "'Oswald', sans-serif", fontWeight: 700, width: 150 },
  errorHint: { fontSize: 12, color: "#E63946", marginTop: 6 },
  auctionActions: { display: "flex", gap: 10, marginTop: 4 },
  soldBtn: { flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 3, cursor: "pointer" },
  cancelBtn: { padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#5a6478", fontFamily: "'Source Sans 3', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  viewerWaiting: { display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 0" },
  waitingBlock: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 50, background: "rgba(255,255,255,0.02)", borderRadius: 14 },
  logContainer: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, flex: 1, minHeight: 120, display: "flex", flexDirection: "column" },
  logTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 3, color: "#5a6478", marginBottom: 8 },
  logScroll: { flex: 1, overflowY: "auto", maxHeight: 180 },
  logEntry: { fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" },
  // Right panel
  rightPanel: { padding: "16px 14px", borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)", overflowY: "auto" },
  budgetCard: { marginBottom: 8, padding: "8px 6px", borderRadius: 8 },
  budgetDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  budgetName: { fontSize: 13, fontWeight: 600, flex: 1 },
  budgetAmountText: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, color: "#4ADE80" },
  budgetBar: { height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  budgetItemCount: { fontSize: 10, color: "#5a6478", marginTop: 3 },
  // Results
  resultsSection: { padding: "28px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" },
  resultsSectionTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: 4, marginBottom: 18 },
  copyBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  downloadBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(58,134,255,0.3)", background: "rgba(58,134,255,0.08)", color: "#3A86FF", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  resetBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(230,57,70,0.3)", background: "rgba(230,57,70,0.08)", color: "#E63946", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  resultCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 14 },
  resultHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  resultName: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 1 },
  resultSpent: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14 },
  resultBudgetLeft: { fontSize: 11, color: "#5a6478", marginBottom: 8 },
  resultRegionLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 2, marginTop: 6, marginBottom: 4 },
  noItems: { fontSize: 12, color: "#3a4050", fontStyle: "italic" },
  resultItemList: { display: "flex", flexDirection: "column", gap: 4 },
  resultItem: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  resultSeedBadge: { padding: "2px 8px", borderRadius: 4, color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 1 },
  resultPrice: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, color: "#4ADE80" },
};

