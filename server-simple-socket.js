const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Simple Socket.IO setup without CORS restrictions for testing
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Game state storage
const games = {};

// Create a new game
const createGame = (gameId) => {
  console.log('Creating new game:', gameId);
  games[gameId] = {
    id: gameId,
    players: {},
    currentPlayer: '0',
    phase: 'setup',
    units: [],
    log: ['Game started!']
  };
  return games[gameId];
};

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Player connected:', socket.id);
  
  socket.on('joinGame', (data) => {
    console.log('🎮 joinGame event received:', data);
    const { gameId, playerID } = data;
    
    if (!games[gameId]) {
      createGame(gameId);
    }
    
    const game = games[gameId];
    game.players[playerID] = socket.id;
    socket.join(gameId);
    
    console.log(`✅ Player ${playerID} joined game ${gameId}`);
    console.log('👥 Game players:', Object.keys(game.players));
    
    // Send current game state to player
    console.log('📤 Sending game state to player');
    socket.emit('gameState', game);
    
    // Notify other players
    socket.to(gameId).emit('playerJoined', { playerID });
  });
  
  socket.on('gameAction', (data) => {
    console.log('🎮 Game action received:', data);
    const { gameId, action, payload } = data;
    const game = games[gameId];
    
    if (!game) {
      console.log('❌ Game not found:', gameId);
      return;
    }
    
    console.log('🎯 Processing action:', action, payload);
    
    // Handle different actions
    switch (action) {
      case 'placeUnit':
        // Simple unit placement logic
        const newUnit = {
          id: Date.now().toString(),
          type: payload.unitType,
          ownerID: payload.playerID,
          q: payload.q,
          r: payload.r,
          currentHP: 100,
          maxHP: 100,
          emoji: payload.unitType === 'SWORDSMAN' ? '⚔️' : payload.unitType === 'ARCHER' ? '🏹' : '🐴'
        };
        game.units.push(newUnit);
        game.log.push(`Player ${payload.playerID} placed ${payload.unitType} at (${payload.q}, ${payload.r})`);
        console.log('✅ Unit placed:', newUnit);
        break;
        
      case 'endTurn':
        game.currentPlayer = game.currentPlayer === '0' ? '1' : '0';
        game.log.push(`Player ${payload.playerID} ended turn. Current player: ${game.currentPlayer}`);
        console.log('🔄 Turn ended. Current player:', game.currentPlayer);
        break;
        
      case 'readyForBattle':
        game.phase = 'battle';
        game.log.push(`Player ${payload.playerID} is ready for battle!`);
        console.log('⚔️ Battle phase started');
        break;
    }
    
    // Broadcast updated game state to all players in the game
    console.log('📡 Broadcasting game state to all players');
    io.to(gameId).emit('gameState', game);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Player disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', games: Object.keys(games).length });
});

// Test endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Game server is running!', games: Object.keys(games) });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Game server running on port ${PORT}`);
  console.log(`🔗 Available at: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
});
