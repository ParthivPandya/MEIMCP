// ==============================================================================
// MEI-MCP — OpenTelemetry Setup
// ==============================================================================

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { metrics, trace, type Meter, type Tracer } from '@opentelemetry/api';
import { getConfig } from '../config/configuration.js';
import { getLogger } from './auditLogger.js';

let _sdk: NodeSDK | null = null;
let _meter: Meter | null = null;
let _tracer: Tracer | null = null;

export function initTelemetry(): void {
  if (_sdk) return;

  const config = getConfig();

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'mei-mcp',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    'deployment.environment': config.nodeEnv,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: config.observability.otelExporterEndpoint
        ? `${config.observability.otelExporterEndpoint}/v1/metrics`
        : undefined,
    }),
    exportIntervalMillis: 60000,
  });

  _sdk = new NodeSDK({
    resource,
    metricReader,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  try {
    _sdk.start();
    getLogger().info('OpenTelemetry initialized');
  } catch (error) {
    getLogger().error(error, 'Error initializing OpenTelemetry');
  }

  _meter = metrics.getMeter('mei-mcp');
  _tracer = trace.getTracer('mei-mcp');
}

export function getMeter(): Meter {
  if (!_meter) {
    _meter = metrics.getMeter('mei-mcp-fallback');
  }
  return _meter;
}

export function getTracer(): Tracer {
  if (!_tracer) {
    _tracer = trace.getTracer('mei-mcp-fallback');
  }
  return _tracer;
}

export async function shutdownTelemetry(): Promise<void> {
  if (_sdk) {
    await _sdk.shutdown();
    getLogger().info('OpenTelemetry shut down');
  }
}
