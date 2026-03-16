const fetch = require('node-fetch');
async function run() {
  const r = await fetch('https://dashboard.nixtla.io/api/openapi.json');
  console.log(r.status);
  const r2 = await fetch('https://api.nixtla.io/openapi.json');
  console.log(r2.status);
  if (r2.status === 200) {
    const d = await r2.json();
    console.log(Object.keys(d.paths));
  }
}
run();
