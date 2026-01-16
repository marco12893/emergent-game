# 🌐 Multiplayer Setup Guide

## 🚀 Quick Start (Local Testing)

### 1. Install Server Dependencies
```bash
npm install boardgame.io@0.50.2 cors@2.8.5
```

### 2. Start the Game Server
```bash
node server.js
```
Server will run on: `http://localhost:8000`

### 3. Start the Next.js Client
```bash
npm run dev
```
Client will run on: `http://localhost:3000`

### 4. Play Multiplayer
1. Open `http://localhost:3000/multiplayer` in **two browser tabs**
2. Player 1: Enter Player ID `0`
3. Player 2: Enter Player ID `1` 
4. Both use the same Match ID (e.g., "battle1")
5. Click "Join Battle" and start playing!

---

## 🌍 Internet Deployment

### Option 1: Railway (Easiest)
1. Push your code to GitHub
2. Create a new Railway project
3. Set environment variables:
   - `NODE_ENV=production`
   - `PORT=8000`
4. Railway will give you a URL like: `https://your-game.railway.app`

### Option 2: Vercel + Railway
**Frontend (Vercel):**
1. Deploy to Vercel: `vercel`
2. Set environment variable: `NEXT_PUBLIC_GAME_SERVER_URL=https://your-game.railway.app`

**Backend (Railway):**
1. Deploy `server.js` to Railway
2. Update CORS origins in `server.js` to include your Vercel domain

### Option 3: DigitalOcean
1. Create a Droplet ($5/month)
2. Install Node.js: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`
3. Install PM2: `npm install -g pm2`
4. Run server: `pm2 start server.js --name "game-server"`
5. Set up nginx as reverse proxy (optional)

---

## 🔧 Configuration

### Server Configuration (`server.js`)
```javascript
const server = Server({
  games: [MedievalBattleGame],
  origins: [
    'http://localhost:3000',
    'https://your-domain.com', // Add your deployed domain
  ],
});
```

### Client Configuration
Update the server URL in `app/multiplayer/page.js`:
```javascript
multiplayer: SocketIO({ server: 'https://your-game-server-domain.com' })
```

---

## 🎮 How It Works

### Architecture
- **Server**: Handles game logic, state management, and real-time sync
- **Client**: Renders UI, sends moves to server
- **Communication**: WebSocket (Socket.IO) for real-time updates

### Game Flow
1. Two players connect to same match ID
2. Server manages game state and turn order
3. Clients receive real-time updates
4. Moves are validated on server before applying

---

## 🔒 Security Considerations

### For Production:
1. **Authentication**: Add player authentication
2. **Rate Limiting**: Prevent move spam
3. **Input Validation**: Server already validates moves
4. **HTTPS**: Use HTTPS in production
5. **CORS**: Restrict to your domains only

### Example Authentication:
```javascript
// In server.js
const server = Server({
  games: [MedievalBattleGame],
  origins: ['https://your-domain.com'],
  credentials: (playerID) => {
    // Validate player credentials here
    return true; // or false
  },
});
```

---

## 🐛 Troubleshooting

### "Connection Failed"
- Check if server is running on port 8000
- Verify firewall settings
- Check CORS configuration

### "Move Invalid"
- Server validates all moves
- Check game logic in `GameLogic.js`
- Ensure client and server game definitions match

### "Players Can't Connect"
- Ensure both players use same Match ID
- Check if server allows multiple connections
- Verify Socket.IO is working

---

## 📱 Mobile Support

The game works on mobile browsers! For better mobile experience:
1. Add responsive design improvements
2. Consider touch-friendly controls
3. Test on different screen sizes

---

## 🚀 Scaling

For many concurrent games:
1. Use Redis for session storage
2. Load balance across multiple server instances
3. Consider database persistence for long games
4. Monitor server performance

---

## 💡 Next Steps

1. **Add matchmaking**: Create a lobby system
2. **Spectator mode**: Allow others to watch games
3. **Game replay**: Save and replay matches
4. **Ranking system**: Track player ratings
5. **Tournaments**: Organize competitions

---

## 🤝 Contributing

Feel free to improve the multiplayer system:
- Better error handling
- Reconnection logic
- Room management
- Performance optimizations

Good luck and have fun playing! 🎮
