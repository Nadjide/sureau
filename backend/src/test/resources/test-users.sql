DELETE FROM spring_session;
DELETE FROM app_users;

INSERT INTO app_users (username, display_name, password_hash, role, enabled, auth_version)
VALUES
    ('test-editor', 'Éditeur de test', '$2a$12$o0X1djOdwgtkHlnVB1QRO.V3FtMP3Zt5kiuE8GR6YqqcOFk7PyuE.', 'EDITOR', true, 0),
    ('test-editor-2', 'Deuxième éditeur de test', '$2a$12$o0X1djOdwgtkHlnVB1QRO.V3FtMP3Zt5kiuE8GR6YqqcOFk7PyuE.', 'EDITOR', true, 0),
    ('test-viewer', 'Lecteur de test', '$2a$12$o0X1djOdwgtkHlnVB1QRO.V3FtMP3Zt5kiuE8GR6YqqcOFk7PyuE.', 'VIEWER', true, 0);
