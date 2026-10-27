!macro customUnInstall
  ; Updates replace the application tree, but preserve the external opt-in integration.
  ${ifNot} ${isUpdated}
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    nsExec::ExecToStack '"$INSTDIR\IeumDoc.exe" "$INSTDIR\resources\uninstall-cli.cjs" --uninstall'
    Pop $0
    Pop $1
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", p 0) i.r2'
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
