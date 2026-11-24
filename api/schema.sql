-- Darts számláló – MySQL / MariaDB séma (csurgay_darts)
-- Az API magától is létrehozza (auto_schema), ez kézi telepítéshez van.

CREATE TABLE IF NOT EXISTS players (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  nickname   VARCHAR(100) NOT NULL DEFAULT '',
  created_at BIGINT       NOT NULL,
  archived   TINYINT      NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS matches (
  id         VARCHAR(36)  NOT NULL PRIMARY KEY,
  created_at BIGINT       NOT NULL,
  updated_at BIGINT       NOT NULL,
  status     VARCHAR(16)  NOT NULL DEFAULT 'active',
  winner_id  VARCHAR(36)  NULL,
  summary    VARCHAR(255) NOT NULL DEFAULT '',
  settings   MEDIUMTEXT   NOT NULL,
  KEY idx_matches_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS match_players (
  match_id  VARCHAR(36) NOT NULL,
  player_id VARCHAR(36) NOT NULL,
  position  TINYINT     NOT NULL,
  PRIMARY KEY (match_id, position),
  KEY idx_mp_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Minden egyes nyíl. A származtatott mezőket (phase, points, rem_before ...) a kliens
-- játékmotorja számolja, így SQL-ből is lekérdezhetők.
CREATE TABLE IF NOT EXISTS darts (
  match_id   VARCHAR(36) NOT NULL,
  seq        INT         NOT NULL,
  player_id  VARCHAR(36) NULL,
  set_no     INT         NOT NULL DEFAULT 1,
  leg_no     INT         NOT NULL DEFAULT 1,
  visit_no   INT         NOT NULL DEFAULT 1,
  dart_no    TINYINT     NOT NULL DEFAULT 1,
  seg        TINYINT     NOT NULL,
  mult       TINYINT     NOT NULL,
  score      SMALLINT    NOT NULL DEFAULT 0,
  points     SMALLINT    NOT NULL DEFAULT 0,
  x          DECIMAL(6,1) NULL,
  y          DECIMAL(6,1) NULL,
  rem_before SMALLINT    NOT NULL DEFAULT 0,
  phase      VARCHAR(10) NOT NULL DEFAULT 'scoring',
  at_double  TINYINT     NOT NULL DEFAULT 0,
  target     VARCHAR(4)  NULL,
  bust       TINYINT     NOT NULL DEFAULT 0,
  checkout   TINYINT     NOT NULL DEFAULT 0,
  manual     TINYINT     NOT NULL DEFAULT 0,
  filler     TINYINT     NOT NULL DEFAULT 0,
  thrown_at  BIGINT      NULL,
  PRIMARY KEY (match_id, seq),
  KEY idx_darts_player (player_id, phase)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
