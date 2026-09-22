using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace SpriteLightLab.Launcher;

internal sealed class StaticWebServer : IAsyncDisposable
{
    private const int MaximumHeaderBytes = 16 * 1024;
    private const int MaximumRequestLineCharacters = 8 * 1024;
    private readonly EmbeddedAssets _assets;
    private readonly object _syncRoot = new();
    private readonly ConcurrentDictionary<Task, byte> _clientTasks = new();
    private TcpListener? _listener;
    private CancellationTokenSource? _cancellation;
    private Task? _acceptTask;
    private int _port;

    public StaticWebServer(EmbeddedAssets assets)
    {
        _assets = assets;
    }

    public bool IsRunning
    {
        get
        {
            lock (_syncRoot)
            {
                return _listener is not null;
            }
        }
    }

    public int Port => _port;
    public string BaseUrl => AppConstants.BaseUrl(_port);

    public void Start(int port)
    {
        lock (_syncRoot)
        {
            if (_listener is not null)
            {
                throw new InvalidOperationException("静态服务器已经启动。");
            }

            var listener = new TcpListener(IPAddress.Loopback, port);
            try
            {
                listener.Server.ExclusiveAddressUse = true;
                listener.Start(128);
            }
            catch
            {
                listener.Stop();
                throw;
            }

            _listener = listener;
            _port = port;
            _cancellation = new CancellationTokenSource();
            _acceptTask = Task.Run(() => AcceptLoopAsync(listener, _cancellation.Token));
        }

        AppLogger.Info($"静态服务器已启动：{BaseUrl}，内嵌资源 {_assets.Count} 项。");
    }

    public async Task StopAsync()
    {
        TcpListener? listener;
        CancellationTokenSource? cancellation;
        Task? acceptTask;

        lock (_syncRoot)
        {
            listener = _listener;
            cancellation = _cancellation;
            acceptTask = _acceptTask;
            _listener = null;
            _cancellation = null;
            _acceptTask = null;
        }

        if (listener is null)
        {
            return;
        }

        AppLogger.Info($"正在停止静态服务器：{AppConstants.BaseUrl(_port)}");
        cancellation?.Cancel();
        listener.Stop();

        if (acceptTask is not null)
        {
            try
            {
                await acceptTask.WaitAsync(TimeSpan.FromSeconds(3));
            }
            catch (OperationCanceledException)
            {
            }
            catch (Exception exception)
            {
                AppLogger.Warn($"等待监听循环结束失败：{exception.Message}");
            }
        }

        var activeTasks = _clientTasks.Keys.ToArray();
        if (activeTasks.Length > 0)
        {
            try
            {
                await Task.WhenAny(Task.WhenAll(activeTasks), Task.Delay(TimeSpan.FromSeconds(3)));
            }
            catch (Exception exception)
            {
                AppLogger.Warn($"等待请求结束失败：{exception.Message}");
            }
        }

        cancellation?.Dispose();
        AppLogger.Info("静态服务器已停止。");
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }

    private async Task AcceptLoopAsync(TcpListener listener, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var client = await listener.AcceptTcpClientAsync(cancellationToken);
                var task = HandleClientAsync(client, cancellationToken);
                _clientTasks.TryAdd(task, 0);
                _ = task.ContinueWith(
                    completedTask => _clientTasks.TryRemove(completedTask, out _),
                    CancellationToken.None,
                    TaskContinuationOptions.ExecuteSynchronously,
                    TaskScheduler.Default);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (ObjectDisposedException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (SocketException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                AppLogger.Error("监听本地端口时发生异常。", exception);
            }
        }
    }

