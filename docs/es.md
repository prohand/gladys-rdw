# RDW

Sigue tus vehículos neerlandeses en Gladys: **APK** (la inspección técnica
periódica), **seguro WAM** y **llamadas a revisión abiertas**, leídos del
registro público de la RDW, la autoridad neerlandesa de vehículos.

## Qué necesitas

- Gladys **5.3.0 o posterior**.
- Las **matrículas** de tus vehículos (matrículas neerlandesas).
- Nada más: el registro de la RDW es de datos abiertos, sin cuenta ni clave.

## Configuración

Abre **Integraciones → RDW → Configuración**.

| Campo                          | Qué escribir                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Matrículas                     | Tus matrículas, separadas por comas: `AB-123-C, 12-XYZ-3`. Guiones, espacios y minúsculas no importan.                                  |
| Aviso APK (días)               | Cuántos días antes de la caducidad de la APK el vehículo aparece pendiente (30 por defecto).                                            |
| Lectura del registro (horas)   | Horas entre dos lecturas del registro (6 por defecto). Cambia como mucho una vez al día.                                                |
| Token de aplicación (opcional) | Un token gratuito de [opendata.rdw.nl](https://opendata.rdw.nl/) que elimina el límite de peticiones. Innecesario para pocos vehículos. |

Guarda y pulsa **Probar la conexión**: el mensaje indica cuántos vehículos ha
encontrado el registro, qué matrículas no conoce y qué no era una matrícula.

**Consultar una matrícula** comprueba cualquier matrícula sin seguirla — antes
de añadirla, o para un coche que piensas comprar.

## Dispositivos

Abre **Descubrir**: cada matrícula se ofrece como un dispositivo, con el nombre
del registro (`Volkswagen Golf (AB-123-C)`). Añade los que quieras. Cada uno
tiene:

| Función          | Valor                                                                            |
| ---------------- | -------------------------------------------------------------------------------- |
| Días hasta APK   | Días hasta la caducidad de la APK. `0` el último día, negativo una vez caducada. |
| Caducidad APK    | El último día de validez de la APK, `AAAA-MM-DD`.                                |
| Asegurado (WAM)  | `1` cuando el registro conoce un seguro a terceros WAM, `0` si no.               |
| Revisión abierta | `1` cuando queda pendiente una llamada a revisión del fabricante, `0` si no.     |

Un valor que el registro no da (un ciclomotor sin APK, por ejemplo) queda
vacío: nunca se inventa.

La insignia de cada dispositivo indica el estado de los datos: **cloud** cuando
el registro ha respondido, **inaccesible** cuando no (se conservan los últimos
valores leídos), y un **punto naranja** cuando el registro no conoce la
matrícula (compruébala con **Consultar una matrícula**).

## Escenas y panel (Gladys 5.1)

### Disparadores

| Disparador                   | Cuándo se activa                                                                                                      | Variables                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **APK pendiente o caducada** | La APK entra en el periodo de aviso («pendiente pronto»), y de nuevo cuando caduca. Una vez por fecha de APK y etapa. | plate, vehicle, expiry_date, days_left |
| **Revisión abierta**         | El registro muestra una llamada a revisión que no estaba.                                                             | plate, vehicle                         |
| **Seguro terminado**         | El registro ya no muestra un seguro WAM para un vehículo que lo tenía.                                                | plate, vehicle                         |

Cada disparador puede limitarse a un vehículo; el de la APK también a una etapa
(pendiente pronto, caducada). En las acciones siguientes, lee los detalles con
`{{triggerEvent.data.plate}}`, `{{triggerEvent.data.days_left}}`…

Los disparadores se activan **una vez por cambio**, no en cada lectura, y una
actualización o un reinicio no los vuelve a activar. Un vehículo que ya está
pendiente al añadirlo activa el aviso de APK de inmediato; los disparadores de
revisión y de seguro esperan a un cambio.

### Acciones

| Acción                       | Qué hace                                 | Salidas                                                                                   |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Actualizar los vehículos** | Lee el registro ahora.                   | success, vehicles, alerts                                                                 |
| **Leer un vehículo**         | Da a la escena los datos de un vehículo. | found, plate, vehicle, apk_stage, apk_expiry, apk_days_left, insured, open_recall, alerts |

`apk_stage` vale `ok`, `due_soon`, `expired` o `unknown`. `alerts` cuenta lo
que requiere atención (APK pendiente o caducada, sin seguro, revisión abierta).

### Widget

Añade el widget **Vehículos RDW** a un panel: una tarjeta por vehículo, con su
fecha de APK y una insignia con lo más urgente primero (APK caducada, sin
seguro, revisión abierta, APK pronto). Ajustes:

- **Un solo vehículo**: muestra ese vehículo, con sus días hasta la APK en un
  mosaico en directo;
- **Solo lo que requiere atención**: oculta los vehículos en regla.

El botón **Actualizar** lee el registro de inmediato.

### Ejemplo

«Recordarme la APK»: disparador **APK pendiente o caducada** (etapa: pendiente
pronto) → acción **Enviar un mensaje**: `APK de {{triggerEvent.data.vehicle}}
({{triggerEvent.data.plate}}) en {{triggerEvent.data.days_left}} días.`

## Solución de problemas

- **«Esta matrícula no está en el registro RDW»**: comprueba la matrícula con
  **Consultar una matrícula**. Solo las matrículas neerlandesas están en el
  registro; un vehículo exportado o dado de baja puede desaparecer de él.
- **«El registro RDW no responde»**: el portal está caído o limita tu
  dirección. Se conservan los valores ya leídos; la siguiente lectura lo
  vuelve a intentar. Añade un token de aplicación si ocurre a menudo.
- El registro se actualiza una vez al día: un seguro nuevo o una APK superada
  puede tardar un día en aparecer.

## Privacidad

Las matrículas solo se envían a `opendata.rdw.nl`. La integración guarda el
último estado visto de cada vehículo en su propio almacenamiento, para activar
cada disparador una sola vez.
