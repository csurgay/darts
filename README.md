# Darts számláló

Mobilra készült darts számláló (PWA) TV-közvetítés stílusú, dobozos eredményjelzővel.
Minden egyes nyíl helye (mm pontossággal a tábla közepéhez képest) eltárolódik, így a meccsek
visszajátszhatók, és dobásfelhők, fejlődési trendek nézhetők.

## Funkciók

- **Játék:** 301 / 501 / 701 / 1001, dupla / szimpla / master kiszálló, dupla be, legek és szettek, 1–8 játékos,
  váltakozó kezdés, besokallás, kiszálló javaslat (pl. `T20 T20 DB`), bemondó (angol/magyar beszéd).
- **Bevitel:** koppintás a táblára nagyítóval (húzással pontosítható), vagy mezőgombok (S/D/T + szám).
  „Kör vége” a kimaradt nyilakat MISS-nek veszi; „Vissza” nyilanként visszavon.
- **Visszajátszás:** nyílról nyílra, legenként ugrás, lejátszás sebességgel, leg-jegyzőkönyv (pontok és maradék).
- **Statisztika:** 3 nyilas és első 9 átlag, **tömeg dobások** (átlag, 180/140+/100+, tripla %, szórás mm-ben)
  és **kiszállók** külön (kiszálló % a dupla nyilakra, kiszálló körök, legmagasabb, duplánkénti találati arány),
  dobásfelhő idő szerint / régi vs új / találat szerint, dupla-dobásfelhő (célzott dupla felülre forgatva),
  meccsenkénti trendek javul / romlik jelzéssel.
- **Játékosok:** felvétel, szerkesztés, törlés (ha már van meccse, csak archiválódik).
- **Tárolás:** PHP + MySQL szerver, offline sorral (net nélkül is megy, később feltölt); vagy csak helyben.
  JSON mentés / betöltés.
- **Autotesztek:** Beállítások → Autotesztek (játékmotor, kiszálló, statisztika, geometria, tárolás, szerver API, adatbázis önteszt).

Tömeg dobás az a nyíl, amikor a hátralévő pont a körben megmaradt nyilakkal még nem kiszállható;
kiszálló dobás, amikor igen. Dupla nyíl: egy nyíllal kiszállható állásból dobott nyíl.

## Telepítés (cPanel)

1. Másold fel a teljes mappát, pl. `public_html/darts/` (→ `https://csurgay.com/darts/`).
2. Az `api/config.sample.php`-t másold `api/config.php` néven, és írd be a jelszót
   (adatbázis és felhasználó: `csurgay_darts`). Ajánlott `api_key`-t is megadni; ekkor az appban
   a Beállítások / API kulcs mezőbe ugyanazt kell írni.
3. A táblákat az API az első hívásnál magától létrehozza (vagy futtasd az `api/schema.sql`-t phpMyAdminban).
4. Nyisd meg az appot → Beállítások → Kapcsolat teszt, majd Autotesztek.
5. Telefonon: böngésző menü → „Hozzáadás a kezdőképernyőhöz”.

PHP 8.1+ kell (8.5-tel is megy), `pdo_mysql` bővítménnyel.

## Tesztek parancssorból

```
node tests/run-node.js                                   # logikai tesztek
node tests/run-node.js https://csurgay.com/darts/api/ KULCS   # + szerver és adatbázis tesztek
```

Helyi fejlesztés SQLite-tal:

```
echo "<?php return ['db'=>['dsn'=>'sqlite:/tmp/darts.sqlite'],'api_key'=>'','auto_schema'=>true];" > /tmp/darts-config.php
DARTS_CONFIG=/tmp/darts-config.php php -S 127.0.0.1:8000
```

## Felépítés

| Fájl | Mi van benne |
|---|---|
| `js/geometry.js` | tábla méretek (mm), pontszámítás koordinátából |
| `js/checkout.js` | kiszálló számítás és javaslat |
| `js/engine.js` | X01 motor – az állapot mindig a dobáslistából számolódik (visszavonás, visszajátszás) |
| `js/stats.js` | statisztika, tömeg/kiszálló bontás, szórás, trend |
| `js/store.js` | szerver API, offline sor, helyi tár |
| `js/board.js` | tábla rajzolás, nagyítós bevitel, felhők |
| `js/app.js` | képernyők |
| `api/index.php` | REST-szerű API, önteszt |
| `tests/` | autotesztek |

A korábbi kísérleti verziók az `archive/` mappában vannak.
