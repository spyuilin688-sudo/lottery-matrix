import './growth-line-chart.css';

export type GrowthPoint = {
  date: string;
  value: number;
};

type Props = {
  data: GrowthPoint[];
  ariaLabel: string;
  valueLabel: string;
  formatValue?: (value: number) => string;
};

const width = 720;
const height = 220;
const padding = { top: 18, right: 18, bottom: 38, left: 54 };

const formatDateLabel = (value: string) => value.replaceAll('-', '/');

export function GrowthLineChart({ data, ariaLabel, valueLabel, formatValue = String }: Props) {
  if (data.length === 0) return <div className="emptyChart">目前沒有可呈現的資料</div>;

  const values = data.map((point) => Number(point.value) || 0);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const span = maxValue - minValue || 1;
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xFor = (index: number) => data.length === 1
    ? padding.left + plotWidth / 2
    : padding.left + (index / (data.length - 1)) * plotWidth;
  const yFor = (value: number) => padding.top + ((maxValue - value) / span) * plotHeight;
  const linePoints = data.map((point, index) => `${xFor(index)},${yFor(point.value)}`).join(' ');
  const last = data[data.length - 1];
  const labelIndexes = [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])];
  const horizontalGuides = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="growthChart">
      <div className="growthChartSummary">
        <span>{formatDateLabel(data[0].date)}－{formatDateLabel(last.date)}</span>
        <strong>{valueLabel} {formatValue(last.value)}</strong>
      </div>
      <svg
        className="growthChartSvg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        preserveAspectRatio="xMidYMid meet"
      >
        <title>{ariaLabel}</title>
        {horizontalGuides.map((ratio) => {
          const y = padding.top + ratio * plotHeight;
          return <line key={ratio} className="growthChartGrid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />;
        })}
        <line className="growthChartAxis" x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} />
        <line className="growthChartAxis" x1={padding.left} x2={width - padding.right} y1={height - padding.bottom} y2={height - padding.bottom} />
        <text className="growthChartValueLabel" x={padding.left - 10} y={padding.top + 4} textAnchor="end">{formatValue(maxValue)}</text>
        <text className="growthChartValueLabel" x={padding.left - 10} y={height - padding.bottom + 4} textAnchor="end">{formatValue(minValue)}</text>
        <polyline className="growthChartLine" points={linePoints} />
        <circle className="growthChartPoint" cx={xFor(0)} cy={yFor(data[0].value)} r="3.5" />
        {data.length > 1 && <circle className="growthChartPoint" cx={xFor(data.length - 1)} cy={yFor(last.value)} r="4" />}
        {labelIndexes.map((index) => {
          const point = data[index];
          const anchor = index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle';
          return (
            <text
              className="growthChartDateLabel"
              key={`${point.date}-${index}`}
              x={xFor(index)}
              y={height - 12}
              textAnchor={anchor}
            >
              {formatDateLabel(point.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
