# Especificaciones Técnicas: Modo Match Play

Este documento detalla las condiciones y la estructura de datos necesaria para implementar el modo de juego **Match Play** en la aplicación de FootGolf.

## 1. Configuración del Torneo (Entidad Tournament)

Para que un torneo se comporte como Match Play, su documento en Firestore debe contener las siguientes propiedades:

- **`competitionMode`**: `"match-play"` (String).
- **`scoringSystem`**: `"match-play"` (String).
- **`holesPerRound`**: `Array<number>`. Define el número de hoyos a jugar en cada ronda del cuadro principal. Ejemplo: `[18, 9, 9, 9]`.
- **`hasConsolation`**: `boolean`. Define si existe un cuadro de "consolación" para los perdedores de la primera ronda.
- **`consolationHolesPerRound`**: `Array<number>`. Define los hoyos por ronda para el cuadro de consolación.

## 2. Lógica del Cuadro (Bracket)

El cuadro se genera automáticamente basándose en el número de jugadores inscritos (`registeredPlayerIds`).

### Tamaño del Cuadro
Se calcula buscando la potencia de 2 inmediatamente superior al número de participantes:
- 2-2 jugadores: Cuadro de 2.
- 3-4 jugadores: Cuadro de 4.
- 5-8 jugadores: Cuadro de 8.
- 9-16 jugadores: Cuadro de 16.
- 17-32 jugadores: Cuadro de 32.

### Gestión de "Byes" (Huecos Vacíos)
Si el número de jugadores no es una potencia de 2 perfecta, los huecos restantes se rellenan con la cadena `"N/A"`. Estos se consideran victorias automáticas (W.O. - Walkover) para el oponente.

### Orden del Sorteo (Draw Order)
Se utiliza un orden estándar de torneo para asegurar que los mejores (cabezas de serie) no se enfrenten hasta las rondas finales. Ejemplo para un cuadro de 8: `[1, 8, 5, 4, 3, 6, 7, 2]`.

## 3. Estructura del Objeto Bracket en Firestore

El campo `mainBracket` (y `consolationBracket`) tiene la siguiente estructura:

```json
{
  "rounds": [
    {
      "name": "Octavos de Final",
      "matches": [
        {
          "p1": "Nombre Jugador 1",
          "p2": "Nombre Jugador 2",
          "result": "2-1",
          "winner": "Nombre Jugador 1",
          "matchCode": "ID_DEL_DOCUMENTO_GAME"
        }
      ]
    }
  ]
}
```

## 4. Dinámica de Juego

- **Creación de Partidas**: Al confirmar el sorteo, el sistema crea un documento en la colección `/games` para cada enfrentamiento que no sea un W.O.
- **Vínculo**: Cada objeto `match` en el bracket guarda el `matchCode`, que es el ID del documento de juego.
- **Actualización Automática**: Cuando una partida de Match Play finaliza en la aplicación, el sistema busca el `matchCode` dentro del torneo y actualiza automáticamente el `winner` y el `result` en el bracket, permitiendo que los ganadores avancen a la siguiente ronda.

## 5. Condiciones de Victoria en Partida

- Un jugador gana un hoyo si lo completa en menos golpes que su rival.
- La partida termina antes de los hoyos pactados si la ventaja de un jugador es mayor que los hoyos que quedan por jugar (ej: "3 up" faltando 2 hoyos).
- En caso de empate al finalizar los hoyos, se puede aplicar un desempate (muerte súbita), marcado en el sistema con un asterisco (`*`) junto al nombre del ganador.