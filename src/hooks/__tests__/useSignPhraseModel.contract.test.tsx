import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhraseBundleId, UseSignPhraseModelResult } from '../useSignPhraseModel';

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('onnxruntime-web/wasm', () => ({
  env: { wasm: { numThreads: 1 } },
  InferenceSession: { create: mocks.create },
}));

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.resetModules();
  mocks.create.mockReset().mockResolvedValue({ run: vi.fn() });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  container.remove();
  vi.unstubAllGlobals();
});

const LABELS = JSON.stringify(['boat']);
const MODEL = 'onnx bytes';
const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;
const fileOf = (url: string) => new URL(url, 'https://app.test').pathname.split('/').pop()!;

/** Mounts the hook with a server that has `served` (default: the files this build expects). */
async function mount(spec: unknown, bundle: PhraseBundleId = 'frozen-phrases07', served: Record<string, string> = {}) {
  const built: Record<string, string> = {
    'labels.json': LABELS, 'preprocess.json': JSON.stringify(spec), 'sign_ctc.onnx': MODEL,
  };
  const { sha256Hex } = await vi.importActual<typeof import('../../utils/phraseModelHashes')>('../../utils/phraseModelHashes');
  const hashes: Record<string, string> = {};
  for (const [file, text] of Object.entries(built)) hashes[file] = await sha256Hex(bytes(text));
  vi.doMock('../../utils/phraseModelHashes', () => ({
    sha256Hex,
    PHRASE_MODEL_HASHES: { 'frozen-phrases07': hashes, phrases05: hashes },
  }));
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    arrayBuffer: async () => bytes(served[fileOf(url)] ?? built[fileOf(url)]),
  }));
  vi.stubGlobal('fetch', fetcher);
  const { useSignPhraseModel } = await import('../useSignPhraseModel');
  let current: UseSignPhraseModelResult | undefined;
  function Probe() {
    const result = useSignPhraseModel(bundle);
    useEffect(() => { current = result; }, [result]);
    return null;
  }
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(Probe));
  });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  return { current: current!, fetcher, hashes };
}

describe('phrase model contract selection', () => {
  it.each([
    { spec: {}, expected: 'legacy' },
    { spec: { contract_version: 'v4' }, expected: 'v4' },
  ])('loads $expected preprocessing, each file under its own content hash', async ({ spec, expected }) => {
    const { current, fetcher, hashes } = await mount(spec);
    expect(current.error).toBeNull();
    expect(current.isLoading).toBe(false);
    expect(current.contractVersion).toBe(expected);
    const urls = fetcher.mock.calls.map(([url]) => new URL(url, 'https://app.test'));
    expect(urls.map(u => u.pathname).sort()).toEqual([
      '/models/sign-phrases/labels.json', '/models/sign-phrases/preprocess.json', '/models/sign-phrases/sign_ctc.onnx',
    ]);
    for (const u of urls) expect(u.searchParams.get('v')).toBe(hashes[fileOf(u.href)]);
    // The session is made from the checked bytes, not from a URL fetched again
    expect(new TextDecoder().decode(mocks.create.mock.calls[0][0])).toBe(MODEL);
  });

  it('loads the fallback bundle from its own folder', async () => {
    const { current, fetcher } = await mount({}, 'phrases05');
    expect(current.contractVersion).toBe('legacy');
    expect(fetcher.mock.calls.map(([url]) => new URL(url, 'https://app.test').pathname).sort()).toEqual([
      '/models/sign-phrases/phrases05/labels.json', '/models/sign-phrases/phrases05/preprocess.json',
      '/models/sign-phrases/phrases05/sign_ctc.onnx',
    ]);
  });

  it.each(['preprocess.json', 'sign_ctc.onnx'])('refuses a %s from another export', async file => {
    // A new export was deployed after this page was built
    const { current } = await mount({ contract_version: 'v4' }, 'frozen-phrases07', { [file]: 'newer export' });
    expect(current.error).toContain('does not match this version of the app');
    expect(current.contractVersion).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown contract before creating the model session', async () => {
    const { current } = await mount({ contract_version: 'v5' });
    expect(current.error).toContain('Unsupported phrase preprocessing contract');
    expect(current.contractVersion).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
