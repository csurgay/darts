<?php
declare(strict_types=1);
/* Darts számláló API – PHP 8 + PDO (MySQL; teszteléshez SQLite is). */

const API_VERSION = '1.0';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function out($data, int $code = 200): never {
    http_response_code($code);
    echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}
function fail(string $msg, int $code = 400): never {
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}
set_exception_handler(function (Throwable $e) {
    error_log('darts api: ' . $e->getMessage());
    fail('Szerver hiba: ' . preg_replace('/password|pass=\S+/i', '***', $e->getMessage()), 500);
});

function config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $file = getenv('DARTS_CONFIG') ?: __DIR__ . '/config.php';
    if (!is_file($file)) fail('Hiányzik az api/config.php (másold a config.sample.php-t és írd be a jelszót).', 500);
    $cfg = require $file;
    return $cfg;
}

function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config()['db'];
    $pdo = new PDO($c['dsn'], $c['user'] ?? null, $c['pass'] ?? null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    if (driver() === 'sqlite') $pdo->exec('PRAGMA foreign_keys = ON');
    if (config()['auto_schema'] ?? true) ensureSchema($pdo);
    return $pdo;
}
function driver(): string { return explode(':', config()['db']['dsn'], 2)[0]; }

function schemaStatements(): array {
    $sql = file_get_contents(__DIR__ . '/schema.sql');
    $sql = preg_replace('/^--.*$/m', '', $sql);
    $stmts = array_filter(array_map('trim', explode(';', $sql)));
    if (driver() !== 'sqlite') return array_values($stmts);
    $out = [];
    foreach ($stmts as $s) {
        // SQLite: ENGINE és KEY sorok nélkül, az indexek külön
        $s = preg_replace('/\)\s*ENGINE=.*$/s', ')', $s);
        preg_match('/CREATE TABLE IF NOT EXISTS (\w+)/', $s, $tm);
        if (preg_match_all('/^\s*KEY (\w+) \(([^)]+)\),?\s*$/m', $s, $km, PREG_SET_ORDER)) {
            foreach ($km as $k) $idx[] = "CREATE INDEX IF NOT EXISTS {$k[1]} ON {$tm[1]} ({$k[2]})";
            $s = preg_replace('/,?\s*^\s*KEY \w+ \([^)]+\),?\s*$/m', '', $s);
        }
        $out[] = $s;
    }
    return array_merge($out, $idx ?? []);
}

function ensureSchema(PDO $pdo): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try { $pdo->query('SELECT 1 FROM darts LIMIT 1'); return; } catch (PDOException $e) { /* létrehozzuk */ }
    foreach (schemaStatements() as $s) $pdo->exec($s);
}

function input(): array {
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $j = json_decode($raw, true);
    if (!is_array($j)) fail('Hibás JSON');
    return $j;
}

function checkKey(): void {
    $key = (string)(config()['api_key'] ?? '');
    if ($key === '') return;
    $got = (string)($_SERVER['HTTP_X_API_KEY'] ?? ($_GET['key'] ?? ''));
    if (!hash_equals($key, $got)) fail('Hibás vagy hiányzó API kulcs', 401);
}

function str(array $a, string $k, int $max = 255, string $def = ''): string {
    $v = isset($a[$k]) ? (string)$a[$k] : $def;
    return mb_substr(trim($v), 0, $max);
}
function validId(string $id): string {
    if (!preg_match('/^[A-Za-z0-9_-]{1,36}$/', $id)) fail('Hibás azonosító');
    return $id;
}

// ---------------- Játékosok ----------------
function players(bool $all): array {
    $sql = 'SELECT id, name, nickname, created_at, archived FROM players' . ($all ? '' : ' WHERE archived = 0') . ' ORDER BY name';
    return array_map(fn($r) => [
        'id' => $r['id'], 'name' => $r['name'], 'nickname' => $r['nickname'],
        'created' => (int)$r['created_at'], 'archived' => (bool)$r['archived'],
    ], db()->query($sql)->fetchAll());
}

function savePlayer(array $p): array {
    $id = validId(str($p, 'id', 36));
    $name = str($p, 'name', 100);
    if ($name === '') fail('A név kötelező');
    $nick = str($p, 'nickname', 100);
    $created = (int)($p['created'] ?? round(microtime(true) * 1000));
    $arch = !empty($p['archived']) ? 1 : 0;
    $pdo = db();
    $ex = $pdo->prepare('SELECT 1 FROM players WHERE id = ?');
    $ex->execute([$id]);
    if ($ex->fetchColumn()) {
        $pdo->prepare('UPDATE players SET name = ?, nickname = ?, archived = ? WHERE id = ?')->execute([$name, $nick, $arch, $id]);
    } else {
        $pdo->prepare('INSERT INTO players (id, name, nickname, created_at, archived) VALUES (?,?,?,?,?)')->execute([$id, $name, $nick, $created, $arch]);
    }
    return ['id' => $id, 'name' => $name, 'nickname' => $nick, 'created' => $created, 'archived' => (bool)$arch];
}

