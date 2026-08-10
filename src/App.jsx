import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Plus, Trash2, Copy, Check, Info, Clock, History, BookOpen, ShieldAlert, ChevronDown } from "lucide-react";

/* ============================================================
   FIQH RULES — port persis dari fiqhRules.ts
   STATUS: research draft, BUKAN fatwa. Lihat ruleMetadata.
   ============================================================ */

const FIQH_RULES = {
  hanafi: { madhhab: "hanafi", minHaydHours: 72, maxHaydHours: 240, minTuhrHours: 360 },
  maliki: { madhhab: "maliki", minHaydHours: null, maxHaydHours: 360, minTuhrHours: 360 },
  shafii: { madhhab: "shafii", minHaydHours: 24, maxHaydHours: 360, minTuhrHours: 360 },
  hanbali: { madhhab: "hanbali", minHaydHours: 24, maxHaydHours: 360, minTuhrHours: 312 },
};

const MADHHAB_LABEL = { hanafi: "Hanafi", maliki: "Maliki", shafii: "Syafi'i", hanbali: "Hanbali" };

const RULE_METADATA = {
  H1_MIN_HAYD: { madhhab: "hanafi", label: "Minimum haid (Hanafi)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 72 jam / 3 hari — perlu scholarly review sebelum publik." },
  H2_MAX_HAYD: { madhhab: "hanafi", label: "Maksimum haid (Hanafi)", validationStatus: "implementable", sourceNote: "Riset awal: maksimum 240 jam / 10 hari." },
  H3_MIN_TUHR: { madhhab: "hanafi", label: "Minimum masa suci (Hanafi)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 360 jam / 15 hari penuh." },
  M1_MIN_HAYD: { madhhab: "maliki", label: "Minimum haid (Maliki)", validationStatus: "validation_required", sourceNote: "Riset awal: tidak ada minimum durasi tetap — jangan diubah jadi ≥24 jam." },
  M2_MAX_HAYD: { madhhab: "maliki", label: "Maksimum haid (Maliki)", validationStatus: "implementable", sourceNote: "Riset awal: maksimum 15 hari / 360 jam." },
  M3_MIN_TUHR: { madhhab: "maliki", label: "Minimum masa suci (Maliki)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 15 hari penuh / 360 jam." },
  S1_MIN_HAYD: { madhhab: "shafii", label: "Minimum haid (Syafi'i)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 24 jam total (kasus intermittent kompleks belum dihitung otomatis)." },
  S2_MAX_HAYD: { madhhab: "shafii", label: "Maksimum haid (Syafi'i)", validationStatus: "implementable", sourceNote: "Riset awal: maksimum 15 hari / 360 jam." },
  S3_MIN_TUHR: { madhhab: "shafii", label: "Minimum masa suci (Syafi'i)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 15 hari penuh / 360 jam." },
  HB1_MIN_HAYD: { madhhab: "hanbali", label: "Minimum haid (Hanbali)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 24 jam / 1 hari 1 malam." },
  HB2_MAX_HAYD: { madhhab: "hanbali", label: "Maksimum haid (Hanbali)", validationStatus: "implementable", sourceNote: "Riset awal: maksimum 15 hari / 360 jam." },
  HB3_MIN_TUHR: { madhhab: "hanbali", label: "Minimum masa suci (Hanbali)", validationStatus: "implementable", sourceNote: "Riset awal: minimum 13 hari penuh / 312 jam." },
};

const VALIDATION_LABEL = {
  implementable: { text: "Draf riset — perlu tinjauan ahli", color: "#8A6D3B", bg: "#FBF3E3" },
  validation_required: { text: "Butuh validasi lanjutan", color: "#9C4A2E", bg: "#FBEAE3" },
  consultation_only: { text: "Selalu arahkan ke konsultasi", color: "#7A3B4A", bg: "#F7E7EA" },
};

/* ============================================================
   RULES ENGINE — port persis dari engine.ts (decision tree §26)
   Tidak ada logika yang ditambah/diubah dari versi TypeScript asli.
   ============================================================ */

const HOUR_MS = 1000 * 60 * 60;
const hoursBetween = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / HOUR_MS;
const isValidIso = (s) => !isNaN(new Date(s).getTime());

function ruleIdFor(madhhab, kind) {
  const prefix = { hanafi: "H", maliki: "M", shafii: "S", hanbali: "HB" };
  const numberMap = { MIN_HAYD: "1", MAX_HAYD: "2", MIN_TUHR: "3" };
  return `${prefix[madhhab]}${numberMap[kind]}_${kind}`;
}

