import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { startBackgroundTasks, runDataCollector, handleTimeGpt } from './server-backend';

const app = express();
app.use(express.json());
const PORT = parseInt(process.env.PORT || '3000', 10);

app.get('/api/config', (req, res) => {
  res.json({ 
    apiKey: process.env.GEMINI_API_KEY 
  });
});

app.post('/api/run-collector', async (req, res) => {
  try {
    await runDataCollector();
    res.json({ success: true, message: 'Data collector run completed' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/timegpt', handleTimeGpt);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist'), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
      }
    }));
    
    // Prevent SPA fallback for missing assets to avoid MIME type errors
    app.use('/assets', (req, res) => {
      res.status(404).send('Asset not found');
    });

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startBackgroundTasks();
  });
}

startServer();
