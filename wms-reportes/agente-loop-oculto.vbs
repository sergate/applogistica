' Corre "node agente-local.js --loop" sin mostrar ninguna ventana.
' Lo usa el Programador de tareas de Windows (ver INSTALACION-AGENTE.md),
' disparado UNA vez al iniciar sesión: el proceso queda corriendo en segundo
' plano y se fija solo cada pocos segundos si hay un pedido pendiente.

Dim fso, scriptDir, shell, nodeExe
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Usa el Node.js empaquetado en node-portable si existe (paquete portable,
' sin Node instalado en la PC); si no, cae al "node" del PATH del sistema.
If fso.FileExists(scriptDir & "\node-portable\node.exe") Then
  nodeExe = """" & scriptDir & "\node-portable\node.exe"""
Else
  nodeExe = "node"
End If

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = scriptDir
' El "0" oculta la ventana; el "True" hace que este .vbs (y por lo tanto la
' tarea programada) se quede "corriendo" mientras el Agente esté vivo -- así
' el Programador de tareas puede reiniciarlo solo si se cae (ver "Reiniciar
' si falla" en la configuración de la tarea).
shell.Run "cmd /c " & nodeExe & " agente-local.js --loop", 0, True