function validateInput(input) {
  if (input.episodes.length === 0) return "Tidak ada episode yang dicatat.";
  for (const ep of input.episodes) {
    if (!isValidIso(ep.startDateTime)) return `Tanggal mulai episode ${ep.id} tidak valid.`;
    if (ep.endDateTime !== null) {
      if (!isValidIso(ep.endDateTime)) return `Tanggal selesai episode ${ep.id} tidak valid.`;
      if (new Date(ep.endDateTime).getTime() < new Date(ep.startDateTime).getTime()) {
        return `Episode ${ep.id}: tanggal selesai lebih awal dari tanggal mulai.`;
      }
    }
  }
  const sorted = [...input.episodes].sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].endDateTime;
    if (prevEnd !== null && new Date(sorted[i].startDateTime).getTime() < new Date(prevEnd).getTime()) {
      return `Episode ${sorted[i].id} tumpang tindih dengan episode sebelumnya.`;
    }
  }
  return null;
}

function analyze(input, nowIso) {
  const config = FIQH_RULES[input.madhhab];
  const rulesEvaluated = [];
  const consultationReasons = [];
  // nowIso dipakai untuk menghitung durasi sementara episode yang masih berlangsung.
  // Default: waktu saat analyze() dipanggil.
  const now = nowIso || new Date().toISOString();

  const inputError = validateInput(input);
  if (inputError) {
    return { status: "INPUT_ERROR", madhhab: input.madhhab, observedBleedingHours: null, rulesEvaluated: [], consultationReasons: [], analyzedAt: now, message: `Periksa kembali tanggal atau waktu yang Anda masukkan. (${inputError})` };
  }

  // Cek apakah ada episode yang masih berlangsung
  const ongoingEpisode = input.episodes.find((ep) => ep.endDateTime === null);
  if (ongoingEpisode) {
    // Hitung durasi sementara dari startDateTime ke sekarang
    const tentativeHours = hoursBetween(ongoingEpisode.startDateTime, now);
    const maxRuleId = ruleIdFor(input.madhhab, "MAX_HAYD");

    // Jika durasi sementara sudah melampaui maxHaydHours -> langsung CONSULTATION_REQUIRED
    if (tentativeHours > config.maxHaydHours) {
      rulesEvaluated.push({
        ruleId: maxRuleId,
        label: "Maksimum haid (durasi sementara — episode masih berlangsung)",
        thresholdHours: config.maxHaydHours,
        actualHours: tentativeHours,
        result: "FAIL",
      });
      consultationReasons.push("PROLONGED_BLEEDING_REQUIRES_ADVANCED_RULES");
      return {
        status: "CONSULTATION_REQUIRED",
        madhhab: input.madhhab,
        observedBleedingHours: tentativeHours,
        rulesEvaluated,
        consultationReasons,
        analyzedAt: now,
        message: `Darah sudah berlangsung ${fmtHours(tentativeHours)} (masih berlanjut) dan telah melampaui batas maksimum dasar Mazhab ${MADHHAB_LABEL[input.madhhab]}. HaidCheck menyarankan untuk segera konsultasikan kepada ahli fikih.`,
      };
    }

    // Durasi sementara masih dalam batas -> PENDING seperti biasa
    rulesEvaluated.push({
      ruleId: maxRuleId,
      label: "Maksimum haid (durasi sementara — episode masih berlangsung)",
      thresholdHours: config.maxHaydHours,
      actualHours: tentativeHours,
      result: "PASS",
    });
    return {
      status: "PENDING",
      madhhab: input.madhhab,
      observedBleedingHours: tentativeHours,
      rulesEvaluated,
      consultationReasons: [],
      analyzedAt: now,
      message: `Darah sudah berlangsung ${fmtHours(tentativeHours)} dan masih dalam batas maksimum dasar (${fmtHours(config.maxHaydHours)}). Catat kembali setelah darah berhenti untuk hasil yang lebih akurat.`,
    };
  }

  if (input.episodes.length > 1) {
    consultationReasons.push("INTERMITTENT_BLEEDING");
    return { status: "CONSULTATION_REQUIRED", madhhab: input.madhhab, observedBleedingHours: null, rulesEvaluated: [], consultationReasons, analyzedAt: now, message: "HaidCheck tidak dapat menentukan status kasus ini secara otomatis karena pola darah terputus-putus (intermittent). Silakan konsultasikan kepada ahli fikih." };
  }

  const episode = input.episodes[0];
  const observedBleedingHours = hoursBetween(episode.startDateTime, episode.endDateTime);

  const maxRuleId = ruleIdFor(input.madhhab, "MAX_HAYD");
  rulesEvaluated.push({ ruleId: maxRuleId, label: "Maksimum haid", thresholdHours: config.maxHaydHours, actualHours: observedBleedingHours, result: observedBleedingHours <= config.maxHaydHours ? "PASS" : "FAIL" });
  if (observedBleedingHours > config.maxHaydHours) {
    consultationReasons.push("PROLONGED_BLEEDING_REQUIRES_ADVANCED_RULES");
    return { status: "CONSULTATION_REQUIRED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons, analyzedAt: now, message: "HaidCheck tidak dapat menentukan status kasus ini secara otomatis karena durasi darah melebihi batas maksimum dasar. Silakan konsultasikan kepada ahli fikih." };
  }

  const tuhrRuleId = ruleIdFor(input.madhhab, "MIN_TUHR");
  if (input.priorPurityHours !== null) {
    rulesEvaluated.push({ ruleId: tuhrRuleId, label: "Minimum masa suci sebelumnya", thresholdHours: config.minTuhrHours, actualHours: input.priorPurityHours, result: input.priorPurityHours >= config.minTuhrHours ? "PASS" : "FAIL" });
    if (input.priorPurityHours < config.minTuhrHours) {
      consultationReasons.push("INSUFFICIENT_TUHR");
      return { status: "CONSULTATION_REQUIRED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons, analyzedAt: now, message: "HaidCheck tidak dapat menentukan status kasus ini secara otomatis karena masa suci sebelumnya belum memenuhi batas minimum dasar. Silakan konsultasikan kepada ahli fikih." };
    }
  } else {
    rulesEvaluated.push({ ruleId: tuhrRuleId, label: "Minimum masa suci sebelumnya", thresholdHours: config.minTuhrHours, actualHours: null, result: "NOT_EVALUATED" });
  }

  const minRuleId = ruleIdFor(input.madhhab, "MIN_HAYD");

  if (input.madhhab === "maliki") {
    const AMBIGUOUS_SHORT_THRESHOLD_HOURS = 24;
    rulesEvaluated.push({ ruleId: minRuleId, label: "Minimum haid (Maliki — tidak ada batas tetap)", thresholdHours: null, actualHours: observedBleedingHours, result: observedBleedingHours >= AMBIGUOUS_SHORT_THRESHOLD_HOURS ? "PASS" : "NOT_EVALUATED" });
    if (observedBleedingHours < AMBIGUOUS_SHORT_THRESHOLD_HOURS) {
      consultationReasons.push("MALIKI_MIN_HAYD_NOT_VALIDATED");
      return { status: "CONSULTATION_REQUIRED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons, analyzedAt: now, message: "HaidCheck tidak dapat menentukan status kasus ini secara otomatis karena durasi darah sangat singkat dan aturan minimum Mazhab Maliki belum tervalidasi untuk kasus ini. Silakan konsultasikan kepada ahli fikih." };
    }
    return { status: "HAID_SUPPORTED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons: [], analyzedAt: now, message: "Berdasarkan parameter dasar Mazhab Maliki yang digunakan oleh HaidCheck, data ini memenuhi parameter yang digunakan untuk analisis." };
  }

  const minHaydHours = config.minHaydHours;
  rulesEvaluated.push({ ruleId: minRuleId, label: "Minimum haid", thresholdHours: minHaydHours, actualHours: observedBleedingHours, result: observedBleedingHours >= minHaydHours ? "PASS" : "FAIL" });

  if (observedBleedingHours >= minHaydHours) {
    return { status: "HAID_SUPPORTED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons: [], analyzedAt: now, message: `Berdasarkan parameter dasar Mazhab ${MADHHAB_LABEL[input.madhhab]} yang digunakan oleh HaidCheck, data ini memenuhi parameter yang digunakan untuk analisis.` };
  }

  return { status: "ISTIHADHAH_SUPPORTED", madhhab: input.madhhab, observedBleedingHours, rulesEvaluated, consultationReasons: [], analyzedAt: now, message: `Berdasarkan parameter dasar Mazhab ${MADHHAB_LABEL[input.madhhab]} yang digunakan oleh HaidCheck, data yang dimasukkan tidak memenuhi parameter minimum haid.` };
}

const CONSULTATION_REASON_LABEL = {
  INTERMITTENT_BLEEDING: "Pola darah terputus-putus (intermittent) — belum bisa dihitung otomatis",
  PROLONGED_BLEEDING_REQUIRES_ADVANCED_RULES: "Durasi melebihi batas maksimum dasar mazhab",
  INSUFFICIENT_TUHR: "Masa suci sebelumnya belum memenuhi batas minimum dasar",
  MALIKI_MIN_HAYD_NOT_VALIDATED: "Durasi sangat singkat; aturan minimum Maliki belum tervalidasi untuk kasus ini",
};

const STATUS_META = {
  PENDING: { label: "Masih Diamati", color: "#4A5A66", bg: "#EAF0F3", ring: "#4A5A66" },
  HAID_SUPPORTED: { label: "Sesuai Parameter Haid", color: "#3D5C3A", bg: "#E9F0E5", ring: "#3D5C3A" },
  ISTIHADHAH_SUPPORTED: { label: "Sesuai Parameter Istihadhah", color: "#1F4A45", bg: "#E6EEEC", ring: "#1F4A45" },
  CONSULTATION_REQUIRED: { label: "Perlu Konsultasi Ahli Fikih", color: "#9C4A2E", bg: "#FBEAE3", ring: "#9C4A2E" },
  INPUT_ERROR: { label: "Data Belum Valid", color: "#7A3B4A", bg: "#F7E7EA", ring: "#7A3B4A" },
};

/* ============================================================
   STORAGE LAYER — localStorage (API bawaan browser).
   100% client-side: tidak ada request ke server/API eksternal.
   Data hanya tersimpan di perangkat & browser yang sama.
   ============================================================ */

const SETTINGS_KEY = "haidcheck:settings";
const ENTRIES_KEY = "haidcheck:entries";

async function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("Gagal menyimpan pengaturan", e);
  }
}
async function loadEntries() {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
async function saveEntries(entries) {
  try {
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(entries));
  } catch (e) {
    console.error("Gagal menyimpan riwayat", e);
  }
}

/* ============================================================
   HELPERS
   ============================================================ */

let idCounter = 0;
const newId = () => `ep_${Date.now()}_${idCounter++}`;

function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(v) {
  if (!v) return null;
  return new Date(v).toISOString();
}
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtHours(h) {
  if (h === null || h === undefined) return "—";
  const days = Math.floor(h / 24);
  const rem = Math.round(h % 24);
  if (days === 0) return `${Math.round(h)} jam`;
  return `${days} hari ${rem} jam`;
}

function buildConsultationSummary(entry) {
  const { input, result, createdAt } = entry;
  const lines = [];
  lines.push("RINGKASAN UNTUK KONSULTASI — HaidCheck");
  lines.push(`Tanggal dicatat: ${fmtDateTime(createdAt)}`);
  lines.push(`Mazhab yang digunakan sebagai basis parameter: ${MADHHAB_LABEL[input.madhhab]}`);
  lines.push("");
  lines.push("Episode darah yang dicatat:");
  input.episodes.forEach((ep, i) => {
    lines.push(`  ${i + 1}. Mulai: ${fmtDateTime(ep.startDateTime)} — Selesai: ${ep.endDateTime ? fmtDateTime(ep.endDateTime) : "masih berlangsung"}`);
  });
  lines.push(`Masa suci sebelumnya: ${input.priorPurityHours !== null ? fmtHours(input.priorPurityHours) : "tidak dicatat"}`);
  lines.push("");
  lines.push(`Status dari HaidCheck: ${STATUS_META[result.status]?.label || result.status}`);
  if (result.consultationReasons.length > 0) {
    lines.push("Alasan perlu konsultasi:");
    result.consultationReasons.forEach((r) => lines.push(`  - ${CONSULTATION_REASON_LABEL[r] || r}`));
  }
  lines.push("");
  lines.push("Catatan penting: HaidCheck adalah alat bantu observasi berbasis parameter dasar riset, BUKAN fatwa. Status di atas perlu dikonfirmasi langsung oleh ahli fikih, terutama untuk kasus yang ditandai perlu konsultasi.");
  lines.push("");
  lines.push("Pertanyaan yang mungkin perlu disampaikan ke ahli fikih:");
  lines.push("  - Apakah pola siklus saya sebelumnya relevan untuk menentukan status darah kali ini ('adah)?");
  lines.push("  - Apakah ada tindakan ibadah yang perlu saya lakukan sambil menunggu kepastian?");
  return lines.join("\n");
}

/* ============================================================
   UI PRIMITIVES
   ============================================================ */

function GlobalStyle() {
  return (
    <style>{`
      .hc-root { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; background:#F6F3ED; color:#22262A; min-height: 100vh; }
      .hc-display { font-family: 'Fraunces', Georgia, serif; }
      .hc-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
      .hc-scroll::-webkit-scrollbar { width: 6px; }
      .hc-scroll::-webkit-scrollbar-thumb { background: #D8D2C4; border-radius: 3px; }
    `}</style>
  );
}

function Badge({ children, color, bg }) {
  return (
    <span className="hc-mono" style={{ fontSize: 11, letterSpacing: "0.03em", padding: "3px 8px", borderRadius: 999, background: bg, color, fontWeight: 500 }}>
      {children}
    </span>
  );
}

function PrimaryButton({ children, onClick, disabled, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="transition-all"
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center",
        background: disabled ? "#C9C3B5" : "#1F4A45", color: "#F6F3ED",
        padding: "12px 20px", borderRadius: 10, fontSize: 14, fontWeight: 500, border: "none",
        cursor: disabled ? "not-allowed" : "pointer", width: "100%",
      }}
    >
      {children} {Icon && <Icon size={16} />}
    </button>
  );
}

function GhostButton({ children, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: "transparent", color: "#4A4A42", padding: "8px 14px",
        borderRadius: 8, fontSize: 13, fontWeight: 500, border: "1px solid #DED8C9", cursor: "pointer",
      }}
    >
      {Icon && <Icon size={14} />} {children}
    </button>
  );
}

