!macro customUnInstall
  ; Updates replace the application tree, but preserve the external opt-in integration.
  ${ifNot} ${isUpdated}
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    nsExec::ExecToStack '"$INSTDIR\IeumDoc.exe" "$INSTDIR\resources\uninstall-cli.cjs" --uninstall'
    Pop $0
    Pop $1
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i.r2'
    ${if} $0 != 0
      DetailPrint "IeumDoc CLI cleanup failed: $1"
      MessageBox MB_OK|MB_ICONSTOP "IeumDoc could not remove its command-line integration. Disable it in Settings and try uninstalling again.$\r$\n$1" /SD IDOK
      SetErrorLevel 1
      Abort
    ${endif}
  ${endif}
!macroend
