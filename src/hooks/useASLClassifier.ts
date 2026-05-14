import { useState, useCallback, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import type { HandLandmark, ScalerParams } from '../utils/handLandmarks';
import { processLandmarksForModel } from '../utils/handLandmarks';

interface PredictionResult {
  label: string;
  confidence: number;
}

export interface UseASLClassifierResult {
  predict: (landmarks: HandLandmark[]) => Promise<PredictionResult | null>;
  isLoading: boolean;
  error: string | null;
}

const MODEL_PATH = '/models/asl-classifier/model.json';
const SCALER_PATH = '/models/asl-classifier/scaler.json';
const LABELS_PATH = '/models/asl-classifier/labels.json';

// Module-level singleton — survives navigation, loads only once per session.
const _singleton = {
  model: null as tf.LayersModel | null,
  scaler: null as ScalerParams | null,
  labels: null as string[] | null,
  loadPromise: null as Promise<void> | null,
};

function getOrLoadClassifier(): Promise<void> {
  if (_singleton.model) return Promise.resolve();
  if (_singleton.loadPromise) return _singleton.loadPromise;

  _singleton.loadPromise = (async () => {
    const [model, scalerRes, labelsRes] = await Promise.all([
      tf.loadLayersModel(MODEL_PATH),
      fetch(SCALER_PATH),
      fetch(LABELS_PATH),
    ]);

    if (!scalerRes.ok) throw new Error(`Failed to load scaler: ${scalerRes.statusText}`);
    if (!labelsRes.ok) throw new Error(`Failed to load labels: ${labelsRes.statusText}`);

    _singleton.scaler = await scalerRes.json() as ScalerParams;
    _singleton.labels = await labelsRes.json() as string[];
    _singleton.model = model;

    // Warm up so the first real prediction isn't slow
    const dummy = tf.zeros([1, 63]);
    (model.predict(dummy) as tf.Tensor).dispose();
    dummy.dispose();
  })().catch(err => {
    _singleton.loadPromise = null; // allow retry on next mount
    throw err;
  });

  return _singleton.loadPromise;
}

/**
 * Hook for ASL classification using TensorFlow.js.
 * The model is loaded once per session and reused across mounts.
 */
export function useASLClassifier(): UseASLClassifierResult {
  const [isLoading, setIsLoading] = useState(() => !_singleton.model);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (_singleton.model) return; // already loaded, isLoading already false

    let isCurrent = true;

    getOrLoadClassifier()
      .then(() => { if (isCurrent) setIsLoading(false); })
      .catch(err => {
        if (isCurrent) {
          setError(err instanceof Error ? err.message : 'Failed to load ASL classifier');
          setIsLoading(false);
        }
      });

    return () => { isCurrent = false; };
    // No dispose — singleton persists for the session
  }, []);

  const predict = useCallback(async (landmarks: HandLandmark[]): Promise<PredictionResult | null> => {
    const { model, scaler, labels } = _singleton;
    if (!model || !scaler || !labels) return null;

    if (landmarks.length !== 21) {
      console.warn(`Expected 21 landmarks, got ${landmarks.length}`);
      return null;
    }

    const inputArray = processLandmarksForModel(landmarks, scaler);
    const inputTensor = tf.tensor2d([Array.from(inputArray)], [1, 63]);

    try {
      const outputTensor = model.predict(inputTensor) as tf.Tensor;
      const probabilities = tf.softmax(outputTensor);
      const probArray = await probabilities.data();

      let maxIdx = 0;
      let maxProb = probArray[0];
      for (let i = 1; i < probArray.length; i++) {
        if (probArray[i] > maxProb) {
          maxProb = probArray[i];
          maxIdx = i;
        }
      }

      inputTensor.dispose();
      outputTensor.dispose();
      probabilities.dispose();

      return { label: labels[maxIdx], confidence: maxProb };
    } catch (err) {
      console.error('Prediction error:', err);
      inputTensor.dispose();
      return null;
    }
  }, []);

  return { predict, isLoading, error };
}
