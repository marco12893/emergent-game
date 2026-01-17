import { NextResponse } from 'next/server'
import { getGame, setGame } from '@/lib/gameState'

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { gameId, action: gameAction, payload } = body
    
    console.log(`🎮 Action: ${gameAction} for game ${gameId}`)
    
    // Validate input
    if (!gameId || !gameAction) {
      return NextResponse.json({ 
        error: 'Missing required fields: gameId and action' 
      }, { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    let game
    try {
      game = await getGame(gameId)
    } catch (kvError) {
      console.error('❌ KV getGame failed:', kvError)
      return NextResponse.json({ 
        error: 'Database error: Unable to retrieve game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    if (!game) {
      console.log('❌ Game not found:', gameId)
      return NextResponse.json({ 
        error: 'Game not found',
        gameId: gameId
      }, { 
        status: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Handle different game actions
    try {
      switch (gameAction) {
        case 'placeUnit':
          // Validate payload
          if (!payload?.unitType || payload?.q === undefined || payload?.r === undefined || payload?.playerID === undefined) {
            return NextResponse.json({ 
              error: 'Missing required fields for placeUnit: unitType, q, r, playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          // Unit placement logic
          const unitStats = {
            SWORDSMAN: { maxHP: 100, attackPower: 25, movePoints: 2, range: 1, emoji: '⚔️' },
            ARCHER: { maxHP: 60, attackPower: 30, movePoints: 1, range: 2, emoji: '🏹' },
            KNIGHT: { maxHP: 150, attackPower: 30, movePoints: 3, range: 1, emoji: '🐴' },
            MILITIA: { maxHP: 40, attackPower: 20, movePoints: 2, range: 1, emoji: '🗡️' }
          }
          
          const stats = unitStats[payload.unitType]
          if (!stats) {
            return NextResponse.json({ 
              error: 'Invalid unit type: ' + payload.unitType 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const newUnit = {
            id: Date.now().toString(),
            type: payload.unitType,
            name: payload.unitType.charAt(0) + payload.unitType.slice(1).toLowerCase(),
            emoji: stats.emoji,
            ownerID: payload.playerID,
            q: payload.q,
            r: payload.r,
            s: -payload.q - payload.r,
            currentHP: stats.maxHP,
            maxHP: stats.maxHP,
            attackPower: stats.attackPower,
            movePoints: stats.movePoints,
            maxMovePoints: stats.movePoints,
            range: stats.range,
            hasMoved: false,
            hasAttacked: false
          }
          
          game.units.push(newUnit)
          game.log.push(`Player ${payload.playerID} placed ${newUnit.name} at (${payload.q}, ${payload.r})`)
          game.lastUpdate = Date.now()
          break
          
        case 'removeUnit':
          if (!payload?.unitId) {
            return NextResponse.json({ 
              error: 'Missing required field for removeUnit: unitId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.units = game.units.filter(u => u.id !== payload.unitId)
          game.log.push(`Player ${payload.playerID} removed a unit`)
          game.lastUpdate = Date.now()
          break
          
        case 'selectUnit':
          if (!payload?.unitId) {
            return NextResponse.json({ 
              error: 'Missing required field for selectUnit: unitId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.selectedUnitId = payload.unitId
          break
          
        case 'deselectUnit':
          game.selectedUnitId = null
          break
          
        case 'moveUnit':
          if (!payload?.unitId || payload?.targetQ === undefined || payload?.targetR === undefined) {
            return NextResponse.json({ 
              error: 'Missing required fields for moveUnit: unitId, targetQ, targetR' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const movingUnit = game.units.find(u => u.id === payload.unitId)
          if (movingUnit && movingUnit.movePoints > 0) {
            // Calculate terrain cost
            const terrainKey = `${payload.targetQ},${payload.targetR}`
            const terrain = game.terrainMap[terrainKey] || 'PLAIN'
            const terrainTypes = {
              PLAIN: { moveCost: 1, passable: true },
              FOREST: { moveCost: 1, passable: true },
              MOUNTAIN: { moveCost: Infinity, passable: false }
            }
            const terrainData = terrainTypes[terrain]
            
            if (!terrainData.passable) {
              return NextResponse.json({ 
                error: 'Cannot move to impassable terrain' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
            
            if (movingUnit.movePoints >= terrainData.moveCost) {
              movingUnit.q = payload.targetQ
              movingUnit.r = payload.targetR
              movingUnit.s = -payload.targetQ - payload.targetR
              movingUnit.movePoints -= terrainData.moveCost
              movingUnit.hasMoved = movingUnit.movePoints <= 0 // Mark as moved if no movement points left
              game.log.push(`Player ${payload.playerID}'s ${movingUnit.name} moved to (${payload.targetQ}, ${payload.targetR})`)
              game.lastUpdate = Date.now()
            } else {
              return NextResponse.json({ 
                error: 'Not enough movement points' 
              }, { 
                status: 400,
                headers: {
                  'Access-Control-Allow-Origin': '*',
                  'Access-Control-Allow-Methods': 'POST, OPTIONS',
                  'Access-Control-Allow-Headers': 'Content-Type',
                }
              })
            }
          } else {
            return NextResponse.json({ 
              error: 'Unit cannot move (not found, already moved, or no movement points)' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          break
          
        case 'attackUnit':
          if (!payload?.attackerId || !payload?.targetId) {
            return NextResponse.json({ 
              error: 'Missing required fields for attackUnit: attackerId, targetId' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          const attacker = game.units.find(u => u.id === payload.attackerId)
          const target = game.units.find(u => u.id === payload.targetId)
          
          if (attacker && target && !attacker.hasAttacked) {
            // Calculate terrain defense bonus for target
            const targetTerrainKey = `${target.q},${target.r}`
            const targetTerrain = game.terrainMap[targetTerrainKey] || 'PLAIN'
            const terrainTypes = {
              PLAIN: { defenseBonus: 0 },
              FOREST: { defenseBonus: 2 },
              MOUNTAIN: { defenseBonus: 0 }
            }
            const terrainData = terrainTypes[targetTerrain]
            const defenseBonus = terrainData.defenseBonus || 0
            
            const baseDamage = attacker.attackPower
            const actualDamage = Math.max(1, baseDamage - defenseBonus) // Minimum 1 damage
            
            target.currentHP -= actualDamage
            attacker.hasAttacked = true
            
            game.log.push(`Player ${payload.playerID}'s ${attacker.name} hit ${target.name} for ${actualDamage} damage${defenseBonus > 0 ? ` (reduced by terrain defense +${defenseBonus})` : ''}!`)
            
            if (target.currentHP <= 0) {
              game.units = game.units.filter(u => u.id !== target.id)
              game.log.push(`${target.name} was defeated!`)
            }
            
            game.lastUpdate = Date.now()
          } else {
            return NextResponse.json({ 
              error: 'Attack failed (unit not found or already attacked)' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          break
          
        case 'endTurn':
          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for endTurn: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.currentPlayer = game.currentPlayer === '0' ? '1' : '0'
          game.units.forEach(unit => {
            unit.hasMoved = false
            unit.hasAttacked = false
            unit.movePoints = unit.maxMovePoints // Reset movement points
          })
          game.log.push(`Player ${payload.playerID} ended turn. Player ${game.currentPlayer}'s turn begins.`)
          game.lastUpdate = Date.now()
          break
          
        case 'readyForBattle':
          if (!payload?.playerID) {
            return NextResponse.json({ 
              error: 'Missing required field for readyForBattle: playerID' 
            }, { 
              status: 400,
              headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
              }
            })
          }
          
          game.playersReady[payload.playerID] = true
          game.log.push(`Player ${payload.playerID} is ready for battle!`)
          
          if (game.playersReady['0'] && game.playersReady['1']) {
            game.phase = 'battle'
            game.log.push('⚔️ BATTLE PHASE BEGINS!')
          }
          game.lastUpdate = Date.now()
          break
          
        default:
          return NextResponse.json({ 
            error: 'Unknown action: ' + gameAction 
          }, { 
            status: 400,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          })
      }
    } catch (actionError) {
      console.error('❌ Action processing error:', actionError)
      return NextResponse.json({ 
        error: 'Action processing failed',
        details: actionError.message
      }, { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    // Save updated game state
    try {
      await setGame(gameId, game)
    } catch (saveError) {
      console.error('❌ KV setGame failed:', saveError)
      return NextResponse.json({ 
        error: 'Database error: Unable to save game',
        details: 'KV service temporarily unavailable'
      }, { 
        status: 503,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      })
    }
    
    console.log('📡 Broadcasting updated game state')
    return NextResponse.json({ 
      success: true, 
      gameState: game,
      message: `Action ${gameAction} completed successfully`
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
    
  } catch (error) {
    console.error('❌ Action route error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error.message
    }, { 
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    })
  }
}
