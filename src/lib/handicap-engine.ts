/**
 * REGLA DE FOOTGOLF:
 * - Novato empieza en 18.0.
 * - Mejora: Si Diferencial < HC, baja (HC - Diferencial) * 0.1.
 * - Empeora: Si Diferencial > HC, sube +0.1 fijo.
 */
export const calculateNewHandicap = (currentHC: number, strokes: number, par: number) => {
  const differential = strokes - par;
  
  if (differential < currentHC) {
    // Bajada: Se le resta el 10% de la diferencia positiva
    const improvement = currentHC - differential;
    const newHC = currentHC - (improvement * 0.1);
    return Math.max(0, parseFloat(newHC.toFixed(2))); // No bajar de 0
  } else if (differential > currentHC) {
    // Subida: +0.1 fijo
    const newHC = currentHC + 0.1;
    return Math.min(18, parseFloat(newHC.toFixed(2))); // No subir de 18
  }
  
  return currentHC; // Si es igual, se mantiene
};