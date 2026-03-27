import { loadEnv } from './config/load-env';

loadEnv();

require('./db/db'); // Initialize database after loading .env

const { createApp } = require('./app') as typeof import('./app');

const PORT = process.env.PORT || 3000;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api`);
});
