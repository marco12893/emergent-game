export const PLAYER_COLORS = {
  '0': 'blue',
  '1': 'red',
  '2': 'green',
  '3': 'yellow',
}

export const TEAM_IDS = {
  '0': 'blue-green',
  '2': 'blue-green',
  '1': 'red-yellow',
  '3': 'red-yellow',
}

export const TEAM_PLAY_ORDER = ['0', '2', '1', '3']

export const TEAM_LABELS = {
  'blue-green': 'Blue & Green',
  'red-yellow': 'Red & Yellow',
}

export const getPlayerColor = (playerID) => PLAYER_COLORS[playerID] || 'blue'

export const getTeamId = (playerID) => TEAM_IDS[playerID] || 'neutral'

export const areAllies = (playerA, playerB) => {
  if (playerA === undefined || playerB === undefined) return false
  return getTeamId(playerA) === getTeamId(playerB)
}

export const getTeamPlayOrder = (numPlayers) =>
  TEAM_PLAY_ORDER.filter((id) => Number(id) < numPlayers)

export const getTeamLabel = (teamId) => TEAM_LABELS[teamId] || 'Unknown Team'

const BLUE_BASE_TINTS = {
  green: 'hue-rotate(90deg) saturate(1.2)',
  red: 'hue-rotate(200deg) saturate(1.2)',
  yellow: 'hue-rotate(60deg) saturate(1.35) brightness(1.05)',
}

const RED_BASE_TINTS = {
  yellow: 'hue-rotate(50deg) saturate(1.25) brightness(1.05)',
  green: 'hue-rotate(140deg) saturate(1.1)',
  blue: 'hue-rotate(200deg) saturate(1.1)',
}

export const getUnitSpriteProps = (unit, playerID) => {
  const unitImage = unit?.image || 'swordsman'
  const teamColor = getPlayerColor(playerID)
  const isShip = ['transport', 'war_galley'].includes(unitImage)

  let baseColor = 'blue'
  if (isShip) {
    if (teamColor === 'yellow') {
      baseColor = 'red'
    } else if (teamColor === 'red') {
      baseColor = 'red'
    } else {
      baseColor = 'blue'
    }
  }

  const src = `/units/${unitImage}_${baseColor}.png`

  if (teamColor === baseColor) {
    return { src, filter: 'none' }
  }

  if (baseColor === 'blue') {
    return { src, filter: BLUE_BASE_TINTS[teamColor] || 'none' }
  }

  if (baseColor === 'red') {
    return { src, filter: RED_BASE_TINTS[teamColor] || 'none' }
  }

  return { src, filter: 'none' }
}
