# CI only: read the composed Windows screen, including native caption controls.
# Input is JSON on stdin; no app settings, registry or display configuration changes.
$ErrorActionPreference = 'Stop'
$capture = [Console]::In.ReadToEnd() | ConvertFrom-Json
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class CaptionScreen {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hwnd, out Rect rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd, ref Point point);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("dwmapi.dll")] public static extern int DwmFlush();
}
'@
[void][CaptionScreen]::SetThreadDpiAwarenessContext([IntPtr](-4))
$hwnd = [IntPtr]([long]::Parse($capture.handle))
if ([CaptionScreen]::GetForegroundWindow() -ne $hwnd) { throw 'Test window must be foreground for screen pixels' }
$client = New-Object CaptionScreen+Rect
$origin = New-Object CaptionScreen+Point
if (-not [CaptionScreen]::GetClientRect($hwnd, [ref]$client) -or
    -not [CaptionScreen]::ClientToScreen($hwnd, [ref]$origin)) { throw 'Cannot locate test client on screen' }
$scale = ($client.Right - $client.Left) / $capture.width
if ([Math]::Abs(($client.Bottom - $client.Top) / $capture.height - $scale) -gt 0.01) {
    throw 'Client and renderer geometry disagree'
}
$cropX = [int][Math]::Floor(($capture.captionLeft - 16) * $scale)
$width = $client.Right - $client.Left - $cropX
$height = [int][Math]::Ceiling(($capture.bottom + 2) * $scale)
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    [void][CaptionScreen]::DwmFlush()
    $graphics.CopyFromScreen($origin.X + $cropX, $origin.Y, 0, 0, $bitmap.Size)
    $bitmap.Save($capture.output, [System.Drawing.Imaging.ImageFormat]::Png)
    # The center of the painted border, plus one reference outside native controls.
    $y = [int][Math]::Floor(($capture.bottom - $capture.border / 2) * $scale)
    $left = [int][Math]::Ceiling(($capture.captionLeft + 2) * $scale) - $cropX
    $right = [int][Math]::Floor(($capture.width - 2) * $scale) - $cropX
    if ($right - $left -lt 30) { throw 'No native caption span was sampled' }
    $expected = [string]::Join(',', $capture.rgb)
    $reference = $bitmap.GetPixel([int][Math]::Floor(($capture.captionLeft - 8) * $scale) - $cropX, $y)
    $mismatches = @()
    for ($x = $left; $x -lt $right; $x++) {
        $pixel = $bitmap.GetPixel($x, $y)
        if ("$($pixel.R),$($pixel.G),$($pixel.B)" -ne $expected) {
            $mismatches += [Math]::Floor(($x + $cropX) / $scale)
        }
    }
    [ordered]@{ scale = $scale; origin = @{ x = $origin.X; y = $origin.Y }; y = $y
        reference = @($reference.R, $reference.G, $reference.B)
        expected = $capture.rgb; sampled = $right - $left; mismatches = $mismatches
    } | ConvertTo-Json -Compress
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}
