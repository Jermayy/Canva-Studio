/**
 * Port for share links (ADR 0008). The Supabase adapter implements it;
 * tests use a fake.
 */

export interface DesignShare {
  /** The unguessable link token. */
  id: string;
  title: string;
  width: number;
  height: number;
  /** ISO timestamp of the last publish; busts image caches. */
  updatedAt: string;
}

export interface PublishShareInput {
  designId: string;
  title: string;
  width: number;
  height: number;
  /** PNG bytes of the design. */
  png: Uint8Array;
}

/** What the public share page shows. */
export interface SharedDesignView extends DesignShare {
  imageUrl: string;
}

export interface ShareStore {
  /** The current share of a design, or null if it isn't shared. */
  getForDesign(designId: string): Promise<DesignShare | null>;
  /** Creates the share, or refreshes its image and title; keeps the link. */
  publish(input: PublishShareInput): Promise<DesignShare>;
  /** Deletes the image, then the link. No-op if not shared. */
  unpublish(designId: string): Promise<void>;
}

/** Loads a public share by token; null when it doesn't exist (any more). */
export type FetchSharedDesign = (
  shareId: string,
) => Promise<SharedDesignView | null>;
