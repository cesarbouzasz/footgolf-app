# Especificaciones Técnicas: Gestión de Tarjeta Digital

Este documento detalla la lógica, permisos y flujo de trabajo para la gestión de la tarjeta de puntuación dentro de una partida de torneo.

## 1. Roles y Permisos (Entidad Game)

La tarjeta implementa un sistema de "Marcador y Verificador" para garantizar la integridad de los datos.

- **Marcador Principal (Primary Scorer)**: 
    - Es el primer UID en el array `playerUIDs` del documento de la partida.
    - Es el único con permiso de escritura en el documento de Firestore (reglas de seguridad).
    - Responsable de la "Confirmación Final".
- **Verificador (Verifier)**:
    - Cualquier otro jugador del grupo (`playerUIDs`).
    - Entra en "Modo Verificación": puede anotar sus propios resultados localmente.
    - El sistema compara localmente su puntuación con la del Marcador Principal. Si hay discrepancia, se resalta en rojo.
- **Espectador**:
    - Usuario con el ID de partida pero que no está en `playerUIDs`. Solo tiene acceso de lectura.

## 2. Reglas de Validación de Puntuación

El sistema aplica las reglas oficiales de FootGolf (AGFG/FIFG):

- **Máximo por Hoyo**: Según la regla 2-2-10, un hoyo no terminado se anota como **PAR + 10**. El sistema valida que ninguna entrada supere este valor.
- **Sincronización**: Los cambios realizados por el Marcador Principal se envían a la base de datos con un "debounce" (retraso controlado) para no saturar la conexión, permitiendo que el resto del grupo vea los golpes casi al instante.
- **Hándicap**: (Próximamente) El sistema calculará el Neto basándose en el hándicap del jugador y la dificultad del hoyo (Slope/Hole Index).

## 3. Flujo de Confirmación y Bloqueo

1.  **Estado "En Juego"**: El campo `isConfirmed` es `false`. La edición está abierta para el Marcador Principal.
2.  **Finalización**: Cuando el sistema detecta que los 18 hoyos de todos los jugadores tienen un valor numérico, habilita el botón "Confirmar y Enviar".
3.  **Bloqueo (Locking)**: Al confirmar, el campo `isConfirmed` pasa a `true`. 
    - La interfaz deshabilita todos los campos de entrada (`disabled`).
    - El torneo recibe la señal de que los resultados son oficiales.
4.  **Intervención de Admin**: Solo un usuario con rol `administrador` o `creador` puede revertir el estado `isConfirmed` o editar una tarjeta bloqueada.

## 4. Visualización y Exportación

- **Modo Pro**: (En dispositivos con `performanceMode: high`) La tarjeta muestra colores dinámicos según el resultado contra el par (Eagle, Birdie, Bogey, etc.).
- **Compartir**: El sistema genera un "Snapshot" visual (PNG) de la tarjeta completa incluyendo los nombres, banderas de países y resultados totales para redes sociales.
