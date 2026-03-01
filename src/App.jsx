import { useState, useRef, useEffect } from "react";

const REGIONS = ["East", "West", "South", "Midwest"];

const REGION_COLORS = {
  East: "#3A86FF",
  West: "#E63946",
  South: "#2A9D8F",
  Midwest: "#F4A261",
};

const SEED_COLORS = {
  1: "#C41E3A", 2: "#1D428A", 3: "#00843D", 4: "#FF8200",
  5: "#4B2E83", 6: "#CC0033", 7: "#003087", 8: "#8C1D40",
  9: "#FFC72C", 10: "#006747", 11: "#B3A369", 12: "#BA0C2F",
  "13-16": "#555",
};

const COLORS = [
  "#E63946", "#457B9D", "#2A9D8F", "#E9C46A", "#F4A261",
  "#264653", "#6A0572", "#D62828", "#023E8A", "#0077B6",
  "#8338EC", "#FF006E", "#3A86FF", "#FB5607", "#FFBE0B",
];

const SAVE_KEY = "mm-auction-draft-save";

const buildDefaultSeedNames = () => {
  const names = {};
  REGIONS.forEach((r) => {
    for (let s = 1; s <= 12; s++) names[`${r}-${s}`] = "";
    names[`${r}-13-16`] = "";
  });
  return names;
};

