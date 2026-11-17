import type {
  DesignShare,
  PublishShareInput,
  ShareStore,
} from '@/modules/share/shareStore';

/** In-memory share store with the same semantics as the Supabase one. */
export class FakeShareStore implements ShareStore {
  readonly shares = new Map<string, DesignShare>();
  readonly images = new Map<string, Uint8Array>();
  failNext: Error | null = null;
  private clock = 0;

  /** Like real network calls, failures reject rather than throw. */
  private call<T>(work: () => T): Promise<T> {
    const error = this.failNext;
    this.failNext = null;
    return error ? Promise.reject(error) : Promise.resolve().then(work);
  }

  getForDesign(designId: string): Promise<DesignShare | null> {
    return this.call(() => this.shares.get(designId) ?? null);
  }

  publish(input: PublishShareInput): Promise<DesignShare> {
    return this.call(() => this.publishNow(input));
  }

  private publishNow(input: PublishShareInput): DesignShare {
    this.clock += 1;
    const share: DesignShare = {
      id: this.shares.get(input.designId)?.id ?? crypto.randomUUID(),
      title: input.title,
      width: input.width,
      height: input.height,
      updatedAt: new Date(this.clock * 1000).toISOString(),
    };
    this.shares.set(input.designId, share);
    this.images.set(share.id, input.png);
    return share;
  }

  unpublish(designId: string): Promise<void> {
    return this.call(() => {
      const share = this.shares.get(designId);
      if (share) {
        this.images.delete(share.id);
        this.shares.delete(designId);
      }
    });
  }
}
