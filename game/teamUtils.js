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

export const getUnitSpriteProps = (unit, playerID) => {
  const unitImage = unit?.image || 'swordsman'
  const teamColor = getPlayerColor(playerID)
  const src = `/units/${unitImage}_${teamColor}.png`

  return { src, filter: 'none' }
}
