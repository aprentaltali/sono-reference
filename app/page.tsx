"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";

/* ============================================================================
   AEROECHO SIMSTUDIO
   Echo Training & Simulation Platform for DMS schools, RDCS/NBE exam prep,
   and veterinary practice. This is a TRAINING SIMULATOR — it is not a
   medical device and is not intended to diagnose, treat, or inform care
   decisions for any human patient. All "cases" below are synthetic
   reference data built for skills practice and scoring, not real studies.
   ========================================================================== */

/* ---------------------------------- Types --------------------------------- */

interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  type: "caliper" | "trace";
  structure: string;
  points: Point[];
  valuePx: number;
  valueScaled: number | null;
  unit: string;
  isAbnormal: boolean;
  isGoldStandard?: boolean;
}

type WorkspaceTab = "canvas" | "gls";
type AppView = "workstation" | "marketing";
type Sex = "male" | "female";

interface CaseDefinition {
  id: string;
  name: string;
  category: string;
  summary: string;
  accent: string;
  seedMeasurements: Measurement[];
  presets: {
    lvotDiameter: string;
    lvotVti: string;
    avVti: string;
    mitralE: string;
    mitralA: string;
    ePrimeSeptal: string;
    trVelocity: string;
    edv: string;
    esv: string;
    gls: number;
  };
}

/* ------------------------------ Sample Case Library ------------------------------ */
/* Synthetic training data only — not derived from any real patient study. */

const CASES: CaseDefinition[] = [
  {
    id: "severe-as",
    name: "Case 1 — Severe Aortic Stenosis",
    category: "Valvular",
    summary: "Calcific AV with reduced AVA and elevated transvalvular gradients. Practice continuity-equation calipers.",
    accent: "#ef4444",
    seedMeasurements: [
      {
        id: "gs-as-1",
        type: "caliper",
        structure: "LVOT Diameter (gold standard)",
        points: [{ x: 300, y: 300 }, { x: 380, y: 300 }],
        valuePx: 80,
        valueScaled: 20.0,
        unit: "mm",
        isAbnormal: false,
        isGoldStandard: true,
      },
    ],
    presets: { lvotDiameter: "2.0", lvotVti: "18", avVti: "62", mitralE: "0.9", mitralA: "0.5", ePrimeSeptal: "5", trVelocity: "3.4", edv: "112", esv: "48", gls: -14.2 },
  },
  {
    id: "diastolic-gr3",
    name: "Case 2 — Grade III Diastolic Dysfunction",
    category: "Diastology",
    summary: "Restrictive filling pattern: E/A > 2, elevated E/e', elevated TR velocity. Practice tissue-Doppler placement.",
    accent: "#a855f7",
    seedMeasurements: [
      {
        id: "gs-dd-1",
        type: "caliper",
        structure: "Mitral E-wave (gold standard)",
        points: [{ x: 250, y: 200 }, { x: 250, y: 320 }],
        valuePx: 120,
        valueScaled: 30.0,
        unit: "mm",
        isAbnormal: true,
        isGoldStandard: true,
      },
    ],
    presets: { lvotDiameter: "2.1", lvotVti: "20", avVti: "24", mitralE: "1.1", mitralA: "0.5", ePrimeSeptal: "4", trVelocity: "3.1", edv: "118", esv: "55", gls: -15.8 },
  },
  {
    id: "normal-tte",
    name: "Case 3 — Normal Adult TTE",
    category: "Baseline",
    summary: "Reference-range structure and function across all modules. Use to calibrate expected normal values.",
    accent: "#10b981",
    seedMeasurements: [
      {
        id: "gs-n-1",
        type: "caliper",
        structure: "LVOT Diameter (gold standard)",
        points: [{ x: 300, y: 300 }, { x: 384, y: 300 }],
        valuePx: 84,
        valueScaled: 21.0,
        unit: "mm",
        isAbnormal: false,
        isGoldStandard: true,
      },
    ],
    presets: { lvotDiameter: "2.1", lvotVti: "19", avVti: "20", mitralE: "0.7", mitralA: "0.6", ePrimeSeptal: "9", trVelocity: "2.1", edv: "110", esv: "42", gls: -20.5 },
  },
];

/* 17-segment mock GLS values by case, roughly apical/mid/basal x septal..lateral pattern */
const GLS_SEGMENT_SETS: Record<string, number[]> = {
  "severe-as": [-8, -9, -10, -11, -9, -8, -12, -13, -14, -15, -13, -12, -16, -18, -19, -17, -14],
  "diastolic-gr3": [-11, -12, -13, -14, -12, -11, -15, -16, -17, -16, -15, -14, -18, -19, -20, -18, -15],
  "normal-tte": [-18, -19, -20, -21, -19, -18, -21, -22, -23, -22, -21, -20, -22, -23, -24, -22, -20],
  default: [-12, -13, -14, -15, -13, -12, -15, -16, -17, -16, -15, -14, -17, -18, -19, -17, -14],
};

/* --------------------------------- Helpers --------------------------------- */

