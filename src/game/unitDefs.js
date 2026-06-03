/** Pure helper: map (team, kind, enemyKind) to unit definition from race config.
 *  Used by GameScene.createUnit() to resolve stats, labels, and visuals for each unit.
 */

export function getUnitDef(race, team, kind, enemyKind) {
  if (team === 'enemy' && kind === 'soldier') {
    return race.units.enemySoldier;
  }

  if (team === 'enemy' && kind === 'signature') {
    return race.units.enemySignature;
  }

  if (kind === 'worker') {
    return race.units.worker;
  }

  if (kind === 'soldier') {
    return race.units.soldier;
  }

  if (kind === 'signature') {
    return race.units.signature;
  }

  if (enemyKind && team === 'enemy') {
    return race.units[enemyKind] ?? race.units.enemySoldier;
  }

  return race.units.soldier;
}
