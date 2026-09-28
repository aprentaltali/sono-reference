"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";

// --- Domain Interfaces ---
interface Point {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  type: "caliper" | "trace" | "doppler-vti";
  structure: string;
  points: Point[]; // 2 points for caliper, array for trace
  valuePx: number;
  valueScaled: number | null; // mm for distance, cm2 for area, cm for VTI
  unit: string;
  isAbnormal: boolean;
}

export default function AeroEchoWorkstation() {
  // --- Core State ---
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Active Tool State ---
  const [activeTool, setActiveTool] = useState<"caliper" | "trace" | "wmsi" | "diastology">("caliper");
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTrace, setCurrentTrace] = useState<Point[]>([]);
  const [currentCaliper, setCurrentCaliper] = useState<Point[]>([]);

  // --- Image Enhancement Filters (Reading Room Aesthetics) ---
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(115);
  const [sharpness, setSharpness] = useState(0); // Simulated via high contrast + grayscale
  const [colorMap, setColorMap] = useState<"grayscale" | "echo-blue" | "sepia">("grayscale");

  // --- Calibration ---
  const [mmPerPx, setMmPerPx] = useState<number>(0.25); // Default simulated scale (1px = 0.25mm)
  const [scaleMode, setScaleMode] = useState<"distance" | "velocity">("distance");

  // --- Hemodynamic Calculators (Continuity Equation) ---
  const [lvotDiameter, setLvotDiameter] = useState<string>("2.0"); // cm
  const [lvotVti, setLvotVti] = useState<string>("18"); // cm
  const [avVti, setAvVti] = useState<string>("45"); // cm

  // --- Diastology Wizard ---
  const [mitralE, setMitralE] = useState<string>("0.8"); // m/s
  const [mitralA, setMitralA] = useState<string>("0.6"); // m/s
  const [ePrimeSeptal, setEPrimeSeptal] = useState<string>("6"); // cm/s
  const [trVelocity, setTrVelocity] = useState<string>("2.5"); // m/s

  // --- Calculate Continuity Equation (Aortic Valve Area - AVA) ---
  const calculatedAVA = useMemo(() => {
    const d = parseFloat(lvotDiameter);
    const v1 = parseFloat(lvotVti);
    const v2 = parseFloat(avVti);
    if (isNaN(d) || isNaN(v1) || isNaN(v2) || v2 === 0) return null;
    const radius = d / 2;
    const area = Math.PI * radius * radius;
    const ava = (area * v1) / v2;
    return ava;
  }, [lvotDiameter, lvotVti, avVti]);

  // --- Calculate Diastolic E/e' Ratio ---
  const calculatedEEPrime = useMemo(() => {
    const eVel = parseFloat(mitralE) * 100; // convert m/s to cm/s
    const ePrime = parseFloat(ePrimeSeptal);
    if (isNaN(eVel) || isNaN(ePrime) || ePrime === 0) return null;
    return eVel / ePrime;
  }, [mitralE, ePrimeSeptal]);

  // --- Rendering Engine ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear and setup dark background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#020617"; // slate-950
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (image) {
      // Apply professional image filters
      let filter = `brightness(${brightness}%) contrast(${contrast}%)`;
      if (colorMap === "echo-blue") filter += " sepia(100%) hue-rotate(180deg) saturate(150%)";
      if (colorMap === "sepia") filter += " sepia(100%) hue-rotate(10deg) saturate(120%)";
      if (sharpness > 0) filter += " contrast(130%) grayscale(20%)"; // Quick sharpen simulation

      ctx.filter = filter;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
    } else {
      // Draw Placeholder Ultrasound Cone
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
      ctx.fillText("Awaiting DICOM / Image Upload", 350, 250);
    }

    // Draw Saved Measurements
    measurements.forEach((m, idx) => {
      const color = m.isAbnormal ? "#ef4444" : "#0ea5e9";
      if (m.type === "caliper" && m.points.length === 2) {
        drawCaliper(ctx, m.points[0], m.points[1], `${m.valueScaled?.toFixed(2)} ${m.unit}`, color);
      } else if (m.type === "trace" && m.points.length > 0) {
        drawTrace(ctx, m.points, `${m.valueScaled?.toFixed(1)} ${m.unit}`, color);
      }
    });

    // Draw Active Caliper
    if (activeTool === "caliper" && currentCaliper.length === 1) {
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(currentCaliper[0].x, currentCaliper[0].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Active Trace
    if (activeTool === "trace" && currentTrace.length > 0) {
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentTrace[0].x, currentTrace[0].y);
      for (let i = 1; i < currentTrace.length; i++) {
        ctx.lineTo(currentTrace[i].x, currentTrace[i].y);
      }
      ctx.stroke();
    }
  }, [image, measurements, currentCaliper, currentTrace, activeTool, brightness, contrast, colorMap, sharpness]);

  // --- Canvas Interactions ---
  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!image) return;
    const { x, y } = getCanvasCoords(e);

    if (activeTool === "caliper") {
      if (currentCaliper.length === 0) {
        setCurrentCaliper([{ x, y }]);
      } else if (currentCaliper.length === 1) {
        const p1 = currentCaliper[0];
        const p2 = { x, y };
        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        
        const newM: Measurement = {
          id: Date.now().toString(),
          type: "caliper",
          structure: "Distance",
          points: [p1, p2],
          valuePx: distPx,
          valueScaled: distPx * mmPerPx, // mm
          unit: "mm",
          isAbnormal: false,
        };
        setMeasurements([...measurements, newM]);
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
      
      // Calculate length for VTI or Area (Shoelace)
      // Here we assume VTI trace (length of path scaled)
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
        valueScaled: traceLengthPx * (mmPerPx / 10), // converting mm to cm for VTI simulation
        unit: "cm",
        isAbnormal: false,
      };
      
      setMeasurements([...measurements, newM]);
      setCurrentTrace([]);
    } else if (activeTool === "trace") {
      setIsDrawing(false);
      setCurrentTrace([]);
    }
  };

  // --- Drawing Helpers ---
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

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    drawLabel(ctx, label, midX, midY, color);
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

    // Label at highest point
    const topPoint = points.reduce((prev, curr) => (curr.y < prev.y ? curr : prev));
    drawLabel(ctx, label, topPoint.x, topPoint.y - 15, color);
  };

  const drawLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) => {
    ctx.font = "600 12px sans-serif";
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.roundRect(x - w/2 - 6, y - 22, w + 12, 20, 4);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.fillText(text, x, y - 8);
  };

  // --- File Upload ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setMeasurements([]);
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-900 overflow-hidden flex flex-col">
      
      {/* --- Top Navbar --- */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-700 shadow-[0_0_15px_rgba(6,182,212,0.4)]">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">AeroEcho Workstation</h1>
            <p className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase">ASE Clinical PACS v4.0</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col text-right">
            <span className="text-xs text-slate-400">Patient: <strong className="text-slate-200">DOE, JOHN</strong></span>
            <span className="text-xs text-slate-400">MRN: 948123-X | Study: TTE Adult</span>
          </div>
          <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-all duration-300 shadow-md">
            Import DICOM / Image
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      {/* --- Main Workspace Grid --- */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Toolbar */}
        <aside className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col items-center py-6 gap-6 z-10 shadow-xl">
          <button 
            onClick={() => setActiveTool("caliper")}
            className={`p-3 rounded-xl transition-all duration-200 ${activeTool === "caliper" ? "bg-cyan-950 text-cyan-400 shadow-[inset_0_0_10px_rgba(6,182,212,0.3)]" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title="Linear Caliper"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
          </button>
          
          <button 
            onClick={() => setActiveTool("trace")}
            className={`p-3 rounded-xl transition-all duration-200 ${activeTool === "trace" ? "bg-amber-950 text-amber-400 shadow-[inset_0_0_10px_rgba(245,158,11,0.3)]" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title="Freehand Trace (VTI / Area)"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
          </button>

          <button 
            onClick={() => setActiveTool("diastology")}
            className={`p-3 rounded-xl transition-all duration-200 ${activeTool === "diastology" ? "bg-purple-950 text-purple-400 shadow-[inset_0_0_10px_rgba(168,85,247,0.3)]" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title="Diastolic Function / Tissue Doppler"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </button>

          <button 
            onClick={() => setActiveTool("wmsi")}
            className={`p-3 rounded-xl transition-all duration-200 ${activeTool === "wmsi" ? "bg-emerald-950 text-emerald-400 shadow-[inset_0_0_10px_rgba(16,185,129,0.3)]" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
            title="Wall Motion Scoring Index (WMSI)"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>

          <div className="flex-1" />
          
          <button 
            onClick={() => setMeasurements([])}
            className="p-3 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-all"
            title="Clear All Vectors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </aside>

        {/* Center Canvas Viewport */}
        <main className="flex-1 bg-[#020617] relative flex flex-col items-center justify-center overflow-hidden">
          {/* Active Tool Badge */}
          <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-800 px-3 py-1.5 rounded-lg text-xs font-mono text-cyan-400 flex items-center gap-2 animate-fade-in z-10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            {activeTool.toUpperCase()} MODE ACTIVE
          </div>

          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className={`max-w-full max-h-full object-contain ${activeTool === 'trace' ? 'cursor-crosshair' : 'cursor-crosshair'}`}
            style={{ touchAction: 'none' }}
          />

          {/* Image Processing Filters Toolbar (Floating Bottom) */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-2xl flex gap-6 items-center shadow-2xl z-10 transition-all duration-500 hover:bg-slate-900">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">Map</span>
              <select value={colorMap} onChange={e => setColorMap(e.target.value as any)} className="bg-slate-950 border border-slate-700 text-xs rounded px-2 py-1 text-slate-200 outline-none">
                <option value="grayscale">High-Res Grayscale</option>
                <option value="echo-blue">Echo Blue (TTE)</option>
                <option value="sepia">Amber Tissue</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider w-12">Gain</span>
              <input type="range" min="50" max="150" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-20 accent-cyan-500" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider w-16">Contrast</span>
              <input type="range" min="50" max="180" value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-20 accent-cyan-500" />
            </div>
            
            <button onClick={() => setSharpness(s => s === 0 ? 1 : 0)} className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1.5 rounded-lg transition-all ${sharpness > 0 ? 'bg-cyan-900 text-cyan-300' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
              Edge Enhance
            </button>
          </div>
        </main>

        {/* Right Clinical Sidebar */}
        <aside className="w-96 bg-slate-900 border-l border-slate-800 flex flex-col h-full overflow-y-auto shadow-2xl z-20">
          
          {/* Dynamic Context Panel */}
          <div className="p-5 border-b border-slate-800 bg-gradient-to-b from-slate-800/50 to-transparent">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              Hemodynamic Engine
            </h2>

            {/* Aortic Valve Continuity Equation Module */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4 shadow-inner">
              <h3 className="text-xs font-semibold text-cyan-400 mb-3 border-b border-slate-800 pb-2">Aortic Valve Area (Continuity Eq)</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">LVOT Diameter (cm)</span>
                  <input type="number" step="0.1" value={lvotDiameter} onChange={e => setLvotDiameter(e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">LVOT VTI (cm)</span>
                  <input type="number" step="0.1" value={lvotVti} onChange={e => setLvotVti(e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">AV VTI (cm)</span>
                  <input type="number" step="0.1" value={avVti} onChange={e => setAvVti(e.target.value)} className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right outline-none focus:border-cyan-500 transition-colors" />
                </div>
                <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">Calculated AVA:</span>
                  <span className={`text-base font-mono font-bold ${calculatedAVA && calculatedAVA < 1.0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {calculatedAVA ? `${calculatedAVA.toFixed(2)} cm²` : "--"}
                  </span>
                </div>
              </div>
            </div>

            {/* Diastology Module */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-inner">
              <h3 className="text-xs font-semibold text-purple-400 mb-3 border-b border-slate-800 pb-2">Diastolic Function (ASE 2016)</h3>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <span className="block text-[10px] text-slate-500 mb-1">Mitral E (m/s)</span>
                  <input type="number" step="0.1" value={mitralE} onChange={e => setMitralE(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none focus:border-purple-500 transition-colors" />
                </div>
                <div>
                  <span className="block text-[10px] text-slate-500 mb-1">Septal e' (cm/s)</span>
                  <input type="number" step="0.1" value={ePrimeSeptal} onChange={e => setEPrimeSeptal(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs outline-none focus:border-purple-500 transition-colors" />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300">Average E/e' Ratio:</span>
                <span className={`text-base font-mono font-bold ${calculatedEEPrime && calculatedEEPrime > 14 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {calculatedEEPrime ? calculatedEEPrime.toFixed(1) : "--"}
                </span>
              </div>
            </div>
          </div>

          {/* Frame Vector Ledger */}
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Active Frame Vectors</h3>
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-3 overflow-y-auto space-y-2">
              {measurements.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs text-center p-4">
                  <svg className="w-8 h-8 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Use the left toolbar to begin tracing VTI or placing distance calipers.
                </div>
              ) : (
                measurements.map((m, i) => (
                  <div key={m.id} className="group relative bg-slate-900 border border-slate-700 rounded-lg p-2.5 flex justify-between items-center transition-all hover:border-cyan-500/50">
                    <div>
                      <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider block mb-0.5">{m.type}</span>
                      <span className="text-xs text-slate-300 font-medium">#{i+1} {m.structure}</span>
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-100">
                      {m.valueScaled?.toFixed(2)} {m.unit}
                    </span>
                    
                    {/* Hover delete button */}
                    <button 
                      onClick={() => setMeasurements(measurements.filter(item => item.id !== m.id))}
                      className="absolute -right-2 -top-2 bg-rose-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg scale-75 hover:scale-100"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Export Button */}
          <div className="p-4 border-t border-slate-800">
            <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl shadow-[0_0_15px_rgba(37,99,235,0.3)] transition-all duration-300 flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Commit to DICOM SR
            </button>
          </div>

        </aside>
      </div>
    </div>
  );
}