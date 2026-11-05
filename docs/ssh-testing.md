# SSH Windows → Mac para testing

## Estado verificado

El propietario autorizó preparar el canal SSH el 4 de noviembre de 2026. Primero se verificó el bootstrap exclusivo `probe`; después se instaló el [desplegador completo y se verificaron inspect/plan desde Windows](testing-deployer-installed.md). **La instalación está terminada; el primer deploy real y su preparación de DB no se han ejecutado.** La coordinación, las claves públicas y los resultados se registran en la [página SSH de Notion](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a). Los apartados siguientes conservan la referencia del bootstrap, que fue sustituido en authorized_keys por el launcher instalado.

| Dato                      | Estado                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Host comunicado           | `Mac-mini-de-Emmanuel.local`; no resuelve desde este Windows                                                    |
| IP actual comunicada      | `192.168.31.35`; responde SSH en puerto 22                                                                      |
| IP anterior               | `192.168.31.76`; no respondió durante esta preparación                                                          |
| Usuario verificado        | `emmanuelsalazar`, confirmado por el endpoint autenticado                                                       |
| Proyecto verificado       | `zandaka-testing`, confirmado en inspect                                                                        |
| Compose comunicado        | `/Users/emmanuelsalazar/Documents/MacOS/Testing/docker-compose.yml`; legible según probe, sin leer su contenido |
| Clave cliente Windows     | Ed25519 exclusiva, generada fuera de Git, DACL verificada solo propietario                                      |
| Identidad del servidor    | Clave/huella obtenidas localmente en el Mac, contrastadas y fijadas en Windows                                  |
| Endpoint actual           | Launcher del desplegador instalado; inspect/plan y restricciones comprobados desde Windows                      |
| Servicios y DB            | `backend` / `frontend`; bind `data` → `/app/data`, DB `presupuesto.db`; ver registro instalado                  |
| Despliegue o cambio de DB | Ninguno por esta preparación                                                                                    |

La dirección responde con OpenSSH 10.2. Primero el cliente Windows se detuvo ante el host todavía no confiable; posteriormente se contrastó su clave con la obtenida localmente en el Mac, se instaló el pin y se autenticó con la clave dedicada. La huella verificada del servidor es `SHA256:QO9vRriTJcmFjMht9ZT/NOepcyP7+q27SnccD46nzH0`. La huella del cliente Windows es `SHA256:PrGmxd/A7kQMwlQuGpkwu4rUoelPFI5KifPc/5la67I`. La inspección posterior identificó servicios y montaje; el registro instalado conserva esos datos y sus verificaciones, sin haber abierto el esquema/filas de SQLite.

## Identidades y alcance

La privada está en el perfil local Windows, `.ssh/zandaka_testing_ed25519`; no se muestra, copia a Notion, incorpora a Git, distribuye al Mac ni entrega a GitHub Actions. Se generó sin frase para automatización restringida. Su protección local depende de la cuenta Windows y la DACL; el alcance remoto depende además de las restricciones del servidor. No es una clave de acceso general ni una defensa frente a un proceso que ya controle la cuenta local.

La clave pública y su huella de cliente se publican en Notion para la instalación inicial. Antes de confiar en el host hay que obtener su **clave pública de servidor y huella desde el Mac** y contrastarlas con lo recibido desde Windows. Nunca usar la huella obtenida por red como única prueba ni desactivar la verificación de hosts. No compartir las claves privadas del servidor.

El perfil dedicado Windows está en `.ssh/zandaka-testing.conf`, se invoca con `ssh -F` y no sustituye una configuración global. Usa exclusivamente la identidad dedicada, sin agente/contraseñas, y `StrictHostKeyChecking yes`, con un archivo de hosts dedicado y alias `zandaka-testing-mac`. Ese archivo contiene únicamente la identidad del servidor contrastada por el canal del Mac. Una rotación o cambio de IP requiere verificar la identidad de nuevo; no aceptar automáticamente claves desconocidas ni reemplazar el pin para silenciar un error.

