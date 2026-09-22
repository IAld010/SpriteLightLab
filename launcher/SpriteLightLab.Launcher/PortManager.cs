using System.Net.Http;
using System.Net.Sockets;

namespace SpriteLightLab.Launcher;

internal enum PortStartStatus
{
    Started,
    ExistingApplication,
    Failed,
}

internal sealed record PortStartResult(
    PortStartStatus Status,
    int? Port,
    StaticWebServer? Server,
    IReadOnlyList<int> OccupiedPorts,
    string? Error);

internal static class PortManager
{
    private static readonly HttpClient HttpClient = new(new SocketsHttpHandler
    {
        UseProxy = false,
        ConnectTimeout = TimeSpan.FromMilliseconds(500),
        PooledConnectionLifetime = TimeSpan.FromMinutes(1),
    })
    {
        Timeout = TimeSpan.FromMilliseconds(1200),
    };

    public static IEnumerable<int> GetCandidatePorts(int? lastPort)
    {
        var yielded = new HashSet<int>();
        if (lastPort is >= AppConstants.FirstPort and <= AppConstants.LastPort)
        {
            yielded.Add(lastPort.Value);
            yield return lastPort.Value;
        }

        for (var port = AppConstants.FirstPort; port <= AppConstants.LastPort; port++)
        {
            if (yielded.Add(port))
            {
                yield return port;
            }
        }
    }

    public static async Task<PortStartResult> StartAsync(
        EmbeddedAssets assets,
        LauncherStateStore stateStore,
        CancellationToken cancellationToken)
    {
        var state = stateStore.Load();
        var occupiedPorts = new List<int>();

        foreach (var port in GetCandidatePorts(state.LastPort))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var server = new StaticWebServer(assets);

            try
            {
                server.Start(port);
                stateStore.Save(port);
                return new PortStartResult(
                    PortStartStatus.Started,
                    port,
                    server,
                    occupiedPorts.ToArray(),
                    null);
            }
            catch (SocketException exception) when (exception.SocketErrorCode == SocketError.AddressAlreadyInUse)
            {
                occupiedPorts.Add(port);
                if (await IsSpriteLightLabAsync(port, cancellationToken))
                {
                    return new PortStartResult(
                        PortStartStatus.ExistingApplication,
                        port,
                        null,
                        occupiedPorts.ToArray(),
                        null);
                }
            }
            catch (Exception exception)
            {
                await server.DisposeAsync();
                AppLogger.Error($"启动端口 {port} 失败。", exception);
                return new PortStartResult(
                    PortStartStatus.Failed,
                    port,
                    null,
                    occupiedPorts.ToArray(),
                    exception.Message);
            }
        }

        return new PortStartResult(
            PortStartStatus.Failed,
            null,
            null,
            occupiedPorts.ToArray(),
            null);
    }

    public static async Task<bool> IsSpriteLightLabAsync(int port, CancellationToken cancellationToken)
    {
        var baseUrl = AppConstants.BaseUrl(port);
        try
        {
            using var manifestResponse = await HttpClient.GetAsync($"{baseUrl}/manifest.webmanifest", cancellationToken);
            if (manifestResponse.IsSuccessStatusCode)
            {
                var manifest = await manifestResponse.Content.ReadAsStringAsync(cancellationToken);
                if (manifest.Contains(AppConstants.ProductName, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            using var indexResponse = await HttpClient.GetAsync($"{baseUrl}/", cancellationToken);
            if (!indexResponse.IsSuccessStatusCode)
            {
                return false;
            }

            var html = await indexResponse.Content.ReadAsStringAsync(cancellationToken);
            return html.Contains(AppConstants.ProductName, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return false;
        }
    }
}