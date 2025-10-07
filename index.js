const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
const cloudscraper = require('cloudscraper');

const app = express();
const PORT = process.env.PORT || 5000;

const TOKEN_URL = 'https://rolexcoderz.in/api/get-token';
const CONTENT_URL = 'https://rolexcoderz.in/api/get-live-classes';
const UA = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const REFERER = 'https://rolexcoderz.in/live-classes';

let cachedData = {
  live: [],
  up: [],
  completed: [],
  lastUpdated: null
};



async function fetchToken() {
  try {
    const body = await cloudscraper.get({
      url: TOKEN_URL,
      headers: {
        'User-Agent': UA,
        'Referer': REFERER
      }
    });
    
    const jsonData = JSON.parse(body);
    
    if (jsonData.timestamp && jsonData.signature) {
      return {
        timestamp: jsonData.timestamp,
        signature: jsonData.signature
      };
    }
    
    throw new Error('Authentication failed: missing timestamp/signature');
  } catch (error) {
    console.error('❌ Token fetch failed (cloudscraper):', error.message);
    throw error;
  }
}



async function fetchContent(type, timestamp, signature) {
  try {
    const payload = { type };

    const options = {
      uri: CONTENT_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-timestamp': timestamp.toString(),
        'x-signature': signature,
        'User-Agent': UA,
        'Referer': REFERER,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      body: payload,
      gzip: true,
      timeout: 15000,
      json: true // ask cloudscraper to send JSON and parse response
    };

    const jsonData = await cloudscraper.request(options);

    // some endpoints return { data: "base64..." } while others might differ
    if (!jsonData || typeof jsonData !== 'object') {
      throw new Error(`Invalid JSON from content endpoint (${type}): ${JSON.stringify(jsonData)}`);
    }

    if (!jsonData.data) {
      throw new Error(`No 'data' field in content response (${type}). Response: ${JSON.stringify(jsonData)}`);
    }

    // decode base64 payload
    const decodedData = Buffer.from(jsonData.data, 'base64').toString('utf-8');

    let parsedData;
    try {
      parsedData = JSON.parse(decodedData);
    } catch (e) {
      throw new Error(`Failed to parse decoded ${type} JSON: ${e.message}. Decoded: ${decodedData}`);
    }

    // normalize structure if the payload nests data
    if (parsedData && typeof parsedData === 'object' && parsedData.data && Array.isArray(parsedData.data)) {
      parsedData = parsedData.data;
    }

    const modifiedData = modifyContent(parsedData);
    return modifiedData;
  } catch (error) {
    console.error(`❌ Failed to fetch ${type} via cloudscraper:`, error && error.message ? error.message : error);
    // if cloudscraper provides extra response info, log it (best-effort)
    if (error && error.response) {
      console.error('Response (raw):', error.response);
    }
    return null;
  }
}


function modifyContent(data) {
  let jsonString = JSON.stringify(data);
  
  jsonString = jsonString.replace(/https:\/\/www\.rolexcoderz\.xyz\/Player\/\?url=/gi, '');
  
  jsonString = jsonString.replace(/rolex coderz/gi, 'smartrz');
  jsonString = jsonString.replace(/rolexcoderz\.xyz/gi, 'smartrz');
  jsonString = jsonString.replace(/rolexcoderz/gi, 'smartrz');
  
  return JSON.parse(jsonString);
}

async function updateData() {
  console.log('Updating classes...');

  try {
    // Fetch fresh token and data for each type
    const { timestamp: liveTs, signature: liveSig } = await fetchToken();
    const liveData = await fetchContent('live', liveTs, liveSig);

    const { timestamp: upTs, signature: upSig } = await fetchToken();
    const upData = await fetchContent('up', upTs, upSig);

    const { timestamp: completedTs, signature: completedSig } = await fetchToken();
    const completedData = await fetchContent('completed', completedTs, completedSig);

    cachedData = {
      live: Array.isArray(liveData) ? liveData : [],
      up: Array.isArray(upData) ? upData : [],
      completed: Array.isArray(completedData) ? completedData : [],
      lastUpdated: new Date().toISOString()
    };

    console.log(`✅ Updated successfully: 
      Live (${cachedData.live.length}), 
      Upcoming (${cachedData.up.length}), 
      Completed (${cachedData.completed.length})`);
  } catch (err) {
    console.error("Update failed:", err.message);
  }
}


