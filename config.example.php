<?php
/**
 * Local configuration overrides for the auth bridge.
 * Copy this file to config.php and set the real values for your environment.
 */

// If your XAMPP MySQL root has a password:
// putenv('HUB_DB_PASS=your_mysql_password');
// putenv('APP_DB_PASS=your_mysql_password');

putenv('HUB_DB_USER=performance_sales_app');
putenv('HUB_DB_PASS=replace_with_db_password');
putenv('APP_DB_USER=performance_sales_app');
putenv('APP_DB_PASS=replace_with_db_password');

// If you renamed the hub database:
// putenv('HUB_DB_NAME=pbs_hub');

// Hub Laravel APP_KEY – needed to decrypt the Hub session cookie.
putenv('HUB_APP_KEY=base64:replace_with_real_hub_app_key');

// Hub session cookie name – derived from APP_NAME in the Hub .env.
putenv('HUB_SESSION_COOKIE=pbs_panama_hub_session');

// Performance Sales public/app endpoints.
putenv('API_UPSTREAM_BASE=http://10.0.0.187:3003');
putenv('API_UPSTREAM_FALLBACKS=http://10.0.0.187:3003');
putenv('API_BACKEND_AUTO_START=1');
putenv('API_BACKEND_START_COMMAND=node src/app.js');
putenv('API_PROXY_SHARED_SECRET=replace_with_shared_proxy_secret');
putenv('PERFORMANCE_SALES_EMBED_SECRET=replace_with_embed_secret');

// Performance Sales isolated app DB.
putenv('APP_DB_HOST=10.0.0.187');
putenv('APP_DB_PORT=3306');
putenv('APP_DB_USER=performance_sales_app');
putenv('APP_DB_PASS=replace_with_db_password');
putenv('APP_DB_NAME=performance_sales_db');
putenv('APP_TOKEN_COOKIE=performance_sales_token');
putenv('TOOL_URL_PATTERN=%performance-sales%');

// Local-only bypass so the copied tool can run without the Hub cookie on 10.0.0.187.
putenv('APP_ALLOW_LOCAL_DEV_AUTH=1');