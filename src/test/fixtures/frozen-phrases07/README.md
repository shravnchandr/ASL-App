# Frozen phrases07 fixtures (contract v4)

Copied from the model repo's `exports/frozen-phrases07/browser/fixtures/`, the
export that also produced the bundle in `public/models/sign-phrases/`. Replace
the model files and these fixtures together.

- Fourteen clips, gzipped with `mtime=0`: three real ASL Signs clips
  (`100015657`, `1001373962`, `concat`) and eleven synthetic contract cases.
  Each holds raw `frames`, the expected `kept_frames`, `hand_status`,
  `assignment_uncertain`, `segment`, `subsample` and float32 `features`, and the
  frozen phrases07 `logits` and `decoded` (null under 8 frames).
- `rule_vectors.json`: seven copied-hand threshold and tie cases.
- `timing_vectors.json`: six capture-timing cases for the 30 fps resampling plan.
- `SHA256SUMS`: the export's checksums. The tests check every fixture
  (uncompressed) and the served bundle files against it.

`signPhraseContract.test.ts` compares provenance, segment and subsample exactly,
features bit for bit, logits within 1e-3 in onnxruntime-web, and the decode
exactly. `signPhrase.test.ts` compares the timing plans exactly.

`face_lost_in_span` pins fill-then-trim: a face seen only before the hand span is
held inside it.

```sh
npm test -- src/utils/__tests__/signPhraseContract.test.ts src/utils/__tests__/signPhrase.test.ts src/hooks/__tests__/useSignPhraseModel.contract.test.tsx
```

The fallback bundle (`public/models/sign-phrases/phrases05/`, legacy contract)
keeps its own fixtures in `../phrases05/`.
