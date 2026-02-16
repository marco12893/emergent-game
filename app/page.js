'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { UNIT_TYPES, TERRAIN_TYPES, getDeployableHexes, getReachableHexes, getVisibleHexesForPlayer, getVisibleUnitsForPlayer, getRetreatActivationTurn, getRetreatZoneForPlayer } from '@/game/GameLogic'
import { areAllies, getPlayerColor, getTeamId, getUnitSpriteProps } from '@/game/teamUtils'
import { DEFAULT_MAP_ID, MAPS } from '@/game/maps'
import GameBoard from '@/components/GameBoard'
import VictoryScreen from '@/components/VictoryScreen'
import ConfirmDialog from '@/components/ConfirmDialog'
import MapBuilderModal from '@/components/MapBuilderModal'
import { parseImportedCustomMap } from '@/lib/customMap'

const DAMAGE_VARIANCE_MIN = 0.8
const DAMAGE_VARIANCE_MAX = 1.2
const SLOT_COLOR_CLASSES = {
  '0': 'border-blue-400/80 bg-blue-500/15 shadow-[0_0_18px_rgba(59,130,246,0.35)]',
  '1': 'border-red-400/80 bg-red-500/15 shadow-[0_0_18px_rgba(248,113,113,0.35)]',
  '2': 'border-green-400/80 bg-green-500/15 shadow-[0_0_18px_rgba(74,222,128,0.35)]',
  '3': 'border-yellow-300/80 bg-yellow-400/15 shadow-[0_0_18px_rgba(253,224,71,0.35)]',
}

// Landscape detection component
const LandscapePrompt = () => {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }

    checkOrientation()
    window.addEventListener('resize', checkOrientation)
    window.addEventListener('orientationchange', checkOrientation)

    return () => {
      window.removeEventListener('resize', checkOrientation)
      window.removeEventListener('orientationchange', checkOrientation)
    }
  }, [])

  if (!isPortrait) return null

  return (
    <div className="fixed inset-0 bg-slate-900 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-sm text-center">
        <div className="text-4xl mb-4">📱</div>
        <h2 className="text-xl font-bold text-white mb-2">Please Rotate Your Device</h2>
        <p className="text-slate-300 mb-4">
          This game is best experienced in landscape mode for optimal gameplay and controls.
        </p>
        <div className="flex items-center justify-center gap-2 text-amber-400">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="text-sm font-semibold">Rotate to landscape</span>
        </div>
      </div>
    </div>
  )
}

// Unit Info Panel Component
const UnitInfoPanel = ({ unit, isSelected }) => {
  if (!unit) return null
  
  const hpPercent = (unit.currentHP / unit.maxHP) * 100
  const hpColor = hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500'
  const { src, filter } = getUnitSpriteProps(unit, unit.ownerID)
  const playerColor = getPlayerColor(unit.ownerID)
  
  return (
    <div className={`p-3 rounded-lg border-2 transition-all ${
      isSelected ? 'border-amber-400 bg-amber-400/10' : 'border-slate-600 bg-slate-800/50'
    }`}>
      <div className="flex items-center gap-3 mb-2">
        <img 
          src={src}
          className="w-8 h-8"
          style={{ filter }}
          alt={unit.name || 'Unit'}
        />
        <div>
          <div className="font-semibold text-white">{unit.name || 'Unit'}</div>
          <div className="text-xs text-slate-400">Player {unit.ownerID} ({playerColor})</div>
        </div>
      </div>
      
      {/* HP Bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>HP</span>
          <span>{unit.currentHP}/{unit.maxHP}</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-2">
          <div 
            className={`${hpColor} h-2 rounded-full transition-all`}
            style={{ width: `${hpPercent}%` }}
          />
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-red-400">⚔️ {unit.attackPower}</div>
          <div className="text-slate-500">ATK</div>
        </div>
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-blue-400">👟 {unit.movePoints}</div>
          <div className="text-slate-500">MOV</div>
        </div>
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-purple-400">🎯 {unit.range}</div>
          <div className="text-slate-500">RNG</div>
        </div>
        <div className="bg-slate-700/50 p-1.5 rounded text-center">
          <div className="text-green-400">🛡️ {unit.maxMovePoints}</div>
          <div className="text-slate-500">MAX</div>
        </div>
      </div>
      
      {/* Action Status */}
      {(unit.hasMoved || unit.hasAttacked) && (
        <div className="text-xs text-slate-400">
          {unit.hasMoved && <span className="mr-2">✓ Moved</span>}
          {unit.hasAttacked && <span>✓ Attacked</span>}
        </div>
      )}
    </div>
  )
}


const KNIGHT_PENALTY_TERRAINS = new Set(['CITY', 'CASTLE', 'BARRACKS', 'CATHEDRAL', 'MOSQUE', 'HOSPITAL', 'UNIVERSITY', 'LIBRARY', 'FARM'])

const getUnitSpecialNotes = (unitType) => {
  if (unitType === 'ARCHER' || unitType === 'CATAPULT') return ['+5 attack while standing on Hills.']
  if (unitType === 'KNIGHT') {
    return [
      'Deals 25% less damage on City/Building tiles.',
      'Moving into City/Building tiles costs 2 movement points.',
    ]
  }
  return []
}

const getObjectiveText = (mapId) => (['MAP_1', 'MAP_2', 'MAP_3'].includes(mapId) ? 'Defeat the enemy force.' : null)

const createReconnectKey = () => {
  if (typeof window === 'undefined') return ''
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, '')
  }
  return `${Date.now()}${Math.random().toString(36).slice(2, 12)}`
}

