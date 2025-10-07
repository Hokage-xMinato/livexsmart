const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// JSON files created by your bash script
const FILES = {
  live: path.join(__dirname, 'output_live.json'),
  up: path.join(__dirname, 'output_up.json'),
  completed: path.join(__dirname, 'output_completed.json')
};

// Cached data in memory
let cachedData = {
  live: [],
  up: [],
  completed: [],
  lastUpdated: null
};

// Function to run bash script
function runBashScript() {
  console.log('🟢 Running fetch script...');
  const script = path.join(__dirname, 'fetch_classes.sh');

  exec(`bash "${script}"`, (err, stdout, stderr) => {
    if (err) {
      console.error('❌ Bash script failed:', err.message);
      return;
    }
    if (stderr) console.error('Bash stderr:', stderr);
    console.log(stdout);
    loadJSONFiles();
  });
}

// Function to read JSON files safely
function loadJSONFiles() {
  try {
    cachedData.live = JSON.parse(fs.readFileSync(FILES.live, 'utf8'));
  } catch { cachedData.live = []; }
  
  try {
    cachedData.up = JSON.parse(fs.readFileSync(FILES.up, 'utf8'));
  } catch { cachedData.up = []; }
  
  try {
    cachedData.completed = JSON.parse(fs.readFileSync(FILES.completed, 'utf8'));
  } catch { cachedData.completed = []; }

  cachedData.lastUpdated = new Date().toISOString();
  console.log(`✅ Data loaded at ${cachedData.lastUpdated}`);
}

// Schedule the bash script to run every minute
setInterval(runBashScript, 60 * 1000); // 60 seconds
runBashScript(); // run immediately on startup

// HTML generator
function generateHTML() {
  const { live, up, completed, lastUpdated } = cachedData;

  const renderClasses = (classes) => {
    if (!classes || classes.length === 0) {
      return `<div class="empty-state">No classes found</div>`;
    }
    return classes.map(cls => `
      <div class="class-card">
        <div class="card-header"><h3>${cls.title || cls.name || 'Class'}</h3></div>
        <div class="card-body">
          ${cls.description ? `<p class="description">${cls.description}</p>` : ''}
          <div class="class-info">
            ${cls.teacher ? `<div class="info-item">👨‍🏫 ${cls.teacher}</div>` : ''}
            ${cls.subject ? `<div class="info-item">📚 ${cls.subject}</div>` : ''}
            ${cls.date ? `<div class="info-item">📅 ${cls.date}</div>` : ''}
            ${cls.time ? `<div class="info-item">⏰ ${cls.time}</div>` : ''}
            ${cls.duration ? `<div class="info-item">⏱️ ${cls.duration}</div>` : ''}
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
/* Your previous CSS here (same as before) */
body { font-family: Poppins,sans-serif; padding: 20px; background: #f0f0f0;}
.container { max-width: 1200px; margin: auto;}
.header { text-align: center; margin-bottom: 30px;}
.class-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px;}
.class-card { background: white; border-radius: 10px; padding: 15px; box-shadow: 0 3px 15px rgba(0,0,0,0.1);}
</style>
<script>setTimeout(()=>window.location.reload(),60000);</script>
</head>
<body>
<div class="container">
<div class="header"><h1>SmartRZ</h1><p>Last updated: ${lastUpdated || 'Loading...'}</p></div>

<h2>🔴 Live Classes</h2>
<div class="class-grid">${renderClasses(live)}</div>

<h2>📅 Upcoming Classes</h2>
<div class="class-grid">${renderClasses(up)}</div>

<h2>📚 Recorded Classes</h2>
<div class="class-grid">${renderClasses(completed)}</div>
</div>
</body>
</html>
  `;
}

// Routes
app.get('/', (req, res) => res.send(generateHTML()));
app.get('/api/data', (req, res) => res.json(cachedData));
app.get('/health', (req, res) => res.json({ status: 'ok', lastUpdated: cachedData.lastUpdated }));

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
