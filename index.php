<?php
/**
 * Performance Sales Entry Point
 * ========================
 * Apache serves this file for all requests to /performance-sales/.
 * It validates hub session access, then serves the React SPA.
 */

// Load local env overrides before defining endpoints so config.php can
// override the default hub/api locations when needed.
$envFile = __DIR__ . '/config.php';
if (file_exists($envFile)) {
    require_once $envFile;
}

function contractosEnv(string $key, string $default): string
{
    $value = getenv($key);

    return is_string($value) && $value !== '' ? $value : $default;
}

function detectAppPublicBase(): string
{
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    );
    $scheme = $isHttps ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'hub.collab.grouppbs.com';

    return $scheme . '://' . $host;
}

define('HUB_LOGIN_URL', contractosEnv('HUB_LOGIN_URL', 'https://hub.collab.grouppbs.com/login'));
define('APP_PUBLIC_BASE', contractosEnv('APP_PUBLIC_BASE', detectAppPublicBase()));
define('API_UPSTREAM_BASE', contractosEnv('API_UPSTREAM_BASE', 'http://10.0.0.187:3003'));
define('API_PROXY_SHARED_SECRET', contractosEnv('API_PROXY_SHARED_SECRET', 'replace_with_shared_proxy_secret'));
define('APP_TOKEN_COOKIE', contractosEnv('APP_TOKEN_COOKIE', 'performance_sales_token'));
define('API_UPSTREAM_FALLBACKS', contractosEnv('API_UPSTREAM_FALLBACKS', 'http://10.0.0.187:3003'));
define('API_BACKEND_DIR', contractosEnv('API_BACKEND_DIR', __DIR__ . DIRECTORY_SEPARATOR . 'backend'));
define('API_BACKEND_AUTO_START', contractosEnv('API_BACKEND_AUTO_START', '1'));
define('API_BACKEND_START_COMMAND', contractosEnv('API_BACKEND_START_COMMAND', 'node src/app.js'));
define('API_BACKEND_NODE_BINARY', contractosEnv('API_BACKEND_NODE_BINARY', detectDefaultNodeBinaryPath()));
define('API_BACKEND_START_GRACE_MS', contractosEnv('API_BACKEND_START_GRACE_MS', '12000'));
define('API_BACKEND_START_THROTTLE_SECONDS', contractosEnv('API_BACKEND_START_THROTTLE_SECONDS', '20'));

require_once __DIR__ . '/auth-bridge.php';

$requestUri  = $_SERVER['REQUEST_URI'] ?? '/performance-sales/';
$requestPath = parse_url($requestUri, PHP_URL_PATH) ?: '/performance-sales/';

if (shouldForceHttps()) {
    header('Location: ' . APP_PUBLIC_BASE . $requestUri, true, 302);
    exit;
}

if (strpos($requestPath, '/performance-sales/api') === 0) {
    // Diagnostic endpoint (PHP-handled, never proxied to Node)
    if ($requestPath === '/performance-sales/api/auth/debug' && isset($_GET['token']) && $_GET['token'] === 'ps-debug-2026') {
        header('Content-Type: text/plain; charset=UTF-8');
        echo "=== Performance Sales Auth Diagnostic ===\n\n";
        echo "Request path : $requestPath\n";
        echo "REMOTE_ADDR  : " . ($_SERVER['REMOTE_ADDR'] ?? '?') . "\n";
        echo "HTTPS        : " . ($_SERVER['HTTPS'] ?? 'off') . "\n";
        echo "Sec-Fetch    : " . ($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '?') . "\n";
        echo "Cookies      : " . (empty($_COOKIE) ? '[ninguna]' : implode(', ', array_keys($_COOKIE))) . "\n";
        $hubCookie = getenv('HUB_SESSION_COOKIE') ?: 'pbs_panama_hub_session';
        foreach ([$hubCookie, 'pbs_panama_hub_session', 'pbs-panama-hub-session', 'laravel_session'] as $cn) {
            if (!empty($_COOKIE[$cn])) {
                echo "Hub cookie '$cn': len=" . strlen($_COOKIE[$cn]) . "\n";
            }
        }
        echo "performance_sales_token: " . (empty($_COOKIE[APP_TOKEN_COOKIE]) ? 'NO' : 'YES len=' . strlen($_COOKIE[APP_TOKEN_COOKIE])) . "\n";
        $appKey = getenv('HUB_APP_KEY') ?: '';
        echo "HUB_APP_KEY configured: " . ($appKey ? 'YES' : 'NO') . "\n";
        $user = validateHubAccess();
        echo "validateHubAccess: " . ($user ? 'OK user_id=' . $user['user_id'] . ' name=' . $user['user_name'] : 'FAIL - null') . "\n";
        exit;
    }

    // Auth init endpoint – PHP-handled, bootstraps the session for the SPA.
    // The SPA calls this on startup to ensure a PHP session + app token
    // cookie exist before making any authenticated API calls.
    if ($requestPath === '/performance-sales/api/auth/whoami') {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache');
        $user = validateHubAccess();
        if ($user) {
            echo json_encode([
                'ok' => true,
                'roles' => array_values($user['user_roles'] ?? []),
                'can_upload_reports' => !empty($user['can_upload_reports']),
                'user' => [
                    'id' => $user['user_id'] ?? null,
                    'name' => $user['user_name'] ?? '',
                    'email' => $user['user_email'] ?? '',
                    'roles' => array_values($user['user_roles'] ?? []),
                    'can_upload_reports' => !empty($user['can_upload_reports']),
                ],
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['ok' => false, 'error' => 'No autorizado']);
        }
        exit;
    }

    if ($requestPath === '/performance-sales/api/efficiency/access') {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache');

        $user = validateHubAccess();
        if ($user === null) {
            http_response_code(401);
            echo json_encode(['error' => 'No autorizado']);
            exit;
        }

        try {
            echo json_encode(
                buildEfficiencyAccessSummaryResponse($_GET, $user),
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            );
        } catch (Throwable $error) {
            $isAvailabilityError = $error instanceof RuntimeException
                && $error->getMessage() === 'Performance Sales DB unavailable';

            http_response_code($isAvailabilityError ? 503 : 500);
            if ($isAvailabilityError) {
                header('Retry-After: 3');
            }

            echo json_encode([
                'error' => $isAvailabilityError
                    ? 'Performance Sales no pudo inicializar los permisos porque uno de sus servicios no esta disponible temporalmente.'
                    : 'No se pudieron cargar los permisos de navegacion.',
            ]);
        }
        exit;
    }

    if (preg_match('#^/performance-sales/api/performance/uploads/([^/]+)/clear$#', $requestPath, $matches) === 1) {
        header('Content-Type: application/json; charset=UTF-8');
        header('Cache-Control: no-store, no-cache');

        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
            http_response_code(405);
            header('Allow: POST');
            echo json_encode(['error' => 'Metodo no permitido.']);
            exit;
        }

        $user = validateHubAccess();
        if ($user === null) {
            http_response_code(401);
            echo json_encode(['error' => 'No autorizado']);
            exit;
        }

        if (empty($user['can_upload_reports'])) {
            http_response_code(403);
            echo json_encode(['error' => 'No tienes permisos para subir reportes.']);
            exit;
        }

        $reportType = normalizePerformanceReportTypePhp($matches[1] ?? '');
        if ($reportType === null) {
            http_response_code(400);
            echo json_encode(['error' => 'Tipo de reporte no soportado. Usa Xerox, IT o Post Ventas.']);
            exit;
        }

        try {
            $result = clearPerformanceUploadDataByReportTypePhp($reportType);

            echo json_encode([
                'ok' => true,
                'report_type' => $reportType,
                'deleted_rows' => $result['deleted_rows'],
                'deleted_batches' => $result['deleted_batches'],
            ]);
        } catch (Throwable $error) {
            $isAvailabilityError = $error instanceof RuntimeException
                && $error->getMessage() === 'Performance Sales DB unavailable';

            http_response_code($isAvailabilityError ? 503 : 500);
            echo json_encode([
                'error' => $isAvailabilityError
                    ? 'Performance Sales no pudo eliminar la informacion cargada porque uno de sus servicios no esta disponible temporalmente.'
                    : 'No se pudo eliminar la informacion cargada.',
            ]);
        }
        exit;
    }

    $user = validateHubAccess();
    if ($user === null) {
        http_response_code(401);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }
    proxyApiRequest($requestUri, $user);
    exit;
}

