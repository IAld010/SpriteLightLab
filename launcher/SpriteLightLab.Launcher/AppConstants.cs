namespace SpriteLightLab.Launcher;

internal static class AppConstants
{
    public const string ProductName = "Sprite Light Lab";
    public const string ProductVersion = "1.0.6";
    public const string EmbeddedResourceName = "SpriteLightLab.wwwroot.zip";
    public const string MutexName = @"Local\SpriteLightLab.Launcher";
    public const string ShowEventName = @"Local\SpriteLightLab.Launcher.Show";
    public const int FirstPort = 5173;
    public const int LastPort = 5199;

    public static string DataDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SpriteLightLab");

    public static string StateFilePath => Path.Combine(DataDirectory, "launcher-state.json");
    public static string LogDirectory => Path.Combine(DataDirectory, "logs");
    public static string LogFilePath => Path.Combine(LogDirectory, "launcher.log");
    public static string BaseUrl(int port) => $"http://127.0.0.1:{port}";
}