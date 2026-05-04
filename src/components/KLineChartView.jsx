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
      high: { color: "#929AA5" },
      low: { color: "#929AA5" },
      last: { upColor: ACCENT, downColor: RED },
    },
    tooltip: { text: { size: 11, family: "JetBrains Mono", color: "#929AA5" } },
  },
  xAxis: { axisLine: { color: BRD }, tickText: { color: "#64748b", family: "JetBrains Mono", size: 10 } },
  yAxis: { axisLine: { color: BRD }, tickText: { color: "#64748b", family: "JetBrains Mono", size: 10 } },
  separator: { color: BRD },
  crosshair: {
    horizontal: { line: { color: "#555", style: "dashed" }, text: { color: "#D9D9D9", backgroundColor: "#373a40" } },
    vertical: { line: { color: "#555", style: "dashed" }, text: { color: "#D9D9D9", backgroundColor: "#373a40" } },
  },
};

export default function KLineChartView({ data = [], height = "100%" }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = init(containerRef.current, { styles: darkStyles });
    chartRef.current = chart;
    chart.createIndicator("VOL");

    // Try all possible data loading methods for v10
    if (typeof chart.applyNewData === "function") {
      chart.applyNewData(data, true);
    } else if (typeof chart.setDataLoader === "function") {
      chart.setDataLoader({
        getBars: (params) => {
          console.log("getBars called, type:", params.type);
          params.callback(data, false);
        }
      });
      // Trigger data load if needed
      if (typeof chart.setPeriod === "function") {
        chart.setPeriod({ multiplier: 1, span: "minute", text: "1m" });
      }
      if (typeof chart.setSymbol === "function") {
        chart.setSymbol({ ticker: "BTC/USDT", name: "BTC/USDT" });
      }
    }

    return () => {
      dispose(containerRef.current);
      chartRef.current = null;
    };
  }, [data]);

  return <div ref={containerRef} style={{ width: "100%", height, backgroundColor: "#0a0e17" }} />;
}

export function generateMockKlineData(count = 200, basePrice = 43000) {
  const data = []; let t = Date.now() - count * 60000; let p = basePrice + Math.random() * 3000;
  for (let i = 0; i < count; i++) {
    const ch = (Math.random() - 0.48) * 200;
    const o = p; const c = p + ch;
    data.push({ timestamp: t + i * 60000, open: +o.toFixed(2), high: +(Math.max(o, c) + Math.random() * 100).toFixed(2), low: +(Math.min(o, c) - Math.random() * 100).toFixed(2), close: +c.toFixed(2), volume: Math.floor(Math.random() * 50000 + 10000) });
    p = c;
  }
  return data;
}
