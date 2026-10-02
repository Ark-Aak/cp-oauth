import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { createError } from 'h3';
import { z } from 'zod';
import { hasC0ControlCharacters } from '../../utils/control-characters';

const PYTHON_SCRIPT = resolve(process.cwd(), 'server/utils/clist-fetch.py');
const PYTHON_BIN = process.env.PYTHON_PATH || 'python';
const DEADLINE_MS = 25_000;
const MAX_BUFFER_BYTES = 2 * 1024 * 1024;
const MAX_CONCURRENT = 4;
const MAX_QUEUED = 16;

interface ClistFetchParams {
    method: 'GET' | 'POST';
    url: string;
    headers?: Record<string, string>;
    data?: Record<string, string>;
    sessionInit?: string;
}

interface ClistFetchResult {
    status: number;
    body: string;
    error: 'timeout' | 'network' | 'invalid_response' | null;
}

const resultSchema = z
    .object({
        status: z.number().int().min(0).max(599),
        body: z.string(),
        error: z.enum(['timeout', 'network', 'invalid_response']).nullable()
    })
    .strict();

interface WaitingRequest {
    resolve: () => void;
    timer: NodeJS.Timeout;
}

let activeRequests = 0;
const waitingRequests: WaitingRequest[] = [];

function assertClistUrl(value: string): void {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw createError({ statusCode: 502, message: 'Invalid Clist request URL' });
    }
    if (
        url.protocol !== 'https:' ||
        url.hostname !== 'clist.by' ||
        url.username ||
        url.password ||
        url.port ||
        url.hash ||
        /[\\ ]/.test(value) ||
        hasC0ControlCharacters(value)
    ) {
        throw createError({ statusCode: 502, message: 'Invalid Clist request URL' });
    }
}

async function acquireSlot(deadline: number): Promise<void> {
    if (activeRequests < MAX_CONCURRENT) {
        activeRequests += 1;
        return;
    }
    if (waitingRequests.length >= MAX_QUEUED) {
        throw createError({ statusCode: 503, message: 'Clist request queue is full' });
    }
    await new Promise<void>((resolveSlot, reject) => {
        const ticket: WaitingRequest = {
            resolve: resolveSlot,
            timer: setTimeout(
                () => {
                    const index = waitingRequests.indexOf(ticket);
                    if (index !== -1) waitingRequests.splice(index, 1);
                    reject(createError({ statusCode: 504, message: 'Clist request timed out' }));
                },
                Math.max(1, deadline - Date.now())
            )
        };
        waitingRequests.push(ticket);
    });
}

function releaseSlot(): void {
    const next = waitingRequests.shift();
    if (next) {
        clearTimeout(next.timer);
        next.resolve();
    } else {
        activeRequests -= 1;
    }
}

export async function clistFetch(params: ClistFetchParams): Promise<ClistFetchResult> {
    assertClistUrl(params.url);
    if (params.sessionInit) assertClistUrl(params.sessionInit);
    const deadline = Date.now() + DEADLINE_MS;
    await acquireSlot(deadline);
    try {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return { status: 0, body: '', error: 'timeout' };
        const input = JSON.stringify({
            method: params.method,
            url: params.url,
            headers: params.headers || {},
            data: params.data || null,
            sessionInit: params.sessionInit || null,
            deadlineSeconds: Math.min(20, remaining / 1000)
        });
        return await new Promise<ClistFetchResult>(resolveResult => {
            const child = execFile(
                PYTHON_BIN,
                [PYTHON_SCRIPT],
                { timeout: remaining, maxBuffer: MAX_BUFFER_BYTES },
                (error, stdout) => {
                    if (error) {
                        resolveResult({
                            status: 0,
                            body: '',
                            error:
                                error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
                                    ? 'invalid_response'
                                    : error.killed
                                      ? 'timeout'
                                      : 'network'
                        });
                        return;
                    }
                    try {
                        const parsed = resultSchema.safeParse(JSON.parse(stdout));
                        if (
                            parsed.success &&
                            (parsed.data.error === null
                                ? parsed.data.status >= 100
                                : parsed.data.status === 0 && parsed.data.body === '')
                        ) {
                            resolveResult(parsed.data);
                            return;
                        }
                    } catch {
                        // Never include process output or upstream bodies in logs or errors.
                    }
                    resolveResult({ status: 0, body: '', error: 'invalid_response' });
                }
            );
            child.stdin?.on('error', () => {
                // The process callback owns reporting an early subprocess exit.
            });
            child.stdin?.end(input);
        });
    } finally {
        releaseSlot();
    }
}
