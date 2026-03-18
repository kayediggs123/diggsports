import { useState, useRef, useEffect, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, get } from "firebase/database";

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

const REGIONS = ["East", "West", "South", "Midwest"];
const REGION_COLORS = { East: "#3A86FF", West: "#E63946", South: "#2A9D8F", Midwest: "#F4A261" };
const SEED_COLORS = {
  1: "#C41E3A", 2: "#1D428A", 3: "#00843D", 4: "#FF8200",
  5: "#4B2E83", 6: "#CC0033", 7: "#003087", 8: "#8C1D40",
  9: "#FFC72C", 10: "#006747", 11: "#B3A369", 12: "#BA0C2F",
  13: "#555", 14: "#666", 15: "#555", 16: "#666", "13-16": "#555",
};
const COLORS = [
  "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
  "#264653", "#6A0572", "#D62828", "#023E8A", "#0077B6",
  "#8338EC", "#FF006E", "#3A86FF", "#FB5607", "#FFBE0B",
];
const SAVE_KEY = "mm-auction-draft-save";

// Payout percentages by round
const PAYOUT_ROUNDS = [
  { name: "Round of 32", pct: 0.14, winners: 32 },
  { name: "Sweet 16", pct: 0.14, winners: 16 },
  { name: "Elite 8", pct: 0.17, winners: 8 },
  { name: "Final Four", pct: 0.20, winners: 4 },
  { name: "Championship Game", pct: 0.20, winners: 2 },
  { name: "Champion", pct: 0.15, winners: 1 },
];

const DEFAULT_TEAMS = {
  // East
  "East-1": "Duke", "East-2": "UConn", "East-3": "Michigan St", "East-4": "Kansas",
  "East-5": "St. John's", "East-6": "Louisville", "East-7": "UCLA", "East-8": "Ohio State",
  "East-9": "TCU", "East-10": "UCF", "East-11": "South Florida", "East-12": "Northern Iowa",
  "East-13": "Cal Baptist", "East-14": "North Dakota St", "East-15": "Furman", "East-16": "Siena",
  // West
  "West-1": "Arizona", "West-2": "Purdue", "West-3": "Gonzaga", "West-4": "Arkansas",
  "West-5": "Wisconsin", "West-6": "BYU", "West-7": "Miami FL", "West-8": "Villanova",
  "West-9": "Utah State", "West-10": "Missouri", "West-11": "Texas/NC State", "West-12": "High Point",
  "West-13": "Hawaii", "West-14": "Kennesaw St", "West-15": "Queens", "West-16": "LIU",
  // Midwest
  "Midwest-1": "Michigan", "Midwest-2": "Iowa State", "Midwest-3": "Virginia", "Midwest-4": "Alabama",
  "Midwest-5": "Texas Tech", "Midwest-6": "Tennessee", "Midwest-7": "Kentucky", "Midwest-8": "Georgia",
  "Midwest-9": "Saint Louis", "Midwest-10": "Santa Clara", "Midwest-11": "SMU/Miami OH", "Midwest-12": "Akron",
  "Midwest-13": "Hofstra", "Midwest-14": "Wright State", "Midwest-15": "Tennessee St", "Midwest-16": "UMBC/Howard",
  // South
  "South-1": "Florida", "South-2": "Houston", "South-3": "Illinois", "South-4": "Nebraska",
  "South-5": "Vanderbilt", "South-6": "North Carolina", "South-7": "Saint Mary's", "South-8": "Clemson",
  "South-9": "Iowa", "South-10": "Texas A&M", "South-11": "VCU", "South-12": "McNeese",
  "South-13": "Troy", "South-14": "Penn", "South-15": "Idaho", "South-16": "Prairie View/Lehigh",
};

const buildDefaultSeedNames = () => {
  const n = {};
  REGIONS.forEach((r) => { for (let s = 1; s <= 16; s++) n[`${r}-${s}`] = DEFAULT_TEAMS[`${r}-${s}`] || ""; n[`${r}-13-16`] = ""; });
  return n;
};

const buildItems = (seedNames) => {
  const list = [];
  REGIONS.forEach((region) => {
    for (let s = 1; s <= 12; s++) {
      const name = seedNames[`${region}-${s}`]?.trim();
      list.push({ id: `${region}-${s}`, seed: s, region, label: name ? `#${s} ${name}` : `#${s} Seed`, shortLabel: name || `#${s}`, type: "single" });
    }
    // Group 13-16: concatenate individual names for draft/results display
    const names1316 = {};
    const nameList = [];
    for (let s = 13; s <= 16; s++) {
      const n = seedNames[`${region}-${s}`]?.trim() || "";
      names1316[s] = n;
      if (n) nameList.push(n);
    }
    const combined = nameList.length > 0 ? nameList.join(", ") : "";
    list.push({ id: `${region}-13-16`, seed: "13-16", region, label: combined ? `13-16 ${combined}` : "13-16 Seeds", shortLabel: combined || "13-16", type: "group", seedNames: names1316 });
  });
  return list;
};

function shuffle(arr) {
  const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a;
}
function generateRoomCode() {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code = "";
  for (let i = 0; i < 6; i++) code += c[Math.floor(Math.random() * c.length)]; return code;
}

