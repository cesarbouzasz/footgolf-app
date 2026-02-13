// src/lib/rankings.ts

export const calculatePoints = (
  basePoints: number, 
  position: number, 
  numTied: number = 1,
  tieBreakType: 'share' | 'holes' = 'share',
  manualLimit: number = 3
) => {
  const decay = 0.08;
  const getPointsForPos = (pos: number) => basePoints * Math.pow(1 - decay, pos - 1);

  // CASO A: Posiciones dentro del límite de desempate en campo (ej. Top 3)
  // Aquí no hay reparto, el admin asignará posiciones 1, 2 y 3 manualmente tras el playoff.
  if (position <= manualLimit) {
    return getPointsForPos(position);
  }

  // CASO B: Del límite en adelante (ej. del 4º hacia atrás)
  if (tieBreakType === 'holes') {
    // Si se desempata por hoyos, no hay empate técnico, cada uno tendrá una posición única (4, 5, 6...)
    return getPointsForPos(position);
  } else {
    // Si se mantiene el empate (share), aplicamos tu fórmula de sumar y dividir
    let totalPool = 0;
    for (let i = 0; i < numTied; i++) {
      totalPool += getPointsForPos(position + i);
    }
    return totalPool / numTied;
  }
};
/**
 * Compara dos tarjetas para desempatar por los últimos 9 hoyos.
 * Devuelve un número negativo si 'a' gana, positivo si 'b' gana.
 */
export const compareCardsForTieBreak = (cardA: number[], cardB: number[]) => {
  // 1. Comparar suma de los últimos 9 hoyos (índices 9 al 17)
  const last9A = cardA.slice(9, 18).reduce((acc, g) => acc + g, 0);
  const last9B = cardB.slice(9, 18).reduce((acc, g) => acc + g, 0);

  if (last9A !== last9B) return last9A - last9B; // El que tenga menos golpes gana

  // 2. Si siguen empatados, comparar suma de los últimos 6 hoyos
  const last6A = cardA.slice(12, 18).reduce((acc, g) => acc + g, 0);
  const last6B = cardB.slice(12, 18).reduce((acc, g) => acc + g, 0);
  if (last6A !== last6B) return last6A - last6B;

  // 3. Si siguen empatados, comparar últimos 3 hoyos
  const last3A = cardA.slice(15, 18).reduce((acc, g) => acc + g, 0);
  const last3B = cardB.slice(15, 18).reduce((acc, g) => acc + g, 0);
  if (last3A !== last3B) return last3A - last3B;

  // 4. Si persiste, comparar el hoyo 18 (índice 17)
  return cardA[17] - cardB[17];
};