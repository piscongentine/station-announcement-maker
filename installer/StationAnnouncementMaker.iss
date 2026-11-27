; Station Announcement Maker - Inno Setup 6.7 script (Midnight Rail dark wizard, animated requirements check,
; automatic per-user Python install when it is missing).
; Build: build-setup.ps1   (or "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" installer\StationAnnouncementMaker.iss)

#define AppName "Station Announcement Maker"
#define AppVersion "1.1.6"
#define AppExe "Station Announcement Maker.exe"
#define Publisher "Piscongentine"
#define RepoUrl "https://github.com/piscongentine/station-announcement-maker"
#define PyVer "3.14.6"
#define PyUrl "https://www.python.org/ftp/python/3.14.6/python-3.14.6-amd64.exe"

[Setup]
AppId={{B7E2C4A1-5D3F-4F8A-9E21-5A3C0D5A7A10}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#Publisher}
AppPublisherURL={#RepoUrl}
AppSupportURL={#RepoUrl}/issues
AppUpdatesURL={#RepoUrl}/releases
AppContact=shwetpurwar0911@gmail.com
AppCopyright=(c) 2026 {#Publisher} - part of UTILITY TOOLS
VersionInfoVersion={#AppVersion}.0
VersionInfoCompany={#Publisher}
VersionInfoDescription={#AppName} Setup
VersionInfoProductName={#AppName}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist
OutputBaseFilename=Station-Announcement-Maker-Setup-{#AppVersion}
SetupIconFile=..\assets\app.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
LicenseFile=..\LICENSE.txt
WizardStyle=modern dark
WizardBackColor=#0F172A
WizardImageFile=wizard.bmp,wizard@2x.bmp
WizardSmallImageFile=wizard-small.bmp,wizard-small@2x.bmp
Compression=lzma2/ultra
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableDirPage=no
UsePreviousAppDir=yes
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
WelcomeLabel1=Welcome to [name]
WelcomeLabel2=This installs [name/ver] on your computer.%n%nTurn any recording into a ready-to-place station announcement for MSTS, TSRE5 and Open Rails: a 16-bit PCM WAV, a matching .sms and the ssource.dat entry, written straight into your route.%n%nSetup checks this PC first and installs anything that is missing.%n%nPart of UTILITY TOOLS  ·  by Piscongentine  ·  Made in Bharat
FinishedLabel=[name] is installed.%n%nFound a problem? Use "Report on GitHub" or "Email the developer" on the app's About tab.

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"

[Files]
Source: "..\{#AppExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\app\*.py"; DestDir: "{app}\app"; Flags: ignoreversion
Source: "..\ui\*"; DestDir: "{app}\ui"; Flags: ignoreversion recursesubdirs; Excludes: "_testdata\*"
Source: "..\assets\app.ico"; DestDir: "{app}\assets"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; Comment: "Station announcements for MSTS / TSRE5 / Open Rails"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\python.path"
Type: filesandordirs; Name: "{app}\app\__pycache__"

[Code]
const
  NROWS = 6;
  CLR_OK = $81B910;     // #10B981
  CLR_WARN = $0B9EF5;   // #F59E0B
  CLR_FAIL = $5E3FF4;   // #F43F5E
  CLR_INFO = $FAA560;   // #60A5FA
  CLR_DIM = $8B7464;    // #64748B

function SetTimer(hWnd, nIDEvent, uElapse, lpTimerFunc: LongWord): LongWord; external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd, nIDEvent: LongWord): BOOL; external 'KillTimer@user32.dll stdcall';
function GetSystemMetrics(index: Integer): Integer; external 'GetSystemMetrics@user32.dll stdcall';
function waveOutGetNumDevs(): Cardinal; external 'waveOutGetNumDevs@winmm.dll stdcall';

var
  ReqPage: TWizardPage;
  DownloadPage: TDownloadWizardPage;
  RowIcon, RowName, RowDetail: array[0..5] of TNewStaticText;
  RowState: array[0..5] of Integer;   // 0 ok, 1 warning, 2 blocks, 3 will be installed
  RowText: array[0..5] of String;
  Bar: TNewProgressBar;
  Summary: TNewStaticText;
  PyCheck: TNewCheckBox;
  AnimStep: Integer;
  TimerID: LongWord;
  PythonW, PyFound, EdgeExe, OrRoot: String;
  NeedPython, Blocked: Boolean;

// ---------------------------------------------------------------- detection
function PyFromKey(RootKey: Integer; Key: String; var W: String): Boolean;
var D: String;
begin
  Result := False;
  if RegQueryStringValue(RootKey, Key, 'WindowedExecutablePath', W) and FileExists(W) then begin Result := True; exit; end;
  if RegQueryStringValue(RootKey, Key, '', D) then
  begin
    W := AddBackslash(D) + 'pythonw.exe';
    Result := FileExists(W);
  end;
end;

function PythonWorks(W: String): Boolean;
var Code: Integer;
begin
  Result := Exec(ExtractFilePath(W) + 'python.exe', '-c "import tkinter, http.server, json, urllib.request"', '',
                 SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

function DetectPython(): Boolean;
var M: Integer; Key, W: String;
begin
  Result := False; PythonW := ''; PyFound := '';
  for M := 20 downto 8 do
  begin
    Key := 'Software\Python\PythonCore\3.' + IntToStr(M) + '\InstallPath';
    if PyFromKey(HKCU, Key, W) or (IsWin64 and PyFromKey(HKLM64, Key, W)) or PyFromKey(HKLM32, Key, W) then
      if PythonWorks(W) then
      begin
        PythonW := W; PyFound := '3.' + IntToStr(M); Result := True; exit;
      end;
  end;
  for M := 20 downto 8 do  // plain folder installs that never registered themselves
  begin
    W := 'C:\Python3' + IntToStr(M) + '\pythonw.exe';
    if FileExists(W) and PythonWorks(W) then begin PythonW := W; PyFound := '3.' + IntToStr(M); Result := True; exit; end;
    W := ExpandConstant('{localappdata}\Programs\Python\Python3') + IntToStr(M) + '\pythonw.exe';
    if FileExists(W) and PythonWorks(W) then begin PythonW := W; PyFound := '3.' + IntToStr(M); Result := True; exit; end;
  end;
end;

function FindEdge(): String;
begin
  Result := '';
  if not RegQueryStringValue(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe', '', Result) then
    RegQueryStringValue(HKCU, 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe', '', Result);
  if (Result <> '') and not FileExists(Result) then Result := '';
  if Result = '' then
    if FileExists(ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe')) then
      Result := ExpandConstant('{commonpf32}\Microsoft\Edge\Application\msedge.exe');
end;

function FindOrRoot(): String;
var I: Integer; C: array[0..3] of String;
begin
  C[0] := 'C:\OR'; C[1] := 'C:\MSTS'; C[2] := ExpandConstant('{commonpf32}\Microsoft Games\Train Simulator'); C[3] := 'C:\Train Simulator';
  Result := '';
  for I := 0 to 3 do
    if DirExists(C[I] + '\ROUTES') then begin Result := C[I]; exit; end;
end;

procedure SetRow(I, State: Integer; Name, Detail: String);
begin
  RowState[I] := State; RowText[I] := Detail; RowName[I].Caption := Name;
  Log(Format('Check %s: state %d - %s', [Name, State, Detail]));
end;

procedure RunChecks();
var V: TWindowsVersion; W, H: Integer;
begin
  Blocked := False;
  GetWindowsVersionEx(V);
  if V.Major >= 10 then SetRow(0, 0, 'Windows', Format('Windows %d build %d  -  OK', [V.Major, V.Build]))
  else begin SetRow(0, 2, 'Windows', 'needs Windows 10 or 11'); Blocked := True; end;

  EdgeExe := FindEdge();
  if EdgeExe <> '' then SetRow(1, 0, 'Microsoft Edge', 'found  -  runs the app window and the audio converter')
  else begin SetRow(1, 2, 'Microsoft Edge', 'not found  -  install it from microsoft.com/edge, then run Setup again'); Blocked := True; end;

  NeedPython := not DetectPython();
  if ExpandConstant('{param:SimulateNoPython|0}') = '1' then begin NeedPython := True; PythonW := ''; end;  // testing only
  if not NeedPython then SetRow(2, 0, 'Python 3 with Tk', 'Python ' + PyFound + ' found  -  ' + PythonW)
  else if IsWin64 then SetRow(2, 3, 'Python 3 with Tk', 'missing  -  Python {#PyVer} will be downloaded from python.org (about 30 MB) and installed for you')
  else begin SetRow(2, 2, 'Python 3 with Tk', 'missing  -  install Python 3 from python.org, then run Setup again'); Blocked := True; end;

  W := GetSystemMetrics(0); H := GetSystemMetrics(1);
  if (W >= 1280) and (H >= 720) then SetRow(3, 0, 'Screen', Format('%d x %d', [W, H]))
  else SetRow(3, 1, 'Screen', Format('%d x %d  -  1280 x 720 or more recommended', [W, H]));

  if waveOutGetNumDevs() > 0 then SetRow(4, 0, 'Sound output', 'found  -  for previewing announcements')
  else SetRow(4, 1, 'Sound output', 'none found  -  everything works, but you can''t preview audio');

  OrRoot := FindOrRoot();
  if OrRoot <> '' then SetRow(5, 0, 'MSTS / Open Rails folder', OrRoot + '  -  you can pick it on first start')
  else SetRow(5, 1, 'MSTS / Open Rails folder', 'not found in the usual places  -  choose it in the app (optional)');
end;

// ---------------------------------------------------------------- animated page
procedure ShowRow(I: Integer);
begin
  case RowState[I] of
    0: begin RowIcon[I].Caption := #$2714; RowIcon[I].Font.Color := CLR_OK; end;
    1: begin RowIcon[I].Caption := '!'; RowIcon[I].Font.Color := CLR_WARN; end;
    2: begin RowIcon[I].Caption := #$2716; RowIcon[I].Font.Color := CLR_FAIL; end;
    3: begin RowIcon[I].Caption := #$2B07; RowIcon[I].Font.Color := CLR_INFO; end;
  end;
  RowDetail[I].Caption := RowText[I];
  RowDetail[I].Font.Color := $F0E8E2;  // #E2E8F0 (app text colour)
  if RowState[I] = 2 then RowDetail[I].Font.Color := CLR_FAIL;
  if RowState[I] = 3 then RowDetail[I].Font.Color := CLR_INFO;
end;

procedure FinishAnimation();
begin
  if TimerID <> 0 then begin KillTimer(0, TimerID); TimerID := 0; end;
  Bar.Position := 100;
  if Blocked then
  begin
    Summary.Caption := #$2716 + '  This PC is missing something Setup can''t install. See the red line above.';
    Summary.Font.Color := CLR_FAIL;
  end
  else if NeedPython then
  begin
    Summary.Caption := #$2B07 + '  Almost ready: Python will be installed automatically before the app.';
    Summary.Font.Color := CLR_INFO;
    PyCheck.Visible := True;
  end
  else
  begin
    Summary.Caption := #$2714 + '  All set. This PC has everything Station Announcement Maker needs.';
    Summary.Font.Color := CLR_OK;
  end;
  Summary.Visible := True;
  WizardForm.NextButton.Enabled := True;
end;

procedure TimerTick(Wnd: LongWord; Msg: LongWord; IdEvent: LongWord; Time: LongWord);
var I: Integer;
begin
  AnimStep := AnimStep + 1;
  // spinner on the row being checked
  if (AnimStep mod 2 = 1) and ((AnimStep div 2) < NROWS) then
  begin
    I := AnimStep div 2;
    RowIcon[I].Caption := #$25CC; RowIcon[I].Font.Color := CLR_INFO;
    RowDetail[I].Caption := 'checking...';
  end
  else if (AnimStep mod 2 = 0) and ((AnimStep div 2 - 1) < NROWS) then
    ShowRow(AnimStep div 2 - 1);
  Bar.Position := (AnimStep * 100) div (NROWS * 2);
  if AnimStep >= NROWS * 2 then FinishAnimation();
end;

procedure StartAnimation();
var I: Integer;
begin
  for I := 0 to NROWS - 1 do
  begin
    RowIcon[I].Caption := #$25CB; RowIcon[I].Font.Color := CLR_DIM;
    RowDetail[I].Caption := 'waiting'; RowDetail[I].Font.Color := CLR_DIM;
  end;
  Summary.Visible := False; PyCheck.Visible := False; Bar.Position := 0; AnimStep := 0;
  WizardForm.NextButton.Enabled := False;
  if TimerID <> 0 then KillTimer(0, TimerID);
  TimerID := SetTimer(0, 0, 170, CreateCallback(@TimerTick));
end;

procedure InitializeWizard();
var I, Y: Integer;
begin
  ReqPage := CreateCustomPage(wpLicense, 'Checking this PC', 'Setup checks what Station Announcement Maker needs and installs anything that is missing.');
  Bar := TNewProgressBar.Create(ReqPage);
  Bar.Parent := ReqPage.Surface; Bar.Left := 0; Bar.Top := 0; Bar.Width := ReqPage.SurfaceWidth; Bar.Height := ScaleY(6);
  Bar.Min := 0; Bar.Max := 100;
  Y := ScaleY(18);
  for I := 0 to NROWS - 1 do
  begin
    RowIcon[I] := TNewStaticText.Create(ReqPage);
    RowIcon[I].Parent := ReqPage.Surface; RowIcon[I].Left := 0; RowIcon[I].Top := Y; RowIcon[I].Font.Size := 12; RowIcon[I].Font.Style := [fsBold];
    RowIcon[I].StyleElements := [seClient, seBorder];  // keep our own green / amber / red under the dark style
    RowName[I] := TNewStaticText.Create(ReqPage);
    RowName[I].Parent := ReqPage.Surface; RowName[I].Left := ScaleX(26); RowName[I].Top := Y + ScaleY(1); RowName[I].Font.Style := [fsBold];
    RowDetail[I] := TNewStaticText.Create(ReqPage);
    RowDetail[I].Parent := ReqPage.Surface; RowDetail[I].Left := ScaleX(26); RowDetail[I].Top := Y + ScaleY(17);
    RowDetail[I].AutoSize := False; RowDetail[I].Width := ReqPage.SurfaceWidth - ScaleX(26); RowDetail[I].Height := ScaleY(15);
    RowDetail[I].StyleElements := [seClient, seBorder];
    Y := Y + ScaleY(36);
  end;
  Summary := TNewStaticText.Create(ReqPage);
  Summary.Parent := ReqPage.Surface; Summary.Left := 0; Summary.Top := Y + ScaleY(2); Summary.Font.Style := [fsBold];
  Summary.AutoSize := False; Summary.Width := ReqPage.SurfaceWidth; Summary.Height := ScaleY(16);
  Summary.StyleElements := [seClient, seBorder];
  PyCheck := TNewCheckBox.Create(ReqPage);
  PyCheck.Parent := ReqPage.Surface; PyCheck.Left := 0; PyCheck.Top := Y + ScaleY(22); PyCheck.Width := ReqPage.SurfaceWidth; PyCheck.Height := ScaleY(18);
  PyCheck.Caption := 'Download and install Python {#PyVer} (python.org, signed, current user only)';
  PyCheck.Checked := True; PyCheck.Visible := False;

  DownloadPage := CreateDownloadPage('Installing Python', 'Station Announcement Maker needs Python 3 - getting it from python.org.', nil);
  DownloadPage.ShowBaseNameInsteadOfUrl := True;
  RunChecks();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = ReqPage.ID then
  begin
    RunChecks();
    if not WizardSilent then StartAnimation();
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  Log(Format('NextButtonClick page %d (req page %d) blocked=%d needpy=%d', [CurPageID, ReqPage.ID, Ord(Blocked), Ord(NeedPython)]));
  if CurPageID = ReqPage.ID then
  begin
    if Blocked then
    begin
      MsgBox('Station Announcement Maker can''t be installed until the item marked with a red cross is fixed.', mbCriticalError, MB_OK);
      Result := False;
    end
    else if NeedPython and not PyCheck.Checked then
    begin
      MsgBox('Python 3 is needed. Tick the box to let Setup install it, or install Python 3 from python.org (with "tcl/tk") and run Setup again.', mbInformation, MB_OK);
      Result := False;
    end;
  end;
end;

function UpdateReadyMemo(Space, NewLine, MemoUserInfoInfo, MemoDirInfo, MemoTypeInfo, MemoComponentsInfo, MemoGroupInfo, MemoTasksInfo: String): String;
begin
  Result := MemoDirInfo + NewLine + NewLine;
  if MemoTasksInfo <> '' then Result := Result + MemoTasksInfo + NewLine + NewLine;
  Result := Result + 'Requirements:' + NewLine;
  if NeedPython then
    Result := Result + Space + 'Python {#PyVer} will be downloaded from python.org (about 30 MB) and installed for the current user' + NewLine
  else
    Result := Result + Space + 'Python ' + PyFound + ': ' + PythonW + NewLine;
  Result := Result + Space + 'Microsoft Edge: ' + EdgeExe + NewLine;
  Result := Result + NewLine + 'Your settings are kept in %LOCALAPPDATA%\StationAnnouncementMaker.';
end;

function SignatureOk(F: String): Boolean;
var Code: Integer;
begin
  Result := Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "$s = Get-AuthenticodeSignature -LiteralPath ''' + F + '''; ' +
    'if ($s.Status -eq ''Valid'' -and $s.SignerCertificate.Subject -match ''Python Software Foundation'') { exit 0 } else { exit 1 }"',
    '', SW_HIDE, ewWaitUntilTerminated, Code) and (Code = 0);
end;

function InstallPython(): String;
var Code: Integer; F: String;
begin
  Result := '';
  DownloadPage.Clear;
  DownloadPage.Add('{#PyUrl}', 'python-{#PyVer}-amd64.exe', '');
  DownloadPage.Show;
  try
    try
      DownloadPage.Download;
      F := ExpandConstant('{tmp}\python-{#PyVer}-amd64.exe');
      DownloadPage.SetText('Checking the download...', 'Verifying the Python Software Foundation signature.');
      if not SignatureOk(F) then
      begin
        Result := 'The downloaded Python installer is not signed by the Python Software Foundation, so it was not run. Install Python 3 from python.org yourself and run Setup again.';
        exit;
      end;
      DownloadPage.SetText('Installing Python {#PyVer}...', 'This takes about a minute. No administrator rights are needed.');
      DownloadPage.ProgressBar.Style := npbstMarquee;
      Exec(F, '/quiet InstallAllUsers=0 InstallLauncherAllUsers=0 PrependPath=1 Include_tcltk=1 Include_launcher=1 Include_test=0 Include_doc=0 Shortcuts=0',
           '', SW_HIDE, ewWaitUntilTerminated, Code);
      if DetectPython() then NeedPython := False
      else Result := Format('Python could not be installed (exit code %d). Install Python 3 from python.org and run Setup again.', [Code]);
    except
      Result := 'Downloading Python failed: ' + GetExceptionMessage + '. Check the internet connection, or install Python 3 from python.org and run Setup again.';
    end;
  finally
    DownloadPage.ProgressBar.Style := npbstNormal;
    DownloadPage.Hide;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if Blocked then
    Result := 'This PC is missing Microsoft Edge or Windows 10/11, which Station Announcement Maker needs.'
  else if NeedPython then
  begin
    if WizardSilent or PyCheck.Checked then Result := InstallPython()
    else Result := 'Python 3 is needed.';
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    SaveStringToFile(ExpandConstant('{app}\python.path'), PythonW, False);
end;

procedure DeinitializeSetup();
begin
  if TimerID <> 0 then KillTimer(0, TimerID);
end;

