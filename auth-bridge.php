<?php
/**
 * ContractFlow Auth Bridge
 * ========================
 * Validates that the visiting user has an active PBS Hub session
 * AND has been granted access to the ContractFlow tool.
 *
 * If valid  → creates/refreshes a contractos_token cookie (8h) and returns the
 *             serialised user array.
 * If invalid→ returns null (caller should redirect to hub login).
 *
 * Requirements:
 *   - PHP 7.4+
 *   - PDO with mysql driver
 *   - .env.php in the same directory defines DB credentials
 */

// ─── Config (override via env.php if needed) ─────────────────
function contractosRegisterGlobalConfig(string $key, $value)
{
    $GLOBALS[$key] = $value;

    return $value;
}

$HUB_DB_HOST     = contractosRegisterGlobalConfig('HUB_DB_HOST', getenv('HUB_DB_HOST') ?: '10.0.0.187');
$HUB_DB_PORT     = contractosRegisterGlobalConfig('HUB_DB_PORT', getenv('HUB_DB_PORT') ?: '3306');
$HUB_DB_USER     = contractosRegisterGlobalConfig('HUB_DB_USER', getenv('HUB_DB_USER') ?: 'root');
$HUB_DB_PASS     = contractosRegisterGlobalConfig('HUB_DB_PASS', getenv('HUB_DB_PASS') ?: '');
$HUB_DB_NAME     = contractosRegisterGlobalConfig('HUB_DB_NAME', getenv('HUB_DB_NAME') ?: 'pbs_hub');

$APP_DB_HOST     = contractosRegisterGlobalConfig('APP_DB_HOST', getenv('APP_DB_HOST') ?: '127.0.0.1');
$APP_DB_PORT     = contractosRegisterGlobalConfig('APP_DB_PORT', getenv('APP_DB_PORT') ?: '3306');
$APP_DB_USER     = contractosRegisterGlobalConfig('APP_DB_USER', getenv('APP_DB_USER') ?: 'root');
$APP_DB_PASS     = contractosRegisterGlobalConfig('APP_DB_PASS', getenv('APP_DB_PASS') ?: '');
$APP_DB_NAME     = contractosRegisterGlobalConfig('APP_DB_NAME', getenv('APP_DB_NAME') ?: 'performance_sales_db');

$HUB_SESSION_COOKIE = contractosRegisterGlobalConfig('HUB_SESSION_COOKIE', getenv('HUB_SESSION_COOKIE') ?: 'pbs-panama-hub-session');
$APP_TOKEN_COOKIE   = contractosRegisterGlobalConfig('APP_TOKEN_COOKIE', getenv('APP_TOKEN_COOKIE') ?: 'performance_sales_token');
$TOKEN_TTL_HOURS    = contractosRegisterGlobalConfig('TOKEN_TTL_HOURS', 8);
$TOOL_URL_PATTERN   = contractosRegisterGlobalConfig('TOOL_URL_PATTERN', getenv('TOOL_URL_PATTERN') ?: '%performance-sales%');
$EMBED_SHARED_SECRET = contractosRegisterGlobalConfig('EMBED_SHARED_SECRET', getenv('PERFORMANCE_SALES_EMBED_SECRET') ?: 'replace_with_embed_secret');
$EMBED_MAX_AGE_SECONDS = contractosRegisterGlobalConfig('EMBED_MAX_AGE_SECONDS', 300);
$APP_ALLOW_LOCAL_DEV_AUTH = contractosRegisterGlobalConfig('APP_ALLOW_LOCAL_DEV_AUTH', getenv('APP_ALLOW_LOCAL_DEV_AUTH') ?: '0');

function contractosCookieSameSite(): string
{
    $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';

    return $secure ? 'None' : 'Lax';
}

/**
 * Main entry – call this and check the return value.
 * @return array|null  user array on success, null on failure
 */
/**
 * Start the PHP session only once per request.
 * session_name() and session_set_cookie_params() must be called BEFORE session_start(),
 * and cannot be called again once the session is active.
 */
function ensureSessionStarted(): void
{
    global $TOKEN_TTL_HOURS;

    if (session_status() !== PHP_SESSION_NONE) {
        return; // Already started – nothing to do
    }

    $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $sameSite = contractosCookieSameSite();

    session_name('performance_sales_session');
    session_set_cookie_params([
        'lifetime' => $TOKEN_TTL_HOURS * 3600,
        'path'     => '/',
        'httponly' => true,
        'samesite' => $sameSite,
        'secure'   => $secure,
    ]);
    session_start();
}

