// STT interface. Implementations call the on* handlers; the controller assigns them.
export class Stt {
  supported = false;
  onInterim = () => {};
  onFinal = () => {};
  onError = () => {};
  onEnd = () => {};
  start() {}
  stop() {}
}
