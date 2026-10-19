import type { Config } from '../../config/index.js';
export type Telemetry={shutdown():Promise<void>};
const disabled:Telemetry={shutdown:async()=>undefined};
export async function startTelemetry(config:Config):Promise<Telemetry>{if(!config.OTEL_ENABLED)return disabled;const [{NodeSDK},{OTLPTraceExporter},{getNodeAutoInstrumentations}]=await Promise.all([import('@opentelemetry/sdk-node'),import('@opentelemetry/exporter-trace-otlp-http'),import('@opentelemetry/auto-instrumentations-node')]);const sdk=new NodeSDK({traceExporter:new OTLPTraceExporter({url:`${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`}),instrumentations:[getNodeAutoInstrumentations()]});sdk.start();return {shutdown:async()=>{await sdk.shutdown();}};}
