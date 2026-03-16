async function run() {
  const u = 'https://api.nixtla.io/forecast';
  try {
    const r = await fetch(u, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer nixak-a5746b8ee5fa5019162c334f9a70a92b8f0e2f072dad52ec7b3b0f7aa5371288b05e33c969126c18',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y: {
          "2020-01-01": 1,
          "2020-01-02": 2,
          "2020-01-03": 3,
          "2020-01-04": 4,
          "2020-01-05": 5,
          "2020-01-06": 6,
          "2020-01-07": 7,
          "2020-01-08": 8,
          "2020-01-09": 9,
          "2020-01-10": 10
        },
        fh: 3,
        level: [80, 90]
      })
    });
    console.log(u, r.status);
    console.log(await r.text());
  } catch (e) {
    console.log(u, e.message);
  }
}
run();
