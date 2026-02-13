export type BirdyPdfTopic = {
  id: string;
  title: string;
  keywords: string[];
  sectionHint?: string;
  pageHint?: string;
  summaryEs: string;
};

// Curated, non-verbatim topics inspired by the PDF's section structure.
// This is intentionally a lightweight index to help Birdy route questions
// to relevant parts of the rules without reproducing the full text.
export const FIFG_RULES_2025_TOPICS: BirdyPdfTopic[] = [
  {
    id: 'intro-forms',
    title: 'Introducción y formas del juego',
    keywords: ['introduccion', 'introducción', 'formas', 'formato', 'match play', 'stroke play', 'juego'],
    sectionHint: 'PART 1 - Introduction / Forms of the Game',
    summaryEs:
      'Explica los formatos habituales (por hoyos o por golpes) y criterios generales de competición. Si me dices el evento, te indico qué formato aplica según su publicación.',
  },
  {
    id: 'conduct',
    title: 'Conducta y deportividad',
    keywords: ['conducta', 'comportamiento', 'deportividad', 'etiqueta', 'sancion', 'sanción'],
    sectionHint: 'PART 1 - Code of Conduct',
    summaryEs:
      'Resume expectativas de conducta, respeto al campo y al resto de jugadores. Las sanciones dependen del reglamento del evento y las normas locales del campo.',
  },
  {
    id: 'equipment',
    title: 'Equipamiento (balón, calzado, ropa)',
    keywords: ['equipamiento', 'balon', 'balón', 'calzado', 'ropa', 'guantes', 'vestimenta'],
    sectionHint: 'PART 2 - Equipment',
    summaryEs:
      'Cubre qué equipamiento es válido y qué restricciones suelen aplicarse. Si me dices el campo/evento, reviso también las normas locales que puede publicar la organización.',
  },
  {
    id: 'course-markings',
    title: 'Campo y marcajes',
    keywords: ['campo', 'marcaje', 'marcajes', 'tee', 'salida', 'hoyo', 'bandera', 'señalizacion', 'señalización'],
    sectionHint: 'PART 3 - The Course',
    summaryEs:
      'Aclara cómo se definen zonas del campo y señalizaciones típicas (salidas, objetivos, límites). En caso de duda, prima la señalización del evento y el briefing.',
  },
  {
    id: 'out-of-bounds',
    title: 'Fuera de límites y penalizaciones comunes',
    keywords: ['fuera de limites', 'fuera de límites', 'ob', 'penalizacion', 'penalización', 'golpe de castigo'],
    sectionHint: 'PART 3 - Out of Bounds',
    summaryEs:
      'Describe qué se considera fuera de límites y el enfoque general de penalización y reanudación del juego. Las opciones exactas pueden variar por norma local.',
  },
  {
    id: 'interference',
    title: 'Interferencias y alivio',
    keywords: ['interferencia', 'alivio', 'drop', 'dropar', 'obstaculo', 'obstáculo', 'animal', 'condicion anormal', 'condición anormal'],
    sectionHint: 'PART 3 - Interference',
    summaryEs:
      'Explica cuándo puedes obtener alivio (por ejemplo, obstáculos o condiciones anormales) y cómo proceder de forma segura y justa según el caso.',
  },
  {
    id: 'ball-moved',
    title: 'Balón en reposo: movido, tocado o desviado',
    keywords: ['balon movido', 'balón movido', 'se mueve', 'tocado', 'desviado', 'deflected', 'accidental'],
    sectionHint: 'PART 4 - The Ball In Play',
    summaryEs:
      'Cubre qué hacer si el balón se mueve o es desviado, y cómo reponer o continuar según la causa (accidental, externa, etc.).',
  },
  {
    id: 'kicking',
    title: 'Ejecutar el golpe (kick)',
    keywords: ['golpe', 'kick', 'patear', 'pateo', 'ejecutar', 'stance', 'postura'],
    sectionHint: 'PART 4 - Kicking the Ball',
    summaryEs:
      'Recoge criterios generales para ejecutar el golpe y cuándo un golpe se considera realizado. Si tienes una situación concreta, descríbemela y te doy una guía práctica.',
  },
  {
    id: 'putting-green',
    title: 'Green / área de putt',
    keywords: ['green', 'putt', 'area de putt', 'área de putt', 'bandera', 'hoyo'],
    sectionHint: 'PART 4 - The Putting Green',
    summaryEs:
      'Indica consideraciones típicas cerca del hoyo (marcas, bandera, interferencias) para mantener el ritmo y la equidad del juego.',
  },
];
