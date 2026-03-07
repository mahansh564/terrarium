import type {
  AgentAction,
  AgentConfig,
  AgentEvent,
  AgentEventBase,
  EventMetadataValue
} from '@shared/types';

/**
 * Raw transcript event shape before normalization.
 */
interface RawTranscriptEvent {
  action?: unknown;
  kind?: unknown;
  ts?: unknown;
  timestamp?: unknown;
  time?: unknown;
  agentId?: unknown;
  agentName?: unknown;
  metadata?: unknown;
  path?: unknown;
  bytesWritten?: unknown;
  suite?: unknown;
  passed?: unknown;
  failed?: unknown;
  command?: unknown;
  exitCode?: unknown;
  reason?: unknown;
  prompt?: unknown;
  message?: unknown;
  errorMessage?: unknown;
  taskId?: unknown;
  environment?: unknown;
}

/**
 * Normalizes action strings into canonical action identifiers.
 *
 * @param actionRaw Incoming action text from transcript line.
 * @returns Canonical action when recognized, otherwise null.
 */
export function normalizeAction(actionRaw: unknown): AgentAction | null {
  if (typeof actionRaw !== 'string') {
    return null;
  }

  const normalized = actionRaw.trim().toLowerCase();
  const mapping: Record<string, AgentAction> = {
    read: 'read',
    reading: 'read',
    write: 'write',
    writing: 'write',
    test_run: 'test_run',
    testrun: 'test_run',
    testpass: 'test_pass',
    test_pass: 'test_pass',
    pass: 'test_pass',
    testfail: 'test_fail',
    test_fail: 'test_fail',
    fail: 'test_fail',
    terminal: 'terminal',
    bash: 'terminal',
    idle: 'idle',
    waiting: 'idle',
    error: 'error',
    crash: 'error',
    complete: 'complete',
    completed: 'complete',
    deploy: 'deploy',
    deployment: 'deploy',
    input_request: 'input_request',
    needs_input: 'input_request',
    ask_input: 'input_request',
    blocked: 'input_request'
  };

  return mapping[normalized] ?? null;
}

/**
 * Parses a timestamp from JSONL into epoch milliseconds.
 *
 * @param tsRaw Raw timestamp field value.
 * @returns Epoch milliseconds when parseable, otherwise null.
 */
export function parseTimestamp(tsRaw: unknown): number | null {
  if (typeof tsRaw === 'number' && Number.isFinite(tsRaw)) {
    if (tsRaw > 10_000_000_000) {
      return Math.trunc(tsRaw);
    }

    return Math.trunc(tsRaw * 1000);
  }

  if (typeof tsRaw === 'string') {
    const maybeNumber = Number(tsRaw);
    if (Number.isFinite(maybeNumber)) {
      return parseTimestamp(maybeNumber);
    }

    const parsedDate = Date.parse(tsRaw);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
  }

  return null;
}

/**
 * Parses and normalizes one JSONL transcript line into an AgentEvent.
 *
 * @param line Raw line to parse.
 * @param fallbackAgent Optional fallback agent identity for missing fields.
 * @returns Normalized event or null for malformed/unsupported input.
 */
export function parseAgentEventLine(
  line: string,
  fallbackAgent?: Pick<AgentConfig, 'id' | 'name'>
): AgentEvent | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!isRawTranscriptEvent(parsed)) {
    return null;
  }

  const action = normalizeAction(parsed.action ?? parsed.kind);
  if (action === null) {
    return null;
  }

  const ts = parseTimestamp(parsed.ts ?? parsed.timestamp ?? parsed.time) ?? Date.now();
  const parsedAgentId = typeof parsed.agentId === 'string' ? parsed.agentId.trim() : '';
  const fallbackAgentId = fallbackAgent?.id ?? '';
  const agentId = parsedAgentId.length > 0 ? parsedAgentId : fallbackAgentId;
  if (agentId.length === 0) {
    return null;
  }

  const base: AgentEventBase = { kind: action, ts, agentId };
  const parsedAgentName = typeof parsed.agentName === 'string' ? parsed.agentName.trim() : '';
  const agentName = parsedAgentName.length > 0 ? parsedAgentName : fallbackAgent?.name;
  const metadata = sanitizeMetadata(parsed.metadata);

  if (agentName !== undefined) {
    base.agentName = agentName;
  }

  if (metadata !== undefined) {
    base.metadata = metadata;
  }

  switch (action) {
    case 'read':
      return {
        ...base,
        kind: 'read',
        ...withOptional('path', asOptionalString(parsed.path))
      };
    case 'write':
      return {
        ...base,
        kind: 'write',
        ...withOptional('path', asOptionalString(parsed.path)),
        ...withOptional('bytesWritten', asOptionalFiniteNumber(parsed.bytesWritten))
      };
    case 'test_run':
      return {
        ...base,
        kind: 'test_run',
        ...withOptional('suite', asOptionalString(parsed.suite))
      };
    case 'test_pass':
      return {
        ...base,
        kind: 'test_pass',
        ...withOptional('passed', asOptionalFiniteNumber(parsed.passed))
      };
    case 'test_fail':
      return {
        ...base,
        kind: 'test_fail',
        ...withOptional('failed', asOptionalFiniteNumber(parsed.failed))
      };
    case 'terminal':
      return {
        ...base,
        kind: 'terminal',
        ...withOptional('command', asOptionalString(parsed.command)),
        ...withOptional('exitCode', asOptionalFiniteNumber(parsed.exitCode))
      };
    case 'idle':
      return {
        ...base,
        kind: 'idle',
        ...withOptional('reason', asOptionalString(parsed.reason))
      };
    case 'input_request':
      return {
        ...base,
        kind: 'input_request',
        ...withOptional('prompt', asOptionalString(parsed.prompt ?? parsed.message ?? parsed.reason))
      };
    case 'error':
      return {
        ...base,
        kind: 'error',
        ...withOptional('errorMessage', asOptionalString(parsed.errorMessage))
      };
    case 'complete':
      return {
        ...base,
        kind: 'complete',
        ...withOptional('taskId', asOptionalString(parsed.taskId))
      };
    case 'deploy':
      return {
        ...base,
        kind: 'deploy',
        ...withOptional('environment', asOptionalString(parsed.environment))
      };
    default:
      return null;
  }
}

/**
 * Checks if incoming JSON value is an object-like transcript payload.
 *
 * @param value Parsed JSON value.
 * @returns True when value can be processed as transcript event object.
 */
export function isRawTranscriptEvent(value: unknown): value is RawTranscriptEvent {
  return typeof value === 'object' && value !== null;
}

function sanitizeMetadata(value: unknown): Record<string, EventMetadataValue> | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const output: Record<string, EventMetadataValue> = {};

  for (const [key, itemValue] of Object.entries(value)) {
    if (
      typeof itemValue === 'string' ||
      typeof itemValue === 'number' ||
      typeof itemValue === 'boolean' ||
      itemValue === null
    ) {
      output[key] = itemValue;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}

function withOptional<T extends string, V>(
  key: T,
  value: V | undefined
): Record<T, V> | Record<string, never> {
  if (value === undefined) {
    return {};
  }

  return { [key]: value } as Record<T, V>;
}
