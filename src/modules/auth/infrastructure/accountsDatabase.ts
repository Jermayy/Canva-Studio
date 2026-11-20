import type { Session } from '@/modules/auth/domain/authModel';
import Dexie, { type Table } from 'dexie';

/**
 * Device-level auth storage, separate from any workspace: local accounts
 * (password verifiers only, never passwords), wrapped workspace keys and
 * the current session.
 */

export interface LocalAccountRow {
  id: string;
  email: string;
  displayName: string;
  salt: string;
  verifier: string;
  iterations: number;
  createdAt: string;
}

export interface WrappedKeyRow {
  userId: string;
  salt: string;
  iterations: number;
  iv: string;
  wrapped: string;
}

export interface SessionRow {
  id: 'current';
  session: Session;
  dataKey: CryptoKey;
}

export class AccountsDatabase extends Dexie {
  declare accounts: Table<LocalAccountRow, string>;
  declare keys: Table<WrappedKeyRow, string>;
  declare sessions: Table<SessionRow, string>;

  constructor(name = 'canvas-studio-v2-accounts') {
    super(name);
    this.version(1).stores({
      accounts: 'id, &email',
      keys: 'userId',
      sessions: 'id',
    });
  }
}