function glsColor(value: number): string {
  // -25 (deep normal, rose) -> -5 (dysfunctional, pale blue)
  const clamped = Math.max(-25, Math.min(-5, value));
  const t = (clamped + 25) / 20; // 0 (worst) -> 1 (best)
  const from = { r: 191, g: 219, b: 254 }; // pale blue, hypokinetic
  const to = { r: 190, g: 18, b: 60 }; // deep rose, normal
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function efBand(ef: number, sex: Sex): { label: string; color: string } {
  const normalCutoff = sex === "male" ? 52 : 54;
  if (ef >= normalCutoff) return { label: "Normal", color: "#10b981" };
  if (ef >= 41) return { label: "Mildly Reduced", color: "#eab308" };
  if (ef >= 30) return { label: "Moderately Reduced", color: "#f97316" };
  return { label: "Severely Reduced", color: "#dc2626" };
}

/* ============================================================================
   COMPLIANCE BANNER
   ========================================================================== */

function ComplianceBanner({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-amber-500/40 bg-slate-900/95 px-3 py-1.5 text-[11px] font-semibold text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.25)] backdrop-blur-md transition-all hover:bg-slate-800"
        title="Expand compliance notice"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
        EDU / VET USE ONLY
      </button>
    );
  }

  return (
    <div className="relative z-50 flex items-center justify-center gap-4 border-b border-amber-500/30 bg-gradient-to-r from-slate-950 via-amber-950/40 to-slate-950 px-4 py-2 text-center">
      <p className="text-[11px] font-semibold tracking-wide text-amber-300 sm:text-xs">
        FOR EDUCATIONAL, RESEARCH, AND VETERINARY USE ONLY — NOT FOR HUMAN CLINICAL DIAGNOSIS.
      </p>
      <button
        onClick={onToggle}
        className="shrink-0 rounded-md border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-200/80 transition-colors hover:bg-amber-500/10"
      >
        Collapse
      </button>
    </div>
  );
}

/* ============================================================================
   17-SEGMENT GLS BULLSEYE
   ========================================================================== */

function GlsBullseye({ caseId, peakGls }: { caseId: string; peakGls: number }) {
  const segments = GLS_SEGMENT_SETS[caseId] ?? GLS_SEGMENT_SETS.default;
  const cx = 200;
  const cy = 200;
  // three rings: basal (6), mid (6), apical (4) + apex cap (1) = 17
  const ringDefs = [
    { count: 6, rOuter: 190, rInner: 128, startIdx: 0 },
    { count: 6, rOuter: 128, rInner: 66, startIdx: 6 },
    { count: 4, rOuter: 66, rInner: 18, startIdx: 12 },
  ];

  const paths: { d: string; color: string; value: number; label: string }[] = [];

  ringDefs.forEach((ring) => {
    const anglePer = (2 * Math.PI) / ring.count;
    for (let i = 0; i < ring.count; i++) {
      const a0 = -Math.PI / 2 + i * anglePer;
      const a1 = a0 + anglePer;
      const x0o = cx + ring.rOuter * Math.cos(a0);
      const y0o = cy + ring.rOuter * Math.sin(a0);
      const x1o = cx + ring.rOuter * Math.cos(a1);
      const y1o = cy + ring.rOuter * Math.sin(a1);
      const x0i = cx + ring.rInner * Math.cos(a0);
      const y0i = cy + ring.rInner * Math.sin(a0);
      const x1i = cx + ring.rInner * Math.cos(a1);
      const y1i = cy + ring.rInner * Math.sin(a1);
      const d = `M ${x0o} ${y0o} A ${ring.rOuter} ${ring.rOuter} 0 0 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${ring.rInner} ${ring.rInner} 0 0 0 ${x0i} ${y0i} Z`;
      const value = segments[ring.startIdx + i] ?? -12;
      paths.push({ d, color: glsColor(value), value, label: `${ring.startIdx + i + 1}` });
    }
  });

  const apexValue = segments[16] ?? -12;

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <svg viewBox="0 0 400 400" className="h-72 w-72 drop-shadow-[0_0_25px_rgba(6,182,212,0.15)]">
        {paths.map((p, i) => (
          <path
            key={i}
            d={p.d}
            fill={p.color}
            stroke="#020617"
            strokeWidth={1.5}
            className="transition-all duration-700 ease-out"
            style={{ animation: `glsFadeIn 600ms ease-out ${i * 30}ms both` }}
          />
        ))}
        <circle cx={cx} cy={cy} r={18} fill={glsColor(apexValue)} stroke="#020617" strokeWidth={1.5} />
        <style>{`@keyframes glsFadeIn { from { opacity: 0; transform: scale(0.85); transform-origin: 200px 200px; } to { opacity: 1; transform: scale(1); } }`}</style>
      </svg>
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Peak Systolic Global Longitudinal Strain</p>
        <p className="font-mono text-2xl font-bold text-cyan-300">{peakGls.toFixed(1)}%</p>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: glsColor(-22) }} />Normal</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: glsColor(-14) }} />Reduced</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: glsColor(-7) }} />Hypokinetic</span>
      </div>
    </div>
  );
}

/* ============================================================================
   REPORT GENERATOR MODAL
   ========================================================================== */

