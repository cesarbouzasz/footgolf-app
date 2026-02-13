// src/lib/group-utils.ts

export const generateSmartGroups = (
  allPlayers: any[], 
  groupSize: number, 
  preAssigned: Record<string, string>,
  config: {
    type: 'shotgun' | 'intervals',
    startTime: string, // format "09:00"
    interval: number   // minutos
  }
) => {
  const playersToSort = allPlayers.filter(p => !preAssigned[p.id]);
  const shuffled = [...playersToSort].sort(() => Math.random() - 0.5);
  
  const totalGroups = Math.ceil(allPlayers.length / groupSize);
  const finalGroups = [];

  // Función para calcular la hora
  const calculateTime = (index: number) => {
    if (config.type === 'shotgun') return config.startTime;
    
    const [hours, minutes] = config.startTime.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + (index * config.interval);
    const newHours = Math.floor(totalMinutes / 60);
    const newMinutes = totalMinutes % 60;
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  };

  for (let i = 0; i < totalGroups; i++) {
    const groupId = `group-${i + 1}`;
    const fixedInThisGroup = allPlayers.filter(p => preAssigned[p.id] === groupId);
    const spotsLeft = groupSize - fixedInThisGroup.length;
    const fills = shuffled.splice(0, spotsLeft);
    
    const time = calculateTime(i);

    finalGroups.push({
      id: groupId,
      name: config.type === 'shotgun' ? `Hoyo ${i + 1}` : `Salida ${time}`,
      start_hole: config.type === 'shotgun' ? i + 1 : 1,
      start_time: time,
      players: [...fixedInThisGroup, ...fills]
    });
  }

  return finalGroups;
};