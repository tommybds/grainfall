export const DIFFICULTIES = [
  { id: "easy", name: "Facile", spawnMul: 0.8, enemyHpMul: 0.85, enemyDmgMul: 0.85, enemySpeedMul: 0.95 },
  { id: "normal", name: "Normal", spawnMul: 1.0, enemyHpMul: 1.0, enemyDmgMul: 1.0, enemySpeedMul: 1.0 },
  { id: "hard", name: "Difficile", spawnMul: 1.25, enemyHpMul: 1.2, enemyDmgMul: 1.2, enemySpeedMul: 1.08 },
];

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}

