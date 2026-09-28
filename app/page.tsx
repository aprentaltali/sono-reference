"use client";

import React, { useState, useRef, useEffect } from "react";

interface CaliperPoint {
  x: number;
  y: number;
}

interface Measurement {
  start: CaliperPoint;
  end: CaliperPoint;
  distancePx: number;
}

export default function SonoReferenceApp() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<CaliperPoint[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [selectedOrgan, setSelectedOrgan] = useState<string>("Common Bile Duct");
  const [patientAge, setPatientAge] = useState<number>(45);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Ultrasound reference limits database
  const referenceData: Record<string, { baseNormalMaxMm: number; notes: string }> = {
    "Common Bile Duct": {
      baseNormalMaxMm: patientAge > 60 ? 6 + Math.floor((patientAge - 60) / 10) : 6,
      notes: "Add 1mm per decade over 60 years. Up to 8-10mm post-cholecystectomy.",
    },
    "Gallbladder Wall": {
      baseNormalMaxMm: 3,
      notes: "Measured on anterior wall in transverse plane. >3mm indicates thickening.",
    },
    "Kidney Length": {
      baseNormalMaxMm: 120, // 9-12 cm (90-120 mm)
      notes: "Normal range: 90mm - 120mm. Compare bilaterally (within 20mm of each other).",
    },
    "Pancreatic Duct": {
      baseNormalMaxMm: 3,
      notes: "Measured in body of pancreas. Main duct normal is <= 3mm.",
    },
  };

  // Handle Image Upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
      setImage(img);
      setMeasurements([]);
      setPoints([]);
    };
    img.src = URL.createObjectURL(file);
  };

  // Draw image, lines, and caliper markers on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (image) {
      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);
    } else {
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#9CA3AF";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Upload an ultrasound scan to begin measurement", canvas.width / 2, canvas.height / 2);
    }

    // Draw saved measurements
    measurements.forEach((m) => {
      drawCaliperLine(ctx, m.start, m.end, `${m.distancePx.toFixed(1)} px`);
    });

    // Draw active placing point
    if (points.length === 1) {
      ctx.fillStyle = "#3B82F6";
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [image, points, measurements]);

  // Handle Canvas Click to set Calipers
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    if (points.length === 0) {
      setPoints([{ x: clickX, y: clickY }]);
    } else if (points.length === 1) {
      const start = points[0];
      const end = { x: clickX, y: clickY };
      const dist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));

      setMeasurements([...measurements, { start, end, distancePx: dist }]);
      setPoints([]);
    }
  };

  const drawCaliperLine = (ctx: CanvasRenderingContext2D, start: CaliperPoint, end: CaliperPoint, label: string) => {
    // Line
    ctx.strokeStyle = "#FACC15";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    // Crosshairs
    [start, end].forEach((p) => {
      ctx.strokeStyle = "#EF4444";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Label
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    ctx.fillStyle = "#FACC15";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(label, midX + 8, midY - 8);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-8 w-8 rounded bg-blue-600 flex items-center justify-center font-bold text-white">SR</div>
          <h1 className="text-xl font-bold tracking-tight">SonoReference AI</h1>
        </div>
        <span className="text-xs bg-slate-800 text-blue-400 px-3 py-1 rounded-full font-mono border border-slate-700">
          Clinical Edition v1.0
        </span>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6">
        {/* Canvas & Editor Area */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition">
              Upload Ultrasound Image
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <button
              onClick={() => {
                setMeasurements([]);
                setPoints([]);
              }}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg border border-slate-700"
            >
              Clear Calipers
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center bg-black rounded-lg overflow-hidden border border-slate-800 min-h-[400px]">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              width={640}
              height={480}
              className="max-w-full max-h-[600px] cursor-crosshair object-contain"
            />
          </div>
          <p className="text-xs text-slate-400 mt-3 text-center">
            Click twice on the image to place caliper measurement points.
          </p>
        </div>

        {/* Reference & Protocol Sidebar */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Clinical Reference Guide</h2>
            <p className="text-xs text-slate-400">Dynamic measurement boundaries & age adjustments</p>
          </div>

          {/* Controls */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Select Structure</label>
              <select
                value={selectedOrgan}
                onChange={(e) => setSelectedOrgan(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-blue-500"
              >
                {Object.keys(referenceData).map((organ) => (
                  <option key={organ} value={organ}>
                    {organ}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Patient Age: {patientAge}</label>
              <input
                type="range"
                min="18"
                max="100"
                value={patientAge}
                onChange={(e) => setPatientAge(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* Measurement Threshold Info Card */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Normal Threshold</span>
              <span className="text-sm font-bold text-emerald-400">
                &lt;= {referenceData[selectedOrgan].baseNormalMaxMm} mm
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-800">
              {referenceData[selectedOrgan].notes}
            </p>
          </div>

          {/* Active Measurements List */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">Captured Calipers</h3>
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2 overflow-y-auto max-h-[180px]">
              {measurements.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">No calipers drawn yet</p>
              ) : (
                measurements.map((m, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs bg-slate-900 p-2 rounded border border-slate-800">
                    <span className="text-slate-400">Caliper {idx + 1}</span>
                    <span className="font-mono text-yellow-400 font-semibold">{m.distancePx.toFixed(1)} px</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}