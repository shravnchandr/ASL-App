import { useState, useCallback, useEffect } from 'react';
import type { InferenceSession } from 'onnxruntime-web';
import { N_FEATURES, decodeGreedy } from '../utils/signPhrase';

export interface PhraseResult {
  glosses: string[];
  inferenceMs: number;
}

export interface UseSignPhraseModelResult {
  /** Run the CTC model on a (T, 788) feature block, 8 ≤ T ≤ 384. */
  recognize: (features: Float32Array, T: number) => Promise<PhraseResult | null>;
  isLoading: boolean;
  error: string | null;
}

const MODEL_PATH = '/models/sign-phrases/sign_ctc.onnx';
const LABELS_PATH = '/models/sign-phrases/labels.json';

type Ort = typeof import('onnxruntime-web');

// Module-level singleton — survives navigation, loads only once per session.
const _singleton = {
  ort: null as Ort | null,
  session: null as InferenceSession | null,
  labels: null as string[] | null,
  loadPromise: null as Promise<void> | null,
  // session.run() must not overlap; calls are chained
  queue: Promise.resolve() as Promise<unknown>,
};

function getOrLoadPhraseModel(): Promise<void> {
  if (_singleton.session) return Promise.resolve();
  if (_singleton.loadPromise) return _singleton.loadPromise;

  _singleton.loadPromise = (async () => {
    // Loaded on demand: the runtime is only needed in phrase mode
    const ort = await import('onnxruntime-web/wasm');
    // The runtime's .wasm is emitted to /assets by Vite and served same-origin
    ort.env.wasm.numThreads = 1; // threads need cross-origin isolation

    const [session, labelsRes] = await Promise.all([
      ort.InferenceSession.create(MODEL_PATH, { executionProviders: ['wasm'] }),
      fetch(LABELS_PATH),
    ]);
    if (!labelsRes.ok) throw new Error(`Failed to load labels: ${labelsRes.statusText}`);

    _singleton.labels = await labelsRes.json() as string[];
    _singleton.ort = ort;
    _singleton.session = session;
  })().catch(err => {
    _singleton.loadPromise = null; // allow retry on next mount
    throw err;
  });

  return _singleton.loadPromise;
}

/**
 * Hook for the continuous sign-phrase model (ONNX Runtime Web).
 * The session is loaded once per session and reused across mounts.
 */
export function useSignPhraseModel(): UseSignPhraseModelResult {
  const [isLoading, setIsLoading] = useState(() => !_singleton.session);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_singleton.session) return; // already loaded, isLoading already false

    let isCurrent = true;

    getOrLoadPhraseModel()
      .then(() => { if (isCurrent) setIsLoading(false); })
      .catch(err => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to load the phrase model');
          setIsLoading(false);
        }
      });

    return () => { isCurrent = false; };
  }, []);

  const recognize = useCallback((features: Float32Array, T: number): Promise<PhraseResult | null> => {
    const { ort, session, labels } = _singleton;
    if (!ort || !session || !labels) return Promise.resolve(null);

    const run = async (): Promise<PhraseResult | null> => {
      try {
        const start = performance.now();
        const { logits } = await session.run({
          features: new ort.Tensor('float32', features, [1, T, N_FEATURES]),
        });
        const inferenceMs = performance.now() - start;
        return { glosses: decodeGreedy(logits.data as Float32Array, T, labels), inferenceMs };
      } catch (err) {
        console.error('Phrase recognition error:', err);
        return null;
      }
    };
    const result = _singleton.queue.then(run);
    _singleton.queue = result;
    return result;
  }, []);

  return { recognize, isLoading, error };
}