## Referencia histórica: bootstrap solo probe

CodexMacOS reportó instalada esta pública con `restrict` y un comando obligatorio, sin otra entrada duplicada de esta clave. Se conservaron otras claves del usuario. Reportó carpeta `.ssh` con modo 700, `authorized_keys` con 600 y archivo local `/Users/emmanuelsalazar/.ssh/zandaka-testing-probe.sh` con 700, propiedad de `emmanuelsalazar`. Windows verificó el comportamiento remoto; los permisos y la ubicación se documentan conforme a la inspección local del Mac. Mantener el endpoint fuera de repositorios o artefactos actualizables por PR.

Ese script solo acepta el comando exacto `probe`, comprueba el usuario y si el Compose comunicado es legible y devuelve un marcador fijo. No imprime su contenido ni `.env`, invoca Docker o SQLite, descarga imágenes, respalda, migra o reinicia servicios. Cualquier comando distinto se rechaza. Las restricciones de OpenSSH configuradas incluyen PTY/forwarding/rc; se verificaron remotamente los rechazos de PTY, forwarding remoto y SFTP, además de comandos no permitidos.

El bundle local Windows `operaciones/ssh-testing/` del workspace contiene públicas, entrada restringida, script, runbook y comprobaciones. No contiene la privada. La sintaxis POSIX y siete rechazos se probaron localmente; `verificacion-ssh-remota.json` registra las nueve comprobaciones reales desde Windows y `identidad-verificada.json` el contraste de identidad.

## Verificación del canal

Comando probado desde Windows con la identidad del servidor ya verificada y fijada:

```powershell
ssh -F "$env:USERPROFILE/.ssh/zandaka-testing.conf" zandaka-testing probe
```

Resultado real: marcador `ZANDAKA_TESTING_SSH_PROBE_V1`, `user=emmanuelsalazar`, `compose_readable=true`, retorno 0. Se rechazaron cinco cadenas de comando (`id`, argumento extra, separador, sustitución literal y salto de línea) con retorno 64. PTY y forwarding remoto se rechazaron con 255; el subsistema SFTP, con 64. La petición de forwarding fue denegada sin habilitar el reenvío. No se ejecutaron acciones Docker, SQLite o de despliegue. Estas pruebas no sustituyen la inspección y preparación del entorno necesaria para un futuro deploy.

## Desplegador posterior al bootstrap

El [contrato de instalación única del desplegador](testing-deployer-contract.md) define el protocolo. El cliente Windows está implementado y probado en `scripts/testing-ssh-client.mjs`; **la contraparte del Mac ya está instalada y su aceptación remota de lectura terminó**. Usar [el registro operativo actual](testing-deployer-installed.md), con servicios, DB, comandos y límites comprobados, para los próximos bloques. No confundir esas pruebas con un despliegue real.

La entrada inicial fue reemplazada localmente por el launcher del desplegador, manteniendo `restrict` y el comando obligatorio. Se identificaron contexto, servicios y montaje; el código instalado implementa validación de digests, backup, preparación limitada de ZA-90 y reversión de imágenes. Las ramas mutantes se probaron con fixtures aisladas, no sobre testing. No aceptar comandos de shell arbitrarios ni ejecutar código recibido de PR. Ni un push ni un archivo nuevo en Git autorizan a sustituir el endpoint local del Mac.

Un futuro despliegue requiere petición del propietario y seguir [deploy-testing](deploy-testing.md) y ambas guías de staging. El requisito de ZA-90 para `transfer_request` permanece independiente del acceso SSH. No ejecutar migraciones monetarias, saneamientos o recálculos, ni usar la copia productiva de auditoría.

Referencias: [restricciones por clave](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT), [verificación estricta del servidor](https://man.openbsd.org/ssh_config.5#StrictHostKeyChecking), [gestión de claves en Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).
