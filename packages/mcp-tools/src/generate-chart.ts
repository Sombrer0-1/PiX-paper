/**
 * generate_chart MCP Tool
 *
 * Generate chart data for experiment comparison.
 */

// ============================================================================
// Tool Definition
// ============================================================================

export const GENERATE_CHART_TOOL = {
  name: 'generate_chart',
  description: 'Generate chart data for experiment comparison',
  inputSchema: {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['bar', 'line', 'scatter'],
        description: 'Chart type',
      },
      title: {
        type: 'string',
        description: 'Chart title',
      },
      experiments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            metrics: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
          required: ['name', 'metrics'],
        },
        description: 'Experiment data',
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific metrics to include (default: all)',
      },
    },
    required: ['experiments'],
  },
};

// ============================================================================
// Types
// ============================================================================

interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
}

interface ChartData {
  type: string;
  data: {
    labels: string[];
    datasets: ChartDataset[];
  };
  options: {
    responsive: boolean;
    plugins: {
      title: {
        display: boolean;
        text: string;
      };
    };
    scales?: {
      y: {
        beginAtZero: boolean;
      };
    };
  };
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class GenerateChartTool {
  private colors = [
    'rgba(54, 162, 235, 0.8)',
    'rgba(255, 99, 132, 0.8)',
    'rgba(75, 192, 192, 0.8)',
    'rgba(255, 206, 86, 0.8)',
    'rgba(153, 102, 255, 0.8)',
    'rgba(255, 159, 64, 0.8)',
    'rgba(199, 199, 199, 0.8)',
    'rgba(83, 102, 255, 0.8)',
  ];

  execute(params: {
    type?: string;
    title?: string;
    experiments: Array<{
      name: string;
      metrics: Record<string, number>;
    }>;
    metrics?: string[];
  }): ChartData {
    const chartType = params.type || 'bar';
    const title = params.title || 'Experiment Comparison';

    // Get all metric names
    const allMetrics = new Set<string>();
    for (const exp of params.experiments) {
      for (const key of Object.keys(exp.metrics)) {
        allMetrics.add(key);
      }
    }

    // Filter metrics if specified
    const metrics = params.metrics
      ? params.metrics.filter(m => allMetrics.has(m))
      : Array.from(allMetrics);

    // Build labels (experiment names)
    const labels = params.experiments.map(e => e.name);

    // Build datasets (one per metric)
    const datasets: ChartDataset[] = metrics.map((metric, index) => ({
      label: metric,
      data: params.experiments.map(e => e.metrics[metric] || 0),
      backgroundColor: this.colors[index % this.colors.length],
      borderColor: this.colors[index % this.colors.length].replace('0.8', '1'),
      borderWidth: 1,
    }));

    return {
      type: chartType,
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
          },
        },
        scales: chartType !== 'scatter' ? {
          y: {
            beginAtZero: true,
          },
        } : undefined,
      },
    };
  }

  /**
   * HTML-escape special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generate Chart.js compatible HTML
   */
  generateHtml(chartData: ChartData): string {
    const safeTitle = this.escapeHtml(chartData.options.plugins.title.text);
    // Escape </script> in JSON to prevent script tag breakout
    const safeJson = JSON.stringify(chartData, null, 2).replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html>
<head>
  <title>${safeTitle}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .chart-container { width: 800px; height: 400px; }
  </style>
</head>
<body>
  <div class="chart-container">
    <canvas id="chart"></canvas>
  </div>
  <script>
    const ctx = document.getElementById('chart').getContext('2d');
    new Chart(ctx, ${safeJson});
  </script>
</body>
</html>`;
  }
}

// ============================================================================
// MCP Handler
// ============================================================================

export async function handleGenerateChart(params: Record<string, unknown>): Promise<unknown> {
  const tool = new GenerateChartTool();

  const experiments = params.experiments as Array<{
    name: string;
    metrics: Record<string, number>;
  }>;

  const chartData = tool.execute({
    type: params.type as string,
    title: params.title as string,
    experiments,
    metrics: params.metrics as string[],
  });

  const html = tool.generateHtml(chartData);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          chartData,
          html,
          message: 'Chart data generated. Use the html field to render the chart.',
        }, null, 2),
      },
    ],
  };
}