function deletePlayer(string $id): array {
    $id = validId($id);
    $pdo = db();
    $u = $pdo->prepare('SELECT COUNT(*) FROM match_players WHERE player_id = ?');
    $u->execute([$id]);
    if ((int)$u->fetchColumn() > 0) {
        // meccsei vannak: csak archiváljuk, hogy a statisztika és a visszajátszás megmaradjon
        $pdo->prepare('UPDATE players SET archived = 1 WHERE id = ?')->execute([$id]);
        return ['archived' => true];
    }
    $pdo->prepare('DELETE FROM players WHERE id = ?')->execute([$id]);
    return ['archived' => false];
}

// ---------------- Meccsek ----------------
function matchRowToSummary(array $r): array {
    $settings = json_decode($r['settings'], true) ?: [];
    return [
        'id' => $r['id'], 'created' => (int)$r['created_at'], 'updated' => (int)$r['updated_at'],
        'status' => $r['status'], 'winnerId' => $r['winner_id'], 'summary' => $r['summary'],
        'players' => $settings['players'] ?? [], 'settings' => $settings,
    ];
}

function listMatchRows(array $q): array {
    $where = []; $args = [];
    if (!empty($q['playerId'])) { $where[] = 'id IN (SELECT match_id FROM match_players WHERE player_id = ?)'; $args[] = validId((string)$q['playerId']); }
    if (!empty($q['status'])) { $where[] = 'status = ?'; $args[] = (string)$q['status']; }
    if (!empty($q['since'])) { $where[] = 'created_at >= ?'; $args[] = (int)$q['since']; }
    $limit = max(1, min(5000, (int)($q['limit'] ?? 1000)));
    $sql = 'SELECT * FROM matches' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY created_at DESC LIMIT $limit";
    $st = db()->prepare($sql);
    $st->execute($args);
    return $st->fetchAll();
}

function throwsFor(array $ids): array {
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT match_id, seq, seg, mult, x, y, manual, filler, thrown_at FROM darts WHERE match_id IN ($in) ORDER BY match_id, seq");
    $st->execute($ids);
    $res = [];
    foreach ($st->fetchAll() as $d) {
        $t = ['seg' => (int)$d['seg'], 'mult' => (int)$d['mult'],
              'x' => $d['x'] === null ? null : (float)$d['x'], 'y' => $d['y'] === null ? null : (float)$d['y'],
              't' => $d['thrown_at'] === null ? null : (int)$d['thrown_at']];
        if ((int)$d['manual']) $t['manual'] = true;
        if ((int)$d['filler']) $t['filler'] = true;
        $res[$d['match_id']][] = $t;
    }
    return $res;
}

function fullMatches(array $rows): array {
    $th = throwsFor(array_column($rows, 'id'));
    return array_map(function ($r) use ($th) {
        $m = matchRowToSummary($r);
        $m['throws'] = $th[$r['id']] ?? [];
        return $m;
    }, $rows);
}

function getMatch(string $id): ?array {
    $st = db()->prepare('SELECT * FROM matches WHERE id = ?');
    $st->execute([validId($id)]);
    $r = $st->fetch();
    return $r ? fullMatches([$r])[0] : null;
}

