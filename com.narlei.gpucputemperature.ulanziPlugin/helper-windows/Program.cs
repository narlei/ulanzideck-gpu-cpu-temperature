// thermal (Windows) — reads CPU/GPU temperature sensors via
// LibreHardwareMonitorLib (the library behind HWiNFO/OpenHardwareMonitor)
// and prints one line per sensor as "<domain> <name>\t<celsius>", where
// <domain> is "CPU" or "GPU" — pre-classified here since Windows hardware
// enumeration already tells us the hardware type, unlike the macOS helper
// which has to guess from opaque sensor names.
//
// IMPORTANT: reading CPU package temperature (and some GPU sensors) requires
// the WinRing0 kernel driver that LibreHardwareMonitorLib loads on demand,
// which in turn requires the process to run elevated (Administrator). If not
// elevated, CPU sensors typically come back empty/null and this helper will
// simply print nothing for CPU — the plugin then shows "N/A" for that key.
//
// Build (self-contained single file):
//   dotnet publish -c Release -r win-x64  --self-contained true -p:PublishSingleFile=true
//   dotnet publish -c Release -r win-arm64 --self-contained true -p:PublishSingleFile=true

using LibreHardwareMonitor.Hardware;

var computer = new Computer
{
    IsCpuEnabled = true,
    IsGpuEnabled = true,
};

try
{
    computer.Open();
    computer.Accept(new UpdateVisitor());

    var sb = new System.Text.StringBuilder();
    foreach (var hardware in computer.Hardware) PrintTemps(hardware, sb);

    if (sb.Length == 0)
    {
        Console.Error.WriteLine("thermal: no sensor readings (try running Ulanzi Studio as Administrator)");
        Environment.Exit(1);
    }

    Console.Out.Write(sb.ToString());
}
finally
{
    computer.Close();
}

static bool IsCpu(HardwareType t) => t == HardwareType.Cpu;

static bool IsGpu(HardwareType t) =>
    t == HardwareType.GpuNvidia || t == HardwareType.GpuAmd || t == HardwareType.GpuIntel;

static void PrintTemps(IHardware hardware, System.Text.StringBuilder sb)
{
    var domain = IsCpu(hardware.HardwareType) ? "CPU" : IsGpu(hardware.HardwareType) ? "GPU" : null;
    if (domain != null)
    {
        foreach (var sensor in hardware.Sensors)
        {
            if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue && sensor.Value.Value > 0)
            {
                sb.Append(domain).Append(' ').Append(sensor.Name)
                  .Append('\t').Append(sensor.Value.Value.ToString("F2"))
                  .Append('\n');
            }
        }
    }
    foreach (var sub in hardware.SubHardware) PrintTemps(sub, sb);
}
