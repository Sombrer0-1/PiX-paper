/**
 * Chart Generator
 *
 * Generates chart data in Chart.js format for experiment result visualization.
 * Outputs JSON that can be rendered by the frontend or converted to images.
 */

// ============================================================================
// Types
// ============================================================================

export type ChartType = 'bar' | 'line' | 'scatter' | 'radar' | 'pie' | 'doughnut';

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
}

export interface ChartConfig {
  type: ChartType;
  title: string;
  labels: string[];
  datasets: ChartDataset[];
  options?: Record<string, unknown>;
  /** Output file path (without extension) */
  outputPath?: string;
}

export interface ChartResult {
  config: ChartConfig;
  /** Chart.js-compatible JSON */
  chartjsConfig: Record<string, unknown>;
  /** SVG string (if generated) */
  svg?: string;
}

// ============================================================================
// Color Palettes
// ============================================================================

const PALETTES = {
  default: [
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 99, 132, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(255, 205, 86, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)',
    'rgba(201, 203, 207, 0.8)',
  ],
  border: [
    'rgb(54, 162, 235)',
    'rgb(255, 99, 132)',
    'rgb(75, 192, 192)',
    'rgb(255, 205, 86)',
    'rgb(153, 102, 255)',
    'rgb(255, 159, 64)',
    'rgb(201, 203, 207)',
  ],
};

// ============================================================================
// Chart Generator
// ============================================================================

export class ChartGenerator {
  /**
   * Generate a chart configuration from experiment results.
   */
  generate(config: ChartConfig): ChartResult {
    const chartjsConfig = this.buildChartjsConfig(config);

    return {
      config,
      chartjsConfig,
    };
  }

  /**
   * Generate a comparison bar chart for experiment metrics.
   */
  generateComparisonChart(params: {
    title: string;
    methods: string[];
    metrics: Record<string, number[]>;
    outputPath?: string;
  }): ChartResult {
    const { title, methods, metrics, outputPath } = params;
    const metricNames = Object.keys(metrics);

    const datasets: ChartDataset[] = metricNames.map((metric, i) => ({
      label: metric,
      data: metrics[metric],
      backgroundColor: PALETTES.default[i % PALETTES.default.length],
      borderColor: PALETTES.border[i % PALETTES.border.length],
      borderWidth: 1,
    }));

    return this.generate({
      type: 'bar',
      title,
      labels: methods,
      datasets,
      outputPath,
    });
  }

  /**
   * Generate a line chart for training curves.
   */
  generateTrainingCurve(params: {
    title: string;
    epochs: number[];
    curves: Record<string, number[]>;
    xLabel?: string;
    yLabel?: string;
    outputPath?: string;
  }): ChartResult {
    const { title, epochs, curves, xLabel, yLabel, outputPath } = params;
    const curveNames = Object.keys(curves);

    const datasets: ChartDataset[] = curveNames.map((name, i) => ({
      label: name,
      data: curves[name],
      borderColor: PALETTES.border[i % PALETTES.border.length],
      backgroundColor: PALETTES.default[i % PALETTES.default.length],
      fill: false,
    }));

    return this.generate({
      type: 'line',
      title,
      labels: epochs.map(String),
      datasets,
      options: {
        scales: {
          x: { title: { display: !!xLabel, text: xLabel || '' } },
          y: { title: { display: !!yLabel, text: yLabel || '' } },
        },
      },
      outputPath,
    });
  }

  /**
   * Generate a radar chart for multi-dimensional comparison.
   */
  generateRadarChart(params: {
    title: string;
    methods: string[];
    dimensions: string[];
    values: Record<string, number[]>;
    outputPath?: string;
  }): ChartResult {
    const { title, methods, dimensions, values, outputPath } = params;

    const datasets: ChartDataset[] = methods.map((method, i) => ({
      label: method,
      data: values[method] || [],
      borderColor: PALETTES.border[i % PALETTES.border.length],
      backgroundColor: PALETTES.default[i % PALETTES.default.length],
      borderWidth: 2,
    }));

    return this.generate({
      type: 'radar',
      title,
      labels: dimensions,
      datasets,
      outputPath,
    });
  }

  /**
   * Generate a table-style comparison (Markdown).
   */
  generateComparisonTable(params: {
    methods: string[];
    metrics: Record<string, number[]>;
    bestIndicator?: 'max' | 'min';
    precision?: number;
  }): string {
    const { methods, metrics, bestIndicator = 'max', precision = 4 } = params;
    const metricNames = Object.keys(metrics);

    // Header
    const header = `| Method | ${metricNames.join(' | ')} |`;
    const separator = `|--------|${metricNames.map(() => '--------').join('|')}|`;

    // Find best values per metric
    const bestValues = new Map<string, number>();
    for (const metric of metricNames) {
      const vals = metrics[metric];
      bestValues.set(metric, bestIndicator === 'max' ? Math.max(...vals) : Math.min(...vals));
    }

    // Rows
    const rows = methods.map((method, i) => {
      const cells = metricNames.map(metric => {
        const val = metrics[metric][i];
        const best = bestValues.get(metric)!;
        const formatted = val.toFixed(precision);
        return val === best ? `**${formatted}**` : formatted;
      });
      return `| ${method} | ${cells.join(' ')} |`;
    });

    return [header, separator, ...rows].join('\n');
  }

  private buildChartjsConfig(config: ChartConfig): Record<string, unknown> {
    return {
      type: config.type,
      data: {
        labels: config.labels,
        datasets: config.datasets.map(ds => ({
          label: ds.label,
          data: ds.data,
          backgroundColor: ds.backgroundColor || PALETTES.default[0],
          borderColor: ds.borderColor || PALETTES.border[0],
          borderWidth: ds.borderWidth ?? 1,
          fill: ds.fill,
        })),
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: config.title,
          },
        },
        ...config.options,
      },
    };
  }
}