function DisclaimerBanner() {
  return (
    <div style={{ background: "#F1EADC", border: "1px solid #E3D9C3", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <ShieldAlert size={16} color="#8A6D3B" style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ fontSize: 12.5, color: "#5C5340", lineHeight: 1.5, margin: 0 }}>
        HaidCheck adalah alat bantu <em>observasi dan persiapan konsultasi</em> berbasis parameter dasar riset fikih, <strong>bukan fatwa</strong>. Setiap hasil, terutama yang bertanda "Perlu Konsultasi", perlu dikonfirmasi ke ahli fikih.
      </p>
    </div>
  );
}

/* ============================================================
   DURATION TRACK — elemen signature: menunjukkan posisi durasi
   darah yang diamati relatif terhadap ambang minimum/maksimum
   mazhab yang dipilih.
   ============================================================ */

function DurationTrack({ config, observedHours, ongoing }) {
  if (observedHours === null || observedHours === undefined) return null;
  const max = config.maxHaydHours * 1.15;
  const min = config.minHaydHours ?? 0;
  const pct = (h) => Math.min(100, Math.max(0, (h / max) * 100));

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span className="hc-mono" style={{ fontSize: 10.5, color: "#8A8578" }}>0 jam</span>
        <span className="hc-mono" style={{ fontSize: 10.5, color: "#8A8578" }}>{fmtHours(config.maxHaydHours)} (maks. dasar)</span>
      </div>
      <div style={{ position: "relative", height: 8, background: "#E9E4D8", borderRadius: 999 }}>
        {config.minHaydHours !== null && (
          <div style={{ position: "absolute", left: `${pct(min)}%`, top: -4, width: 2, height: 16, background: "#B5654F", borderRadius: 1 }} title="Batas minimum" />
        )}
        <div style={{ position: "absolute", left: `${pct(config.maxHaydHours)}%`, top: -4, width: 2, height: 16, background: "#9C4A2E", borderRadius: 1 }} title="Batas maksimum" />
        <div
          style={{
            position: "absolute", left: `calc(${pct(observedHours)}% - 6px)`, top: -5, width: 14, height: 14, borderRadius: "50%",
            background: "#1F4A45", border: "3px solid #F6F3ED", boxShadow: "0 0 0 1px #1F4A45",
          }}
          title={`Durasi diamati: ${fmtHours(observedHours)}`}
        />
      </div>
      <p style={{ fontSize: 11.5, color: "#8A8578", marginTop: 8 }}>
        Titik teal menunjukkan durasi darah yang Anda catat ({fmtHours(observedHours)}){ongoing ? " — episode masih berlangsung, durasi dihitung hingga saat analisis dijalankan" : ""}{config.minHaydHours !== null ? `, garis clay menandai batas minimum (${fmtHours(config.minHaydHours)})` : ""}, garis merah menandai batas maksimum dasar.
      </p>
    </div>
  );
}

