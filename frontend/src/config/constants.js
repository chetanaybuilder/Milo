/**
 * Centralized Application Configuration & Constants for MILO Frontend.
 * Houses all API, chat, voice, and system configuration in a single cohesive location.
 */

/**
 * Backend API communication configuration.
 */
export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
  MAX_RETRIES: 1,
  TIMEOUT_MS: 25000,
  RETRY_DELAY_MS: 800,
};

/**
 * Chat interface input constraints and suggestions.
 */
export const CHAT_CONFIG = {
  MAX_INPUT_CHARS: 2000,
  MAX_HISTORY_MESSAGES: 10,
  SUGGESTIONS: [
    { icon: '☀️', text: "What's the weather in Tokyo?" },
    { icon: '⚛️', text: 'Explain quantum computing simply' },
    { icon: '🚀', text: 'Latest space exploration news' },
  ],
};

/**
 * Voice synthesis and recognition tuning parameters.
 */
export const VOICE_CONFIG = {
  DEFAULT_PREFERENCES: {
    voice: '',
    rate: 1.0,
    pitch: 1.0,
  },
  ROOM_REVERB_WINDOW_MS: 1400, // Post-speech rejection window for room echo
  MIC_RESUME_DELAY_MS: 350, // Acoustic settling delay before reopening mic
  ERROR_RESET_DELAY_MS: 3500, // Automatic recovery time from transient errors
  SPOKEN_HISTORY_LIMIT: 1500, // Character limit of recent assistant speech for acoustic matching
  PULSE_DECAY_FACTOR: 0.93, // Decay factor for audio-reactive pulse smoothing
};

/**
 * Finite voice state machine modes.
 */
export const VOICE_STATES = {
  IDLE: 'IDLE',
  LISTENING: 'LISTENING',
  THINKING: 'THINKING',
  TOOL_USE: 'TOOL_USE',
  SPEAKING: 'SPEAKING',
  ERROR: 'ERROR',
};

/**
 * User-facing advisory notices for hardware permissions or feature degradation.
 */
export const NOTICES = {
  'mic-denied':
    'Microphone permission was denied. Please allow microphone access in your browser settings.',
  'mic-unavailable': 'No working microphone was detected on this device.',
  unsupported:
    'Voice input is not supported in this browser. Try Chrome, Edge or Safari, or type instead.',
};

/**
 * Sentence boundary pattern used to segment streaming tokens into natural spoken sentences.
 */
export const SENTENCE_DELIMITER_RE = /[.!?\n]\s/;
