let context: AudioContext | undefined;
export function cue(
  enabled: boolean,
  kind: "choice" | "dice" | "paper" = "choice",
) {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    void context.resume();
    const now = context.currentTime,
      oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(
      kind === "dice" ? 160 : kind === "paper" ? 280 : 440,
      now,
    );
    oscillator.frequency.exponentialRampToValueAtTime(
      kind === "dice" ? 70 : 220,
      now + 0.09,
    );
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
  } catch {
    /* Sound is optional. Never interrupt an action when audio is unavailable. */
  }
}
