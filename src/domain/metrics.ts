/**
 * Metrics Module (Phase 9)
 * Simple in-memory metrics collection with Prometheus export
 * No external dependencies - uses Map-based counters
 */

interface ToolCallMetric {
  count: number;
}

interface LatencyMetric {
  sum: number;
  count: number;
}

interface CacheMetric {
  count: number;
}

/**
 * Metrics collector singleton
 */
class MetricsCollector {
  // Tool call counters: mcp_tool_calls_total{tool_name, outcome}
  private toolCalls: Map<string, Map<string, ToolCallMetric>> = new Map();

  // Latency tracking: mcp_tool_latency_ms{tool_name}
  private latencies: Map<string, LatencyMetric> = new Map();

  // Cache status counters: met_proxy_cache_status_total{status}
  private cacheStatuses: Map<string, CacheMetric> = new Map();

  /**
   * Increment tool call counter
   */
  incrementToolCall(toolName: string, outcome: 'success' | 'error'): void {
    if (!this.toolCalls.has(toolName)) {
      this.toolCalls.set(toolName, new Map());
    }

    const outcomeMap = this.toolCalls.get(toolName)!;
    if (!outcomeMap.has(outcome)) {
      outcomeMap.set(outcome, { count: 0 });
    }

    outcomeMap.get(outcome)!.count++;
  }

  /**
   * Record tool latency
   */
  recordLatency(toolName: string, latencyMs: number): void {
    if (!this.latencies.has(toolName)) {
      this.latencies.set(toolName, { sum: 0, count: 0 });
    }

    const metric = this.latencies.get(toolName)!;
    metric.sum += latencyMs;
    metric.count++;
  }

  /**
   * Increment cache status counter
   */
  incrementCacheStatus(status: 'HIT' | 'MISS' | 'EXPIRED'): void {
    if (!this.cacheStatuses.has(status)) {
      this.cacheStatuses.set(status, { count: 0 });
    }

    this.cacheStatuses.get(status)!.count++;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics() {
    const toolCallsData: Record<string, Record<string, number>> = {};
    this.toolCalls.forEach((outcomeMap, toolName) => {
      toolCallsData[toolName] = {};
      outcomeMap.forEach((metric, outcome) => {
        toolCallsData[toolName][outcome] = metric.count;
      });
    });

    const latenciesData: Record<string, { avg: number; count: number }> = {};
    this.latencies.forEach((metric, toolName) => {
      latenciesData[toolName] = {
        avg: metric.count > 0 ? metric.sum / metric.count : 0,
        count: metric.count,
      };
    });

    const cacheStatusesData: Record<string, number> = {};
    this.cacheStatuses.forEach((metric, status) => {
      cacheStatusesData[status] = metric.count;
    });

    // Calculate cache hit ratio
    const hits = cacheStatusesData['HIT'] || 0;
    const misses = cacheStatusesData['MISS'] || 0;
    const total = hits + misses;
    const hitRatio = total > 0 ? hits / total : 0;

    return {
      toolCalls: toolCallsData,
      latencies: latenciesData,
      cacheStatuses: cacheStatusesData,
      cacheHitRatio: hitRatio,
    };
  }

  /**
   * Export metrics in Prometheus text format
   * See: https://prometheus.io/docs/instrumenting/exposition_formats/
   */
  exportPrometheus(): string {
    const lines: string[] = [];

    // mcp_tool_calls_total
    lines.push('# HELP mcp_tool_calls_total Total number of MCP tool calls by tool name and outcome');
    lines.push('# TYPE mcp_tool_calls_total counter');
    this.toolCalls.forEach((outcomeMap, toolName) => {
      outcomeMap.forEach((metric, outcome) => {
        lines.push(
          `mcp_tool_calls_total{tool_name="${toolName}",outcome="${outcome}"} ${metric.count}`
        );
      });
    });

    // mcp_tool_latency_ms (average)
    lines.push('');
    lines.push('# HELP mcp_tool_latency_ms_avg Average latency of MCP tool calls in milliseconds');
    lines.push('# TYPE mcp_tool_latency_ms_avg gauge');
    this.latencies.forEach((metric, toolName) => {
      const avg = metric.count > 0 ? metric.sum / metric.count : 0;
      lines.push(`mcp_tool_latency_ms_avg{tool_name="${toolName}"} ${avg.toFixed(2)}`);
    });

    // mcp_tool_latency_ms_count
    lines.push('');
    lines.push('# HELP mcp_tool_latency_ms_count Total number of latency measurements');
    lines.push('# TYPE mcp_tool_latency_ms_count counter');
    this.latencies.forEach((metric, toolName) => {
      lines.push(`mcp_tool_latency_ms_count{tool_name="${toolName}"} ${metric.count}`);
    });

    // met_proxy_cache_status_total
    lines.push('');
    lines.push('# HELP met_proxy_cache_status_total Cache status from MET Norway proxy');
    lines.push('# TYPE met_proxy_cache_status_total counter');
    this.cacheStatuses.forEach((metric, status) => {
      lines.push(`met_proxy_cache_status_total{status="${status}"} ${metric.count}`);
    });

    // met_proxy_cache_hit_ratio
    const hits = this.cacheStatuses.get('HIT')?.count || 0;
    const misses = this.cacheStatuses.get('MISS')?.count || 0;
    const total = hits + misses;
    const hitRatio = total > 0 ? hits / total : 0;
    lines.push('');
    lines.push('# HELP met_proxy_cache_hit_ratio Ratio of cache hits to total requests');
    lines.push('# TYPE met_proxy_cache_hit_ratio gauge');
    lines.push(`met_proxy_cache_hit_ratio ${hitRatio.toFixed(4)}`);

    return lines.join('\n') + '\n';
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.toolCalls.clear();
    this.latencies.clear();
    this.cacheStatuses.clear();
  }
}

// Singleton metrics collector
export const metrics = new MetricsCollector();
