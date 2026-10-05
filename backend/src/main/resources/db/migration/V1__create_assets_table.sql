CREATE TABLE assets (
                        id BIGSERIAL PRIMARY KEY,

                        asset_tag VARCHAR(50) NOT NULL UNIQUE,
                        serial_number VARCHAR(100) UNIQUE,

                        name VARCHAR(150) NOT NULL,
                        brand VARCHAR(100),
                        model VARCHAR(100),

                        category VARCHAR(50) NOT NULL,
                        status VARCHAR(50) NOT NULL,

                        purchase_date DATE,

                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

                        CONSTRAINT chk_assets_category CHECK (
                            category IN (
                                         'COMPUTER',
                                         'HEADSET',
                                         'MONITOR',
                                         'PHONE',
                                         'KEYBOARD',
                                         'MOUSE',
                                         'NETWORK_EQUIPMENT',
                                         'SERVER',
                                         'OTHER'
                                )
                            ),

                        CONSTRAINT chk_assets_status CHECK (
                            status IN (
                                       'AVAILABLE',
                                       'ASSIGNED',
                                       'MAINTENANCE',
                                       'RETIRED',
                                       'LOST'
                                )
                            )
);

CREATE INDEX idx_assets_category ON assets(category);
CREATE INDEX idx_assets_status ON assets(status);