const saveDraftLocal = (state) => { try { const s = { ...state, drafters: state.drafters.map((d) => ({ ...d, budget: d.budget === Infinity ? null : d.budget })) }; localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {} };
const loadDraftLocal = () => { try { const r = localStorage.getItem(SAVE_KEY); if (!r) return null; const d = JSON.parse(r); d.drafters = d.drafters.map((x) => ({ ...x, budget: x.budget === null ? Infinity : x.budget })); return d; } catch (e) { return null; } };
const clearSaveLocal = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

const toArray = (val) => { if (Array.isArray(val)) return val; if (val && typeof val === "object") return Object.values(val); return []; };
const serializeState = (state) => ({ ...state, drafters: (state.drafters || []).map((d) => ({ ...d, budget: d.budget === Infinity ? -1 : d.budget, items: d.items || [] })), availableItems: state.availableItems || [], draftOrder: state.draftOrder || [], log: state.log || [], bracketPicks: state.bracketPicks || {} });
const deserializeState = (data) => { if (!data) return null; return { ...data, drafters: toArray(data.drafters).map((d) => ({ ...d, budget: d.budget === -1 ? Infinity : d.budget, items: toArray(d.items) })), log: toArray(data.log), availableItems: toArray(data.availableItems), draftOrder: toArray(data.draftOrder), currentItem: data.currentItem || null, bracketPicks: data.bracketPicks || {} }; };
const writeRoom = async (roomCode, state) => {
  try { await set(ref(db, `rooms/${roomCode}`), serializeState(state)); } catch (e) { console.error("Firebase write:", e); }
};

export default function MarchMadnessAuction() {
  // phase: "landing" | "config" | "draft" | "done"
  const [phase, setPhase] = useState("landing");
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
  const [role, setRole] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const roleRef = useRef(null);
  const roomCodeRef = useRef("");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [dragItem, setDragItem] = useState(null);
  const [dragOverDrafter, setDragOverDrafter] = useState(null);
  const [editingPrice, setEditingPrice] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState("");
  const [doneTab, setDoneTab] = useState("bracket"); // "bracket" | "list" | "stats"
  // bracketPicks: { "East-R1-0": "East-1", "East-R2-0": "East-1", ... , "FF-0": "East-1", "FF-1": "South-3", "CHAMP": "East-1" }
  // Keys: "{region}-R{round}-{matchIdx}" for regional rounds, "FF-0", "FF-1" for final four, "CHAMP" for champion
  const [bracketPicks, setBracketPicks] = useState({});
  const [expandedDrafter, setExpandedDrafter] = useState(null);
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

  const setRoleAndRef = (r) => { setRole(r); roleRef.current = r; };
  const setRoomCodeAndRef = (c) => { setRoomCode(c); roomCodeRef.current = c; };

  const applyRemoteState = useCallback((data) => {
    try {
      const state = deserializeState(data); if (!state) return;
      setDrafters(state.drafters || []); setAvailableItems(state.availableItems || []);
      setDraftOrder(state.draftOrder || []); setDraftIndex(state.draftIndex || 0);
      setCurrentItem(state.currentItem || null); setLog(state.log || []);
      setBudgetMode(state.budgetMode || "unlimited"); setBudgetAmount(state.budgetAmount || 200);
      setBracketPicks(state.bracketPicks || {});
      setPhase(state.phase || "draft");
    } catch (e) { console.error("Error applying remote state:", e); }
  }, []);

  const subscribeToRoom = useCallback((code) => {
    if (listenerRef.current) off(listenerRef.current);
    const roomRef = ref(db, `rooms/${code}`); listenerRef.current = roomRef;
    onValue(roomRef, (snapshot) => { const data = snapshot.val(); if (data) applyRemoteState(data); });
  }, [applyRemoteState]);

  const joinRoom = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) { setJoinError("Enter a valid room code"); return; }
    setJoinError("");
    try {
      const snapshot = await get(ref(db, `rooms/${code}`));
      if (!snapshot.exists()) { setJoinError("Room not found."); return; }
      setRoomCodeAndRef(code); setRoleAndRef("viewer"); applyRemoteState(snapshot.val()); subscribeToRoom(code);
    } catch (e) { setJoinError("Connection error."); }
  };

  const saveState = (snap) => {
    saveDraftLocal({ ...snap, bracketPicks });
    if (roleRef.current === "host" && roomCodeRef.current) writeRoom(roomCodeRef.current, { ...snap, bracketPicks });
  };
  const totalSpent = (d) => (d.items || []).reduce((s, i) => s + (i.price || 0), 0);
  const totalPot = drafters.reduce((s, d) => s + totalSpent(d), 0);

  // Pick a winner in the bracket and cascade (clear downstream picks if changed)
  const pickBracketWinner = (key, teamId) => {
    if (isViewer) return;
    const newPicks = { ...bracketPicks };
    const oldPick = newPicks[key];
    newPicks[key] = teamId;

    // If changed, clear downstream picks that depended on old pick
    if (oldPick && oldPick !== teamId) {
      const clearDownstream = (k, victim) => {
        const regionMatch = k.match(/^(\w+)-R(\d)-(\d)$/);
        if (regionMatch) {
          const [, reg, roundStr, idxStr] = regionMatch;
          const round = parseInt(roundStr);
          const idx = parseInt(idxStr);
          if (round < 4) {
            const nextKey = `${reg}-R${round + 1}-${Math.floor(idx / 2)}`;
            if (newPicks[nextKey] === victim) {
              newPicks[nextKey] = undefined;
              clearDownstream(nextKey, victim);
            }
          } else if (round === 4) {
            // Elite 8 winner goes to SF-0 (East/Midwest) or SF-1 (South/West)
            const sfKey = (reg === "East" || reg === "Midwest") ? "SF-0" : "SF-1";
            if (newPicks[sfKey] === victim) {
              newPicks[sfKey] = undefined;
              clearDownstream(sfKey, victim);
            }
          }
        }
        if (k === "SF-0" || k === "SF-1") {
          if (newPicks["CHAMP"] === victim) { newPicks["CHAMP"] = undefined; }
        }
      };
      clearDownstream(key, oldPick);
    }

    setBracketPicks(newPicks);
    const snap = { phase, drafters, availableItems, draftOrder, draftIndex, currentItem, log, budgetMode, budgetAmount, bracketPicks: newPicks };
    saveDraftLocal(snap);
    if (roleRef.current === "host" && roomCodeRef.current) writeRoom(roomCodeRef.current, snap);
  };

  const startDraft = (hostRoomCode) => {
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
    saveDraftLocal({ ...snap, bracketPicks });
    if (hostRoomCode) writeRoom(hostRoomCode, { ...snap, bracketPicks });
  };

  const startAsHost = () => {
    const code = generateRoomCode();
    setRoomCodeAndRef(code); setRoleAndRef("host");
    startDraft(code);
  };
  const startSolo = () => { setRoleAndRef(null); startDraft(); };
  const addDrafter = () => { if (drafterNames.length < 20) setDrafterNames([...drafterNames, ""]); };
  const removeDrafter = (idx) => { if (drafterNames.length > 2) setDrafterNames(drafterNames.filter((_, i) => i !== idx)); };

  const advanceToNext = (nextIndex, order, avail, logArr, dftrs) => {
    if (nextIndex >= order.length) {
      setPhase("done");  setCurrentItem(null);
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

  const confirmSale = () => {
    if (isViewer) return;
    // TEST mode: randomize all remaining picks
    if (winningBid.toUpperCase() === "TEST") { randomizeRemainder(); return; }
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

  const randomizeRemainder = () => {
    if (isViewer) return;
    let curDrafters = drafters.map((d) => ({ ...d, items: [...d.items], budget: d.budget }));
    let curAvail = [...availableItems];
    let curLog = [...log, "🎲 TEST MODE — randomizing all remaining picks!"];
    const remaining = draftOrder.slice(draftIndex);

    remaining.forEach((item) => {
      // Pick a random drafter who can afford at least $1
      const eligible = curDrafters.filter((d) => !hasBudget || d.budget >= 1);
      if (eligible.length === 0) return;
      const winner = eligible[Math.floor(Math.random() * eligible.length)];
      const winnerIdx = curDrafters.findIndex((d) => d.name === winner.name);

      // Random bid: $1 to $20 (or max budget if capped)
      const maxBid = hasBudget ? Math.min(winner.budget, 20) : 20;
      const bid = Math.max(1, Math.floor(Math.random() * maxBid) + 1);

      curDrafters = curDrafters.map((d, i) => i === winnerIdx
        ? { ...d, budget: hasBudget ? d.budget - bid : d.budget, items: [...d.items, { ...item, price: bid }] }
        : d
      );
      curAvail = curAvail.filter((a) => a.id !== item.id);
      curLog.push(`✅ [${item.region}] ${item.label} → ${winner.name} for $${bid}!`);
    });

    curLog.push("🏆 ALL ITEMS DRAFTED! The auction is complete!");
    setDrafters(curDrafters);
    setAvailableItems(curAvail);
    setLog(curLog);
    setPhase("done");
    
    setCurrentItem(null);
    saveState({ phase: "done", drafters: curDrafters, availableItems: curAvail, draftOrder, draftIndex: draftOrder.length, currentItem: null, log: curLog, budgetMode, budgetAmount });
  };

  const cancelAuction = () => {
    if (isViewer) return;
    const cancelLog = [...log, `⏭️ ${currentItem.label} returned — no sale.`];
    const newOrder = [...draftOrder]; const removed = newOrder.splice(draftIndex, 1)[0]; newOrder.push(removed);
    setDraftOrder(newOrder);
    if (draftIndex >= newOrder.length) { advanceToNext(0, newOrder, availableItems, cancelLog, drafters); }
    else {
      const next = newOrder[draftIndex]; setCurrentItem(next); setSelectedWinner(null); setWinningBid("");
      const nextLog = [...cancelLog, `📢 [${next.region}] ${next.label} is up! (${draftIndex + 1} of ${newOrder.length})`];
      setLog(nextLog);
      saveState({ phase: "draft", drafters, availableItems, draftOrder: newOrder, draftIndex, currentItem: next, log: nextLog, budgetMode, budgetAmount });
    }
  };

  // ── Excel ──
  const loadSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script"); s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX); s.onerror = () => reject(new Error("Failed")); document.head.appendChild(s);
  });
  const downloadExcel = async () => {
    try {
      const X = await loadSheetJS();
      const sum = drafters.map((d) => ({ Drafter: d.name, Teams: d.items.length, "Total Spent": totalSpent(d), ...(hasBudget ? { Remaining: d.budget === Infinity ? "N/A" : d.budget } : {}) }));
      const picks = []; drafters.forEach((d) => d.items.forEach((item) => picks.push({ Drafter: d.name, Region: item.region, Seed: item.seed, Team: item.shortLabel, Price: item.price })));
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sum), "Summary");
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(picks), "All Picks");
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

  // ── Drag & Drop ──
  const handleDragStart = (drafterIdx, itemIdx, item) => { if (isViewer) return; setDragItem({ drafterIdx, itemIdx, item }); };
  const handleDragOver = (e, drafterIdx) => { e.preventDefault(); setDragOverDrafter(drafterIdx); };
  const handleDragLeave = () => { setDragOverDrafter(null); };
  const handleDrop = (e, toDrafterIdx) => {
    e.preventDefault(); setDragOverDrafter(null);
    if (!dragItem || dragItem.drafterIdx === toDrafterIdx) { setDragItem(null); return; }
    const updated = drafters.map((d, i) => {
      if (i === dragItem.drafterIdx) { const ni = [...d.items]; ni.splice(dragItem.itemIdx, 1); return { ...d, items: ni, budget: hasBudget ? d.budget + dragItem.item.price : d.budget }; }
      if (i === toDrafterIdx) { return { ...d, items: [...d.items, dragItem.item], budget: hasBudget ? d.budget - dragItem.item.price : d.budget }; }
      return d;
    });
    setDrafters(updated);
    const moveLog = [...log, `🔄 ${dragItem.item.label} moved: ${drafters[dragItem.drafterIdx].name} → ${drafters[toDrafterIdx].name}`];
    setLog(moveLog); saveState({ phase, drafters: updated, availableItems, draftOrder, draftIndex, currentItem, log: moveLog, budgetMode, budgetAmount });
    setDragItem(null);
  };

  // ── Edit price ──
  const startEditPrice = (di, ii, price) => { if (isViewer) return; setEditingPrice({ drafterIdx: di, itemIdx: ii }); setEditPriceValue(String(price)); };
  const confirmEditPrice = () => {
    if (!editingPrice) return; const np = parseInt(editPriceValue);
    if (isNaN(np) || np < 0) { setEditingPrice(null); return; }
    const { drafterIdx, itemIdx } = editingPrice; const old = drafters[drafterIdx].items[itemIdx].price; const diff = np - old;
    const updated = drafters.map((d, i) => { if (i === drafterIdx) { const ni = [...d.items]; ni[itemIdx] = { ...ni[itemIdx], price: np }; return { ...d, items: ni, budget: hasBudget ? d.budget - diff : d.budget }; } return d; });
    setDrafters(updated);
    const editLog = [...log, `✏️ ${drafters[drafterIdx].items[itemIdx].label}: $${old} → $${np}`];
    setLog(editLog); saveState({ phase, drafters: updated, availableItems, draftOrder, draftIndex, currentItem, log: editLog, budgetMode, budgetAmount });
    setEditingPrice(null);
  };
  const cancelEditPrice = () => { setEditingPrice(null); };

  // ── Resume / Reset ──
  const resumeDraft = () => {
    const saved = loadDraftLocal(); if (!saved) return;
    setPhase(saved.phase); setDrafters(saved.drafters); setAvailableItems(saved.availableItems);
    setDraftOrder(saved.draftOrder); setDraftIndex(saved.draftIndex); setCurrentItem(saved.currentItem);
    setLog(saved.log); setBudgetMode(saved.budgetMode); setBudgetAmount(saved.budgetAmount);
    setBracketPicks(saved.bracketPicks || {});
  };
  const startFresh = () => { clearSaveLocal(); setHasSavedDraft(false); };
  const resetDraft = () => {
    clearSaveLocal(); if (listenerRef.current) off(listenerRef.current);
    setPhase("landing"); setDrafters([]); setAvailableItems([]); setDraftOrder([]);
    setDraftIndex(0); setCurrentItem(null); setLog([]); setShowConfetti(false);
    setHasSavedDraft(false); setRoleAndRef(null); setRoomCodeAndRef(""); setJoinCode("");
  };

  const Confetti = () => {
    const ps = Array.from({ length: 80 }, (_, i) => ({ id: i, left: Math.random() * 100, delay: Math.random() * 2, duration: 2 + Math.random() * 2, color: COLORS[i % COLORS.length], size: 6 + Math.random() * 8 }));
    return (<div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9999 }}>
      {ps.map((p) => (<div key={p.id} style={{ position: "absolute", top: -20, left: `${p.left}%`, width: p.size, height: p.size, backgroundColor: p.color, borderRadius: Math.random() > 0.5 ? "50%" : "2px", animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards` }} />))}
    </div>);
  };

  // ── Bracket helper: find drafter who owns a seed in a region ──
  const getOwner = (region, seed) => {
    for (const d of drafters) {
      for (const item of (d.items || [])) {
        if (item.region === region && item.seed === seed) return d;
        if (item.region === region && item.seed === "13-16" && seed >= 13 && seed <= 16) return d;
      }
    }
    return null;
  };

  const getTeamLabel = (region, seed) => {
    for (const d of drafters) {
      for (const item of (d.items || [])) {
        if (item.region === region && item.seed === seed) return item.shortLabel;
        if (item.region === region && item.seed === "13-16" && seed >= 13 && seed <= 16) return item.shortLabel;
      }
    }
    return `#${seed}`;
  };

  const seedKeys = Array.from({ length: 16 }, (_, i) => i + 1);
  const regionAvailable = (region) => availableItems.filter((i) => i.region === region);
  const totalLeft = availableItems.length;

  // ══════════════════════════════════════════
  // ── LANDING PAGE ──
  // ══════════════════════════════════════════
  if (phase === "landing") {
    return (
      <div style={S.page}><style>{globalCSS}</style>
        <div style={S.setupContainer}>
          <div style={S.logoArea}>
            <div style={S.basketballIcon}>🏀</div>
            <h1 className="mm-logo-title" style={S.mainTitle}>MARCH MADNESS</h1>
            <h2 className="mm-logo-subtitle" style={S.subtitle}>CALCUTTA</h2>
            <p style={S.tagline}>4 Regions · Seeds 1–12 individual · Seeds 13–16 grouped · 52 total items</p>
          </div>

          {hasSavedDraft && (
            <div style={S.resumeBanner}>
              <div style={S.resumeText}><span style={{ fontSize: 20 }}>💾</span><span>You have a draft in progress!</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={S.resumeBtn} onClick={resumeDraft}>Resume Draft</button>
                <button style={S.resumeDiscardBtn} onClick={startFresh}>Discard</button>
              </div>
            </div>
          )}

          <div className="mm-landing-cols" style={S.setupColumns}>
            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>🏠 HOST A DRAFT</h3>
              <p style={S.cardSubtitle}>Set up and run a Calcutta draft</p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 24 }}>
                <div style={{ fontSize: 48 }}>🏀</div>
                <button style={{ ...S.startBtn, width: "100%", maxWidth: 260 }}
                  onClick={() => setPhase("config")}>SET UP DRAFT →</button>
              </div>
            </div>

            {/* Right: Join a Live Draft */}
            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>👀 JOIN A LIVE DRAFT</h3>
              <p style={S.cardSubtitle}>Enter a room code to watch in real-time</p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginTop: 24 }}>
                <input style={{ ...S.nameInput, width: "100%", maxWidth: 200, textAlign: "center", fontSize: 22, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: 6, textTransform: "uppercase", padding: "12px 14px" }}
                  placeholder="CODE" maxLength={6} value={joinCode}
                  onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && joinRoom()} />
                <button style={{ ...S.joinBtn, width: "100%", maxWidth: 260 }} onClick={joinRoom}>JOIN DRAFT</button>
                {joinError && <p style={S.errorHint}>{joinError}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ── CONFIG PAGE ──
  // ══════════════════════════════════════════
  if (phase === "config") {
    const hostReady = isHost && roomCode;
    return (
      <div style={S.page}><style>{globalCSS}</style>
        <div style={S.setupContainer}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <button style={S.backBtn} onClick={() => { setPhase("landing"); setRoleAndRef(null); setRoomCodeAndRef(""); }}>← Back</button>
            <h1 style={{ ...S.mainTitle, fontSize: 32 }}>DRAFT CONFIGURATION</h1>
            <p style={S.tagline}>Set up your drafters, teams, and settings</p>
          </div>

          {/* Drafters + Seed Names + Bid Limit */}
          <div className="mm-config-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, width: "100%", maxWidth: 900 }}>
            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>DRAFTERS</h3>
              <p style={S.cardSubtitle}>{drafterNames.length} / 20</p>
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
              {drafterNames.length < 20 && <button style={S.addBtn} onClick={addDrafter}>+ Add Drafter</button>}
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
                  const is1316 = key >= 13;
                  return (<div key={fk} style={{ ...S.nameRow, ...(key === 13 ? { marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" } : {}) }}>
                    <div style={{ ...S.seedTag, backgroundColor: SEED_COLORS[key] }}>{`#${key}`}</div>
                    <input style={S.nameInput} placeholder={`Seed ${key} team`}
                      value={seedNames[fk]} onChange={(e) => setSeedNames({ ...seedNames, [fk]: e.target.value })} />
                  </div>);
                })}
                <p style={{ fontSize: 10, color: "#3e4a5e", marginTop: 6, fontStyle: "italic" }}>Seeds 13–16 are drafted as one group.</p>
              </div>
            </div>

            <div style={S.setupCard}>
              <h3 style={S.cardTitle}>BID LIMIT</h3>
              <p style={S.cardSubtitle}>Set a spending cap per drafter</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button style={{ ...S.toggleBtn, ...(budgetMode === "unlimited" ? S.toggleBtnActive : {}), width: "100%" }} onClick={() => setBudgetMode("unlimited")}>
                  <span style={S.toggleIcon}>♾️</span><span>No Limit</span></button>
                <button style={{ ...S.toggleBtn, ...(budgetMode === "capped" ? S.toggleBtnActive : {}), width: "100%" }} onClick={() => setBudgetMode("capped")}>
                  <span style={S.toggleIcon}>💰</span><span>Set Max Budget</span></button>
              </div>
              {budgetMode === "capped" && (
                <div style={{ ...S.budgetInputRow, marginTop: 12 }}><span style={S.budgetDollar}>$</span>
                  <input style={S.budgetInputField} type="number" min={10} value={budgetAmount}
                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setBudgetAmount(v); }} />
                  <span style={S.budgetPerDrafter}>per drafter</span></div>
              )}
              <p style={{ ...S.settingHint, marginTop: 10 }}>{budgetMode === "unlimited" ? "No spending cap." : `$${budgetAmount} per drafter across all 52 items.`}</p>
            </div>
          </div>

          {/* Start Draft */}
          <div className="mm-config-start" style={{ ...S.setupCard, maxWidth: 900, marginTop: 16 }}>
            {hostReady && (
              <div style={{ marginBottom: 16 }}>
                <div style={S.roomCodeBannerInline}>
                  <div style={S.roomCodeLabel}>ROOM CODE</div>
                  <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 32, fontWeight: 700, letterSpacing: 8, color: "#fff" }}>{roomCode}</div>
                  <button style={S.roomCodeCopyBtn} onClick={() => navigator.clipboard.writeText(roomCode)}>📋 Copy</button>
                </div>
              </div>
            )}
            {!isHost ? (
              <div className="mm-setup-cols" style={S.setupColumns}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <button style={{ ...S.startBtn, width: "100%", opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                    onClick={startSolo} disabled={drafterNames.filter((n) => n.trim()).length < 2}>START SOLO 🏀</button>
                  <p style={{ fontSize: 12, color: "#5a6478", textAlign: "center", lineHeight: 1.5 }}>
                    Run the draft on this device only. You control all bids and results locally. Data is saved to your browser — no internet connection needed.
                  </p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                  <button style={{ ...S.startBtnLive, width: "100%", opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                    onClick={startAsHost} disabled={drafterNames.filter((n) => n.trim()).length < 2}>HOST LIVE 📡</button>
                  <p style={{ fontSize: 12, color: "#5a6478", textAlign: "center", lineHeight: 1.5 }}>
                    Create a room code that others can join to watch the draft live in real-time. You run the auction — viewers see results update instantly on their own devices.
                  </p>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
                <button style={{ ...S.startBtn, width: "100%", maxWidth: 360, opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
                  onClick={() => startDraft(roomCode)} disabled={drafterNames.filter((n) => n.trim()).length < 2}>START THE DRAFT 🏀</button>
                <p style={{ fontSize: 12, color: "#5a6478", textAlign: "center", lineHeight: 1.5 }}>
                  Share the room code above with viewers before starting. They'll see every pick update in real-time.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ── DONE PAGE ──
  // ══════════════════════════════════════════
  if (phase === "done") {
    const allPicks = drafters.flatMap((d) => (d.items || []).map((item) => ({ ...item, drafter: d.name, drafterColor: d.color })));
    const prices = allPicks.map((p) => p.price);
    const overallAvg = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(1) : 0;
    const overallMax = prices.length ? Math.max(...prices) : 0;
    const overallMin = prices.length ? Math.min(...prices) : 0;
    const overallTotal = prices.reduce((a, b) => a + b, 0);
    const maxPick = allPicks.find((p) => p.price === overallMax);
    const minPick = allPicks.find((p) => p.price === overallMin);

    const seedGroups = {};
    allPicks.forEach((p) => { const k = p.seed; if (!seedGroups[k]) seedGroups[k] = []; seedGroups[k].push(p); });
    const seedStats = Object.entries(seedGroups).map(([seed, picks]) => {
      const ps = picks.map((p) => p.price);
      return { seed, count: picks.length, avg: (ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1), max: Math.max(...ps), min: Math.min(...ps), total: ps.reduce((a, b) => a + b, 0) };
    }).sort((a, b) => { const na = a.seed === "13-16" ? 13 : parseInt(a.seed); const nb = b.seed === "13-16" ? 13 : parseInt(b.seed); return na - nb; });

    const regionStats = REGIONS.map((region) => {
      const rp = allPicks.filter((p) => p.region === region); if (!rp.length) return null;
      const ps = rp.map((p) => p.price);
      return { region, count: rp.length, avg: (ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1), max: Math.max(...ps), min: Math.min(...ps), total: ps.reduce((a, b) => a + b, 0) };
    }).filter(Boolean);

    const drafterStats = drafters.map((d) => {
      const items = d.items || []; if (!items.length) return null;
      const ps = items.map((i) => i.price);
      return { name: d.name, color: d.color, count: items.length, avg: (ps.reduce((a, b) => a + b, 0) / ps.length).toFixed(1), max: Math.max(...ps), min: Math.min(...ps), total: ps.reduce((a, b) => a + b, 0) };
    }).filter(Boolean);

    // ── Interactive Bracket ──
    const R1 = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];

    // Map a seed number to its bracket ID (seeds 13-16 use composite ID to track which specific seed)
    const seedToId = (region, seed) => seed >= 13 ? `${region}-13-16:${seed}` : `${region}-${seed}`;

    // Extract the draft item ID from a bracket ID (strips :seed suffix for 13-16)
    const toDraftId = (bracketId) => bracketId ? bracketId.split(":")[0] : null;

    // Extract the specific seed number from a bracket ID
    const toSeedNum = (bracketId) => {
      if (!bracketId) return null;
      const parts = bracketId.split(":");
      return parts[1] ? parseInt(parts[1]) : null;
    };

    // Get team info from a bracketId like "East-1" or "East-13-16:14"
    const getTeamInfo = (bracketId) => {
      if (!bracketId) return null;
      const draftId = toDraftId(bracketId);
      for (const d of drafters) {
        for (const item of (d.items || [])) {
          if (item.id === draftId) return { ...item, drafter: d.name, drafterColor: d.color };
        }
      }
      return null;
    };

    // Count how many wins a team has in the bracket (by draft item ID)
    const getTeamWins = (teamId) => {
      if (!teamId) return 0;
      let wins = 0;
      Object.values(bracketPicks).forEach((v) => { if (v && toDraftId(v) === teamId) wins++; });
      return wins;
    };

    // Check if a bracket ID has been eliminated (uses full bracket IDs including :seed suffix)
    const isBracketIdEliminated = (bracketId) => {
      if (!bracketId) return false;
      const draftId = toDraftId(bracketId);
      const region = draftId.split("-")[0];
      // Check R1
      const R1m = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];
      for (let i = 0; i < 8; i++) {
        const [a, b] = R1m[i];
        const idA = seedToId(region, a);
        const idB = seedToId(region, b);
        if (idA === bracketId || idB === bracketId) {
          const pick = bracketPicks[`${region}-R1-${i}`];
          if (pick && pick !== bracketId) return true;
          break;
        }
      }
      // Check R2-R4
      for (let round = 2; round <= 4; round++) {
        const count = round === 2 ? 4 : round === 3 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const prevA = bracketPicks[`${region}-R${round - 1}-${i * 2}`];
          const prevB = bracketPicks[`${region}-R${round - 1}-${i * 2 + 1}`];
          if (prevA === bracketId || prevB === bracketId) {
            const pick = bracketPicks[`${region}-R${round}-${i}`];
            if (pick && pick !== bracketId) return true;
          }
        }
      }
      // Check SF
      const e8Winner = bracketPicks[`${region}-R4-0`];
      if (e8Winner === bracketId) {
        const sfKey = (region === "East" || region === "Midwest") ? "SF-0" : "SF-1";
        const sfPick = bracketPicks[sfKey];
        if (sfPick && sfPick !== bracketId) return true;
      }
      // Check CHAMP
      const sf0 = bracketPicks["SF-0"];
      const sf1 = bracketPicks["SF-1"];
      if (sf0 === bracketId || sf1 === bracketId) {
        const champPick = bracketPicks["CHAMP"];
        if (champPick && champPick !== bracketId) return true;
      }
      return false;
    };

    // Check if a draft item is eliminated (for 13-16 group: eliminated only when ALL 4 seeds are out)
    const isTeamEliminated = (draftId) => {
      if (!draftId) return false;
      const region = draftId.split("-")[0];
      if (draftId.endsWith("-13-16")) {
        // Group: all 4 seeds must be eliminated
        for (let s = 13; s <= 16; s++) {
          if (!isBracketIdEliminated(seedToId(region, s))) return false;
        }
        return true;
      }
      return isBracketIdEliminated(draftId);
    };

    // Check if a specific seed within 13-16 is eliminated (for results page per-name strikethrough)
    const isSeedEliminated = (region, seed) => {
      return isBracketIdEliminated(seedToId(region, seed));
    };

    // Get the two teams competing in a matchup at a given key
    const getMatchupTeams = (region, round, idx) => {
      if (round === 1) {
        const [a, b] = R1[idx];
        const idA = `${region}-${a}`;
        const idB = `${region}-${b}`;
        return [idA, idB];
      }
      // For later rounds, look at who was picked in the previous round
      const prevA = bracketPicks[`${region}-R${round - 1}-${idx * 2}`];
      const prevB = bracketPicks[`${region}-R${round - 1}-${idx * 2 + 1}`];
      return [prevA || null, prevB || null];
    };

    // Clickable team slot — displaySeed overrides the seed number shown (for 13-16 group in R1)
    const ClickSlot = ({ teamId, pickKey, flip, isSelected, displaySeed }) => {
      const info = getTeamInfo(teamId);
      if (!teamId || !info) {
        return (
          <div style={{ ...S.bSlot, borderLeftColor: !flip ? "rgba(255,255,255,0.04)" : "transparent", borderRightColor: flip ? "rgba(255,255,255,0.04)" : "transparent", flexDirection: flip ? "row-reverse" : "row", opacity: 0.3 }}>
            <span style={{ ...S.bTeam, color: "#2a2e3a", fontStyle: "italic", fontSize: 10 }}>TBD</span>
          </div>
        );
      }
      // Determine specific seed number: from displaySeed prop (R1) or embedded in bracketId (later rounds)
      const embeddedSeed = toSeedNum(teamId);
      const seedNum = displaySeed || embeddedSeed || info.seed;
      // Show individual team name for 13-16 seeds
      let teamLabel = info.shortLabel;
      const specificSeed = displaySeed || embeddedSeed;
      if (specificSeed && specificSeed >= 13 && specificSeed <= 16 && info.seedNames && info.seedNames[specificSeed]) {
        teamLabel = info.seedNames[specificSeed];
      }
      const selected = isSelected;
      return (
        <div
          onClick={() => pickKey && !isViewer && pickBracketWinner(pickKey, teamId)}
          style={{
            ...S.bSlot,
            borderLeftColor: !flip ? (info.drafterColor || "rgba(255,255,255,0.08)") : "transparent",
            borderRightColor: flip ? (info.drafterColor || "rgba(255,255,255,0.08)") : "transparent",
            flexDirection: flip ? "row-reverse" : "row",
            textAlign: flip ? "right" : "left",
            cursor: pickKey && !isViewer ? "pointer" : "default",
            background: selected ? `${info.drafterColor}18` : "rgba(255,255,255,0.02)",
            outline: selected ? `1px solid ${info.drafterColor}50` : "none",
          }}>
          <span style={S.bSeed}>{seedNum}</span>
          <span style={{ ...S.bTeam, color: "#e8e6e1" }}>{teamLabel}</span>
          <span style={{ ...S.bOwner, color: info.drafterColor }}>{info.drafter}</span>
        </div>
      );
    };

    // Region bracket with clickable slots
    const RegionBracket = ({ region, flip }) => {
      const rc = REGION_COLORS[region];
      return (
        <div style={{ display: "flex", flexDirection: flip ? "row-reverse" : "row", alignItems: "stretch", gap: 0, flex: 1 }}>
          {/* Round 1 */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", minWidth: 0, flex: "1 1 0" }}>
            <div style={{ ...S.bRoundLabel, color: rc, textAlign: flip ? "right" : "left" }}>{region.toUpperCase()}</div>
            {R1.map(([a, b], i) => {
              const idA = seedToId(region, a);
              const idB = seedToId(region, b);
              const pickKey = `${region}-R1-${i}`;
              const picked = bracketPicks[pickKey];
              return (
                <div key={i} style={{ ...S.bMatchupBox, marginBottom: i < 7 ? 2 : 0 }}>
                  <ClickSlot teamId={idA} pickKey={pickKey} flip={flip} isSelected={picked === idA} displaySeed={a} />
                  <ClickSlot teamId={idB} pickKey={pickKey} flip={flip} isSelected={picked === idB} displaySeed={b} />
                </div>
              );
            })}
          </div>
          {/* Round 2 */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", minWidth: 0, flex: "0.85 1 0" }}>
            <div style={{ ...S.bRoundHeader, textAlign: flip ? "right" : "left" }}>R32</div>
            {[0,1,2,3].map((i) => {
              const [tA, tB] = [bracketPicks[`${region}-R1-${i*2}`], bracketPicks[`${region}-R1-${i*2+1}`]];
              const pickKey = `${region}-R2-${i}`;
              const picked = bracketPicks[pickKey];
              return (
                <div key={i} style={S.bMatchupBox}>
                  <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tA} />
                  <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tB} />
                </div>
              );
            })}
          </div>
          {/* Round 3 - Sweet 16 */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", minWidth: 0, flex: "0.75 1 0" }}>
            <div style={{ ...S.bRoundHeader, textAlign: flip ? "right" : "left" }}>S16</div>
            {[0,1].map((i) => {
              const [tA, tB] = [bracketPicks[`${region}-R2-${i*2}`], bracketPicks[`${region}-R2-${i*2+1}`]];
              const pickKey = `${region}-R3-${i}`;
              const picked = bracketPicks[pickKey];
              return (
                <div key={i} style={S.bMatchupBox}>
                  <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tA} />
                  <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tB} />
                </div>
              );
            })}
          </div>
          {/* Round 4 - Elite 8 */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, flex: "0.75 1 0" }}>
            <div style={{ ...S.bRoundHeader, textAlign: flip ? "right" : "left" }}>E8</div>
            {(() => {
              const [tA, tB] = [bracketPicks[`${region}-R3-0`], bracketPicks[`${region}-R3-1`]];
              const pickKey = `${region}-R4-0`;
              const picked = bracketPicks[pickKey];
              return (
                <div style={S.bMatchupBox}>
                  <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tA} />
                  <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={flip} isSelected={picked === tB} />
                </div>
              );
            })()}
          </div>
        </div>
      );
    };

    // Compute round winners for payouts
    const getRoundWinners = (round) => {
      const winners = [];
      if (round === 1) { REGIONS.forEach((r) => { for (let i = 0; i < 8; i++) { const w = bracketPicks[`${r}-R1-${i}`]; if (w) winners.push(w); } }); }
      else if (round === 2) { REGIONS.forEach((r) => { for (let i = 0; i < 4; i++) { const w = bracketPicks[`${r}-R2-${i}`]; if (w) winners.push(w); } }); }
      else if (round === 3) { REGIONS.forEach((r) => { for (let i = 0; i < 2; i++) { const w = bracketPicks[`${r}-R3-${i}`]; if (w) winners.push(w); } }); }
      else if (round === 4) { REGIONS.forEach((r) => { const w = bracketPicks[`${r}-R4-0`]; if (w) winners.push(w); }); }
      else if (round === 5) { ["SF-0", "SF-1"].forEach((k) => { const w = bracketPicks[k]; if (w) winners.push(w); }); }
      else if (round === 6) { const w = bracketPicks["CHAMP"]; if (w) winners.push(w); }
      return winners;
    };

    // Compute payouts per drafter AND per team
    const computePayouts = () => {
      const drafterPayouts = {};
      const teamPayouts = {}; // keyed by teamId
      drafters.forEach((d) => { drafterPayouts[d.name] = { total: 0, rounds: {} }; });
      // Initialize all teams
      drafters.forEach((d) => (d.items || []).forEach((item) => {
        teamPayouts[item.id] = { teamId: item.id, label: item.shortLabel, seed: item.seed, region: item.region, drafter: d.name, drafterColor: d.color, price: item.price, total: 0, rounds: {} };
      }));
      PAYOUT_ROUNDS.forEach((pr, ri) => {
        const roundNum = ri + 1;
        const roundPool = totalPot * pr.pct;
        const winners = getRoundWinners(roundNum);
        if (winners.length === 0) return;
        const perWinner = roundPool / pr.winners; // Fixed per-win amount based on payout structure
        winners.forEach((teamId) => {
          const draftId = toDraftId(teamId);
          const info = getTeamInfo(teamId);
          if (info && drafterPayouts[info.drafter]) {
            drafterPayouts[info.drafter].total += perWinner;
            if (!drafterPayouts[info.drafter].rounds[pr.name]) drafterPayouts[info.drafter].rounds[pr.name] = 0;
            drafterPayouts[info.drafter].rounds[pr.name] += perWinner;
          }
          if (teamPayouts[draftId]) {
            teamPayouts[draftId].total += perWinner;
            teamPayouts[draftId].rounds[pr.name] = (teamPayouts[draftId].rounds[pr.name] || 0) + perWinner;
          }
        });
      });
      return { drafterPayouts, teamPayouts };
    };
    const { drafterPayouts, teamPayouts } = computePayouts();

    return (
      <div style={S.page}><style>{globalCSS}</style>

        <div className="mm-header" style={S.header}>
          <span style={S.headerIcon}>🏆</span>
          <h1 style={S.headerTitle}>DRAFT COMPLETE</h1>
          {isLive && <span style={S.liveBadge}>{isHost ? `📡 ${roomCode}` : `👀 ${roomCode}`}</span>}
          <span style={{ ...S.headerBadge, background: "rgba(233,196,106,0.15)", color: "#E9C46A" }}>Pot: ${totalPot}</span>
          <div className="mm-header-actions" style={{ display: "flex", gap: 8 }}>
            <button style={S.copyBtn} onClick={copyResults}>{copied ? "✓ Copied!" : "📋 Copy"}</button>
            <button style={S.downloadBtn} onClick={downloadExcel}>📥 Excel</button>
            <button style={S.resetBtn} onClick={resetDraft}>🗑️ New Draft</button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="mm-done-tabs" style={S.doneTabBar}>
          {[{ key: "bracket", label: "🏆 BRACKET" }, { key: "list", label: "📋 RESULTS" }, { key: "payouts", label: "💰 PAYOUTS" }, { key: "stats", label: "📊 STATS" }].map((t) => (
            <button key={t.key}
              style={{ ...S.doneTabBtn, ...(doneTab === t.key ? S.doneTabBtnActive : {}) }}
              onClick={() => setDoneTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {/* BRACKET TAB */}
        {doneTab === "bracket" && (
          <div style={{ padding: "20px 16px", overflowX: "auto" }}>
            <p style={{ fontSize: 12, color: "#5a6478", marginBottom: 12, textAlign: "center" }}>Click a team to advance them through the bracket</p>
            <div className="mm-bracket-wrap" style={{ minWidth: 1100, display: "flex", flexDirection: "column", gap: 0 }}>

              {/* Top: East → FF → Midwest */}
              <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
                <RegionBracket region="East" flip={false} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 130, alignItems: "center", gap: 4, padding: "0 6px" }}>
                  <div style={S.bFinalLabel}>FINAL FOUR</div>
                  {(() => {
                    const tA = bracketPicks["East-R4-0"];
                    const tB = bracketPicks["Midwest-R4-0"];
                    const pickKey = "SF-0";
                    const picked = bracketPicks[pickKey];
                    return (
                      <div style={{ ...S.bMatchupBox, width: "100%" }}>
                        <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tA} />
                        <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tB} />
                      </div>
                    );
                  })()}
                </div>
                <RegionBracket region="Midwest" flip={true} />
              </div>

              {/* Championship */}
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={S.bChampLabel}>🏆 CHAMPIONSHIP</div>
                  {(() => {
                    const tA = bracketPicks["SF-0"];
                    const tB = bracketPicks["SF-1"];
                    const pickKey = "CHAMP";
                    const picked = bracketPicks[pickKey];
                    return (
                      <div style={{ ...S.bMatchupBox, minWidth: 220 }}>
                        <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tA} />
                        <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tB} />
                      </div>
                    );
                  })()}
                  {bracketPicks["CHAMP"] && (() => {
                    const info = getTeamInfo(bracketPicks["CHAMP"]);
                    return info ? <div style={{ ...S.bChampWinner, color: info.drafterColor }}>🏆 {info.shortLabel} — {info.drafter}</div> : null;
                  })()}
                </div>
              </div>

              {/* Bottom: South → FF → West */}
              <div style={{ display: "flex", gap: 0, alignItems: "stretch" }}>
                <RegionBracket region="South" flip={false} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 130, alignItems: "center", gap: 4, padding: "0 6px" }}>
                  <div style={S.bFinalLabel}>FINAL FOUR</div>
                  {(() => {
                    const tA = bracketPicks["South-R4-0"];
                    const tB = bracketPicks["West-R4-0"];
                    const pickKey = "SF-1";
                    const picked = bracketPicks[pickKey];
                    return (
                      <div style={{ ...S.bMatchupBox, width: "100%" }}>
                        <ClickSlot teamId={tA} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tA} />
                        <ClickSlot teamId={tB} pickKey={tA && tB ? pickKey : null} flip={false} isSelected={picked === tB} />
                      </div>
                    );
                  })()}
                </div>
                <RegionBracket region="West" flip={true} />
              </div>

              {/* Legend */}
              <div style={{ ...S.bracketLegend, marginTop: 20 }}>
                <h4 style={{ ...S.panelTitle, marginBottom: 8 }}>OWNERSHIP LEGEND</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  {drafters.map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: d.color }}></div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</span>
                      <span style={{ fontSize: 11, color: "#5a6478" }}>({(d.items || []).length} teams · ${totalSpent(d)})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PAYOUTS TAB */}
        {doneTab === "payouts" && (
          <div style={S.statsSection}>
            <div style={{ marginBottom: 20 }}>
              <h4 style={S.statsSubTitle}>PAYOUT STRUCTURE</h4>
              <div className="mm-payout-cards" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {PAYOUT_ROUNDS.map((pr, i) => {
                  const roundPool = totalPot * pr.pct;
                  const perWin = roundPool / pr.winners;
                  const cumulative = PAYOUT_ROUNDS.slice(0, i + 1).reduce((sum, r) => sum + (totalPot * r.pct) / r.winners, 0);
                  return (
                    <div key={i} style={{ ...S.statCard, flex: "1 1 140px", minWidth: 140 }}>
                      <div style={{ ...S.statValue, fontSize: 20 }}>{Math.round(pr.pct * 100)}%</div>
                      <div style={S.statLabel}>{pr.name.toUpperCase()}</div>
                      <div style={{ ...S.statDetail, color: "#4ADE80" }}>${roundPool.toFixed(0)} pool</div>
                      <div style={{ ...S.statDetail, color: "#E9C46A", marginTop: 2 }}>${perWin.toFixed(2)} per win</div>
                      <div style={{ ...S.statDetail, color: "#8b98b0", marginTop: 2 }}>${cumulative.toFixed(2)} cumulative</div>
                      <div style={{ fontSize: 10, color: "#3e4a5e", marginTop: 2 }}>{pr.winners} team{pr.winners > 1 ? "s" : ""}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...S.statCard, textAlign: "center", marginBottom: 20 }}>
                <div style={{ ...S.statValue, fontSize: 32, color: "#E9C46A" }}>${totalPot}</div>
                <div style={S.statLabel}>TOTAL POT</div>
              </div>
            </div>

            <h4 style={S.statsSubTitle}>PROJECTED PAYOUTS BY DRAFTER</h4>
            <p style={{ fontSize: 11, color: "#3e4a5e", marginBottom: 10 }}>Click a drafter row to see team-level breakdown</p>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div className="mm-stats-table" style={{ ...S.statsTable, minWidth: 700 }}>
              <div style={S.statsHeaderRow}>
                <span style={{ ...S.statsHeaderCell, flex: 1, textAlign: "left" }}>Drafter</span>
                <span style={S.statsHeaderCell}>Spent</span>
                {PAYOUT_ROUNDS.map((pr, i) => (
                  <span key={i} style={{ ...S.statsHeaderCell, width: 80 }}>{pr.name.split(" ").pop()}</span>
                ))}
                <span style={{ ...S.statsHeaderCell, width: 85 }}>Payout</span>
                <span style={{ ...S.statsHeaderCell, width: 80 }}>Profit</span>
              </div>
              {drafters.map((d) => {
                const p = drafterPayouts[d.name] || { total: 0, rounds: {} };
                const spent = totalSpent(d);
                const profit = p.total - spent;
                const isExpanded = expandedDrafter === d.name;
                const dTeams = Object.values(teamPayouts)
                  .filter((t) => t.drafter === d.name)
                  .sort((a, b) => {
                    const ri = REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region);
                    if (ri !== 0) return ri;
                    const sa = a.seed === "13-16" ? 13 : parseInt(a.seed);
                    const sb = b.seed === "13-16" ? 13 : parseInt(b.seed);
                    return sa - sb;
                  });
                return (
                  <div key={d.name}>
                    <div style={{ ...S.statsRow, cursor: "pointer", background: isExpanded ? `${d.color}08` : "transparent" }}
                      onClick={() => setExpandedDrafter(isExpanded ? null : d.name)}>
                      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#5a6478", width: 14, textAlign: "center", flexShrink: 0 }}>{isExpanded ? "▼" : "▶"}</span>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color }}></div>
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                        <span style={{ fontSize: 10, color: "#5a6478" }}>({dTeams.length})</span>
                      </span>
                      <span style={S.statsCell}>${spent}</span>
                      {PAYOUT_ROUNDS.map((pr, i) => (
                        <span key={i} style={{ ...S.statsCell, width: 80, color: (p.rounds[pr.name] || 0) > 0 ? "#4ADE80" : "#3e4a5e" }}>
                          ${(p.rounds[pr.name] || 0).toFixed(2)}
                        </span>
                      ))}
                      <span style={{ ...S.statsCell, width: 85, color: "#E9C46A", fontWeight: 700 }}>${p.total.toFixed(2)}</span>
                      <span style={{ ...S.statsCell, width: 80, color: profit >= 0 ? "#4ADE80" : "#E63946", fontWeight: 700 }}>{profit >= 0 ? "+" : ""}${profit.toFixed(2)}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ background: `${d.color}06`, borderLeft: `3px solid ${d.color}`, paddingLeft: 8 }}>
                        <div style={{ ...S.statsHeaderRow, background: "rgba(255,255,255,0.02)", padding: "6px 14px" }}>
                          <span style={{ ...S.statsHeaderCell, flex: 1, textAlign: "left", fontSize: 9 }}>Team</span>
                          <span style={{ ...S.statsHeaderCell, fontSize: 9 }}>Wins</span>
                          <span style={{ ...S.statsHeaderCell, fontSize: 9 }}>Cost</span>
                          {PAYOUT_ROUNDS.map((pr, i) => (
                            <span key={i} style={{ ...S.statsHeaderCell, width: 80, fontSize: 9 }}>{pr.name.split(" ").pop()}</span>
                          ))}
                          <span style={{ ...S.statsHeaderCell, width: 85, fontSize: 9 }}>Total</span>
                          <span style={{ ...S.statsHeaderCell, width: 80 }}></span>
                        </div>
                        {dTeams.map((t) => {
                          const wins = getTeamWins(t.teamId);
                          const eliminated = isTeamEliminated(t.teamId);
                          return (
                            <div key={t.teamId} style={{ ...S.statsRow, opacity: eliminated ? 0.45 : 1, padding: "6px 14px" }}>
                              <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                                <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: REGION_COLORS[t.region], flexShrink: 0 }}></div>
                                <span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[t.seed], fontSize: 9, padding: "1px 5px", textDecoration: eliminated ? "line-through" : "none" }}>{t.label}</span>
                              </span>
                              <span style={{ ...S.statsCell, color: wins > 0 ? "#4ADE80" : "#3e4a5e" }}>{wins}</span>
                              <span style={S.statsCell}>${t.price}</span>
                              {PAYOUT_ROUNDS.map((pr, i) => (
                                <span key={i} style={{ ...S.statsCell, width: 80, color: (t.rounds[pr.name] || 0) > 0 ? "#4ADE80" : "#3e4a5e", fontSize: 12 }}>
                                  ${(t.rounds[pr.name] || 0).toFixed(2)}
                                </span>
                              ))}
                              <span style={{ ...S.statsCell, width: 85, color: t.total > 0 ? "#E9C46A" : "#3e4a5e", fontWeight: 700 }}>${t.total.toFixed(2)}</span>
                              <span style={{ ...S.statsCell, width: 80 }}></span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>

            <p style={{ fontSize: 11, color: "#3e4a5e", marginTop: 12, fontStyle: "italic" }}>
              Payouts update as you fill in bracket winners. Pick all games to see final projections.
            </p>
          </div>
        )}

        {/* LIST TAB */}
        {doneTab === "list" && (
          <div style={S.resultsSection}>
            <div className="mm-results-grid" style={S.resultsGrid}>
              {drafters.map((d, i) => {
                const isDragOver = dragOverDrafter === i && dragItem && dragItem.drafterIdx !== i;
                return (
                  <div key={i} onDragOver={(e) => handleDragOver(e, i)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, i)}
                    style={{ ...S.resultCard, borderTop: `4px solid ${d.color}`, outline: isDragOver ? `2px dashed ${d.color}` : "none", background: isDragOver ? `${d.color}10` : S.resultCard.background }}>
                    <div style={S.resultHeader}>
                      <span style={S.resultName}>{d.name}</span>
                      <span style={{ ...S.resultSpent, color: d.color }}>${totalSpent(d)}</span>
                    </div>
                    {hasBudget && <div style={S.resultBudgetLeft}>${d.budget} remaining</div>}
                    {(d.items || []).length === 0 ? <p style={S.noItems}>{isDragOver ? "Drop here!" : "No teams yet"}</p> : (
                      <div style={S.resultItemList}>
                        {REGIONS.map((region) => {
                          const ri = (d.items || []).filter((item) => item.region === region);
                          if (!ri.length) return null;
                          // Sort seeds numerically
                          const sorted = [...ri].sort((a, b) => {
                            const sa = a.seed === "13-16" ? 13 : parseInt(a.seed);
                            const sb = b.seed === "13-16" ? 13 : parseInt(b.seed);
                            return sa - sb;
                          });
                          return (<div key={region}>
                            <div style={{ ...S.resultRegionLabel, color: REGION_COLORS[region] }}>{region}</div>
                            {sorted.map((item, j) => {
                              const gi = d.items.indexOf(item);
                              const isEditing = editingPrice && editingPrice.drafterIdx === i && editingPrice.itemIdx === gi;
                              const wins = getTeamWins(item.id);
                              const groupEliminated = isTeamEliminated(item.id);

                              // For 13-16 group, render individual seed rows
                              if (item.seed === "13-16") {
                                return [13, 14, 15, 16].map((s) => {
                                  const seedElim = isSeedEliminated(item.region, s);
                                  const seedName = (item.seedNames && item.seedNames[s]) ? item.seedNames[s] : `#${s}`;
                                  return (<div key={`${j}-${s}`} style={{ ...S.resultItem, opacity: seedElim ? 0.45 : 1, borderRadius: 5, padding: "3px 4px", marginLeft: -4, marginRight: -4 }}>
                                    <span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[s], textDecoration: seedElim ? "line-through" : "none" }}>{seedName}</span>
                                    {s === 13 && <span style={{ ...S.resultWins, color: wins > 0 ? "#4ADE80" : "#3e4a5e" }}>{wins}W</span>}
                                    {s === 13 && (isEditing ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                        <span style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700 }}>$</span>
                                        <input autoFocus style={S.editPriceInput} type="number" min={0} value={editPriceValue}
                                          onChange={(e) => setEditPriceValue(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === "Enter") confirmEditPrice(); if (e.key === "Escape") cancelEditPrice(); }}
                                          onBlur={confirmEditPrice} />
                                      </div>
                                    ) : (
                                      <span style={{ ...S.resultPrice, cursor: isViewer ? "default" : "pointer", textDecoration: groupEliminated ? "line-through" : "none" }}
                                        onClick={() => !isViewer && startEditPrice(i, gi, item.price)}>${item.price}</span>
                                    ))}
                                  </div>);
                                });
                              }

                              const eliminated = isTeamEliminated(item.id);
                              return (<div key={j} draggable={!isViewer} onDragStart={() => handleDragStart(i, gi, item)}
                                style={{ ...S.resultItem, cursor: isViewer ? "default" : "grab", opacity: dragItem && dragItem.drafterIdx === i && dragItem.itemIdx === gi ? 0.3 : eliminated ? 0.45 : 1, borderRadius: 5, padding: "3px 4px", marginLeft: -4, marginRight: -4 }}>
                                <span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[item.seed], textDecoration: eliminated ? "line-through" : "none" }}>{item.shortLabel}</span>
                                <span style={{ ...S.resultWins, color: wins > 0 ? "#4ADE80" : "#3e4a5e" }}>{wins}W</span>
                                {isEditing ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                    <span style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700 }}>$</span>
                                    <input autoFocus style={S.editPriceInput} type="number" min={0} value={editPriceValue}
                                      onChange={(e) => setEditPriceValue(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") confirmEditPrice(); if (e.key === "Escape") cancelEditPrice(); }}
                                      onBlur={confirmEditPrice} />
                                  </div>
                                ) : (
                                  <span style={{ ...S.resultPrice, cursor: isViewer ? "default" : "pointer", textDecoration: eliminated ? "line-through" : "none" }}
                                    onClick={() => !isViewer && startEditPrice(i, gi, item.price)}>${item.price}</span>
                                )}
                              </div>);
                            })}
                          </div>);
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Activity Log */}
            <div style={{ ...S.logContainer, marginTop: 20, maxHeight: 300 }}>
              <h4 style={S.logTitle}>ACTIVITY LOG</h4>
              <div ref={logRef} style={S.logScroll}>
                {log.map((entry, i) => (
                  <div key={i} style={{ ...S.logEntry, color: entry.startsWith("✅") ? "#4ADE80" : entry.startsWith("🏆") ? "#E9C46A" : "#8b98b0", fontWeight: entry.startsWith("✅") || entry.startsWith("🏆") ? 700 : 400 }}>{entry}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STATS TAB */}
        {doneTab === "stats" && (
          <div style={S.statsSection}>
            <div className="mm-stats-overview" style={S.statsOverview}>
              <div style={S.statCard}><div style={S.statValue}>${overallTotal}</div><div style={S.statLabel}>TOTAL SPENT</div></div>
              <div style={S.statCard}><div style={S.statValue}>${overallAvg}</div><div style={S.statLabel}>AVG BID</div></div>
              <div style={S.statCard}><div style={{ ...S.statValue, color: "#4ADE80" }}>${overallMax}</div><div style={S.statLabel}>HIGHEST BID</div>{maxPick && <div style={S.statDetail}>{maxPick.shortLabel} ({maxPick.region}) → {maxPick.drafter}</div>}</div>
              <div style={S.statCard}><div style={{ ...S.statValue, color: "#E9C46A" }}>${overallMin}</div><div style={S.statLabel}>LOWEST BID</div>{minPick && <div style={S.statDetail}>{minPick.shortLabel} ({minPick.region}) → {minPick.drafter}</div>}</div>
            </div>

            {/* By Seed */}
            <div style={S.statsTableContainer}>
              <h4 style={S.statsSubTitle}>BY SEED</h4>
              <div className="mm-stats-table" style={S.statsTable}>
                <div style={S.statsHeaderRow}><span style={{ ...S.statsHeaderCell, flex: 1 }}>Seed</span><span style={S.statsHeaderCell}>Picks</span><span style={S.statsHeaderCell}>Avg</span><span style={S.statsHeaderCell}>Max</span><span style={S.statsHeaderCell}>Min</span><span style={S.statsHeaderCell}>Total</span></div>
                {seedStats.map((s) => (<div key={s.seed} style={S.statsRow}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}><span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[s.seed] }}>{s.seed === "13-16" ? "13-16" : `#${s.seed}`}</span></span>
                  <span style={S.statsCell}>{s.count}</span><span style={S.statsCell}>${s.avg}</span><span style={{ ...S.statsCell, color: "#4ADE80" }}>${s.max}</span><span style={{ ...S.statsCell, color: "#E9C46A" }}>${s.min}</span><span style={S.statsCell}>${s.total}</span>
                </div>))}
              </div>
            </div>

            {/* By Region */}
            <div style={S.statsTableContainer}>
              <h4 style={S.statsSubTitle}>BY REGION</h4>
              <div className="mm-stats-table" style={S.statsTable}>
                <div style={S.statsHeaderRow}><span style={{ ...S.statsHeaderCell, flex: 1 }}>Region</span><span style={S.statsHeaderCell}>Picks</span><span style={S.statsHeaderCell}>Avg</span><span style={S.statsHeaderCell}>Max</span><span style={S.statsHeaderCell}>Min</span><span style={S.statsHeaderCell}>Total</span></div>
                {regionStats.map((r) => (<div key={r.region} style={S.statsRow}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: REGION_COLORS[r.region] }}></div><span style={{ fontWeight: 600 }}>{r.region}</span></span>
                  <span style={S.statsCell}>{r.count}</span><span style={S.statsCell}>${r.avg}</span><span style={{ ...S.statsCell, color: "#4ADE80" }}>${r.max}</span><span style={{ ...S.statsCell, color: "#E9C46A" }}>${r.min}</span><span style={S.statsCell}>${r.total}</span>
                </div>))}
              </div>
            </div>

            {/* By Drafter */}
            <div style={S.statsTableContainer}>
              <h4 style={S.statsSubTitle}>BY DRAFTER</h4>
              <div className="mm-stats-table" style={S.statsTable}>
                <div style={S.statsHeaderRow}><span style={{ ...S.statsHeaderCell, flex: 1 }}>Drafter</span><span style={S.statsHeaderCell}>Teams</span><span style={S.statsHeaderCell}>Avg</span><span style={S.statsHeaderCell}>Max</span><span style={S.statsHeaderCell}>Min</span><span style={S.statsHeaderCell}>Total</span></div>
                {drafterStats.map((d) => (<div key={d.name} style={S.statsRow}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: d.color }}></div><span style={{ fontWeight: 600 }}>{d.name}</span></span>
                  <span style={S.statsCell}>{d.count}</span><span style={S.statsCell}>${d.avg}</span><span style={{ ...S.statsCell, color: "#4ADE80" }}>${d.max}</span><span style={{ ...S.statsCell, color: "#E9C46A" }}>${d.min}</span><span style={S.statsCell}>${d.total}</span>
                </div>))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════
  // ── DRAFT PHASE ──
  // ══════════════════════════════════════════
  return (
    <div style={S.page}><style>{globalCSS}</style>

      <div className="mm-header" style={S.header}>
        <span style={S.headerIcon}>🏀</span>
        <h1 style={S.headerTitle}>MARCH MADNESS AUCTION</h1>
        {isLive && <span style={S.liveBadge}>{isHost ? `📡 HOSTING · ${roomCode}` : `👀 VIEWING · ${roomCode}`}</span>}
        <span style={S.headerBadge}>{`${totalLeft} left`}</span>
        {hasBudget && <span style={S.headerBadgeBudget}>${budgetAmount} budget</span>}
        {!isViewer && <span style={S.savedBadge}>💾 Auto-saved</span>}
      </div>

      {isViewer && (
        <div style={S.viewerBanner}><span style={{ fontSize: 16 }}>👀</span><span>You're watching live — results update automatically</span></div>
      )}

      <div className="mm-draft-layout" style={S.draftLayout}>
        {/* Left: Draft Order */}
        <div className="mm-draft-left" style={S.leftPanel}>
          <h3 style={S.panelTitle}>DRAFT ORDER</h3>
          <div className="mm-seed-list" style={S.seedList}>
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
        </div>

        {/* Center: Auction */}
        <div style={S.centerPanel}>
          {currentItem ? (
            <div style={S.auctionBlock}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={S.auctionLabel}>{isViewer ? "CURRENT AUCTION" : "RECORD RESULT"}</div>
                <span style={{ ...S.regionPill, backgroundColor: REGION_COLORS[currentItem.region] }}>{currentItem.region}</span>
              </div>
              <div className="mm-auction-seed" style={{ ...S.auctionSeed, backgroundColor: SEED_COLORS[currentItem.seed] }}>{currentItem.label}</div>

              {!isViewer && (<>
                <div style={S.fieldBlock}>
                  <label style={S.fieldLabel}>WHO WON?</label>
                  <div className="mm-winner-grid" style={S.winnerGrid}>
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
                    <input style={S.bidAmountInput} type="text"
                      placeholder="Amount" value={winningBid}
                      onChange={(e) => setWinningBid(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmSale()} />
                  </div>
                  {hasBudget && selectedWinner !== null && parseInt(winningBid) > drafters[selectedWinner].budget && winningBid.toUpperCase() !== "TEST" && (
                    <p style={S.errorHint}>Exceeds {drafters[selectedWinner].name}'s budget</p>
                  )}
                </div>
                <div style={S.auctionActions}>
                  <button style={{ ...S.soldBtn, opacity: (winningBid.toUpperCase() === "TEST") || (selectedWinner !== null && winningBid && parseInt(winningBid) >= 1 && (!hasBudget || parseInt(winningBid) <= drafters[selectedWinner]?.budget)) ? 1 : 0.3 }}
                    onClick={confirmSale} disabled={winningBid.toUpperCase() !== "TEST" && (selectedWinner === null || !winningBid || parseInt(winningBid) < 1 || (hasBudget && parseInt(winningBid) > (drafters[selectedWinner]?.budget || 0)))}>
                    🔨 CONFIRM SALE</button>
                  <button style={S.cancelBtn} onClick={cancelAuction}>Skip</button>
                </div>
              </>)}

              {isViewer && (
                <div style={S.viewerWaiting}><div style={S.spinner}></div><p style={{ color: "#8b98b0", marginTop: 10, fontSize: 14 }}>Waiting for host...</p></div>
              )}
            </div>
          ) : (
            <div style={S.waitingBlock}><div style={S.spinner}></div><p style={{ color: "#8b98b0", fontSize: 16, fontWeight: 600, marginTop: 12 }}>Loading draft...</p></div>
          )}
        </div>

        {/* Right: Activity Log */}
        <div className="mm-draft-right" style={S.rightPanel}>
          <h3 style={S.panelTitle}>ACTIVITY LOG</h3>
          <div ref={logRef} style={S.rightLogScroll}>
            {log.map((entry, i) => (
              <div key={i} style={{ ...S.logEntry, color: entry.startsWith("✅") ? "#4ADE80" : entry.startsWith("🏆") ? "#E9C46A" : "#8b98b0", fontWeight: entry.startsWith("✅") || entry.startsWith("🏆") ? 700 : 400 }}>{entry}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom: Results during draft */}
      <div style={S.resultsSection}>
        <h3 style={S.resultsSectionTitle}>📋 DRAFT RESULTS</h3>
        <div className="mm-results-grid" style={S.resultsGrid}>
          {drafters.map((d, i) => {
            const isDragOver = dragOverDrafter === i && dragItem && dragItem.drafterIdx !== i;
            return (
              <div key={i} onDragOver={(e) => handleDragOver(e, i)} onDragLeave={handleDragLeave} onDrop={(e) => handleDrop(e, i)}
                style={{ ...S.resultCard, borderTop: `4px solid ${d.color}`, outline: isDragOver ? `2px dashed ${d.color}` : "none", background: isDragOver ? `${d.color}10` : S.resultCard.background }}>
                <div style={S.resultHeader}>
                  <span style={S.resultName}>{d.name}</span>
                  <span style={{ ...S.resultSpent, color: d.color }}>${totalSpent(d)}</span>
                </div>
                {hasBudget && <div style={S.resultBudgetLeft}>${d.budget} remaining</div>}
                {(d.items || []).length === 0 ? <p style={S.noItems}>{isDragOver ? "Drop here!" : "No teams yet"}</p> : (
                  <div style={S.resultItemList}>
                    {REGIONS.map((region) => {
                      const ri = (d.items || []).filter((item) => item.region === region); if (!ri.length) return null;
                      return (<div key={region}>
                        <div style={{ ...S.resultRegionLabel, color: REGION_COLORS[region] }}>{region}</div>
                        {ri.map((item, j) => {
                          const gi = d.items.indexOf(item);
                          const isEditing = editingPrice && editingPrice.drafterIdx === i && editingPrice.itemIdx === gi;
                          return (<div key={j} draggable={!isViewer} onDragStart={() => handleDragStart(i, gi, item)}
                            style={{ ...S.resultItem, cursor: isViewer ? "default" : "grab", opacity: dragItem && dragItem.drafterIdx === i && dragItem.itemIdx === gi ? 0.3 : 1, borderRadius: 5, padding: "3px 4px", marginLeft: -4, marginRight: -4 }}>
                            <span style={{ ...S.resultSeedBadge, backgroundColor: SEED_COLORS[item.seed] }}>{item.shortLabel}</span>
                            {isEditing ? (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ color: "#4ADE80", fontSize: 13, fontWeight: 700 }}>$</span>
                                <input autoFocus style={S.editPriceInput} type="number" min={0} value={editPriceValue}
                                  onChange={(e) => setEditPriceValue(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") confirmEditPrice(); if (e.key === "Escape") cancelEditPrice(); }}
                                  onBlur={confirmEditPrice} />
                              </div>
                            ) : (
                              <span style={{ ...S.resultPrice, cursor: isViewer ? "default" : "pointer" }}
                                onClick={() => !isViewer && startEditPrice(i, gi, item.price)}>${item.price}</span>
                            )}
                          </div>);
                        })}
                      </div>);
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  input:focus, button:focus { outline: none; }
  button { -webkit-tap-highlight-color: transparent; }
  button:focus-visible { outline: none; }
  button:active { outline: none; }
  input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  ::selection { background: #E63946; color: #fff; }
  body { background: #0a0e17; }
  @keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slideDown { 0% { opacity: 0; max-height: 0; } 100% { opacity: 1; max-height: 80px; } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .mm-landing-cols, .mm-config-cols, .mm-config-start, .mm-setup-cols { grid-template-columns: 1fr !important; max-width: 100% !important; }
    .mm-draft-layout { grid-template-columns: 1fr !important; min-height: auto !important; }
    .mm-draft-left, .mm-draft-right { border-right: none !important; border-left: none !important; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .mm-draft-left .mm-seed-list { max-height: 200px !important; }
    .mm-header { flex-wrap: wrap; gap: 8px !important; padding: 10px 14px !important; }
    .mm-header h1 { font-size: 14px !important; letter-spacing: 2px !important; }
    .mm-winner-grid { grid-template-columns: 1fr !important; }
    .mm-results-grid { grid-template-columns: 1fr !important; }
    .mm-stats-overview { grid-template-columns: 1fr 1fr !important; }
    .mm-stats-table { font-size: 11px; }
    .mm-stats-table .mm-stats-cell { width: auto !important; min-width: 50px; font-size: 11px !important; }
    .mm-payout-cards { flex-direction: column !important; }
    .mm-payout-cards > div { min-width: 0 !important; }
    .mm-done-tabs { gap: 4px !important; }
    .mm-done-tabs button { font-size: 11px !important; padding: 8px 10px !important; letter-spacing: 1px !important; }
    .mm-bracket-wrap { min-width: 800px !important; }
    .mm-logo-title { font-size: 32px !important; letter-spacing: 3px !important; }
    .mm-logo-subtitle { font-size: 16px !important; letter-spacing: 5px !important; }
    .mm-auction-seed { font-size: 16px !important; padding: 8px 16px !important; }
  }
  @media (max-width: 480px) {
    .mm-stats-overview { grid-template-columns: 1fr !important; }
    .mm-header-actions { flex-wrap: wrap; gap: 6px !important; }
    .mm-header-actions button { font-size: 11px !important; padding: 6px 10px !important; }
    .mm-logo-title { font-size: 26px !important; }
  }
`;

const S = {
  page: { fontFamily: "'Source Sans 3', sans-serif", backgroundColor: "#0a0e17", color: "#e8e6e1", minHeight: "100vh" },
  setupContainer: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", background: "radial-gradient(ellipse at 50% 30%, #1a2340 0%, #0a0e17 70%)" },
  logoArea: { textAlign: "center", marginBottom: 28 },
  basketballIcon: { fontSize: 52, marginBottom: 6, filter: "drop-shadow(0 0 20px rgba(230,57,70,0.5))" },
  mainTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 46, fontWeight: 700, letterSpacing: 6, background: "linear-gradient(135deg, #E63946, #FF8200)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1 },
  subtitle: { fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 500, letterSpacing: 10, color: "#8b98b0", marginTop: 4 },
  tagline: { color: "#5a6478", marginTop: 10, fontSize: 13, letterSpacing: 1 },
  backBtn: { background: "transparent", border: "none", color: "#5a6478", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 12, display: "inline-block", padding: "6px 12px", borderRadius: 6 },
  resumeBanner: { width: "100%", maxWidth: 720, marginBottom: 16, padding: "16px 20px", borderRadius: 12, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
  resumeText: { display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: "#4ADE80" },
  resumeBtn: { padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, cursor: "pointer" },
  resumeDiscardBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "#5a6478", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  roomCodeBanner: { width: "100%", maxWidth: 720, marginBottom: 16, padding: "24px 20px", borderRadius: 14, background: "rgba(58,134,255,0.08)", border: "1px solid rgba(58,134,255,0.3)", textAlign: "center" },
  roomCodeLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 4, color: "#3A86FF", marginBottom: 8 },
  roomCodeDisplay: { fontFamily: "'Oswald', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: 12, color: "#fff", textShadow: "0 0 30px rgba(58,134,255,0.4)" },
  roomCodeHint: { color: "#5a6478", fontSize: 13, marginTop: 8 },
  roomCodeCopyBtn: { marginTop: 12, padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(58,134,255,0.3)", background: "rgba(58,134,255,0.12)", color: "#3A86FF", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  roomCodeBannerInline: { display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 10, background: "rgba(58,134,255,0.08)", border: "1px solid rgba(58,134,255,0.25)", justifyContent: "center", flexWrap: "wrap" },
  joinBtn: { padding: "12px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #3A86FF, #023E8A)", color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, cursor: "pointer" },
  setupColumns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 720 },
  setupCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "22px 20px", backdropFilter: "blur(12px)" },
  cardTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: 3, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: "#5a6478", marginBottom: 14 },
  nameList: { display: "flex", flexDirection: "column", gap: 7 },
  nameRow: { display: "flex", alignItems: "center", gap: 8 },
  nameNumber: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  seedTag: { padding: "3px 8px", borderRadius: 5, color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 10, letterSpacing: 1, flexShrink: 0, textAlign: "center", minWidth: 38 },
  nameInput: { flex: 1, padding: "9px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#e8e6e1", fontSize: 14, fontFamily: "'Source Sans 3', sans-serif", minHeight: 40 },
  removeBtn: { width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(230,57,70,0.2)", color: "#E63946", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0 },
  addBtn: { marginTop: 8, padding: "7px 0", width: "100%", borderRadius: 7, border: "1px dashed rgba(255,255,255,0.15)", background: "transparent", color: "#5a6478", cursor: "pointer", fontSize: 12, fontWeight: 600 },
  regionTabs: { display: "flex", gap: 0, marginBottom: 10 },
  regionTab: { flex: 1, padding: "8px 4px", background: "transparent", border: "none", borderBottom: "3px solid", fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 2, cursor: "pointer" },
  seedNameScroll: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" },
  settingBlock: { marginBottom: 16 },
  settingLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3, color: "#5a6478", display: "block", marginBottom: 10 },
  toggleRow: { display: "flex", gap: 8 },
  toggleBtn: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "12px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "#5a6478", cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", fontSize: 13, fontWeight: 600 },
  toggleBtnActive: { background: "rgba(230,57,70,0.12)", borderColor: "rgba(230,57,70,0.4)", color: "#E63946", boxShadow: "0 0 12px rgba(230,57,70,0.15)" },
  toggleIcon: { fontSize: 20 },
  budgetInputRow: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 },
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
  // Layout
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
  centerPanel: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 },
  auctionBlock: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 22 },
  auctionLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 4, color: "#E63946" },
  regionPill: { padding: "3px 10px", borderRadius: 12, color: "#fff", fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 2 },
  auctionSeed: { display: "inline-block", padding: "12px 28px", borderRadius: 10, color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2, marginBottom: 20 },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3, color: "#5a6478", display: "block", marginBottom: 8 },
  winnerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  winnerBtn: { display: "flex", alignItems: "center", gap: 8, padding: "11px 12px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontFamily: "'Source Sans 3', sans-serif", minHeight: 44 },
  winnerDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  winnerName: { fontSize: 13, fontWeight: 600, flex: 1 },
  winnerBudget: { fontSize: 11, color: "#5a6478" },
  bidInputRow: { display: "flex", alignItems: "center", gap: 8 },
  bidDollar: { fontFamily: "'Oswald', sans-serif", fontSize: 26, fontWeight: 700, color: "#4ADE80" },
  bidAmountInput: { padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 22, fontFamily: "'Oswald', sans-serif", fontWeight: 700, width: 150 },
  errorHint: { fontSize: 12, color: "#E63946", marginTop: 6 },
  auctionActions: { display: "flex", gap: 10, marginTop: 4 },
  soldBtn: { flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 3, cursor: "pointer" },
  cancelBtn: { padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#5a6478", fontWeight: 600, fontSize: 13, cursor: "pointer" },
  viewerWaiting: { display: "flex", flexDirection: "column", alignItems: "center", padding: "30px 0" },
  waitingBlock: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 50, background: "rgba(255,255,255,0.02)", borderRadius: 14 },
  rightPanel: { padding: "16px 14px", borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)", overflowY: "auto", display: "flex", flexDirection: "column" },
  rightLogScroll: { flex: 1, overflowY: "auto", maxHeight: "calc(100vh - 160px)" },
  logContainer: { background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, flex: 1, minHeight: 120, display: "flex", flexDirection: "column" },
  logTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 3, color: "#5a6478", marginBottom: 8 },
  logScroll: { flex: 1, overflowY: "auto", maxHeight: 250 },
  logEntry: { fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" },
  // Results
  resultsSection: { padding: "28px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" },
  resultsSectionTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: 4, marginBottom: 18 },
  copyBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  downloadBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(58,134,255,0.3)", background: "rgba(58,134,255,0.08)", color: "#3A86FF", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  resetBtn: { padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(230,57,70,0.3)", background: "rgba(230,57,70,0.08)", color: "#E63946", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer" },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  resultCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 14, transition: "all 0.15s ease" },
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
  resultWins: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 11, minWidth: 24, textAlign: "center", flexShrink: 0 },
  editPriceInput: { width: 60, padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(74,222,128,0.4)", background: "rgba(74,222,128,0.1)", color: "#4ADE80", fontSize: 13, fontFamily: "'Oswald', sans-serif", fontWeight: 700, textAlign: "right" },
  // Done page tabs
  doneTabBar: { display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" },
  doneTabBtn: { flex: 1, padding: "14px 0", background: "transparent", border: "none", borderBottom: "3px solid transparent", fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600, letterSpacing: 3, color: "#5a6478", cursor: "pointer", transition: "all 0.15s", WebkitTapHighlightColor: "transparent", outline: "none" },
  doneTabBtnActive: { color: "#E63946", borderBottomColor: "#E63946", background: "rgba(230,57,70,0.05)" },
  // Bracket
  bSlot: { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderLeft: "3px solid transparent", borderRight: "3px solid transparent", background: "rgba(255,255,255,0.02)", minHeight: 26 },
  bSeed: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700, color: "#5a6478", width: 18, textAlign: "center", flexShrink: 0 },
  bTeam: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  bOwner: { fontFamily: "'Source Sans 3', sans-serif", fontSize: 9, fontWeight: 700, flexShrink: 0 },
  bMatchupBox: { background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 4, overflow: "hidden", marginBottom: 2 },
  bRoundLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 3, marginBottom: 6, padding: "0 4px" },
  bRoundHeader: { fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 2, color: "#3e4a5e", marginBottom: 6, padding: "0 4px" },
  bFinalLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: 3, color: "#E9C46A", marginBottom: 4 },
  bChampLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: 4, color: "#E9C46A", marginBottom: 8 },
  bChampWinner: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 3, color: "#3e4a5e", marginTop: 6 },
  bracketLegend: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "16px 20px" },
  // Stats
  statsSection: { padding: "28px 24px" },
  statsOverview: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 },
  statCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "16px 14px", textAlign: "center" },
  statValue: { fontFamily: "'Oswald', sans-serif", fontSize: 28, fontWeight: 700, color: "#e8e6e1", letterSpacing: 1 },
  statLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 3, color: "#5a6478", marginTop: 4 },
  statDetail: { fontSize: 11, color: "#8b98b0", marginTop: 6, fontWeight: 600 },
  statsTableContainer: { marginBottom: 20 },
  statsSubTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: 3, color: "#8b98b0", marginBottom: 10 },
  statsTable: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", minWidth: 0 },
  statsHeaderRow: { display: "flex", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" },
  statsHeaderCell: { fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 2, color: "#5a6478", width: 70, textAlign: "right", flexShrink: 0 },
  statsRow: { display: "flex", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.03)" },
  statsCell: { fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600, color: "#e8e6e1", width: 70, textAlign: "right", flexShrink: 0 },
  budgetBar: { height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
};

