'use client'

import React from 'react'
import { Client } from 'boardgame.io/react'
import { MedievalBattleGame } from '@/game/GameLogic'
import BattleBoard from './BattleBoard'

const NetworkGameClient = ({ serverUrl, playerID, matchID }) => {
  return Client({
    game: MedievalBattleGame,
    board: BattleBoard,
    multiplayer: {
      server: serverUrl || 'http://localhost:8000',
      credentials: null, // Add authentication if needed
    },
    debug: false,
  })({ playerID, matchID })
}

export default NetworkGameClient