export default function HTTPMultiplayerPage() {
  const [gameState, setGameState] = useState(null)
  const [playerID, setPlayerID] = useState('')
  const [matchID, setMatchID] = useState('')
  const [joined, setJoined] = useState(false)
  const [playerName, setPlayerName] = useState('')
  const [lobbyGames, setLobbyGames] = useState([])
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [selectedMapId, setSelectedMapId] = useState(DEFAULT_MAP_ID)
  const [customMapConfig, setCustomMapConfig] = useState(null)
  const [showMapBuilder, setShowMapBuilder] = useState(false)
  const [storedSession, setStoredSession] = useState(null)
  const [selectedUnitType, setSelectedUnitType] = useState('SWORDSMAN')
  const [error, setError] = useState('')
  const errorTimeoutRef = useRef(null)
  const identityTransitionRef = useRef({ pending: false, until: 0 })
  const [loading, setLoading] = useState(false)
  const [highlightedHexes, setHighlightedHexes] = useState([])
  const [attackableHexes, setAttackableHexes] = useState([])
  const [hoveredHex, setHoveredHex] = useState(null)
  const [damagePreview, setDamagePreview] = useState(null)
  const [showVictoryScreen, setShowVictoryScreen] = useState(true) // Default to true, can be closed
  const [selectedUnitForInfoId, setSelectedUnitForInfoId] = useState(null) // New state for unit info display
  const [showUnitInfoPopup, setShowUnitInfoPopup] = useState(null) // New state for unit info popup
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false) // State for collapsible left panel
  const [showReadyConfirm, setShowReadyConfirm] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [forceLobbySelection, setForceLobbySelection] = useState(false)
  const [kickedOutNotice, setKickedOutNotice] = useState('')
  const [nowTs, setNowTs] = useState(Date.now())
  const [spectatorVision, setSpectatorVision] = useState('all')
  const [copyStatus, setCopyStatus] = useState('')
  const [isObserverPanelOpen, setIsObserverPanelOpen] = useState(true)
  const [setupControlPlayerID, setSetupControlPlayerID] = useState('')
  const chatInputRef = useRef(null)
  const isSpectator = useMemo(() => {
    if (playerID === 'spectator') return true
    if (!playerID || !gameState) return false
    if (gameState.players?.[playerID]) return false
    return (gameState.spectators || []).some((spectator) => spectator?.id === playerID)
  }, [playerID, gameState])
  const isWaitlisted = useMemo(() => {
    if (!playerID || !gameState) return false
    if (gameState.players?.[playerID]) return false
    return (gameState.waitlist || []).some((entry) => entry?.id === playerID)
  }, [playerID, gameState])
  const isObserver = isSpectator || isWaitlisted
  const isMyTurn = !isObserver && gameState?.currentPlayer === playerID
  const playerColor = getPlayerColor(playerID)
  const generalSprite = getUnitSpriteProps({ image: 'General' }, playerID)
  const teamMode = Boolean(gameState?.teamMode)
  const chatMessages = gameState?.chatMessages || []
  const shouldShowLobbySelection = forceLobbySelection || gameState?.phase === 'lobby'
  const isLobbyLeader = String(playerID) === String(gameState?.leaderId)
  const aiSetupControlSlots = useMemo(() => Object.entries(gameState?.players || {}).filter(([, participant]) => participant?.isAI).map(([id]) => id), [gameState?.players])
  const canLeaderControlAiSetup = gameState?.phase === 'setup' && isLobbyLeader && aiSetupControlSlots.length > 0
  const effectiveSetupPlayerID = canLeaderControlAiSetup
    ? (aiSetupControlSlots.includes(setupControlPlayerID) ? setupControlPlayerID : aiSetupControlSlots[0])
    : playerID

  const handleKickedOut = ({ message }) => {
    setJoined(false)
    setGameState(null)
    setPlayerID('')
    setForceLobbySelection(false)
    setKickedOutNotice(message || 'You were kicked from the match.')
    setStoredSession(null)
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('lobbySession')
    }
  }

  const returnToPreGameLobby = ({ notice } = {}) => {
    setJoined(false)
    setGameState(null)
    setPlayerID('')
    setForceLobbySelection(false)
    setMatchID('')
    setStoredSession(null)
    if (notice) {
      setKickedOutNotice(notice)
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('lobbySession')
    }
  }
  const fogOfWarEnabled = Boolean(gameState?.fogOfWarEnabled)
  const spectatorPovPlayerID = useMemo(() => {
    if (!isObserver) return playerID
    if (spectatorVision === 'all') return null
    return spectatorVision === 'blueGreen' ? '0' : '1'
  }, [isObserver, playerID, spectatorVision])
  const fogViewerID = isObserver ? spectatorPovPlayerID : playerID
  const fogActive = fogOfWarEnabled && gameState?.phase !== 'lobby' && Boolean(fogViewerID)

  const visibleHexes = useMemo(() => {
    if (!fogActive || !gameState) return null
    return getVisibleHexesForPlayer({
      units: gameState.units,
      hexes: gameState.hexes,
      terrainMap: gameState.terrainMap,
      playerID: fogViewerID,
      teamMode,
      deploymentZones: gameState.deploymentZones,
    })
  }, [fogActive, gameState, fogViewerID, teamMode])

  const visibleUnits = useMemo(() => {
    if (!gameState) return []
    if (!fogActive) return gameState.units || []
    return getVisibleUnitsForPlayer({
      units: gameState.units,
      hexes: gameState.hexes,
      terrainMap: gameState.terrainMap,
      playerID: fogViewerID,
      teamMode,
      deploymentZones: gameState.deploymentZones,
    })
  }, [fogActive, gameState, fogViewerID, teamMode])

  const selectedUnitForInfo = selectedUnitForInfoId
    ? visibleUnits.find(unit => unit.id === selectedUnitForInfoId)
    : null

  const retreatActivationTurn = useMemo(() => {
    if (!gameState?.mapId) return null
    return getRetreatActivationTurn(gameState.mapId)
  }, [gameState?.mapId])

  const retreatHexes = useMemo(() => {
    if (!gameState || gameState.phase !== 'battle' || !playerID || isObserver) return []
    const activationTurn = getRetreatActivationTurn(gameState.mapId)
    if ((gameState.turn || 1) < activationTurn) return []
    return getRetreatZoneForPlayer({
      hexes: gameState.hexes,
      mapWidth: gameState?.mapSize?.width || 6,
      playerID,
      teamMode,
    })
  }, [gameState, playerID, teamMode, isObserver])

  const selectedOwnedUnit = useMemo(() => {
    if (!gameState?.selectedUnitId) return null
    const unit = gameState.units.find(u => u.id === gameState.selectedUnitId)
    if (!unit || unit.ownerID !== playerID) return null
    return unit
  }, [gameState, playerID])

  const canRetreatSelectedUnit = useMemo(() => {
    if (!selectedOwnedUnit || gameState?.phase !== 'battle') return false
    return retreatHexes.some(h => h.q === selectedOwnedUnit.q && h.r === selectedOwnedUnit.r)
  }, [selectedOwnedUnit, gameState?.phase, retreatHexes])


  useEffect(() => {
    if (!canLeaderControlAiSetup) {
      if (setupControlPlayerID) setSetupControlPlayerID('')
      return
    }
    if (!aiSetupControlSlots.includes(setupControlPlayerID)) {
      setSetupControlPlayerID(aiSetupControlSlots[0] || '')
    }
  }, [canLeaderControlAiSetup, aiSetupControlSlots, setupControlPlayerID])

  const map4ObjectivePanel = useMemo(() => {
    const mapObjectiveText = getObjectiveText(gameState?.mapId)
    if (mapObjectiveText && gameState?.phase === 'battle') {
      return { title: mapObjectiveText, buildings: [] }
    }

    const objectiveState = gameState?.map4ObjectiveState
    if (!objectiveState?.enabled) return null

    const myTeam = teamMode ? getTeamId(playerID) : playerID
    const isDefenderView = myTeam === objectiveState.defenderId
    const isAttackerView = myTeam === objectiveState.attackerId
    const title = isDefenderView
      ? 'Defend for 40 turns or eliminate red/yellow.'
      : isAttackerView
        ? 'Capture cathedral, barracks, and castle or eliminate blue/green.'
        : 'Map 4 objectives'

    const buildings = Object.values(objectiveState.buildings || {})
    return {
      title,
      buildings: buildings.map((building) => {
        const viewerTeam = isDefenderView ? objectiveState.defenderId : objectiveState.attackerId
        const enemyTeam = viewerTeam === objectiveState.defenderId ? objectiveState.attackerId : objectiveState.defenderId
        const ownProgress = building.captureProgress?.[viewerTeam] || 0
        const enemyProgress = building.captureProgress?.[enemyTeam] || 0
        const progress = building.owner === viewerTeam
          ? Math.max(0, objectiveState.captureTurns - enemyProgress)
          : ownProgress
        return {
          label: building.label,
          owner: building.owner,
          progress,
          captureTurns: objectiveState.captureTurns,
        }
      }),
    }
  }, [gameState?.map4ObjectiveState, gameState?.mapId, gameState?.phase, playerID, teamMode])

  const advantageSummary = useMemo(() => {
    if (!gameState) return null
    const aliveUnits = (gameState.units || []).filter((unit) => unit.currentHP > 0)
    const blueHP = aliveUnits.filter((unit) => getTeamId(unit.ownerID) === 'blue-green').reduce((sum, unit) => sum + unit.currentHP, 0)
    const redHP = aliveUnits.filter((unit) => getTeamId(unit.ownerID) === 'red-yellow').reduce((sum, unit) => sum + unit.currentHP, 0)
    const objectiveBuildings = Object.values(gameState?.map4ObjectiveState?.buildings || {})
    const blueObjectives = objectiveBuildings.filter((building) => building.owner === (teamMode ? 'blue-green' : '0')).length
    const redObjectives = objectiveBuildings.filter((building) => building.owner === (teamMode ? 'red-yellow' : '1')).length
    return { blueHP, redHP, blueObjectives, redObjectives }
  }, [gameState, teamMode])

  const discordSummary = useMemo(() => {
    if (!gameState?.gameOver) return ''
    const gameOver = gameState.gameOver
    const winnerLabel = gameOver.draw ? 'Draw' : (gameOver.teamMode ? getTeamLabel(gameOver.winnerTeam) : `Player ${gameOver.winner}`)
    const aliveCounts = (gameState.units || []).reduce((acc, unit) => {
      if (unit.currentHP <= 0) return acc
      const key = teamMode ? getTeamId(unit.ownerID) : unit.ownerID
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const initialCounts = gameState?.battleStats?.initialUnitCounts || {}
    const losses = Object.keys(initialCounts).reduce((acc, ownerId) => {
      const alive = (gameState.units || []).filter((unit) => unit.currentHP > 0 && unit.ownerID === ownerId).length
      const retreated = (gameState.retreatedUnits || []).filter((unit) => unit.ownerID === ownerId).length
      acc[ownerId] = Math.max(0, (initialCounts[ownerId] || 0) - alive - retreated)
      return acc
    }, {})
    const firstKill = gameState?.battleStats?.firstKill
    const retreatCounts = gameState?.battleStats?.retreatCounts || {}
    const objectiveCaptures = gameState?.battleStats?.objectiveCaptures || []
    const survivorList = (gameState.units || []).filter((unit) => unit.currentHP > 0).map((unit) => `${unit.name}(P${unit.ownerID})`).join(', ') || 'None'
    const retreatedList = (gameState.retreatedUnits || []).map((unit) => `${unit.name}(P${unit.ownerID})`).join(', ') || 'None'

    return [
      `🏁 Winner: ${winnerLabel} (${gameOver.victoryType})`,
      `⏱️ Turns: ${gameOver.turn || gameState.turn || 1}`,
      `💀 Units lost: ${Object.entries(losses).map(([owner, count]) => `P${owner}:${count}`).join(' | ') || 'N/A'}`,
      `🔑 Key events: first kill ${firstKill ? `T${firstKill.turn} P${firstKill.attacker} defeated ${firstKill.unit}` : 'none'}; objective captures ${objectiveCaptures.length}; retreats ${Object.values(retreatCounts).reduce((a, b) => a + b, 0)}`,
      `🛡️ Survivors: ${survivorList}`,
      `🏃 Retreated: ${retreatedList}`,
    ].join('\n')
  }, [gameState, teamMode])

  const copyDiscordSummary = async () => {
    if (!discordSummary) return
    try {
      await navigator.clipboard.writeText(discordSummary)
      setCopyStatus('Copied summary for Discord!')
      setTimeout(() => setCopyStatus(''), 1800)
    } catch (error) {
      setCopyStatus('Copy failed. Please copy manually from the victory screen.')
      setTimeout(() => setCopyStatus(''), 2200)
    }
  }

  const getChatSenderClass = (message) => {
    if (message?.playerID === '0') return 'text-blue-400'
    if (message?.playerID === '1') return 'text-red-400'
    if (message?.playerID === 'spectator') return 'text-slate-300'
    return 'text-amber-300'
  }
  
  // Dynamic server URL for production
  const getServerUrl = () => {
    if (typeof window !== 'undefined') {
      return process.env.NODE_ENV === 'production' 
        ? window.location.origin
        : 'http://localhost:3000'
    }
    return 'http://localhost:3000' // Fallback for SSR
  }
  
  const [serverUrl, setServerUrl] = useState(getServerUrl())
  
  // Update server URL on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerUrl(getServerUrl())
    }
  }, [])

  useEffect(() => {
    if (isChatOpen) {
      chatInputRef.current?.focus()
    }
  }, [isChatOpen])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleKeyDown = (event) => {
      if (!joined) return
      if (event.key === 'Enter' && !event.shiftKey) {
        const activeTag = document.activeElement?.tagName
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
          return
        }
        event.preventDefault()
        setIsChatOpen(true)
      }
      if (event.key === 'Escape' && isChatOpen) {
        setIsChatOpen(false)
        setChatInput('')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [joined, isChatOpen])

  useEffect(() => {
    if (!selectedUnitForInfoId || !gameState?.units) return
    const latestUnit = visibleUnits.find(unit => unit.id === selectedUnitForInfoId)
    if (!latestUnit || latestUnit.currentHP <= 0) {
      setSelectedUnitForInfoId(null)
    }
  }, [gameState, selectedUnitForInfoId, visibleUnits])

  useEffect(() => {
    if (!error) return undefined
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current)
    }
    errorTimeoutRef.current = setTimeout(() => {
      setError('')
      errorTimeoutRef.current = null
    }, 3000)
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
      }
    }
  }, [error])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedSession = JSON.parse(sessionStorage.getItem('lobbySession') || 'null')
      if (savedSession?.playerName) {
        setPlayerName(savedSession.playerName)
      }
      if (savedSession?.matchID) {
        setStoredSession(savedSession)
      }
    } catch (error) {
      console.error('Failed to read lobby session:', error)
    }
  }, [])

  const fetchLobbyGames = async () => {
    if (!serverUrl || joined) return
    setLobbyLoading(true)
    try {
      const response = await fetch(`${serverUrl}/api/lobby`)
      if (response.ok) {
        const data = await response.json()
        setLobbyGames(data.games || [])
      }
    } catch (err) {
      console.error('Failed to load lobby games:', err)
    } finally {
      setLobbyLoading(false)
    }
  }

  useEffect(() => {
    if (!serverUrl || joined) return
    fetchLobbyGames()
    const interval = setInterval(fetchLobbyGames, 3000)
    return () => clearInterval(interval)
  }, [serverUrl, joined])

  // Poll for game state updates
  useEffect(() => {
    if (!joined || !matchID || !serverUrl) return

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${serverUrl}/api/game/${matchID}`)
        if (response.ok) {
          const state = await response.json()
          setGameState(state)

          const currentPlayers = state?.players || {}
          const currentSpectators = state?.spectators || []
          const currentWaitlist = state?.waitlist || []
          const isKnownPlayer = Boolean(currentPlayers[playerID])
          const isKnownSpectator = currentSpectators.some((spectator) => spectator?.id === playerID)
          const isKnownWaitlist = currentWaitlist.some((entry) => entry?.id === playerID)
          const isStillInMatch = !playerID ? true : (isKnownPlayer || isKnownSpectator || isKnownWaitlist)
          if (isStillInMatch) {
            identityTransitionRef.current = { pending: false, until: 0 }
          }
          if (!isStillInMatch) {
            const now = Date.now()
            const transitionPending = identityTransitionRef.current.pending && identityTransitionRef.current.until > now
            if (transitionPending) {
              return
            }
            handleKickedOut({ message: 'You were kicked from this match. Rejoin from the lobby if you want to play again.' })
            return
          }
          
          // Update highlighting when game state changes
          if (state.phase === 'battle' && state.selectedUnitId) {
            const selectedUnit = state.units.find(u => u.id === state.selectedUnitId)
            if (selectedUnit && selectedUnit.ownerID === playerID) {
              const reachable = selectedUnit.hasMoved
                ? []
                : getReachableHexes(selectedUnit, state.hexes, state.units, state.terrainMap)

              // Calculate attackable hexes (enemy units + destructible walls)
              const isFogActive = Boolean(state.fogOfWarEnabled) && state.phase === 'battle' && playerID !== 'spectator'
              const currentVisibleUnits = isFogActive
                ? getVisibleUnitsForPlayer({
                    units: state.units,
                    hexes: state.hexes,
                    terrainMap: state.terrainMap,
                    playerID: isObserver ? 'spectator' : playerID,
                    teamMode,
                  })
                : state.units
              const attackable = []

              if (!selectedUnit.hasAttacked) {
                for (const unit of currentVisibleUnits) {
                  if (unit.currentHP <= 0) continue
                  if (teamMode ? areAllies(unit.ownerID, playerID) : unit.ownerID === playerID) continue

                  const distance = Math.max(
                    Math.abs(selectedUnit.q - unit.q),
                    Math.abs(selectedUnit.r - unit.r),
                    Math.abs(selectedUnit.s - unit.s)
                  )

                  if (distance <= selectedUnit.range) {
                    attackable.push({ q: unit.q, r: unit.r, s: unit.s })
                  }
                }

                for (const hex of state.hexes) {
                  if ((state.terrainMap[`${hex.q},${hex.r}`] || 'PLAIN') !== 'WALL') continue

                  const distance = Math.max(
                    Math.abs(selectedUnit.q - hex.q),
                    Math.abs(selectedUnit.r - hex.r),
                    Math.abs(selectedUnit.s - hex.s)
                  )

                  if (distance <= selectedUnit.range) {
                    attackable.push({ q: hex.q, r: hex.r, s: hex.s })
                  }
                }
              }
              
              setHighlightedHexes(reachable)
              setAttackableHexes(attackable)
            }
          } else if (state.phase !== 'setup') {
            setHighlightedHexes([])
            setAttackableHexes([])
          }
        } else if (response.status === 410) {
          const data = await response.json().catch(() => ({}))
          returnToPreGameLobby({
            notice: data?.message || 'This game has been disbanded by the lobby leader.',
          })
        }
      } catch (err) {
        console.error('Failed to poll game state:', err)
      }
    }, 1000) // Poll every second

    return () => clearInterval(pollInterval)
  }, [joined, matchID, playerID, playerName])

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now())
    }, 250)

    return () => clearInterval(interval)
  }, [])

  const turnTimer = useMemo(() => {
    const startedAt = Number(gameState?.turnStartedAt)
    const limitSeconds = Number(gameState?.turnTimeLimitSeconds)
    if (gameState?.phase !== 'battle' || !Number.isFinite(startedAt) || !Number.isFinite(limitSeconds) || limitSeconds <= 0) {
      return null
    }

    const endAt = startedAt + (limitSeconds * 1000)
    const remainingMs = Math.max(0, endAt - nowTs)
    const remainingSeconds = Math.ceil(remainingMs / 1000)

    return {
      remainingSeconds,
      totalSeconds: limitSeconds,
      percent: limitSeconds > 0 ? (remainingMs / (limitSeconds * 1000)) * 100 : 0,
    }
  }, [gameState?.phase, gameState?.turnStartedAt, gameState?.turnTimeLimitSeconds, nowTs])

  const currentTurnColorClass = useMemo(() => {
    const color = getPlayerColor(gameState?.currentPlayer)
    if (color === 'blue') return 'text-blue-400'
    if (color === 'green') return 'text-green-400'
    if (color === 'yellow') return 'text-yellow-300'
    return 'text-red-400'
  }, [gameState?.currentPlayer])

  const currentTurnBarClass = useMemo(() => {
    const color = getPlayerColor(gameState?.currentPlayer)
    if (color === 'blue') return 'bg-blue-500'
    if (color === 'green') return 'bg-green-500'
    if (color === 'yellow') return 'bg-yellow-400'
    return 'bg-red-500'
  }, [gameState?.currentPlayer])

  useEffect(() => {
    if (!gameState || gameState.phase !== 'setup') return
    if (!isMyTurn && !canLeaderControlAiSetup) {
      setHighlightedHexes([])
      setAttackableHexes([])
      return
    }
    const mapWidth = gameState?.mapSize?.width || 6
    const deployableHexes = getDeployableHexes({
      unitType: selectedUnitType,
      hexes: gameState.hexes,
      units: gameState.units,
      terrainMap: gameState.terrainMap,
      playerID,
      mapWidth,
      teamMode,
      deploymentZones: gameState.deploymentZones,
    })
    setHighlightedHexes(deployableHexes)
    setAttackableHexes([])
  }, [gameState, isMyTurn, canLeaderControlAiSetup, effectiveSetupPlayerID, selectedUnitType, teamMode])

  useEffect(() => {
    if (!gameState || !hoveredHex || gameState.phase !== 'battle' || !isMyTurn) {
      setDamagePreview(null)
      return
    }

    const selectedUnit = gameState.selectedUnitId
      ? gameState.units.find(u => u.id === gameState.selectedUnitId)
      : null

    if (!selectedUnit || selectedUnit.ownerID !== playerID || selectedUnit.hasAttacked) {
      setDamagePreview(null)
      return
    }

    const targetUnit = visibleUnits.find(u => {
      if (u.q !== hoveredHex.q || u.r !== hoveredHex.r || u.currentHP <= 0) return false
      return teamMode ? !areAllies(u.ownerID, playerID) : u.ownerID !== playerID
    })

    if (!targetUnit) {
      setDamagePreview(null)
      return
    }

    const distance = Math.max(
      Math.abs(selectedUnit.q - targetUnit.q),
      Math.abs(selectedUnit.r - targetUnit.r),
      Math.abs(selectedUnit.s - targetUnit.s)
    )

    if (distance > selectedUnit.range) {
      setDamagePreview(null)
      return
    }

    const targetTerrain = gameState.terrainMap[`${targetUnit.q},${targetUnit.r}`] || 'PLAIN'
    const defenseBonus = TERRAIN_TYPES[targetTerrain]?.defenseBonus ?? 0
    const attackerTerrain = gameState.terrainMap[`${selectedUnit.q},${selectedUnit.r}`] || 'PLAIN'
    const hillBonus = attackerTerrain === 'HILLS' && ['ARCHER', 'CATAPULT'].includes(selectedUnit.type)
      ? 5
      : 0
    const knightTerrainPenalty = selectedUnit.type === 'KNIGHT' && KNIGHT_PENALTY_TERRAINS.has(attackerTerrain) ? 0.75 : 1
    const baseDamage = Math.round((selectedUnit.attackPower + hillBonus) * knightTerrainPenalty)

    const hpPercentage = selectedUnit.currentHP / selectedUnit.maxHP
    let damageMultiplier = 1.0
    if (hpPercentage > 0.75) {
      damageMultiplier = 1.0
    } else if (hpPercentage > 0.5) {
      damageMultiplier = 0.85
    } else if (hpPercentage > 0.25) {
      damageMultiplier = 0.70
    } else {
      damageMultiplier = 0.50
    }

    const moraleMultiplier = selectedUnit.morale === 'LOW' ? 0.8 : selectedUnit.morale === 'HIGH' ? 1.2 : 1.0
    const reducedDamage = Math.round(baseDamage * damageMultiplier * moraleMultiplier)
    const attackDamageMin = Math.max(1, Math.round(reducedDamage * DAMAGE_VARIANCE_MIN) - defenseBonus)
    const attackDamageMax = Math.max(1, Math.round(reducedDamage * DAMAGE_VARIANCE_MAX) - defenseBonus)
    const targetRemaining = targetUnit.currentHP - attackDamageMin

    let counterDamageMin = 0
    let counterDamageMax = 0
    if (targetRemaining > 0 && distance <= targetUnit.range) {
      if (targetUnit.type !== 'CATAPULT' || targetUnit.isTransport) {
        const targetHpPercentage = targetRemaining / targetUnit.maxHP
        let targetDamageMultiplier = 1.0
        if (targetHpPercentage > 0.75) {
          targetDamageMultiplier = 1.0
        } else if (targetHpPercentage > 0.5) {
          targetDamageMultiplier = 0.85
        } else if (targetHpPercentage > 0.25) {
          targetDamageMultiplier = 0.70
        } else {
          targetDamageMultiplier = 0.50
        }

        const meleePenaltyMultiplier = targetUnit.type === 'ARCHER' && distance === 1 ? 0.5 : 1.0
        const targetMoraleMultiplier = targetUnit.morale === 'LOW' ? 0.8 : targetUnit.morale === 'HIGH' ? 1.2 : 1.0
        const targetReducedDamage = Math.round(
          targetUnit.attackPower * targetDamageMultiplier * meleePenaltyMultiplier * targetMoraleMultiplier
        )
        const attackerDefenseBonus = TERRAIN_TYPES[attackerTerrain]?.defenseBonus ?? 0
        counterDamageMin = Math.max(1, Math.round(targetReducedDamage * DAMAGE_VARIANCE_MIN) - attackerDefenseBonus)
        counterDamageMax = Math.max(1, Math.round(targetReducedDamage * DAMAGE_VARIANCE_MAX) - attackerDefenseBonus)
      }
    }

    setDamagePreview({
      attackerId: selectedUnit.id,
      targetId: targetUnit.id,
      attackDamage: attackDamageMin,
      counterDamage: counterDamageMin,
      attackDamageMin,
      attackDamageMax,
      counterDamageMin,
      counterDamageMax,
    })
  }, [gameState, hoveredHex, isMyTurn, playerID, teamMode, visibleUnits])

  const joinLobbyGame = async (gameId, requestedPlayerID, mapId) => {
    if (!gameId) {
      setError('Lobby ID not found.')
      return
    }

    const fallbackPlayerID = storedSession?.matchID === gameId ? storedSession.playerID : undefined
    const fallbackReconnectKey = storedSession?.matchID === gameId ? storedSession.reconnectKey : ''
    const resolvedPlayerID = requestedPlayerID ?? fallbackPlayerID
    const resolvedReconnectKey = fallbackReconnectKey || createReconnectKey()

    setLoading(true)
    setError('')

    try {
      const payload = {
        gameId,
        playerName: playerName || undefined,
        mapId: mapId || undefined,
      }
      if (mapId === 'CUSTOM' && customMapConfig) {
        payload.customMap = customMapConfig
      }
      if (resolvedPlayerID !== undefined && resolvedPlayerID !== null) {
        payload.playerID = resolvedPlayerID
      }
      if (resolvedReconnectKey) {
        payload.reconnectKey = resolvedReconnectKey
      }

      const response = await fetch(`${serverUrl}/api/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
        setPlayerID(data.playerID)
        setMatchID(gameId)
        setJoined(true)
        setKickedOutNotice('')
        const joinedAsPlayer = Boolean(data.gameState?.players?.[data.playerID])
        setForceLobbySelection(
          joinedAsPlayer && data.gameState?.phase !== 'lobby'
        )
        const nextSession = {
          matchID: gameId,
          playerID: data.playerID,
          playerName,
          reconnectKey: data.reconnectKey || resolvedReconnectKey,
        }
        setStoredSession(nextSession)
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('lobbySession', JSON.stringify(nextSession))
        }
      } else if (response.status === 409) {
        const data = await response.json()
        setError(data.error || 'Lobby is full.')
      } else {
        throw new Error('Failed to join game')
      }
    } catch (err) {
      console.error('Connection error:', err)
      setError(`Failed to connect to game server at ${serverUrl || 'current host'}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  const disbandLobbyGame = async () => {
    if (!matchID || !serverUrl) return
    try {
      const response = await fetch(`${serverUrl}/api/game/${matchID}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerID }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(data?.error || 'Unable to disband this lobby.')
        return
      }
      returnToPreGameLobby({
        notice: data?.message || 'You disbanded this game.',
      })
    } catch (err) {
      console.error('Failed to disband game:', err)
      setError('Unable to disband this lobby right now.')
    }
  }

  const createLobbyGame = async () => {
    const newLobbyId = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26))
    ).join('')
    await joinLobbyGame(newLobbyId, undefined, selectedMapId)
  }

  const sendAction = async (action, payload) => {
    if (!joined) return
    if (isObserver && !canLeaderControlAiSetup) {
      const observerAllowedActions = ['claimSlot', 'moveParticipant']
      const isLobbyLeader = String(playerID) === String(gameState?.leaderId)
      if (isLobbyLeader) {
        observerAllowedActions.push('setTeamMode', 'setWinterMode', 'setFogOfWar', 'setAiDeploymentMode', 'setAiDeploymentUnitCount', 'startBattle', 'kickParticipant', 'addAiPlayer')
      }
      if (!observerAllowedActions.includes(action)) {
        setError('Spectators cannot perform game actions.')
        return
      }
    }

    try {
      const isIdentityTransitionAction = (action === 'claimSlot' || action === 'moveParticipant') && String(payload?.playerID) === String(playerID)
      if (isIdentityTransitionAction) {
        identityTransitionRef.current = { pending: true, until: Date.now() + 6000 }
      }

      const requestBody = { gameId: matchID, action, payload }
      
      const response = await fetch(`${serverUrl}/api/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
        if (data?.reassignedPlayerID && data.reassignedPlayerID !== playerID) {
          identityTransitionRef.current = { pending: true, until: Date.now() + 6000 }
          setPlayerID(data.reassignedPlayerID)
          if (typeof window !== 'undefined') {
            try {
              const existing = JSON.parse(sessionStorage.getItem('lobbySession') || '{}')
              sessionStorage.setItem('lobbySession', JSON.stringify({
                ...existing,
                playerID: data.reassignedPlayerID,
                matchID,
                playerName,
              }))
            } catch (storageError) {
              console.error('Failed to persist reassigned lobby identity:', storageError)
            }
          }
        }
        if (!data?.reassignedPlayerID) {
          identityTransitionRef.current = { pending: false, until: 0 }
        }
        return data
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send action')
      }
    } catch (err) {
      identityTransitionRef.current = { pending: false, until: 0 }
      console.error('Action error:', err)
      setError(err.message || 'Failed to send action to server')
      return null
    }
  }

  const sendChat = async (message) => {
    if (!joined) return
    const normalizedMessage = message.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!normalizedMessage) return

    try {
      const requestBody = {
        gameId: matchID,
        action: 'sendChat',
        payload: {
          message: normalizedMessage,
          playerID: isObserver ? 'spectator' : playerID,
          playerName: playerName || undefined,
        }
      }

      const response = await fetch(`${serverUrl}/api/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const data = await response.json()
        setGameState(data.gameState)
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to send chat message')
      }
    } catch (err) {
      console.error('Chat error:', err)
      setError(err.message || 'Failed to send chat message')
    }
  }

  const handleChatSubmit = async (event) => {
    event.preventDefault()
    await sendChat(chatInput)
    setChatInput('')
    setIsChatOpen(false)
  }

  const handleHexClick = (hex) => {
    if (!joined || !gameState) return
    if (isObserver) {
      const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex) {
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfoId(null)
        } else {
          setSelectedUnitForInfoId(unitOnHex.id)
        }
      } else {
        setSelectedUnitForInfoId(null)
      }
      return
    }

    // Check if it's the current player's turn for game actions
    if (gameState.currentPlayer !== playerID) {
      // Only allow unit info display when not player's turn
      const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex) {
        // Toggle unit info selection
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfoId(null) // Deselect if same unit
        } else {
          setSelectedUnitForInfoId(unitOnHex.id) // Show info for any unit
        }
      } else {
        setSelectedUnitForInfoId(null) // Clear selection when clicking empty hex
      }
      
      // Don't show error message when just viewing unit info
      return
    }

    const phase = gameState.phase
    
    // Setup Phase: Place or Remove units
    if (phase === 'setup') {
      // Check if clicking on any unit to show info
      const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex) {
        // Toggle unit info for any unit during setup
        if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
          setSelectedUnitForInfoId(null) // Deselect if same unit
        } else {
          setSelectedUnitForInfoId(unitOnHex.id) // Show info for any unit
        }
      } else {
        setSelectedUnitForInfoId(null) // Clear selection when clicking empty hex
      }

      // Check if clicking on own unit to remove it
      const myUnitOnHex = gameState.units.find(u => u.q === hex.q && u.r === hex.r && u.ownerID === effectiveSetupPlayerID)
      if (myUnitOnHex) {
        sendAction('removeUnit', { unitId: myUnitOnHex.id, playerID: effectiveSetupPlayerID, actingPlayerID: playerID })
        return
      }

      // Try to place a new unit
      const mapWidth = gameState?.mapSize?.width || 6
      const deployableHexes = getDeployableHexes({
        unitType: selectedUnitType,
        hexes: gameState.hexes,
        units: gameState.units,
        terrainMap: gameState.terrainMap,
        playerID: effectiveSetupPlayerID,
        mapWidth,
        teamMode,
        deploymentZones: gameState.deploymentZones,
      })
      const isDeployable = deployableHexes.some(h => h.q === hex.q && h.r === hex.r)
      if (isDeployable) {
        sendAction('placeUnit', {
          unitType: selectedUnitType,
          q: hex.q,
          r: hex.r,
          playerID: effectiveSetupPlayerID,
          actingPlayerID: playerID,
        })
      } else {
        setError('You can only place units in valid spawn hexes!')
        setTimeout(() => setError(''), 2000)
      }
      return
    }
    
    // Battle Phase: Select, Move, or Attack
    if (phase === 'battle') {
      // Check if clicking on own unit to select it for action
      const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
      if (unitOnHex && unitOnHex.ownerID === playerID) {
        sendAction('selectUnit', { unitId: unitOnHex.id, playerID })
        // Automatically show unit info when selecting own unit
        setSelectedUnitForInfoId(unitOnHex.id)
        return
      }
      
      // If we have a selected unit for action
      const selectedUnit = gameState.selectedUnitId ? 
        gameState.units.find(u => u.id === gameState.selectedUnitId) : null
        
      if (selectedUnit && selectedUnit.ownerID === playerID) {
        // Check if clicking on enemy to attack
        if (unitOnHex && (teamMode ? !areAllies(unitOnHex.ownerID, playerID) : unitOnHex.ownerID !== playerID)) {
          // Simple distance check
          const distance = Math.max(
            Math.abs(selectedUnit.q - unitOnHex.q),
            Math.abs(selectedUnit.r - unitOnHex.r),
            Math.abs(selectedUnit.s - unitOnHex.s)
          )
          
          if (distance <= selectedUnit.range && !selectedUnit.hasAttacked) {
            sendAction('attackUnit', { 
              attackerId: selectedUnit.id, 
              targetId: unitOnHex.id, 
              playerID 
            })
            return
          }
        }

        // Check if clicking on wall terrain to attack it
        const clickedTerrain = gameState.terrainMap[`${hex.q},${hex.r}`] || 'PLAIN'
        if (!unitOnHex && clickedTerrain === 'WALL') {
          const distance = Math.max(
            Math.abs(selectedUnit.q - hex.q),
            Math.abs(selectedUnit.r - hex.r),
            Math.abs(selectedUnit.s - hex.s)
          )
          if (distance <= selectedUnit.range && !selectedUnit.hasAttacked) {
            sendAction('attackTerrain', {
              attackerId: selectedUnit.id,
              targetQ: hex.q,
              targetR: hex.r,
              playerID: isObserver ? 'spectator' : playerID,
            })
            return
          }
        }
        
        // Check if clicking on empty hex to move
        if (!unitOnHex && !selectedUnit.hasMoved) {
          // Check if hex is in reachable hexes (already calculated with proper move points)
          const isReachable = highlightedHexes.some(h => h.q === hex.q && h.r === hex.r)
          if (isReachable) {
            sendAction('moveUnit', {
              unitId: selectedUnit.id,
              targetQ: hex.q,
              targetR: hex.r,
              playerID
            })
            return
          }
        }
        
        // Deselect if clicking elsewhere
        sendAction('deselectUnit', { playerID })
      }
    }
    
    // Unit info display for any remaining clicks (when it's your turn but no action was taken)
    const unitOnHex = visibleUnits.find(u => u.q === hex.q && u.r === hex.r && u.currentHP > 0)
    if (unitOnHex) {
      // Toggle unit info selection
      if (selectedUnitForInfo && selectedUnitForInfo.id === unitOnHex.id) {
        setSelectedUnitForInfoId(null) // Deselect if same unit
      } else {
        setSelectedUnitForInfoId(unitOnHex.id) // Show info for any unit
      }
    } else {
      setSelectedUnitForInfoId(null) // Clear selection when clicking empty hex
    }
  }

  const endTurn = () => {
    if (!joined) return
    setSelectedUnitForInfoId(null)
    setHighlightedHexes([])
    setAttackableHexes([])
    setHoveredHex(null)
    setDamagePreview(null)
    sendAction('endTurn', { playerID })
  }

  const undoMove = () => {
    if (!joined || !gameState) return
    const selectedUnit = gameState.selectedUnitId
      ? gameState.units.find(u => u.id === gameState.selectedUnitId)
      : null
    if (!selectedUnit || selectedUnit.hasAttacked || !selectedUnit.lastMove) return
    sendAction('undoMove', { unitId: selectedUnit.id, playerID })
    setDamagePreview(null)
  }

  const retreatSelectedUnit = () => {
    if (!joined || !gameState || !selectedOwnedUnit || !canRetreatSelectedUnit) return
    sendAction('retreatUnit', { unitId: selectedOwnedUnit.id, playerID })
    setDamagePreview(null)
    setSelectedUnitForInfoId(null)
  }

  const readyForBattle = () => {
    if (!joined) return
    const deployedUnits = gameState?.units?.filter(
      unit => unit.ownerID === effectiveSetupPlayerID && unit.currentHP > 0
    ).length || 0
    if (deployedUnits === 0) {
      setShowReadyConfirm(true)
      return
    }
    sendAction('readyForBattle', { playerID: effectiveSetupPlayerID, actingPlayerID: playerID })
  }

  const claimSlot = async (slotId) => {
    if (!joined) return
    const result = await sendAction('claimSlot', {
      playerID,
      desiredSlot: slotId,
      playerName: playerName || undefined,
    })
    if (result?.success && !result?.reassignedPlayerID && slotId !== 'spectator' && slotId !== 'waitlist') {
      setPlayerID(String(slotId))
    }
  }

  const startBattle = async () => {
    if (!joined) return
    await sendAction('startBattle', { playerID })
  }

  const confirmReadyForBattle = () => {
    setShowReadyConfirm(false)
    sendAction('readyForBattle', { playerID: effectiveSetupPlayerID, actingPlayerID: playerID })
  }

  if (!joined) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12 lg:py-16">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">Medieval Tactical Battle</p>
              <h1 className="text-3xl font-bold text-amber-300 md:text-4xl">Pre-Game Lobby</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Create a lobby, invite your squad, and jump into battle. Pick any slot once you enter the lobby —
                team battles let you claim any command seat on entry.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Map: {selectedMapId === 'CUSTOM' ? (customMapConfig?.name || 'Custom Map') : MAPS[selectedMapId]?.name}</span>
              <span className="rounded-full bg-slate-800/80 px-3 py-1">Mode/Season: Set by lobby leader</span>
            </div>
          </div>

          {kickedOutNotice && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              {kickedOutNotice}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-amber-200">Create or Join</h2>
              <p className="mt-1 text-xs text-slate-400">
                Customize the battlefield, choose a role, and start the lobby.
              </p>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Player name
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                    placeholder="Enter your banner name (optional)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Map selection
                  </label>
                  <select
                    value={selectedMapId}
                    onChange={(e) => setSelectedMapId(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  >
                    {Object.values(MAPS).map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.name}
                      </option>
                    ))}
                    <option value="CUSTOM">Custom Map (Map Builder)</option>
                  </select>
                  <p className="mt-2 text-xs text-slate-400">
                    {selectedMapId === 'CUSTOM' ? (customMapConfig?.description || 'Use map builder to create/import map JSON.') : MAPS[selectedMapId]?.description}
                  </p>
                </div>

                <div className="grid gap-3">
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => setShowMapBuilder(true)}
                      className="rounded-xl border border-indigo-500/70 bg-indigo-500/10 px-4 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-500/20"
                    >
                      🗺️ Enter Map Editor
                    </button>
                    <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
                      📥 Import Map
                      <input
                        type="file"
                        accept="application/json"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          try {
                            const text = await file.text()
                            const imported = JSON.parse(text)
                            const normalizedMap = parseImportedCustomMap(imported)
                            if (!normalizedMap) {
                              setError('Invalid map JSON. Export a custom map from the editor and try again.')
                              return
                            }
                            setCustomMapConfig(normalizedMap)
                            setSelectedMapId('CUSTOM')
                            setError('')
                          } catch (err) {
                            setError('Failed to import map JSON file.')
                          }
                        }}
                      />
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
                    <button
                      onClick={createLobbyGame}
                      disabled={loading}
                      className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-400 disabled:bg-slate-600"
                    >
                      {loading ? '🔄 Creating lobby...' : '➕ Create New Lobby'}
                    </button>
                    <button
                      onClick={fetchLobbyGames}
                      disabled={lobbyLoading}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-700"
                    >
                      {lobbyLoading ? '⏳ Refreshing...' : '🔄 Refresh'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-amber-200">Active Lobbies</h2>
                  <p className="text-xs text-slate-400">{lobbyGames.length} active rooms</p>
                </div>
                <button
                  onClick={fetchLobbyGames}
                  disabled={lobbyLoading}
                  className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 disabled:bg-slate-700"
                >
                  {lobbyLoading ? '⏳' : 'Refresh'}
                </button>
              </div>

              {lobbyGames.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-700 bg-slate-800/60 p-6 text-center text-sm text-slate-400">
                  No active lobbies yet. Create one to begin your battle.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {lobbyGames.map((game) => {
                    const isFull = game.status === 'full'
                    const maxPlayers = game.maxPlayers || 2
                    return (
                      <div
                        key={game.id}
                        className="rounded-xl border border-slate-700/70 bg-slate-800/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{game.id}</div>
                            <div className="text-xs text-slate-400">{game.mapName}</div>
                            <div className="text-xs text-slate-400">
                              {game.teamMode ? '2v2 Team Battle' : '1v1 Duel'} • {game.isWinter ? 'Winter' : 'Standard'} • {game.fogOfWarEnabled ? 'Fog On' : 'Fog Off'}
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-1 rounded ${
                            isFull ? 'bg-red-600/60 text-red-200' : 'bg-emerald-600/50 text-emerald-200'
                          }`}>
                            {game.playerCount}/{maxPlayers}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {game.players.length > 0 ? (
                            game.players.map((player) => (
                              <span
                                key={player.id}
                                className="text-xs bg-slate-900/70 border border-slate-700 rounded-full px-2 py-1 text-slate-200"
                              >
                                {player.id === 'spectator' ? `${player.name} (Spectator)` : `${player.name} (P${player.id})`}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400">No players yet</span>
                          )}
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            onClick={() => joinLobbyGame(game.id, undefined)}
                            disabled={loading}
                            className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:bg-slate-600"
                          >
                            🎯 Enter Lobby
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <MapBuilderModal
          open={showMapBuilder}
          onClose={() => setShowMapBuilder(false)}
          initialMap={customMapConfig}
          onApply={(map) => {
            setCustomMapConfig(map)
            setSelectedMapId('CUSTOM')
            setShowMapBuilder(false)
          }}
        />
      </div>
    )
  }

  if (shouldShowLobbySelection) {
    const lobbyPlayers = gameState?.players || {}
    const lobbyWaitlist = gameState?.waitlist || []
    const waitlistIds = new Set(lobbyWaitlist.map((entry) => entry?.id))
    const lobbySpectators = (gameState?.spectators || []).filter((spectator) => !waitlistIds.has(spectator?.id))
    const lobbyLeaderId = gameState?.leaderId
    const lobbyMap = MAPS[gameState?.mapId] || MAPS[selectedMapId]
    const maxPlayers = gameState?.maxPlayers || (teamMode ? 4 : 2)
    const teamSlotConfig = teamMode
      ? [
          { id: '0', label: 'Blue Vanguard', team: 'TEAM 1' },
          { id: '2', label: 'Green Vanguard', team: 'TEAM 1' },
          { id: '1', label: 'Red Vanguard', team: 'TEAM 2' },
          { id: '3', label: 'Yellow Vanguard', team: 'TEAM 2' },
        ]
      : [
          { id: '0', label: 'Player One', team: 'TEAM 1' },
          { id: '1', label: 'Player Two', team: 'TEAM 2' },
        ]
    const teamOneSlots = teamSlotConfig.filter(slot => slot.team === 'TEAM 1')
    const teamTwoSlots = teamSlotConfig.filter(slot => slot.team === 'TEAM 2')
    const playerCount = Object.keys(lobbyPlayers).length
    const canStartMatch = String(playerID) === String(lobbyLeaderId) && playerCount >= 2
    const canChangeLobbySettings = String(playerID) === String(lobbyLeaderId)
    const lobbyFogEnabled = Boolean(gameState?.fogOfWarEnabled)
    const lobbyIsWinter = Boolean(gameState?.isWinter)
    const canAddAi = canChangeLobbySettings && !lobbyFogEnabled
    const aiDeploymentUnitCount = Number(gameState?.aiDeploymentUnitCount) || 5
    const aiDeploymentMode = gameState?.aiDeploymentMode === 'auto' ? 'auto' : 'leader'
    const canDisableTeamMode = teamMode
      ? !Object.keys(lobbyPlayers).some((id) => Number.parseInt(id, 10) >= 2)
      : true

    const canKickFromLobby = String(playerID) === String(lobbyLeaderId)
    const canDisbandLobby = String(playerID) === String(lobbyLeaderId)

    const moveParticipant = async (targetID, destination) => {
      if (!joined) return
      await sendAction('moveParticipant', { playerID, targetID, destination })
    }

    const kickParticipant = async (targetID) => {
      if (!joined || !canKickFromLobby) return
      const result = await sendAction('kickParticipant', { playerID, targetID })
      if (result?.success && targetID === playerID) {
        handleKickedOut({ message: 'You kicked yourself from this match. Rejoin from the lobby if you want to play again.' })
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10">
          <div className="relative flex min-h-12 items-center justify-start">
            <div className="flex items-center gap-1 overflow-hidden rounded-md border border-slate-700/80 bg-slate-900/80">
              <button
                type="button"
                onClick={() => returnToPreGameLobby()}
                className="flex h-12 w-20 items-center justify-center border-r border-slate-700/80 text-slate-200 transition hover:bg-slate-800"
                aria-label="Back to pre-game lobby"
              >
                <img src="/icons/back button.png" alt="Back" className="h-6 w-6" />
              </button>
              {canDisbandLobby && (
                <button
                  type="button"
                  onClick={disbandLobbyGame}
                  className="h-12 px-5 text-sm font-bold uppercase tracking-wide text-red-300 transition hover:bg-red-900/30"
                >
                  Disband
                </button>
              )}
            </div>
          </div>

          {kickedOutNotice && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              {kickedOutNotice}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr_1fr]">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="mb-4 text-sm font-semibold text-blue-200">TEAM 1</div>
              <div className="space-y-3">
                {teamOneSlots.map(slot => {
                  const occupant = lobbyPlayers[slot.id]
                  const isCurrent = slot.id === playerID
                  const isOccupied = Boolean(occupant)
                  const isLeader = lobbyLeaderId === slot.id
                  const occupiedClass = isOccupied
                    ? SLOT_COLOR_CLASSES[slot.id] || 'border-slate-700 bg-slate-800/60'
                    : 'border-slate-700 bg-slate-800/60'
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
                        occupiedClass
                      } ${
                        isCurrent
                          ? 'ring-1 ring-amber-300/70'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{slot.label}</div>
                        <div className="text-xs text-slate-400">
                          {occupant ? occupant.name : 'Add the player'}
                          {occupant?.isAI && <span className="ml-2 text-emerald-300">(AI)</span>}
                          {isLeader && <span className="ml-2 text-amber-300">(Leader)</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => claimSlot(slot.id)}
                          disabled={false}
                          className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800"
                        >
                          {isSpectator ? 'Join' : isCurrent ? 'Your Slot' : 'Join'}
                        </button>
                        {!isOccupied && (
                          <button
                            onClick={() => sendAction('addAiPlayer', { playerID, desiredSlot: slot.id })}
                            disabled={!canAddAi}
                            title={canAddAi ? 'Add AI commander' : 'Only the lobby leader can add AI, and fog must be disabled'}
                            className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:opacity-50"
                          >
                            +AI
                          </button>
                        )}
                        {isOccupied && canKickFromLobby && (
                          <button
                            onClick={() => kickParticipant(slot.id)}
                            className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-600"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="rounded-2xl border border-slate-700/70 bg-slate-800/70 p-4 text-center">
                <div className="text-sm font-semibold text-amber-200">{lobbyMap?.name || 'Random Map'}</div>
                <p className="mt-1 text-xs text-slate-400">Lobby {matchID}</p>
                <div className="mx-auto mt-3 flex h-40 w-full max-w-[220px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900/70 text-4xl text-slate-500">
                  🗺️
                </div>
                <p className="mt-3 text-xs text-slate-400">{lobbyMap?.description}</p>
              </div>

              <div className="mt-5 space-y-3 text-xs text-slate-300">
                <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                  <span>Mode</span>
                  <button
                    type="button"
                    onClick={() => sendAction('setTeamMode', { playerID, enabled: !teamMode })}
                    disabled={!canChangeLobbySettings || (teamMode && !canDisableTeamMode)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      teamMode
                        ? 'bg-blue-500/20 text-blue-200'
                        : 'bg-slate-700 text-slate-200'
                    } ${(canChangeLobbySettings && (canDisableTeamMode || !teamMode)) ? 'hover:bg-blue-500/30' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    {teamMode ? '2v2' : '1v1'}
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                  <span>Season</span>
                  <button
                    type="button"
                    onClick={() => sendAction('setWinterMode', { playerID, enabled: !lobbyIsWinter })}
                    disabled={!canChangeLobbySettings}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      lobbyIsWinter
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'bg-slate-700 text-slate-200'
                    } ${canChangeLobbySettings ? 'hover:bg-cyan-500/30' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    {lobbyIsWinter ? 'Winter' : 'Standard'}
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-800/70 px-3 py-2">
                  <div>
                    <div className="text-slate-200">Fog of war</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => sendAction('setFogOfWar', { playerID, enabled: !lobbyFogEnabled })}
                    disabled={!canChangeLobbySettings}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                      lobbyFogEnabled
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-slate-700 text-slate-200'
                    } ${canChangeLobbySettings ? 'hover:bg-emerald-500/30' : 'opacity-60 cursor-not-allowed'}`}
                  >
                    {lobbyFogEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {!canChangeLobbySettings && (
                  <div className="text-[11px] text-slate-500">
                    Only the lobby leader can change lobby settings.
                  </div>
                )}
                {teamMode && !canDisableTeamMode && (
                  <div className="text-[11px] text-slate-500">
                    2v2 cannot be disabled while players occupy Green/Yellow slots.
                  </div>
                )}
                <div className="rounded-lg bg-slate-800/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-200">AI deployment mode</span>
                    <button
                      type="button"
                      onClick={() => sendAction('setAiDeploymentMode', { playerID, mode: aiDeploymentMode === 'leader' ? 'auto' : 'leader' })}
                      disabled={!canChangeLobbySettings}
                      className="rounded-full bg-slate-700 px-3 py-1 text-[11px] font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {aiDeploymentMode === 'leader' ? 'Leader' : 'Auto'}
                    </button>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">Leader mode lets the lobby leader place AI units manually during setup.</div>
                </div>
                <div className="rounded-lg bg-slate-800/70 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-200">AI deployment size</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => sendAction('setAiDeploymentUnitCount', { playerID, unitCount: Math.max(1, aiDeploymentUnitCount - 1) })}
                        disabled={!canChangeLobbySettings || aiDeploymentUnitCount <= 1}
                        className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-[11px] font-semibold text-amber-200">{aiDeploymentUnitCount}</span>
                      <button
                        type="button"
                        onClick={() => sendAction('setAiDeploymentUnitCount', { playerID, unitCount: Math.min(20, aiDeploymentUnitCount + 1) })}
                        disabled={!canChangeLobbySettings || aiDeploymentUnitCount >= 20}
                        className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">Lobby leader controls how many units each AI deploys in setup (1–20).</div>
                </div>
                <div className="text-[11px] text-slate-500">
                  AI commanders are available in non-fog matches only.
                </div>
              </div>

              {forceLobbySelection ? (
                <div className="mt-5 space-y-3">
                  <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    Rejoining a match in progress. Pick a slot, then enter the battle.
                  </div>
                  <button
                    onClick={() => setForceLobbySelection(false)}
                    className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
                  >
                    ✅ Join Game
                  </button>
                </div>
              ) : (
                <button
                  onClick={startBattle}
                  disabled={!canStartMatch}
                  className="mt-5 w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700"
                >
                  {playerID === lobbyLeaderId ? (canStartMatch ? '🚀 Start Match' : 'Waiting for players') : 'Waiting for leader'}
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-5 shadow-xl">
              <div className="mb-4 text-sm font-semibold text-red-200">TEAM 2</div>
              <div className="space-y-3">
                {teamTwoSlots.map(slot => {
                  const occupant = lobbyPlayers[slot.id]
                  const isCurrent = slot.id === playerID
                  const isOccupied = Boolean(occupant)
                  const isLeader = lobbyLeaderId === slot.id
                  const occupiedClass = isOccupied
                    ? SLOT_COLOR_CLASSES[slot.id] || 'border-slate-700 bg-slate-800/60'
                    : 'border-slate-700 bg-slate-800/60'
                  return (
                    <div
                      key={slot.id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-4 ${
                        occupiedClass
                      } ${
                        isCurrent
                          ? 'ring-1 ring-amber-300/70'
                          : ''
                      }`}
                    >
                      <div>
                        <div className="text-sm font-semibold text-white">{slot.label}</div>
                        <div className="text-xs text-slate-400">
                          {occupant ? occupant.name : 'Add the player'}
                          {occupant?.isAI && <span className="ml-2 text-emerald-300">(AI)</span>}
                          {isLeader && <span className="ml-2 text-amber-300">(Leader)</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => claimSlot(slot.id)}
                          disabled={false}
                          className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800"
                        >
                          {isSpectator ? 'Join' : isCurrent ? 'Your Slot' : 'Join'}
                        </button>
                        {!isOccupied && (
                          <button
                            onClick={() => sendAction('addAiPlayer', { playerID, desiredSlot: slot.id })}
                            disabled={!canAddAi}
                            title={canAddAi ? 'Add AI commander' : 'Only the lobby leader can add AI, and fog must be disabled'}
                            className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-800 disabled:opacity-50"
                          >
                            +AI
                          </button>
                        )}
                        {isOccupied && canKickFromLobby && (
                          <button
                            onClick={() => kickParticipant(slot.id)}
                            className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white transition hover:bg-rose-600"
                          >
                            Kick
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 text-xs text-slate-300">
              <div className="font-semibold text-slate-200">How it works</div>
              <ul className="mt-2 space-y-1 text-slate-400">
                <li>• Leader starts the match once at least two players are seated.</li>
                <li>• After launch, you will place units on the map during setup.</li>
                <li>• Team battles allow two slots per side.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 text-xs text-slate-300">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">Spectators</span>
                {!isSpectator && (
                  <button
                    onClick={() => claimSlot('spectator')}
                    className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
                  >
                    {isWaitlisted ? 'Move to Spectator' : 'Watch as Spectator'}
                  </button>
                )}
              </div>
              {lobbySpectators.length === 0 ? (
                <div className="mt-2 text-slate-400">No spectators yet.</div>
              ) : (
                <ul className="mt-2 space-y-1 text-slate-400">
                  {lobbySpectators.map(spectator => (
                    <li key={spectator.id} className="flex items-center justify-between gap-2">
                      <span>{spectator.name}</span>
                      {canKickFromLobby && (
                        <button
                          onClick={() => kickParticipant(spectator.id)}
                          className="rounded-full bg-rose-700 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-rose-600"
                        >
                          Kick
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-slate-700 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Waitlist</span>
                  {!isWaitlisted && (
                    <button
                      onClick={() => claimSlot('waitlist')}
                      className="rounded-full bg-slate-700 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Move Me to Waitlist
                    </button>
                  )}
                </div>
                {lobbyWaitlist.length === 0 ? (
                  <div className="mt-2 text-slate-400">No waitlisted players.</div>
                ) : (
                  <ul className="mt-2 space-y-1 text-slate-400">
                    {lobbyWaitlist.map(entry => (
                      <li key={entry.id} className="flex items-center justify-between gap-2">
                        <span>{entry.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">Pick a team slot above</span>
                          {canKickFromLobby && (
                            <button onClick={() => kickParticipant(entry.id)} className="rounded-full bg-rose-700 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-rose-600">Kick</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {isSpectator && (
                <div className="mt-2 text-xs text-amber-300">You are watching as a spectator.</div>
              )}
              {isWaitlisted && (
                <div className="mt-2 text-xs text-cyan-300">You are currently on the waitlist.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const myUnits = gameState?.units?.filter(u => u.ownerID === playerID) || []
  const selectedUnit = gameState?.selectedUnitId
    ? gameState.units.find(u => u.id === gameState.selectedUnitId)
    : null

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white relative">
      {/* Landscape Prompt */}
      <LandscapePrompt />

      {/* Status Bar - Hidden when deploy panel is open */}
      {<div className={`hidden fixed top-4 left-1/2 transform -translate-x-1/2 z-20 transition-all duration-300 ${(gameState?.phase === 'setup' && !isLeftPanelCollapsed) ? 'lg:hidden' : 'lg:block'}`}>
        <div className="bg-slate-800/90 border border-slate-600 rounded-lg px-4 py-2 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-center gap-6 text-sm">
            
            {/* Current Turn Indicator */}
            <div className="flex items-center gap-2">
              {isMyTurn ? (
                <span className="text-green-400 font-bold animate-pulse">YOUR TURN</span>
              ) : (
                <>
                  <span className="text-amber-400 font-semibold">Current Turn:</span>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    getPlayerColor(gameState?.currentPlayer) === 'blue' ? 'bg-blue-600' :
                    getPlayerColor(gameState?.currentPlayer) === 'green' ? 'bg-green-600' :
                    getPlayerColor(gameState?.currentPlayer) === 'yellow' ? 'bg-yellow-500 text-slate-900' :
                    'bg-red-600'
                  }`}>
                    Player {gameState?.currentPlayer || '?'}
                  </span>
                </>
              )}
            </div>
            
            {/* Turn Number */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Turn:</span>
              <span className="text-white font-bold">{gameState?.turn || 1}</span>
            </div>
            
            {/* Game Phase */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Phase:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                gameState?.phase === 'setup' ? 'bg-purple-600' : 'bg-orange-600'
              }`}>
                {gameState?.phase?.toUpperCase() || 'SETUP'}
              </span>
            </div>
            
            {/* Your Player ID */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">You:</span>
              <span className={`px-2 py-1 rounded text-xs font-bold ${
                isObserver ? 'bg-slate-600' : playerID === '0' ? 'bg-blue-600' : 'bg-red-600'
              }`}>
                {isWaitlisted ? 'Waitlist' : isSpectator ? 'Spectator' : `Player ${playerID}`}
              </span>
            </div>
            
            {/* Game ID */}
            <div className="flex items-center gap-2">
              <span className="text-amber-400 font-semibold">Game:</span>
              <span className="text-white font-bold text-xs">{matchID || 'default'}</span>
            </div>
          </div>
        </div>
      </div>
      }

      {/* Mobile Status Bar */}
      <div className={`fixed top-2 left-2 right-2 z-20 lg:hidden pointer-events-none ${gameState?.phase === 'setup' ? 'hidden' : 'block'}`}>
        <div className="rounded-lg border border-slate-600 bg-slate-800/90 px-3 py-2 text-xs shadow-xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="font-semibold text-amber-300">T{gameState?.turn || 1}</span>
            <span className={`rounded px-2 py-0.5 font-bold ${
              gameState?.phase === 'setup' ? 'bg-purple-600' : 'bg-orange-600'
            }`}>
              {gameState?.phase?.toUpperCase() || 'SETUP'}
            </span>
            <span className={`rounded px-2 py-0.5 font-bold ${
              isObserver ? 'bg-slate-600' : playerID === '0' ? 'bg-blue-600' : 'bg-red-600'
            }`}>
              {isWaitlisted ? 'Waitlist' : isSpectator ? 'Spectator' : `P${playerID || '?'}`}
            </span>
            <span className="text-slate-300">Game: {matchID || 'default'}</span>
            <span className={isMyTurn ? 'font-bold text-green-400' : 'font-semibold text-amber-400'}>
              {isMyTurn ? 'YOUR TURN' : `Turn: P${gameState?.currentPlayer || '?'}`}
            </span>
          </div>
        </div>
      </div>

      {gameState?.phase === 'battle' && turnTimer && (
        <div className="hidden lg:block fixed top-[4.65rem] left-1/2 -translate-x-1/2 z-20 transition-all duration-300">
          <div className="min-w-[220px] rounded-lg border border-slate-600 bg-slate-800/90 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
            <div className={`text-lg font-extrabold tabular-nums ${currentTurnColorClass}`}>
              ⏱ {turnTimer.remainingSeconds}s
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-700">
              <div
                className={`h-full transition-all duration-200 ${currentTurnBarClass}`}
                style={{ width: `${Math.max(0, Math.min(100, turnTimer.percent))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {gameState?.phase === 'battle' && turnTimer && (
        <div className="fixed top-[3.7rem] left-2 z-20 lg:hidden pointer-events-none">
          <div className={`min-w-[4rem] rounded-md border border-slate-600 bg-slate-800/90 px-2 py-1 text-left text-xs font-extrabold tabular-nums shadow-xl backdrop-blur-sm ${currentTurnColorClass}`}>
            ⏱ {turnTimer.remainingSeconds}s
          </div>
        </div>
      )}
      
      {/* Left Panel - Only visible during setup phase */}
      {gameState?.phase === 'setup' && (!isObserver || canLeaderControlAiSetup) && (
        <div className={`fixed left-0 top-0 z-40 transition-all duration-300 ${
          isLeftPanelCollapsed ? 'w-12' : 'w-1/2 sm:w-1/3 md:w-1/4 lg:w-1/5 xl:w-1/6'
        } bg-slate-800/95 border-r border-slate-600 backdrop-blur-sm h-full`}>
          {/* Collapse Toggle Button */}
          <button
            onClick={() => setIsLeftPanelCollapsed(!isLeftPanelCollapsed)}
            className="absolute -right-3 top-4 w-6 h-6 bg-slate-700 hover:bg-slate-600 border border-slate-500 rounded-full flex items-center justify-center text-xs transition-all z-40"
          >
            {isLeftPanelCollapsed ? '▶' : '◀'}
          </button>
          
          {/* Panel Content */}
          <div className={`h-full overflow-hidden transition-all duration-300 ${
            isLeftPanelCollapsed ? 'opacity-0' : 'opacity-100'
          }`}>
            <div className="p-4 space-y-4 h-full flex flex-col font-poppins">
              {/* Player Info Section */}
              <div className="bg-slate-700/50 rounded-lg p-3 flex items-center gap-3">
                <img 
                  src={generalSprite.src}
                  className="w-12 h-12"
                  style={{ filter: generalSprite.filter }}
                  alt="Player Avatar"
                />
                <div>
                  <div className="text-white font-bold text-sm">Deploying for Player {effectiveSetupPlayerID}</div>
                  <div className={`text-xs ${
                    getPlayerColor(effectiveSetupPlayerID) === 'blue' ? 'text-blue-400' :
                    getPlayerColor(effectiveSetupPlayerID) === 'green' ? 'text-green-400' :
                    getPlayerColor(effectiveSetupPlayerID) === 'yellow' ? 'text-yellow-400' :
                    'text-red-400'
                  }`}>
                    {getPlayerColor(effectiveSetupPlayerID).charAt(0).toUpperCase() + getPlayerColor(effectiveSetupPlayerID).slice(1)} Army
                  </div>
                </div>
              </div>
              
              {canLeaderControlAiSetup && (
                <div className="rounded-lg border border-slate-600 bg-slate-900/70 p-2">
                  <div className="mb-2 text-[11px] text-slate-300">Leader AI setup control</div>
                  <div className="flex flex-wrap gap-2">
                    {aiSetupControlSlots.map((slotId) => (
                      <button
                        key={slotId}
                        type="button"
                        onClick={() => setSetupControlPlayerID(slotId)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${effectiveSetupPlayerID === slotId ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-100'}`}
                      >
                        AI P{slotId}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Deployment Units */}
              <div className="flex-1 overflow-y-auto">
                <div className="text-base text-amber-400 font-bold mb-2 bg-slate-800/95 backdrop-blur-sm py-2">
                  DEPLOY UNITS
                </div>
                <div className="space-y-3 pb-12">
                  {Object.values(UNIT_TYPES).map(unit => (
                    <button
                      key={unit.type}
                      onClick={() => setSelectedUnitType(unit.type)}
                      className={`relative w-full p-6 rounded border text-sm transition-all flex flex-col items-center font-poppins ${
                        selectedUnitType === unit.type 
                          ? 'border-amber-400 bg-amber-400/20 text-amber-400' 
                          : 'border-slate-600 hover:border-slate-500 text-white'
                      }`}
                    >
                      {/* Info button in top right corner */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setShowUnitInfoPopup(unit)
                        }}
                        className="absolute top-2 right-2 w-6 h-6 bg-blue-500 hover:bg-blue-400 text-white rounded-full text-xs font-bold flex items-center justify-center cursor-pointer"
                      >
                        i
                      </div>
                      
                      {/* Unit image */}
                      <img 
                        src={getUnitSpriteProps(unit, effectiveSetupPlayerID).src}
                        className="w-32 h-32 mb-1"
                        style={{ filter: getUnitSpriteProps(unit, effectiveSetupPlayerID).filter }}
                        alt={unit.name}
                      />
                      
                      {/* Unit name */}
                      <span className="font-semibold text-base mt-auto">{unit.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Game Board Container */}
      <div className="absolute inset-0">
        <GameBoard
          onHexClick={handleHexClick}
          onHexHover={setHoveredHex}
          onHexHoverEnd={() => setHoveredHex(null)}
          selectedHex={null}
          highlightedHexes={highlightedHexes}
          attackableHexes={attackableHexes}
          units={visibleUnits}
          allUnitsForDamageEvents={gameState?.units || []}
          hexes={gameState?.hexes || []}
          mapSize={gameState?.mapSize || null}
          terrainMap={gameState?.terrainMap || {}}
          terrainHealth={gameState?.terrainHealth || {}}
          phase={gameState?.phase || null}
          selectedUnitId={gameState?.selectedUnitId || null}
          currentPlayerID={playerID}
          damagePreview={damagePreview}
          retreatHexes={retreatHexes}
          retreatedUnitIds={gameState?.retreatedUnitIds || []}
          showSpawnZones={gameState?.phase === 'setup'}
          isWinter={gameState?.isWinter}
          tileMap={gameState?.tileMap || null}
          deploymentZones={gameState?.deploymentZones || null}
          teamMode={gameState?.teamMode}
          fogOfWarEnabled={fogActive}
          visibleHexes={visibleHexes}
          objectiveBuildingOwners={gameState?.map4ObjectiveState?.buildings || null}
        />
      </div>

      {gameState?.phase === 'battle' && map4ObjectivePanel && (
        <div className="fixed top-[5.8rem] left-2 lg:top-[7.2rem] lg:left-4 z-30 text-[11px] lg:text-base pointer-events-none">
          <div className="font-semibold text-amber-300">Objectives</div>
          <ul className="mt-1 space-y-0.5 text-slate-100">
            <li className="flex items-center gap-2 text-slate-200">
              <span>{map4ObjectivePanel.buildings.length > 0 && map4ObjectivePanel.buildings.every((building) => building.progress >= building.captureTurns) ? '✅' : '⬜'}</span>
              <span>{map4ObjectivePanel.title}</span>
            </li>
            {map4ObjectivePanel.buildings.map((building) => (
              <li key={building.label} className="flex items-center gap-2">
                <span>{building.progress >= building.captureTurns ? '✅' : '⬜'}</span>
                <span>{building.label} ({building.progress}/{building.captureTurns})</span>
                <span className={building.owner === 'blue-green' || building.owner === '0' ? 'text-blue-300' : 'text-red-300'}>
                  {building.owner === 'blue-green' || building.owner === '0' ? 'Blue' : 'Red'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {gameState?.phase === 'battle' && isObserver && fogOfWarEnabled && (
        <div className="fixed top-[4.6rem] right-2 lg:top-4 lg:right-4 z-30 w-[min(90vw,22rem)]">
          {!isObserverPanelOpen && (
            <button
              onClick={() => setIsObserverPanelOpen(true)}
              className="rounded-md border border-slate-600 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-amber-300 shadow-lg backdrop-blur"
            >
              Observer POV
            </button>
          )}
          {isObserverPanelOpen && (
            <div className="rounded-lg border border-slate-600 bg-slate-900/90 p-3 text-xs shadow-lg backdrop-blur space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold text-amber-300">Observer POV</div>
                <button
                  onClick={() => setIsObserverPanelOpen(false)}
                  className="h-6 w-6 rounded bg-slate-700 text-slate-100 hover:bg-slate-600"
                  aria-label="Close observer panel"
                >
                  ×
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setSpectatorVision('all')} className={`rounded px-2 py-1 ${spectatorVision === 'all' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-100'}`}>Full</button>
                <button onClick={() => setSpectatorVision('blueGreen')} className={`rounded px-2 py-1 ${spectatorVision === 'blueGreen' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-100'}`}>Blue/Green POV</button>
                <button onClick={() => setSpectatorVision('redYellow')} className={`rounded px-2 py-1 ${spectatorVision === 'redYellow' ? 'bg-red-500 text-white' : 'bg-slate-700 text-slate-100'}`}>Red/Yellow POV</button>
              </div>
              {advantageSummary && (
                <div>
                  <div className="font-semibold text-amber-300">Current Advantage</div>
                  <div className="mt-1 text-slate-200">HP — Blue/Green: {advantageSummary.blueHP} vs Red/Yellow: {advantageSummary.redHP}</div>
                  <div className="text-slate-300">Objectives — Blue/Green: {advantageSummary.blueObjectives} • Red/Yellow: {advantageSummary.redObjectives}</div>
                </div>
              )}
              <button onClick={copyDiscordSummary} disabled={!discordSummary} className="w-full rounded bg-emerald-600 px-3 py-2 font-semibold text-white disabled:bg-slate-700 disabled:text-slate-400">Copy summary for Discord</button>
              {copyStatus && <div className="text-emerald-300">{copyStatus}</div>}
            </div>
          )}
        </div>
      )}
      
      {/* Action Buttons - Bottom Right Corner */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 lg:bottom-4 lg:left-auto lg:right-4 lg:translate-x-0 z-40">
        {gameState?.phase === 'setup' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setIsChatOpen(true)}
              className="w-10 h-10 lg:w-12 lg:h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center"
              aria-label="Open chat"
            >
              <img src="/icons/chat%20icon.png" alt="Chat" className="w-6 h-6 lg:w-7 lg:h-7" />
            </button>
            {(!isObserver || canLeaderControlAiSetup) && (
              <button
                onClick={readyForBattle}
                disabled={!isMyTurn && !canLeaderControlAiSetup}
                className="px-4 h-10 lg:px-6 lg:py-3 lg:h-auto bg-amber-500 hover:bg-amber-400 disabled:bg-slate-600 text-white text-sm lg:text-base font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
              >
                Ready For Battle
              </button>
            )}
          </div>
        )}
        
        {gameState?.phase === 'battle' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setIsChatOpen(true)}
              className="w-10 h-10 lg:w-12 lg:h-12 bg-slate-700 hover:bg-slate-600 text-white rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center"
              aria-label="Open chat"
            >
              <img src="/icons/chat%20icon.png" alt="Chat" className="w-6 h-6 lg:w-7 lg:h-7" />
            </button>
            {(!isObserver || canLeaderControlAiSetup) && (
              <>
                {!fogOfWarEnabled && (
                  <button
                    onClick={undoMove}
                    disabled={!isMyTurn || !selectedUnit?.lastMove || selectedUnit?.hasAttacked}
                    className="w-10 h-10 lg:w-12 lg:h-12 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-60 text-white rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center"
                    aria-label="Undo move"
                  >
                    <img src="/icons/Undo%20Button.png" alt="Undo move" className="w-6 h-6 lg:w-7 lg:h-7" />
                  </button>
                )}
                <button
                  onClick={retreatSelectedUnit}
                  disabled={!isMyTurn || !canRetreatSelectedUnit}
                  title={retreatActivationTurn ? `Retreat available from turn ${retreatActivationTurn}` : 'Retreat'}
                  className="w-10 h-10 lg:w-12 lg:h-12 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:opacity-60 rounded-lg shadow-lg transition-all transform hover:scale-105 flex items-center justify-center"
                  aria-label="Retreat unit"
                >
                  <img src="/units/retreat.png" alt="Retreat" className="w-6 h-6 lg:w-7 lg:h-7" />
                </button>
                <button
                  onClick={endTurn}
                  disabled={!isMyTurn}
                  className="px-4 h-10 lg:px-5 lg:h-12 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm lg:text-base font-bold rounded-lg shadow-lg transition-all transform hover:scale-105"
                >
                  End Turn
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      {joined && (
        <div className={`fixed left-2 w-[78vw] bottom-14 lg:left-auto lg:right-4 z-30 lg:w-72 lg:max-w-[70vw] pointer-events-none ${isObserver && gameState?.phase === 'battle' ? 'lg:top-[38%]' : 'lg:top-[12%]'}`}>
          <div className="max-h-24 overflow-y-auto lg:max-h-64 p-0 lg:p-2 space-y-1 text-xs lg:text-sm text-slate-100 lg:bg-slate-900/70 lg:border lg:border-slate-700 lg:rounded-lg lg:shadow-lg lg:backdrop-blur">
            {chatMessages.length === 0 && (
              <div className="text-slate-400">No chat messages yet.</div>
            )}
            {chatMessages.map(message => (
              <div key={message.id} className="flex gap-1">
                <span className={`${getChatSenderClass(message)} font-semibold`}>
                  {message.sender}:
                </span>
                <span className="text-slate-100 break-words">{message.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Input */}
      {isChatOpen && (
        <div className="fixed bottom-16 lg:bottom-20 left-1/2 -translate-x-1/2 z-40 w-[min(94vw,420px)] lg:w-[min(90vw,420px)]">
          <form
            onSubmit={handleChatSubmit}
            className="flex items-center gap-2 bg-slate-900/90 border border-slate-700 rounded-lg p-2 shadow-lg backdrop-blur"
          >
            <input
              ref={chatInputRef}
              type="text"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Type a message..."
              maxLength={120}
              className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-md"
            >
              Send
            </button>
          </form>
          <div className="mt-1 text-[10px] text-slate-400 text-center">
            Press Enter to send • Esc to cancel
          </div>
        </div>
      )}
      
      {/* Unit Info Box - Right Side */}
      {selectedUnitForInfo && (
        <div className="fixed right-2 top-[5.2rem] w-[44vw] max-w-[14rem] lg:left-auto lg:right-4 lg:top-1/2 lg:w-72 lg:max-w-[70vw] lg:bottom-auto transform-none lg:-translate-y-1/2 z-20 pointer-events-none">
          <div className={`p-2 lg:p-4 rounded-lg border-2 shadow-xl backdrop-blur-sm ${
            selectedUnitForInfo.ownerID === playerID 
              ? 'border-amber-400 bg-amber-400/10' 
              : 'border-slate-600 bg-slate-800/90'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl lg:text-3xl">{selectedUnitForInfo.emoji || '⚔️'}</span>
              <div>
                <div className="font-bold text-white text-sm lg:text-lg">{selectedUnitForInfo.name || 'Unit'}</div>
                <div className={`text-xs lg:text-sm ${selectedUnitForInfo.ownerID === '0' ? 'text-blue-400' : 'text-red-400'}`}>
                  Player {selectedUnitForInfo.ownerID}
                </div>
              </div>
            </div>
            
            {/* HP Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs lg:text-sm text-slate-300 mb-1">
                <span>HP</span>
                <span>{selectedUnitForInfo.currentHP}/{selectedUnitForInfo.maxHP}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 lg:h-3">
                <div 
                  className={`h-2 lg:h-3 rounded-full transition-all ${
                    selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP > 0.5 
                      ? 'bg-green-500' 
                      : selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP > 0.25 
                        ? 'bg-yellow-500' 
                        : 'bg-red-500'
                  }`}
                  style={{ width: `${(selectedUnitForInfo.currentHP / selectedUnitForInfo.maxHP) * 100}%` }}
                />
              </div>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-1.5 lg:gap-2 text-xs lg:text-sm">
              <div className="bg-slate-700/50 p-1.5 lg:p-2 rounded text-center">
                <div className="text-red-400 font-bold">⚔️ {selectedUnitForInfo.attackPower}</div>
                <div className="text-slate-400 text-xs">ATK</div>
              </div>
              <div className="bg-slate-700/50 p-1.5 lg:p-2 rounded text-center">
                <div className="text-blue-400 font-bold">👟 {selectedUnitForInfo.movePoints}</div>
                <div className="text-slate-400 text-xs">MOV</div>
              </div>
              <div className="bg-slate-700/50 p-1.5 lg:p-2 rounded text-center">
                <div className="text-purple-400 font-bold">🎯 {selectedUnitForInfo.range}</div>
                <div className="text-slate-400 text-xs">RNG</div>
              </div>
              <div className="bg-slate-700/50 p-1.5 lg:p-2 rounded text-center">
                <div className="text-green-400 font-bold">🛡️ {selectedUnitForInfo.maxMovePoints}</div>
                <div className="text-slate-400 text-xs">MAX</div>
              </div>
            </div>
            
            {/* Action Status */}
            {(selectedUnitForInfo.hasMoved || selectedUnitForInfo.hasAttacked) && (
              <div className="text-[10px] lg:text-xs text-slate-400 mt-1.5 lg:mt-2">
                {selectedUnitForInfo.hasMoved && <span className="mr-2">✓ Moved</span>}
                {selectedUnitForInfo.hasAttacked && <span>✓ Attacked</span>}
              </div>
            )}
            
            {/* Close button */}
            <button
              onClick={() => setSelectedUnitForInfoId(null)}
              className="mt-2 lg:mt-3 w-full py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs lg:text-sm rounded transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Unit Info Popup */}
      {showUnitInfoPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl">{showUnitInfoPopup.emoji}</span>
                <div>
                  <h3 className="text-xl font-bold text-white">{showUnitInfoPopup.name}</h3>
                  <div className="text-sm text-slate-400">{showUnitInfoPopup.type}</div>
                </div>
              </div>
              <button
                onClick={() => setShowUnitInfoPopup(null)}
                className="text-slate-400 hover:text-white text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* Description */}
            <div className="mb-4">
              <p className="text-slate-300 text-sm">{showUnitInfoPopup.description}</p>
            </div>
            
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-red-400 font-bold text-lg">⚔️ {showUnitInfoPopup.attackPower}</div>
                <div className="text-slate-400 text-xs">Attack Power</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-green-400 font-bold text-lg">❤️ {showUnitInfoPopup.maxHP}</div>
                <div className="text-slate-400 text-xs">Health Points</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-blue-400 font-bold text-lg">👟 {showUnitInfoPopup.movePoints}</div>
                <div className="text-slate-400 text-xs">Movement Points</div>
              </div>
              <div className="bg-slate-700/50 p-3 rounded text-center">
                <div className="text-purple-400 font-bold text-lg">🎯 {showUnitInfoPopup.range}</div>
                <div className="text-slate-400 text-xs">Attack Range</div>
              </div>
            </div>
            
            {/* Additional Info */}
            <div className="text-xs text-slate-400">
              <div className="mb-1">• Max Movement: {showUnitInfoPopup.movePoints} tiles per turn</div>
              <div className="mb-1">• Range: {showUnitInfoPopup.range === 1 ? 'Melee only' : `${showUnitInfoPopup.range} tiles`}</div>
              <div>• Type: {showUnitInfoPopup.type} unit</div>
              {getUnitSpecialNotes(showUnitInfoPopup.type).map((note) => (
                <div key={note}>• {note}</div>
              ))}
            </div>
            
            {/* Close Button */}
            <button
              onClick={() => setShowUnitInfoPopup(null)}
              className="mt-4 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 p-3 bg-red-600/90 border border-red-600 rounded text-red-400 text-sm z-20">
          {error}
        </div>
      )}
      
      {/* Victory Screen */}
      {showVictoryScreen && gameState?.gameOver && (
        <VictoryScreen
          gameOver={gameState.gameOver}
          winner={gameState.gameOver?.winner}
          victoryData={gameState.gameOver}
          onClose={() => setShowVictoryScreen(false)}
          playerID={playerID}
          units={[...(gameState.units || []), ...((gameState.retreatedUnits || []))]}
        />
      )}

      <ConfirmDialog
        open={showReadyConfirm}
        title="Deploy no units?"
        description="You have no units deployed. Are you sure you want to start the battle anyway?"
        confirmLabel="Start Battle"
        cancelLabel="Go Back"
        onConfirm={confirmReadyForBattle}
        onCancel={() => setShowReadyConfirm(false)}
      />
    </div>
  )
}