const buildItems = (seedNames) => {
  const list = [];
  REGIONS.forEach((region) => {
    for (let s = 1; s <= 12; s++) {
      const name = seedNames[`${region}-${s}`]?.trim();
      list.push({
        id: `${region}-${s}`, seed: s, region,
        label: name ? `#${s} ${name}` : `#${s} Seed`,
        shortLabel: name || `#${s}`,
        type: "single",
      });
    }
    const groupName = seedNames[`${region}-13-16`]?.trim();
    list.push({
      id: `${region}-13-16`, seed: "13-16", region,
      label: groupName ? `13-16 ${groupName}` : "13-16 Seeds",
      shortLabel: groupName || "13-16",
      type: "group",
    });
  });
  return list;
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Save / Load helpers ──
const saveDraft = (state) => {
  try {
    // Replace Infinity with null for JSON
    const toSave = {
      ...state,
      drafters: state.drafters.map((d) => ({
        ...d,
        budget: d.budget === Infinity ? null : d.budget,
      })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
  } catch (e) { /* silent */ }
};

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Restore Infinity
    data.drafters = data.drafters.map((d) => ({
      ...d,
      budget: d.budget === null ? Infinity : d.budget,
    }));
    return data;
  } catch (e) { return null; }
};

const clearSave = () => {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* silent */ }
};

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
  const logRef = useRef(null);

  // Check for saved draft on mount
  useEffect(() => {
    const saved = loadDraft();
    if (saved && (saved.phase === "draft" || saved.phase === "done")) {
      setHasSavedDraft(true);
    }
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const hasBudget = budgetMode === "capped";

  // ── Auto-save after state changes during draft ──
  const doSave = (overrides = {}) => {
    const state = {
      phase: overrides.phase ?? phase,
      drafters: overrides.drafters ?? drafters,
      availableItems: overrides.availableItems ?? availableItems,
      draftOrder: overrides.draftOrder ?? draftOrder,
      draftIndex: overrides.draftIndex ?? draftIndex,
      currentItem: overrides.currentItem ?? currentItem,
      log: overrides.log ?? log,
      budgetMode,
      budgetAmount,
    };
    saveDraft(state);
  };

  const resumeDraft = () => {
    const saved = loadDraft();
    if (!saved) return;
    setPhase(saved.phase);
    setDrafters(saved.drafters);
    setAvailableItems(saved.availableItems);
    setDraftOrder(saved.draftOrder);
    setDraftIndex(saved.draftIndex);
    setCurrentItem(saved.currentItem);
    setLog(saved.log);
    setBudgetMode(saved.budgetMode);
    setBudgetAmount(saved.budgetAmount);
    if (saved.phase === "done") setShowConfetti(true);
  };

  const startFresh = () => {
    clearSave();
    setHasSavedDraft(false);
  };

  const startDraft = () => {
    const names = drafterNames.filter((n) => n.trim());
    if (names.length < 2) return;
    const d = names.map((name, i) => ({
      name, budget: hasBudget ? budgetAmount : Infinity,
      items: [], color: COLORS[i % COLORS.length],
    }));
    const builtItems = buildItems(seedNames);
    const shuffled = shuffle(builtItems);
    const initLog = [
      hasBudget
        ? `🏀 Draft started! ${names.length} drafters · $${budgetAmount} budget · ${builtItems.length} items`
        : `🏀 Draft started! ${names.length} drafters · No bid limits · ${builtItems.length} items`,
      `📢 [${shuffled[0].region}] ${shuffled[0].label} is up! (1 of ${shuffled.length})`,
    ];
    setDrafters(d);
    setAvailableItems(builtItems);
    setDraftOrder(shuffled);
    setDraftIndex(0);
    setCurrentItem(shuffled[0]);
    setPhase("draft");
    setLog(initLog);
    saveDraft({
      phase: "draft", drafters: d, availableItems: builtItems,
      draftOrder: shuffled, draftIndex: 0, currentItem: shuffled[0], log: initLog,
      budgetMode, budgetAmount,
    });
  };

  const addDrafter = () => { if (drafterNames.length < 15) setDrafterNames([...drafterNames, ""]); };
  const removeDrafter = (idx) => { if (drafterNames.length > 2) setDrafterNames(drafterNames.filter((_, i) => i !== idx)); };

  const advanceToNext = (nextIndex, currentDraftOrder, updatedAvailable, logArr, updatedDrafters) => {
    if (nextIndex >= currentDraftOrder.length) {
      setPhase("done");
      setShowConfetti(true);
      setCurrentItem(null);
      const doneLog = [...logArr, "🏆 ALL ITEMS DRAFTED! The auction is complete!"];
      setLog(doneLog);
      saveDraft({
        phase: "done", drafters: updatedDrafters, availableItems: updatedAvailable,
        draftOrder: currentDraftOrder, draftIndex: nextIndex, currentItem: null, log: doneLog,
        budgetMode, budgetAmount,
      });
      return;
    }
    const next = currentDraftOrder[nextIndex];
    setCurrentItem(next);
    setDraftIndex(nextIndex);
    setSelectedWinner(null);
    setWinningBid("");
    const nextLog = [...logArr, `📢 [${next.region}] ${next.label} is up! (${nextIndex + 1} of ${currentDraftOrder.length})`];
    setLog(nextLog);
    saveDraft({
      phase: "draft", drafters: updatedDrafters, availableItems: updatedAvailable,
      draftOrder: currentDraftOrder, draftIndex: nextIndex, currentItem: next, log: nextLog,
      budgetMode, budgetAmount,
    });
  };

  const confirmSale = () => {
    const amount = parseInt(winningBid);
    if (selectedWinner === null || isNaN(amount) || amount < 1) return;
    if (hasBudget && amount > drafters[selectedWinner].budget) return;
    const winner = drafters[selectedWinner];
    const updatedDrafters = drafters.map((d, i) =>
      i === selectedWinner
        ? { ...d, budget: hasBudget ? d.budget - amount : d.budget, items: [...d.items, { ...currentItem, price: amount }] }
        : d
    );
    const updatedAvailable = availableItems.filter((item) => item.id !== currentItem.id);
    setDrafters(updatedDrafters);
    setAvailableItems(updatedAvailable);
    const saleLog = [...log, `✅ [${currentItem.region}] ${currentItem.label} → ${winner.name} for $${amount}!`];
    setLog(saleLog);
    advanceToNext(draftIndex + 1, draftOrder, updatedAvailable, saleLog, updatedDrafters);
  };

  const cancelAuction = () => {
    const cancelLog = [...log, `⏭️ ${currentItem.label} returned — no sale.`];
    const newOrder = [...draftOrder];
    const removed = newOrder.splice(draftIndex, 1)[0];
    newOrder.push(removed);
    setDraftOrder(newOrder);
    setLog(cancelLog);
    if (draftIndex >= newOrder.length) {
      advanceToNext(0, newOrder, availableItems, cancelLog, drafters);
    } else {
      const next = newOrder[draftIndex];
      setCurrentItem(next);
      setSelectedWinner(null);
      setWinningBid("");
      const nextLog = [...cancelLog, `📢 [${next.region}] ${next.label} is up! (${draftIndex + 1} of ${newOrder.length})`];
      setLog(nextLog);
      saveDraft({
        phase: "draft", drafters, availableItems,
        draftOrder: newOrder, draftIndex, currentItem: next, log: nextLog,
        budgetMode, budgetAmount,
      });
    }
  };

  // ── Copy results to clipboard ──
  const copyResults = () => {
    let text = "🏀 MARCH MADNESS AUCTION DRAFT RESULTS\n";
    text += "═".repeat(40) + "\n\n";
    drafters.forEach((d) => {
      text += `${d.name} — $${totalSpent(d)} spent`;
      if (hasBudget) text += ` ($${d.budget} remaining)`;
      text += "\n";
      REGIONS.forEach((region) => {
        const items = d.items.filter((item) => item.region === region);
        if (items.length > 0) {
          text += `  ${region}:\n`;
          items.forEach((item) => {
            text += `    ${item.shortLabel} — $${item.price}\n`;
          });
        }
      });
      text += "\n";
    });
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const resetDraft = () => {
    clearSave();
    setPhase("setup");
    setDrafters([]);
    setAvailableItems([]);
    setDraftOrder([]);
    setDraftIndex(0);
    setCurrentItem(null);
    setLog([]);
    setShowConfetti(false);
    setHasSavedDraft(false);
  };

  const Confetti = () => {
    const particles = Array.from({ length: 80 }, (_, i) => ({
      id: i, left: Math.random() * 100, delay: Math.random() * 2,
      duration: 2 + Math.random() * 2, color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 8,
    }));
    return (
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9999 }}>
        {particles.map((p) => (
          <div key={p.id} style={{
            position: "absolute", top: -20, left: `${p.left}%`,
            width: p.size, height: p.size, backgroundColor: p.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }} />
        ))}
      </div>
    );
  };

  const totalSpent = (d) => d.items.reduce((s, item) => s + item.price, 0);
  const seedKeys = [...Array.from({ length: 12 }, (_, i) => i + 1), "13-16"];
  const regionAvailable = (region) => availableItems.filter((item) => item.region === region);
  const totalLeft = availableItems.length;

  // ── SETUP ──
  if (phase === "setup") {
    return (
      <div style={styles.page}>
        <style>{globalCSS}</style>
        <div style={styles.setupContainer}>
          <div style={styles.logoArea}>
            <div style={styles.basketballIcon}>🏀</div>
            <h1 style={styles.mainTitle}>MARCH MADNESS</h1>
            <h2 style={styles.subtitle}>AUCTION DRAFT</h2>
            <p style={styles.tagline}>4 Regions · Seeds 1–12 individual · Seeds 13–16 grouped · 52 total items</p>
          </div>

          {/* Resume saved draft banner */}
          {hasSavedDraft && (
            <div style={styles.resumeBanner}>
              <div style={styles.resumeText}>
                <span style={{ fontSize: 20 }}>💾</span>
                <span>You have a draft in progress!</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={styles.resumeBtn} onClick={resumeDraft}>Resume Draft</button>
                <button style={styles.resumeDiscardBtn} onClick={startFresh}>Discard</button>
              </div>
            </div>
          )}

          <div style={styles.setupColumns}>
            {/* Left: Drafters */}
            <div style={styles.setupCard}>
              <h3 style={styles.cardTitle}>DRAFTERS</h3>
              <p style={styles.cardSubtitle}>{drafterNames.length} / 15</p>
              <div style={styles.nameList}>
                {drafterNames.map((name, i) => (
                  <div key={i} style={styles.nameRow}>
                    <div style={{ ...styles.nameNumber, backgroundColor: COLORS[i % COLORS.length] }}>{i + 1}</div>
                    <input
                      style={styles.nameInput}
                      placeholder={`Drafter ${i + 1}`}
                      value={name}
                      onChange={(e) => { const u = [...drafterNames]; u[i] = e.target.value; setDrafterNames(u); }}
                      onKeyDown={(e) => e.key === "Enter" && i === drafterNames.length - 1 && addDrafter()}
                    />
                    {drafterNames.length > 2 && (
                      <button style={styles.removeBtn} onClick={() => removeDrafter(i)}>✕</button>
                    )}
                  </div>
                ))}
              </div>
              {drafterNames.length < 15 && (
                <button style={styles.addBtn} onClick={addDrafter}>+ Add Drafter</button>
              )}
            </div>

            {/* Right: Seed Names */}
            <div style={styles.setupCard}>
              <h3 style={styles.cardTitle}>SEED NAMES</h3>
              <p style={styles.cardSubtitle}>Optional — name each team per region</p>
              <div style={styles.regionTabs}>
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    style={{
                      ...styles.regionTab,
                      borderBottomColor: setupSeedTab === r ? REGION_COLORS[r] : "transparent",
                      color: setupSeedTab === r ? REGION_COLORS[r] : "#5a6478",
                    }}
                    onClick={() => setSetupSeedTab(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div style={styles.seedNameScroll}>
                {seedKeys.map((key) => {
                  const fullKey = `${setupSeedTab}-${key}`;
                  return (
                    <div key={fullKey} style={styles.nameRow}>
                      <div style={{ ...styles.seedTag, backgroundColor: SEED_COLORS[key] }}>
                        {key === "13-16" ? "13-16" : `#${key}`}
                      </div>
                      <input
                        style={styles.nameInput}
                        placeholder={key === "13-16" ? "Group name" : `Seed ${key} team`}
                        value={seedNames[fullKey]}
                        onChange={(e) => setSeedNames({ ...seedNames, [fullKey]: e.target.value })}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Settings */}
          <div style={{ ...styles.setupCard, maxWidth: 720, marginTop: 20 }}>
            <div style={styles.settingBlock}>
              <span style={styles.settingLabel}>BID LIMIT</span>
              <div style={styles.toggleRow}>
                <button
                  style={{ ...styles.toggleBtn, ...(budgetMode === "unlimited" ? styles.toggleBtnActive : {}) }}
                  onClick={() => setBudgetMode("unlimited")}
                >
                  <span style={styles.toggleIcon}>♾️</span><span>No Limit</span>
                </button>
                <button
                  style={{ ...styles.toggleBtn, ...(budgetMode === "capped" ? styles.toggleBtnActive : {}) }}
                  onClick={() => setBudgetMode("capped")}
                >
                  <span style={styles.toggleIcon}>💰</span><span>Set Max Budget</span>
                </button>
              </div>
              {budgetMode === "capped" && (
                <div style={styles.budgetInputRow}>
                  <span style={styles.budgetDollar}>$</span>
                  <input
                    style={styles.budgetInputField}
                    type="number" min={10} value={budgetAmount}
                    onChange={(e) => { const v = parseInt(e.target.value); if (!isNaN(v) && v > 0) setBudgetAmount(v); }}
                  />
                  <span style={styles.budgetPerDrafter}>per drafter</span>
                </div>
              )}
              <p style={styles.settingHint}>
                {budgetMode === "unlimited"
                  ? "Drafters can bid any amount — no spending cap."
                  : `Each drafter gets $${budgetAmount} to spend across all 52 items.`}
              </p>
            </div>
            <button
              style={{ ...styles.startBtn, opacity: drafterNames.filter((n) => n.trim()).length >= 2 ? 1 : 0.4 }}
              onClick={startDraft}
              disabled={drafterNames.filter((n) => n.trim()).length < 2}
            >
              START THE DRAFT 🏀
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── DRAFT / DONE ──
  return (
    <div style={styles.page}>
      <style>{globalCSS}</style>
      {showConfetti && <Confetti />}

      <div style={styles.header}>
        <span style={styles.headerIcon}>🏀</span>
        <h1 style={styles.headerTitle}>MARCH MADNESS AUCTION</h1>
        <span style={styles.headerBadge}>
          {phase === "done" ? "COMPLETE" : `${totalLeft} left`}
        </span>
        {hasBudget && <span style={styles.headerBadgeBudget}>${budgetAmount} budget</span>}
        <span style={styles.savedBadge}>💾 Auto-saved</span>
      </div>

      <div style={styles.draftLayout}>
        {/* Left: Draft Order Queue */}
        <div style={styles.leftPanel}>
          <h3 style={styles.panelTitle}>DRAFT ORDER</h3>

          {phase === "done" ? (
            <div style={styles.doneMessage}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🏆</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>DONE!</p>
            </div>
          ) : (
            <div style={styles.seedList}>
              {draftOrder.slice(draftIndex).map((item, idx) => {
                const isCurrent = idx === 0;
                const drafted = !availableItems.find((a) => a.id === item.id);
                if (drafted && !isCurrent) return null;
                return (
                  <div
                    key={item.id}
                    style={{
                      ...styles.queueItem,
                      backgroundColor: isCurrent ? SEED_COLORS[item.seed] : "rgba(255,255,255,0.03)",
                      borderLeft: `3px solid ${REGION_COLORS[item.region]}`,
                      opacity: isCurrent ? 1 : 0.5,
                      transform: isCurrent ? "scale(1.03)" : "scale(1)",
                      boxShadow: isCurrent ? `0 0 14px ${SEED_COLORS[item.seed]}50` : "none",
                    }}
                  >
                    <span style={{
                      ...styles.queueRegion,
                      color: isCurrent ? "#fff" : REGION_COLORS[item.region],
                    }}>{item.region}</span>
                    <span style={{
                      ...styles.queueLabel,
                      color: isCurrent ? "#fff" : "#8b98b0",
                    }}>{item.label}</span>
                    {isCurrent && <span style={styles.queueNow}>NOW</span>}
                    {!isCurrent && <span style={styles.queueIdx}>#{draftIndex + idx + 1}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Region progress */}
          {phase !== "done" && (
            <div style={{ marginTop: 16 }}>
              <h3 style={styles.panelTitle}>REGION PROGRESS</h3>
              {REGIONS.map((r) => {
                const total = 13;
                const left = regionAvailable(r).length;
                const done = total - left;
                return (
                  <div key={r} style={{ marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: REGION_COLORS[r] }}></div>
                      <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>{r}</span>
                      <span style={{ fontSize: 10, color: "#5a6478" }}>{done}/{total}</span>
                    </div>
                    <div style={styles.budgetBar}>
                      <div style={{ ...styles.budgetFill, width: `${(done / total) * 100}%`, backgroundColor: REGION_COLORS[r] }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Center: Record Result */}
        <div style={styles.centerPanel}>
          {currentItem ? (
            <div style={styles.auctionBlock}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={styles.auctionLabel}>RECORD RESULT</div>
                <span style={{ ...styles.regionPill, backgroundColor: REGION_COLORS[currentItem.region] }}>
                  {currentItem.region}
                </span>
              </div>
              <div style={{ ...styles.auctionSeed, backgroundColor: SEED_COLORS[currentItem.seed] }}>
                {currentItem.label}
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>WHO WON?</label>
                <div style={styles.winnerGrid}>
                  {drafters.map((d, i) => {
                    const isSelected = selectedWinner === i;
                    const cantAfford = hasBudget && d.budget < 1;
                    return (
                      <button
                        key={i} disabled={cantAfford}
                        style={{
                          ...styles.winnerBtn,
                          borderColor: isSelected ? d.color : "rgba(255,255,255,0.08)",
                          background: isSelected ? `${d.color}20` : "rgba(255,255,255,0.03)",
                          color: isSelected ? d.color : cantAfford ? "#2a2e3a" : "#8b98b0",
                          boxShadow: isSelected ? `0 0 12px ${d.color}30` : "none",
                          cursor: cantAfford ? "default" : "pointer",
                        }}
                        onClick={() => !cantAfford && setSelectedWinner(i)}
                      >
                        <div style={{ ...styles.winnerDot, backgroundColor: d.color, opacity: cantAfford ? 0.2 : 1 }}></div>
                        <span style={styles.winnerName}>{d.name}</span>
                        {hasBudget && <span style={styles.winnerBudget}>${d.budget}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={styles.fieldBlock}>
                <label style={styles.fieldLabel}>WINNING BID</label>
                <div style={styles.bidInputRow}>
                  <span style={styles.bidDollar}>$</span>
                  <input
                    style={styles.bidAmountInput}
                    type="number" min={1}
                    max={hasBudget && selectedWinner !== null ? drafters[selectedWinner].budget : undefined}
                    placeholder="Amount"
                    value={winningBid}
                    onChange={(e) => setWinningBid(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmSale()}
                  />
                </div>
                {hasBudget && selectedWinner !== null && parseInt(winningBid) > drafters[selectedWinner].budget && (
                  <p style={styles.errorHint}>Exceeds {drafters[selectedWinner].name}'s budget of ${drafters[selectedWinner].budget}</p>
                )}
              </div>

              <div style={styles.auctionActions}>
                <button
                  style={{
                    ...styles.soldBtn,
                    opacity: selectedWinner !== null && winningBid && parseInt(winningBid) >= 1
                      && (!hasBudget || parseInt(winningBid) <= drafters[selectedWinner]?.budget) ? 1 : 0.3,
                  }}
                  onClick={confirmSale}
                  disabled={
                    selectedWinner === null || !winningBid || parseInt(winningBid) < 1
                    || (hasBudget && parseInt(winningBid) > (drafters[selectedWinner]?.budget || 0))
                  }
                >
                  🔨 CONFIRM SALE
                </button>
                <button style={styles.cancelBtn} onClick={cancelAuction}>Skip</button>
              </div>
            </div>
          ) : phase !== "done" ? (
            <div style={styles.waitingBlock}>
              <div style={styles.spinner}></div>
              <p style={{ color: "#8b98b0", fontSize: 16, fontWeight: 600, marginTop: 12 }}>Loading draft...</p>
            </div>
          ) : null}

          {/* Log */}
          <div style={styles.logContainer}>
            <h4 style={styles.logTitle}>ACTIVITY LOG</h4>
            <div ref={logRef} style={styles.logScroll}>
              {log.map((entry, i) => (
                <div key={i} style={{
                  ...styles.logEntry,
                  color: entry.startsWith("✅") ? "#4ADE80" : entry.startsWith("🏆") ? "#E9C46A" : "#8b98b0",
                  fontWeight: entry.startsWith("✅") || entry.startsWith("🏆") ? 700 : 400,
                }}>{entry}</div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Drafter Panel */}
        <div style={styles.rightPanel}>
          <h3 style={styles.panelTitle}>{hasBudget ? "BUDGETS" : "TOTALS"}</h3>
          {drafters.map((d, i) => (
            <div key={i} style={styles.budgetCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ ...styles.budgetDot, backgroundColor: d.color }}></div>
                <span style={styles.budgetName}>{d.name}</span>
                <span style={styles.budgetAmountText}>${hasBudget ? d.budget : totalSpent(d)}</span>
              </div>
              {hasBudget && (
                <div style={styles.budgetBar}>
                  <div style={{ ...styles.budgetFill, width: `${Math.max(0, (d.budget / budgetAmount) * 100)}%`, backgroundColor: d.color }}></div>
                </div>
              )}
              <div style={styles.budgetItemCount}>
                {d.items.length} team{d.items.length !== 1 ? "s" : ""}
                {hasBudget ? ` · $${totalSpent(d)} spent` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: Draft Results + Actions */}
      <div style={styles.resultsSection}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
          <h3 style={{ ...styles.resultsSectionTitle, marginBottom: 0, flex: 1 }}>📋 DRAFT RESULTS</h3>
          <button style={styles.copyBtn} onClick={copyResults}>
            {copied ? "✓ Copied!" : "📋 Copy Results"}
          </button>
          <button style={styles.resetBtn} onClick={resetDraft}>
            🗑️ New Draft
          </button>
        </div>
        <div style={styles.resultsGrid}>
          {drafters.map((d, i) => (
            <div key={i} style={{ ...styles.resultCard, borderTop: `4px solid ${d.color}` }}>
              <div style={styles.resultHeader}>
                <span style={styles.resultName}>{d.name}</span>
                <span style={{ ...styles.resultSpent, color: d.color }}>${totalSpent(d)} spent</span>
              </div>
              {hasBudget && <div style={styles.resultBudgetLeft}>${d.budget} remaining</div>}
              {d.items.length === 0 ? (
                <p style={styles.noItems}>No teams yet</p>
              ) : (
                <div style={styles.resultItemList}>
                  {REGIONS.map((region) => {
                    const regionItems = d.items.filter((item) => item.region === region);
                    if (regionItems.length === 0) return null;
                    return (
                      <div key={region}>
                        <div style={{ ...styles.resultRegionLabel, color: REGION_COLORS[region] }}>{region}</div>
                        {regionItems.map((item, j) => (
                          <div key={j} style={styles.resultItem}>
                            <span style={{ ...styles.resultSeedBadge, backgroundColor: SEED_COLORS[item.seed] }}>
                              {item.shortLabel}
                            </span>
                            <span style={styles.resultPrice}>${item.price}</span>
                          </div>
                        ))}
                      </div>
                    );
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

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  input:focus, button:focus { outline: none; }
  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
  ::selection { background: #E63946; color: #fff; }
  body { background: #0a0e17; }
  @keyframes confettiFall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes slideDown {
    0% { opacity: 0; max-height: 0; margin-top: 0; }
    100% { opacity: 1; max-height: 80px; margin-top: 12px; }
  }
`;

const styles = {
  page: { fontFamily: "'Source Sans 3', sans-serif", backgroundColor: "#0a0e17", color: "#e8e6e1", minHeight: "100vh" },
  setupContainer: {
    minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "40px 20px",
    background: "radial-gradient(ellipse at 50% 30%, #1a2340 0%, #0a0e17 70%)",
  },
  logoArea: { textAlign: "center", marginBottom: 28 },
  basketballIcon: { fontSize: 52, marginBottom: 6, filter: "drop-shadow(0 0 20px rgba(230,57,70,0.5))" },
  mainTitle: {
    fontFamily: "'Oswald', sans-serif", fontSize: 46, fontWeight: 700, letterSpacing: 6,
    background: "linear-gradient(135deg, #E63946, #FF8200)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", lineHeight: 1.1,
  },
  subtitle: { fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 500, letterSpacing: 10, color: "#8b98b0", marginTop: 4 },
  tagline: { color: "#5a6478", marginTop: 10, fontSize: 13, letterSpacing: 1 },
  // Resume banner
  resumeBanner: {
    width: "100%", maxWidth: 720, marginBottom: 16, padding: "16px 20px",
    borderRadius: 12, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)",
    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12,
  },
  resumeText: {
    display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: "#4ADE80",
  },
  resumeBtn: {
    padding: "8px 20px", borderRadius: 8, border: "none",
    background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17",
    fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14, letterSpacing: 2, cursor: "pointer",
  },
  resumeDiscardBtn: {
    padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent", color: "#5a6478", fontFamily: "'Source Sans 3', sans-serif",
    fontWeight: 600, fontSize: 13, cursor: "pointer",
  },
  setupColumns: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, width: "100%", maxWidth: 720 },
  setupCard: {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 16, padding: "22px 20px", backdropFilter: "blur(12px)",
  },
  cardTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: 3, marginBottom: 2 },
  cardSubtitle: { fontSize: 12, color: "#5a6478", marginBottom: 14 },
  nameList: { display: "flex", flexDirection: "column", gap: 7 },
  nameRow: { display: "flex", alignItems: "center", gap: 8 },
  nameNumber: {
    width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    color: "#fff", fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 11, flexShrink: 0,
  },
  seedTag: {
    padding: "3px 8px", borderRadius: 5, color: "#fff", fontFamily: "'Oswald', sans-serif",
    fontWeight: 700, fontSize: 10, letterSpacing: 1, flexShrink: 0, textAlign: "center", minWidth: 38,
  },
  nameInput: {
    flex: 1, padding: "7px 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)", color: "#e8e6e1", fontSize: 13, fontFamily: "'Source Sans 3', sans-serif",
  },
  removeBtn: {
    width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(230,57,70,0.2)",
    color: "#E63946", cursor: "pointer", fontWeight: 700, fontSize: 11, flexShrink: 0,
  },
  addBtn: {
    marginTop: 8, padding: "7px 0", width: "100%", borderRadius: 7,
    border: "1px dashed rgba(255,255,255,0.15)", background: "transparent",
    color: "#5a6478", cursor: "pointer", fontSize: 12, fontFamily: "'Source Sans 3', sans-serif", fontWeight: 600,
  },
  regionTabs: { display: "flex", gap: 0, marginBottom: 10 },
  regionTab: {
    flex: 1, padding: "8px 4px", background: "transparent", border: "none",
    borderBottom: "3px solid", fontFamily: "'Oswald', sans-serif", fontSize: 12,
    fontWeight: 600, letterSpacing: 2, cursor: "pointer", transition: "all 0.15s",
  },
  seedNameScroll: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 340, overflowY: "auto" },
  settingBlock: { marginBottom: 16 },
  settingLabel: {
    fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3,
    color: "#5a6478", display: "block", marginBottom: 10,
  },
  toggleRow: { display: "flex", gap: 8 },
  toggleBtn: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    padding: "12px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)", color: "#5a6478", cursor: "pointer",
    fontFamily: "'Source Sans 3', sans-serif", fontSize: 13, fontWeight: 600, transition: "all 0.2s ease",
  },
  toggleBtnActive: {
    background: "rgba(230,57,70,0.12)", borderColor: "rgba(230,57,70,0.4)",
    color: "#E63946", boxShadow: "0 0 12px rgba(230,57,70,0.15)",
  },
  toggleIcon: { fontSize: 20 },
  budgetInputRow: {
    display: "flex", alignItems: "center", gap: 8, marginTop: 12,
    animation: "slideDown 0.3s ease forwards", overflow: "hidden",
  },
  budgetDollar: { fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 700, color: "#4ADE80" },
  budgetInputField: {
    width: 100, padding: "10px 14px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)",
    background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 20,
    fontFamily: "'Oswald', sans-serif", fontWeight: 700, textAlign: "center",
  },
  budgetPerDrafter: { fontSize: 13, color: "#5a6478", fontWeight: 600 },
  settingHint: { fontSize: 12, color: "#3e4a5e", marginTop: 8, fontStyle: "italic" },
  startBtn: {
    marginTop: 8, padding: "14px 0", width: "100%", borderRadius: 10, border: "none",
    background: "linear-gradient(135deg, #E63946, #FF8200)", color: "#fff", cursor: "pointer",
    fontSize: 17, fontFamily: "'Oswald', sans-serif", fontWeight: 700, letterSpacing: 3,
  },
  // Draft
  header: {
    display: "flex", alignItems: "center", gap: 12, padding: "14px 24px",
    background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexWrap: "wrap",
  },
  headerIcon: { fontSize: 24 },
  headerTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: 4, flex: 1 },
  headerBadge: { padding: "4px 14px", borderRadius: 20, background: "rgba(230,57,70,0.15)", color: "#E63946", fontWeight: 700, fontSize: 13 },
  headerBadgeBudget: { padding: "4px 14px", borderRadius: 20, background: "rgba(74,222,128,0.1)", color: "#4ADE80", fontWeight: 700, fontSize: 13 },
  savedBadge: { padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.05)", color: "#5a6478", fontSize: 11, fontWeight: 600 },
  draftLayout: { display: "grid", gridTemplateColumns: "230px 1fr 220px", gap: 0, minHeight: "55vh" },
  leftPanel: { padding: "16px 14px", borderRight: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" },
  panelTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 3, color: "#5a6478", marginBottom: 10 },
  seedList: { display: "flex", flexDirection: "column", gap: 4, maxHeight: "45vh", overflowY: "auto" },
  queueItem: {
    display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
    borderRadius: 7, transition: "all 0.2s ease",
  },
  queueRegion: {
    fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 600, letterSpacing: 1,
    width: 52, flexShrink: 0, textTransform: "uppercase",
  },
  queueLabel: {
    fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, flex: 1,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  queueNow: {
    padding: "2px 8px", borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)",
    color: "#fff", fontFamily: "'Oswald', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: 2,
  },
  queueIdx: { fontFamily: "'Oswald', sans-serif", fontSize: 10, color: "#3e4a5e", flexShrink: 0 },
  spinner: {
    width: 32, height: 32, borderRadius: "50%",
    border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#E63946",
    animation: "spin 0.8s linear infinite",
  },
  doneMessage: { textAlign: "center", padding: "40px 0", color: "#8b98b0" },
  centerPanel: { padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 },
  auctionBlock: {
    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14, padding: 22,
  },
  auctionLabel: { fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: 4, color: "#E63946" },
  regionPill: {
    padding: "3px 10px", borderRadius: 12, color: "#fff", fontFamily: "'Oswald', sans-serif",
    fontSize: 11, fontWeight: 600, letterSpacing: 2,
  },
  auctionSeed: {
    display: "inline-block", padding: "12px 28px", borderRadius: 10, color: "#fff",
    fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 22, letterSpacing: 2, marginBottom: 20,
  },
  fieldBlock: { marginBottom: 18 },
  fieldLabel: {
    fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: 3,
    color: "#5a6478", display: "block", marginBottom: 8,
  },
  winnerGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 },
  winnerBtn: {
    display: "flex", alignItems: "center", gap: 8, padding: "9px 11px",
    borderRadius: 8, border: "1px solid", cursor: "pointer", transition: "all 0.15s ease",
    fontFamily: "'Source Sans 3', sans-serif",
  },
  winnerDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  winnerName: { fontSize: 13, fontWeight: 600, flex: 1 },
  winnerBudget: { fontSize: 11, color: "#5a6478" },
  bidInputRow: { display: "flex", alignItems: "center", gap: 8 },
  bidDollar: { fontFamily: "'Oswald', sans-serif", fontSize: 26, fontWeight: 700, color: "#4ADE80" },
  bidAmountInput: {
    padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)",
    background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontSize: 22,
    fontFamily: "'Oswald', sans-serif", fontWeight: 700, width: 150,
  },
  errorHint: { fontSize: 12, color: "#E63946", marginTop: 6 },
  auctionActions: { display: "flex", gap: 10, marginTop: 4 },
  soldBtn: {
    flex: 1, padding: "12px 0", borderRadius: 8, border: "none",
    background: "linear-gradient(135deg, #4ADE80, #22c55e)", color: "#0a0e17",
    fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 3, cursor: "pointer",
  },
  cancelBtn: {
    padding: "12px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent", color: "#5a6478", fontFamily: "'Source Sans 3', sans-serif",
    fontWeight: 600, fontSize: 13, cursor: "pointer",
  },
  waitingBlock: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    padding: 50, background: "rgba(255,255,255,0.02)", borderRadius: 14,
  },
  logContainer: {
    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10, padding: 14, flex: 1, minHeight: 120, display: "flex", flexDirection: "column",
  },
  logTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 11, letterSpacing: 3, color: "#5a6478", marginBottom: 8 },
  logScroll: { flex: 1, overflowY: "auto", maxHeight: 180 },
  logEntry: { fontSize: 12, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" },
  rightPanel: { padding: "16px 14px", borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)", overflowY: "auto" },
  budgetCard: { marginBottom: 8, padding: "8px 6px", borderRadius: 8 },
  budgetDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  budgetName: { fontSize: 13, fontWeight: 600, flex: 1 },
  budgetAmountText: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, color: "#4ADE80" },
  budgetBar: { height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  budgetItemCount: { fontSize: 10, color: "#5a6478", marginTop: 3 },
  resultsSection: { padding: "28px 24px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.015)" },
  resultsSectionTitle: { fontFamily: "'Oswald', sans-serif", fontSize: 17, fontWeight: 700, letterSpacing: 4, marginBottom: 18 },
  copyBtn: {
    padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.3)",
    background: "rgba(74,222,128,0.08)", color: "#4ADE80", fontFamily: "'Oswald', sans-serif",
    fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer",
  },
  resetBtn: {
    padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(230,57,70,0.3)",
    background: "rgba(230,57,70,0.08)", color: "#E63946", fontFamily: "'Oswald', sans-serif",
    fontWeight: 700, fontSize: 13, letterSpacing: 2, cursor: "pointer",
  },
  resultsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 },
  resultCard: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 14 },
  resultHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  resultName: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 15, letterSpacing: 1 },
  resultSpent: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 14 },
  resultBudgetLeft: { fontSize: 11, color: "#5a6478", marginBottom: 8 },
  resultRegionLabel: {
    fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600, letterSpacing: 2,
    marginTop: 6, marginBottom: 4,
  },
  noItems: { fontSize: 12, color: "#3a4050", fontStyle: "italic" },
  resultItemList: { display: "flex", flexDirection: "column", gap: 4 },
  resultItem: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  resultSeedBadge: {
    padding: "2px 8px", borderRadius: 4, color: "#fff",
    fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: 1,
  },
  resultPrice: { fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, color: "#4ADE80" },
};
