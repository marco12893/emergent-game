/**
 * Input Sanitization Utilities
 * Prevents SQL injection, XSS, and other injection attacks
 */

/**
 * Sanitize game ID - allows only alphanumeric, hyphens, and underscores
 * @param {string} gameId - The game ID to sanitize
 * @returns {string} - Sanitized game ID
 */
export function sanitizeGameId(gameId) {
  if (!gameId || typeof gameId !== 'string') {
    return ''
  }
  
  // Remove any characters that aren't alphanumeric, hyphens, or underscores
  // Also limit length to prevent DoS attacks
  const sanitized = gameId
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .substring(0, 50)
    .trim()
  
  return sanitized
}

/**
 * Sanitize player ID - allows only '0', '1', or 'spectator' for this game
 * @param {string} playerID - The player ID to sanitize
 * @returns {string|null} - Sanitized player ID or null if invalid
 */
export function sanitizePlayerID(playerID) {
  if (
    playerID === '0' ||
    playerID === '1' ||
    playerID === '2' ||
    playerID === '3' ||
    playerID === 'spectator'
  ) {
    return playerID
  }
  return null
}

/**
 * Sanitize player name - allows letters, numbers, spaces, hyphens, and underscores
 * @param {string} playerName - The player name to sanitize
 * @returns {string} - Sanitized player name
 */
export function sanitizePlayerName(playerName) {
  if (!playerName || typeof playerName !== 'string') {
    return ''
  }

  const sanitized = playerName
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .substring(0, 24)
    .trim()

  return sanitized
}

/**
 * Sanitize unit ID - allows only alphanumeric characters
 * @param {string} unitId - The unit ID to sanitize
 * @returns {string} - Sanitized unit ID
 */
export function sanitizeUnitId(unitId) {
  if (!unitId || typeof unitId !== 'string') {
    return ''
  }
  
  // Allow only alphanumeric characters for unit IDs
  const sanitized = unitId
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 50)
    .trim()
  
  return sanitized
}

/**
 * Sanitize unit type - validates against allowed unit types
 * @param {string} unitType - The unit type to sanitize
 * @returns {string|null} - Validated unit type or null if invalid
 */
export function sanitizeUnitType(unitType) {
  if (!unitType || typeof unitType !== 'string') {
    return null
  }
  
  const allowedUnitTypes = [
    'SWORDSMAN', 'ARCHER', 'KNIGHT', 'MILITIA', 'CATAPULT', 'WAR_GALLEY'
  ]
  
  const sanitized = unitType
    .replace(/[^a-zA-Z_]/g, '')
    .toUpperCase()
    .trim()
  
  return allowedUnitTypes.includes(sanitized) ? sanitized : null
}

/**
 * Sanitize coordinates - ensures they are valid integers
 * @param {number|string} coord - The coordinate to sanitize
 * @returns {number|null} - Sanitized coordinate or null if invalid
 */
export function sanitizeCoordinate(coord) {
  const num = parseInt(coord, 10)
  
  if (isNaN(num) || !isFinite(num)) {
    return null
  }
  
  // Limit coordinate range to prevent overflow issues
  if (Math.abs(num) > 100) {
    return null
  }
  
  return num
}

/**
 * Sanitize action type - validates against allowed actions
 * @param {string} action - The action to sanitize
 * @returns {string|null} - Validated action or null if invalid
 */
export function sanitizeAction(action) {
  if (!action || typeof action !== 'string') {
    return null
  }
  
  const allowedActions = [
    'placeUnit', 'removeUnit', 'moveUnit', 'undoMove', 'attackUnit', 'endTurn', 'readyForBattle',
    'selectUnit', 'deselectUnit', 'toggleRetreatMode', 'retreatUnit', 'sendChat',
    'claimSlot', 'startBattle', 'setFogOfWar'
  ]
  
  const sanitized = action
    .replace(/[^a-zA-Z]/g, '')
    .trim()
  
  return allowedActions.includes(sanitized) ? sanitized : null
}

/**
 * Sanitize chat message - strips control characters and HTML brackets
 * @param {string} message - The chat message to sanitize
 * @returns {string} - Sanitized message
 */
export function sanitizeChatMessage(message) {
  if (!message || typeof message !== 'string') {
    return ''
  }

  const sanitized = message
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .substring(0, 120)
    .trim()

  return sanitized
}

/**
 * Sanitize map ID - validates against allowed map identifiers
 * @param {string} mapId - The map ID to sanitize
 * @returns {string|null} - Validated map ID or null if invalid
 */
export function sanitizeMapId(mapId) {
  if (!mapId || typeof mapId !== 'string') {
    return null
  }

  const allowedMapIds = ['MAP_1', 'MAP_2', 'MAP_3']
  const sanitized = mapId
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toUpperCase()
    .trim()

  return allowedMapIds.includes(sanitized) ? sanitized : null
}

/**
 * Sanitize winter flag - ensures boolean value
 * @param {boolean|string} winter - The winter flag to sanitize
 * @returns {boolean} - Sanitized winter flag
 */
export function sanitizeWinterFlag(winter) {
  if (winter === true || winter === 'true') {
    return true
  }
  return false
}

/**
 * Sanitize team mode flag - ensures boolean value
 * @param {boolean|string} teamMode - The team mode flag to sanitize
 * @returns {boolean} - Sanitized team mode flag
 */
export function sanitizeTeamModeFlag(teamMode) {
  if (teamMode === true || teamMode === 'true') {
    return true
  }
  return false
}

/**
 * Validate and sanitize request payload
 * @param {object} payload - The request payload to validate
 * @param {object} schema - Validation schema
 * @returns {object} - Sanitized payload or error
 */
export function validatePayload(payload, schema) {
  if (!payload || typeof payload !== 'object') {
    return { error: 'Invalid payload format' }
  }
  
  const sanitized = {}
  const errors = []
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = payload[key]
    
    if (rules.required && (value === undefined || value === null)) {
      errors.push(`Missing required field: ${key}`)
      continue
    }
    
    if (value !== undefined && rules.sanitize) {
      const sanitizedValue = rules.sanitize(value)
      if (sanitizedValue === null && rules.required) {
        errors.push(`Invalid value for field: ${key}`)
      } else if (sanitizedValue !== null) {
        sanitized[key] = sanitizedValue
      }
    } else if (value !== undefined) {
      sanitized[key] = value
    }
  }
  
  if (errors.length > 0) {
    return { error: errors.join(', ') }
  }
  
  return { sanitized }
}