function generateHTML() {
  const { live, up, completed, lastUpdated } = cachedData;
  
  const renderClasses = (classes) => {
    if (!classes || classes.length === 0) {
      return `<div class="empty-state">No classes found</div>`;
    }
    
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
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
          font-family: 'Poppins', sans-serif; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          min-height: 100vh; 
          padding: 20px; 
        }
        
        .container { max-width: 1400px; margin: 0 auto; }
        
        .header { 
          background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%); 
          border-radius: 20px; 
          padding: 40px; 
          margin-bottom: 30px; 
          box-shadow: 0 20px 60px rgba(0,0,0,0.3); 
          text-align: center; 
        }
        
        .header h1 { 
          color: #667eea; 
          font-size: 3em; 
          margin-bottom: 10px; 
          font-weight: 700; 
          text-shadow: 2px 2px 4px rgba(0,0,0,0.1); 
        }
        
        .header .tagline { 
          color: #666; 
          font-size: 1.1em; 
          margin: 10px 0; 
          font-weight: 300; 
        }
        
        .update-time { 
          color: #999; 
          font-size: 0.85em; 
          margin-top: 15px; 
          font-weight: 300; 
        }
        
        .section { 
          background: linear-gradient(135deg, #ffffff 0%, #f8f9ff 100%); 
          border-radius: 20px; 
          padding: 30px; 
          margin-bottom: 30px; 
          box-shadow: 0 20px 60px rgba(0,0,0,0.3); 
          animation: fadeIn 0.5s ease-in; 
        }
        
        @keyframes fadeIn { 
          from { opacity: 0; transform: translateY(20px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        
        .section-title { 
          display: flex; 
          align-items: center; 
          margin-bottom: 25px; 
          padding-bottom: 15px; 
          border-bottom: 3px solid #667eea; 
        }
        
        .section-title h2 { 
          color: #333; 
          font-size: 2em; 
          font-weight: 600; 
          margin: 0; 
        }
        
        .status-badge { 
          display: inline-block; 
          padding: 8px 20px; 
          border-radius: 25px; 
          font-size: 0.7em; 
          font-weight: 600; 
          margin-left: 15px; 
          text-transform: uppercase; 
          letter-spacing: 1px; 
        }
        
        .status-live { 
          background: linear-gradient(135deg, #ff416c 0%, #ff4b2b 100%); 
          color: white; 
          animation: pulse 2s infinite; 
          box-shadow: 0 5px 15px rgba(255, 65, 108, 0.4); 
        }
        
        .status-upcoming { 
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); 
          color: white; 
          box-shadow: 0 5px 15px rgba(240, 147, 251, 0.4); 
        }
        
        .status-completed { 
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); 
          color: white; 
          box-shadow: 0 5px 15px rgba(79, 172, 254, 0.4); 
        }
        
        @keyframes pulse { 
          0%, 100% { transform: scale(1); opacity: 1; } 
          50% { transform: scale(1.05); opacity: 0.9; } 
        }
        
        .class-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); 
          gap: 25px; 
        }
        
        .class-card { 
          background: white; 
          border-radius: 15px; 
          overflow: hidden; 
          transition: all 0.3s ease; 
          border: 2px solid transparent; 
          box-shadow: 0 5px 15px rgba(0,0,0,0.1); 
        }
        
        .class-card:hover { 
          transform: translateY(-8px); 
          box-shadow: 0 15px 35px rgba(102, 126, 234, 0.4); 
          border-color: #667eea; 
        }
        
        .card-header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          padding: 20px; 
          color: white; 
        }
        
        .card-header h3 { 
          font-size: 1.4em; 
          font-weight: 600; 
          line-height: 1.4; 
        }
        
        .card-body { 
          padding: 20px; 
        }
        
        .description { 
          color: #666; 
          font-size: 0.95em; 
          line-height: 1.6; 
          margin-bottom: 15px; 
          padding: 12px; 
          background: #f8f9ff; 
          border-radius: 8px; 
          border-left: 4px solid #667eea; 
        }
        
        .class-info { 
          margin: 15px 0; 
        }
        
        .info-item { 
          display: flex; 
          align-items: center; 
          color: #555; 
          margin: 10px 0; 
          font-size: 0.95em; 
        }
        
        .info-item .icon { 
          margin-right: 10px; 
          font-size: 1.2em; 
        }
        
        .watch-btn { 
          display: inline-block; 
          width: 100%; 
          margin-top: 15px; 
          padding: 12px 25px; 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
          color: white; 
          text-decoration: none; 
          border-radius: 8px; 
          transition: all 0.3s ease; 
          font-weight: 600; 
          text-align: center; 
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4); 
        }
        
        .watch-btn:hover { 
          transform: translateY(-2px); 
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6); 
        }
        
        .empty-state { 
          text-align: center; 
          padding: 60px 20px; 
          color: #999; 
          font-size: 1.2em; 
          font-weight: 300; 
        }
        
        @media (max-width: 768px) {
          .header h1 { font-size: 2em; }
          .section-title h2 { font-size: 1.5em; }
          .class-grid { grid-template-columns: 1fr; }
        }
    </style>
    <script>
        setTimeout(() => { window.location.reload(); }, 60000);
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>SmartRZ</h1>
            <p class="tagline">Your Learning Journey Starts Here</p>
            ${lastUpdated ? `<div class="update-time">Updated just now</div>` : ''}
        </div>
        
        <div class="section">
            <div class="section-title">
                <h2>🔴 Live Classes</h2>
                <span class="status-badge status-live">Live</span>
            </div>
            <div class="class-grid">
                ${renderClasses(live)}
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">
                <h2>📅 Upcoming Classes</h2>
                <span class="status-badge status-upcoming">Upcoming</span>
            </div>
            <div class="class-grid">
                ${renderClasses(up)}
            </div>
        </div>
        
        <div class="section">
            <div class="section-title">
                <h2>📚 Recorded Classes</h2>
                <span class="status-badge status-completed">Available</span>
            </div>
            <div class="class-grid">
                ${renderClasses(completed)}
            </div>
        </div>
    </div>
</body>
</html>`;
}

app.get('/', (req, res) => {
  res.send(generateHTML());
});

app.get('/api/data', (req, res) => {
  res.json(cachedData);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', lastUpdated: cachedData.lastUpdated });
});

cron.schedule('* * * * *', () => {
  updateData();
});

updateData();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
