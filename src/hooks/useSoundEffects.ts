/**
 * useSoundEffects Hook
 * Provides optional sound effects for camera recognition
 */

import { useCallback, useRef, useState, useEffect } from 'react';

const SOUND_EFFECTS_KEY = 'asl_sound_effects_enabled';

// Simple Web Audio API based sounds
interface SoundConfig {
  frequency: number;
  duration: number;
  type: OscillatorType;
  volume: number;
}

const SOUNDS: Record<string, SoundConfig> = {
  letterAdded: {
    frequency: 800,
    duration: 0.1,
    type: 'sine',
    volume: 0.3,
  },
  success: {
    frequency: 523.25, // C5
    duration: 0.15,
    type: 'sine',
    volume: 0.3,
  },
  error: {
    frequency: 200,
    duration: 0.2,
    type: 'square',
    volume: 0.2,
  },
};

export function useSoundEffects() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isEnabled, setIsEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SOUND_EFFECTS_KEY) === 'true';
  });

  // Initialize AudioContext lazily (must be after user interaction)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioContextRef.current;
  }, []);

  // Play a sound effect
  const playSound = useCallback((soundName: keyof typeof SOUNDS) => {
    if (!isEnabled) return;

    const config = SOUNDS[soundName];
    if (!config) return;

    try {
      const ctx = getAudioContext();

      // Resume context if suspended (browser autoplay policy)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = config.type;
      oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);

      gainNode.gain.setValueAtTime(config.volume, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + config.duration);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + config.duration);
    } catch (error) {
      console.warn('Sound effect failed:', error);
    }
  }, [isEnabled, getAudioContext]);

  // Play success sound (ascending notes)
  const playSuccess = useCallback(() => {
    if (!isEnabled) return;

    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      const duration = 0.12;

      notes.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime + index * duration);

        gainNode.gain.setValueAtTime(0.25, ctx.currentTime + index * duration);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + index * duration + duration);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start(ctx.currentTime + index * duration);
        oscillator.stop(ctx.currentTime + index * duration + duration);
      });
    } catch (error) {
      console.warn('Success sound failed:', error);
    }
  }, [isEnabled, getAudioContext]);

  // Toggle sound effects
  const toggleSounds = useCallback(() => {
    setIsEnabled(prev => {
      const newValue = !prev;
      localStorage.setItem(SOUND_EFFECTS_KEY, String(newValue));
      return newValue;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isEnabled,
    toggleSounds,
    playLetterAdded: () => playSound('letterAdded'),
    playSuccess,
    playError: () => playSound('error'),
  };
}
