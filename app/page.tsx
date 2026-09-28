"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";

// Types
interface CaliperPoint {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  structure: string;
  mode: "distance" | "doppler";
  start: CaliperPoint;
  end: CaliperPoint;
  valuePx: number;
  valueMm: number | null;
  valueVelocityMs: number | null; // m/s for Doppler
  calculatedPressureGradient: number | null; // mmHg (4 * v^2)
  isAbnormal: boolean;
  notes: string;
}

interface CardiacReferenceEntry {
  view: "PLAX" | "A4C" | "PSAX" | "A2C";
  category: "Heart Valve" | "LV Geometry" | "RV Function" | "Atrial Size";
  normalRange: (gender: "Male" | "Female") => { min: number; max: number; unit: string };
  grading: string;
  clinicalPearls: string;
}

export default function EchoMasterEnterprise() {
  // Image & Canvas State
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<CaliperPoint[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  // Calibration State (Scale Bar)
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationPoints, setCalibrationPoints] = useState<CaliperPoint[]>([]);
  const [mmPerPx, setMmPerPx] = useState<number | null>(null);
  const [calibrationScaleMm, setCalibrationScaleMm] = useState<number>(10); // Default 10mm (1cm) scale tick

  // Image Enhancement Controls
  const [brightness, setBrightness] = useState<number>(105);
  const [contrast, setContrast] = useState<number>(120);
  const [gamma, setGamma] = useState<number>(1.0);
  const [invert, setInvert] = useState<boolean>(false);
  const [colorFilter, setColorFilter] = useState<"grayscale" | "echo-cyan" | "sepia-amber" | "doppler-highlight">("echo-cyan");

  // Cardiac Patient Context
  const [patientGender, setPatientGender] = useState<"Male" | "Female">("Male");
  const [selectedStructure, setSelectedStructure] = useState<string>("Aortic Valve (AV Peak Vel)");
  const [measurementMode, setMeasurementMode] = useState<"distance" | "doppler">("doppler");
  const [activeTab, setActiveTab] = useState<"viewer" | "valves" | "atlas" | "report">("viewer");

  // EF Calculator Inputs
  const [lvidd, setLvidd] = useState<string>("48");
  const [lvids, setLvids] = useState<string>("30");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ASE Echocardiography Guidelines Database
  const cardiacDatabase: Record<string, CardiacReferenceEntry> = useMemo(
    () => ({
      "Aortic Valve (AV Peak Vel)": {
        view: "PLAX",
        category: "Heart Valve",
        normalRange: () => ({ min: 1.0, max: 2.0, unit: "m/s" }),
        grading: "Mild Stenosis: 2.6-2.9 m/s | Moderate: 3.0-4.0 m/s | Severe: > 4.0 m/s (Mean Grad > 40 mmHg)",
        clinicalPearls: "Measure CW Doppler alignment through AV orifice. Calculate peak gradient via 4v^2.",
      },
      "Mitral Valve (E/A Ratio)": {
        view: "A4C",
        category: "Heart Valve",
        normalRange: () => ({ min: 0.8, max: 1.5, unit: "ratio" }),
        grading: "Grade I Diastolic Dysfunction: < 0.8 | Grade III (Restrictive): > 2.0",
        clinicalPearls: "Place PW Doppler sample volume at Mitral leaflet tips in A4C view.",
      },
      "Mitral EPSS": {
        view: "PLAX",
        category: "Heart Valve",
        normalRange: () => ({ min: 0, max: 6, unit: "mm" }),
        grading: "Normal <= 6mm. > 10mm indicates severely reduced LV ejection fraction.",
        clinicalPearls: "Distance between anterior mitral valve leaflet peak and interventricular septum on M-Mode.",
      },
      "Tricuspid TAPSE": {
        view: "A4C",
        category: "RV Function",
        normalRange: () => ({ min: 17, max: 28, unit: "mm" }),
        grading: "Normal >= 17mm. < 17mm indicates Right Ventricular systolic dysfunction.",
        clinicalPearls: "M-Mode displacement of lateral tricuspid annulus from end-diastole to end-systole.",
      },
      "IVS Thickness (Diastole)": {
        view: "PLAX",
        category: "LV Geometry",
        normalRange: (g) => ({ min: 6, max: g === "Male" ? 10 : 9, unit: "mm" }),
        grading: "Mild Hypertrophy: 11-13mm | Moderate: 14-16mm | Severe: >= 17mm",
        clinicalPearls: "Measure perpendicular to LV long axis at level of mitral chordae at end-diastole.",
      },
      "LVID (End-Diastole)": {
        view: "PLAX",
        category: "LV Geometry",
        normalRange: (g) => ({ min: g === "Male" ? 42 : 39, max: g === "Male" ? 58 : 52, unit: "mm" }),
        grading: "Mild Dilation: Male 59-63mm (Female 53-56mm) | Severe: Male >= 69mm (Female >= 62mm)",
        clinicalPearls: "Measure internal diameter perpendicular to long axis at end-diastole.",
      },
      "LVPW Thickness (Diastole)": {
        view: "PLAX",
        category: "LV Geometry",
        normalRange: (g) => ({ min: 6, max: g === "Male" ? 10 : 9, unit: "mm" }),
        grading: "Concentric LV Remodeling or Hypertrophy evaluation.",
        clinicalPearls: "Posterior wall thickness measured at end-diastole below mitral leaflets.",
      },
      "LA Diameter (Systole)": {
        view: "PLAX",
        category: "Atrial Size",
        normalRange: (g) => ({ min: 27, max: g === "Male" ? 40 : 38, unit: "mm" }),
        grading: "Mild Enlargement: Male 41-46mm | Moderate: 47-51mm | Severe: >= 52mm",
        clinicalPearls: "Measure leading edge to leading edge at maximum aortic root opening/end-systole.",
      },
    }),
    []
  );

  // Auto Switch Mode depending on structure selection
  useEffect(() => {
    if (selectedStructure.includes("Vel") || selectedStructure.includes("Ratio")) {
      setMeasurementMode("doppler");
    } else {
      setMeasurementMode("distance");
    }
  }, [selectedStructure]);

  // Load Procedural Sample Echo Images
  const loadProceduralSample = (viewType: "PLAX" | "A4C" | "PSAX") => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw Simulated Dark Sector Ultrasound Screen
    ctx.fillStyle = "#030712";
    ctx.fillRect(0, 0, 700, 500);

    // Fan-shaped Ultrasound Sector lines
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(350, 20);
    ctx.lineTo(100, 480);
    ctx.moveTo(350, 20);
    ctx.lineTo(600, 480);
    ctx.stroke();

    // Scale Ticks (10mm markers)
    ctx.strokeStyle = "#475569";
    ctx.fillStyle = "#94a3b8";
    ctx.font = "10px monospace";
    for (let y = 80; y <= 450; y += 40) {
      ctx.beginPath();
      ctx.moveTo(610, y);
      ctx.lineTo(625, y);
      ctx.stroke();
      ctx.fillText(`${(y - 40) / 40} cm`, 630, y + 3);
    }

    // Render Procedural Heart Anatomy & Echo Speckle Noise
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.25)";

    if (viewType === "PLAX") {
      // Interventricular Septum (IVS)
      ctx.beginPath();
      ctx.ellipse(340, 200, 180, 22, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Posterior Wall
      ctx.beginPath();
      ctx.ellipse(320, 320, 170, 20, -0.2, 0, Math.PI * 2);
      ctx.fill();
      // Aortic Root & Valve Leaflets
      ctx.beginPath();
      ctx.arc(460, 210, 35, 0, Math.PI * 2);
      ctx.stroke();
      // Label overlay
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("PLAX View (Parasternal Long Axis)", 40, 40);
    } else if (viewType === "A4C") {
      // 4-Chamber Geometry (LV, RV, LA, RA)
      ctx.beginPath();
      ctx.ellipse(280, 240, 70, 130, 0.1, 0, Math.PI * 2);
      ctx.ellipse(400, 250, 60, 110, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("Apical 4-Chamber (A4C) View", 40, 40);
    } else if (viewType === "PSAX") {
      // Concentric Doughnut LV Short Axis View
      ctx.beginPath();
      ctx.arc(350, 260, 110, 0, Math.PI * 2);
      ctx.arc(350, 260, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("Parasternal Short Axis (PSAX) View", 40, 40);
    }

    // Add Ultrasound Speckle Texture
    const imgData = ctx.getImageData(0, 0, 700, 500);
    for (let i = 0; i < imgData.data.length; i += 4) {
      if (imgData.data[i] > 10) {
        const noise = (Math.random() - 0.5) * 45;
        imgData.data[i] += noise;
        imgData.data[i + 1] += noise;
        imgData.data[i + 2] += noise;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    ctx.restore();

    const newImg = new Image();
    newImg.onload = () => {
      setImage(newImg);
      setMeasurements([]);
      setPoints([]);
      setCalibrationPoints([]);
      setMmPerPx(10 / 40); // 40px = 1cm (10mm) scale tick default calibration
    };
    newImg.src = canvas.toDataURL();
  };

  // Auto Load Initial PLAX Sample Scan on Startup
  useEffect(() => {
    loadProceduralSample("PLAX");
  }, []);

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      setImage(img);
      setMeasurements([]);
      setPoints([]);
      setCalibrationPoints([]);
      setMmPerPx(null);
    };
    img.src = URL.createObjectURL(file);
  };

  // Main Canvas Render Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (image) {
      canvas.width = image.width;
      canvas.height = image.height;

      // Color Tint CSS Filters
      let filterString = `brightness(${brightness}%) contrast(${contrast}%) ${invert ? "invert(100%)" : ""}`;
      if (colorFilter === "echo-cyan") filterString += " hue-rotate(140deg) saturate(180%)";
      if (colorFilter === "sepia-amber") filterString += " sepia(100%) hue-rotate(10deg)";
      if (colorFilter === "doppler-highlight") filterString += " saturate(300%) contrast(150%)";

      ctx.filter = filterString;
      ctx.drawImage(image, 0, 0);
      ctx.filter = "none";
    }

    // Render Scale Calibration Line (Cyan)
    if (calibrationPoints.length === 2) {
      drawCaliperLine(ctx, calibrationPoints[0], calibrationPoints[1], `Scale: ${calibrationScaleMm}mm`, "#06b6d4");
    }

    // Render Measurements & Heart Valve Vectors
    measurements.forEach((m, idx) => {
      let label = "";
      if (m.mode === "doppler") {
        label = `#${idx + 1} ${m.structure}: ${m.valueVelocityMs?.toFixed(2)} m/s (ΔP ${m.calculatedPressureGradient?.toFixed(1)} mmHg)`;
      } else {
        label = `#${idx + 1} ${m.structure}: ${m.valueMm ? m.valueMm.toFixed(1) + " mm" : m.valuePx.toFixed(1) + " px"}`;
      }
      const color = m.isAbnormal ? "#ef4444" : "#10b981";
      drawCaliperLine(ctx, m.start, m.end, label, color);
    });

    // Active Placement Point
    if (points.length === 1) {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [image, points, measurements, calibrationPoints, brightness, contrast, invert, colorFilter, calibrationScaleMm]);

  // Handle Canvas Clicking
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Scale Calibration Mode
    if (isCalibrating) {
      if (calibrationPoints.length === 0) {
        setCalibrationPoints([{ x: clickX, y: clickY }]);
      } else if (calibrationPoints.length === 1) {
        const start = calibrationPoints[0];
        const end = { x: clickX, y: clickY };
        const distPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        const ratio = calibrationScaleMm / distPx;

        setMmPerPx(ratio);
        setCalibrationPoints([start, end]);
        setIsCalibrating(false);
      }
      return;
    }

    // Regular Cardiac Caliper
    if (points.length === 0) {
      setPoints([{ x: clickX, y: clickY }]);
    } else if (points.length === 1) {
      const start = points[0];
      const end = { x: clickX, y: clickY };
      const distPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      let velocityMs: number | null = null;
      let pressureGradient: number | null = null;
      let distMm: number | null = mmPerPx ? distPx * mmPerPx : null;
      let isAbnormal = false;

      // Doppler Mode Calculation (Bernoulli ΔP = 4 * v^2)
      if (measurementMode === "doppler") {
        velocityMs = Number((distPx / 80).toFixed(2)); // Scale factor simulation for Doppler trace peak
        pressureGradient = Number((4 * Math.pow(velocityMs, 2)).toFixed(1));
        isAbnormal = velocityMs > 2.5;
      } else {
        const norm = cardiacDatabase[selectedStructure]?.normalRange(patientGender);
        if (norm && distMm !== null) {
          isAbnormal = distMm < norm.min || distMm > norm.max;
        }
      }

      const newM: Measurement = {
        id: Math.random().toString(36).substr(2, 9),
        structure: selectedStructure,
        mode: measurementMode,
        start,
        end,
        valuePx: distPx,
        valueMm: distMm,
        valueVelocityMs: velocityMs,
        calculatedPressureGradient: pressureGradient,
        isAbnormal,
        notes: cardiacDatabase[selectedStructure]?.clinicalPearls || "",
      };

      setMeasurements([...measurements, newM]);
      setPoints([]);
    }
  };

  const drawCaliperLine = (ctx: CanvasRenderingContext2D, start: CaliperPoint, end: CaliperPoint, label: string, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Caliper Crosshairs
    [start, end].forEach((p) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Label Backdrop Box
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.font = "bold 12px sans-serif";
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(3, 7, 18, 0.9)";
    ctx.fillRect(midX + 6, midY - 18, textWidth + 12, 22);

    ctx.fillStyle = color;
    ctx.fillText(label, midX + 12, midY - 3);
  };

  // Teichholz LV Ejection Fraction Calculation
  const calculatedEF = useMemo(() => {
    const d = parseFloat(lvidd);
    const s = parseFloat(lvids);
    if (isNaN(d) || isNaN(s) || d <= 0) return null;
    const edv = (7.0 / (2.4 + d)) * Math.pow(d, 3);
    const esv = (7.0 / (2.4 + s)) * Math.pow(s, 3);
    const ef = ((edv - esv) / edv) * 100;
    return Math.min(Math.max(Math.round(ef), 10), 85);
  }, [lvidd, lvids]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-cyan-950">
            ♥
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              EchoMaster Pro <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-800 px-2.5 py-0.5 rounded-full font-mono">ASE Cardiac Edition v3.0</span>
            </h1>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("viewer")}
            className={`px-4 py-2 rounded-lg transition ${activeTab === "viewer" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Echo Scan Workspace
          </button>
          <button
            onClick={() => setActiveTab("valves")}
            className={`px-4 py-2 rounded-lg transition ${activeTab === "valves" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Heart Valve Engine
          </button>
          <button
            onClick={() => setActiveTab("atlas")}
            className={`px-4 py-2 rounded-lg transition ${activeTab === "atlas" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Pathology Atlas
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-4 py-2 rounded-lg transition ${activeTab === "report" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            EHR Echo Report
          </button>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Canvas / Content View */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          {activeTab === "viewer" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col flex-1">
              {/* Sample Images & Tool Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-semibold">Sample Echoes:</span>
                  <button
                    onClick={() => loadProceduralSample("PLAX")}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-2.5 py-1.5 rounded-lg"
                  >
                    PLAX
                  </button>
                  <button
                    onClick={() => loadProceduralSample("A4C")}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-2.5 py-1.5 rounded-lg"
                  >
                    A4C
                  </button>
                  <button
                    onClick={() => loadProceduralSample("PSAX")}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 px-2.5 py-1.5 rounded-lg"
                  >
                    PSAX
                  </button>
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition shadow">
                    Upload Scan
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                </div>

                {/* Scale Calibration Trigger */}
                <button
                  onClick={() => {
                    setIsCalibrating(true);
                    setCalibrationPoints([]);
                  }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition ${
                    isCalibrating
                      ? "bg-amber-500 text-slate-950 border-amber-400 animate-pulse"
                      : mmPerPx
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {isCalibrating ? "Click Scale Tick..." : mmPerPx ? `Scale Set (${(10 * mmPerPx).toFixed(1)} mm/cm)` : "Calibrate Scale (mm)"}
                </button>
              </div>

              {/* Echo Tuning / Contrast Toolbar */}
              <div className="mb-3 flex flex-wrap items-center justify-between text-xs bg-slate-950 p-2.5 rounded-xl border border-slate-800 gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 font-medium">Color Map:</label>
                  <select
                    value={colorFilter}
                    onChange={(e) => setColorFilter(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200"
                  >
                    <option value="echo-cyan">Echo Blue (High Contrast)</option>
                    <option value="sepia-amber">Amber / Sepia Tint</option>
                    <option value="grayscale">Standard Grayscale</option>
                    <option value="doppler-highlight">Doppler Flow Highlight</option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-slate-400">Gain/Bright: {brightness}%</label>
                  <input type="range" min="60" max="160" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-16 accent-blue-500" />
                  <label className="text-slate-400">Contrast: {contrast}%</label>
                  <input type="range" min="60" max="180" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-16 accent-blue-500" />
                  <button onClick={() => setInvert(!invert)} className={`px-2 py-1 rounded border ${invert ? "bg-cyan-950 text-cyan-400 border-cyan-800" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                    Invert
                  </button>
                </div>
              </div>

              {/* Canvas Viewport */}
              <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800 min-h-[460px]">
                <canvas ref={canvasRef} onClick={handleCanvasClick} width={700} height={500} className="max-w-full max-h-[600px] cursor-crosshair object-contain" />
              </div>
            </div>
          )}

          {/* Heart Valve Analysis View */}
          {activeTab === "valves" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Valvular Hemodynamics & Bernoulli Physics Engine</h2>
                <p className="text-xs text-slate-400">Hemodynamic calculations according to ASE & ACC/AHA valvular heart disease guidelines</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Bernoulli Converter Box */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-sm text-cyan-400">Peak Pressure Gradient Calculator (Bernoulli)</h3>
                  <p className="text-xs text-slate-400">Simplified equation: $\Delta P = 4 \times V^2$</p>
                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="Peak Velocity (m/s)"
                      className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-sm text-white w-36"
                      id="vel-input"
                      onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        const p = document.getElementById("grad-result");
                        if (p && !isNaN(v)) {
                          p.innerText = `${(4 * v * v).toFixed(1)} mmHg`;
                        }
                      }}
                    />
                    <span className="text-xs text-slate-400">m/s →</span>
                    <span id="grad-result" className="text-lg font-bold font-mono text-emerald-400">0.0 mmHg</span>
                  </div>
                </div>

                {/* Teichholz Ejection Fraction Calculator */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-sm text-cyan-400">LV Ejection Fraction (Teichholz M-Mode)</h3>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-slate-400 block mb-1">LVIDd (mm):</label>
                      <input type="number" value={lvidd} onChange={(e) => setLvidd(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                    </div>
                    <div>
                      <label className="text-slate-400 block mb-1">LVIDs (mm):</label>
                      <input type="number" value={lvids} onChange={(e) => setLvids(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white" />
                    </div>
                  </div>
                  <div className="pt-1 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Calculated EF %:</span>
                    <span className={`text-base font-bold font-mono ${calculatedEF && calculatedEF < 50 ? "text-rose-400" : "text-emerald-400"}`}>
                      {calculatedEF ? `${calculatedEF}%` : "--"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cardiac Atlas */}
          {activeTab === "atlas" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">Echocardiographic Pathology Atlas</h2>
                <p className="text-xs text-slate-400">Reference diagnostic criteria for common valvular and myocardial diseases</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="font-bold text-slate-200 text-sm">Severe Aortic Stenosis (AS)</h3>
                  <ul className="list-disc list-inside text-slate-400 space-y-1">
                    <li>AV Peak Velocity: <strong>&ge; 4.0 m/s</strong></li>
                    <li>Mean Pressure Gradient: <strong>&ge; 40 mmHg</strong></li>
                    <li>Aortic Valve Area (AVA): <strong>&lt; 1.0 cm²</strong></li>
                  </ul>
                </div>
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <h3 className="font-bold text-slate-200 text-sm">Severe Mitral Regurgitation (MR)</h3>
                  <ul className="list-disc list-inside text-slate-400 space-y-1">
                    <li>Vena Contracta Width: <strong>&ge; 7 mm</strong></li>
                    <li>Regurgitant Volume: <strong>&ge; 60 mL</strong></li>
                    <li>E-wave Dominant inflow (&gt; 1.2 m/s)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* EHR Technical Echo Report */}
          {activeTab === "report" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Preliminary Adult Echocardiogram Report</h2>
                  <p className="text-xs text-slate-400">Formatted for Epic / Cerner / PACS Echo Worksheet integration</p>
                </div>
                <button
                  onClick={() => {
                    const text = document.getElementById("echo-report")?.innerText;
                    if (text) navigator.clipboard.writeText(text);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                >
                  Copy WorkSheet
                </button>
              </div>

              <div id="echo-report" className="bg-slate-950 border border-slate-800 rounded-xl p-5 font-mono text-xs text-slate-300 leading-relaxed space-y-3">
                <p className="text-slate-500">// ASE PRELIMINARY ECHOCARDIOGRAPHY WORKSHEET</p>
                <p><strong>PATIENT GENDER:</strong> {patientGender.toUpperCase()} | <strong>ESTIMATED LV EF:</strong> {calculatedEF}%</p>
                <div className="border-t border-slate-800 pt-2">
                  <p className="text-slate-400 mb-1">VALVULAR & CHAMBER MEASUREMENTS:</p>
                  {measurements.length === 0 ? (
                    <p className="italic text-slate-600">No active caliper vector measurements recorded on echo scan.</p>
                  ) : (
                    measurements.map((m, idx) => (
                      <p key={idx} className={m.isAbnormal ? "text-rose-400 font-bold" : "text-emerald-400"}>
                        #{idx + 1} {m.structure}: {m.mode === "doppler" ? `${m.valueVelocityMs} m/s (Peak Gradient: ${m.calculatedPressureGradient} mmHg)` : `${m.valueMm?.toFixed(1)} mm`} - {m.isAbnormal ? "ABNORMAL / EXCEEDS ASE LIMITS" : "Within WNL Range"}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Controls & Active Calipers */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-base font-bold text-white">ASE Measurement Protocols</h2>
              <p className="text-xs text-slate-400">Cardiac structure & Doppler selection</p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-400 mb-1">Patient Sex (ASE Normals)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPatientGender("Male")}
                    className={`py-2 rounded-lg font-bold border ${patientGender === "Male" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-950 text-slate-400 border-slate-800"}`}
                  >
                    Male
                  </button>
                  <button
                    onClick={() => setPatientGender("Female")}
                    className={`py-2 rounded-lg font-bold border ${patientGender === "Female" ? "bg-blue-600 text-white border-blue-500" : "bg-slate-950 text-slate-400 border-slate-800"}`}
                  >
                    Female
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-400 mb-1">Target Cardiac Structure</label>
                <select
                  value={selectedStructure}
                  onChange={(e) => setSelectedStructure(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white"
                >
                  {Object.keys(cardiacDatabase).map((struct) => (
                    <option key={struct} value={struct}>
                      {struct} ({cardiacDatabase[struct].view})
                    </option>
                  ))}
                </select>
              </div>

              {/* Threshold Banner */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-center font-semibold">
                  <span className="text-slate-400">ASE Normal Range:</span>
                  <span className="text-emerald-400 font-mono">
                    {cardiacDatabase[selectedStructure]?.normalRange(patientGender).min} - {cardiacDatabase[selectedStructure]?.normalRange(patientGender).max}{" "}
                    {cardiacDatabase[selectedStructure]?.normalRange(patientGender).unit}
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {cardiacDatabase[selectedStructure]?.clinicalPearls}
                </p>
              </div>

              {/* Active Measurements List */}
              <div>
                <h3 className="font-semibold text-slate-300 mb-2 uppercase tracking-wider text-[11px]">Recorded Measurements</h3>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 max-h-[200px] overflow-y-auto">
                  {measurements.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No calipers placed on echo frame</p>
                  ) : (
                    measurements.map((m, idx) => (
                      <div key={m.id} className={`p-2 rounded-lg border text-xs flex justify-between items-center ${m.isAbnormal ? "bg-rose-950/40 border-rose-800 text-rose-300" : "bg-slate-900 border-slate-800 text-slate-300"}`}>
                        <div>
                          <p className="font-bold text-white">#{idx + 1} {m.structure}</p>
                          <p className="text-[10px] text-slate-500">{m.mode === "doppler" ? `Gradient: ${m.calculatedPressureGradient} mmHg` : "Distance"}</p>
                        </div>
                        <span className="font-mono font-bold">
                          {m.mode === "doppler" ? `${m.valueVelocityMs} m/s` : `${m.valueMm?.toFixed(1)} mm`}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}