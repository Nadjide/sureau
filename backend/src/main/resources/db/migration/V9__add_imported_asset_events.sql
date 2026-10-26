-- Un matériel créé par un import garde cette origine dans son historique.
ALTER TABLE asset_events DROP CONSTRAINT chk_asset_events_action;
ALTER TABLE asset_events ADD CONSTRAINT chk_asset_events_action
    CHECK (action IN ('CREATED', 'IMPORTED', 'UPDATED', 'RETIRED', 'LOCATED'));
