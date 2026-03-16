import fetch from 'node-fetch';

const NIXTLA_API_KEY = process.env.NIXTLA_API_KEY || 'nixak-a5746b8ee5fa5019162c334f9a70a92b8f0e2f072dad52ec7b3b0f7aa5371288b05e33c969126c18';

async function testTimeGPT() {
  const y = {
    "2023-01-01": 100,
    "2023-01-02": 105,
    "2023-01-03": 102,
    "2023-01-04": 108,
    "2023-01-05": 110,
    "2023-01-06": 109,
    "2023-01-07": 115,
  };
  
  try {
    const response = await fetch('https://api.nixtla.io/forecast', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NIXTLA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y,
        fh: 7,
        level: [80, 90]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`TimeGPT API error: ${response.status} ${response.statusText} - ${errorText}`);
    } else {
      const data = await response.json();
      console.log("TimeGPT Success:", data);
    }
  } catch (e) {
    console.error("Fetch error:", e);
  }
}

testTimeGPT();
