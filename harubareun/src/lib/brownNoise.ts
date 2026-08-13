// 갈색 소음(brown noise) 생성기. 저주파가 강조돼 폭포·굵은 빗소리 같은 집중용 배경음.
// 흰 소음을 누적(랜덤워크)해 만들고, 저역통과 필터로 낮은 대역을 더 강조한다.
// Web Audio만 사용 → 외부 파일·네트워크 불필요(오프라인 동작).

export type BrownNoise = {
  start: (volume: number) => void;
  stop: () => void;
  setVolume: (volume: number) => void;
  playing: () => boolean;
};

export function makeBrownNoise(ctx: AudioContext): BrownNoise {
  let src: AudioBufferSourceNode | null = null;
  let gain: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;

  function buildBuffer(): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 4); // 4초 루프
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // 누적(저역 강조)
      data[i] = last * 3.5; // 레벨 보정
    }
    return buffer;
  }

  return {
    start(volume: number) {
      if (src) return;
      src = ctx.createBufferSource();
      src.buffer = buildBuffer();
      src.loop = true;
      filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500; // 낮은 주파수 대역 강조
      gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    },
    stop() {
      if (src) {
        try {
          src.stop();
        } catch {
          /* ignore */
        }
        try {
          src.disconnect();
        } catch {
          /* ignore */
        }
        src = null;
      }
      if (filter) {
        filter.disconnect();
        filter = null;
      }
      if (gain) {
        gain.disconnect();
        gain = null;
      }
    },
    setVolume(volume: number) {
      if (gain) gain.gain.value = volume;
    },
    playing() {
      return !!src;
    },
  };
}
