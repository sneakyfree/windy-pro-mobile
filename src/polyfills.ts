/**
 * Runtime polyfills — MUST be imported first from the root layout.
 *
 * Hermes ships no WebCrypto. matrix-js-sdk v41 calls
 * `crypto.getRandomValues` (and `crypto.randomUUID`) during client
 * startup — without this shim the chat client dies with "Cannot read
 * property 'getRandomValues' of undefined" (found live on the iOS
 * simulator build, 2026-07-06). expo-crypto is already a dependency, so
 * its native RNG backs the shim — no new native module needed.
 */
import * as ExpoCrypto from 'expo-crypto';

type CryptoLike = {
    getRandomValues?: (array: ArrayBufferView) => ArrayBufferView;
    randomUUID?: () => string;
};

const g = globalThis as { crypto?: CryptoLike };

if (typeof g.crypto === 'undefined') {
    g.crypto = {};
}
if (typeof g.crypto.getRandomValues !== 'function') {
    g.crypto.getRandomValues = ((array: ArrayBufferView) =>
        ExpoCrypto.getRandomValues(array as Uint8Array)) as CryptoLike['getRandomValues'];
}
if (typeof g.crypto.randomUUID !== 'function') {
    g.crypto.randomUUID = () => ExpoCrypto.randomUUID();
}

/**
 * Promise.withResolvers (ES2024) — used 11× in matrix-js-sdk v41, incl.
 * the event scheduler on the message-send path. Hermes (RN 0.81) doesn't
 * ship it; without this shim every send dies with "undefined is not a
 * function" (found live on the iOS simulator build, main.jsbundle
 * scheduler queueEvent).
 */
type WithResolvers = <T>() => {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
};
const P = Promise as unknown as { withResolvers?: WithResolvers };
if (typeof P.withResolvers !== 'function') {
    P.withResolvers = function <T>() {
        let resolve!: (value: T | PromiseLike<T>) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
    };
}

/**
 * AbortSignal.timeout (WHATWG 2022) — RN's abort-controller polyfill
 * doesn't implement the static. Without this shim, every
 * `AbortSignal.timeout(ms)` call site (hatch pre-flight, analytics)
 * throws synchronously on Hermes; the hatch screen caught that throw and
 * blamed the user's Wi-Fi — in-app hatching was dead in release builds
 * (found live on the iOS simulator release bundle, 2026-07-08).
 */
type AbortSignalWithTimeout = typeof AbortSignal & {
    timeout?: (ms: number) => AbortSignal;
};
const A = globalThis.AbortSignal as AbortSignalWithTimeout | undefined;
if (A && typeof A.timeout !== 'function') {
    A.timeout = (ms: number): AbortSignal => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error(`TimeoutError: signal timed out after ${ms}ms`)), ms);
        return controller.signal;
    };
}
