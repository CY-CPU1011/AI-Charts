import type { ChartSpec } from "@/lib/contracts/chart";
import { chartColors } from "@/lib/echarts/theme";

type OptionRecord = Record<string, unknown>;

function asRecord(value: unknown): OptionRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as OptionRecord)
    : {};
}

function preserveVisibleLabel(
  state: OptionRecord,
  labelsVisible: boolean,
  labelLinesVisible: boolean,
): OptionRecord {
  return {
    ...state,
    label: {
      ...asRecord(state.label),
      show: labelsVisible,
    },
    labelLine: {
      ...asRecord(state.labelLine),
      show: labelLinesVisible,
    },
  };
}

function normalizePieDataItem(
  item: unknown,
  index: number,
  series: OptionRecord,
  palette: unknown[],
  seriesLabelsVisible: boolean,
  seriesLabelLinesVisible: boolean,
): unknown {
  const dataItem =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as OptionRecord)
      : { value: item };
  const labelsVisible = asRecord(dataItem.label).show !== false && seriesLabelsVisible;
  const labelLinesVisible =
    asRecord(dataItem.labelLine).show !== false && seriesLabelLinesVisible;
  const emphasis = preserveVisibleLabel(
    asRecord(dataItem.emphasis),
    labelsVisible,
    labelLinesVisible,
  );
  const color =
    asRecord(dataItem.itemStyle).color ??
    asRecord(series.itemStyle).color ??
    palette[index % palette.length];

  return {
    ...dataItem,
    selected: false,
    itemStyle: {
      ...asRecord(dataItem.itemStyle),
      color,
    },
    emphasis: {
      ...emphasis,
      focus: "none",
      scale: true,
      scaleSize: 4,
      itemStyle: {
        color,
        opacity: 1,
        shadowBlur: 6,
        shadowOffsetY: 2,
        shadowColor: "rgba(15, 23, 42, 0.14)",
      },
    },
  };
}

function normalizeBarDataItem(
  item: unknown,
  itemIndex: number,
  series: OptionRecord,
  seriesIndex: number,
  palette: unknown[],
): OptionRecord {
  const dataItem =
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as OptionRecord)
      : { value: item };
  const paletteIndex =
    series.colorBy === "data" ? itemIndex : seriesIndex;
  const color =
    asRecord(dataItem.itemStyle).color ??
    asRecord(series.itemStyle).color ??
    palette[paletteIndex % palette.length];

  return {
    ...dataItem,
    itemStyle: {
      ...asRecord(dataItem.itemStyle),
      color,
    },
    emphasis: {
      ...asRecord(dataItem.emphasis),
      focus: "none",
      itemStyle: {
        color,
        opacity: 1,
        shadowBlur: 8,
        shadowOffsetY: 2,
        shadowColor: "rgba(15, 23, 42, 0.16)",
      },
    },
  };
}

function normalizeBarSeries(
  series: OptionRecord,
  seriesIndex: number,
  palette: unknown[],
): OptionRecord {
  const color =
    asRecord(series.itemStyle).color ?? palette[seriesIndex % palette.length];
  const blur = asRecord(series.blur);

  return {
    ...series,
    itemStyle: {
      ...asRecord(series.itemStyle),
      color,
    },
    data: Array.isArray(series.data)
      ? series.data.map((item, itemIndex) =>
          normalizeBarDataItem(item, itemIndex, series, seriesIndex, palette),
        )
      : series.data,
    emphasis: {
      ...asRecord(series.emphasis),
      focus: "none",
      itemStyle: {
        color,
        opacity: 1,
        shadowBlur: 8,
        shadowOffsetY: 2,
        shadowColor: "rgba(15, 23, 42, 0.16)",
      },
    },
    blur: {
      ...blur,
      itemStyle: {
        ...asRecord(blur.itemStyle),
        opacity: 1,
      },
    },
  };
}