function saveMatch(array $m): array {
    $id = validId(str($m, 'id', 36));
    $settings = $m['settings'] ?? null;
    if (!is_array($settings) || empty($settings['players'])) fail('Hiányzó játékosok');
    $throws = $m['throws'] ?? [];
    $derived = $m['derived'] ?? [];
    if (!is_array($throws) || count($throws) > 20000) fail('Hibás dobáslista');
    $status = in_array($m['status'] ?? '', ['active', 'finished', 'abandoned'], true) ? $m['status'] : 'active';
    $now = (int)round(microtime(true) * 1000);
    $created = (int)($m['created'] ?? $now);
    $winner = isset($m['winnerId']) && $m['winnerId'] !== null ? validId((string)$m['winnerId']) : null;
    $summary = str($m, 'summary', 255);
    $settingsJson = json_encode($settings, JSON_UNESCAPED_UNICODE);

    $pdo = db();
    $pdo->beginTransaction();
    try {
        $ex = $pdo->prepare('SELECT 1 FROM matches WHERE id = ?');
        $ex->execute([$id]);
        if ($ex->fetchColumn()) {
            $pdo->prepare('UPDATE matches SET updated_at=?, status=?, winner_id=?, summary=?, settings=? WHERE id=?')
                ->execute([$now, $status, $winner, $summary, $settingsJson, $id]);
        } else {
            $pdo->prepare('INSERT INTO matches (id, created_at, updated_at, status, winner_id, summary, settings) VALUES (?,?,?,?,?,?,?)')
                ->execute([$id, $created, $now, $status, $winner, $summary, $settingsJson]);
        }
        $pdo->prepare('DELETE FROM match_players WHERE match_id = ?')->execute([$id]);
        $mp = $pdo->prepare('INSERT INTO match_players (match_id, player_id, position) VALUES (?,?,?)');
        foreach (array_values($settings['players']) as $i => $p) $mp->execute([$id, validId((string)($p['id'] ?? '')), $i]);

        $pdo->prepare('DELETE FROM darts WHERE match_id = ?')->execute([$id]);
        $ins = $pdo->prepare('INSERT INTO darts (match_id, seq, player_id, set_no, leg_no, visit_no, dart_no, seg, mult, score, points, x, y,
            rem_before, phase, at_double, target, bust, checkout, manual, filler, thrown_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        foreach (array_values($throws) as $i => $t) {
            $d = $derived[$i] ?? [];
            $seg = (int)($t['seg'] ?? 0); $mult = (int)($t['mult'] ?? 0);
            if ($seg < 0 || $seg > 25 || $mult < 0 || $mult > 3) fail("Hibás nyíl: #$i");
            $x = isset($t['x']) && $t['x'] !== null ? round((float)$t['x'], 1) : null;
            $y = isset($t['y']) && $t['y'] !== null ? round((float)$t['y'], 1) : null;
            $ins->execute([
                $id, $i, isset($d['playerId']) ? (string)$d['playerId'] : null,
                (int)($d['set'] ?? 1), (int)($d['leg'] ?? 1), (int)($d['visit'] ?? 1), (int)($d['dart'] ?? 1),
                $seg, $mult, $seg * $mult, (int)($d['points'] ?? 0), $x, $y,
                (int)($d['remBefore'] ?? 0), ($d['phase'] ?? 'scoring') === 'checkout' ? 'checkout' : 'scoring',
                !empty($d['atDouble']) ? 1 : 0, isset($d['target']) ? substr((string)$d['target'], 0, 4) : null,
                !empty($d['bust']) ? 1 : 0, !empty($d['checkout']) ? 1 : 0,
                !empty($t['manual']) ? 1 : 0, !empty($t['filler']) ? 1 : 0,
                isset($t['t']) && $t['t'] !== null ? (int)$t['t'] : null,
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
    return ['id' => $id, 'updated' => $now, 'darts' => count($throws)];
}

function deleteMatch(string $id): bool {
    $id = validId($id);
    $pdo = db();
    $pdo->beginTransaction();
    foreach (['darts', 'match_players'] as $t) $pdo->prepare("DELETE FROM $t WHERE match_id = ?")->execute([$id]);
    $pdo->prepare('DELETE FROM matches WHERE id = ?')->execute([$id]);
    $pdo->commit();
    return true;
}

// ---------------- Szerver oldali önteszt ----------------
function selftest(): array {
    $res = [];
    $t = function (string $name, callable $fn) use (&$res) {
        $t0 = microtime(true);
        try { $msg = $fn(); $res[] = ['name' => $name, 'ok' => true, 'msg' => (string)($msg ?? ''), 'ms' => round((microtime(true) - $t0) * 1000, 1)]; }
        catch (Throwable $e) { $res[] = ['name' => $name, 'ok' => false, 'msg' => $e->getMessage(), 'ms' => round((microtime(true) - $t0) * 1000, 1)]; }
    };
    $assert = function ($cond, string $msg) { if (!$cond) throw new RuntimeException($msg); };

    $t('PHP verzió >= 8.1', function () use ($assert) { $assert(PHP_VERSION_ID >= 80100, 'PHP ' . PHP_VERSION); return PHP_VERSION; });
    $t('PDO driver elérhető', function () use ($assert) { $assert(in_array(driver(), PDO::getAvailableDrivers(), true), driver() . ' hiányzik'); return driver(); });
    $t('Adatbázis kapcsolat', function () { db()->query('SELECT 1'); return 'ok'; });
    $t('Táblák megvannak', function () use ($assert) {
        foreach (['players', 'matches', 'match_players', 'darts'] as $tb) db()->query("SELECT COUNT(*) FROM $tb")->fetchColumn();
        return '4 tábla';
    });
    $t('UTF-8 (ékezetek, emoji) mentése', function () use ($assert) {
        $pdo = db(); $pdo->beginTransaction();
        try {
            $id = 'selftest-' . bin2hex(random_bytes(4));
            $name = 'Árvíztűrő tükörfúrógép 🎯';
            savePlayer(['id' => $id, 'name' => $name]);
            $st = $pdo->prepare('SELECT name FROM players WHERE id = ?'); $st->execute([$id]);
            $got = $st->fetchColumn();
            $assert($got === $name, "visszaolvasva: $got");
        } finally { $pdo->rollBack(); }
        return 'ok';
    });
    $t('Meccs mentés, visszaolvasás, felülírás, törlés', function () use ($assert) {
        $pdo = db();
        $pid = 'selftest-p-' . bin2hex(random_bytes(3));
        $mid = 'selftest-m-' . bin2hex(random_bytes(3));
        // a saveMatch saját tranzakciót nyit, ezért itt külön nem nyitunk; a végén töröljük
        try {
            savePlayer(['id' => $pid, 'name' => 'Teszt']);
            $throws = [['seg' => 20, 'mult' => 3, 'x' => 0.0, 'y' => 103.0, 't' => 1], ['seg' => 0, 'mult' => 0, 'x' => null, 'y' => null, 'filler' => true]];
            saveMatch(['id' => $mid, 'created' => 1000, 'status' => 'active', 'settings' => ['startScore' => 501, 'players' => [['id' => $pid, 'name' => 'Teszt']]],
                'throws' => $throws, 'derived' => [['playerId' => $pid, 'points' => 60, 'remBefore' => 501], ['playerId' => $pid]]]);
            $m = getMatch($mid);
            $assert($m !== null, 'nem található');
            $assert(count($m['throws']) === 2, 'nyilak száma: ' . count($m['throws']));
            $assert($m['throws'][0]['seg'] === 20 && $m['throws'][0]['mult'] === 3, 'első nyíl hibás');
            $assert(abs($m['throws'][0]['y'] - 103.0) < 0.01, 'koordináta hibás');
            $assert(!empty($m['throws'][1]['filler']) && $m['throws'][1]['x'] === null, 'kitöltő nyíl hibás');
            $l = listMatchRows(['playerId' => $pid]);
            $assert(count($l) === 1, 'játékos szűrés hibás');
            $assert(deletePlayer($pid)['archived'] === true, 'meccses játékos nem archiválódott');
            // újramentés kevesebb nyíllal felülírja
            saveMatch(['id' => $mid, 'created' => 1000, 'status' => 'finished', 'settings' => ['players' => [['id' => $pid, 'name' => 'Teszt']]], 'throws' => [$throws[0]]]);
            $assert(count(getMatch($mid)['throws']) === 1, 'felülírás hibás');
        } finally {
            deleteMatch($mid);
            $pdo->prepare('DELETE FROM players WHERE id = ?')->execute([$pid]);
        }
        $assert(getMatch($mid) === null, 'törlés hibás');
        return 'ok';
    });
    $t('Hibás azonosító elutasítva', function () use ($assert) {
        $assert(preg_match('/^[A-Za-z0-9_-]{1,36}$/', "x'; DROP TABLE darts;--") === 0, 'regex');
        return 'ok';
    });
    $t('API kulcs beállítva', function () { return (config()['api_key'] ?? '') === '' ? 'nincs (nyilvános API) – ajánlott beállítani' : 'igen'; });
    return $res;
}

// ---------------- Útválasztó ----------------
if (PHP_SAPI !== 'cli' || getenv('DARTS_ROUTE')) {
    checkKey();
    $a = (string)($_GET['a'] ?? '');
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $needPost = !in_array($a, ['ping', 'players', 'matches', 'match', 'matches.full'], true);
    if ($needPost && $method !== 'POST') fail('POST szükséges', 405);
    switch ($a) {
        case 'ping':
            db()->query('SELECT 1');
            out(['version' => API_VERSION, 'db' => 'ok', 'driver' => driver(), 'php' => PHP_VERSION]);
        case 'players': out(players(!empty($_GET['all'])));
        case 'player.save': out(savePlayer(input()));
        case 'player.delete': out(deletePlayer(str(input(), 'id', 36)));
        case 'matches': out(array_map('matchRowToSummary', listMatchRows($_GET)));
        case 'matches.full': out(fullMatches(listMatchRows($_GET)));
        case 'match':
            $m = getMatch((string)($_GET['id'] ?? ''));
            if (!$m) fail('Nincs ilyen meccs', 404);
            out($m);
        case 'match.save': out(saveMatch(input()));
        case 'match.delete': out(deleteMatch(str(input(), 'id', 36)));
        case 'selftest': out(selftest());
        default: fail('Ismeretlen művelet: ' . $a, 404);
    }
}
