# 🚀 Vercel Deployment Guide

## 📋 Prerequisites
- GitHub account (free)
- Vercel account (free)
- Your game code pushed to GitHub

## 🎯 Step-by-Step Deployment

### 1. **Push to GitHub**
```bash
git add .
git commit -m "Ready for Vercel deployment"
git push origin main
```

### 2. **Deploy to Vercel**
1. Go to [vercel.com](https://vercel.com)
2. Click "Import Project"
3. Connect your GitHub repository
4. Vercel will automatically detect it's a Next.js app

### 3. **Configure Server Functions**
Vercel will automatically use your `vercel.json` file to:
- Deploy the Node.js server (`server-http.js`)
- Handle API routes (`/api/*`)
- Serve the game client

### 4. **Update Server URL**
After deployment, you'll get a URL like:
`https://your-project-name.vercel.app`

Update the client code:
```javascript
// In app/http-multiplayer/page.js, line 84
const serverUrl = process.env.NODE_ENV === 'production' 
  ? 'https://your-project-name.vercel.app' 
  : 'http://localhost:8000'
```

### 5. **Test Multiplayer**
1. Open `https://your-project-name.vercel.app/http-multiplayer`
2. Share the URL with your friend in France
3. Both players join with the same Match ID
4. Play together! 🎮

## 🔧 Configuration Files

### `vercel.json`
```json
{
  "version": 2,
  "builds": [
    {"src": "server-http.js", "use": "@vercel/node"}
  ],
  "routes": [
    {"src": "/api/(.*)", "dest": "/server-http.js"},
    {"src": "/(.*)", "dest": "/app/http-multiplayer/page.js"}
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

### `package.json` Dependencies
Your `package.json` already has all needed dependencies:
- `express` - Web server
- `cors` - Cross-origin requests
- `socket.io-client` - For future WebSocket features

## 🌐 What Gets Deployed

### **Frontend (Next.js)**
- Game interface
- Unit selection
- Battle board
- Real-time updates

### **Backend (Node.js)**
- Game server
- API endpoints
- Game state management
- Multiplayer logic

## 🎮 How It Works

1. **Player 1** joins → Creates game
2. **Player 2** joins with same Match ID
3. **Real-time updates** via HTTP polling
4. **Game state** stored in server memory
5. **Cross-origin** requests allowed for multiplayer

## 🛠️ Troubleshooting

### "Connection Failed"
- Check if Vercel deployment completed
- Verify server URL matches your Vercel URL
- Check Vercel logs for errors

### "Can't Place Units"
- Ensure you're in your spawn zone
- Check if it's your turn
- Verify Match ID matches

### "Game Not Updating"
- Refresh the page
- Check browser console for errors
- Ensure both players have same Match ID

## 📱 Scaling Considerations

### **Free Tier Limitations**
- Vercel free tier: 100GB bandwidth/month
- Serverless functions: 10s timeout
- Memory: 1GB per function

### **For Heavy Usage**
- Consider database persistence
- Add Redis for session storage
- Monitor bandwidth usage

## 🎯 Next Steps

### **Enhancements**
- Add database for game persistence
- Implement matchmaking system
- Add player authentication
- Create tournament system

### **Monetization**
- Upgrade to Vercel Pro for more resources
- Add premium features
- Implement in-game purchases

---

## 🚀 Ready to Deploy!

Your game is now ready for global multiplayer! 🌍

**Deploy now and play with your friend in France!** 🇫🇷🇸