function normalizeSeries(
  series: unknown,
  seriesIndex: number,
  palette: unknown[],
): unknown {
  if (!series || typeof series !== "object" || Array.isArray(series)) {
    return series;
  }

  const chartSeries = series as OptionRecord;
  if (chartSeries.type === "bar") {
    return normalizeBarSeries(chartSeries, seriesIndex, palette);
  }

  if (chartSeries.type !== "pie") {
    return series;
  }

  const labelsVisible = asRecord(chartSeries.label).show !== false;
  const labelLinesVisible = asRecord(chartSeries.labelLine).show !== false;
  const emphasis = preserveVisibleLabel(
    asRecord(chartSeries.emphasis),
    labelsVisible,
    labelLinesVisible,
  );
  const blur = preserveVisibleLabel(
    asRecord(chartSeries.blur),
    labelsVisible,
    labelLinesVisible,
  );

  return {
    ...chartSeries,
    selectedMode: false,
    selectedOffset: 0,
    data: Array.isArray(chartSeries.data)
      ? chartSeries.data.map((item, index) =>
          normalizePieDataItem(
            item,
            index,
            chartSeries,
            palette,
            labelsVisible,
            labelLinesVisible,
          ),
        )
      : chartSeries.data,
    emphasis: {
      ...emphasis,
      focus: "none",
      scale: true,
      scaleSize: 4,
      itemStyle: {
        opacity: 1,
        shadowBlur: 6,
        shadowOffsetY: 2,
        shadowColor: "rgba(15, 23, 42, 0.14)",
      },
    },
    blur: {
      ...blur,
      itemStyle: {
        ...asRecord(blur.itemStyle),
        opacity: 1,
      },
    },
  };
}

function isPieSeries(series: unknown): boolean {
  return asRecord(series).type === "pie";
}

function responsiveRadius(series: OptionRecord, outerRadius: string): unknown {
  return Array.isArray(series.radius)
    ? [series.radius[0], outerRadius]
    : outerRadius;
}

function buildPieLayout(
  series: unknown,
  center: [string, string],
  outerRadius: string,
  labelLineLength: number,
): OptionRecord {
  if (!isPieSeries(series)) {
    return {};
  }

  const chartSeries = asRecord(series);

  return {
    center,
    radius: responsiveRadius(chartSeries, outerRadius),
    label: {
      ...asRecord(chartSeries.label),
      fontSize: 10,
    },
    labelLine: {
      ...asRecord(chartSeries.labelLine),
      length: labelLineLength,
      length2: Math.max(5, labelLineLength - 3),
    },
  };
}

export function normalizeChartOption(option: ChartSpec["option"]): ChartSpec["option"] {
  const palette =
    Array.isArray(option.color) && option.color.length > 0
      ? option.color
      : chartColors;
  const series = Array.isArray(option.series)
    ? option.series.map((chartSeries, index) =>
        normalizeSeries(chartSeries, index, palette),
      )
    : option.series
      ? normalizeSeries(option.series, 0, palette)
      : option.series;
  const seriesList = Array.isArray(series) ? series : series ? [series] : [];

  if (!seriesList.some(isPieSeries)) {
    return series === option.series ? option : { ...option, series };
  }

  return {
    ...option,
    series,
    media: [
      ...(Array.isArray(option.media) ? option.media : []),
      {
        query: { maxWidth: 520 },
        option: {
          legend: {
            ...asRecord(option.legend),
            type: "scroll",
            orient: "horizontal",
            left: "center",
            right: "center",
            top: null,
            bottom: 4,
          },
          series: seriesList.map((chartSeries) =>
            buildPieLayout(chartSeries, ["50%", "39%"], "40%", 8),
          ),
        },
      },
      {
        option: {
          legend: {
            ...asRecord(option.legend),
            type: "scroll",
            orient: "horizontal",
            left: "center",
            right: "center",
            top: null,
            bottom: 12,
          },
          series: seriesList.map((chartSeries) =>
            buildPieLayout(chartSeries, ["50%", "44%"], "52%", 12),
          ),
        },
      },
    ],
  };
}
