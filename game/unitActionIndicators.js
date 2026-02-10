import { areAllies, getPlayerColor } from './teamUtils.js'
import { hexDistance } from './GameLogic.js'

const isEnemyUnit = (sourceOwnerID, targetOwnerID, teamMode) => {
  if (sourceOwnerID === targetOwnerID) return false
  if (teamMode) return !areAllies(sourceOwnerID, targetOwnerID)
  return true
}

const canUnitMove = (unit) => {
  if (!unit || unit.hasMoved) return false
  if (unit.type === 'CATAPULT' && !unit.isTransport && unit.hasMovedOrAttacked) {
    return false
  }
  return true
}

const canUnitAttackAnyEnemy = ({ unit, units, teamMode = false, visibleUnitIds = null }) => {
  if (!unit || unit.hasAttacked) return false

  if (unit.type === 'CATAPULT' && !unit.isTransport && unit.hasMovedOrAttacked) {
    return false
  }

  return units.some((target) => {
    if (!target || target.id === unit.id) return false
    if (!isEnemyUnit(unit.ownerID, target.ownerID, teamMode)) return false
    if (visibleUnitIds && !visibleUnitIds.has(target.id)) return false
    return hexDistance(unit, target) <= unit.range
  })
}

export const shouldShowUnitActionRing = ({
  unit,
  units,
  currentPlayerID,
  teamMode = false,
  visibleUnitIds = null,
}) => {
  if (!unit || unit.ownerID !== currentPlayerID) return false
  if (!Array.isArray(units) || units.length === 0) return false

  if (canUnitMove(unit)) return true

  return canUnitAttackAnyEnemy({ unit, units, teamMode, visibleUnitIds })
}

export const getUnitActionRingImage = (ownerID) => {
  const color = getPlayerColor(ownerID)
  return `/units/ring_${color}.png`
}

export { canUnitAttackAnyEnemy, canUnitMove }
