' Corre "node agente-local.js --once" sin mostrar ninguna ventana.
' Lo usa el Programador de tareas de Windows (ver INSTALACION-AGENTE.md) para
' revisar pedidos pendientes cada 1-2 minutos, de forma invisible.

Dim fso, scriptDir, shell
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = scriptDir
' El "0" oculta la ventana; el "True" espera a que termine antes de salir
' (evita que el Programador dispare una corrida nueva encima de otra).
shell.Run "cmd /c node agente-local.js --once", 0, True
