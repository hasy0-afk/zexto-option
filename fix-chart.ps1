# Fix KLineChartView for KLineChart v10
# Run this in PowerShell from E:\files\quantum-trade

$content = @'
import { useEffect, useRef } from "react";
import { init, dispose } from "klinecharts";

const ACCENT = "#00ff9d";
const RED = "#ff3b5c";
const BRD = "#1e293b";

const darkStyles = {
  grid: { horizontal: { color: "#1a1f2e", style: "dashed" }, vertical: { color: "#1a1f2e", style: "dashed" } },
  candle: {
    bar: { upColor: ACCENT, downColor: RED, upBorderColor: ACCENT, downBorderColor: RED, upWickColor: ACCENT, downWickColor: RED },
    priceMark: {
      high: { color: "#929AA5", textFamily: "JetBrains Mono", textSize: 10 },
      low: { color: "#929AA5", textFamily: "JetBrains Mono", textSize: 10 },
      last: { upColor: ACCENT, downColor: RED, line: { style: "dashed", size: 1 }, text: { color: "#fff", family: "JetBrains Mono", size: 11, backgroundColor: "#373a40" } },
    },
    tooltip: { text: { size: 11, family: "JetBrains Mono", color: "#929AA5" } },
  },
  indicator: { bars: [{ upColor: ACCENT + "60", downColor: RED + "60" }], tooltip: { text: { size: 11, family: "JetBrains Mono", color: "#929AA5" } } },
  xAxis: { axisLine: { color: BRD }, tickLine: { color: BRD }, tickText: { color: "#64748b", family: "JetBrains Mono", size: 10 } },
  yAxis: { axisLine: { color: BRD }, tickLine: { color: BRD }, tickText: { color: "#64748b", family: "JetBrains Mono", size: 10 } },
  separator: { color: BRD },
  crosshair: {
    horizontal: { line: { color: "#555", style: "dashed" }, text: { color: "#D9D9D9", family: "JetBrains Mono", backgroundColor: "#373a40" } },
    vertical: { line: { color: "#555", style: "dashed" }, text: { color: "#D9D9D9", family: "JetBrains Mono", backgroundColor: "#373a40" } },
  },
};

export default function KLineChartView({ data = [], wsData = null, indicators = ["VOL"], height = "100%" }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const dataRef = useRef(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = init(containerRef.current, { styles: darkStyles });
    chartRef.current = chart;
    indicators.forEach((ind) => chart.createIndicator(ind));

    // v10 uses setDataLoader instead of applyNewData
    chart.setDataLoader({
      getBars: (params) => {
        params.callback(dataRef.current, false);
      }
    });

    return () => { dispose(containerRef.current); chartRef.current = null; };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", height, backgroundColor: "#0a0e17" }} />;
}

export function generateMockKlineData(count = 200, basePrice = 43000) {
  const data = []; let t = Date.now() - count * 60000; let p = basePrice + Math.random() * 3000;
  for (let i = 0; i < count; i++) {
    const ch = (Math.random() - 0.48) * 200; const o = p; const c = p + ch;
    data.push({ timestamp: t + i * 60000, open: +o.toFixed(2), high: +(Math.max(o, c) + Math.random() * 100).toFixed(2), low: +(Math.min(o, c) - Math.random() * 100).toFixed(2), close: +c.toFixed(2), volume: Math.floor(Math.random() * 50000 + 10000) });
    p = c;
  }
  return data;
}
'@

$content | Set-Content -Path "E:\files\quantum-trade\src\components\KLineChartView.jsx" -Encoding UTF8
Write-Host "KLineChartView.jsx FIXED!" -ForegroundColor Green
