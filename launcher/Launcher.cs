// Station Announcement Maker launcher: starts app\sam_server.py with pythonw (no console),
// which opens the UI in a Microsoft Edge app window. Built by build.ps1 with the
// .NET Framework 4.8 csc.exe that ships with Windows.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Station Announcement Maker")]
[assembly: System.Reflection.AssemblyProduct("Station Announcement Maker")]
[assembly: System.Reflection.AssemblyCompany("Piscongentine")]
[assembly: System.Reflection.AssemblyCopyright("Piscongentine")]
[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.1.0.0")]

static class Launcher
{
    [STAThread]
    static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(root, "app", "sam_server.py");
        if (!File.Exists(script))
        {
            // allow the exe to sit in build\ next to the project
            string up = Path.GetFullPath(Path.Combine(root, "..", "app", "sam_server.py"));
            if (File.Exists(up)) { script = up; root = Path.GetFullPath(Path.Combine(root, "..")); }
        }
        if (!File.Exists(script))
        {
            MessageBox.Show("Can't find app\\sam_server.py next to this program.", "Station Announcement Maker",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
        string py = null;
        try
        {
            // written by Setup after it found (or installed) Python
            string rec = Path.Combine(root, "python.path");
            if (File.Exists(rec))
            {
                string p = File.ReadAllText(rec).Trim();
                if (File.Exists(p)) py = p;
            }
        }
        catch (IOException) { }
        if (py == null) py = FindPythonW();
        if (py == null)
        {
            MessageBox.Show("Python 3 is needed (python.org). pythonw.exe was not found.", "Station Announcement Maker",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 2;
        }
        var psi = new ProcessStartInfo(py, "\"" + script + "\"")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = root
        };
        if (py.EndsWith("pyw.exe", StringComparison.OrdinalIgnoreCase)) psi.Arguments = "-3 \"" + script + "\"";
        Process.Start(psi);
        return 0;
    }

    static string FromRegistry()
    {
        foreach (var hive in new[] { Microsoft.Win32.Registry.CurrentUser, Microsoft.Win32.Registry.LocalMachine })
        {
            for (int minor = 20; minor >= 8; minor--)
            {
                using (var k = hive.OpenSubKey(@"Software\Python\PythonCore\3." + minor + @"\InstallPath"))
                {
                    if (k == null) continue;
                    string w = k.GetValue("WindowedExecutablePath") as string;
                    if (string.IsNullOrEmpty(w)) { string d = k.GetValue("") as string; if (d != null) w = Path.Combine(d, "pythonw.exe"); }
                    if (!string.IsNullOrEmpty(w) && File.Exists(w)) return w;
                }
            }
        }
        return null;
    }

    static string FindPythonW()
    {
        string reg = FromRegistry();
        if (reg != null) return reg;
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (string dir in path.Split(';'))
        {
            try
            {
                if (dir.Trim().Length == 0 || dir.IndexOf("WindowsApps", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                string p = Path.Combine(dir.Trim(), "pythonw.exe");
                if (File.Exists(p)) return p;
            }
            catch (ArgumentException) { }
        }
        string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        string pyw = Path.Combine(win, "pyw.exe");
        if (File.Exists(pyw)) return pyw;
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        foreach (string v in new[] { "314", "313", "312", "311", "310" })
        {
            foreach (string p in new[] { @"C:\Python" + v + @"\pythonw.exe", Path.Combine(local, @"Programs\Python\Python" + v + @"\pythonw.exe") })
                if (File.Exists(p)) return p;
        }
        return null;
    }
}
