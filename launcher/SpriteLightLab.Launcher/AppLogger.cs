using System.Text;

namespace SpriteLightLab.Launcher;

internal static class AppLogger
{
    private const long MaxLogBytes = 2 * 1024 * 1024;
    private static readonly object SyncRoot = new();

    public static void Info(string message) => Write("INFO", message);
    public static void Warn(string message) => Write("WARN", message);
    public static void Error(string message) => Write("ERROR", message);
    public static void Error(string message, Exception exception) => Write("ERROR", $"{message}{Environment.NewLine}{exception}");

    private static void Write(string level, string message)
    {
        try
        {
            Directory.CreateDirectory(AppConstants.LogDirectory);
            lock (SyncRoot)
            {
                RotateIfNeeded();
                var line = $"{DateTimeOffset.Now:O} [{level}] {message}{Environment.NewLine}";
                File.AppendAllText(AppConstants.LogFilePath, line, new UTF8Encoding(false));
            }
        }
        catch
        {
            // Logging must never prevent the launcher from running.
        }
    }

    private static void RotateIfNeeded()
    {
        var file = new FileInfo(AppConstants.LogFilePath);
        if (!file.Exists || file.Length < MaxLogBytes)
        {
            return;
        }

        File.Move(AppConstants.LogFilePath, AppConstants.LogFilePath + ".1", true);
    }
}