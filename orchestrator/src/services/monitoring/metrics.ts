/**
 * Metrics Service
 * Collects and exposes Prometheus-compatible metrics
 */

import { logger } from '../../utils/logger';

interface MetricValue {
  value: number;
  timestamp: number;
  labels: Record<string, string>;
}

export class MetricsService {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, MetricValue> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private startTime: number = Date.now();

  /**
   * Increment counter
   */
  increment(name: string, value = 1, labels: Record<string, string> = {}): void {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  /**
   * Set gauge value
   */
  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, { value, timestamp: Date.now(), labels });
  }

  /**
   * Record histogram value
   */
  histogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.getKey(name, labels);
    const values = this.histograms.get(key) || [];
    values.push(value);
    // Keep last 1000 values
    if (values.length > 1000) values.shift();
    this.histograms.set(key, values);
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels: Record<string, string> = {}): number {
    return this.counters.get(this.getKey(name, labels)) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels: Record<string, string> = {}): number | undefined {
    return this.gauges.get(this.getKey(name, labels))?.value;
  }

  /**
   * Get histogram statistics
   */
  getHistogramStats(name: string, labels: Record<string, string> = {}): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.histograms.get(this.getKey(name, labels));
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const count = sorted.length;
    const avg = sum / count;

    const percentile = (p: number) => {
      const index = Math.ceil((p / 100) * count) - 1;
      return sorted[Math.max(0, index)];
    };

    return {
      count,
      sum,
      avg,
      min: sorted[0],
      max: sorted[count - 1],
      p50: percentile(50),
      p95: percentile(95),
      p99: percentile(99),
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheus(): string {
    const lines: string[] = [];
    const timestamp = Date.now();

    // Uptime
    lines.push('# HELP petrilabs_uptime_seconds Total uptime in seconds');
    lines.push('# TYPE petrilabs_uptime_seconds counter');
    lines.push(`petrilabs_uptime_seconds ${(timestamp - this.startTime) / 1000}`);

    // Counters
    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseKey(key);
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`# HELP ${name} Total count`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name}${labelStr ? `{${labelStr}}` : ''} ${value} ${timestamp}`);
    }

    // Gauges
    for (const [key, metric] of this.gauges) {
      const { name, labels } = this.parseKey(key);
      const labelStr = Object.entries({ ...labels, ...metric.labels })
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`# HELP ${name} Current value`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name}${labelStr ? `{${labelStr}}` : ''} ${metric.value} ${metric.timestamp}`);
    }

    // Histograms
    for (const [key, values] of this.histograms) {
      const { name, labels } = this.parseKey(key);
      const stats = this.getHistogramStats(name, labels);
      if (!stats) continue;

      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      
      lines.push(`# HELP ${name} Histogram`);
      lines.push(`# TYPE ${name} histogram`);
      lines.push(`${name}_count${labelStr ? `{${labelStr}}` : ''} ${stats.count}`);
      lines.push(`${name}_sum${labelStr ? `{${labelStr}}` : ''} ${stats.sum}`);
      lines.push(`${name}_avg${labelStr ? `{${labelStr}}` : ''} ${stats.avg}`);
    }

    return lines.join('\n');
  }

  /**
   * Get all metrics as JSON
   */
  exportJSON(): object {
    const result: any = {
      uptime: (Date.now() - this.startTime) / 1000,
      counters: {},
      gauges: {},
      histograms: {},
    };

    for (const [key, value] of this.counters) {
      const { name, labels } = this.parseKey(key);
      if (!result.counters[name]) result.counters[name] = [];
      result.counters[name].push({ value, labels });
    }

    for (const [key, metric] of this.gauges) {
      const { name, labels } = this.parseKey(key);
      if (!result.gauges[name]) result.gauges[name] = [];
      result.gauges[name].push({ value: metric.value, labels: { ...labels, ...metric.labels } });
    }

    for (const [key] of this.histograms) {
      const { name, labels } = this.parseKey(key);
      if (!result.histograms[name]) result.histograms[name] = [];
      result.histograms[name].push({ stats: this.getHistogramStats(name, labels), labels });
    }

    return result;
  }

  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return labelStr ? `${name}:${labelStr}` : name;
  }

  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const parts = key.split(':');
    const name = parts[0];
    const labels: Record<string, string> = {};
    
    for (let i = 1; i < parts.length; i++) {
      const [k, v] = parts[i].split('=');
      if (k && v) labels[k] = v;
    }
    
    return { name, labels };
  }
}

export default MetricsService;
