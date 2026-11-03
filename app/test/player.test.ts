import { describe, expect, it } from 'vitest';
import { SegmentPlayer } from '../src/audio/player';

/** <audio> de mentira: só o que o tocador usa. */
function fakeAudio() {
  const a = {
    src: '',
    currentTime: 0,
    paused: true,
    preload: '',
    addEventListener() {},
    play() {
      a.paused = false;
      return Promise.resolve();
    },
    pause() {
      a.paused = true;
    },
  };
  return a;
}

describe('tocador por trechos', () => {
  // Jer 40:15 até o fim (100 s a 400 s) e Jer 41 até o v. 5 (0 s a 120 s): 420 s no total.
  const segs = [
    { chapter: 40, url: 'https://cfp2.jw-cdn.org/a/jer40.mp3', start: 100, end: 400 },
    { chapter: 41, url: 'https://cfp2.jw-cdn.org/a/jer41.mp3', start: 0, end: 120 },
  ];

  it('avança e volta 10 s e 30 s, passando de um capítulo para o outro', async () => {
    const audio = fakeAudio();
    const p = new SegmentPlayer(audio as unknown as HTMLAudioElement);
    await p.play('Leitura de hoje', segs);
    expect(audio.currentTime).toBe(100);

    p.forward(30);
    expect(audio.currentTime).toBe(130);
    expect(p.state!.pos).toBe(30);
    p.forward(10);
    expect(audio.currentTime).toBe(140);
    p.back(10);
    expect(audio.currentTime).toBe(130);

    // Perto do fim do capítulo 40: +30 s cai no capítulo 41.
    p.skip(260); // pos 290 (arquivo 390)
    expect(audio.currentTime).toBe(390);
    p.forward(30);
    await Promise.resolve();
    expect(audio.src).toBe(segs[1].url);
    expect(audio.currentTime).toBe(20);
    expect(p.state!.segment).toBe(1);

    // −30 s volta para o capítulo 40.
    p.back(30);
    await Promise.resolve();
    expect(audio.src).toBe(segs[0].url);
    expect(audio.currentTime).toBe(390);

    // Não volta antes do início da porção nem passa do fim.
    p.back(1000);
    expect(audio.currentTime).toBe(100);
    p.forward(10_000);
    expect(p.state!.done).toBe(true);
    expect(p.state!.pos).toBe(420);
  });
});
