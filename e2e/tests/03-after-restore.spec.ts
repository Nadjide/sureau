import { test } from '@playwright/test';
import { expectSessionRejected, registerPersistedInstanceTests } from './persisted';
import { loadState } from './support';

// La base a été remplacée par une sauvegarde complète de l'instance.
registerPersistedInstanceTests();

test('a session opened before the restore is no longer accepted', async () => {
  await expectSessionRejected(loadState().session);
});
