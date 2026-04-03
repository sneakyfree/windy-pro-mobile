/**
 * 🧬 Fetch with timeout wrapper
 * Wraps native fetch with an AbortController-based timeout.
 * Prevents requests from hanging indefinitely on poor connections.
 */

const DEFAULT_TIMEOUT_MS = 10_000; // 10 seconds for standard API calls

/** Use for file uploads/downloads and other long-running requests */
export const UPLOAD_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Fetch with an automatic timeout.
 * @param url - Request URL
 * @param options - Standard RequestInit options
 * @param timeoutMs - Timeout in milliseconds (default: 15s)
 * @returns Response
 * @throws Error with message 'Request timed out' on timeout
 */
export async function fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw err;
    } finally {
        clearTimeout(timeoutId);
    }
}
