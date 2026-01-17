# 🎮 Game Tile Assets

This folder contains tile assets for the hex grid game.

## 📁 Folder Structure

```
assets/tiles/
├── README.md              # This file
├── plains/               # Plain terrain tiles
├── forests/              # Forest terrain tiles
├── mountains/             # Mountain terrain tiles
└── ui/                  # UI-related tile assets
```

## 🎨 Asset Types

### 🟫 Plains
- Basic hex tiles for movement
- Default terrain type
- Movement cost: 1

### 🌲 Forests  
- Forest hex tiles
- Defense bonus: +10
- Movement cost: 1

### ⛰ Mountains
- Mountain hex tiles
- Impassable terrain
- Movement cost: ∞

## 📝 Usage

Import tile assets in your components:

```javascript
import plainsTile from '@/assets/tiles/plains/default.png'
import forestTile from '@/assets/tiles/forests/dense.png'
import mountainTile from '@/assets/tiles/mountains/rocky.png'
```

## 🎯 Future Assets

Consider adding:
- **Variations**: Different tile styles per terrain
- **Animations**: Water tiles, special effects
- **UI Elements**: Highlighted tiles, attack indicators
- **Seasonal**: Snow, autumn, spring variations
