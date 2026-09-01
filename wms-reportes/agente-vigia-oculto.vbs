' "Vigía": se fija si el Agente ya está corriendo en modo --loop, y si no
' lo está, lo arranca. Pensado para dispararse cada 1 minuto desde el
' Programador de tareas de Windows (ver INSTALACION-AGENTE.md).
'
' Existe porque en PCs de dominio la política de grupo bloquea crear tareas
' con disparador "al iniciar sesión" / "al iniciar Windows" (mismo tipo de
' restricción que ya bloqueaba PowerShell en estas máquinas) -- el único
' disparador que sí se puede crear es uno que se repite cada N minutos. Este
' vigía convierte ese único disparador en un mecanismo que además se
' autorepara: si el Agente se cae por lo que sea, el vigía lo vuelve a
' levantar en, como mucho, 1 minuto -- sin necesitar una segunda tarea de
' respaldo.

Dim fso, scriptDir, shell, wmi, procesos, proceso, yaCorriendo

Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

yaCorriendo = False
Set wmi = GetObject("winmgmts:\\.\root\cimv2")
Set procesos = wmi.ExecQuery("Select CommandLine From Win32_Process Where Name='node.exe'")
For Each proceso In procesos
  If Not IsNull(proceso.CommandLine) Then
    If InStr(proceso.CommandLine, "agente-local.js") > 0 And InStr(proceso.CommandLine, "--loop") > 0 Then
      yaCorriendo = True
      Exit For
    End If
  End If
Next

If Not yaCorriendo Then
  Set shell = CreateObject("WScript.Shell")
  shell.CurrentDirectory = scriptDir
  ' "False": el vigía no espera -- deja el loop corriendo por su cuenta y
  ' termina al toque, para no bloquear al Programador de tareas.
  shell.Run "wscript.exe """ & scriptDir & "\agente-loop-oculto.vbs""", 0, False
End If
