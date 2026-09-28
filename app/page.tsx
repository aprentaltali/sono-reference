"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";

interface CaliperPoint {
  x: number;
  y: number;
}

interface Measurement {
  id: string;
  organ: string;
  start: CaliperPoint;
  end: CaliperPoint;
  distancePx: number;
  distanceMm: number | null;
  isAbnormal: boolean;
}

interface ReferenceEntry {
  category: string;
  baseNormalMaxMm: (age: number, flags: Record<string, boolean>) => number;
  unit: string;
  notes: string;
  pathologyExamples: { title: string; desc: string; type: "normal" | "abnormal" | "artifact" }[];
}

export default function SonoReferenceEnterprise() {
  // Image & Canvas State
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<CaliperPoint[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  
  // Image Processing Filters
  const [brightness, setBrightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [invert, setInvert] = useState<boolean>(false);

  // Calibration State (Scale Bar)
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationPoints, setCalibrationPoints] = useState<CaliperPoint[]>([]);
  const [mmPerPx, setMmPerPx] = useState<number | null>(null); // mm per pixel multiplier
  const [calibrationScaleMm, setCalibrationScaleMm] = useState<number>(10); // Default 10mm (1cm)

  // Patient & Clinical State
  const [selectedOrgan, setSelectedOrgan] = useState<string>("Common Bile Duct");
  const [patientAge, setPatientAge] = useState<number>(45);
  const [isPostCholecystectomy, setIsPostCholecystectomy] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"viewer" | "atlas" | "report" | "quiz">("viewer");

  // Quiz / Student Mode State
  const [quizAnswer, setQuizAnswer] = useState<string>("");
  const [quizScore, setQuizScore] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Expanded Clinical Database
  const referenceDatabase: Record<string, ReferenceEntry> = useMemo(
    () => ({
      "Common Bile Duct": {
        category: "Abdominal / Hepatobiliary",
        baseNormalMaxMm: (age, flags) => {
          if (flags.postCholecystectomy) return 10;
          return age > 60 ? 6 + Math.floor((age - 60) / 10) : 6;
        },
        unit: "mm",
        notes: "Normal <=6mm up to age 60. Add 1mm per decade over 60. Up to 10mm normal post-cholecystectomy.",
        pathologyExamples: [
          { title: "Normal CBD", desc: "Anechoic tubular structure anterior to portal vein.", type: "normal" },
          { title: "Choledocholithiasis", desc: "Echogenic focus within duct with distal acoustic shadowing.", type: "abnormal" },
          { title: "Reverberation Artifact", desc: "Parallel repetitive lines near anterior duct wall.", type: "artifact" },
        ],
      },
      "Gallbladder Wall": {
        category: "Abdominal / Hepatobiliary",
        baseNormalMaxMm: () => 3,
        unit: "mm",
        notes: "Measure anterior wall in transverse plane. >3mm indicates cholecystitis, ascites, or heart failure.",
        pathologyExamples: [
          { title: "Normal GB Wall", desc: "Thin hyperechoic rim < 3mm.", type: "normal" },
          { title: "Acute Cholecystitis", desc: "Thickened wall >3mm with pericholecystic fluid and positive Murphy's sign.", type: "abnormal" },
        ],
      },
      "Abdominal Aorta": {
        category: "Vascular",
        baseNormalMaxMm: () => 30,
        unit: "mm",
        notes: "Outer-to-outer margin measurement. >30mm (3cm) is diagnostic for Abdominal Aortic Aneurysm (AAA).",
        pathologyExamples: [
          { title: "Normal Aorta", desc: "Tapering vascular lumen < 25mm.", type: "normal" },
          { title: "Fusiform AAA", desc: "Aneurysmal dilation > 30mm with mural thrombus.", type: "abnormal" },
        ],
      },
      "Kidney Length": {
        category: "Renal",
        baseNormalMaxMm: () => 120,
        unit: "mm",
        notes: "Normal renal sagittal length: 90mm - 120mm. Bilateral disparity >20mm suggests renal artery stenosis or renal atrophy.",
        pathologyExamples: [
          { title: "Normal Kidney", desc: "Distinct corticomedullary differentiation, central echogenic sinus.", type: "normal" },
          { title: "Hydronephrosis", desc: "Anatomic dilation of the renal pelvis and calyces.", type: "abnormal" },
        ],
      },
      "Thyroid Isthmus": {
        category: "Small Parts",
        baseNormalMaxMm: () => 3,
        unit: "mm",
        notes: "Transverse view anterior to trachea. >3mm suggests diffuse goiter.",
        pathologyExamples: [
          { title: "Normal Thyroid", desc: "Homogeneous medium-level echogenicity.", type: "normal" },
          { title: "Multinodular Goiter", desc: "Enlarged gland with heterogeneous solid/cystic nodules.", type: "abnormal" },
        ],
      },
    }),
    []
  );

  const currentThreshold = referenceDatabase[selectedOrgan]?.baseNormalMaxMm(patientAge, {
    postCholecystectomy: isPostCholecystectomy,
  });

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

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (image) {
      canvas.width = image.width;
      canvas.height = image.height;

      // Apply CSS Filters to Canvas Context
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) ${invert ? "invert(100%)" : "none"}`;
      ctx.drawImage(image, 0, 0);
      ctx.filter = "none"; // Reset filter for drawing calipers
    } else {
      ctx.fillStyle = "#0F172A";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#64748B";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Upload Ultrasound Frame / DICOM Export", canvas.width / 2, canvas.height / 2);
    }

    // Draw Calibration Line (Blue)
    if (calibrationPoints.length === 2) {
      drawCaliperLine(ctx, calibrationPoints[0], calibrationPoints[1], `Scale: ${calibrationScaleMm}mm`, "#3B82F6");
    }

    // Draw Active Calibration Point
    if (calibrationPoints.length === 1) {
      ctx.fillStyle = "#3B82F6";
      ctx.beginPath();
      ctx.arc(calibrationPoints[0].x, calibrationPoints[0].y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Measurements
    measurements.forEach((m, idx) => {
      const label = m.distanceMm !== null ? `${m.distanceMm.toFixed(1)} mm` : `${m.distancePx.toFixed(1)} px`;
      const color = m.isAbnormal ? "#EF4444" : "#10B981";
      drawCaliperLine(ctx, m.start, m.end, `#${idx + 1} ${m.organ}: ${label}`, color);
    });

    // Draw Active Placement Point
    if (points.length === 1) {
      ctx.fillStyle = "#F59E0B";
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [image, points, measurements, calibrationPoints, brightness, contrast, invert, calibrationScaleMm]);

  // Handle Canvas Click
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    // Handle Calibration Setup
    if (isCalibrating) {
      if (calibrationPoints.length === 0) {
        setCalibrationPoints([{ x: clickX, y: clickY }]);
      } else if (calibrationPoints.length === 1) {
        const start = calibrationPoints[0];
        const end = { x: clickX, y: clickY };
        const distPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

        const calculatedMmPerPx = calibrationScaleMm / distPx;
        setMmPerPx(calculatedMmPerPx);
        setCalibrationPoints([start, end]);
        setIsCalibrating(false);

        // Recalculate existing measurements
        setMeasurements((prev) =>
          prev.map((m) => {
            const mm = m.distancePx * calculatedMmPerPx;
            return {
              ...m,
              distanceMm: mm,
              isAbnormal: mm > currentThreshold,
            };
          })
        );
      }
      return;
    }

    // Handle Regular Caliper Measurement
    if (points.length === 0) {
      setPoints([{ x: clickX, y: clickY }]);
    } else if (points.length === 1) {
      const start = points[0];
      const end = { x: clickX, y: clickY };
      const distPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      const distMm = mmPerPx ? distPx * mmPerPx : null;
      const isAbnormal = distMm !== null ? distMm > currentThreshold : false;

      const newMeasurement: Measurement = {
        id: Math.random().toString(36).substr(2, 9),
        organ: selectedOrgan,
        start,
        end,
        distancePx: distPx,
        distanceMm: distMm,
        isAbnormal,
      };

      setMeasurements([...measurements, newMeasurement]);
      setPoints([]);
    }
  };

  const drawCaliperLine = (
    ctx: CanvasRenderingContext2D,
    start: CaliperPoint,
    end: CaliperPoint,
    label: string,
    color: string
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Crosshairs
    [start, end].forEach((p) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Label Box
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;

    ctx.font = "bold 13px sans-serif";
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(midX + 6, midY - 18, textWidth + 12, 22);

    ctx.fillStyle = color;
    ctx.fillText(label, midX + 12, midY - 3);
  };

  // AI Auto-Caliper Simulation
  const handleSimulateAI = () => {
    if (!image) return;

    // Simulate auto-detecting boundaries on the canvas
    const start = { x: image.width * 0.4, y: image.height * 0.45 };
    const end = { x: image.width * 0.4, y: image.height * 0.58 };
    const distPx = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
    const distMm = mmPerPx ? distPx * mmPerPx : 7.2;
    const isAbnormal = distMm > currentThreshold;

    const aiMeasurement: Measurement = {
      id: "ai-" + Date.now(),
      organ: selectedOrgan,
      start,
      end,
      distancePx: distPx,
      distanceMm: distMm,
      isAbnormal,
    };

    setMeasurements([...measurements, aiMeasurement]);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header & Navigation */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-black text-white text-lg shadow-lg shadow-cyan-900/40">
            SR
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              SonoReference Enterprise <span className="text-xs bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">v2.0 Clinical</span>
            </h1>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-sm">
          <button
            onClick={() => setActiveTab("viewer")}
            className={`px-4 py-1.5 rounded-lg font-medium transition ${activeTab === "viewer" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Clinical Workspace
          </button>
          <button
            onClick={() => setActiveTab("atlas")}
            className={`px-4 py-1.5 rounded-lg font-medium transition ${activeTab === "atlas" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Pathology Atlas
          </button>
          <button
            onClick={() => setActiveTab("report")}
            className={`px-4 py-1.5 rounded-lg font-medium transition ${activeTab === "report" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            EHR Worksheet
          </button>
          <button
            onClick={() => setActiveTab("quiz")}
            className={`px-4 py-1.5 rounded-lg font-medium transition ${activeTab === "quiz" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-slate-200"}`}
          >
            Student Quiz
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Workspace (Viewer or Atlas or Report) */}
        <div className="lg:col-span-8 flex flex-col space-y-4">
          {activeTab === "viewer" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col flex-1">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition shadow">
                    Import Ultrasound
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>

                  {/* Calibration Trigger */}
                  <button
                    onClick={() => {
                      setIsCalibrating(true);
                      setCalibrationPoints([]);
                    }}
                    className={`text-xs px-3 py-2 rounded-lg font-semibold border transition ${
                      isCalibrating
                        ? "bg-amber-500 text-slate-950 border-amber-400 animate-pulse"
                        : mmPerPx
                        ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    {isCalibrating
                      ? "Click Scale Line on Image..."
                      : mmPerPx
                      ? `Calibrated (${(1 / mmPerPx).toFixed(1)} px/mm)`
                      : "Calibrate Scale (mm)"}
                  </button>

                  <button
                    onClick={handleSimulateAI}
                    disabled={!image}
                    className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-3 py-2 rounded-lg font-semibold border border-purple-500 shadow disabled:opacity-40"
                  >
                    AI Auto-Caliper
                  </button>
                </div>

                {/* Image Filters */}
                <div className="flex items-center gap-3 text-xs bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <label className="text-slate-400">Bright: {brightness}%</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-16 accent-blue-500"
                  />
                  <label className="text-slate-400">Contrast: {contrast}%</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={contrast}
                    onChange={(e) => setContrast(Number(e.target.value))}
                    className="w-16 accent-blue-500"
                  />
                  <button
                    onClick={() => setInvert(!invert)}
                    className={`px-2 py-1 rounded border ${invert ? "bg-cyan-900 text-cyan-300 border-cyan-700" : "bg-slate-800 text-slate-400 border-slate-700"}`}
                  >
                    Invert
                  </button>
                </div>
              </div>

              {/* Calibration Scale Input Modal/Bar */}
              {isCalibrating && (
                <div className="mb-3 bg-amber-950/70 border border-amber-800 rounded-lg p-2.5 flex items-center justify-between text-xs text-amber-200">
                  <span>Click two points along the ultrasound depth scale bar on the image to set millimeter ratio.</span>
                  <div className="flex items-center gap-2">
                    <label>Scale length:</label>
                    <input
                      type="number"
                      value={calibrationScaleMm}
                      onChange={(e) => setCalibrationScaleMm(Number(e.target.value))}
                      className="w-14 bg-slate-900 border border-amber-700 rounded px-1.5 py-0.5 text-white"
                    />
                    <span>mm</span>
                  </div>
                </div>
              )}

              {/* Canvas Viewport */}
              <div className="flex-1 flex items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800 min-h-[460px]">
                <canvas
                  ref={canvasRef}
                  onClick={handleCanvasClick}
                  width={680}
                  height={480}
                  className="max-w-full max-h-[620px] cursor-crosshair object-contain"
                />
              </div>

              {/* Status Footer */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {isCalibrating
                    ? "Calibration Mode Active"
                    : mmPerPx
                    ? "Millimeter Mode Active"
                    : "Uncalibrated (Pixel Mode)"}
                </span>
                <button
                  onClick={() => {
                    setMeasurements([]);
                    setPoints([]);
                    setCalibrationPoints([]);
                  }}
                  className="text-slate-500 hover:text-rose-400 transition"
                >
                  Reset Workspace
                </button>
              </div>
            </div>
          )}

          {/* Pathology Atlas View */}
          {activeTab === "atlas" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Pathology & Artifact Comparison Atlas</h2>
                <p className="text-xs text-slate-400">High-yield reference library for differential diagnoses</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {referenceDatabase[selectedOrgan]?.pathologyExamples.map((ex, i) => (
                  <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="font-semibold text-sm text-slate-100">{ex.title}</h3>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          ex.type === "normal"
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : ex.type === "abnormal"
                            ? "bg-rose-950 text-rose-400 border border-rose-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {ex.type}
                      </span>
                    </div>
                    <div className="h-32 bg-slate-900 rounded-lg flex items-center justify-center border border-slate-800 text-xs text-slate-600 italic">
                      [Ultrasound Sample Scan: {ex.title}]
                    </div>
                    <p className="text-xs text-slate-400">{ex.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* EHR Preliminary Worksheet View */}
          {activeTab === "report" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">EHR Preliminary Technical Worksheet</h2>
                  <p className="text-xs text-slate-400">Copy-paste clinical findings into Epic / Cerner / PACS</p>
                </div>
                <button
                  onClick={() => {
                    const text = document.getElementById("report-text")?.innerText;
                    if (text) navigator.clipboard.writeText(text);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                >
                  Copy Report to Clipboard
                </button>
              </div>

              <div id="report-text" className="bg-slate-950 border border-slate-800 rounded-xl p-5 font-mono text-xs text-slate-300 leading-relaxed space-y-3">
                <p className="text-slate-500">// SONOREFERENCE PRELIMINARY ULTRASOUND WORKSHEET</p>
                <p><strong className="text-slate-100">PATIENT AGE:</strong> {patientAge} Y/O | <strong className="text-slate-100">FLAGS:</strong> {isPostCholecystectomy ? "Post-Cholecystectomy" : "None"}</p>
                <p><strong className="text-slate-100">EXAM STRUCTURE:</strong> {selectedOrgan}</p>
                <p><strong className="text-slate-100">DYNAMIC NORMAL THRESHOLD:</strong> &lt;= {currentThreshold} mm</p>
                <div className="border-t border-slate-800 my-2 pt-2">
                  <p className="text-slate-400 mb-1">FINDINGS / MEASUREMENTS:</p>
                  {measurements.length === 0 ? (
                    <p className="italic text-slate-600">No active caliper measurements recorded on frame.</p>
                  ) : (
                    measurements.map((m, idx) => (
                      <p key={idx} className={m.isAbnormal ? "text-rose-400 font-bold" : "text-emerald-400"}>
                        Measurement #{idx + 1} ({m.organ}): {m.distanceMm ? `${m.distanceMm.toFixed(1)} mm` : `${m.distancePx.toFixed(1)} px`} - {m.isAbnormal ? "EXCEEDS THRESHOLD (ABNORMAL)" : "Within Normal Limits"}
                      </p>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-800 pt-2 text-slate-400">
                  <p><strong className="text-slate-200">IMPRESSION:</strong> {measurements.some((m) => m.isAbnormal) ? "Abnormal measurement detected. Radiologist evaluation recommended." : "Selected structures demonstrate normal acoustic parameters."}</p>
                </div>
              </div>
            </div>
          )}

          {/* Student Quiz Mode */}
          {activeTab === "quiz" && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Sonography Knowledge Assessment</h2>
                  <p className="text-xs text-slate-400">Educational clinical decision support module</p>
                </div>
                <div className="text-xs bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
                  Score: <span className="text-emerald-400 font-bold">{quizScore.correct}</span> / {quizScore.total}
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <p className="text-sm text-slate-200 font-medium">
                  Question: A {patientAge}-year-old patient presents for an abdominal ultrasound {isPostCholecystectomy ? "(Status-Post Cholecystectomy)" : ""}. What is the upper limit of normal for the <strong className="text-cyan-400">{selectedOrgan}</strong>?
                </p>

                <div className="flex gap-3">
                  <input
                    type="number"
                    placeholder="Enter mm"
                    value={quizAnswer}
                    onChange={(e) => setQuizAnswer(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white w-32"
                  />
                  <button
                    onClick={() => {
                      const num = Number(quizAnswer);
                      const correct = num === currentThreshold;
                      setQuizScore({
                        correct: quizScore.correct + (correct ? 1 : 0),
                        total: quizScore.total + 1,
                      });
                      alert(correct ? "Correct! Perfect measurement parameter." : `Incorrect. Normal threshold for this patient is <= ${currentThreshold} mm.`);
                      setQuizAnswer("");
                    }}
                    className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg"
                  >
                    Submit Answer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Dynamic Protocols & Caliper Log */}
        <div className="lg:col-span-4 flex flex-col space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
            <div>
              <h2 className="text-base font-bold text-white">Dynamic Reference Rules</h2>
              <p className="text-xs text-slate-400">Real-time demographic adjustment</p>
            </div>

            {/* Controls */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Select Anatomy / Organ</label>
                <select
                  value={selectedOrgan}
                  onChange={(e) => setSelectedOrgan(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500"
                >
                  {Object.keys(referenceDatabase).map((organ) => (
                    <option key={organ} value={organ}>
                      {organ} ({referenceDatabase[organ].category})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1.5">
                  <span>Patient Age</span>
                  <span className="text-cyan-400 font-mono">{patientAge} Y/O</span>
                </div>
                <input
                  type="range"
                  min="18"
                  max="100"
                  value={patientAge}
                  onChange={(e) => setPatientAge(Number(e.target.value))}
                  className="w-full accent-blue-500"
                />
              </div>

              {selectedOrgan === "Common Bile Duct" && (
                <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                  <input
                    type="checkbox"
                    checked={isPostCholecystectomy}
                    onChange={(e) => setIsPostCholecystectomy(e.target.checked)}
                    className="rounded accent-blue-500"
                  />
                  <span>Status-Post Cholecystectomy</span>
                </label>
              )}
            </div>

            {/* Threshold Banner */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Max Threshold</span>
                <span className="text-sm font-bold text-emerald-400 font-mono">
                  &lt;= {currentThreshold} {referenceDatabase[selectedOrgan]?.unit}
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {referenceDatabase[selectedOrgan]?.notes}
              </p>
            </div>

            {/* Active Caliper Measurements */}
            <div>
              <h3 className="text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">Active Frame Calipers</h3>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 max-h-[220px] overflow-y-auto">
                {measurements.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No calipers drawn on scan</p>
                ) : (
                  measurements.map((m, idx) => (
                    <div
                      key={m.id}
                      className={`flex justify-between items-center text-xs p-2.5 rounded-lg border ${
                        m.isAbnormal ? "bg-rose-950/40 border-rose-800/80 text-rose-300" : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-slate-200">#{idx + 1} {m.organ}</span>
                        <p className="text-[10px] text-slate-500">{m.isAbnormal ? "Exceeds normal" : "Normal limits"}</p>
                      </div>
                      <span className="font-mono font-bold text-sm">
                        {m.distanceMm ? `${m.distanceMm.toFixed(1)} mm` : `${m.distancePx.toFixed(1)} px`}
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
  );
}