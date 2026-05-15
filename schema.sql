-- PostgreSQL Schema for VexPanel
-- Run this in Neon database console

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    screenshots JSONB DEFAULT '[]',
    approved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP
);

CREATE TABLE plugins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    link VARCHAR(500),
    code VARCHAR(20),
    plugin_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample plugins
INSERT INTO plugins (name, description, link, code, plugin_id) VALUES
('Vexcody', 'Skrypt na /kod tiktok/start', 'https://www.dropbox.com/scl/fi/wbs29j8j89zq8canpotc0/Vexhack.py-cody.sk?rlkey=bopsuip19ventzvvrnl3gedvh&dl=1', 'CFOQ8067', '7q5j6b1e2ot1'),
('Vexantylogout', 'Plugin na antylogout', 'https://www.dropbox.com/scl/fi/s05rm8ylt9y185h3t9br6/AntiLogout-1.0-SNAPSHOT.jar?rlkey=75zb7191eexewgpb0b1zbuk6x&dl=1', 'QRJWAW28', '9rop7hz5hl2d'),
('VexVanish', 'Plugin na /vanish', 'https://www.dropbox.com/scl/fi/rx1rkr34ydptdheva01yb/VexVanish.sk?rlkey=3rs9nlx3rgrzu872ecuahhb7y&st=m622owfu&dl=1', 'X0428VP3', 'g8heq29f7mkn'),
('Vextpa', 'Profesjonalny System Teleportacji', 'https://www.dropbox.com/scl/fi/cljyt6zwdpnoh2vhrvm8e/Vextpa.sk?rlkey=qildwbzffnppwjdyju6f681v3&st=g08ffhxn&dl=1', 'CJE8GGHX', 'tm8ecyi1w7hp'),
('Maszyna-1.0', 'Plugin na Maszyne Hazardową', 'https://www.dropbox.com/scl/fi/rryt8ybcl3d4vjyd3lwdd/Maszyna-1.0.jar?rlkey=e309ikucvpry2r6i0i35b141c&dl=1', '2GNZFQ0N', 'bvj9ci92fsud');

-- Create index for faster lookups
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_approved ON users(approved);