-- Journal des changements de chaque matériel : qui a fait quoi, et quand.
-- Les comptes ne sont jamais supprimés ; si cela arrivait, l'événement reste, sans auteur.
CREATE TABLE asset_events (
    id BIGSERIAL PRIMARY KEY,
    asset_id BIGINT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL,
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT chk_asset_events_action CHECK (action IN ('CREATED', 'UPDATED', 'RETIRED', 'LOCATED')),
    CONSTRAINT chk_asset_events_changes CHECK (jsonb_typeof(changes) = 'array')
);

CREATE INDEX idx_asset_events_asset ON asset_events(asset_id, occurred_at DESC, id DESC);

-- Le matériel existant commence son historique à sa date de création, auteur inconnu.
INSERT INTO asset_events (asset_id, occurred_at, action)
SELECT id, created_at, 'CREATED' FROM assets;
