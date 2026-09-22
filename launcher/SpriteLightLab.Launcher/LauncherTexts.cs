namespace SpriteLightLab.Launcher;

internal enum LauncherLanguage
{
    Chinese,
    English,
}

internal static class LauncherLanguageExtensions
{
    public static string ToCode(this LauncherLanguage language) =>
        language == LauncherLanguage.English ? "en" : "zh-CN";

    public static LauncherLanguage Parse(string? value) =>
        string.Equals(value, "en", StringComparison.OrdinalIgnoreCase)
            ? LauncherLanguage.English
            : LauncherLanguage.Chinese;
}

internal sealed record LauncherText(
    string LanguageSwitch,
    string OpenApp,
    string SwitchPort,
    string StartService,
    string StopService,
    string Exit,
    string StatusStarting,
    string StatusRunning,
    string StatusExternal,
    string StatusStopping,
    string StatusStopped,
    string StatusError,
    string AddressPrefix,
    string DetailPreparing,
    string DetailStarting,
    string DetailRunning,
    string DetailRunningSwitched,
    string DetailExistingService,
    string DetailStopping,
    string DetailStopped,
    string DetailClosing,
    string DetailStartCancelled,
    string DetailStartFailed,
    string DetailStopFailed,
    string DetailAllPortsOccupied,
    string DetailSwitchSuccess,
    string DetailSwitchOccupiedApp,
    string DetailSwitchOccupiedOther,
    string DetailSwitchFailed,
    string TrayOpenLogs,
    string DialogSwitchTitle,
    string DialogSwitchMessage,
    string DialogCannotSwitchTitle,
    string DialogSwitchFailedTitle,
    string BrowserOpenFailed,
    string StartupFailed,
    string PortListSeparator)
{
    private static readonly LauncherText Chinese = new(
        LanguageSwitch: "English",
        OpenApp: "打开界面",
        SwitchPort: "优先切回 5173",
        StartService: "启动服务",
        StopService: "停止服务",
        Exit: "退出",
        StatusStarting: "● 正在启动…",
        StatusRunning: "● 运行中",
        StatusExternal: "● 检测到外部服务",
        StatusStopping: "● 正在停止…",
        StatusStopped: "● 已停止",
        StatusError: "● 启动失败",
        AddressPrefix: "当前地址：",
        DetailPreparing: "正在准备启动器…",
        DetailStarting: "正在按上次端口、5173、5174–5199 的顺序启动本地服务…",
        DetailRunning: "本地服务运行正常。",
        DetailRunningSwitched: "端口 {0} 已被占用，已切换到 {1}。",
        DetailExistingService: "检测到已有服务，已直接打开：{0}",
        DetailStopping: "正在停止本地服务并释放端口…",
        DetailStopped: "服务已停止，端口已释放。",
        DetailClosing: "正在停止服务并退出…",
        DetailStartCancelled: "启动已取消。",
        DetailStartFailed: "启动失败：{0}",
        DetailStopFailed: "停止失败：{0}",
        DetailAllPortsOccupied: "端口 5173–5199 均已被占用，无法启动本地服务。",
        DetailSwitchSuccess: "已切换到 http://127.0.0.1:5173。浏览器数据不会自动迁移。",
        DetailSwitchOccupiedApp: "5173 已被另一个 Sprite Light Lab 服务占用，当前服务保持不变。",
        DetailSwitchOccupiedOther: "5173 已被其他程序占用，当前服务保持不变。",
        DetailSwitchFailed: "切换失败：{0}",
        TrayOpenLogs: "打开日志目录",
        DialogSwitchTitle: "切换端口",
        DialogSwitchMessage: "当前地址为 {0}。\r\n\r\n浏览器项目数据与端口绑定，切换到 5173 后不会自动迁移。\r\n是否继续切换？",
        DialogCannotSwitchTitle: "无法切换",
        DialogSwitchFailedTitle: "切换失败",
        BrowserOpenFailed: "无法打开默认浏览器：{0}",
        StartupFailed: "启动器启动失败：{0}",
        PortListSeparator: "、");

    private static readonly LauncherText English = new(
        LanguageSwitch: "中文",
        OpenApp: "Open App",
        SwitchPort: "Prefer 5173",
        StartService: "Start Service",
        StopService: "Stop Service",
        Exit: "Exit",
        StatusStarting: "● Starting…",
        StatusRunning: "● Running",
        StatusExternal: "● External Service",
        StatusStopping: "● Stopping…",
        StatusStopped: "● Stopped",
        StatusError: "● Failed",
        AddressPrefix: "Address: ",
        DetailPreparing: "Preparing the launcher…",
        DetailStarting: "Starting the local service by trying the last port, 5173, then 5174–5199…",
        DetailRunning: "The local service is running normally.",
        DetailRunningSwitched: "Port {0} was occupied, so the service switched to {1}.",
        DetailExistingService: "An existing service was detected and opened: {0}",
        DetailStopping: "Stopping the local service and releasing the port…",
        DetailStopped: "The service is stopped and the port has been released.",
        DetailClosing: "Stopping the service and exiting…",
        DetailStartCancelled: "Startup was cancelled.",
        DetailStartFailed: "Startup failed: {0}",
        DetailStopFailed: "Stop failed: {0}",
        DetailAllPortsOccupied: "Ports 5173–5199 are all occupied. The local service cannot start.",
        DetailSwitchSuccess: "Switched to http://127.0.0.1:5173. Browser data is not migrated automatically.",
        DetailSwitchOccupiedApp: "Port 5173 is used by another Sprite Light Lab service. The current service was kept running.",
        DetailSwitchOccupiedOther: "Port 5173 is used by another application. The current service was kept running.",
        DetailSwitchFailed: "Switch failed: {0}",
        TrayOpenLogs: "Open Log Folder",
        DialogSwitchTitle: "Switch Port",
        DialogSwitchMessage: "The current address is {0}.\r\n\r\nBrowser project data is bound to its port and will not migrate automatically to 5173.\r\nContinue?",
        DialogCannotSwitchTitle: "Cannot Switch",
        DialogSwitchFailedTitle: "Switch Failed",
        BrowserOpenFailed: "Unable to open the default browser: {0}",
        StartupFailed: "Launcher startup failed: {0}",
        PortListSeparator: ", ");

    public static LauncherText Get(LauncherLanguage language) =>
        language == LauncherLanguage.English ? English : Chinese;
}