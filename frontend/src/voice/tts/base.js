// TTS interface. speak() queues an utterance; callbacks: onStart, onBoundary, onEnd.
export class Tts {
  supported = false;
  speak(_text, _callbacks) {}
  cancel() {}
}