/* ============================================================
   VIEW: ONBOARDING
   ============================================================ */

function OnboardingView({ onSelect }) {
  const [selected, setSelected] = useState(null);
  const options = [
    { id: "hanafi", desc: "Mazhab yang banyak diikuti di Asia Selatan, Turki, dan sebagian Asia Tengah. Umumnya diikuti oleh muslimah yang keluarganya bermazhab Hanafi." },
    { id: "shafii", desc: "Mazhab yang paling umum di Indonesia, Malaysia, dan sebagian besar Asia Tenggara. Jika Anda tidak yakin, kemungkinan besar Anda mengikuti mazhab ini." },
    { id: "maliki", desc: "Mazhab yang banyak diikuti di Afrika Utara, Afrika Barat, dan sebagian Timur Tengah." },
    { id: "hanbali", desc: "Mazhab yang banyak diikuti di Arab Saudi dan sebagian negara Teluk. Umumnya diikuti oleh muslimah yang keluarganya bermazhab Hanbali." },
  ];
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "48px 20px" }}>
      <p className="hc-mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#8A8578", marginBottom: 6 }}>MULAI</p>
      <h1 className="hc-display" style={{ fontSize: 28, fontWeight: 500, marginBottom: 10, color: "#1C2321" }}>Pilih mazhab yang Anda ikuti</h1>
      <p style={{ fontSize: 14, color: "#5C5750", lineHeight: 1.6, marginBottom: 24 }}>
        Parameter dasar penentuan haid dan istihadhah berbeda antar mazhab. Pilihan ini menentukan angka ambang yang dipakai HaidCheck — bisa diganti kapan saja nanti.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
        {options.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setSelected(opt.id)}
            style={{
              textAlign: "left", padding: "14px 16px", borderRadius: 12,
              border: selected === opt.id ? "1.5px solid #1F4A45" : "1px solid #E3DDCF",
              background: selected === opt.id ? "#EDF2F0" : "#FFFFFF", cursor: "pointer",
            }}
          >
            <div className="hc-display" style={{ fontSize: 16, fontWeight: 500, color: "#1C2321" }}>{MADHHAB_LABEL[opt.id]}</div>
            <div style={{ fontSize: 12.5, color: "#8A8578", marginTop: 2 }}>{opt.desc}</div>
          </button>
        ))}
      </div>
      <PrimaryButton disabled={!selected} onClick={() => selected && onSelect(selected)} icon={ChevronRight}>
        Lanjutkan
      </PrimaryButton>
    </div>
  );
}