$user = validateHubAccess();

// Debug mode: ?debug accessible only from the server itself
if ($user === null && isset($_GET['debug']) && in_array($_SERVER['REMOTE_ADDR'], ['::1', '10.0.0.187', '::ffff:10.0.0.187'], true)) {
    header('Content-Type: text/plain; charset=UTF-8');
    echo "=== Performance Sales Auth Debug ===\n\n";
    echo "REMOTE_ADDR : " . $_SERVER['REMOTE_ADDR'] . "\n";
    echo "HTTPS       : " . ($_SERVER['HTTPS'] ?? 'off') . "\n";
    echo "Cookies     : " . implode(', ', array_keys($_COOKIE)) . "\n";
    $lsCookie = getenv('HUB_SESSION_COOKIE') ?: 'laravel_session';
    echo "laravel_session cookie present: " . (isset($_COOKIE[$lsCookie]) ? 'YES (len=' . strlen($_COOKIE[$lsCookie]) . ')' : 'NO') . "\n";
    echo "performance_sales_token cookie present: " . (isset($_COOKIE[APP_TOKEN_COOKIE]) ? 'YES' : 'NO') . "\n";
    echo "performance_sales_session (PHP): started=" . (session_status() !== PHP_SESSION_NONE ? 'YES' : 'NO') . "\n";
    exit;
}

// Attempt silent auth for embedded and direct launches, but never redirect the
// HTML shell away from /performance-sales. PBS Hub already controls access to
// the tool entry, and forcing a login redirect here breaks iframe embedding.
$isIframe = (($_SERVER['HTTP_SEC_FETCH_DEST'] ?? '') === 'iframe');
if ($user === null) {
    $user = validateHubAccess();
}

// User is authenticated – serve the React SPA
$indexFile = __DIR__ . '/public/index.html';

