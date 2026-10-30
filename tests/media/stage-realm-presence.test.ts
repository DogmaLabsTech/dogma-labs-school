import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetStageRealmPresenceForTesting,
  bindStageRealmPresence,
  probeStageRealmPresence,
} from '@/lib/media/stage-realm-presence';

/**
 * A peer realm is modelled with its own channel: it answers presence probes the
 * way a second tab's bound module would.
 */
function peerHoldingStage(stageId: string, onProbe: () => void = () => {}): BroadcastChannel {
  const peer = new BroadcastChannel('maic-stage-presence');
  peer.onmessage = (event: MessageEvent) => {
    const message = event.data;
    if (message?.kind !== 'probe') return;
    onProbe();
    if (message.stageId === stageId) {
      peer.postMessage({ kind: 'present', stageId, probeId: message.probeId });
    }
  };
  return peer;
}

// The probe gives a peer PROBE_TIMEOUT_MS (60 ms of wall clock) to answer, which a loaded
// machine can miss. The tests therefore own that clock: only setTimeout/clearTimeout are
// faked, so the real BroadcastChannel delivery still runs, and a test lets the probe time
// out (`expireProbe`) only once the peer has had every chance to answer.
const realSetTimeout = globalThis.setTimeout;
const realWait = (ms: number) => new Promise<void>((resolve) => realSetTimeout(resolve, ms));

async function expireProbe(peerSawProbe?: Promise<void>): Promise<void> {
  if (peerSawProbe) {
    await peerSawProbe;
    // Let any answer the peer posted reach the probe before it is allowed to time out.
    await realWait(20);
  }
  vi.runOnlyPendingTimers();
}

describe('stage realm presence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetStageRealmPresenceForTesting();
  });

  it('reports a peer that has the same stage open', async () => {
    bindStageRealmPresence(() => 'stage-1');
    const peer = peerHoldingStage('stage-1');

    try {
      expect(await probeStageRealmPresence('stage-1')).toBe('present');
    } finally {
      peer.close();
    }
  });

  it('reports no peer when the other realm holds a different stage', async () => {
    bindStageRealmPresence(() => 'stage-1');
    let sawProbe!: () => void;
    const peerSawProbe = new Promise<void>((resolve) => {
      sawProbe = resolve;
    });
    const peer = peerHoldingStage('stage-other', sawProbe);

    try {
      const probing = probeStageRealmPresence('stage-1');
      await expireProbe(peerSawProbe);
      expect(await probing).toBe('absent');
    } finally {
      peer.close();
    }
  });

  it('reports no peer when nobody answers', async () => {
    bindStageRealmPresence(() => 'stage-1');

    const probing = probeStageRealmPresence('stage-1');
    await expireProbe();
    expect(await probing).toBe('absent');
  });

  it('reports unknown when the environment has no BroadcastChannel', async () => {
    const original = globalThis.BroadcastChannel;
    // @ts-expect-error - modelling an environment without the API
    delete globalThis.BroadcastChannel;
    try {
      expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });

  it('reports unknown before any realm has bound', async () => {
    // No bindStageRealmPresence call: the pool binds asynchronously at load.
    expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
  });

  it('reports unknown when the channel constructor throws', async () => {
    const original = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = class {
      constructor() {
        throw new Error('channel unavailable');
      }
    } as unknown as typeof BroadcastChannel;
    try {
      bindStageRealmPresence(() => 'stage-1');
      expect(await probeStageRealmPresence('stage-1')).toBe('unknown');
    } finally {
      globalThis.BroadcastChannel = original;
    }
  });
});