function validateHubAccess(): ?array
{
    global $HUB_DB_HOST, $HUB_DB_PORT, $HUB_DB_USER, $HUB_DB_PASS, $HUB_DB_NAME;
    global $APP_DB_HOST, $APP_DB_PORT, $APP_DB_USER, $APP_DB_PASS, $APP_DB_NAME;
    global $HUB_SESSION_COOKIE, $APP_TOKEN_COOKIE, $TOKEN_TTL_HOURS, $TOOL_URL_PATTERN, $APP_ALLOW_LOCAL_DEV_AUTH;

    // 1a. PHP session fast-path (works even without contractos_db)
    ensureSessionStarted();

    if ($APP_ALLOW_LOCAL_DEV_AUTH === '1' && in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1', '10.0.0.187'], true)) {
        $_SESSION['user_id'] = 1;
        $_SESSION['user_name'] = 'Local Performance Sales Admin';
        $_SESSION['user_email'] = 'local@performance-sales.test';
        $_SESSION['expires_at'] = time() + $TOKEN_TTL_HOURS * 3600;

        return [
            'user_id' => 1,
            'user_name' => 'Local Performance Sales Admin',
            'user_email' => 'local@performance-sales.test',
        ];
    }

    if (!empty($_SESSION['user_id']) && !empty($_SESSION['expires_at']) && $_SESSION['expires_at'] > time()) {
        return [
            'user_id'    => $_SESSION['user_id'],
            'user_name'  => $_SESSION['user_name'],
            'user_email' => $_SESSION['user_email'],
        ];
    }

    // 1b. Check existing contractos_token in DB
    if (!empty($_COOKIE[$APP_TOKEN_COOKIE])) {
        $token = $_COOKIE[$APP_TOKEN_COOKIE];
        if (preg_match('/^[0-9a-f]{64}$/', $token)) {
            $appDb = connectDB($APP_DB_HOST, $APP_DB_PORT, $APP_DB_USER, $APP_DB_PASS, $APP_DB_NAME);
            if ($appDb) {
                $stmt = $appDb->prepare(
                    'SELECT user_id, user_name, user_email FROM contractos_sessions
                      WHERE token = ? AND expires_at > NOW() LIMIT 1'
                );
                $stmt->execute([$token]);
                $row = $stmt->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    return $row; // Still valid
                }
            }
        }
    }

    $trustedLaunchUser = getTrustedLaunchUser();
    if ($trustedLaunchUser !== null && !empty($trustedLaunchUser['user_id'])) {
        $session = [
            'user_id' => (int) $trustedLaunchUser['user_id'],
        ];
    } else {
        $session = null;
    }

    $nativeHubUser = getHubUserFromNativePhpSession();
    if ($session === null && $nativeHubUser !== null && !empty($nativeHubUser['user_id'])) {
        $session = [
            'user_id' => (int) $nativeHubUser['user_id'],
        ];
    }

    if ($session === null) {
        // 2. Read Laravel session cookie
        $laravelSession = getHubSessionCookieValue($HUB_SESSION_COOKIE);
        if ($laravelSession === null) {
            error_log('[ContractFlow] Auth fail: no Hub session cookie found. Cookies present: ' . implode(', ', array_keys($_COOKIE)));
            return null;
        }

        // 3. Look up session in hub DB
        $hubDb = connectDB($HUB_DB_HOST, $HUB_DB_PORT, $HUB_DB_USER, $HUB_DB_PASS, $HUB_DB_NAME);
        if (!$hubDb) {
            error_log('[ContractFlow] Auth fail: cannot connect to Hub DB');
            return null;
        }

        $stmt = $hubDb->prepare(
            'SELECT user_id FROM sessions WHERE id = ? AND last_activity > UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 120 MINUTE)) LIMIT 1'
        );
        $stmt->execute([$laravelSession]);
        $session = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$session || empty($session['user_id'])) {
            // Try sha256 hash (some Laravel setups hash the session ID in the DB)
            $hashedSession = hash('sha256', $laravelSession);
            $stmt->execute([$hashedSession]);
            $session = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if (!$session || empty($session['user_id'])) {
            // Fallback: scan active sessions for user ID stored inside the payload
            // (Laravel stores auth data serialized in the payload column).
            // This handles guards where user_id column is not populated.
            $session = extractUserFromSessionPayload($hubDb, $laravelSession);
            if (!$session || empty($session['user_id'])) {
                error_log('[ContractFlow] Auth fail: Hub session not found/no user_id. SessionId(40)=' . substr($laravelSession, 0, 40));
                return null;
            }
        }
    }

    if (!isset($hubDb) || !$hubDb) {
        $hubDb = connectDB($HUB_DB_HOST, $HUB_DB_PORT, $HUB_DB_USER, $HUB_DB_PASS, $HUB_DB_NAME);
        if (!$hubDb) {
            error_log('[ContractFlow] Auth fail: cannot connect to Hub DB');
            return null;
        }
    }

    $userId = (int) $session['user_id'];

    // 4. Verify user is active
    $stmt = $hubDb->prepare(
        'SELECT id, first_name, last_name, email FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1'
    );
    $stmt->execute([$userId]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        error_log('[ContractFlow] Auth fail: user_id=' . $userId . ' not found or inactive');
        return null;
    }

    // 5. Check tool access (individual grant OR department match)
    if (!hasToolAccess($hubDb, $userId, $TOOL_URL_PATTERN)) {
        error_log('[ContractFlow] Auth fail: user_id=' . $userId . ' has no tool access for pattern ' . $TOOL_URL_PATTERN);
        return null;
    }

    // 6. Issue contractos_token (DB) or fall back to PHP session
    $userName  = trim($user['first_name'] . ' ' . $user['last_name']);
    $expiresTs = time() + $TOKEN_TTL_HOURS * 3600;
    $userData  = [
        'user_id'    => $userId,
        'user_name'  => $userName,
        'user_email' => $user['email'],
    ];
    $secure = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $sameSite = contractosCookieSameSite();

    // Always store in PHP session so subsequent same-request and AJAX calls can
    // use the fast-path without re-querying the Hub DB every time.
    $_SESSION['user_id']    = $userId;
    $_SESSION['user_name']  = $userName;
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['expires_at'] = $expiresTs;

    $appDb = connectDB($APP_DB_HOST, $APP_DB_PORT, $APP_DB_USER, $APP_DB_PASS, $APP_DB_NAME);
    if ($appDb) {
        $token   = bin2hex(random_bytes(32)); // 64 char hex
        $expires = date('Y-m-d H:i:s', $expiresTs);
        $stmt    = $appDb->prepare(
            'INSERT INTO contractos_sessions (token, user_id, user_name, user_email, expires_at)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$token, $userId, $userName, $user['email'], $expires]);

        setcookie(
            $APP_TOKEN_COOKIE,
            $token,
            [
                'expires'  => $expiresTs,
                'path'     => '/',         // cover all paths
                'httponly' => true,
                'samesite' => $sameSite,
                'secure'   => $secure,
            ]
        );
        $_COOKIE[$APP_TOKEN_COOKIE] = $token;
    }

    return $userData;
}

