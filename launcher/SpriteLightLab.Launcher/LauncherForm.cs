using System.Diagnostics;
using System.Globalization;
using System.Linq;
using System.Net.Sockets;

namespace SpriteLightLab.Launcher;

internal sealed class LauncherForm : Form
{
    private enum ServiceState
    {
        Starting,
        Running,
        External,
        Stopping,
        Stopped,
        Error,
    }

    private enum DetailKind
    {
        Preparing,
        Starting,
        Running,
        RunningSwitched,
        ExistingService,
        Stopping,
        Stopped,
        Closing,
        StartCancelled,
        StartFailed,
        StopFailed,
        AllPortsOccupied,
        SwitchSuccess,
        SwitchOccupiedApp,
        SwitchOccupiedOther,
        SwitchFailed,
    }

    private readonly bool _startBrowserOnLaunch;
    private readonly EmbeddedAssets _assets;
    private readonly LauncherStateStore _stateStore = new();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly SemaphoreSlim _operationGate = new(1, 1);
    private readonly Label _statusLabel;
    private readonly Label _urlLabel;
    private readonly Label _detailLabel;
    private readonly Button _languageButton;
    private readonly Button _openButton;
    private readonly Button _switchButton;
    private readonly Button _serviceButton;
    private readonly Button _exitButton;
    private readonly NotifyIcon _trayIcon;
    private readonly ToolStripMenuItem _trayOpenItem;
    private readonly ToolStripMenuItem _trayServiceItem;
    private readonly ToolStripMenuItem _trayLogItem;
    private readonly ToolStripMenuItem _trayExitItem;
    private readonly Icon _appIcon;
    private LauncherLanguage _language;
    private LauncherText _text;
    private StaticWebServer? _server;
    private int? _externalPort;
    private ServiceState _state = ServiceState.Stopped;
    private DetailKind _detailKind = DetailKind.Preparing;
    private object[] _detailArguments = [];
    private bool _busy;
    private bool _allowClose;
    private bool _closing;

    public LauncherForm(bool startBrowserOnLaunch)
    {
        _startBrowserOnLaunch = startBrowserOnLaunch;
        _assets = new EmbeddedAssets();
        var initialState = _stateStore.Load();
        _language = LauncherLanguageExtensions.Parse(initialState.Language);
        _text = LauncherText.Get(_language);

        Text = AppConstants.ProductName;
        ClientSize = new Size(500, 270);
        MinimumSize = new Size(516, 310);
        MaximumSize = new Size(516, 310);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

        _appIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        Icon = _appIcon;

        var titleLabel = new Label
        {
            Text = AppConstants.ProductName,
            Location = new Point(16, 12),
            Size = new Size(354, 28),
            Font = new Font(Font.FontFamily, 13F, FontStyle.Bold),
        };

        _languageButton = new Button
        {
            Location = new Point(388, 11),
            Size = new Size(96, 28),
            UseVisualStyleBackColor = true,
        };
        _languageButton.Click += (_, _) => ToggleLanguage();

        _statusLabel = new Label
        {
            Location = new Point(16, 48),
            Size = new Size(468, 24),
            Font = new Font(Font.FontFamily, 10.5F, FontStyle.Bold),
        };

        _urlLabel = new Label
        {
            Location = new Point(16, 76),
            Size = new Size(468, 22),
            AutoEllipsis = true,
        };

        _detailLabel = new Label
        {
            Location = new Point(16, 104),
            Size = new Size(468, 44),
            AutoEllipsis = true,
            ForeColor = Color.FromArgb(70, 70, 70),
        };

        _openButton = CreateButton();
        _switchButton = CreateButton();
        _serviceButton = CreateButton();
        _exitButton = CreateButton();

        _openButton.Click += async (_, _) => await OpenSiteAsync();
        _switchButton.Click += async (_, _) => await SwitchTo5173Async();
        _serviceButton.Click += async (_, _) => await ToggleServiceAsync();
        _exitButton.Click += (_, _) => Close();

        var buttonPanel = new FlowLayoutPanel
        {
            Location = new Point(16, 154),
            Size = new Size(468, 96),
            FlowDirection = FlowDirection.LeftToRight,
            WrapContents = true,
        };
        buttonPanel.Controls.AddRange([_openButton, _switchButton, _serviceButton, _exitButton]);

        Controls.AddRange([titleLabel, _languageButton, _statusLabel, _urlLabel, _detailLabel, buttonPanel]);

        _trayServiceItem = new ToolStripMenuItem();
        _trayServiceItem.Click += async (_, _) => await ToggleServiceAsync();

        _trayOpenItem = new ToolStripMenuItem();
        _trayOpenItem.Click += async (_, _) => await OpenSiteAsync();

        _trayLogItem = new ToolStripMenuItem();
        _trayLogItem.Click += (_, _) => OpenLogDirectory();

        _trayExitItem = new ToolStripMenuItem();
        _trayExitItem.Click += (_, _) => Close();

        var trayMenu = new ContextMenuStrip();
        trayMenu.Items.AddRange([
            _trayOpenItem,
            _trayServiceItem,
            _trayLogItem,
            new ToolStripSeparator(),
            _trayExitItem,
        ]);

        _trayIcon = new NotifyIcon
        {
            Text = AppConstants.ProductName,
            Icon = _appIcon,
            ContextMenuStrip = trayMenu,
            Visible = true,
        };
        _trayIcon.DoubleClick += async (_, _) => await OpenSiteAsync();

        Shown += async (_, _) => await StartInitialServiceAsync();
        FormClosing += OnFormClosing;
        UpdateUi();
    }

