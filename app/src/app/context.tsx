import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { SegmentPlayer, type PlayerState } from '../audio/player';
import type { Repo } from '../data/repo';
import type { AudioStore } from './audioStore';
import type { SyncController } from './syncController';

export interface Services {
  repo: Repo;
  audio: AudioStore;
  sync: SyncController;
  player: SegmentPlayer;
}

const Ctx = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value: Services; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useServices(): Services {
  const s = useContext(Ctx);
  if (!s) throw new Error('Serviços não inicializados');
  return s;
}

/** Redesenha quando os dados locais mudam. */
export function useRepoVersion(): number {
  const { repo } = useServices();
  return useSyncExternalStore(
    (fn) => repo.subscribe(fn),
    () => repo.version,
  );
}

export function useAudioVersion(): number {
  const { audio } = useServices();
  return useSyncExternalStore(
    (fn) => audio.subscribe(fn),
    () => audio.version,
  );
}

export function useSyncVersion(): number {
  const { sync } = useServices();
  return useSyncExternalStore(
    (fn) => sync.subscribe(fn),
    () => sync.version,
  );
}

export function usePlayer(): PlayerState | null {
  const { player } = useServices();
  return useSyncExternalStore(
    (fn) => player.subscribe(fn),
    () => player.state,
  );
}
