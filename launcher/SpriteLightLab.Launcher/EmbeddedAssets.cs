using System.IO.Compression;
using System.Reflection;

namespace SpriteLightLab.Launcher;

internal sealed class EmbeddedAssets
{
    private readonly Dictionary<string, byte[]> _assets;

    public EmbeddedAssets()
    {
        _assets = LoadAssets(Assembly.GetExecutingAssembly());
        if (_assets.Count == 0)
        {
            throw new InvalidOperationException("EXE 中没有可用的网页资源。");
        }
    }

    public int Count => _assets.Count;
    public byte[] IndexDocument => _assets["index.html"];

    public bool TryGet(string path, out byte[] content)
    {
        return _assets.TryGetValue(path, out content!);
    }

    private static Dictionary<string, byte[]> LoadAssets(Assembly assembly)
    {
        using var resourceStream = assembly.GetManifestResourceStream(AppConstants.EmbeddedResourceName)
            ?? throw new InvalidOperationException($"找不到内嵌资源：{AppConstants.EmbeddedResourceName}");

        using var archive = new ZipArchive(resourceStream, ZipArchiveMode.Read, leaveOpen: false);
        var assets = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);

        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrEmpty(entry.Name))
            {
                continue;
            }

            var key = entry.FullName.Replace('\\', '/').TrimStart('/');
            if (string.IsNullOrWhiteSpace(key) || key.Split('/').Any(segment => segment == ".."))
            {
                throw new InvalidDataException($"内嵌资源包含不安全路径：{entry.FullName}");
            }

            using var entryStream = entry.Open();
            using var memory = new MemoryStream();
            entryStream.CopyTo(memory);
            assets[key] = memory.ToArray();
        }

        if (!assets.ContainsKey("index.html"))
        {
            throw new InvalidDataException("内嵌资源缺少 index.html。");
        }

        return assets;
    }
}