    public void RestoreFromSecondInstance(bool openBrowser)
    {
        if (WindowState == FormWindowState.Minimized)
        {
            WindowState = FormWindowState.Normal;
        }

        Show();
        Activate();
        BringToFront();
        if (openBrowser)
        {
            _ = OpenSiteAsync();
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _trayIcon.Visible = false;
            _trayIcon.Dispose();
            _operationGate.Dispose();
            _lifetime.Dispose();
            if (!ReferenceEquals(_appIcon, SystemIcons.Application))
            {
                _appIcon.Dispose();
            }
        }

        base.Dispose(disposing);
    }

    private static Button CreateButton()
    {
        return new Button
        {
            Size = new Size(228, 38),
            Margin = new Padding(2, 2, 2, 2),
            UseVisualStyleBackColor = true,
        };
    }

    private async Task StartInitialServiceAsync()
    {
        AppLogger.Info($"启动器界面已打开，版本 {AppConstants.ProductVersion}，语言 {_language.ToCode()}。");
        await StartServiceAsync(_startBrowserOnLaunch);
    }

    private async Task OpenSiteAsync()
    {
        if (_server?.IsRunning == true)
        {
            OpenBrowser(_server.BaseUrl);
            return;
        }

        if (_externalPort.HasValue)
        {
            OpenBrowser(AppConstants.BaseUrl(_externalPort.Value));
            return;
        }

        await StartServiceAsync(true);
    }

    private async Task ToggleServiceAsync()
    {
        if (_server?.IsRunning == true)
        {
            await StopServiceAsync();
        }
        else if (!_externalPort.HasValue)
        {
            await StartServiceAsync(true);
        }
    }

    private async Task StartServiceAsync(bool openBrowser)
    {
        await _operationGate.WaitAsync();
        try
        {
            if (_server?.IsRunning == true || _externalPort.HasValue)
            {
                if (openBrowser)
                {
                    OpenBrowser(_server?.BaseUrl ?? AppConstants.BaseUrl(_externalPort!.Value));
                }

                return;
            }

            _busy = true;
            SetState(ServiceState.Starting, DetailKind.Starting);

            var result = await PortManager.StartAsync(_assets, _stateStore, _lifetime.Token);
            switch (result.Status)
            {
                case PortStartStatus.Started:
                    _server = result.Server;
                    _externalPort = null;
                    if (result.OccupiedPorts.Count > 0)
                    {
                        SetState(ServiceState.Running, DetailKind.RunningSwitched, result.OccupiedPorts, result.Port!.Value);
                    }
                    else
                    {
                        SetState(ServiceState.Running, DetailKind.Running);
                    }

                    AppLogger.Info($"服务已就绪：{_server!.BaseUrl}");
                    if (openBrowser)
                    {
                        OpenBrowser(_server.BaseUrl);
                    }

                    break;

                case PortStartStatus.ExistingApplication:
                    _server = null;
                    _externalPort = result.Port;
                    SetState(ServiceState.External, DetailKind.ExistingService, AppConstants.BaseUrl(result.Port!.Value));
                    AppLogger.Info($"检测到已有服务：{AppConstants.BaseUrl(result.Port.Value)}");
                    if (openBrowser)
                    {
                        OpenBrowser(AppConstants.BaseUrl(result.Port.Value));
                    }

                    break;

                default:
                    if (result.Port.HasValue)
                    {
                        SetState(ServiceState.Error, DetailKind.StartFailed, result.Error ?? "Unknown error");
                    }
                    else
                    {
                        SetState(ServiceState.Error, DetailKind.AllPortsOccupied);
                    }

                    break;
            }
        }
        catch (OperationCanceledException)
        {
            SetState(ServiceState.Stopped, DetailKind.StartCancelled);
        }
        catch (Exception exception)
        {
            AppLogger.Error("启动本地服务失败。", exception);
            SetState(ServiceState.Error, DetailKind.StartFailed, exception.Message);
        }
        finally
        {
            _busy = false;
            UpdateUi();
            _operationGate.Release();
        }
    }

