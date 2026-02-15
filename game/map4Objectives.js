import { getTeamId, getTeamLabel } from './teamUtils.js'

export const MAP4_BUILDING_TYPES = ['CATHEDRAL', 'BARRACKS', 'CASTLE']
const CAPTURE_TURNS = 3

const getObjectiveTeamIds = ({ teamMode = false }) => ({
  defenderId: teamMode ? 'blue-green' : '0',
  attackerId: teamMode ? 'red-yellow' : '1',
})

export const createMap4ObjectiveState = ({ terrainMap = {}, teamMode = false }) => {
  const { defenderId, attackerId } = getObjectiveTeamIds({ teamMode })
  const buildings = {}

  MAP4_BUILDING_TYPES.forEach((buildingType) => {
    const hexes = Object.entries(terrainMap)
      .filter(([, terrain]) => terrain === buildingType)
      .map(([key]) => {
        const [q, r] = key.split(',').map(Number)
        return { q, r }
      })
    buildings[buildingType] = {
      id: buildingType,
      label: buildingType[0] + buildingType.slice(1).toLowerCase(),
      hexes,
      owner: defenderId,
      captureProgress: {
        [attackerId]: 0,
        [defenderId]: 0,
      },
    }
  })

  return {
    enabled: true,
    captureTurns: CAPTURE_TURNS,
    turnLimit: 40,
    attackerId,
    defenderId,
    buildings,
  }
}

export const updateMap4ObjectiveState = ({ G, teamMode = false }) => {
  if (!G?.map4ObjectiveState?.enabled) return

  const objectiveState = G.map4ObjectiveState
  const aliveUnits = (G.units || []).filter((u) => u.currentHP > 0)

  Object.values(objectiveState.buildings).forEach((building) => {
    const occupyingTeams = new Set(
      aliveUnits
        .filter((u) => building.hexes.some((hex) => hex.q === u.q && hex.r === u.r))
        .map((u) => (teamMode ? getTeamId(u.ownerID) : u.ownerID))
        .filter(Boolean)
    )

    const attackerPresent = occupyingTeams.has(objectiveState.attackerId)
    const defenderPresent = occupyingTeams.has(objectiveState.defenderId)

    if (!attackerPresent) {
      building.captureProgress[objectiveState.attackerId] = 0
    }
    if (!defenderPresent) {
      building.captureProgress[objectiveState.defenderId] = 0
    }

    if (attackerPresent && defenderPresent) {
      G.log.push(`${building.label} is contested.`)
      return
    }

    const occupyingTeam = attackerPresent ? objectiveState.attackerId : defenderPresent ? objectiveState.defenderId : null
    if (!occupyingTeam || occupyingTeam === building.owner) {
      return
    }

    const progress = building.captureProgress[occupyingTeam]
    if (progress >= CAPTURE_TURNS) {
      building.owner = occupyingTeam
      building.captureProgress[occupyingTeam] = CAPTURE_TURNS
      const otherTeam = occupyingTeam === objectiveState.attackerId ? objectiveState.defenderId : objectiveState.attackerId
      building.captureProgress[otherTeam] = 0
      G.log.push(`${getTeamLabel(occupyingTeam)} captured ${building.label}!`)
      if (G.battleStats) {
        G.battleStats.objectiveCaptures = G.battleStats.objectiveCaptures || []
        G.battleStats.objectiveCaptures.push({
          team: occupyingTeam,
          building: building.label,
          turn: G.turn || 1,
          at: Date.now(),
        })
      }
      return
    }

    building.captureProgress[occupyingTeam] = Math.min(CAPTURE_TURNS, progress + 1)
    G.log.push(`${getTeamLabel(occupyingTeam)} is capturing ${building.label} (${building.captureProgress[occupyingTeam]}/${CAPTURE_TURNS}).`)
  })
}

export const getMap4VictoryInfo = ({ G, teamMode = false, turn = 1 }) => {
  if (!G?.map4ObjectiveState?.enabled) return null

  const aliveUnits = (G.units || []).filter((u) => u.currentHP > 0)
  const redAlive = aliveUnits.filter((u) => (teamMode ? getTeamId(u.ownerID) === 'red-yellow' : u.ownerID === '1')).length
  const blueAlive = aliveUnits.filter((u) => (teamMode ? getTeamId(u.ownerID) === 'blue-green' : u.ownerID === '0')).length

  const buildings = Object.values(G.map4ObjectiveState.buildings)
  const attackerControlsAll = buildings.every((building) => building.owner === G.map4ObjectiveState.attackerId)
  const defenderControlsAny = buildings.some((building) => building.owner === G.map4ObjectiveState.defenderId)

  if (attackerControlsAll && turn < G.map4ObjectiveState.turnLimit) {
    return {
      winner: G.map4ObjectiveState.attackerId,
      winnerTeam: G.map4ObjectiveState.attackerId,
      teamMode,
      turn,
      victoryType: 'objective_capture',
      message: `${getTeamLabel(G.map4ObjectiveState.attackerId)} wins by capturing all objectives!`,
    }
  }


  if (turn >= G.map4ObjectiveState.turnLimit && defenderControlsAny) {
    return {
      winner: G.map4ObjectiveState.defenderId,
      winnerTeam: G.map4ObjectiveState.defenderId,
      teamMode,
      turn,
      victoryType: 'objective_defense',
      message: `${getTeamLabel(G.map4ObjectiveState.defenderId)} wins by defending at least one objective until turn ${G.map4ObjectiveState.turnLimit}!`,
    }
  }

  if (redAlive === 0) {
    return {
      winner: G.map4ObjectiveState.defenderId,
      winnerTeam: G.map4ObjectiveState.defenderId,
      teamMode,
      turn,
      victoryType: 'elimination',
      message: `${getTeamLabel(G.map4ObjectiveState.defenderId)} wins by eliminating all attackers!`,
    }
  }

  if (blueAlive === 0) {
    return {
      winner: G.map4ObjectiveState.attackerId,
      winnerTeam: G.map4ObjectiveState.attackerId,
      teamMode,
      turn,
      victoryType: 'elimination',
      message: `${getTeamLabel(G.map4ObjectiveState.attackerId)} wins by eliminating all defenders!`,
    }
  }

  return null
}