    private async Task HandleClientAsync(TcpClient client, CancellationToken cancellationToken)
    {
        using (client)
        using (var stream = client.GetStream())
        {
            client.ReceiveTimeout = 5000;
            client.SendTimeout = 5000;

            try
            {
                var headerBytes = await ReadHeaderBytesAsync(stream, cancellationToken);
                if (headerBytes is null)
                {
                    await WriteResponseAsync(stream, 431, "Request Header Fields Too Large", "text/plain; charset=utf-8", "请求头过大。"u8.ToArray(), false, "no-store", cancellationToken);
                    return;
                }

                var request = ParseRequest(headerBytes);
                if (request is null)
                {
                    await WriteResponseAsync(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求格式不正确。"u8.ToArray(), false, "no-store", cancellationToken);
                    return;
                }

                if (!request.Method.Equals("GET", StringComparison.OrdinalIgnoreCase) &&
                    !request.Method.Equals("HEAD", StringComparison.OrdinalIgnoreCase))
                {
                    await WriteResponseAsync(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", "仅支持 GET 和 HEAD。"u8.ToArray(), request.IsHead, "no-store", cancellationToken, "GET, HEAD");
                    return;
                }

                if (!TryNormalizeRequestPath(request.Target, out var path))
                {
                    await WriteResponseAsync(stream, 400, "Bad Request", "text/plain; charset=utf-8", "请求路径不安全。"u8.ToArray(), request.IsHead, "no-store", cancellationToken);
                    return;
                }

                var resolvedPath = string.IsNullOrEmpty(path) ? "index.html" : path;
                if (!_assets.TryGet(resolvedPath, out var content))
                {
                    if (Path.GetExtension(resolvedPath).Length == 0)
                    {
                        resolvedPath = "index.html";
                        content = _assets.IndexDocument;
                    }
                    else
                    {
                        await WriteResponseAsync(stream, 404, "Not Found", "text/plain; charset=utf-8", "资源不存在。"u8.ToArray(), request.IsHead, "no-store", cancellationToken);
                        return;
                    }
                }

                await WriteResponseAsync(stream, 200, "OK", GetContentType(resolvedPath), content, request.IsHead, GetCacheControl(resolvedPath), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
            }
            catch (IOException exception)
            {
                AppLogger.Warn($"处理请求连接失败：{exception.Message}");
            }
            catch (SocketException exception)
            {
                AppLogger.Warn($"处理请求套接字失败：{exception.Message}");
            }
            catch (Exception exception)
            {
                AppLogger.Error("处理 HTTP 请求失败。", exception);
                try
                {
                    await WriteResponseAsync(stream, 500, "Internal Server Error", "text/plain; charset=utf-8", "内部服务器错误。"u8.ToArray(), false, "no-store", cancellationToken);
                }
                catch
                {
                }
            }
        }
    }

    private static async Task<byte[]?> ReadHeaderBytesAsync(NetworkStream stream, CancellationToken cancellationToken)
    {
        using var memory = new MemoryStream();
        var buffer = new byte[4096];

        while (memory.Length < MaximumHeaderBytes)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken);
            if (read == 0)
            {
                break;
            }

            memory.Write(buffer, 0, read);
            if (ContainsHeaderTerminator(memory.GetBuffer(), (int)memory.Length))
            {
                return memory.ToArray();
            }
        }

        return null;
    }

    private static bool ContainsHeaderTerminator(byte[] data, int length)
    {
        for (var index = 0; index <= length - 4; index++)
        {
            if (data[index] == (byte)'\r' && data[index + 1] == (byte)'\n' &&
                data[index + 2] == (byte)'\r' && data[index + 3] == (byte)'\n')
            {
                return true;
            }
        }

        return false;
    }

    private static HttpRequest? ParseRequest(byte[] headerBytes)
    {
        var headerText = Encoding.ASCII.GetString(headerBytes);
        var headerEnd = headerText.IndexOf("\r\n\r\n", StringComparison.Ordinal);
        if (headerEnd < 0)
        {
            return null;
        }

        var lines = headerText[..headerEnd].Split("\r\n");
        if (lines.Length == 0 || lines[0].Length > MaximumRequestLineCharacters)
        {
            return null;
        }

        var parts = lines[0].Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 3 || !parts[2].StartsWith("HTTP/1.", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        return new HttpRequest(parts[0], parts[1], parts[0].Equals("HEAD", StringComparison.OrdinalIgnoreCase));
    }

    private static bool TryNormalizeRequestPath(string rawTarget, out string path)
    {
        path = string.Empty;
        if (string.IsNullOrWhiteSpace(rawTarget))
        {
            return false;
        }

        var target = rawTarget;
        if (Uri.TryCreate(rawTarget, UriKind.Absolute, out var absoluteUri))
        {
            if (!absoluteUri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) &&
                !absoluteUri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            target = absoluteUri.PathAndQuery;
        }

        var queryIndex = target.IndexOfAny(['?', '#']);
        if (queryIndex >= 0)
        {
            target = target[..queryIndex];
        }

        if (!target.StartsWith('/'))
        {
            return false;
        }

        string decoded;
        try
        {
            decoded = Uri.UnescapeDataString(target).Replace('\\', '/');
        }
        catch (UriFormatException)
        {
            return false;
        }

        if (decoded.IndexOf('\0') >= 0)
        {
            return false;
        }

        var segments = new List<string>();
        foreach (var segment in decoded.Split('/'))
        {
            if (string.IsNullOrEmpty(segment) || segment == ".")
            {
                continue;
            }

            if (segment == ".." || segment.Contains(':'))
            {
                return false;
            }

            segments.Add(segment);
        }

        path = string.Join('/', segments);
        return true;
    }

    private static string GetContentType(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".html" or ".htm" => "text/html; charset=utf-8",
            ".js" or ".mjs" => "text/javascript; charset=utf-8",
            ".css" => "text/css; charset=utf-8",
            ".json" => "application/json; charset=utf-8",
            ".webmanifest" => "application/manifest+json; charset=utf-8",
            ".svg" => "image/svg+xml",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".ico" => "image/x-icon",
            ".woff" => "font/woff",
            ".woff2" => "font/woff2",
            ".ttf" => "font/ttf",
            ".wasm" => "application/wasm",
            ".zip" => "application/zip",
            ".txt" => "text/plain; charset=utf-8",
            ".md" => "text/markdown; charset=utf-8",
            ".map" => "application/json; charset=utf-8",
            _ => "application/octet-stream",
        };
    }

    private static string GetCacheControl(string path)
    {
        if (path.Equals("index.html", StringComparison.OrdinalIgnoreCase) || path.Equals("sw.js", StringComparison.OrdinalIgnoreCase))
        {
            return "no-store";
        }

        if (path.Equals("manifest.webmanifest", StringComparison.OrdinalIgnoreCase))
        {
            return "no-cache";
        }

        if (path.StartsWith("assets/", StringComparison.OrdinalIgnoreCase))
        {
            return "public, max-age=31536000, immutable";
        }

        return "public, max-age=3600";
    }

    private static async Task WriteResponseAsync(
        NetworkStream stream,
        int statusCode,
        string reasonPhrase,
        string contentType,
        byte[] body,
        bool headOnly,
        string cacheControl,
        CancellationToken cancellationToken,
        string? allow = null)
    {
        var headers = new StringBuilder();
        headers.Append("HTTP/1.1 ").Append(statusCode).Append(' ').Append(reasonPhrase).Append("\r\n");
        headers.Append("Content-Type: ").Append(contentType).Append("\r\n");
        headers.Append("Content-Length: ").Append(body.Length).Append("\r\n");
        headers.Append("Cache-Control: ").Append(cacheControl).Append("\r\n");
        headers.Append("X-Content-Type-Options: nosniff\r\n");
        headers.Append("Connection: close\r\n");
        if (!string.IsNullOrEmpty(allow))
        {
            headers.Append("Allow: ").Append(allow).Append("\r\n");
        }

        headers.Append("\r\n");
        var headerBytes = Encoding.ASCII.GetBytes(headers.ToString());
        await stream.WriteAsync(headerBytes, cancellationToken);
        if (!headOnly && body.Length > 0)
        {
            await stream.WriteAsync(body, cancellationToken);
        }

        await stream.FlushAsync(cancellationToken);
    }

    private sealed record HttpRequest(string Method, string Target, bool IsHead);
}