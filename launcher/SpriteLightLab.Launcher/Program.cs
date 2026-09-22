using System.Globalization;

namespace SpriteLightLab.Launcher;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        try
        {
            using var singleInstance = new SingleInstance();
            var noBrowser = args.Any(argument =>
                argument.Equals("--no-browser", StringComparison.OrdinalIgnoreCase));

            if (!singleInstance.IsFirstInstance)
            {
                singleInstance.SignalFirstInstance(openBrowser: !noBrowser);
                return;
            }

            using var form = new LauncherForm(noBrowser);
            _ = form.Handle;
            singleInstance.ShowRequested += openBrowser =>
            {
                if (form.IsDisposed || !form.IsHandleCreated)
                {
                    return;
                }

                form.BeginInvoke(form.RestoreFromSecondInstance, openBrowser);
            };

            Application.Run(form);
        }
        catch (Exception exception)
        {
            AppLogger.Error("启动器发生未处理异常。", exception);
            var language = LauncherLanguageExtensions.Parse(new LauncherStateStore().Load().Language);
            var text = LauncherText.Get(language);
            MessageBox.Show(
                string.Format(CultureInfo.CurrentCulture, text.StartupFailed, exception.Message),
                AppConstants.ProductName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }
}