    private async Task StopServiceAsync()
    {
        await _operationGate.WaitAsync();
        try
        {
            _busy = true;
            SetState(ServiceState.Stopping, DetailKind.Stopping);
            if (_server is not null)
            {
                await _server.StopAsync();
                await _server.DisposeAsync();
                _server = null;
            }

            _externalPort = null;
            SetState(ServiceState.Stopped, DetailKind.Stopped);
            AppLogger.Info("启动器服务已停止。");
        }
        catch (Exception exception)
        {
            AppLogger.Error("停止本地服务失败。", exception);
            SetState(ServiceState.Error, DetailKind.StopFailed, exception.Message);
        }
        finally
        {
            _busy = false;
            UpdateUi();
            _operationGate.Release();
        }
    }

    private async Task SwitchTo5173Async()
    {
        if (_server is null || !_server.IsRunning || _server.Port == AppConstants.FirstPort)
        {
            return;
        }

        var confirmation = MessageBox.Show(
            string.Format(CultureInfo.CurrentCulture, _text.DialogSwitchMessage, _server.BaseUrl),
            _text.DialogSwitchTitle,
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (confirmation != DialogResult.Yes)
        {
            return;
        }

        await _operationGate.WaitAsync();
        try
        {
            _busy = true;
            UpdateUi();

            var replacement = new StaticWebServer(_assets);
            try
            {
                replacement.Start(AppConstants.FirstPort);
            }
            catch (SocketException exception) when (exception.SocketErrorCode == SocketError.AddressAlreadyInUse)
            {
                await replacement.DisposeAsync();
                var occupiedException = await PortManager.IsSpriteLightLabAsync(AppConstants.FirstPort, _lifetime.Token);
                var detail = occupiedException ? DetailKind.SwitchOccupiedApp : DetailKind.SwitchOccupiedOther;
                SetState(ServiceState.Running, detail);
                MessageBox.Show(FormatDetail(), _text.DialogCannotSwitchTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var previousServer = _server;
            _server = replacement;
            if (previousServer is not null)
            {
                await previousServer.StopAsync();
                await previousServer.DisposeAsync();
            }

            _stateStore.Save(AppConstants.FirstPort, _language);
            SetState(ServiceState.Running, DetailKind.SwitchSuccess);
            AppLogger.Info("已优先切回端口 5173。");
        }
        catch (Exception exception)
        {
            AppLogger.Error("切换端口 5173 失败。", exception);
            if (_server?.IsRunning == true)
            {
                SetState(ServiceState.Running, DetailKind.SwitchFailed, exception.Message);
            }
            else
            {
                SetState(ServiceState.Error, DetailKind.SwitchFailed, exception.Message);
            }

            MessageBox.Show(FormatDetail(), _text.DialogSwitchFailedTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _busy = false;
            UpdateUi();
            _operationGate.Release();
        }
    }

    private async void OnFormClosing(object? sender, FormClosingEventArgs eventArgs)
    {
        if (_allowClose)
        {
            return;
        }

        eventArgs.Cancel = true;
        if (_closing)
        {
            return;
        }

        _closing = true;
        _lifetime.Cancel();
        await _operationGate.WaitAsync();
        try
        {
            _busy = true;
            SetState(ServiceState.Stopping, DetailKind.Closing);
            if (_server is not null)
            {
                await _server.StopAsync();
                await _server.DisposeAsync();
                _server = null;
            }

            AppLogger.Info("启动器正在退出。");
        }
        catch (Exception exception)
        {
            AppLogger.Error("退出清理失败。", exception);
        }
        finally
        {
            _busy = false;
            UpdateUi();
            _operationGate.Release();
            _trayIcon.Visible = false;
            _allowClose = true;
            Close();
        }
    }

    private void ToggleLanguage()
    {
        _language = _language == LauncherLanguage.Chinese
            ? LauncherLanguage.English
            : LauncherLanguage.Chinese;
        _text = LauncherText.Get(_language);

        var preferredPort = _server?.Port ?? _externalPort ?? _stateStore.Load().LastPort ?? AppConstants.FirstPort;
        _stateStore.Save(preferredPort, _language);
        UpdateUi();
    }

    private void OpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            AppLogger.Info($"已请求打开浏览器：{url}");
        }
        catch (Exception exception)
        {
            AppLogger.Error($"打开浏览器失败：{url}", exception);
            MessageBox.Show(
                string.Format(CultureInfo.CurrentCulture, _text.BrowserOpenFailed, exception.Message),
                AppConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
        }
    }

    private static void OpenLogDirectory()
    {
        try
        {
            Directory.CreateDirectory(AppConstants.LogDirectory);
            Process.Start(new ProcessStartInfo(AppConstants.LogDirectory) { UseShellExecute = true });
        }
        catch (Exception exception)
        {
            AppLogger.Error("打开日志目录失败。", exception);
        }
    }

    private void SetState(ServiceState state, DetailKind detail, params object[] arguments)
    {
        _state = state;
        _detailKind = detail;
        _detailArguments = arguments;
        UpdateUi();
    }

    private string FormatDetail()
    {
        return _detailKind switch
        {
            DetailKind.Preparing => _text.DetailPreparing,
            DetailKind.Starting => _text.DetailStarting,
            DetailKind.Running => _text.DetailRunning,
            DetailKind.RunningSwitched => string.Format(
                CultureInfo.CurrentCulture,
                _text.DetailRunningSwitched,
                FormatPorts((IReadOnlyList<int>)_detailArguments[0]),
                FormatPort((int)_detailArguments[1])),
            DetailKind.ExistingService => string.Format(
                CultureInfo.CurrentCulture,
                _text.DetailExistingService,
                _detailArguments[0]),
            DetailKind.Stopping => _text.DetailStopping,
            DetailKind.Stopped => _text.DetailStopped,
            DetailKind.Closing => _text.DetailClosing,
            DetailKind.StartCancelled => _text.DetailStartCancelled,
            DetailKind.StartFailed => string.Format(
                CultureInfo.CurrentCulture,
                _text.DetailStartFailed,
                _detailArguments[0]),
            DetailKind.StopFailed => string.Format(
                CultureInfo.CurrentCulture,
                _text.DetailStopFailed,
                _detailArguments[0]),
            DetailKind.AllPortsOccupied => _text.DetailAllPortsOccupied,
            DetailKind.SwitchSuccess => _text.DetailSwitchSuccess,
            DetailKind.SwitchOccupiedApp => _text.DetailSwitchOccupiedApp,
            DetailKind.SwitchOccupiedOther => _text.DetailSwitchOccupiedOther,
            DetailKind.SwitchFailed => string.Format(
                CultureInfo.CurrentCulture,
                _text.DetailSwitchFailed,
                _detailArguments[0]),
            _ => string.Empty,
        };
    }

    private string FormatPorts(IReadOnlyList<int> ports) =>
        string.Join(_text.PortListSeparator, ports.Select(FormatPort));

    private static string FormatPort(int port) =>
        port.ToString(CultureInfo.InvariantCulture);

    private void UpdateUi()
    {
        _languageButton.Text = _text.LanguageSwitch;
        _statusLabel.Text = _state switch
        {
            ServiceState.Starting => _text.StatusStarting,
            ServiceState.Running => _text.StatusRunning,
            ServiceState.External => _text.StatusExternal,
            ServiceState.Stopping => _text.StatusStopping,
            ServiceState.Stopped => _text.StatusStopped,
            ServiceState.Error => _text.StatusError,
            _ => _text.StatusError,
        };
        _statusLabel.ForeColor = _state switch
        {
            ServiceState.Running => Color.FromArgb(25, 135, 84),
            ServiceState.Starting or ServiceState.Stopping => Color.FromArgb(180, 110, 0),
            ServiceState.Error => Color.FromArgb(190, 35, 35),
            ServiceState.External => Color.FromArgb(110, 70, 180),
            _ => Color.FromArgb(90, 90, 90),
        };

        var activePort = _server?.Port ?? _externalPort;
        _urlLabel.Text = activePort.HasValue
            ? $"{_text.AddressPrefix}{AppConstants.BaseUrl(activePort.Value)}"
            : $"{_text.AddressPrefix}--";
        _detailLabel.Text = FormatDetail();

        _openButton.Text = _text.OpenApp;
        _switchButton.Text = _text.SwitchPort;
        _serviceButton.Text = _server?.IsRunning == true ? _text.StopService : _text.StartService;
        _exitButton.Text = _text.Exit;
        _trayOpenItem.Text = _text.OpenApp;
        _trayServiceItem.Text = _serviceButton.Text;
        _trayLogItem.Text = _text.TrayOpenLogs;
        _trayExitItem.Text = _text.Exit;

        _languageButton.Enabled = !_busy;
        _openButton.Enabled = !_busy;
        _switchButton.Enabled = !_busy && _server?.IsRunning == true && _server.Port != AppConstants.FirstPort;
        _serviceButton.Enabled = !_busy && !_externalPort.HasValue;
        _exitButton.Enabled = !_busy;
        _trayServiceItem.Enabled = _serviceButton.Enabled;
    }
}