export const HEROES = [
  {
    id: "runner",
    name: "Runner",
    desc: "Rapide, fragile",
    glyph: ">",
    hpMax: 85,
    speed: 205,
    range: 135,
    startWeapons: ["pistol"],
    buffs: { fireRateMul: 1.0, moveSpeedMul: 1.05, dmgMul: 1.0 },
  },
  {
    id: "tank",
    name: "Tank",
    desc: "Très tanky, plus lent",
    glyph: "#",
    hpMax: 130,
    speed: 160,
    range: 110,
    startWeapons: ["pistol"],
    buffs: { fireRateMul: 0.95, moveSpeedMul: 1.0, dmgMul: 1.0 },
  },
  {
    id: "gunner",
    name: "Gunner",
    desc: "Dégâts, démarre armé",
    glyph: "&",
    hpMax: 100,
    speed: 175,
    range: 125,
    startWeapons: ["pistol", "shotgun"],
    buffs: { fireRateMul: 1.08, moveSpeedMul: 1.0, dmgMul: 1.05 },
  },
];

export function heroById(id) {
  return HEROES.find((h) => h.id === id) || HEROES[0];
}

