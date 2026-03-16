import YahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const yf = new YahooFinance();
    const result = await yf.chart('^GSPC', {
      period1: '2023-01-01',
      interval: '1d'
    });
    console.log("Success:", result.quotes.length);
  } catch (e) {
    console.error("Error:", e.message);
  }
}

test();
