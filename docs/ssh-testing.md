# SSH Windows → Mac para testing

## Estado de preparación

El propietario autorizó preparar el canal SSH el 4 de noviembre de 2026. **No equivale a autorizar un despliegue ni a declarar operativo el canal.** La coordinación y las claves públicas se registran en la [página SSH de Notion](https://app.notion.com/p/40fb70136a488093be28d20334b0ac4a).

| Dato                                     | Estado                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------- |
| Host comunicado                          | `Mac-mini-de-Emmanuel.local`; no resuelve desde este Windows               |
| IP actual comunicada                     | `192.168.31.35`; responde SSH en puerto 22                                 |
| IP anterior                              | `192.168.31.76`; no respondió durante esta preparación                     |
| Usuario comunicado                       | `emmanuelsalazar`                                                          |
| Proyecto comunicado                      | `zandaka-testing`                                                          |
| Compose comunicado                       | `/Users/emmanuelsalazar/Documents/MacOS/Testing/docker-compose.yml`        |
| Clave cliente Windows                    | Ed25519 exclusiva, generada fuera de Git, DACL verificada solo propietario |
| Identidad del servidor                   | Pendiente de contrastar con clave/huella obtenidas localmente en el Mac    |
| Entrada restringida y endpoint de prueba | Propuestos en Notion, instalación y ejecución remota pendientes            |
| Servicios Docker y volumen/DB            | No descubiertos todavía                                                    |
| Despliegue o cambio de DB                | Ninguno por esta preparación                                               |

La dirección responde con OpenSSH 10.2, pero eso por sí solo no demuestra que sea el Mac correcto. El cliente Windows negoció y se detuvo ante el host todavía no confiable, sin autenticación ni comandos remotos. Las rutas del Mac son datos comunicados; no se presentan como inspecciones de su filesystem.

## Identidades y alcance

La privada está en el perfil local Windows, `.ssh/zandaka_testing_ed25519`; no se muestra, copia a Notion, incorpora a Git, distribuye al Mac ni entrega a GitHub Actions. Se generó sin frase para automatización restringida. Su protección local depende de la cuenta Windows y la DACL; el alcance remoto depende además de las restricciones del servidor. No es una clave de acceso general ni una defensa frente a un proceso que ya controle la cuenta local.

La clave pública y su huella de cliente se publican en Notion para la instalación inicial. Antes de confiar en el host hay que obtener su **clave pública de servidor y huella desde el Mac** y contrastarlas con lo recibido desde Windows. Nunca usar la huella obtenida por red como única prueba ni desactivar la verificación de hosts. No compartir las claves privadas del servidor.

El perfil dedicado Windows está en `.ssh/zandaka-testing.conf`, se invoca con `ssh -F` y no sustituye una configuración global. Usa exclusivamente la identidad dedicada, sin agente/contraseñas, y `StrictHostKeyChecking yes`, con un archivo de hosts dedicado y alias `zandaka-testing-mac`. Ese archivo permanece vacío hasta completar la verificación independiente. No aceptar automáticamente claves desconocidas.

## Primera instalación: solo probe

La propuesta en Notion agrega esta pública con `restrict` y un comando obligatorio. Conserva otras claves del usuario y sus permisos; verificar que este par no exista también en otra línea sin restricciones. El archivo local propuesto `/Users/emmanuelsalazar/.ssh/zandaka-testing-probe.sh` pertenece al usuario y no es escribible por otros. Mantenerlo fuera de repositorios o artefactos actualizables por PR.

Ese script solo acepta el comando exacto `probe`, comprueba el usuario y si el Compose comunicado es legible y devuelve un marcador fijo. No imprime su contenido ni `.env`, invoca Docker o SQLite, descarga imágenes, respalda, migra o reinicia servicios. Cualquier comando distinto, incluidos un shell, SFTP, separadores o sustituciones de comando, se rechaza. Las restricciones de OpenSSH impiden además PTY/forwarding/rc; deben verificarse después de instalar.

El bundle local Windows `operaciones/ssh-testing/` del workspace contiene pública, entrada restringida, script, runbook y comprobaciones locales. No contiene la privada. La sintaxis POSIX y siete rechazos de comandos se probaron localmente. La ejecución válida y las restricciones efectivas del servidor siguen pendientes hasta su instalación.

## Verificación del canal

Después de verificar/pinar la identidad del servidor e instalar el endpoint restringido:

```powershell
ssh -F "$env:USERPROFILE/.ssh/zandaka-testing.conf" zandaka-testing probe
```

Esperado: marcador `ZANDAKA_TESTING_SSH_PROBE_V1`, `user=emmanuelsalazar`, `compose_readable=true`, retorno 0. Una petición de `id` debe rechazarse con retorno 64; no debe ejecutar el binario remoto. Verificar también que no se conceden PTY o túneles y documentar lo que efectivamente quedó instalado. No confundir sintaxis local correcta, puerto abierto o pública publicada con autenticación completada.

## Habilitar despliegues posteriormente

La clave inicial **no permite desplegar**. Antes de ampliar su autoridad hay que identificar contexto Docker, servicios, imágenes actuales, montaje/DB reales y método de respaldo. Diseñar un procedimiento fijo local del Mac con imágenes propias por digest, validación de parámetros, respaldo, requisitos del bloque, verificaciones y reversión. No aceptar comandos de shell arbitrarios ni ejecutar código recibido de PR. Ni un push ni un archivo nuevo en Git autorizan a sustituir el endpoint local del Mac.

Un futuro despliegue requiere petición del propietario y seguir [deploy-testing](deploy-testing.md) y ambas guías de staging. El requisito de ZA-90 para `transfer_request` permanece independiente del acceso SSH. No ejecutar migraciones monetarias, saneamientos o recálculos, ni usar la copia productiva de auditoría.

Referencias: [restricciones por clave](https://man.openbsd.org/sshd.8#AUTHORIZED_KEYS_FILE_FORMAT), [verificación estricta del servidor](https://man.openbsd.org/ssh_config.5#StrictHostKeyChecking), [gestión de claves en Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement).
