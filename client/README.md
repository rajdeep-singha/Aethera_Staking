# Aethera Staking Client

A beautiful React frontend for the Aethera Staking platform on Aptos blockchain.

![Aethera Staking](https://img.shields.io/badge/Aptos-Staking-64ffda?style=for-the-badge)

## Features

- 🔗 **Petra Wallet Integration** - Connect your Aptos wallet seamlessly
- 💎 **Stake APT Tokens** - Stake your tokens with customizable lock durations
- 📊 **Real-time Stats** - View vault statistics and your staking position
- 🎁 **Claim Rewards** - Easily claim your accumulated staking rewards
- ⏱️ **Lock Timer** - Visual countdown for your staking lock period
- 📱 **Responsive Design** - Beautiful UI that works on all devices

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- [Petra Wallet](https://petra.app/) browser extension
- Backend server running (see main project README)

### Installation

```bash
# Navigate to client directory
cd client

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file based on `.env.example`:

```env
VITE_API_URL=http://localhost:3000/api
```

## Tech Stack

- ⚛️ **React 18** - UI Framework
- 📘 **TypeScript** - Type Safety
- ⚡ **Vite** - Build Tool
- 🎨 **CSS3** - Modern Styling with CSS Variables
- 🌐 **Axios** - HTTP Client

## Project Structure

```
client/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── ClaimRewards.tsx    # Rewards claiming component
│   │   ├── PlayerInfo.tsx       # User staking info display
│   │   ├── StakeForm.tsx        # Main staking form
│   │   └── VaultInfo.tsx        # Vault statistics display
│   ├── services/
│   │   └── api.ts               # Backend API integration
│   ├── App.tsx                  # Main application
│   ├── App.css                  # App styles
│   ├── index.css                # Global styles
│   └── main.tsx                 # Entry point
├── index.html
├── package.json
└── vite.config.ts
```

## Usage

1. **Connect Wallet** - Click "Connect Petra" to connect your Aptos wallet
2. **View Stats** - Check current APY rate and vault statistics
3. **Stake Tokens** - Enter amount and select lock duration
4. **Claim Rewards** - Claim accumulated rewards anytime
5. **Unstake** - Withdraw tokens after lock period ends

## API Endpoints Used

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/vault/info` | GET | Get vault statistics |
| `/player/:address` | GET | Get player staking info |
| `/balance/:address` | GET | Get account balance |
| `/stake/simulate` | POST | Simulate stake rewards |

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Styling

The app uses a custom dark theme with:
- **Primary Color**: `#64ffda` (Cyan/Teal)
- **Secondary Color**: `#8b5cf6` (Purple)
- **Accent Color**: `#ffd700` (Gold)
- **Background**: Deep dark blue-black gradient

## License

MIT License
