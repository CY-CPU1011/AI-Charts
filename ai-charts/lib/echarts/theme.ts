import * as echarts from "echarts";
import colors from "tailwindcss/colors";

const themeName = "ai-charts";
let isRegistered = false;

// ECharts computes emphasis colors internally; use sRGB values it can transform.
export const chartColors = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

export function registerAIChartsTheme() {
  if (isRegistered) {
    return themeName;
  }

  echarts.registerTheme(themeName, {
    color: chartColors,
    backgroundColor: "transparent",
    textStyle: {
      color: colors.slate[700],
      fontFamily: "var(--font-sans)",
    },
    title: {
      textStyle: { color: colors.slate[900] },
    },
    legend: {
      textStyle: { color: colors.slate[600] },
    },
    categoryAxis: {
      axisLine: { lineStyle: { color: colors.slate[300] } },
      axisLabel: { color: colors.slate[600] },
      splitLine: { lineStyle: { color: colors.slate[100] } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: colors.slate[300] } },
      axisLabel: { color: colors.slate[600] },
      splitLine: { lineStyle: { color: colors.slate[200] } },
    },
    tooltip: {
      backgroundColor: colors.white,
      borderColor: colors.slate[200],
      textStyle: { color: colors.slate[900] },
    },
  });

  isRegistered = true;
  return themeName;
}
