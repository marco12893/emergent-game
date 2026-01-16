const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// Socket.IO setup
const io = new SocketIOServer(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true // Allow older Engine.IO protocol
});

// Game state storage
const games = {};

// Simple game logic
const createGame = (gameId) => {
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
  console.log('📊 Total connected clients:', io.engine.clientsCount);
  
  socket.on('joinGame', (data) => {
    console.log('🎮 joinGame event received:', data);
    const { gameId, playerID } = data;
    
    if (!games[gameId]) {
      console.log('🆕 Creating new game:', gameId);
      createGame(gameId);
    }
    
    const game = games[gameId];
    game.players[playerID] = socket.id;
    socket.join(gameId);
    
    console.log(`✅ Player ${playerID} joined game ${gameId}`);
    console.log('👥 Game players:', Object.keys(game.players));
    
    // Send current game state to player
    console.log('📤 Sending game state to player:', game);
    socket.emit('gameState', game);
    
    // Notify other players
    socket.to(gameId).emit('playerJoined', { playerID });
  });
  
  socket.on('gameAction', (data) => {
    const { gameId, action, payload } = data;
    const game = games[gameId];
    
    if (!game) return;
    
    console.log('Game action:', action, payload);
    
    // Handle different actions
    switch (action) {
      case 'placeUnit':
        // Simple unit placement logic
        game.units.push({
          id: Date.now().toString(),
          type: payload.unitType,
          ownerID: payload.playerID,
          q: payload.q,
          r: payload.r,
          currentHP: 100,
          maxHP: 100
        });
        game.log.push(`Player ${payload.playerID} placed ${payload.unitType} at (${payload.q}, ${payload.r})`);
        break;
        
      case 'endTurn':
        game.currentPlayer = game.currentPlayer === '0' ? '1' : '0';
        game.log.push(`Player ${payload.playerID} ended turn. Current player: ${game.currentPlayer}`);
        break;
        
      case 'readyForBattle':
        game.phase = 'battle';
        game.log.push(`Player ${payload.playerID} is ready for battle!`);
        break;
    }
    
    // Broadcast updated game state to all players in the game
    io.to(gameId).emit('gameState', game);
  });
  
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', games: Object.keys(games).length });
});

const PORT = process.env.PORT || 8000;

server.listen(PORT, () => {
  console.log(`🎮 Game server running on port ${PORT}`);
  console.log(`🔗 Available at: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