interface ReportFields {
  sonographerName: string;
  studentId: string;
  supervisingFaculty: string;
  caseNotes: string;
}

function ReportModal({
  open,
  onClose,
  activeCase,
  measurements,
  ava,
  eOverEPrime,
  ef,
  efInfo,
  fields,
  setFields,
}: {
  open: boolean;
  onClose: () => void;
  activeCase: CaseDefinition | null;
  measurements: Measurement[];
  ava: number | null;
  eOverEPrime: number | null;
  ef: number | null;
  efInfo: { label: string; color: string } | null;
  fields: ReportFields;
  setFields: (f: ReportFields) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm print:static print:bg-white print:p-0">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-[0_0_40px_rgba(6,182,212,0.15)] print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 print:hidden">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Structured Training Report</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div id="report-print-area" className="space-y-5 p-6 text-slate-200 print:text-black">
          <div className="border-b border-slate-800 pb-3 print:border-black">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400 print:text-black">
              Educational / Veterinary Training Simulation — Not a Clinical Record
            </p>
            <h1 className="mt-1 text-xl font-bold text-white print:text-black">AeroEcho SimStudio — Skills Assessment Summary</h1>
            <p className="text-xs text-slate-400 print:text-slate-700">{activeCase ? activeCase.name : "Freehand Session (no case loaded)"}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="text-slate-400 print:text-slate-700">Sonography Student Name</span>
              <input
                value={fields.sonographerName}
                onChange={(e) => setFields({ ...fields, sonographerName: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-cyan-500 print:border-black print:bg-white print:text-black"
                placeholder="Full name"
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400 print:text-slate-700">Student / Trainee ID</span>
              <input
                value={fields.studentId}
                onChange={(e) => setFields({ ...fields, studentId: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-cyan-500 print:border-black print:bg-white print:text-black"
                placeholder="e.g. DMS-2027-0134"
              />
            </label>
            <label className="col-span-2 space-y-1">
              <span className="text-slate-400 print:text-slate-700">Supervising Clinical Faculty</span>
              <input
                value={fields.supervisingFaculty}
                onChange={(e) => setFields({ ...fields, supervisingFaculty: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-cyan-500 print:border-black print:bg-white print:text-black"
                placeholder="Instructor of record"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 print:border-black print:bg-white">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-cyan-400 print:text-black">Recorded Values</h3>
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-slate-800 print:border-black">
                  <td className="py-1.5 text-slate-400 print:text-slate-700">Aortic Valve Area (Continuity Eq.)</td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-100 print:text-black">{ava ? `${ava.toFixed(2)} cm²` : "—"}</td>
                </tr>
                <tr className="border-b border-slate-800 print:border-black">
                  <td className="py-1.5 text-slate-400 print:text-slate-700">Average E/e′ Ratio</td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-100 print:text-black">{eOverEPrime ? eOverEPrime.toFixed(1) : "—"}</td>
                </tr>
                <tr className="border-b border-slate-800 print:border-black">
                  <td className="py-1.5 text-slate-400 print:text-slate-700">Biplane LVEF (Simpson's)</td>
                  <td className="py-1.5 text-right font-mono font-bold" style={{ color: efInfo?.color ?? "#e2e8f0" }}>
                    {ef !== null ? `${ef.toFixed(1)}% (${efInfo?.label})` : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-slate-400 print:text-slate-700">On-Screen Caliper / Trace Vectors</td>
                  <td className="py-1.5 text-right font-mono font-bold text-slate-100 print:text-black">{measurements.length}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <label className="block space-y-1 text-xs">
            <span className="text-slate-400 print:text-slate-700">Case Notes / Instructor Feedback</span>
            <textarea
              value={fields.caseNotes}
              onChange={(e) => setFields({ ...fields, caseNotes: e.target.value })}
              rows={4}
              className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-cyan-500 print:border-black print:bg-white print:text-black"
              placeholder="Technique notes, areas for improvement, sign-off comments..."
            />
          </label>

          <p className="text-[10px] text-slate-500 print:text-slate-600">
            Generated by AeroEcho SimStudio, an educational and veterinary training simulator. This document does not represent a diagnostic study of a human patient and must not be filed in a clinical medical record.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800 px-6 py-4 print:hidden">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white">
            Close
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all hover:bg-blue-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a1 1 0 001-1v-5H8v5a1 1 0 001 1zm0-13V4a1 1 0 011-1h4a1 1 0 011 1v3H9z" /></svg>
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   MARKETING VIEW
   ========================================================================== */

function MarketingView({ onLaunch }: { onLaunch: () => void }) {
  const [checkoutTier, setCheckoutTier] = useState<string | null>(null);

  const tiers = [
    {
      name: "Student Pass",
      price: "$19",
      period: "/mo",
      audience: "Individual DMS students & RDCS candidates",
      features: ["Full case library access", "Unlimited skills-check scoring", "Printable practice reports", "Cancel anytime"],
      accent: "cyan",
    },
    {
      name: "Faculty & College Site License",
      price: "$1,499",
      period: "/yr",
      audience: "Sonography programs & training departments",
      features: ["Unlimited student seats", "Custom case authoring", "Cohort progress dashboard", "LMS roster sync"],
      accent: "purple",
      featured: true,
    },
    {
      name: "Veterinary Practice License",
      price: "$49",
      period: "/mo",
      audience: "Veterinary clinics & vet-tech training",
      features: ["Species-adjusted reference presets", "Multi-workstation activation", "Practice-branded reports", "Priority support"],
      accent: "emerald",
    },
  ];

  const modules = [
    { title: "Continuity Equation", detail: "LVOT / AV VTI calipers with live AVA calculation." },
    { title: "Diastology Suite", detail: "E, A, e′ and TR-velocity workflow scored against ASE cutoffs." },
    { title: "Biplane Simpson's EF", detail: "EDV / ESV tracing with guideline-based severity bands." },
    { title: "GLS Bullseye", detail: "17-segment strain polar plot for pattern recognition drills." },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-200">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-slate-800 px-6 py-20 sm:py-28">
        <div className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-10 bottom-0 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-4 text-xs font-semibold text-amber-400">Educational &amp; veterinary simulation — not a diagnostic device</p>
          <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl">
            Where sonography students build muscle memory before the transducer touches a patient.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm text-slate-400 sm:text-base">
            AeroEcho SimStudio pairs a full clinical-workflow interface with scored practice cases, so RDCS candidates and vet-tech trainees rehearse the calculations that matter on exam day.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <button
              onClick={onLaunch}
              className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_25px_rgba(6,182,212,0.35)] transition-transform hover:scale-[1.02]"
            >
              Open the Workstation
            </button>
            <a href="#pricing" className="rounded-xl border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800">
              View pricing
            </a>
          </div>
        </div>
      </section>

      {/* Feature cards */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-slate-500">Four practice modules, one workstation</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m) => (
            <div
              key={m.title}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-md transition-all hover:border-cyan-500/40 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]"
            >
              <h3 className="mb-2 text-sm font-bold text-white">{m.title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{m.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-2 text-center text-2xl font-bold text-white">Pricing built for classrooms and clinics</h2>
        <p className="mb-10 text-center text-sm text-slate-500">Simple per-seat and site plans. No long-term contracts on the Student Pass.</p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.featured
                  ? "border-purple-500/50 bg-slate-900 shadow-[0_0_30px_rgba(168,85,247,0.2)] md:scale-105"
                  : "border-slate-800 bg-slate-900/60"
              }`}
            >
              <h3 className="text-sm font-bold text-white">{t.name}</h3>
              <p className="mt-1 text-xs text-slate-500">{t.audience}</p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{t.price}</span>
                <span className="text-sm text-slate-500">{t.period}</span>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-xs text-slate-300">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setCheckoutTier(t.name)}
                className={`mt-6 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all ${
                  t.featured ? "bg-purple-500 text-white hover:bg-purple-400" : "bg-slate-800 text-white hover:bg-slate-700"
                }`}
              >
                Start checkout
              </button>
            </div>
          ))}
        </div>
      </section>

      {checkoutTier && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-[0_0_40px_rgba(6,182,212,0.2)]">
            <h3 className="text-sm font-bold text-white">Checkout — {checkoutTier}</h3>
            <p className="mt-2 text-xs text-slate-400">
              This is a demo checkout placeholder. Connect a Stripe Checkout session here to accept real payment.
            </p>
            <div className="mt-4 space-y-2 text-xs">
              <input placeholder="Email address" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500" />
              <input placeholder="Card number (demo only)" className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500" />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setCheckoutTier(null)} className="rounded-lg px-3 py-2 text-xs text-slate-400 hover:text-white">
                Cancel
              </button>
              <button onClick={() => setCheckoutTier(null)} className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400">
                Confirm (demo)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   MAIN APP
   ========================================================================== */

export default function AeroEchoSimStudio() {
  const [view, setView] = useState<AppView>("marketing");

  // Core canvas state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activeTool, setActiveTool] = useState<"caliper" | "trace">("caliper");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTrace, setCurrentTrace] = useState<Point[]>([]);
  const [currentCaliper, setCurrentCaliper] = useState<Point[]>([]);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("canvas");

  // Filters
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(115);
  const [sharpness, setSharpness] = useState(0);
  const [colorMap, setColorMap] = useState<"grayscale" | "echo-blue" | "sepia">("grayscale");
  const [mmPerPx] = useState<number>(0.25);

  // Continuity equation
  const [lvotDiameter, setLvotDiameter] = useState<string>("2.0");
  const [lvotVti, setLvotVti] = useState<string>("18");
  const [avVti, setAvVti] = useState<string>("45");

  // Diastology
  const [mitralE, setMitralE] = useState<string>("0.8");
  const [mitralA, setMitralA] = useState<string>("0.6");
  const [ePrimeSeptal, setEPrimeSeptal] = useState<string>("6");
  const [trVelocity, setTrVelocity] = useState<string>("2.5");

  // Biplane Simpson's EF
  const [edv, setEdv] = useState<string>("110");
  const [esv, setEsv] = useState<string>("45");
  const [patientSex, setPatientSex] = useState<Sex>("female");

  // Case library
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [skillsCheckActive, setSkillsCheckActive] = useState(false);
  const [skillsScore, setSkillsScore] = useState<number | null>(null);

  // Compliance banner
  const [bannerCollapsed, setBannerCollapsed] = useState(false);

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);
  const [reportFields, setReportFields] = useState<ReportFields>({
    sonographerName: "",
    studentId: "",
    supervisingFaculty: "",
    caseNotes: "",
  });

  const activeCase = useMemo(() => CASES.find((c) => c.id === activeCaseId) ?? null, [activeCaseId]);

  /* ---- Calculations ---- */
  const calculatedAVA = useMemo(() => {
    const d = parseFloat(lvotDiameter);
    const v1 = parseFloat(lvotVti);
    const v2 = parseFloat(avVti);
    if (isNaN(d) || isNaN(v1) || isNaN(v2) || v2 === 0) return null;
    const radius = d / 2;
    const area = Math.PI * radius * radius;
    return (area * v1) / v2;
  }, [lvotDiameter, lvotVti, avVti]);

  const calculatedEEPrime = useMemo(() => {
    const eVel = parseFloat(mitralE) * 100;
    const ePrime = parseFloat(ePrimeSeptal);
    if (isNaN(eVel) || isNaN(ePrime) || ePrime === 0) return null;
    return eVel / ePrime;
  }, [mitralE, ePrimeSeptal]);

  const calculatedEF = useMemo(() => {
    const ed = parseFloat(edv);
    const es = parseFloat(esv);
    if (isNaN(ed) || isNaN(es) || ed === 0) return null;
    return ((ed - es) / ed) * 100.0;
  }, [edv, esv]);

  const efInfo = calculatedEF !== null ? efBand(calculatedEF, patientSex) : null;
  const peakGls = activeCase ? activeCase.presets.gls : -18.5;

  /* ---- Case loading ---- */
  const loadCase = (id: string) => {
    const c = CASES.find((x) => x.id === id);
    if (!c) return;
    setActiveCaseId(id);
    setMeasurements(c.seedMeasurements);
    setLvotDiameter(c.presets.lvotDiameter);
    setLvotVti(c.presets.lvotVti);
    setAvVti(c.presets.avVti);
    setMitralE(c.presets.mitralE);
    setMitralA(c.presets.mitralA);
    setEPrimeSeptal(c.presets.ePrimeSeptal);
    setTrVelocity(c.presets.trVelocity);
    setEdv(c.presets.edv);
    setEsv(c.presets.esv);
    setSkillsCheckActive(false);
    setSkillsScore(null);
    setImage(null);
  };

  const startSkillsCheck = () => {
    if (!activeCase) return;
    setMeasurements(measurements.filter((m) => !m.isGoldStandard));
    setSkillsCheckActive(true);
    setSkillsScore(null);
  };

  const scoreSkillsCheck = () => {
    if (!activeCase) return;
    const goldStandards = activeCase.seedMeasurements.filter((m) => m.isGoldStandard);
    const attempts = measurements.filter((m) => !m.isGoldStandard);
    if (goldStandards.length === 0 || attempts.length === 0) {
      setSkillsScore(0);
      return;
    }
    let totalAccuracy = 0;
    let compared = 0;
    goldStandards.forEach((gs) => {
      const nearest = attempts.reduce((best, a) => {
        if (!gs.valueScaled || !a.valueScaled) return best;
        const diff = Math.abs(a.valueScaled - gs.valueScaled);
        return diff < best.diff ? { diff, a } : best;
      }, { diff: Infinity, a: attempts[0] });
      if (gs.valueScaled && nearest.a.valueScaled) {
        const pctError = Math.abs(nearest.a.valueScaled - gs.valueScaled) / gs.valueScaled;
        const accuracy = Math.max(0, 100 - pctError * 100);
        totalAccuracy += accuracy;
        compared += 1;
      }
    });
    setSkillsScore(compared > 0 ? Math.round(totalAccuracy / compared) : 0);
  };

  /* ---- Canvas rendering ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (image) {
      let filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      if (colorMap === "echo-blue") filter += " sepia(100%) hue-rotate(180deg) saturate(150%)";
      if (colorMap === "sepia") filter += " sepia(100%) hue-rotate(10deg) saturate(120%)";
      if (sharpness > 0) filter += " contrast(130%) grayscale(20%)";
      ctx.filter = filter;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
    } else {
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(350, 50);
      ctx.lineTo(100, 450);
      ctx.moveTo(350, 50);
      ctx.lineTo(600, 450);
      ctx.stroke();
      ctx.fillStyle = "#475569";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        activeCase ? `${activeCase.name} — synthetic training frame` : "Awaiting training image / demo case",
        350,
        250
      );
    }

    measurements.forEach((m) => {
      const color = m.isGoldStandard ? "#f59e0b" : m.isAbnormal ? "#ef4444" : "#0ea5e9";
      const label = `${m.isGoldStandard ? "★ " : ""}${m.valueScaled?.toFixed(2)} ${m.unit}`;
      if (m.type === "caliper" && m.points.length === 2) {
        drawCaliper(ctx, m.points[0], m.points[1], label, color);
      } else if (m.type === "trace" && m.points.length > 0) {
        drawTrace(ctx, m.points, label, color);
      }
    });

    if (activeTool === "caliper" && currentCaliper.length === 1) {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(currentCaliper[0].x, currentCaliper[0].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (activeTool === "trace" && currentTrace.length > 0) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentTrace[0].x, currentTrace[0].y);
      for (let i = 1; i < currentTrace.length; i++) ctx.lineTo(currentTrace[i].x, currentTrace[i].y);
      ctx.stroke();
    }
  }, [image, measurements, currentCaliper, currentTrace, activeTool, brightness, contrast, colorMap, sharpness, activeCase]);

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const canDraw = image !== null || activeCase !== null;

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canDraw) return;
    const { x, y } = getCanvasCoords(e);
    if (activeTool === "caliper") {
      if (currentCaliper.length === 0) {
        setCurrentCaliper([{ x, y }]);
      } else {
        const p1 = currentCaliper[0];
        const p2 = { x, y };
        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const newM: Measurement = {
          id: Date.now().toString(),
          type: "caliper",
          structure: "Distance",
          points: [p1, p2],
          valuePx: distPx,
          valueScaled: distPx * mmPerPx,
          unit: "mm",
          isAbnormal: false,
        };
        setMeasurements((prev) => [...prev, newM]);
        setCurrentCaliper([]);
      }
    } else if (activeTool === "trace") {
      setIsDrawing(true);
      setCurrentTrace([{ x, y }]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || activeTool !== "trace") return;
    const { x, y } = getCanvasCoords(e);
    setCurrentTrace((prev) => [...prev, { x, y }]);
  };

  const handlePointerUp = () => {
    if (activeTool === "trace" && isDrawing && currentTrace.length > 5) {
      setIsDrawing(false);
      let traceLengthPx = 0;
      for (let i = 1; i < currentTrace.length; i++) {
        traceLengthPx += Math.hypot(currentTrace[i].x - currentTrace[i - 1].x, currentTrace[i].y - currentTrace[i - 1].y);
      }
      const newM: Measurement = {
        id: Date.now().toString(),
        type: "trace",
        structure: "Trace VTI / Area",
        points: currentTrace,
        valuePx: traceLengthPx,
        valueScaled: traceLengthPx * (mmPerPx / 10),
        unit: "cm",
        isAbnormal: false,
      };
      setMeasurements((prev) => [...prev, newM]);
      setCurrentTrace([]);
    } else if (activeTool === "trace") {
      setIsDrawing(false);
      setCurrentTrace([]);
    }
  };

  const drawCaliper = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, label: string, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    [p1, p2].forEach((p) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    drawLabel(ctx, label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2, color);
  };

  const drawTrace = (ctx: CanvasRenderingContext2D, points: Point[], label: string, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    const topPoint = points.reduce((prev, curr) => (curr.y < prev.y ? curr : prev));
    drawLabel(ctx, label, topPoint.x, topPoint.y - 15, color);
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) => {
    ctx.font = "600 12px sans-serif";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 6, y - 22, w + 12, 20, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y - 8);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setMeasurements([]);
      setActiveCaseId(null);
      setSkillsCheckActive(false);
      setSkillsScore(null);
    };
    img.src = URL.createObjectURL(file);
  };

  if (view === "marketing") {
    return (
      <div className="flex min-h-screen flex-col bg-slate-950">
        <ComplianceBanner collapsed={bannerCollapsed} onToggle={() => setBannerCollapsed((v) => !v)} />
        <TopNav view={view} setView={setView} />
        <MarketingView onLaunch={() => setView("workstation")} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-slate-950 font-sans text-slate-200 selection:bg-cyan-900">
      <ComplianceBanner collapsed={bannerCollapsed} onToggle={() => setBannerCollapsed((v) => !v)} />
      <TopNav view={view} setView={setView} />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Toolbar */}
        <aside className="z-10 flex w-16 flex-col items-center gap-6 border-r border-slate-800 bg-slate-900 py-6 shadow-xl">
          <ToolButton active={activeTool === "caliper"} onClick={() => setActiveTool("caliper")} color="cyan" title="Linear Caliper">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </ToolButton>
          <ToolButton active={activeTool === "trace"} onClick={() => setActiveTool("trace")} color="amber" title="Freehand Trace (VTI / Area)">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </ToolButton>
          <ToolButton active={workspaceTab === "gls"} onClick={() => setWorkspaceTab(workspaceTab === "gls" ? "canvas" : "gls")} color="purple" title="GLS Bullseye Plot">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </ToolButton>
          <div className="flex-1" />
          <button
            onClick={() => setMeasurements(measurements.filter((m) => m.isGoldStandard))}
            className="rounded-xl p-3 text-slate-500 transition-all hover:bg-slate-800 hover:text-rose-400"
            title="Clear my vectors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </aside>

        {/* Center */}
        <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[#020617]">
          <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-1.5 font-mono text-xs text-cyan-400 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500"></span>
            </span>
            {workspaceTab === "gls" ? "GLS BULLSEYE" : `${activeTool.toUpperCase()} MODE`} ACTIVE
          </div>

          {activeCase && (
            <div
              className="absolute right-4 top-4 z-10 max-w-xs rounded-lg border px-3 py-2 text-[11px] backdrop-blur"
              style={{ borderColor: `${activeCase.accent}55`, background: "rgba(15,23,42,0.85)", color: activeCase.accent }}
            >
              <p className="font-bold">{activeCase.name}</p>
              <p className="mt-0.5 text-slate-400">{activeCase.summary}</p>
            </div>
          )}

          {workspaceTab === "canvas" ? (
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="max-h-full max-w-full cursor-crosshair object-contain"
              style={{ touchAction: "none" }}
            />
          ) : (
            <GlsBullseye caseId={activeCaseId ?? "default"} peakGls={peakGls} />
          )}

          {workspaceTab === "canvas" && (
            <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-6 rounded-2xl border border-slate-700 bg-slate-900/90 p-3 shadow-2xl backdrop-blur-md transition-all duration-500 hover:bg-slate-900">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Map</span>
                <select value={colorMap} onChange={(e) => setColorMap(e.target.value as any)} className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 outline-none">
                  <option value="grayscale">High-Res Grayscale</option>
                  <option value="echo-blue">Echo Blue (TTE)</option>
                  <option value="sepia">Amber Tissue</option>
                </select>
              </div>
              <FilterSlider label="Gain" value={brightness} onChange={setBrightness} min={50} max={150} />
              <FilterSlider label="Contrast" value={contrast} onChange={setContrast} min={50} max={180} />
              <button
                onClick={() => setSharpness((s) => (s === 0 ? 1 : 0))}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  sharpness > 0 ? "bg-cyan-900 text-cyan-300" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                }`}
              >
                Edge Enhance
              </button>
            </div>
          )}
        </main>

        {/* Right Sidebar */}
        <aside className="z-20 flex h-full w-96 flex-col overflow-y-auto border-l border-slate-800 bg-slate-900 shadow-2xl">
          {/* Case Library */}
          <div className="border-b border-slate-800 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              Interactive Case Library
            </h2>
            <select
              value={activeCaseId ?? ""}
              onChange={(e) => (e.target.value ? loadCase(e.target.value) : null)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-500"
            >
              <option value="" disabled>
                Load Interactive Case...
              </option>
              {CASES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {activeCase && (
              <div className="mt-3 space-y-2">
                <p className="text-[11px] leading-relaxed text-slate-400">{activeCase.summary}</p>
                {!skillsCheckActive ? (
                  <button
                    onClick={startSkillsCheck}
                    className="w-full rounded-lg bg-slate-800 py-2 text-[11px] font-bold text-cyan-300 transition-colors hover:bg-slate-700"
                  >
                    Test My Skills →
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-cyan-900/50 bg-cyan-950/20 p-3">
                    <p className="text-[11px] text-cyan-300">
                      Gold-standard markers hidden. Place your own caliper matching <strong>{activeCase.seedMeasurements[0]?.structure}</strong>, then score.
                    </p>
                    <button
                      onClick={scoreSkillsCheck}
                      className="w-full rounded-lg bg-cyan-600 py-2 text-[11px] font-bold text-white transition-colors hover:bg-cyan-500"
                    >
                      Score My Attempt
                    </button>
                    {skillsScore !== null && (
                      <p className="text-center text-lg font-mono font-bold" style={{ color: skillsScore >= 85 ? "#10b981" : skillsScore >= 60 ? "#eab308" : "#ef4444" }}>
                        {skillsScore}% precision
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hemodynamic Engine */}
          <div className="border-b border-slate-800 bg-gradient-to-b from-slate-800/50 to-transparent p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <svg className="h-4 w-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Hemodynamic Engine
            </h2>

            {/* AVA */}
            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-inner">
              <h3 className="mb-3 border-b border-slate-800 pb-2 text-xs font-semibold text-cyan-400">Aortic Valve Area (Continuity Eq)</h3>
              <div className="space-y-3">
                <NumField label="LVOT Diameter (cm)" value={lvotDiameter} onChange={setLvotDiameter} />
                <NumField label="LVOT VTI (cm)" value={lvotVti} onChange={setLvotVti} />
                <NumField label="AV VTI (cm)" value={avVti} onChange={setAvVti} />
                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                  <span className="text-xs font-bold text-slate-300">Calculated AVA:</span>
                  <span className={`font-mono text-base font-bold ${calculatedAVA && calculatedAVA < 1.0 ? "text-rose-400" : "text-emerald-400"}`}>
                    {calculatedAVA ? `${calculatedAVA.toFixed(2)} cm²` : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* Diastology */}
            <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-inner">
              <h3 className="mb-3 border-b border-slate-800 pb-2 text-xs font-semibold text-purple-400">Diastolic Function (ASE 2016)</h3>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <MiniField label="Mitral E (m/s)" value={mitralE} onChange={setMitralE} />
                <MiniField label="Mitral A (m/s)" value={mitralA} onChange={setMitralA} />
                <MiniField label="Septal e' (cm/s)" value={ePrimeSeptal} onChange={setEPrimeSeptal} />
                <MiniField label="TR Vel (m/s)" value={trVelocity} onChange={setTrVelocity} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Average E/e′ Ratio:</span>
                <span className={`font-mono text-base font-bold ${calculatedEEPrime && calculatedEEPrime > 14 ? "text-rose-400" : "text-emerald-400"}`}>
                  {calculatedEEPrime ? calculatedEEPrime.toFixed(1) : "--"}
                </span>
              </div>
            </div>

            {/* Biplane Simpson's EF */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 shadow-inner">
              <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-semibold text-emerald-400">Biplane Simpson's LVEF</h3>
                <div className="flex overflow-hidden rounded border border-slate-700 text-[10px]">
                  <button onClick={() => setPatientSex("male")} className={`px-2 py-0.5 ${patientSex === "male" ? "bg-slate-700 text-white" : "text-slate-500"}`}>M</button>
                  <button onClick={() => setPatientSex("female")} className={`px-2 py-0.5 ${patientSex === "female" ? "bg-slate-700 text-white" : "text-slate-500"}`}>F</button>
                </div>
              </div>
              <div className="space-y-3">
                <NumField label="EDV (mL)" value={edv} onChange={setEdv} />
                <NumField label="ESV (mL)" value={esv} onChange={setEsv} />
                <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3">
                  <span className="text-xs font-bold text-slate-300">EF:</span>
                  <span className="font-mono text-base font-bold" style={{ color: efInfo?.color ?? "#94a3b8" }}>
                    {calculatedEF !== null ? `${calculatedEF.toFixed(1)}%` : "--"}
                    {efInfo ? ` · ${efInfo.label}` : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Vector Ledger */}
          <div className="flex flex-1 flex-col p-5">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Active Frame Vectors</h3>
            <div className="flex-1 space-y-2 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
              {measurements.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center p-4 text-center text-xs text-slate-600">
                  <svg className="mb-2 h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Load a case or import a training image, then use the left toolbar to place calipers or traces.
                </div>
              ) : (
                measurements.map((m, i) => (
                  <div key={m.id} className="group relative flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 p-2.5 transition-all hover:border-cyan-500/50">
                    <div>
                      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wider text-cyan-500">{m.isGoldStandard ? "gold standard" : m.type}</span>
                      <span className="text-xs font-medium text-slate-300">#{i + 1} {m.structure}</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-100">{m.valueScaled?.toFixed(2)} {m.unit}</span>
                    {!m.isGoldStandard && (
                      <button
                        onClick={() => setMeasurements(measurements.filter((item) => item.id !== m.id))}
                        className="absolute -right-2 -top-2 scale-75 rounded-full bg-rose-500 p-1 text-white opacity-0 shadow-lg transition-opacity hover:scale-100 group-hover:opacity-100"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t border-slate-800 p-4">
            <label className="block w-full cursor-pointer rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-center text-xs font-semibold text-white transition-all hover:bg-slate-700">
              Import Training Image
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              onClick={() => setReportOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all duration-300 hover:bg-blue-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 011.414.414l4.586 4.586A2 2 0 0119 9.414V19a2 2 0 01-2 2z" /></svg>
              Generate Structured Report
            </button>
          </div>
        </aside>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        activeCase={activeCase}
        measurements={measurements}
        ava={calculatedAVA}
        eOverEPrime={calculatedEEPrime}
        ef={calculatedEF}
        efInfo={efInfo}
        fields={reportFields}
        setFields={setReportFields}
      />
    </div>
  );
}

/* ============================================================================
   SMALL UI PRIMITIVES
   ========================================================================== */

function TopNav({ view, setView }: { view: AppView; setView: (v: AppView) => void }) {
  return (
    <header className="z-10 flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <div>
          <h1 className="text-lg font-bold tracking-wide text-white">AeroEcho SimStudio</h1>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-400">Educational &amp; Veterinary Simulation Engine</p>
        </div>
      </div>

      <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 p-1">
        <button
          onClick={() => setView("workstation")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "workstation" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"}`}
        >
          Workstation
        </button>
        <button
          onClick={() => setView("marketing")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${view === "marketing" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"}`}
        >
          Marketing / Pricing
        </button>
      </div>
    </header>
  );
}

function ToolButton({
  active,
  onClick,
  color,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: "cyan" | "amber" | "purple";
  title: string;
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    cyan: "bg-cyan-950 text-cyan-400 shadow-[inset_0_0_10px_rgba(6,182,212,0.3)]",
    amber: "bg-amber-950 text-amber-400 shadow-[inset_0_0_10px_rgba(245,158,11,0.3)]",
    purple: "bg-purple-950 text-purple-400 shadow-[inset_0_0_10px_rgba(168,85,247,0.3)]",
  };
  return (
    <button
      onClick={onClick}
      title={title}
      className={`rounded-xl p-3 transition-all duration-200 ${active ? styles[color] : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
    >
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {children}
      </svg>
    </button>
  );
}

function FilterSlider({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-20 accent-cyan-500" />
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-400">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-right outline-none transition-colors focus:border-cyan-500"
      />
    </div>
  );
}

function MiniField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-[10px] text-slate-500">{label}</span>
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs outline-none transition-colors focus:border-purple-500"
      />
    </div>
  );
}