const express = require('express');
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Cached data
let cachedData = {
  live: [],
  up: [],
  completed: [],
  lastUpdated: null
};

// Paths to bash output JSON
const OUTPUT_FILES = {
  live: path.join(__dirname, 'output_live.json'),
  up: path.join(__dirname, 'output_up.json'),
  completed: path.join(__dirname, 'output_completed.json')
};

// Run the bash script and update cache
async function updateData() {
  console.log('--- Updating classes via bash script ---');
  
  const scriptPath = path.join(__dirname, 'fetch_classes.sh');

  exec(`bash "${scriptPath}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Bash script failed:', err.message);
      return;
    }
    if (stderr) console.error('Bash stderr:', stderr);
    console.log(stdout);

    // Read the output JSON files
    for (const type of ['live', 'up', 'completed']) {
      try {
        if (fs.existsSync(OUTPUT_FILES[type])) {
          const raw = fs.readFileSync(OUTPUT_FILES[type], 'utf-8');
          const json = JSON.parse(raw);
          cachedData[type] = Array.isArray(json) ? json : [];
        } else {
          cachedData[type] = [];
        }
      } catch (e) {
        console.error(`❌ Failed to read/parse ${type} JSON:`, e.message);
        cachedData[type] = [];
      }
    }

    cachedData.lastUpdated = new Date().toISOString();
    console.log(`✅ Cache updated: Live(${cachedData.live.length}), Up(${cachedData.up.length}), Completed(${cachedData.completed.length})`);
  });
}

// HTML generator
function generateHTML() {
  const { live, up, completed, lastUpdated } = cachedData;

  const renderClasses = (classes) => {
    if (!classes || classes.length === 0) return `<div class="empty-state">No classes found</div>`;
    return classes.map(cls => `
      <div class="class-card">
        <div class="card-header">
          <h3>${cls.title || cls.name || 'Class'}</h3>
        </div>
        <div class="card-body">
          ${cls.description ? `<p class="description">${cls.description}</p>` : ''}
          <div class="class-info">
            ${cls.teacher ? `<div class="info-item"><span class="icon">👨‍🏫</span> ${cls.teacher}</div>` : ''}
            ${cls.subject ? `<div class="info-item"><span class="icon">📚</span> ${cls.subject}</div>` : ''}
            ${cls.date ? `<div class="info-item"><span class="icon">📅</span> ${cls.date}</div>` : ''}
            ${cls.time ? `<div class="info-item"><span class="icon">⏰</span> ${cls.time}</div>` : ''}
            ${cls.duration ? `<div class="info-item"><span class="icon">⏱️</span> ${cls.duration}</div>` : ''}
          </div>
          ${cls.link ? `<a href="${cls.link}" class="watch-btn" target="_blank">Watch Now</a>` : ''}
        </div>
      </div>
    `).join('');
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SmartRZ - Online Classes</title>
<style>
/* Add your CSS here (same as your previous style) */
body { font-family: 'Poppins', sans-serif; background: #f0f0f0; padding: 20px; }
.container { max-width: 1400px; margin: 0 auto; }
.header { text-align: center; margin-bottom: 30px; }
.class-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 25px; }
.class-card { background: white; border-radius: 15px; padding: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); }
</style>
<script>
setTimeout(() => { window.location.reload(); }, 60000);
</script>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>SmartRZ</h1>
    <p>Updated: ${lastUpdated || 'Never'}</p>
  </div>

  <h2>🔴 Live Classes</h2>
  <div class="class-grid">${renderClasses(live)}</div>

  <h2>📅 Upcoming Classes</h2>
  <div class="class-grid">${renderClasses(up)}</div>

  <h2>📚 Completed Classes</h2>
  <div class="class-grid">${renderClasses(completed)}</div>
</div>
</body>
</html>`;
}

// Routes
app.get('/', (req, res) => res.send(generateHTML()));
app.get('/api/data', (req, res) => res.json(cachedData));
app.get('/health', (req, res) => res.json({ status: 'ok', lastUpdated: cachedData.lastUpdated }));

// Cron: update every minute
cron.schedule('* * * * *', () => updateData());

// Initial fetch
updateData();

// Start server
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
