import { logger } from '../utils/logger';

export interface Metrics {
  topics: {
    total: number;
    active: number;
  };
  subscribers: {
    total: number;
    active: number;
  };
  events: {
    published: number;
    delivered: number;
    dropped: number;
  };
  performance: {
    avgEventLatency: number;
    avgSubscriptionLatency: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  rateLimits: {
    hits: number;
    blocks: number;
  };
}

export class MetricsCollector {
  private metrics: Metrics = {
    topics: { total: 0, active: 0 },
    subscribers: { total: 0, active: 0 },
    events: { published: 0, delivered: 0, dropped: 0 },
    performance: { avgEventLatency: 0, avgSubscriptionLatency: 0 },
    errors: { total: 0, byType: {} },
    rateLimits: { hits: 0, blocks: 0 },
  };

  private eventLatencies: number[] = [];
  private subscriptionLatencies: number[] = [];

  incrementEventPublished(): void {
    this.metrics.events.published++;
  }

  incrementEventDelivered(): void {
    this.metrics.events.delivered++;
  }

  incrementEventDropped(): void {
    this.metrics.events.dropped++;
  }

  // Convenience wrappers for counters in hot paths
  onPublish(): void { this.incrementEventPublished(); }
  onDeliver(): void { this.incrementEventDelivered(); }
  onDrop(): void { this.incrementEventDropped(); }

  recordEventLatency(latencyMs: number): void {
    this.eventLatencies.push(latencyMs);
    // Keep only last 1000 latencies for average calculation
    if (this.eventLatencies.length > 1000) {
      this.eventLatencies.shift();
    }
    this.updateAverageLatency();
  }

  recordSubscriptionLatency(latencyMs: number): void {
    this.subscriptionLatencies.push(latencyMs);
    // Keep only last 1000 latencies for average calculation
    if (this.subscriptionLatencies.length > 1000) {
      this.subscriptionLatencies.shift();
    }
    this.updateAverageLatency();
  }

  recordError(errorType: string): void {
    this.metrics.errors.total++;
    this.metrics.errors.byType[errorType] = (this.metrics.errors.byType[errorType] || 0) + 1;
  }

  recordRateLimitHit(): void {
    this.metrics.rateLimits.hits++;
  }

  recordRateLimitBlock(): void {
    this.metrics.rateLimits.blocks++;
  }

  updateTopicCounts(total: number, active: number): void {
    this.metrics.topics.total = total;
    this.metrics.topics.active = active;
  }

  updateSubscriberCounts(total: number, active: number): void {
    this.metrics.subscribers.total = total;
    this.metrics.subscribers.active = active;
  }

  private updateAverageLatency(): void {
    if (this.eventLatencies.length > 0) {
      this.metrics.performance.avgEventLatency = 
        this.eventLatencies.reduce((sum, latency) => sum + latency, 0) / this.eventLatencies.length;
    }

    if (this.subscriptionLatencies.length > 0) {
      this.metrics.performance.avgSubscriptionLatency = 
        this.subscriptionLatencies.reduce((sum, latency) => sum + latency, 0) / this.subscriptionLatencies.length;
    }
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      topics: { total: 0, active: 0 },
      subscribers: { total: 0, active: 0 },
      events: { published: 0, delivered: 0, dropped: 0 },
      performance: { avgEventLatency: 0, avgSubscriptionLatency: 0 },
      errors: { total: 0, byType: {} },
      rateLimits: { hits: 0, blocks: 0 },
    };
    this.eventLatencies = [];
    this.subscriptionLatencies = [];
  }

  logMetrics(): void {
    logger.info('System Metrics:', {
      topics: this.metrics.topics,
      subscribers: this.metrics.subscribers,
      events: this.metrics.events,
      performance: {
        avgEventLatency: `${this.metrics.performance.avgEventLatency.toFixed(2)}ms`,
        avgSubscriptionLatency: `${this.metrics.performance.avgSubscriptionLatency.toFixed(2)}ms`,
      },
      errors: this.metrics.errors,
      rateLimits: this.metrics.rateLimits,
    });
  }
}

export const metricsCollector = new MetricsCollector();

// Prometheus-style metrics export
export function getPrometheusMetrics(): string {
  const metrics = metricsCollector.getMetrics();
  
  return [
    `# HELP gateway_topics_total Total number of topics`,
    `# TYPE gateway_topics_total counter`,
    `gateway_topics_total ${metrics.topics.total}`,
    '',
    `# HELP gateway_topics_active Active number of topics`,
    `# TYPE gateway_topics_active gauge`,
    `gateway_topics_active ${metrics.topics.active}`,
    '',
    `# HELP gateway_subscribers_total Total number of subscribers`,
    `# TYPE gateway_subscribers_total counter`,
    `gateway_subscribers_total ${metrics.subscribers.total}`,
    '',
    `# HELP gateway_subscribers_active Active number of subscribers`,
    `# TYPE gateway_subscribers_active gauge`,
    `gateway_subscribers_active ${metrics.subscribers.active}`,
    '',
    `# HELP gateway_events_published Total events published`,
    `# TYPE gateway_events_published counter`,
    `gateway_events_published ${metrics.events.published}`,
    '',
    `# HELP gateway_events_delivered Total events delivered`,
    `# TYPE gateway_events_delivered counter`,
    `gateway_events_delivered ${metrics.events.delivered}`,
    '',
    `# HELP gateway_events_dropped Total events dropped`,
    `# TYPE gateway_events_dropped counter`,
    `gateway_events_dropped ${metrics.events.dropped}`,
    '',
    `# HELP gateway_event_latency_average Average event latency in milliseconds`,
    `# TYPE gateway_event_latency_average gauge`,
    `gateway_event_latency_average ${metrics.performance.avgEventLatency}`,
    '',
    `# HELP gateway_subscription_latency_average Average subscription latency in milliseconds`,
    `# TYPE gateway_subscription_latency_average gauge`,
    `gateway_subscription_latency_average ${metrics.performance.avgSubscriptionLatency}`,
    '',
    `# HELP gateway_errors_total Total number of errors`,
    `# TYPE gateway_errors_total counter`,
    `gateway_errors_total ${metrics.errors.total}`,
    '',
    `# HELP gateway_rate_limit_hits Total rate limit hits`,
    `# TYPE gateway_rate_limit_hits counter`,
    `gateway_rate_limit_hits ${metrics.rateLimits.hits}`,
    '',
    `# HELP gateway_rate_limit_blocks Total rate limit blocks`,
    `# TYPE gateway_rate_limit_blocks counter`,
    `gateway_rate_limit_blocks ${metrics.rateLimits.blocks}`,
  ].join('\n');
}