function getTrustedLaunchUser(): ?array
{
    global $EMBED_SHARED_SECRET, $EMBED_MAX_AGE_SECONDS;

    $launch = $_GET['cf_launch'] ?? '';
    $sig    = $_GET['cf_sig'] ?? '';

    if (!is_string($launch) || $launch === '' || !is_string($sig) || $sig === '') {
        return null;
    }

    $expectedSig = hash_hmac('sha256', $launch, $EMBED_SHARED_SECRET);
    if (!hash_equals($expectedSig, $sig)) {
        error_log('[ContractFlow] Auth fail: invalid launch signature');
        return null;
    }

    $json = base64UrlDecode($launch);
    if ($json === null) {
        error_log('[ContractFlow] Auth fail: invalid launch payload encoding');
        return null;
    }

    $payload = json_decode($json, true);
    if (!is_array($payload)) {
        error_log('[ContractFlow] Auth fail: invalid launch payload json');
        return null;
    }

    $userId = isset($payload['user_id']) ? (int) $payload['user_id'] : 0;
    $tool   = isset($payload['tool']) ? (string) $payload['tool'] : '';
    $exp    = isset($payload['exp']) ? (int) $payload['exp'] : 0;
    $now    = time();

    if ($userId <= 0 || $tool !== 'performance-sales' || $exp <= 0) {
        error_log('[ContractFlow] Auth fail: incomplete launch payload');
        return null;
    }

    if ($exp < $now || $exp > ($now + $EMBED_MAX_AGE_SECONDS + 60)) {
        error_log('[ContractFlow] Auth fail: launch token expired or invalid window');
        return null;
    }

    return [
        'user_id' => $userId,
    ];
}