if (!file_exists($indexFile)) {
    // SPA not built yet – show helpful message
    http_response_code(503);
    echo '<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Performance Sales – Setup Required</title>
<style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0;}
.card{background:#fff;border-radius:12px;padding:40px;max-width:480px;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center;}
h2{color:#1e293b;margin-bottom:8px;}p{color:#64748b;font-size:14px;line-height:1.6;}
code{background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:13px;}
</style></head><body>
<div class="card">
    <h2>🚀 Performance Sales</h2>
  <p>Authenticated as <strong>' . htmlspecialchars($user['user_name']) . '</strong>.</p>
  <p>The React frontend has not been built yet.</p>
  <p>Run:<br><code>cd frontend &amp;&amp; npm run build</code></p>
</div></body></html>';
    exit;
}

// Output the built SPA
header('Content-Type: text/html; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
// Security headers (no X-Frame-Options – allow same-origin iframe embedding)
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header("Content-Security-Policy: frame-ancestors 'self' https://hub.collab.grouppbs.com https://10.0.0.187");

$html = file_get_contents($indexFile);
if ($html === false) {
    http_response_code(500);
    echo 'No se pudo leer el frontend compilado.';
    exit;
}

$bootstrapAuth = json_encode([
    'id' => $user['user_id'] ?? null,
    'name' => $user['user_name'] ?? '',
    'email' => $user['user_email'] ?? '',
    'roles' => array_values($user['user_roles'] ?? []),
    'can_upload_reports' => !empty($user['can_upload_reports']),
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

$bootstrapScript = "<script>window.__PERFORMANCE_SALES_AUTH__={$bootstrapAuth};</script>";

if (strpos($html, '</head>') !== false) {
    echo str_replace('</head>', $bootstrapScript . '</head>', $html);
} else {
    echo $bootstrapScript . $html;
}

function proxyApiRequest(string $requestUri, array $user): void
{
    if (!function_exists('curl_init')) {
        http_response_code(500);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode(['error' => 'cURL no esta disponible en PHP.']);
        return;
    }

    $backendReady = ensureApiBackendReady();
    if (!$backendReady['ok']) {
        error_log('[Performance Sales proxy] ' . $backendReady['error']);
        http_response_code(503);
        header('Content-Type: application/json; charset=UTF-8');
        header('Retry-After: 3');
        echo json_encode(['error' => buildApiUnavailableMessage()]);
        return;
    }

    $path = parse_url($requestUri, PHP_URL_PATH) ?: '/performance-sales/api';
    $query = parse_url($requestUri, PHP_URL_QUERY);
    $upstreamPath = preg_replace('#^/performance-sales/api#', '/api', $path, 1);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $rawBody = file_get_contents('php://input');

    $isMultipartUpload = !empty($_FILES);
    $forwardHeaders = [];
    foreach (getallheadersSafe() as $name => $value) {
        $lower = strtolower($name);
        if (in_array($lower, ['host', 'content-length', 'cookie'], true)) {
            continue;
        }

        // When PHP rebuilds multipart payloads with CURLFile, cURL must generate
        // its own Content-Type boundary. Forwarding the browser boundary here
        // causes multer/busboy to see a truncated form.
        if ($isMultipartUpload && $lower === 'content-type') {
            continue;
        }
        $forwardHeaders[] = $name . ': ' . $value;
    }

    $forwardHeaders[] = 'X-Performance-Sales-Proxy-Secret: ' . API_PROXY_SHARED_SECRET;
    $forwardHeaders[] = 'X-Performance-Sales-User-Id: ' . rawurlencode((string) ($user['user_id'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Name: ' . rawurlencode((string) ($user['user_name'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Email: ' . rawurlencode((string) ($user['user_email'] ?? ''));
    $forwardHeaders[] = 'X-Performance-Sales-User-Roles: ' . rawurlencode(json_encode(array_values($user['user_roles'] ?? [])));
    $forwardHeaders[] = 'X-Performance-Sales-Can-Upload: ' . (!empty($user['can_upload_reports']) ? '1' : '0');

    if (!empty($_COOKIE)) {
        $cookiePairs = [];
        foreach ($_COOKIE as $key => $value) {
            $cookiePairs[] = $key . '=' . $value;
        }
        $forwardHeaders[] = 'Cookie: ' . implode('; ', $cookiePairs);
    }

    $result = null;
    $errors = [];
    $retryTriggered = false;
    $candidates = getApiUpstreamCandidates($backendReady['preferred_base'] ?? null);

    while ($result === null) {
        foreach ($candidates as $upstreamBase) {
            $targetUrl = rtrim($upstreamBase, '/') . $upstreamPath . ($query ? ('?' . $query) : '');
            $attempt = forwardRequestToApi($targetUrl, $method, $rawBody, $isMultipartUpload, $forwardHeaders);

            if ($attempt['ok'] && !shouldRetryApiAttempt($attempt)) {
                $result = $attempt;
                break;
            }

            $errors[] = $attempt['ok']
                ? sprintf('El upstream %s respondio con %d.', $targetUrl, $attempt['status'])
                : $attempt['error'];
        }

        if ($result !== null || $retryTriggered) {
            break;
        }

        $retryTriggered = true;
        $backendReady = ensureApiBackendReady(true);

        if (!$backendReady['ok']) {
            $errors[] = $backendReady['error'];
            break;
        }

        $candidates = getApiUpstreamCandidates($backendReady['preferred_base'] ?? null);
    }

    if ($result === null) {
        if ($errors !== []) {
            error_log('[Performance Sales proxy] ' . implode(' | ', $errors));
        }

        http_response_code(503);
        header('Content-Type: application/json; charset=UTF-8');
        header('Retry-After: 3');
        echo json_encode(['error' => buildApiUnavailableMessage()]);
        return;
    }

    $status = $result['status'];
    $rawHeaders = $result['headers'];
    $body = $result['body'];

    http_response_code($status);
    foreach (explode("\r\n", $rawHeaders) as $headerLine) {
        if (strpos($headerLine, ':') === false) {
            continue;
        }
        [$name, $value] = explode(':', $headerLine, 2);
        $name = trim($name);
        $value = trim($value);
        if ($name === '' || in_array(strtolower($name), ['transfer-encoding', 'content-encoding', 'connection'], true)) {
            continue;
        }
        header($name . ': ' . $value, false);
    }

    echo $body;
}

function ensureApiBackendReady(bool $forceStart = false): array
{
    foreach (getApiUpstreamCandidates() as $candidate) {
        if (isApiUpstreamHealthy($candidate)) {
            return [
                'ok' => true,
                'preferred_base' => $candidate,
            ];
        }
    }

    $recentStartAttempt = hasRecentApiBackendStartAttempt();
    $started = false;
    $shouldStart = $forceStart || !$recentStartAttempt;

    if ($shouldStart) {
        $started = tryStartApiBackendProcess();
    }

    if ($recentStartAttempt || $shouldStart) {
        $deadline = microtime(true) + (max(1000, (int) API_BACKEND_START_GRACE_MS) / 1000);

        do {
            usleep(250000);

            foreach (getApiUpstreamCandidates() as $candidate) {
                if (isApiUpstreamHealthy($candidate)) {
                    return [
                        'ok' => true,
                        'preferred_base' => $candidate,
                    ];
                }
            }
        } while (microtime(true) < $deadline);
    }

    if (!$forceStart && $recentStartAttempt && !$started) {
        return ensureApiBackendReady(true);
    }

    return [
        'ok' => false,
        'error' => 'La API backend no esta disponible en ' . implode(', ', getApiUpstreamCandidates()) . '.',
    ];
}

function getApiUpstreamCandidates(?string $preferredBase = null): array
{
    $candidates = array_merge(
        $preferredBase ? [$preferredBase] : [],
        [API_UPSTREAM_BASE],
        array_map('trim', explode(',', API_UPSTREAM_FALLBACKS))
    );

    return array_values(array_unique(array_filter($candidates, static fn ($candidate): bool => $candidate !== '')));
}

function isApiUpstreamHealthy(string $upstreamBase): bool
{
    $healthUrl = rtrim($upstreamBase, '/') . '/api/health';
    $ch = curl_init($healthUrl);

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER => false,
        CURLOPT_CONNECTTIMEOUT => 2,
        CURLOPT_TIMEOUT => 3,
    ]);

    $response = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 0;
    curl_close($ch);

    return $response !== false && $status >= 200 && $status < 300;
}

function hasRecentApiBackendStartAttempt(): bool
{
    $markerPath = getApiBackendStartMarkerPath();
    if (!is_file($markerPath)) {
        return false;
    }

    return (time() - (int) @filemtime($markerPath)) < max(5, (int) API_BACKEND_START_THROTTLE_SECONDS);
}

function tryStartApiBackendProcess(): bool
{
    if (API_BACKEND_AUTO_START !== '1') {
        return false;
    }

    if (!is_dir(API_BACKEND_DIR)) {
        return false;
    }

    $markerPath = getApiBackendStartMarkerPath();
    if (!@touch($markerPath)) {
        @file_put_contents($markerPath, (string) time(), LOCK_EX);
    }

    $command = trim(API_BACKEND_START_COMMAND);
    if ($command === '') {
        return false;
    }

    if (DIRECTORY_SEPARATOR === '\\') {
        return startApiBackendProcessOnWindows(API_BACKEND_DIR, $command);
    }

    return startApiBackendProcessOnPosix(API_BACKEND_DIR, $command);
}

function startApiBackendProcessOnWindows(string $backendDir, string $command): bool
{
    $shellCommand = buildWindowsBackendStartProcessCommand($backendDir, $command);
    if ($shellCommand === null) {
        $shellCommand = sprintf(
            'cmd.exe /c start "" /D %s /B %s',
            quoteCmdValue($backendDir),
            buildWindowsBackendLaunchCommand($command)
        );
    }

    if (function_exists('popen')) {
        $handle = @popen($shellCommand, 'r');
        if (is_resource($handle)) {
            @pclose($handle);
            return true;
        }
    }

    if (function_exists('shell_exec')) {
        @shell_exec($shellCommand);
        return true;
    }

    return false;
}

function startApiBackendProcessOnPosix(string $backendDir, string $command): bool
{
    $shellCommand = sprintf(
        'cd %s && nohup %s >/dev/null 2>&1 &',
        escapeshellarg($backendDir),
        $command
    );

    if (function_exists('shell_exec')) {
        @shell_exec($shellCommand);
        return true;
    }

    return false;
}

function getApiBackendStartMarkerPath(): string
{
    return rtrim(API_BACKEND_DIR, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . '.api-backend-start.marker';
}

function buildWindowsBackendLaunchCommand(string $command): string
{
    $trimmed = trim($command);

    if (preg_match('/^node(?:\\.exe)?\s+(.+)$/i', $trimmed, $matches)) {
        return quoteCmdValue(resolveApiBackendNodeBinary()) . ' ' . $matches[1];
    }

    return $trimmed;
}

function buildWindowsBackendStartProcessCommand(string $backendDir, string $command): ?string
{
    $trimmed = trim($command);
    if (!preg_match('/^node(?:\\.exe)?\s+(.+)$/i', $trimmed, $matches)) {
        return null;
    }

    $argumentList = trim($matches[1]);
    if ($argumentList === '') {
        return null;
    }

    $script = sprintf(
        "Start-Process -FilePath '%s' -WorkingDirectory '%s' -ArgumentList '%s' -WindowStyle Hidden",
        escapePowerShellSingleQuoted(resolveApiBackendNodeBinary()),
        escapePowerShellSingleQuoted($backendDir),
        escapePowerShellSingleQuoted($argumentList)
    );

    return 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ' . quoteCmdValue($script);
}

function resolveApiBackendNodeBinary(): string
{
    $configured = trim((string) API_BACKEND_NODE_BINARY);
    if ($configured !== '' && (str_contains($configured, 'node') || is_file($configured))) {
        return $configured;
    }

    return detectDefaultNodeBinaryPath();
}

function detectDefaultNodeBinaryPath(): string
{
    $windowsDefault = 'C:\\Program Files\\nodejs\\node.exe';

    if (DIRECTORY_SEPARATOR === '\\' && is_file($windowsDefault)) {
        return $windowsDefault;
    }

    return 'node';
}

function quoteCmdValue(string $value): string
{
    return '"' . str_replace('"', '""', $value) . '"';
}

function escapePowerShellSingleQuoted(string $value): string
{
    return str_replace("'", "''", $value);
}

function forwardRequestToApi(string $targetUrl, string $method, $rawBody, bool $isMultipartUpload, array $forwardHeaders): array
{
    $ch = curl_init($targetUrl);

    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HEADER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_HTTPHEADER => $forwardHeaders,
    ]);

    if (in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) {
        if ($isMultipartUpload) {
            $postFields = $_POST;
            foreach ($_FILES as $field => $file) {
                if (is_array($file['tmp_name'])) {
                    continue;
                }
                $postFields[$field] = new CURLFile(
                    $file['tmp_name'],
                    $file['type'] ?: 'application/octet-stream',
                    $file['name'] ?: basename($file['tmp_name'])
                );
            }
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postFields);
        } elseif ($rawBody !== false && $rawBody !== '') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $rawBody);
        }
    }

    $response = curl_exec($ch);
    if ($response === false) {
        $error = curl_error($ch) ?: ('No se pudo conectar con la API backend en ' . $targetUrl);
        curl_close($ch);

        return [
            'ok' => false,
            'error' => $error,
        ];
    }

    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 502;
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE) ?: 0;
    $rawHeaders = substr($response, 0, $headerSize);
    $body = substr($response, $headerSize);
    curl_close($ch);

    return [
        'ok' => true,
        'status' => $status,
        'headers' => $rawHeaders,
        'body' => $body,
    ];
}

