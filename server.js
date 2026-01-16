const { Server } = require('boardgame.io/dist/cjs/server.js');
const { MedievalBattleGame } = require('./game/GameLogic.cjs');
const cors = require('cors');

const server = Server({
  games: [MedievalBattleGame],
  origins: [
    'http://localhost:3000',
    'https://your-domain.com', // Replace with your actual domain
  ],
});

// Enable CORS for all routes
server.app.use(cors());

const PORT = process.env.PORT || 8000;

server.run(PORT, () => {
  console.log(`🎮 Server running on port ${PORT}`);
  console.log(`🔗 Game server available at: http://localhost:${PORT}`);
});
