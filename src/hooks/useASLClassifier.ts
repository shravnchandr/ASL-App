import { useRef, useState, useCallback, useEffect } from 'react';
import * as tf from '@tensorflow/tfjs';
import type { HandLandmark, ScalerParams } from '../utils/handLandmarks';
import { processLandmarksForModel } from '../utils/handLandmarks';

export interface PredictionResult {
  label: string;
  confidence: number;
}

export interface UseASLClassifierResult {
  predict: (landmarks: HandLandmark[]) => PredictionResult | null;
  isLoading: boolean;
  error: string | null;
}

const MODEL_PATH = '/models/asl-classifier/model.json';
const SCALER_PATH = '/models/asl-classifier/scaler.json';
const LABELS_PATH = '/models/asl-classifier/labels.json';

/**
 * Hook for ASL classification using TensorFlow.js.
 */
export function useASLClassifier(): UseASLClassifierResult {
  const modelRef = useRef<tf.LayersModel | null>(null);
  const scalerRef = useRef<ScalerParams | null>(null);
  const labelsRef = useRef<string[] | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load model, scaler, and labels
  useEffect(() => {
    const loadAssets = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Load all assets in parallel
        const [model, scalerResponse, labelsResponse] = await Promise.all([
          tf.loadLayersModel(MODEL_PATH),
          fetch(SCALER_PATH),
          fetch(LABELS_PATH),
        ]);

        if (!scalerResponse.ok) {
          throw new Error(`Failed to load scaler: ${scalerResponse.statusText}`);
        }
        if (!labelsResponse.ok) {
          throw new Error(`Failed to load labels: ${labelsResponse.statusText}`);
        }

        const scaler: ScalerParams = await scalerResponse.json();
        const labels: string[] = await labelsResponse.json();

        modelRef.current = model;
        scalerRef.current = scaler;
        labelsRef.current = labels;

        // Warm up the model with a dummy prediction
        const dummyInput = tf.zeros([1, 63]);
        const warmupResult = model.predict(dummyInput) as tf.Tensor;
        warmupResult.dispose();
        dummyInput.dispose();

        setIsLoading(false);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load ASL classifier';
        setError(message);
        setIsLoading(false);
      }
    };

    loadAssets();

    return () => {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
    };
  }, []);

  const predict = useCallback((landmarks: HandLandmark[]): PredictionResult | null => {
    const model = modelRef.current;
    const scaler = scalerRef.current;
    const labels = labelsRef.current;

    if (!model || !scaler || !labels) {
      return null;
    }

    if (landmarks.length !== 21) {
      console.warn(`Expected 21 landmarks, got ${landmarks.length}`);
      return null;
    }

    // Process landmarks and run inference
    const inputArray = processLandmarksForModel(landmarks, scaler);
    const inputTensor = tf.tensor2d([Array.from(inputArray)], [1, 63]);

    try {
      const outputTensor = model.predict(inputTensor) as tf.Tensor;
      const probabilities = tf.softmax(outputTensor);
      const probArray = probabilities.dataSync();

      // Find argmax
      let maxIdx = 0;
      let maxProb = probArray[0];
      for (let i = 1; i < probArray.length; i++) {
        if (probArray[i] > maxProb) {
          maxProb = probArray[i];
          maxIdx = i;
        }
      }

      // Cleanup tensors
      inputTensor.dispose();
      outputTensor.dispose();
      probabilities.dispose();

      return {
        label: labels[maxIdx],
        confidence: maxProb,
      };
    } catch (err) {
      console.error('Prediction error:', err);
      inputTensor.dispose();
      return null;
    }
  }, []);

  return {
    predict,
    isLoading,
    error,
  };
}
