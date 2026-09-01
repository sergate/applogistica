' Corre "node agente-local.js --once" sin mostrar ninguna ventana.
' Tarea de RESPALDO (ver INSTALACION-AGENTE.md, "Agente WMS (respaldo)"):
' una pasada corta cada 5 minutos, para atrapar pedidos pendientes si la
' tarea principal en modo --loop (agente-loop-oculto.vbs) se hubiera caído.

Dim fso, scriptDir, shell
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = scriptDir
' El "0" oculta la ventana; el "True" espera a que termine antes de salir
' (evita que el Programador dispare una corrida nueva encima de otra).
shell.Run "cmd /c node agente-local.js --once", 0, True
