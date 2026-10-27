!macro customUnInstall
  ; Updates replace the application tree, but preserve the external opt-in integration.
  ${ifNot} ${isUpdated}
    GetTempFileName $6
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    ${if} ${FileExists} "$INSTDIR\resources\uninstall-cli.cjs"
      nsExec::ExecToStack '"$INSTDIR\IeumDoc.exe" "$INSTDIR\resources\uninstall-cli.cjs" --uninstall "$6"'
      Pop $0
      Pop $1
      ; A GUI RunAsNode process may not expose stderr to nsExec; use the helper's own report.
      ClearErrors
      FileOpen $7 "$6" r
      ${ifNot} ${Errors}
        FileReadUTF16LE $7 $1
        FileClose $7
      ${endif}
      ${if} $1 == ""
        StrCpy $1 "Cleanup helper did not report details: $INSTDIR\resources\uninstall-cli.cjs"
      ${endif}
    ${else}
      StrCpy $0 "missing helper"
      StrCpy $1 "Cleanup helper is missing: $INSTDIR\resources\uninstall-cli.cjs"
    ${endif}
    Delete "$6"
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i.r2'
    ClearErrors
    ${if} $0 != 0
      ; Optional cleanup must not block application removal. Never delete untrusted files here.
      StrCpy $3 "IeumDoc CLI cleanup incomplete. App removal will continue.$\r$\nRemaining files or PATH entry may be at: $LOCALAPPDATA\IeumDoc\bin$\r$\nOpen Windows Environment Variables > User Path and remove only that bin entry. Inspect the bin files; preserve files whose ownership is uncertain.$\r$\nHelper result: $0$\r$\n$1"
      CreateDirectory "$LOCALAPPDATA\IeumDoc\uninstall-logs"
      ClearErrors
      GetTempFileName $2 "$LOCALAPPDATA\IeumDoc\uninstall-logs"
      ${if} ${Errors}
        GetTempFileName $2 "$TEMP"
      ${endif}
      ClearErrors
      FileOpen $4 "$2" w
      ${ifNot} ${Errors}
        FileWriteUTF16LE $4 "$3$\r$\n"
        FileClose $4
        StrCpy $3 "$3$\r$\nDiagnostic: $2"
      ${else}
        StrCpy $3 "$3$\r$\nThe diagnostic file could not be written."
      ${endif}
      DetailPrint "$3"
      ; electron-builder sets Silent even for interactive one-click uninstall; inspect /S itself.
      ${GetParameters} $4
      ClearErrors
      ${GetOptions} $4 "/S" $5
      ${if} ${Errors}
        SetSilent normal
        MessageBox MB_OK|MB_ICONEXCLAMATION "$3"
        SetSilent silent
      ${endif}
      ClearErrors
    ${endif}
  ${endif}
!macroend
