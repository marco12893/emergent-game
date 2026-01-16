const { Server } = require('boardgame.io/dist/cjs/server.js');
const cors = require('cors');

// Simple game definition for testing
const TestGame = {
  name: 'test-game',
  setup: () => ({ players: {} }),
  moves: {
    clickCell: (G, ctx, id) => {
      G.players[ctx.playerID] = id;
    },
  },
};

const server = Server({
  games: [TestGame],
  origins: ['http://localhost:3000'],
});

server.app.use(cors());

const PORT = process.env.PORT || 8000;

server.run(PORT, () => {
  console.log(`🎮 Server running on port ${PORT}`);
  console.log(`🔗 Game server available at: http://localhost:${PORT}`);
});
