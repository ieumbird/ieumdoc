param([int]$UninstallerPid)
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class Dialogs {
  public delegate bool Visitor(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Visitor v, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, Visitor v, IntPtr p);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static string Text(IntPtr h) { var s = new StringBuilder(8192); GetWindowText(h,s,s.Capacity); return s.ToString(); }
}
'@
$deadline = [DateTime]::UtcNow.AddSeconds(45)
$seen = [Collections.Generic.HashSet[string]]::new()
while (Get-Process -Id $UninstallerPid -ErrorAction SilentlyContinue) {
  if ([DateTime]::UtcNow -gt $deadline) { throw 'Owned uninstaller did not complete.' }
  [Dialogs]::EnumWindows({ param($window, $unused)
    [uint32]$ownerPid = 0
    [void][Dialogs]::GetWindowThreadProcessId($window, [ref]$ownerPid)
    if ($ownerPid -eq $UninstallerPid) {
      $script:dialogText = [Dialogs]::Text($window)
      [void][Dialogs]::EnumChildWindows($window, { param($control, $unusedChild)
        $script:dialogText += "`n" + [Dialogs]::Text($control)
        return $true
      }, [IntPtr]::Zero)
      $ok = [Dialogs]::GetDlgItem($window, 1)
      if ($ok -ne [IntPtr]::Zero -and [Dialogs]::Text($ok) -match '^&?OK$') {
        if ($seen.Add($script:dialogText)) { Write-Host $script:dialogText }
        # Send the enabled button's standard BN_CLICKED notification to its own dialog.
        # BM_CLICK requires activation; this NSIS MessageBox exposes no UIA InvokePattern.
        if ([Dialogs]::IsWindowEnabled($ok) -and [Dialogs]::IsWindowVisible($ok)) {
          Write-Host "Sending owned OK command: $window"
          if (-not [Dialogs]::PostMessage($window, 0x0111, [IntPtr]1, $ok)) {
            throw 'Could not send the owned dialog command.'
          }
        }
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  Start-Sleep -Milliseconds 100
}
