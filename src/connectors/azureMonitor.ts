// ==============================================================================
// MEI-MCP — Azure Monitor / Log Analytics Connector
// ==============================================================================
// KQL query execution with parameterized queries.
// Lookback window enforcement and result size limits.
// ==============================================================================

import { ConnectorError } from '../errors/index.js';
import { getConfig, isServiceConfigured } from '../config/configuration.js';
import type {
  MonitorConnector,
  LogQueryResult,
  MetricResult,
} from './types.js';
import type { UserContext } from '../auth/types.js';

const MAX_RESULT_ROWS = 5000;
const MAX_LOOKBACK_DAYS = 7;

/**
 * Azure Monitor connector using Log Analytics REST API.
 */
export class AzureMonitorConnector implements MonitorConnector {
  async queryLogs(
    workspaceId: string,
    query: string,
    timespan: string,
    context: UserContext
  ): Promise<LogQueryResult> {
    if (!isServiceConfigured('monitor')) {
      throw new ConnectorError(
        'Azure Monitor is not configured. Set AZURE_LOG_ANALYTICS_WORKSPACE_ID and AZURE_SUBSCRIPTION_ID.',
        'AzureMonitor',
        undefined,
        context.correlationId
      );
    }

    // Validate timespan does not exceed maximum lookback
    this.validateTimespan(timespan, context.correlationId);

    // Enforce row limit in query if not already present
    const safeQuery = this.enforceRowLimit(query);

    const config = getConfig();
    const url = `https://api.loganalytics.io/v1/workspaces/${encodeURIComponent(workspaceId)}/query`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          // In production, use OBO token for Azure Monitor
          Authorization: `Bearer ${config.ado.pat ?? 'dev-token'}`,
        },
        body: JSON.stringify({
          query: safeQuery,
          timespan,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new ConnectorError(
          `Log Analytics query failed: HTTP ${response.status} — ${errorBody.slice(0, 200)}`,
          'AzureMonitor',
          url,
          context.correlationId
        );
      }

      const data = (await response.json()) as LogQueryResult;
      return data;
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        `Log Analytics query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AzureMonitor',
        url,
        context.correlationId
      );
    }
  }

  async queryMetrics(
    resourceId: string,
    metricNames: string[],
    timespan: string,
    context: UserContext
  ): Promise<MetricResult[]> {
    if (!isServiceConfigured('monitor')) {
      throw new ConnectorError(
        'Azure Monitor is not configured.',
        'AzureMonitor',
        undefined,
        context.correlationId
      );
    }

    this.validateTimespan(timespan, context.correlationId);

    const safeResourceId = encodeURIComponent(resourceId);
    const safeMetrics = metricNames.map(encodeURIComponent).join(',');
    const url = `https://management.azure.com/${safeResourceId}/providers/Microsoft.Insights/metrics?api-version=2024-02-01&metricnames=${safeMetrics}&timespan=${encodeURIComponent(timespan)}`;

    try {
      const config = getConfig();
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.ado.pat ?? 'dev-token'}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new ConnectorError(
          `Metrics query failed: HTTP ${response.status}`,
          'AzureMonitor',
          url,
          context.correlationId
        );
      }

      const data = (await response.json()) as {
        value: {
          name: { value: string };
          unit: string;
          timeseries: {
            data: {
              timeStamp: string;
              average?: number;
              maximum?: number;
              minimum?: number;
              total?: number;
              count?: number;
            }[];
          }[];
        }[];
      };

      return data.value.map((metric) => ({
        name: metric.name.value,
        unit: metric.unit,
        timeseries:
          metric.timeseries[0]?.data.map((d) => ({
            timestamp: d.timeStamp,
            average: d.average,
            maximum: d.maximum,
            minimum: d.minimum,
            total: d.total,
            count: d.count,
          })) ?? [],
      }));
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        `Metrics query failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'AzureMonitor',
        url,
        context.correlationId
      );
    }
  }

  /**
   * Build a parameterized KQL query for pipeline failure investigation.
   * NEVER interpolate user input directly into KQL strings.
   */
  static buildPipelineFailureQuery(
    serviceName: string,
    lookbackHours: number
  ): string {
    // Use KQL let statements for parameterization
    const safeLookback = Math.min(Math.max(1, lookbackHours), MAX_LOOKBACK_DAYS * 24);
    return `
let _serviceName = "${serviceName.replace(/[^a-zA-Z0-9\-_]/g, '')}";
let _lookback = ${safeLookback}h;
ContainerLog
| where TimeGenerated > ago(_lookback)
| where ContainerName contains _serviceName
| where LogEntry contains "error" or LogEntry contains "exception" or LogEntry contains "fatal" or LogEntry contains "OOM"
| project TimeGenerated, ContainerName, LogEntry
| order by TimeGenerated desc
| take 50
`.trim();
  }

  /**
   * Build a KQL query for memory/CPU metrics correlation.
   */
  static buildResourceMetricsQuery(
    serviceName: string,
    lookbackHours: number
  ): string {
    const safeLookback = Math.min(Math.max(1, lookbackHours), MAX_LOOKBACK_DAYS * 24);
    return `
let _serviceName = "${serviceName.replace(/[^a-zA-Z0-9\-_]/g, '')}";
let _lookback = ${safeLookback}h;
Perf
| where TimeGenerated > ago(_lookback)
| where ObjectName == "Container" and InstanceName contains _serviceName
| where CounterName in ("cpuUsageNanoCores", "memoryWorkingSetBytes")
| summarize avg(CounterValue), max(CounterValue) by CounterName, bin(TimeGenerated, 5m)
| order by TimeGenerated desc
| take 100
`.trim();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private validateTimespan(
    timespan: string,
    correlationId: string
  ): void {
    // Parse ISO 8601 duration or timespan format
    const daysMatch = timespan.match(/(\d+)d/i);
    if (daysMatch) {
      const days = parseInt(daysMatch[1]!, 10);
      if (days > MAX_LOOKBACK_DAYS) {
        throw new ConnectorError(
          `Lookback exceeds maximum of ${MAX_LOOKBACK_DAYS} days.`,
          'AzureMonitor',
          undefined,
          correlationId
        );
      }
    }
  }

  private enforceRowLimit(query: string): string {
    // If query doesn't have a take/limit, add one
    if (
      !query.toLowerCase().includes('| take ') &&
      !query.toLowerCase().includes('| limit ')
    ) {
      return `${query}\n| take ${MAX_RESULT_ROWS}`;
    }
    return query;
  }
}