function getHubUserFromNativePhpSession(): ?array
{
    $sessionId = $_COOKIE['PHPSESSID'] ?? '';
    if (!is_string($sessionId) || $sessionId === '' || !preg_match('/^[A-Za-z0-9,-]+$/', $sessionId)) {
        return null;
    }

    $savePath = session_save_path() ?: sys_get_temp_dir();
    if (strpos($savePath, ';') !== false) {
        $parts = explode(';', $savePath);
        $savePath = end($parts) ?: '';
    }

    if ($savePath === '') {
        return null;
    }

    $sessionFile = rtrim($savePath, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'sess_' . $sessionId;
    if (!is_readable($sessionFile)) {
        return null;
    }

    $payload = @file_get_contents($sessionFile);
    if (!is_string($payload) || $payload === '') {
        return null;
    }

    $previousSession = $_SESSION ?? [];
    $_SESSION = [];

    $decoded = @session_decode($payload);
    $nativeUser = $decoded ? ($_SESSION['pbs_user'] ?? null) : null;

    $_SESSION = $previousSession;

    if (!is_array($nativeUser) || empty($nativeUser['id'])) {
        return null;
    }

    return [
        'user_id' => (int) $nativeUser['id'],
        'user_name' => isset($nativeUser['username']) ? (string) $nativeUser['username'] : null,
        'role' => isset($nativeUser['role']) ? (string) $nativeUser['role'] : null,
    ];
}

function base64UrlDecode(string $value): ?string
{
    $padding = (4 - (strlen($value) % 4)) % 4;
    $decoded = base64_decode(strtr($value . str_repeat('=', $padding), '-_', '+/'), true);

    return $decoded === false ? null : $decoded;
}

function getHubSessionCookieValue(?string $preferredCookie): ?string
{
    $candidates = array_values(array_unique(array_filter([
        $preferredCookie,
        'PHPSESSID',
        'pbs_panama_hub_session', // Laravel default for APP_NAME="PBS Panama Hub"
        'pbs-panama-hub-session',
        'laravel_session',
        'pbs_hub_session',
    ])));

    $appKey = getenv('HUB_APP_KEY') ?: '';

    foreach ($candidates as $cookieName) {
        if (empty($_COOKIE[$cookieName])) {
            continue;
        }

        $cookieValue = $_COOKIE[$cookieName];

        // If app key is configured, try to decrypt as a Laravel-encrypted cookie
        if ($appKey) {
            $sessionId = decryptLaravelCookie($cookieValue, $appKey, $cookieName);
            if ($sessionId !== null) {
                return $sessionId;
            }
        }

        // Fallback: return the raw cookie value (no encryption)
        return $cookieValue;
    }

    return null;
}

/**
 * Decrypt a Laravel AES-256-CBC encrypted cookie (Laravel 6+).
 * Returns the raw session ID string, or null on failure.
 */
function decryptLaravelCookie(string $cookieValue, string $appKey, string $cookieName): ?string
{
    // Decode the app key
    $keyBytes = (strpos($appKey, 'base64:') === 0)
        ? base64_decode(substr($appKey, 7), true)
        : $appKey;
    if (!$keyBytes || strlen($keyBytes) < 16) {
        return null;
    }

    // The cookie value is a base64-encoded JSON payload
    $jsonStr = base64_decode(strtr($cookieValue, '-_', '+/'), true);
    if ($jsonStr === false || $jsonStr === '') {
        $jsonStr = base64_decode($cookieValue, true);
    }
    if (!$jsonStr) {
        return null;
    }

    $payload = json_decode($jsonStr, true);
    if (!is_array($payload) || empty($payload['iv']) || empty($payload['value'])) {
        return null;
    }

    $iv         = base64_decode($payload['iv'], true);
    $ciphertext = base64_decode($payload['value'], true);
    if ($iv === false || $ciphertext === false) {
        return null;
    }

    // Verify HMAC-SHA256 MAC
    $mac = hash_hmac('sha256', $payload['iv'] . $payload['value'], $keyBytes);
    if (!hash_equals($mac, (string) ($payload['mac'] ?? ''))) {
        return null;
    }

    $decrypted = openssl_decrypt($ciphertext, 'AES-256-CBC', $keyBytes, OPENSSL_RAW_DATA, $iv);
    if ($decrypted === false) {
        return null;
    }

    // Laravel 6+: strip CookieValuePrefix = hmac('cookieName.v2', key) . '|'
    $prefix = hash_hmac('sha256', $cookieName . 'v2', $keyBytes) . '|';
    if (strpos($decrypted, $prefix) === 0) {
        return substr($decrypted, strlen($prefix));
    }

    // Older format: might be PHP-serialized
    $unserialized = @unserialize($decrypted);
    if (is_string($unserialized) && $unserialized !== '') {
        return $unserialized;
    }

    // Return as-is (plain session ID with no prefix)
    return $decrypted !== '' ? $decrypted : null;
}

function hasToolAccess(PDO $hubDb, int $userId, string $urlPattern): bool
{
    // Find the tool by URL pattern
    $stmt = $hubDb->prepare('SELECT id, allowed_roles FROM tools WHERE url LIKE ? AND is_active = 1 LIMIT 1');
    $stmt->execute([$urlPattern]);
    $tool = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$tool) {
        // Tool not registered in hub – open access (dev mode)
        return true;
    }

    $toolId = (int) $tool['id'];

    // Level 1: individual grant
    $stmt = $hubDb->prepare(
        'SELECT 1 FROM tool_user WHERE tool_id = ? AND user_id = ? LIMIT 1'
    );
    $stmt->execute([$toolId, $userId]);
    if ($stmt->fetch()) return true;

    // Level 2: department access (primary + secondary departments)
    $stmt = $hubDb->prepare('SELECT department_id FROM tool_department WHERE tool_id = ?');
    $stmt->execute([$toolId]);
    $toolDepartmentIds = array_map(
            static fn ($departmentId): int => (int) $departmentId,
        $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []
    );

    if ($toolDepartmentIds !== []) {
        $userDepartmentIds = [];

        $stmt = $hubDb->prepare(
            'SELECT department_id FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$userId]);
        $userRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($userRow && !empty($userRow['department_id'])) {
            $userDepartmentIds[] = (int) $userRow['department_id'];
        }

        $stmt = $hubDb->prepare('SELECT department_id FROM department_user WHERE user_id = ?');
        $stmt->execute([$userId]);
        $secondaryDepartmentIds = array_map(
            static fn ($departmentId): int => (int) $departmentId,
            $stmt->fetchAll(PDO::FETCH_COLUMN) ?: []
        );

        $userDepartmentIds = array_values(array_unique(array_merge($userDepartmentIds, $secondaryDepartmentIds)));

        if ($userDepartmentIds === []) {
            return false;
        }

        return array_intersect($toolDepartmentIds, $userDepartmentIds) !== [];
    }

    // Level 3: legacy role-based restriction
    $allowedRoles = json_decode((string) ($tool['allowed_roles'] ?? 'null'), true);

    if ($allowedRoles !== null) {
        if (!is_array($allowedRoles) || $allowedRoles === []) {
            return false;
        }

        $stmt = $hubDb->prepare(
            'SELECT roles.name
               FROM model_has_roles
               INNER JOIN roles ON roles.id = model_has_roles.role_id
              WHERE model_has_roles.model_type = ?
                AND model_has_roles.model_id = ?'
        );
        $stmt->execute(['App\\Models\\User', $userId]);
        $userRoles = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

        return array_intersect($allowedRoles, $userRoles) !== [];
    }

    // Level 4: no restrictions → open to all active users
    return true;
}

function connectDB(string $host, string $port, string $user, string $pass, string $dbName): ?PDO
{
    try {
        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE    => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT    => 3,
        ]);
    } catch (PDOException $e) {
        error_log('[ContractFlow Auth Bridge] DB error: ' . $e->getMessage());
        return null;
    }
}

