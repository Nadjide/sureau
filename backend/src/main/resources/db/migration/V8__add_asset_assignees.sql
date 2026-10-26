-- La personne qui détient un matériel affecté. Elle n'a pas besoin d'un compte Sureau.
-- Un matériel affecté peut rester sans personne nommée (affectations antérieures).
ALTER TABLE assets
    ADD COLUMN assignee_name VARCHAR(150),
    ADD COLUMN assignee_email VARCHAR(254),
    ADD COLUMN assignee_department VARCHAR(100),
    ADD CONSTRAINT chk_assets_assignee_details
        CHECK (assignee_name IS NOT NULL OR (assignee_email IS NULL AND assignee_department IS NULL)),
    ADD CONSTRAINT chk_assets_assignee_status
        CHECK (assignee_name IS NULL OR status = 'ASSIGNED');
