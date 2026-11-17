import { useState, useCallback, useEffect } from 'react';
import type { InferenceSession } from 'onnxruntime-web';
import { N_FEATURES, decodeWithScores, type PhraseDecode } from '../utils/signPhrase';
import { phraseContractVersion, type PhraseContractVersion } from '../utils/signPhraseContract';
import { PHRASE_MODEL_HASHES, sha256Hex } from '../utils/phraseModelHashes';

export interface PhraseResult extends PhraseDecode {
  inferenceMs: number;
}

export interface UseSignPhraseModelResult {
  /** Run the CTC model on a (T, 788) feature block, 8 ≤ T ≤ 384. */
  recognize: (features: Float32Array, T: number) => Promise<PhraseResult | null>;
  isLoading: boolean;
  error: string | null;
  contractVersion: PhraseContractVersion | null;
}

/**
 * Model bundles from the model repo's exports. A bundle is one folder
 * (sign_ctc.onnx, labels.json, preprocess.json) and is never mixed with another;
 * its preprocess.json selects the preprocessing contract.
 */
export const PHRASE_BUNDLES = {
  'frozen-phrases07': { dir: '/models/sign-phrases/', name: 'phrases07 (new)' },
  phrases05: { dir: '/models/sign-phrases/phrases05/', name: 'phrases05' },
} as const;
export type PhraseBundleId = keyof typeof PHRASE_BUNDLES;
export const PHRASE_BUNDLE_IDS = Object.keys(PHRASE_BUNDLES) as PhraseBundleId[];
/** phrases05 stays the default until frozen phrases07 has passed the live camera check. */
export const DEFAULT_PHRASE_BUNDLE: PhraseBundleId = 'phrases05';

type BundleFile = 'sign_ctc.onnx' | 'labels.json' | 'preprocess.json';

/**
 * One bundle file, checked against the SHA-256 this build was made with (which
 * is also its `?v=`, so the URL is immutable and the service worker can keep it
 * offline). The server answers a path with whatever is deployed now, so without
 * the check an older page could combine files from two exports.
 */
async function fetchBundleFile(id: PhraseBundleId, file: BundleFile): Promise<ArrayBuffer> {
  const expected = PHRASE_MODEL_HASHES[id][file];
  const response = await fetch(`${PHRASE_BUNDLES[id].dir}${file}?v=${expected}`);
  if (!response.ok) throw new Error(`Failed to load ${file}: ${response.statusText}`);
  const data = await response.arrayBuffer();
  if (await sha256Hex(data) !== expected) {
    throw new Error('The phrase model on the server does not match this version of the app. Reload the page.');
  }
  return data;
}

const parseJson = (data: ArrayBuffer): unknown => JSON.parse(new TextDecoder().decode(data));

type Ort = typeof import('onnxruntime-web');

interface LoadedBundle {
  session: InferenceSession | null;
  labels: string[] | null;
  contractVersion: PhraseContractVersion | null;
  loadPromise: Promise<void> | null;
}

// Module-level singleton — survives navigation; each bundle loads only once per session.
const _singleton = {
  ort: null as Ort | null,
  bundles: {} as Partial<Record<PhraseBundleId, LoadedBundle>>,
  // session.run() must not overlap; calls are chained
  queue: Promise.resolve() as Promise<unknown>,
};

function bundleState(id: PhraseBundleId): LoadedBundle {
  return _singleton.bundles[id] ??= { session: null, labels: null, contractVersion: null, loadPromise: null };
}

function getOrLoadPhraseModel(id: PhraseBundleId): Promise<void> {
  const bundle = bundleState(id);
  if (bundle.session) return Promise.resolve();
  if (bundle.loadPromise) return bundle.loadPromise;

  bundle.loadPromise = (async () => {
    // Loaded on demand: the runtime is only needed in phrase mode
    const ort = await import('onnxruntime-web/wasm');
    // The runtime's .wasm is emitted to /assets by Vite and served same-origin
    ort.env.wasm.numThreads = 1; // threads need cross-origin isolation

    const [labels, spec] = (await Promise.all([
      fetchBundleFile(id, 'labels.json'),
      fetchBundleFile(id, 'preprocess.json'),
    ])).map(parseJson);
    const contractVersion = phraseContractVersion(spec);
    const model = await fetchBundleFile(id, 'sign_ctc.onnx');
    const session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'] });

    bundle.labels = labels as string[];
    bundle.contractVersion = contractVersion;
    _singleton.ort = ort;
    bundle.session = session;
  })().catch(err => {
    bundle.loadPromise = null; // allow retry on next mount
    throw err;
  });

  return bundle.loadPromise;
}

/**
 * Hook for the continuous sign-phrase model (ONNX Runtime Web).
 * A bundle's session is loaded once per session and reused across mounts.
 */
export function useSignPhraseModel(bundleId: PhraseBundleId = DEFAULT_PHRASE_BUNDLE): UseSignPhraseModelResult {
  const bundle = bundleState(bundleId);
  // Outcome of the last load this hook waited for, and the bundle it was for
  const [settled, setSettled] = useState<{ id: PhraseBundleId; error: string | null } | null>(null);

  useEffect(() => {
    if (bundleState(bundleId).session) return; // already loaded

    let isCurrent = true;

    getOrLoadPhraseModel(bundleId)
      .then(() => { if (isCurrent) setSettled({ id: bundleId, error: null }); })
      .catch(err => {
        if (isCurrent) {
          setSettled({ id: bundleId, error: err instanceof Error ? err.message : 'Failed to load the phrase model' });
        }
      });

    return () => { isCurrent = false; };
  }, [bundleId]);

  const recognize = useCallback((features: Float32Array, T: number): Promise<PhraseResult | null> => {
    const { ort } = _singleton;
    const { session, labels } = bundleState(bundleId);
    if (!ort || !session || !labels) return Promise.resolve(null);

    const run = async (): Promise<PhraseResult | null> => {
      try {
        const start = performance.now();
        const { logits } = await session.run({
          features: new ort.Tensor('float32', features, [1, T, N_FEATURES]),
        });
        const inferenceMs = performance.now() - start;
        return { ...decodeWithScores(logits.data as Float32Array, T, labels), inferenceMs };
      } catch (err) {
        console.error('Phrase recognition error:', err);
        return null;
      }
    };
    const result = _singleton.queue.then(run);
    _singleton.queue = result;
    return result;
  }, [bundleId]);

  const isSettled = settled?.id === bundleId;
  return {
    recognize,
    isLoading: !bundle.session && !isSettled,
    error: isSettled ? settled.error : null,
    contractVersion: bundle.contractVersion,
  };
}
