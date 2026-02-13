# Especificaciones Técnicas: Modos de Juego Estándar (No Match Play)

Este documento detalla las condiciones, la lógica de cálculo y la estructura de datos para los modos de juego: **Torneo (Stroke Play)**, **Semanal**, **Copa** y **Campeonato**.

## 1. Atributos Comunes (Entidad Tournament)

Para que un evento funcione correctamente en estos modos, el documento en Firestore debe tener:

- **`competitionMode`**: `"tournament"`, `"weekly"`, `"cup"` o `"championship"`.
- **`registrationStartDate` / `registrationEndDate`**: Timestamps para el control de acceso.
- **`status`**: `"openForRegistration"`, `"inProgress"`, `"completed"`.
- **`registeredPlayerIds`**: Array de UIDs de los jugadores inscritos.

---

## 2. Lógica por Modo de Juego

### A. Torneo Clásico (Stroke Play)
Es el modo estándar basado en la suma total de golpes.
- **`scoringSystem`**: `"strokes"`.
- **`numberOfRounds`**: Indica cuántas tarjetas (etapas) componen el torneo.
- **Cálculo**: Se suman todos los golpes de todas las rondas. Gana quien tenga la menor suma.
- **Desempate**: Se utiliza el `finalOrder` (array de UIDs) gestionado manualmente por el admin para resolver empates en las primeras posiciones.

### B. Semanal (Mejor Tarjeta)
Pensado para competiciones que duran varios días donde el jugador puede intentar varias vueltas.
- **`scoringSystem`**: `"best_card"`.
- **`numberOfRounds`**: Aquí define el **número máximo de tarjetas** que un jugador puede entregar.
- **Cálculo**: El sistema busca entre todas las partidas (`games`) del jugador asociadas a este torneo y selecciona solo la que tenga el resultado más bajo (mejor).

### C. Copa (Mejor Hoyo)
Un modo acumulativo donde se premia la excelencia en cada hoyo individual a lo largo del tiempo.
- **`scoringSystem`**: `"best_hole_cup"`.
- **Cálculo**: Se analizan todas las tarjetas del jugador. Para el hoyo 1, se coge su mejor resultado histórico; para el hoyo 2, el mejor, y así hasta el 18. La "Tarjeta de la Copa" es la suma de esos 18 mejores resultados individuales.

### D. Campeonato (Ligas)
Agrupador de múltiples torneos independientes.
- **`championshipConfig`**:
    - `stageTournamentIds`: Lista de IDs de torneos que forman las etapas.
    - `bestStagesToCount`: Número de mejores resultados que suman para el ranking (ej: en una liga de 10 etapas, pueden contar solo las 8 mejores).
- **Cálculo**: Suma de los puntos obtenidos en el ranking de cada etapa.

---

## 3. Sistemas de Puntuación para Ranking (`pointOptions`)

Independientemente del modo de juego, un torneo puede asignar puntos para un ranking general:

1.  **Progresión Geométrica**:
    - `calculationMethod`: `"geometric"`.
    - `maxPoints`: Puntos para el 1º (ej: 250).
    - `progressionRate`: Factor de reducción (por defecto `0.92`).
    - **Fórmula**: `Puntos(n) = maxPoints * (rate ^ (n-1))`.

2.  **Asignación Manual**:
    - `calculationMethod`: `"manual"`.
    - `pointsForPositions`: Array de números (ej: `[100, 80, 60, 50, 40...]`).

---

## 4. Clasificación por Equipos (`interprovincialConfig`)

Si `enabled` es `true`, el sistema agrupa a los jugadores por el campo definido en `competitionType` (`province`, `region` o `team`):
- Se seleccionan los `playersToCount` mejores jugadores de cada equipo (según su resultado contra el par).
- La suma de esos resultados es la puntuación del equipo. Menor puntuación gana.
