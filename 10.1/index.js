const express = require('express');
const mongoose = require('mongoose');
const prom = require('prom-client');
const winston = require('winston');
const collectDefaultMetrics = prom.collectDefaultMetrics;
const Registry = prom.Registry;
const register = new Registry();
collectDefaultMetrics({ register });
const httpRequestDurationMicroseconds = new prom.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['route', 'method', 'status'],
  buckets: [0.1, 5, 15, 50, 100, 500]
});
register.registerMetric(httpRequestDurationMicroseconds);

const httpRequestCounter = new prom.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'method', 'status']
});
register.registerMetric(httpRequestCounter);

// Set up Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
const app = express();
const PORT = process.env.PORT || 3002;
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDurationMicroseconds
      .labels(req.path, req.method, res.statusCode)
      .observe(duration);
    httpRequestCounter
      .labels(req.path, req.method, res.statusCode)
      .inc();
    
    logger.info({
      message: `${req.method} ${req.path}`,
      duration,
      statusCode: res.statusCode
    });
  });
  next();
});
// Now we will connect it to mongo DB
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/taskdb';
mongoose.connect(MONGO_URI)
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('MongoDB connection error:', err));
const taskSchema = new mongoose.Schema({
  title: String,
  description: String,
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});
const Task = mongoose.model('Task', taskSchema);
app.use(express.json());
// Now we will start routing through our files.
app.get('/', (req, res) => {
  res.json({ message: '10.1P Task monitoring' });
});
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find();
    res.json(tasks);
  } catch (err) {
    logger.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});
app.post('/api/tasks', async (req, res) => {
  try {
    const task = new Task(req.body);
    await task.save();
    res.status(201).json(task);
  } catch (err) {
    logger.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    logger.error('Error serving metrics:', err);
    res.status(500).json({ error: 'Error serving metrics' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});