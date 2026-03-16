import YahooFinance from 'yahoo-finance2';

async function test() {
  try {
    const yf = new YahooFinance();
    const result = await yf.chart('^GSPC', {
      period1: '2023-01-01',
      interval: '1d'
    });
    console.log("Quotes:", result.quotes.slice(0, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
}

test();
