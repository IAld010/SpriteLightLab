namespace SpriteLightLab.Launcher;

internal sealed class SingleInstance : IDisposable
{
    private const string ShowWithoutBrowserEventName = @"Local\SpriteLightLab.Launcher.ShowWithoutBrowser";
    private readonly Mutex _mutex;
    private readonly EventWaitHandle _showEvent;
    private readonly EventWaitHandle _showWithoutBrowserEvent;
    private readonly ManualResetEvent _stopEvent = new(false);
    private readonly bool _ownsMutex;
    private Thread? _listenerThread;
    private bool _disposed;

    public SingleInstance()
    {
        _mutex = new Mutex(true, AppConstants.MutexName, out var createdNew);
        _ownsMutex = createdNew;
        IsFirstInstance = createdNew;

        if (createdNew)
        {
            _showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, AppConstants.ShowEventName);
            _showWithoutBrowserEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowWithoutBrowserEventName);
            _listenerThread = new Thread(ListenForShowRequests)
            {
                IsBackground = true,
                Name = "SpriteLightLab.ShowListener",
            };
            _listenerThread.Start();
        }
        else
        {
            _showEvent = EventWaitHandle.OpenExisting(AppConstants.ShowEventName);
            _showWithoutBrowserEvent = EventWaitHandle.OpenExisting(ShowWithoutBrowserEventName);
        }
    }

    public bool IsFirstInstance { get; }
    public event Action<bool>? ShowRequested;

    public void SignalFirstInstance(bool openBrowser)
    {
        try
        {
            if (openBrowser)
            {
                _showEvent.Set();
            }
            else
            {
                _showWithoutBrowserEvent.Set();
            }
        }
        catch (Exception exception)
        {
            AppLogger.Error("通知已有启动器窗口失败。", exception);
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        _stopEvent.Set();
        if (_listenerThread is not null && _listenerThread.IsAlive)
        {
            _listenerThread.Join(TimeSpan.FromSeconds(1));
        }

        _showEvent.Dispose();
        _showWithoutBrowserEvent.Dispose();
        _stopEvent.Dispose();
        if (_ownsMutex)
        {
            try
            {
                _mutex.ReleaseMutex();
            }
            catch (ApplicationException)
            {
            }
        }

        _mutex.Dispose();
    }

    private void ListenForShowRequests()
    {
        var handles = new WaitHandle[] { _showEvent, _showWithoutBrowserEvent, _stopEvent };
        while (!_disposed)
        {
            var signal = WaitHandle.WaitAny(handles);
            if (signal == 0)
            {
                ShowRequested?.Invoke(true);
            }
            else if (signal == 1)
            {
                ShowRequested?.Invoke(false);
            }
            else
            {
                return;
            }
        }
    }
}