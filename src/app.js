// Import routes
const healthRoutes = require('./routes/health');
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');  // ← MUDAR AQUI

// ... (resto do código igual)

// Routes
app.use('/health', healthRoutes);
app.use('/', indexRoutes);
app.use('/api/data', apiRoutes);  // ← MUDAR AQUI
