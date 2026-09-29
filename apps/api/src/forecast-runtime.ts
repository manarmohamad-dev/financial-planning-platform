import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  runtimeInputSchema,
  runtimeResultSchema,
  type RuntimeInput,
  type RuntimeResult,
} from '../../../packages/forecasting/src/model.js';
import { monthsFrom } from '../../../packages/planning/src/model.js';
let active = 0;
export type ForecastRunner = (input: RuntimeInput) => Promise<RuntimeResult>;
/** Server-controlled executable/script only. Financial inputs use stdin, never arguments/files. */
export function runForecast(
  input: RuntimeInput,
  options: { python?: string; script?: string; timeoutMs?: number } = {},
): Promise<RuntimeResult> {
  const validated = runtimeInputSchema.parse(input);
  if (active >= 2) return Promise.reject(new Error('FORECAST_BUSY'));
  active++;
  return new Promise((resolveResult, reject) => {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['SystemRoot', 'WINDIR', 'PATH'])
      if (process.env[key]) env[key] = process.env[key];
    const child = spawn(
      options.python ?? process.env.FORECAST_PYTHON ?? 'python',
      ['-I', '-S', options.script ?? resolve('packages/forecasting/runtime/worker.py')],
      { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let done = false,
      output = '',
      bytes = 0;
    const finish = (error?: string, result?: RuntimeResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      active--;
      if (error) {
        child.kill('SIGKILL');
        reject(new Error(error));
      } else resolveResult(result!);
    };
    const timer = setTimeout(() => finish('FORECAST_TIMEOUT'), options.timeoutMs ?? 10000);
    child.on('error', () => finish('FORECAST_PROCESS_FAILED'));
    child.stdin.on('error', () => finish('FORECAST_PROCESS_FAILED'));
    child.stdout.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 1048576) finish('FORECAST_OUTPUT_LIMIT');
      else output += data.toString('utf8');
    });
    child.stderr.on('data', () => {
      /* Never log potentially private process output. */
    });
    child.on('close', (code) => {
      if (done) return;
      if (code !== 0) return finish('FORECAST_PROCESS_FAILED');
      try {
        const result = runtimeResultSchema.parse(JSON.parse(output));
        const periods = monthsFrom(input.origin, input.horizon);
        if (
          result.status === 'supported' &&
          (result.points.length !== input.horizon ||
            result.points.some((p, i) => p.period !== periods[i]))
        )
          throw new Error();
        finish(undefined, result);
      } catch {
        finish('FORECAST_PROTOCOL_FAILED');
      }
    });
    child.stdin.end(JSON.stringify(validated));
  });
}
