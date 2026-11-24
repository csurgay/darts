<?php
// Másold le config.php néven, és írd be a jelszót. A config.php nincs a gitben.
return [
    'db' => [
        'dsn'  => 'mysql:host=localhost;dbname=csurgay_darts;charset=utf8mb4',
        'user' => 'csurgay_darts',
        'pass' => 'IDE_JON_A_JELSZO',
    ],
    // Ha nem üres, az appban a Beállítások / API kulcs mezőbe ugyanezt kell beírni.
    'api_key' => '',
    // A táblákat magától létrehozza, ha még nincsenek meg.
    'auto_schema' => true,
];
