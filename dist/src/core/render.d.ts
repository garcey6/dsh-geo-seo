/**
 * Presentation layer. It only formats values produced by the engine: no rule
 * runs here, and no claim is added that the facts do not support.
 */
import type { AuditResult, DimensionScore, Finding, GenerateResult, MonitorSummary, Report } from './types.js';
export type OutputFormat = 'text' | 'json' | 'markdown';
export interface RenderOptions {
    /** Colourise terminal output; ignored for json. */
    color?: boolean;
    /** Cap on findings shown in text mode. */
    maxFindings?: number;
}
export declare function bandLabel(band: Report['summary']['band']): string;
export declare function renderFindings(findings: Finding[], options?: RenderOptions): string[];
export declare function renderReport(report: Report, format?: OutputFormat, options?: RenderOptions): string;
export declare function renderAudit(result: AuditResult, format?: OutputFormat, options?: RenderOptions): string;
export declare function renderGenerate(result: GenerateResult, format?: OutputFormat, options?: RenderOptions): string;
export declare function renderMonitor(summary: MonitorSummary, format?: OutputFormat, options?: RenderOptions): string;
export declare function dimensionLabelOf(dimensions: DimensionScore[], id: string): string;