/**
 * Fallback: look inside the serialized session payload for the authenticated user ID.
 * Laravel stores the login state as 'login_web_XXXXX' => user_id in the session payload.
 * Used when the sessions.user_id column is empty (older Hub versions / custom guards).
 */
function extractUserFromSessionPayload(PDO $hubDb, string $sessionId): ?array
{
    try {
        $stmt = $hubDb->prepare(
            'SELECT payload FROM sessions WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$sessionId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || empty($row['payload'])) {
            return null;
        }

        $decoded = base64_decode($row['payload'], true);
        if ($decoded === false) {
            return null;
        }

        // The payload is a PHP-serialized array
        $data = @unserialize($decoded);
        if (!is_array($data)) {
            return null;
        }

        // Find the first key that looks like 'login_web_XXXX' or '_token' backed login
        $userId = null;
        foreach ($data as $key => $value) {
            if (is_string($key) && strpos($key, 'login_web_') === 0 && is_numeric($value)) {
                $userId = (int) $value;
                break;
            }
        }

        // Also try the plain 'login_guard_default' or similar patterns
        if (!$userId) {
            foreach ($data as $key => $value) {
                if (is_string($key) && strpos($key, 'login_') === 0 && is_numeric($value)) {
                    $userId = (int) $value;
                    break;
                }
            }
        }

        if (!$userId) {
            return null;
        }

        return ['user_id' => $userId];
    } catch (\Exception $e) {
        return null;
    }
}