/* ============================================================
   VIEW: NEW ENTRY
   ============================================================ */

function NewEntryView({ madhhab, onSubmit, onChangeMadhhab }) {
  const [episodes, setEpisodes] = useState([{ id: newId(), start: "", end: "", ongoing: false }]);
  const [purityDays, setPurityDays] = useState("");
  const [purityUnknown, setPurityUnknown] = useState(false);
  const [error, setError] = useState(null);

  const addEpisode = () => setEpisodes((prev) => [...prev, { id: newId(), start: "", end: "", ongoing: false }]);
  const removeEpisode = (id) => setEpisodes((prev) => (prev.length > 1 ? prev.filter((e) => e.id !== id) : prev));
  const updateEpisode = (id, patch) => setEpisodes((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const handleSubmit = () => {
    setError(null);
    for (const ep of episodes) {
      if (!ep.start) { setError("Setiap episode perlu tanggal & jam mulai."); return; }
      if (!ep.ongoing && !ep.end) { setError("Isi tanggal selesai, atau tandai episode sebagai masih berlangsung."); return; }
    }
    const input = {
      madhhab,
      priorPurityHours: purityUnknown || purityDays === "" ? null : Number(purityDays) * 24,
      episodes: episodes.map((ep) => ({
        id: ep.id,
        startDateTime: fromLocalInputValue(ep.start),
        endDateTime: ep.ongoing ? null : fromLocalInputValue(ep.end),
      })),
    };
    onSubmit(input);
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <p className="hc-mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "#8A8578" }}>CATAT RIWAYAT BARU</p>
        <button onClick={onChangeMadhhab} style={{ fontSize: 12, color: "#1F4A45", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Mazhab: {MADHHAB_LABEL[madhhab]}
        </button>
      </div>
      <h1 className="hc-display" style={{ fontSize: 24, fontWeight: 500, marginBottom: 20, color: "#1C2321" }}>Episode darah</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {episodes.map((ep, i) => (
          <div key={ep.id} style={{ background: "#FFFFFF", border: "1px solid #E3DDCF", borderRadius: 12, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2321" }}>Episode {i + 1}</span>
              {episodes.length > 1 && (
                <button onClick={() => removeEpisode(ep.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9C4A2E" }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <label style={{ fontSize: 12, color: "#5C5750", display: "block", marginBottom: 4 }}>Mulai</label>
            <input
              type="datetime-local"
              value={ep.start}
              onChange={(e) => updateEpisode(ep.id, { start: e.target.value })}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DED8C9", fontSize: 13, marginBottom: 10, fontFamily: "inherit" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5C5750", marginBottom: 8 }}>
              <input type="checkbox" checked={ep.ongoing} onChange={(e) => updateEpisode(ep.id, { ongoing: e.target.checked })} />
              Masih berlangsung (belum berhenti)
            </label>
            {!ep.ongoing && (
              <>
                <label style={{ fontSize: 12, color: "#5C5750", display: "block", marginBottom: 4 }}>Selesai</label>
                <input
                  type="datetime-local"
                  value={ep.end}
                  onChange={(e) => updateEpisode(ep.id, { end: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DED8C9", fontSize: 13, fontFamily: "inherit" }}
                />
              </>
            )}
          </div>
        ))}
      </div>

      <button onClick={addEpisode} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #C9C3B5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#5C5750", cursor: "pointer", marginTop: 10, width: "100%", justifyContent: "center" }}>
        <Plus size={14} /> Tambah episode lain dalam siklus ini
      </button>

      <div style={{ marginTop: 24, background: "#FFFFFF", border: "1px solid #E3DDCF", borderRadius: 12, padding: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#1C2321", display: "block", marginBottom: 8 }}>Masa suci sebelum episode ini (hari)</label>
        <input
          type="number"
          min="0"
          disabled={purityUnknown}
          value={purityDays}
          onChange={(e) => setPurityDays(e.target.value)}
          placeholder="contoh: 20"
          style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #DED8C9", fontSize: 13, marginBottom: 8, fontFamily: "inherit", background: purityUnknown ? "#F3F1EA" : "#FFF" }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5C5750" }}>
          <input type="checkbox" checked={purityUnknown} onChange={(e) => setPurityUnknown(e.target.checked)} />
          Saya tidak tahu / tidak mencatat masa suci sebelumnya
        </label>
      </div>

      {error && <p style={{ color: "#9C4A2E", fontSize: 13, marginTop: 14 }}>{error}</p>}

      <div style={{ marginTop: 20 }}>
        <PrimaryButton onClick={handleSubmit} icon={ChevronRight}>Analisis</PrimaryButton>
      </div>
    </div>
  );
}

/* ============================================================
   VIEW: RESULT
   ============================================================ */

function ResultView({ entry, onBack, onNewEntry, onShowSources }) {
  const [copied, setCopied] = useState(false);
  const { result, input } = entry;
  const meta = STATUS_META[result.status];
  const config = FIQH_RULES[input.madhhab];

  const copySummary = async () => {
    const text = buildConsultationSummary(entry);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#8A8578", fontSize: 12.5, cursor: "pointer", marginBottom: 16 }}>
        <ChevronLeft size={14} /> Kembali
      </button>

      <div style={{ background: meta.bg, border: `1px solid ${meta.color}33`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Badge color={meta.color} bg="#FFFFFFaa">{MADHHAB_LABEL[input.madhhab]}</Badge>
          {result.analyzedAt && (
            <span className="hc-mono" style={{ fontSize: 11, color: "#8A8578" }}>
              Dianalisis pada: {fmtDateTime(result.analyzedAt)}
            </span>
          )}
        </div>
        <h1 className="hc-display" style={{ fontSize: 22, fontWeight: 600, color: meta.color, marginTop: 10, marginBottom: 8 }}>{meta.label}</h1>
        <p style={{ fontSize: 13.5, color: "#3A3A34", lineHeight: 1.6 }}>{result.message}</p>

        {result.consultationReasons.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {result.consultationReasons.map((r) => (
              <div key={r} style={{ display: "flex", gap: 6, fontSize: 12.5, color: "#5C4A3E" }}>
                <span>•</span><span>{CONSULTATION_REASON_LABEL[r] || r}</span>
              </div>
            ))}
          </div>
        )}

        {result.observedBleedingHours !== null && <DurationTrack config={config} observedHours={result.observedBleedingHours} ongoing={result.status === 'PENDING'} />}
      </div>

      {result.rulesEvaluated.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <p className="hc-mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: "#8A8578" }}>ATURAN YANG DIEVALUASI</p>
            <button onClick={onShowSources} style={{ fontSize: 11.5, color: "#1F4A45", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              <BookOpen size={12} /> Lihat sumber
            </button>
          </div>
          <div style={{ background: "#FFFFFF", border: "1px solid #E3DDCF", borderRadius: 12, overflow: "hidden" }}>
            {result.rulesEvaluated.map((r, i) => (
              <div key={r.ruleId} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: i > 0 ? "1px solid #EFEAE0" : "none" }}>
                <div>
                  <div style={{ fontSize: 12.5, color: "#1C2321" }}>{r.label}</div>
                  <div className="hc-mono" style={{ fontSize: 10.5, color: "#8A8578" }}>{r.ruleId}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="hc-mono" style={{ fontSize: 12, color: "#3A3A34" }}>
                    {r.actualHours !== null ? fmtHours(r.actualHours) : "—"} {r.thresholdHours !== null ? `/ ${fmtHours(r.thresholdHours)}` : ""}
                  </div>
                  <Badge
                    color={r.result === "PASS" ? "#3D5C3A" : r.result === "FAIL" ? "#9C4A2E" : "#8A8578"}
                    bg={r.result === "PASS" ? "#E9F0E5" : r.result === "FAIL" ? "#FBEAE3" : "#F0EEE7"}
                  >
                    {r.result}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <GhostButton onClick={copySummary} icon={copied ? Check : Copy}>
        {copied ? "Ringkasan disalin" : "Salin ringkasan untuk konsultasi"}
      </GhostButton>

      <div style={{ marginTop: 14 }}>
        <DisclaimerBanner />
      </div>

      <div style={{ marginTop: 20 }}>
        <PrimaryButton onClick={onNewEntry} icon={Plus}>Catat episode baru</PrimaryButton>
      </div>
    </div>
  );
}

/* ============================================================
   VIEW: HISTORY
   ============================================================ */

function HistoryView({ entries, onOpen, onNewEntry }) {
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className="hc-display" style={{ fontSize: 22, fontWeight: 500, color: "#1C2321" }}>Riwayat</h1>
        <GhostButton onClick={onNewEntry} icon={Plus}>Catat baru</GhostButton>
      </div>
      {entries.length === 0 ? (
        <p style={{ fontSize: 13.5, color: "#8A8578" }}>Belum ada riwayat tercatat. Mulai dengan mencatat episode pertama Anda.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[...entries].reverse().map((entry) => {
            const meta = STATUS_META[entry.result.status];
            return (
              <button
                key={entry.id}
                onClick={() => onOpen(entry)}
                style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid #E3DDCF", borderRadius: 12, padding: 14, cursor: "pointer" }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: "#1C2321" }}>{fmtDateTime(entry.createdAt)}</span>
                  <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                </div>
                <div style={{ fontSize: 12, color: "#8A8578", marginTop: 4 }}>
                  {MADHHAB_LABEL[entry.input.madhhab]} · {entry.input.episodes.length} episode
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   VIEW: SOURCES
   ============================================================ */

function SourcesView({ onBack }) {
  const [openMadhhab, setOpenMadhhab] = useState("hanafi");
  const grouped = Object.entries(RULE_METADATA).reduce((acc, [id, meta]) => {
    acc[meta.madhhab] = acc[meta.madhhab] || [];
    acc[meta.madhhab].push({ id, ...meta });
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "32px 20px 60px" }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#8A8578", fontSize: 12.5, cursor: "pointer", marginBottom: 16 }}>
        <ChevronLeft size={14} /> Kembali
      </button>
      <h1 className="hc-display" style={{ fontSize: 22, fontWeight: 500, color: "#1C2321", marginBottom: 8 }}>Sumber &amp; status validasi</h1>
      <p style={{ fontSize: 13, color: "#5C5750", lineHeight: 1.6, marginBottom: 20 }}>
        Semua angka ambang di HaidCheck berasal dari riset draf awal dan <strong>belum ditinjau oleh ahli fikih per mazhab</strong>. Jangan menjadikan status di aplikasi ini sebagai keputusan akhir.
      </p>
      {Object.keys(MADHHAB_LABEL).map((m) => (
        <div key={m} style={{ marginBottom: 10 }}>
          <button
            onClick={() => setOpenMadhhab(openMadhhab === m ? null : m)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFFFF", border: "1px solid #E3DDCF", borderRadius: 12, padding: "12px 16px", cursor: "pointer" }}
          >
            <span className="hc-display" style={{ fontSize: 15, fontWeight: 500, color: "#1C2321" }}>{MADHHAB_LABEL[m]}</span>
            <ChevronDown size={16} style={{ transform: openMadhhab === m ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} color="#8A8578" />
          </button>
          {openMadhhab === m && (
            <div style={{ border: "1px solid #E3DDCF", borderTop: "none", borderRadius: "0 0 12px 12px", background: "#FBFAF7" }}>
              {grouped[m].map((rule, i) => {
                const v = VALIDATION_LABEL[rule.validationStatus];
                return (
                  <div key={rule.id} style={{ padding: "12px 16px", borderTop: i > 0 ? "1px solid #EFEAE0" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontSize: 13, color: "#1C2321", fontWeight: 500 }}>{rule.label}</span>
                      <Badge color={v.color} bg={v.bg}>{v.text}</Badge>
                    </div>
                    <p style={{ fontSize: 12, color: "#8A8578", marginTop: 4, lineHeight: 1.5 }}>{rule.sourceNote}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   APP ROOT
   ============================================================ */

export default function HaidCheckApp() {
  const [loading, setLoading] = useState(true);
  const [madhhab, setMadhhab] = useState(null);
  const [entries, setEntries] = useState([]);
  const [view, setView] = useState("onboarding"); // onboarding | new | result | history | sources
  const [activeEntry, setActiveEntry] = useState(null);

  useEffect(() => {
    (async () => {
      const settings = await loadSettings();
      const loadedEntries = await loadEntries();
      setEntries(loadedEntries);
      if (settings?.madhhab) {
        setMadhhab(settings.madhhab);
        setView("new");
      }
      setLoading(false);
    })();
  }, []);

  const handleSelectMadhhab = useCallback(async (m) => {
    setMadhhab(m);
    await saveSettings({ madhhab: m });
    setView("new");
  }, []);

  const handleSubmitEntry = useCallback(
    async (input) => {
      const result = analyze(input);
      const entry = { id: newId(), createdAt: new Date().toISOString(), input, result };
      const next = [...entries, entry];
      setEntries(next);
      await saveEntries(next);
      setActiveEntry(entry);
      setView("result");
    },
    [entries]
  );

  if (loading) {
    return (
      <div className="hc-root" style={{ minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <GlobalStyle />
        <p style={{ fontSize: 13, color: "#8A8578" }}>Memuat…</p>
      </div>
    );
  }

  return (
    <div className="hc-root" style={{ minHeight: 500 }}>
      <GlobalStyle />

      <div style={{ borderBottom: "1px solid #E3DDCF", background: "#FBFAF7" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="hc-display" style={{ fontSize: 18, fontWeight: 600, color: "#1F4A45", letterSpacing: "-0.01em" }}>HaidCheck</span>
          {madhhab && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => setView("new")} style={{ background: "none", border: "none", cursor: "pointer", color: view === "new" ? "#1F4A45" : "#8A8578", padding: 6 }} title="Catat">
                <Plus size={17} />
              </button>
              <button onClick={() => setView("history")} style={{ background: "none", border: "none", cursor: "pointer", color: view === "history" ? "#1F4A45" : "#8A8578", padding: 6 }} title="Riwayat">
                <History size={17} />
              </button>
              <button onClick={() => setView("sources")} style={{ background: "none", border: "none", cursor: "pointer", color: view === "sources" ? "#1F4A45" : "#8A8578", padding: 6 }} title="Sumber">
                <BookOpen size={17} />
              </button>
            </div>
          )}
        </div>
      </div>

      {view === "onboarding" && <OnboardingView onSelect={handleSelectMadhhab} />}

      {view === "new" && madhhab && (
        <NewEntryView madhhab={madhhab} onSubmit={handleSubmitEntry} onChangeMadhhab={() => setView("onboarding")} />
      )}

      {view === "result" && activeEntry && (
        <ResultView
          entry={activeEntry}
          onBack={() => setView("history")}
          onNewEntry={() => setView("new")}
          onShowSources={() => setView("sources")}
        />
      )}

      {view === "history" && (
        <HistoryView
          entries={entries}
          onOpen={(entry) => { setActiveEntry(entry); setView("result"); }}
          onNewEntry={() => setView("new")}
        />
      )}

      {view === "sources" && <SourcesView onBack={() => setView(activeEntry ? "result" : "new")} />}
    </div>
  );
}
