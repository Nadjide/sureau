import { test } from '@playwright/test';
import { expectSessionStatus, registerPersistedInstanceTests } from './persisted';
import { loadState } from './support';

// L'application a été redémarrée : la base, elle, n'a pas bougé.
registerPersistedInstanceTests();

// Les sessions sont en base : elles survivent au redémarrage de l'application.
test('a session opened before the restart is still accepted', async () => {
  await expectSessionStatus(loadState().session, 200);
});
