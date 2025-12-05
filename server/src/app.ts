import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { stakingController } from './controllers/staking.controllers';

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// ============ Middleware ============

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', limiter);

// ============ Routes ============

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Aethera Staking API is running',
    timestamp: new Date().toISOString(),
  });
});

// Public endpoints
app.get('/api/vault/info', stakingController.getVaultInfo.bind(stakingController));
app.get('/api/player/:address', stakingController.getPlayerInfo.bind(stakingController));
app.get('/api/stats', stakingController.getStats.bind(stakingController));
app.get('/api/balance/:address', stakingController.getBalance.bind(stakingController));
app.post('/api/stake/simulate', stakingController.simulateStake.bind(stakingController));

// Admin endpoints ( protected with authentication middleware)
app.post('/api/admin/config', stakingController.updateConfig.bind(stakingController));
app.post('/api/admin/deposit', stakingController.deposit.bind(stakingController));
app.post('/api/admin/withdraw', stakingController.withdraw.bind(stakingController));

// ============ Error Handling ============

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// ============ Start Server ============

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Aethera Staking API Server         ║
  ╠═══════════════════════════════════════╣
  ║   Environment: ${process.env.NODE_ENV || 'development'}
  ║   Port: ${PORT}
  ║   Network: ${process.env.APTOS_NETWORK || 'testnet'}
  ╚═══════════════════════════════════════╝
  `);
});
