# SSH Windows → Mac para testing

## Estado verificado

El propietario autorizó preparar el canal SSH el 4 de noviembre de 2026. Ese día se completaron instalación inicial, verificación independiente del host y nueve comprobaciones remotas desde Windows. **El canal funciona exclusivamente para `probe`; todavía no permite desplegar.** La coordinación, las claves públicas y los resultados se registran en la [página SSH de Notion](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a).

| Dato                                     | Estado                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Host comunicado                          | `Mac-mini-de-Emmanuel.local`; no resuelve desde este Windows                                                    |
| IP actual comunicada                     | `192.168.31.35`; responde SSH en puerto 22                                                                      |
| IP anterior                              | `192.168.31.76`; no respondió durante esta preparación                                                          |
| Usuario verificado                       | `emmanuelsalazar`, confirmado por el endpoint autenticado                                                       |
| Proyecto comunicado                      | `zandaka-testing`                                                                                               |
| Compose comunicado                       | `/Users/emmanuelsalazar/Documents/MacOS/Testing/docker-compose.yml`; legible según probe, sin leer su contenido |
| Clave cliente Windows                    | Ed25519 exclusiva, generada fuera de Git, DACL verificada solo propietario                                      |
| Identidad del servidor                   | Clave/huella obtenidas localmente en el Mac, contrastadas y fijadas en Windows                                  |
| Entrada restringida y endpoint de prueba | Instalación reportada por CodexMacOS; autenticación y restricciones verificadas desde Windows                   |
| Servicios Docker y volumen/DB            | No descubiertos todavía                                                                                         |
| Despliegue o cambio de DB                | Ninguno por esta preparación                                                                                    |

La dirección responde con OpenSSH 10.2. Primero el cliente Windows se detuvo ante el host todavía no confiable; posteriormente se contrastó su clave con la obtenida localmente en el Mac, se instaló el pin y se autenticó con la clave dedicada. La huella verificada del servidor es `SHA256:QO9vRriTJcmFjMht9ZT/NOepcyP7+q27SnccD46nzH0`. La huella del cliente Windows es `SHA256:PrGmxd/A7kQMwlQuGpkwu4rUoelPFI5KifPc/5la67I`. No se descubrió todavía la configuración de servicios, montajes o DB del Mac.

## Identidades y alcance

La privada está en el perfil local Windows, `.ssh/zandaka_testing_ed25519`; no se muestra, copia a Notion, incorpora a Git, distribuye al Mac ni entrega a GitHub Actions. Se generó sin frase para automatización restringida. Su protección local depende de la cuenta Windows y la DACL; el alcance remoto depende además de las restricciones del servidor. No es una clave de acceso general ni una defensa frente a un proceso que ya controle la cuenta local.

La clave pública y su huella de cliente se publican en Notion para la instalación inicial. Antes de confiar en el host hay que obtener su **clave pública de servidor y huella desde el Mac** y contrastarlas con lo recibido desde Windows. Nunca usar la huella obtenida por red como única prueba ni desactivar la verificación de hosts. No compartir las claves privadas del servidor.

El perfil dedicado Windows está en `.ssh/zandaka-testing.conf`, se invoca con `ssh -F` y no sustituye una configuración global. Usa exclusivamente la identidad dedicada, sin agente/contraseñas, y `StrictHostKeyChecking yes`, con un archivo de hosts dedicado y alias `zandaka-testing-mac`. Ese archivo contiene únicamente la identidad del servidor contrastada por el canal del Mac. Una rotación o cambio de IP requiere verificar la identidad de nuevo; no aceptar automáticamente claves desconocidas ni reemplazar el pin para silenciar un error.

## Primera instalación: solo probe

CodexMacOS reportó instalada esta pública con `restrict` y un comando obligatorio, sin otra entrada duplicada de esta clave. Se conservaron otras claves del usuario. Reportó carpeta `.ssh` con modo 700, `authorized_keys` con 600 y archivo local `/Users/emmanuelsalazar/.ssh/zandaka-testing-probe.sh` con 700, propiedad de `emmanuelsalazar`. Windows verificó el comportamiento remoto; los permisos y la ubicación se documentan conforme a la inspección local del Mac. Mantener el endpoint fuera de repositorios o artefactos actualizables por PR.

Ese script solo acepta el comando exacto `probe`, comprueba el usuario y si el Compose comunicado es legible y devuelve un marcador fijo. No imprime su contenido ni `.env`, invoca Docker o SQLite, descarga imágenes, respalda, migra o reinicia servicios. Cualquier comando distinto se rechaza. Las restricciones de OpenSSH configuradas incluyen PTY/forwarding/rc; se verificaron remotamente los rechazos de PTY, forwarding remoto y SFTP, además de comandos no permitidos.

El bundle local Windows `operaciones/ssh-testing/` del workspace contiene públicas, entrada restringida, script, runbook y comprobaciones. No contiene la privada. La sintaxis POSIX y siete rechazos se probaron localmente; `verificacion-ssh-remota.json` registra las nueve comprobaciones reales desde Windows y `identidad-verificada.json` el contraste de identidad.

## Verificación del canal

Comando probado desde Windows con la identidad del servidor ya verificada y fijada:

```powershell
ssh -F "$env:USERPROFILE/.ssh/zandaka-testing.conf" zandaka-testing probe
```

Resultado real: marcador `ZANDAKA_TESTING_SSH_PROBE_V1`, `user=emmanuelsalazar`, `compose_readable=true`, retorno 0. Se rechazaron cinco cadenas de comando (`id`, argumento extra, separador, sustitución literal y salto de línea) con retorno 64. PTY y forwarding remoto se rechazaron con 255; el subsistema SFTP, con 64. La petición de forwarding fue denegada sin habilitar el reenvío. No se ejecutaron acciones Docker, SQLite o de despliegue. Estas pruebas no sustituyen la inspección y preparación del entorno necesaria para un futuro deploy.

## Habilitar despliegues posteriormente

El [contrato de instalación única del desplegador](testing-deployer-contract.md) define el siguiente paso concreto y su protocolo. El cliente Windows está implementado y probado en `scripts/testing-ssh-client.mjs`; **la contraparte de Mac todavía requiere instalación local**. No confundir la existencia del cliente o pruebas con transporte simulado con un desplegador operativo.

La clave inicial **no permite desplegar**. Antes de ampliar su autoridad hay que identificar contexto Docker, servicios, imágenes actuales, montaje/DB reales y método de respaldo. Diseñar un procedimiento fijo local del Mac con imágenes propias por digest, validación de parámetros, respaldo, requisitos del bloque, verificaciones y reversión. No aceptar comandos de shell arbitrarios ni ejecutar código recibido de PR. Ni un push ni un archivo nuevo en Git autorizan a sustituir el endpoint local del Mac.

Un futuro despliegue requiere petición del propietario y seguir [deploy-testing](deploy-testing.md) y ambas guías de staging. El requisito de ZA-90 para `transfer_request` permanece independiente del acceso SSH. No ejecutar migraciones monetarias, saneamientos o recálculos, ni usar la copia productiva de auditoría.

Referencias: [restricciones por clave](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT), [verificación estricta del servidor](https://man.openbsd.org/ssh_config.5#StrictHostKeyChecking), [gestión de claves en Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).
