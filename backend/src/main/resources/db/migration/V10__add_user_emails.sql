-- Adresse e-mail facultative d'un compte. La connexion d'entreprise (OpenID Connect) n'ouvre
-- que le compte dont l'e-mail correspond à celui de l'identité vérifiée par le fournisseur.
ALTER TABLE app_users ADD COLUMN email VARCHAR(254);

CREATE UNIQUE INDEX uq_app_users_email ON app_users (lower(email));