function shouldRetryApiAttempt(array $attempt): bool
{
    if (!$attempt['ok']) {
        return true;
    }

    return in_array((int) ($attempt['status'] ?? 0), [502, 503, 504], true);
}

function buildApiUnavailableMessage(): string
{
    return 'Performance Sales no esta disponible temporalmente. El servicio se esta iniciando o recuperando.';
}

function getallheadersSafe(): array
{
    if (function_exists('getallheaders')) {
        $headers = getallheaders();
        return is_array($headers) ? $headers : [];
    }

    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') !== 0) {
            continue;
        }
        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($key, 5)))));
        $headers[$name] = $value;
    }
    if (isset($_SERVER['CONTENT_TYPE'])) {
        $headers['Content-Type'] = $_SERVER['CONTENT_TYPE'];
    }
    if (isset($_SERVER['CONTENT_LENGTH'])) {
        $headers['Content-Length'] = $_SERVER['CONTENT_LENGTH'];
    }
    return $headers;
}

function shouldForceHttps(): bool
{
    $isHttps = (
        (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
        (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
    );

    if ($isHttps) {
        return false;
    }

    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    return !in_array($remote, ['::1', '10.0.0.187', '::ffff:10.0.0.187'], true);
}

function buildEfficiencyAccessSummaryResponse(array $params, array $user): array
{
    $appDb = connectPerformanceSalesAppDb();
    if (!$appDb) {
        throw new RuntimeException('Performance Sales DB unavailable');
    }

    $overviewContext = resolveEfficiencyOverviewContextPhp($appDb, $params);
    $navigation = resolveNavigationAccessPhp($appDb, $user);
    $efficiencyScope = !empty($navigation['has_full_view_access'])
        ? buildFullAccessScopePhp('full_view_access_setting')
        : resolveEfficiencyScopePhp($appDb, $user, $overviewContext['config_month']);

    return [
        'config_month' => $overviewContext['config_month'],
        'filter' => buildEfficiencyFilterPayloadPhp($overviewContext),
        'navigation' => $navigation,
        'efficiency' => buildEfficiencyAccessPayloadPhp($efficiencyScope),
    ];
}

function connectPerformanceSalesAppDb(): ?PDO
{
    global $APP_DB_HOST, $APP_DB_PORT, $APP_DB_USER, $APP_DB_PASS, $APP_DB_NAME;

    return connectDB($APP_DB_HOST, $APP_DB_PORT, $APP_DB_USER, $APP_DB_PASS, $APP_DB_NAME);
}

function normalizePerformanceReportTypePhp($value): ?string
{
    $normalized = strtolower(trim((string) $value));

    return in_array($normalized, ['xerox', 'it', 'postventas'], true) ? $normalized : null;
}

function clearPerformanceUploadDataByReportTypePhp(string $reportType): array
{
    $appDb = connectPerformanceSalesAppDb();
    if (!$appDb) {
        throw new RuntimeException('Performance Sales DB unavailable');
    }

    $appDb->beginTransaction();

    try {
        $deleteRowsStatement = $appDb->prepare(
            'DELETE FROM performance_sales_rows WHERE report_type = ?'
        );
        $deleteRowsStatement->execute([$reportType]);
        $deletedRows = (int) $deleteRowsStatement->rowCount();

        $deleteBatchesStatement = $appDb->prepare(
            'DELETE FROM performance_sales_upload_batches WHERE report_type = ?'
        );
        $deleteBatchesStatement->execute([$reportType]);
        $deletedBatches = (int) $deleteBatchesStatement->rowCount();

        $appDb->commit();

        return [
            'deleted_rows' => $deletedRows,
            'deleted_batches' => $deletedBatches,
        ];
    } catch (Throwable $error) {
        if ($appDb->inTransaction()) {
            $appDb->rollBack();
        }

        throw $error;
    }
}

function resolveEfficiencyOverviewContextPhp(PDO $appDb, array $params = []): array
{
    $explicitConfigMonth = normalizeConfigMonthPhp($params['configMonth'] ?? ($params['config_month'] ?? null));
    $metricsPeriod = buildEfficiencyPeriodContextPhp($params, 'report_month', true);
    $configPeriod = buildEfficiencyPeriodContextPhp($params, 'config_month', false);
    $activeMonths = listActiveReportMonthsPhp($appDb, $metricsPeriod);
    $activeMonthCount = count($activeMonths);
    $fallbackConfigMonth = resolveConfigMonthPhp($appDb, $params);
    $configMonth = $explicitConfigMonth;

    if (!$configMonth && $activeMonths !== []) {
        $configMonth = end($activeMonths) ?: null;
    }

    if (!$configMonth) {
        $configMonth = findLatestConfigMonthPhp($appDb, $configPeriod);
    }

    if (!$configMonth) {
        $configMonth = $metricsPeriod['preferred_config_month'] ?: $fallbackConfigMonth;
    }

    $fallbackYtdMonthNumber = (int) substr((string) $configMonth, 5, 2);
    $reportYear = $metricsPeriod['display_year']
        ?: (int) substr((string) $configMonth, 0, 4)
        ?: toNullableIntPhp($params['year'] ?? null)
        ?: (int) gmdate('Y');

    return [
        'period' => $metricsPeriod['period'],
        'label' => $metricsPeriod['label'],
        'config_month' => $configMonth,
        'active_month_count' => $activeMonthCount,
        'active_months' => $activeMonths,
        'report_year' => $reportYear,
        'ytd_month_number' => max(
            1,
            $activeMonthCount
            ?: (int) $metricsPeriod['fallback_month_count']
            ?: $fallbackYtdMonthNumber
            ?: 1
        ),
    ];
}

function buildEfficiencyPeriodContextPhp(array $params, string $column, bool $includeActiveFlag): array
{
    $period = normalizeEfficiencyPeriodPhp($params['period'] ?? null);
    $year = toNullableIntPhp($params['year'] ?? null);
    $month = toNullableIntPhp($params['month'] ?? null);
    $quarter = toNullableIntPhp($params['quarter'] ?? null);
    $startDate = normalizeDateValuePhp($params['startDate'] ?? null);
    $endDate = normalizeDateValuePhp($params['endDate'] ?? null);
    $activePrefix = $includeActiveFlag ? 'is_active = 1 AND ' : '';

    if ($period === 'mensual' && $year !== null && $month !== null && $month >= 1 && $month <= 12) {
        return [
            'period' => $period,
            'label' => sprintf('%04d-%02d', $year, $month),
            'where_sql' => sprintf('%sYEAR(%s) = ? AND MONTH(%s) = ?', $activePrefix, $column, $column),
            'values' => [$year, $month],
            'fallback_month_count' => 1,
            'display_year' => $year,
            'preferred_config_month' => sprintf('%04d-%02d-01', $year, $month),
        ];
    }

    if ($period === 'trimestral' && $year !== null && $quarter !== null && $quarter >= 1 && $quarter <= 4) {
        $quarterEndMonth = (($quarter - 1) * 3) + 3;

        return [
            'period' => $period,
            'label' => sprintf('%04d T%d', $year, $quarter),
            'where_sql' => sprintf('%sYEAR(%s) = ? AND QUARTER(%s) = ?', $activePrefix, $column, $column),
            'values' => [$year, $quarter],
            'fallback_month_count' => 3,
            'display_year' => $year,
            'preferred_config_month' => sprintf('%04d-%02d-01', $year, $quarterEndMonth),
        ];
    }

    if ($period === 'personalizado' && $startDate && $endDate) {
        [$normalizedStartDate, $normalizedEndDate] = normalizeDateRangePhp($startDate, $endDate);

        return [
            'period' => $period,
            'label' => $normalizedStartDate . ' a ' . $normalizedEndDate,
            'where_sql' => sprintf('%s%s BETWEEN ? AND ?', $activePrefix, $column),
            'values' => [$normalizedStartDate, $normalizedEndDate],
            'fallback_month_count' => countMonthsInRangePhp($normalizedStartDate, $normalizedEndDate),
            'display_year' => (int) substr($normalizedEndDate, 0, 4) ?: (int) substr($normalizedStartDate, 0, 4),
            'preferred_config_month' => normalizeConfigMonthPhp($normalizedEndDate),
        ];
    }

    if ($year !== null && $year > 0) {
        return [
            'period' => 'anual',
            'label' => (string) $year,
            'where_sql' => sprintf('%sYEAR(%s) = ?', $activePrefix, $column),
            'values' => [$year],
            'fallback_month_count' => 12,
            'display_year' => $year,
            'preferred_config_month' => sprintf('%04d-12-01', $year),
        ];
    }

    return [
        'period' => 'anual',
        'label' => 'Periodo activo',
        'where_sql' => $includeActiveFlag ? 'is_active = 1' : '1 = 1',
        'values' => [],
        'fallback_month_count' => 1,
        'display_year' => null,
        'preferred_config_month' => null,
    ];
}

function listActiveReportMonthsPhp(PDO $appDb, array $periodContext): array
{
    $stmt = $appDb->prepare(
        sprintf(
            "SELECT DISTINCT DATE_FORMAT(report_month, '%%Y-%%m-01') AS report_month\n               FROM performance_sales_upload_batches\n              WHERE %s\n              ORDER BY report_month ASC",
            $periodContext['where_sql']
        )
    );
    $stmt->execute($periodContext['values']);

    return array_values(array_filter(array_map(
        static fn (array $row): ?string => normalizeConfigMonthPhp($row['report_month'] ?? null),
        $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []
    )));
}

function findLatestConfigMonthPhp(PDO $appDb, array $periodContext): ?string
{
    $stmt = $appDb->prepare(
        sprintf(
            'SELECT config_month FROM performance_efficiency_period_settings WHERE %s ORDER BY config_month DESC LIMIT 1',
            $periodContext['where_sql']
        )
    );
    $stmt->execute($periodContext['values']);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    return normalizeConfigMonthPhp($row['config_month'] ?? null);
}

function resolveConfigMonthPhp(PDO $appDb, array $params = []): string
{
    $explicit = normalizeConfigMonthPhp($params['configMonth'] ?? ($params['config_month'] ?? null));
    if ($explicit) {
        return $explicit;
    }

    $year = toNullableIntPhp($params['year'] ?? null);
    $month = toNullableIntPhp($params['month'] ?? null);
    if ($year !== null && $month !== null && $month >= 1 && $month <= 12) {
        return sprintf('%04d-%02d-01', $year, $month);
    }

    $stmt = $appDb->query(
        'SELECT config_month FROM performance_efficiency_period_settings ORDER BY config_month DESC LIMIT 1'
    );
    $configRow = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    if (!empty($configRow['config_month'])) {
        return normalizeDateValuePhp($configRow['config_month']) ?: currentMonthStartPhp();
    }

    $stmt = $appDb->query(
        'SELECT report_month FROM performance_sales_upload_batches WHERE is_active = 1 ORDER BY report_month DESC LIMIT 1'
    );
    $uploadRow = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : false;
    if (!empty($uploadRow['report_month'])) {
        return normalizeDateValuePhp($uploadRow['report_month']) ?: currentMonthStartPhp();
    }

    return currentMonthStartPhp();
}

function resolveNavigationAccessPhp(PDO $appDb, array $user): array
{
    $adminAllowedRoutes = ['/', '/postventas', '/contracts', '/series', '/reports', '/uploads', '/settings', '/efficiency', '/efficiency-config'];
    $defaultAllowedRoutes = ['/', '/postventas', '/contracts', '/series', '/reports', '/uploads', '/settings', '/efficiency'];
    $fullViewAllowedRoutes = ['/', '/postventas', '/contracts', '/series', '/reports', '/uploads', '/efficiency'];
    $efficiencyOnlyAllowedRoutes = ['/efficiency'];
    $roles = normalizeUserRolesPhp($user['user_roles'] ?? ($user['roles'] ?? []));
    $canUploadReports = resolveUploadAccessPhp($user, $roles);

    if (hasAdministrativeEfficiencyAccessPhp($roles)) {
        return [
            'mode' => 'administrative',
            'allowed_routes' => $adminAllowedRoutes,
            'can_manage_efficiency_config' => true,
            'can_access_settings' => true,
            'can_upload_reports' => $canUploadReports,
            'is_efficiency_only' => false,
            'has_full_view_access' => false,
            'has_manager_assignment' => false,
            'has_seller_assignment' => false,
        ];
    }

    $fullViewAccessUsers = getJsonSettingPhp($appDb, 'full_view_access_users', []);
    if (matchesFullViewAccessUserPhp($user, $fullViewAccessUsers)) {
        return [
            'mode' => 'full_view_access',
            'allowed_routes' => $fullViewAllowedRoutes,
            'can_manage_efficiency_config' => false,
            'can_access_settings' => false,
            'can_upload_reports' => false,
            'is_efficiency_only' => false,
            'has_full_view_access' => true,
            'has_manager_assignment' => false,
            'has_seller_assignment' => false,
        ];
    }

    $userId = toNullableIntPhp($user['user_id'] ?? ($user['id'] ?? null));
    $hasScopedRole = array_intersect($roles, ['gerente', 'vendedor']) !== [];
    $hasManagerAssignment = false;
    $hasSellerAssignment = false;

    if ($userId !== null) {
        $stmt = $appDb->prepare(
            'SELECT\n                EXISTS(SELECT 1 FROM performance_efficiency_groups WHERE manager_user_id = ? LIMIT 1) AS has_manager_assignment,\n                EXISTS(SELECT 1 FROM performance_efficiency_members WHERE seller_user_id = ? LIMIT 1) AS has_seller_assignment'
        );
        $stmt->execute([$userId, $userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $hasManagerAssignment = !empty($row['has_manager_assignment']);
        $hasSellerAssignment = !empty($row['has_seller_assignment']);
    }

    if ($hasScopedRole || $hasManagerAssignment || $hasSellerAssignment) {
        return [
            'mode' => 'efficiency_only',
            'allowed_routes' => $efficiencyOnlyAllowedRoutes,
            'can_manage_efficiency_config' => false,
            'can_access_settings' => false,
            'can_upload_reports' => false,
            'is_efficiency_only' => true,
            'has_full_view_access' => false,
            'has_manager_assignment' => $hasManagerAssignment,
            'has_seller_assignment' => $hasSellerAssignment,
        ];
    }

    return [
        'mode' => 'default',
        'allowed_routes' => $defaultAllowedRoutes,
        'can_manage_efficiency_config' => false,
        'can_access_settings' => true,
        'can_upload_reports' => $canUploadReports,
        'is_efficiency_only' => false,
        'has_full_view_access' => false,
        'has_manager_assignment' => false,
        'has_seller_assignment' => false,
    ];
}

function resolveEfficiencyScopePhp(PDO $appDb, array $user, string $configMonth): array
{
    $roles = normalizeUserRolesPhp($user['user_roles'] ?? ($user['roles'] ?? []));
    if (hasAdministrativeEfficiencyAccessPhp($roles)) {
        return buildFullAccessScopePhp('administrative_role');
    }

    $userId = toNullableIntPhp($user['user_id'] ?? ($user['id'] ?? null));
    if ($userId === null) {
        return buildNoAccessScopePhp('missing_user_id');
    }

    $stmt = $appDb->prepare(
        'SELECT sheet_type, group_name, manager_name\n           FROM performance_efficiency_groups\n          WHERE config_month = ? AND manager_user_id = ?\n          ORDER BY sheet_type ASC, sort_order ASC, id ASC'
    );
    $stmt->execute([$configMonth, $userId]);
    $matchedGroups = array_map(
        static fn (array $row): array => [
            'sheet_type' => (string) ($row['sheet_type'] ?? ''),
            'group_name' => (string) ($row['group_name'] ?? ''),
            'manager_name' => (string) ($row['manager_name'] ?? ''),
        ],
        $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []
    );
    if ($matchedGroups !== []) {
        return [
            'status' => 'manager_scoped',
            'reason' => 'manager_assignment',
            'matched_groups' => $matchedGroups,
            'matched_members' => [],
        ];
    }

    $stmt = $appDb->prepare(
        'SELECT m.sheet_type, g.group_name, g.manager_name, m.seller_name\n           FROM performance_efficiency_members m\n           INNER JOIN performance_efficiency_groups g\n                   ON g.id = m.group_id\n                  AND g.sheet_type = m.sheet_type\n                  AND g.config_month = m.config_month\n          WHERE m.config_month = ? AND m.seller_user_id = ?\n          ORDER BY m.sheet_type ASC, g.sort_order ASC, m.sort_order ASC, m.id ASC'
    );
    $stmt->execute([$configMonth, $userId]);
    $matchedMembers = array_map(
        static fn (array $row): array => [
            'sheet_type' => (string) ($row['sheet_type'] ?? ''),
            'group_name' => (string) ($row['group_name'] ?? ''),
            'manager_name' => (string) ($row['manager_name'] ?? ''),
            'seller_name' => (string) ($row['seller_name'] ?? ''),
        ],
        $stmt->fetchAll(PDO::FETCH_ASSOC) ?: []
    );
    if ($matchedMembers !== []) {
        return [
            'status' => 'seller_scoped',
            'reason' => 'seller_assignment',
            'matched_groups' => [],
            'matched_members' => $matchedMembers,
        ];
    }

    $hasScopedRole = array_intersect($roles, ['gerente', 'vendedor']) !== [];

    return buildNoAccessScopePhp($hasScopedRole ? 'missing_assignment' : 'not_assigned');
}

function buildEfficiencyAccessPayloadPhp(array $access): array
{
    return [
        'status' => $access['status'] ?? 'no_access',
        'can_view' => !empty($access['status']) && ($access['status'] !== 'no_access'),
        'can_manage_config' => (($access['status'] ?? '') === 'full_access') && (($access['reason'] ?? '') !== 'full_view_access_setting'),
        'denied_reason' => ($access['status'] ?? '') === 'no_access'
            ? ($access['reason'] ?? 'not_assigned')
            : null,
        'matched_groups' => array_values(array_map(
            static fn (array $group): array => [
                'sheet_type' => $group['sheet_type'] ?? '',
                'group_name' => $group['group_name'] ?? '',
                'manager_name' => $group['manager_name'] ?? '',
            ],
            $access['matched_groups'] ?? []
        )),
        'matched_members' => array_values(array_map(
            static fn (array $member): array => [
                'sheet_type' => $member['sheet_type'] ?? '',
                'group_name' => $member['group_name'] ?? '',
                'manager_name' => $member['manager_name'] ?? '',
                'seller_name' => $member['seller_name'] ?? '',
            ],
            $access['matched_members'] ?? []
        )),
    ];
}

function buildEfficiencyFilterPayloadPhp(array $overviewContext): array
{
    return [
        'period' => $overviewContext['period'],
        'label' => $overviewContext['label'],
        'active_month_count' => $overviewContext['active_month_count'],
        'ytd_month_number' => $overviewContext['ytd_month_number'],
        'config_month' => $overviewContext['config_month'],
    ];
}

function buildFullAccessScopePhp(string $reason): array
{
    return [
        'status' => 'full_access',
        'reason' => $reason,
        'matched_groups' => [],
        'matched_members' => [],
    ];
}

function buildNoAccessScopePhp(string $reason): array
{
    return [
        'status' => 'no_access',
        'reason' => $reason,
        'matched_groups' => [],
        'matched_members' => [],
    ];
}

function hasAdministrativeEfficiencyAccessPhp(array $roles): bool
{
    return array_intersect($roles, ['admin', 'super_admin', 'rrhh']) !== [];
}

function resolveUploadAccessPhp(array $user, array $roles): bool
{
    return !empty($user['canUploadReports'])
        || !empty($user['can_upload_reports'])
        || array_intersect($roles, ['admin', 'super_admin']) !== [];
}

function matchesFullViewAccessUserPhp(array $user, array $accessUsers): bool
{
    $userId = toNullableIntPhp($user['user_id'] ?? ($user['id'] ?? null));
    $userEmail = normalizeEmailPhp($user['user_email'] ?? ($user['email'] ?? null));

    foreach ($accessUsers as $entry) {
        if (is_array($entry)) {
            $entryId = toNullableIntPhp($entry['id'] ?? null);
            if ($userId !== null && $entryId !== null && $userId === $entryId) {
                return true;
            }

            if ($userEmail !== '' && $userEmail === normalizeEmailPhp($entry['email'] ?? null)) {
                return true;
            }

            continue;
        }

        if ($userEmail !== '' && $userEmail === normalizeEmailPhp($entry)) {
            return true;
        }
    }

    return false;
}

function getJsonSettingPhp(PDO $appDb, string $key, array $fallback): array
{
    $stmt = $appDb->prepare('SELECT `value` FROM app_settings WHERE `key` = ? LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        return $fallback;
    }

    $decoded = json_decode((string) ($row['value'] ?? '[]'), true);

    return is_array($decoded) ? $decoded : $fallback;
}

function normalizeUserRolesPhp($roles): array
{
    if (!is_array($roles)) {
        return [];
    }

    return array_values(array_unique(array_filter(array_map(
        static fn ($role): string => strtolower(trim((string) $role)),
        $roles
    ))));
}

function normalizeEfficiencyPeriodPhp($value): string
{
    $normalized = strtolower(trim((string) $value));

    return in_array($normalized, ['mensual', 'trimestral', 'personalizado', 'anual'], true)
        ? $normalized
        : 'anual';
}

function normalizeDateRangePhp(string $startDate, string $endDate): array
{
    return $startDate <= $endDate
        ? [$startDate, $endDate]
        : [$endDate, $startDate];
}

function countMonthsInRangePhp(string $startDate, string $endDate): int
{
    $start = DateTimeImmutable::createFromFormat('!Y-m-d', substr($startDate, 0, 10));
    $end = DateTimeImmutable::createFromFormat('!Y-m-d', substr($endDate, 0, 10));

    if (!$start || !$end) {
        return 1;
    }

    $yearDiff = (int) $end->format('Y') - (int) $start->format('Y');
    $monthDiff = (int) $end->format('n') - (int) $start->format('n');

    return ($yearDiff * 12) + $monthDiff + 1;
}

function normalizeConfigMonthPhp($value): ?string
{
    $normalized = normalizeDateValuePhp($value);
    if ($normalized === null) {
        return null;
    }

    return substr($normalized, 0, 7) . '-01';
}

function normalizeDateValuePhp($value): ?string
{
    if ($value instanceof DateTimeInterface) {
        return $value->format('Y-m-d');
    }

    $rawValue = trim((string) $value);
    if ($rawValue === '') {
        return null;
    }

    try {
        $date = new DateTimeImmutable($rawValue);
    } catch (Exception $error) {
        return null;
    }

    return $date->format('Y-m-d');
}

function currentMonthStartPhp(): string
{
    return gmdate('Y-m-01');
}

function normalizeEmailPhp($value): string
{
    return strtolower(trim((string) $value));
}

function toNullableIntPhp($value): ?int
{
    if ($value === null || $value === '') {
        return null;
    }

    $parsed = filter_var($value, FILTER_VALIDATE_INT);

    return $parsed === false ? null : (int) $parsed;
}
