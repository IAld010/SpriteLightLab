using System.Text.Json;

namespace SpriteLightLab.Launcher;

internal sealed class LauncherState
{
    public int? LastPort { get; set; }
    public DateTimeOffset? LastStartedAt { get; set; }
    public string? Language { get; set; }
}

internal sealed class LauncherStateStore
{
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    public LauncherState Load()
    {
        try
        {
            if (!File.Exists(AppConstants.StateFilePath))
            {
                return new LauncherState();
            }

            var json = File.ReadAllText(AppConstants.StateFilePath);
            return JsonSerializer.Deserialize<LauncherState>(json, JsonOptions) ?? new LauncherState();
        }
        catch (Exception exception)
        {
            AppLogger.Warn($"读取启动器状态失败，将使用默认端口顺序：{exception.Message}");
            return new LauncherState();
        }
    }

    public void Save(int port, LauncherLanguage? language = null)
    {
        var state = Load();
        state.LastPort = port;
        state.LastStartedAt = DateTimeOffset.Now;
        if (language.HasValue)
        {
            state.Language = language.Value.ToCode();
        }

        var temporaryPath = AppConstants.StateFilePath + ".tmp";
        try
        {
            Directory.CreateDirectory(AppConstants.DataDirectory);
            var json = JsonSerializer.Serialize(state, JsonOptions);
            File.WriteAllText(temporaryPath, json);
            File.Move(temporaryPath, AppConstants.StateFilePath, true);
        }
        catch (Exception exception)
        {
            AppLogger.Warn($"保存启动器状态失败：{exception.Message}");
            try
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            catch
            {
            }
        }
    }
}