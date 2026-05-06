const fs = require('fs');
const path = require('path');

const publicIndexPath = path.resolve(__dirname, '..', '..', 'public', 'index.php');
const wrapperContent = "<?php\n\nrequire dirname(__DIR__) . '/index.php';\n";

fs.mkdirSync(path.dirname(publicIndexPath), { recursive: true });
fs.writeFileSync(publicIndexPath, wrapperContent, 'utf8');

console.log(`[build] Restored ${publicIndexPath}`);