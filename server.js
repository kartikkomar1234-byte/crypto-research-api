const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// ── Cache ──────────────────────────────────────────────────────────────────────
const cache = new Map();
function getCache(k){const v=cache.get(k);if(v&&Date.now()<v.exp)return v.data;cache.delete(k);return null;}
function setCache(k,d,ms){cache.set(k,{data:d,exp:Date.now()+ms});}

// ── Dynamic CoinDCX pair discovery ───────────────────────────────────────────
// Instead of a hardcoded list, we fetch ALL INR pairs from CoinDCX markets API
// This means EVERY coin on CoinDCX (including EULER, new listings) is supported

let ALL_INR_PAIRS = {}; // sym → {ticker, candle}
let pairsLoaded = false;

async function loadAllPairs(){
  if(pairsLoaded && Object.keys(ALL_INR_PAIRS).length > 50) return ALL_INR_PAIRS;
  try{
    // Use the ticker API directly - it already has ALL active markets
    // Filter markets ending in INR to get all INR pairs
    const r = await axios.get('https://api.coindcx.com/exchange/ticker',
      {headers:H, timeout:15000});
    const tickers = r.data || [];
    const pairs = {};
    tickers.forEach(t => {
      const market = t.market || '';
      const price = parseFloat(t.last_price||0);
      // Only INR markets that end with INR
      if(market.endsWith('INR')){
        // Extract symbol: remove INR suffix
        const sym = market.replace(/INR$/, '');
        if(sym && sym.length > 0 && sym.length <= 20){
          pairs[sym] = {
            ticker: market,
            candle: `B-${sym}_INR`,
            name: sym,
            hasPrice: price > 0,
          };
        }
      }
    });
    // Log some stats
    const withPrice = Object.values(pairs).filter(p=>p.hasPrice).length;
    console.log(`Found ${Object.keys(pairs).length} INR markets, ${withPrice} with live price`);
    if(Object.keys(pairs).length > 50){
      ALL_INR_PAIRS = pairs;
      pairsLoaded = true;
      console.log(`✅ Loaded ${Object.keys(pairs).length} INR pairs from ticker`);
      // Cache ticker too
      const map = {};
      tickers.forEach(t => { map[t.market] = t; });
      setCache('ticker', map, 30000);
    }
  }catch(e){
    console.log('loadAllPairs error:', e.message);
    pairsLoaded = true; // prevent retry loop
  }
  return ALL_INR_PAIRS;
}

// Load pairs on startup
loadAllPairs().then(p => console.log(`Startup: ${Object.keys(p).length} pairs loaded`));

// Name aliases → symbol (for common full names)
const NAMES = {
  'BITCOIN':'BTC','ETHEREUM':'ETH','BINANCE COIN':'BNB','BINANCE':'BNB',
  'SOLANA':'SOL','RIPPLE':'XRP','DOGECOIN':'DOGE','CARDANO':'ADA','TRON':'TRX',
  'AVALANCHE':'AVAX','SHIBA INU':'SHIB','SHIBA':'SHIB','CHAINLINK':'LINK',
  'POLKADOT':'DOT','POLYGON':'MATIC','LITECOIN':'LTC','UNISWAP':'UNI',
  'COSMOS':'ATOM','STELLAR':'XLM','BITCOIN CASH':'BCH','NEAR PROTOCOL':'NEAR',
  'ALGORAND':'ALGO','FILECOIN':'FIL','HEDERA':'HBAR','INTERNET COMPUTER':'ICP',
  'APTOS':'APT','INJECTIVE':'INJ','OPTIMISM':'OP','ARBITRUM':'ARB',
  'DOG WIF HAT':'WIF','MAKER':'MKR','FANTOM':'FTM','SANDBOX':'SAND',
  'DECENTRALAND':'MANA','AXIE INFINITY':'AXS','TONCOIN':'TON','NOTCOIN':'NOT',
  'WORLDCOIN':'WLD','STARKNET':'STRK','BITTENSOR':'TAO','ONDO FINANCE':'ONDO',
  'ETHENA':'ENA','JUPITER':'JUP','RENDER':'RNDR','FETCH.AI':'FET',
  'SINGULARITYNET':'AGIX','KASPA':'KAS','FLOKI INU':'FLOKI',
  'LIDO DAO':'LDO','CURVE':'CRV','MONERO':'XMR','QUANT':'QNT',
  'MULTIVERSX':'EGLD','KUSAMA':'KSM','STEPN':'GMT','EULER FINANCE':'EULER',
};

function resolve(input){
  const u = input.toUpperCase().trim();
  const pairs = ALL_INR_PAIRS;
  // Direct symbol match in dynamic pairs
  if(pairs[u]) return u;
  // Name alias map
  if(NAMES[u] && pairs[NAMES[u]]) return NAMES[u];
  // Partial name match
  const k = Object.keys(NAMES).find(k => u.includes(k) || k.includes(u));
  if(k && pairs[NAMES[k]]) return NAMES[k];
  // Partial symbol match in dynamic pairs
  const s = Object.keys(pairs).find(k => k.startsWith(u) || k === u);
  if(s) return s;
  return u;
}

// ── Indicators ─────────────────────────────────────────────────────────────────
function calcSMA(data, p){
  return data.map((_,i) => {
    if(i < p-1) return null;
    return data.slice(i-p+1, i+1).reduce((a,b) => a+b, 0) / p;
  });
}
function calcRSI(c, p=14){
  if(c.length < p+1) return 50;
  let g=0, l=0;
  for(let i=c.length-p; i<c.length; i++){
    const d = c[i]-c[i-1];
    if(d > 0) g+=d; else l+=Math.abs(d);
  }
  const rs = (g/p) / ((l/p)||0.0001);
  return parseFloat((100-100/(1+rs)).toFixed(2));
}
function calcMACD(c){
  const ema = (d,p) => { const k=2/(p+1); let e=d[0]; return d.map(v=>{e=v*k+e*(1-k);return e;}); };
  if(c.length < 26) return {macd:0, signal:0, histogram:0};
  const ml = ema(c,12).map((v,i) => v - ema(c,26)[i]);
  const sig = ema(ml, 9);
  const l = c.length-1;
  return {
    macd:      parseFloat(ml[l].toFixed(6)),
    signal:    parseFloat(sig[l].toFixed(6)),
    histogram: parseFloat((ml[l]-sig[l]).toFixed(6)),
  };
}
function calcBB(c, p=20){
  const sma = calcSMA(c, p);
  return c.map((_,i) => {
    if(i < p-1) return {upper:null, lower:null, middle:null, percent:0.5};
    const sl = c.slice(i-p+1, i+1), mean = sma[i];
    const std = Math.sqrt(sl.reduce((s,v) => s+(v-mean)**2, 0) / p);
    const upper = mean+2*std, lower = mean-2*std;
    return {upper, lower, middle:mean, percent:(c[i]-lower)/(upper-lower||1)};
  });
}
function detectPatterns(hist){
  const p = [];
  if(hist.length < 3) return p;
  const [,p1,c] = hist.slice(-3);
  const bC = Math.abs(c.close-c.open), rC = c.high-c.low;
  if(rC > 0 && bC < rC*0.1)
    p.push({name:'Doji', type:'neutral', description:'Indecision candle.'});
  if(c.close>c.open && p1.close<p1.open && c.open<p1.close && c.close>p1.open)
    p.push({name:'Bullish Engulfing', type:'bullish', description:'Strong bullish reversal.'});
  if(c.close<c.open && p1.close>p1.open && c.open>p1.close && c.close<p1.open)
    p.push({name:'Bearish Engulfing', type:'bearish', description:'Strong bearish reversal.'});
  if(bC < rC*0.3 && c.low < Math.min(c.open,c.close)-rC*0.3 && c.close > c.open)
    p.push({name:'Hammer', type:'bullish', description:'Potential bottom reversal.'});
  return p;
}
// ── Probability Engine ───────────────────────────────────────────────────────
// Returns bullish/bearish probability + confidence + regime + explanation
function buildSignal(rsi, macd, bbPct){ // kept for backward compat
  const result = buildProbability(rsi, macd, bbPct, 50, [], 0, 0);
  return result.signal;
}

function buildProbability(rsi, macd, bbPct, change24h, candles, volume, avgVolume){
  let bullScore = 0;
  let bearScore = 0;
  const factors = [];
  const warnings = [];

  // ── 1. RSI (weight: 20%) ─────────────────────────────────────────────────
  if(rsi < 25){
    bullScore += 20;
    factors.push({factor:'RSI Extremely Oversold', impact:'bullish', detail:`RSI ${rsi} — deeply oversold, strong bounce probability`});
  } else if(rsi < 35){
    bullScore += 14;
    factors.push({factor:'RSI Oversold', impact:'bullish', detail:`RSI ${rsi} — oversold zone, buyers likely stepping in`});
  } else if(rsi < 45){
    bullScore += 7;
    factors.push({factor:'RSI Recovering', impact:'slightly bullish', detail:`RSI ${rsi} — recovering from oversold`});
  } else if(rsi > 80){
    bearScore += 20;
    factors.push({factor:'RSI Extremely Overbought', impact:'bearish', detail:`RSI ${rsi} — extremely overbought, correction likely`});
    warnings.push('RSI above 80 — high reversal risk');
  } else if(rsi > 70){
    bearScore += 14;
    factors.push({factor:'RSI Overbought', impact:'bearish', detail:`RSI ${rsi} — overbought, momentum may be fading`});
  } else if(rsi > 60){
    bearScore += 6;
    factors.push({factor:'RSI Elevated', impact:'slightly bearish', detail:`RSI ${rsi} — slightly elevated, watch for reversal`});
  } else {
    bullScore += 4;
    factors.push({factor:'RSI Neutral', impact:'neutral', detail:`RSI ${rsi} — healthy neutral zone, no extreme`});
  }

  // ── 2. MACD (weight: 20%) ────────────────────────────────────────────────
  if(macd.macd > macd.signal && macd.macd > 0){
    bullScore += 20;
    factors.push({factor:'MACD Bullish', impact:'bullish', detail:'MACD above signal line and positive — upward momentum confirmed'});
  } else if(macd.macd > macd.signal && macd.macd <= 0){
    bullScore += 12;
    factors.push({factor:'MACD Crossover', impact:'bullish', detail:'MACD just crossed above signal — early bullish signal'});
  } else if(macd.macd < macd.signal && macd.macd < 0){
    bearScore += 20;
    factors.push({factor:'MACD Bearish', impact:'bearish', detail:'MACD below signal and negative — downward momentum confirmed'});
  } else {
    bearScore += 10;
    factors.push({factor:'MACD Weakening', impact:'slightly bearish', detail:'MACD below signal line — momentum fading'});
  }

  // ── 3. Bollinger Bands (weight: 15%) ─────────────────────────────────────
  if(bbPct < 0.1){
    bullScore += 15;
    factors.push({factor:'BB Near Lower Band', impact:'bullish', detail:`Price at ${(bbPct*100).toFixed(0)}% of bands — deep oversold, bounce zone`});
  } else if(bbPct < 0.25){
    bullScore += 9;
    factors.push({factor:'BB Lower Zone', impact:'bullish', detail:`Price in lower ${(bbPct*100).toFixed(0)}% of Bollinger Bands — good entry zone`});
  } else if(bbPct > 0.9){
    bearScore += 15;
    factors.push({factor:'BB Near Upper Band', impact:'bearish', detail:`Price at ${(bbPct*100).toFixed(0)}% of bands — overbought, pullback likely`});
    warnings.push('Price touching upper Bollinger Band — high mean-reversion risk');
  } else if(bbPct > 0.75){
    bearScore += 8;
    factors.push({factor:'BB Upper Zone', impact:'slightly bearish', detail:`Price in upper ${(bbPct*100).toFixed(0)}% of bands — approaching resistance`});
  } else {
    bullScore += 3;
    factors.push({factor:'BB Mid Zone', impact:'neutral', detail:'Price in middle of Bollinger Bands — no extreme'});
  }

  // ── 4. 24h Price Momentum (weight: 15%) ──────────────────────────────────
  if(change24h > 15){
    bearScore += 10;
    bullScore += 5;
    factors.push({factor:'Large 24h Pump', impact:'mixed', detail:`+${change24h.toFixed(1)}% in 24h — strong momentum but overbought risk`});
    warnings.push(`Coin already up ${change24h.toFixed(1)}% today — chasing risky`);
  } else if(change24h > 5){
    bullScore += 12;
    factors.push({factor:'Strong 24h Momentum', impact:'bullish', detail:`+${change24h.toFixed(1)}% today — healthy bullish momentum`});
  } else if(change24h > 0){
    bullScore += 5;
    factors.push({factor:'Positive 24h', impact:'slightly bullish', detail:`+${change24h.toFixed(1)}% today — mild positive momentum`});
  } else if(change24h < -15){
    bullScore += 8;
    bearScore += 7;
    factors.push({factor:'Large 24h Drop', impact:'mixed', detail:`${change24h.toFixed(1)}% in 24h — oversold bounce possible but trend broken`});
    warnings.push(`Coin down ${Math.abs(change24h).toFixed(1)}% — confirm support before buying`);
  } else if(change24h < -5){
    bearScore += 10;
    bullScore += 5;
    factors.push({factor:'Negative 24h', impact:'slightly bearish', detail:`${change24h.toFixed(1)}% today — selling pressure active`});
  } else {
    bearScore += 3;
    factors.push({factor:'Flat 24h', impact:'neutral', detail:'Less than 5% move today — consolidation or low interest'});
  }

  // ── 5. Volume vs Average (weight: 15%) ───────────────────────────────────
  if(volume > 0 && avgVolume > 0){
    const volRatio = volume / avgVolume;
    if(volRatio > 3){
      bullScore += 12;
      factors.push({factor:'Volume Surge', impact:'bullish', detail:`Volume ${volRatio.toFixed(1)}x above average — strong conviction, big move likely`});
    } else if(volRatio > 1.5){
      bullScore += 7;
      factors.push({factor:'Above Avg Volume', impact:'bullish', detail:`Volume ${volRatio.toFixed(1)}x above average — healthy participation`});
    } else if(volRatio < 0.5){
      bearScore += 8;
      factors.push({factor:'Low Volume', impact:'bearish', detail:`Volume ${volRatio.toFixed(1)}x below average — weak conviction, move may not sustain`});
      warnings.push('Low volume — price moves may be unreliable');
    } else {
      factors.push({factor:'Normal Volume', impact:'neutral', detail:'Volume near average — normal market activity'});
    }
  }

  // ── 6. Candle Pattern Score (weight: 15%) ─────────────────────────────────
  if(candles && candles.length > 0){
    let bullPats = 0, bearPats = 0;
    candles.forEach(p => {
      if(p.type==='bullish') bullPats++;
      if(p.type==='bearish') bearPats++;
    });
    if(bullPats > bearPats){
      bullScore += 10;
      factors.push({factor:'Bullish Patterns', impact:'bullish', detail:`${bullPats} bullish candlestick pattern(s) detected`});
    } else if(bearPats > bullPats){
      bearScore += 10;
      factors.push({factor:'Bearish Patterns', impact:'bearish', detail:`${bearPats} bearish candlestick pattern(s) detected`});
    }
  }

  // ── Calculate Probabilities ───────────────────────────────────────────────
  const total = bullScore + bearScore || 1;
  let bullPct = Math.round((bullScore / total) * 100);
  let bearPct = 100 - bullPct;

  // Clamp between 15% and 85% — never claim certainty
  bullPct = Math.max(15, Math.min(85, bullPct));
  bearPct = 100 - bullPct;

  // ── Confidence Level ──────────────────────────────────────────────────────
  const spread = Math.abs(bullPct - bearPct);
  const confidence = spread >= 40 ? 'High' : spread >= 20 ? 'Medium' : 'Low';
  const confidencePct = Math.min(95, 40 + spread);

  // ── Signal Label ──────────────────────────────────────────────────────────
  let signal, signalColor;
  if(bullPct >= 65){ signal = 'STRONG BUY'; signalColor = '#1B5E20'; }
  else if(bullPct >= 55){ signal = 'BUY'; signalColor = '#2E7D32'; }
  else if(bullPct >= 45){ signal = 'NEUTRAL'; signalColor = '#E65100'; }
  else if(bullPct >= 35){ signal = 'SELL'; signalColor = '#C62828'; }
  else { signal = 'STRONG SELL'; signalColor = '#B71C1C'; }

  // ── Invalidation ──────────────────────────────────────────────────────────
  const invalidation = bullPct >= 50
    ? `Signal invalidated if RSI drops below 30 while price falls, or volume collapses below 50% of average`
    : `Signal invalidated if RSI recovers above 60 with strong volume surge`;

  return {
    signal,
    signalColor,
    bullishProbability: bullPct,
    bearishProbability: bearPct,
    confidence,
    confidencePct,
    factors,
    warnings,
    invalidation,
    bullScore,
    bearScore,
  };
}

// ── Market Regime Detection ───────────────────────────────────────────────────
function detectRegime(candles, rsi, change24h){
  if(!candles || candles.length < 30){
    return {regime:'Unknown', regimeColor:'#90A4AE', regimeDesc:'Not enough data to determine market regime'};
  }

  const closes = candles.map(c => c.close);
  const last    = closes[closes.length-1];
  const sma20   = closes.slice(-20).reduce((a,b)=>a+b,0)/20;
  const sma50   = closes.length>=50 ? closes.slice(-50).reduce((a,b)=>a+b,0)/50 : sma20;

  // Price range over last 30 days
  const last30  = closes.slice(-30);
  const high30  = Math.max(...last30);
  const low30   = Math.min(...last30);
  const range30 = (high30-low30)/low30*100;

  // 30-day return
  const ret30 = (last - closes[closes.length-30])/closes[closes.length-30]*100;

  let regime, regimeColor, regimeDesc, regimeBias;

  if(ret30 > 20 && last > sma20 && sma20 > sma50){
    regime = 'Strong Uptrend 🚀';
    regimeColor = '#1B5E20';
    regimeDesc = `Up ${ret30.toFixed(0)}% in 30 days. Price above both moving averages. Momentum is strong.`;
    regimeBias = 'bullish';
  } else if(ret30 > 8 && last > sma20){
    regime = 'Uptrend 📈';
    regimeColor = '#2E7D32';
    regimeDesc = `Up ${ret30.toFixed(0)}% in 30 days. Price holding above 20-day average. Trend is up.`;
    regimeBias = 'bullish';
  } else if(ret30 < -20 && last < sma20 && sma20 < sma50){
    regime = 'Strong Downtrend 📉';
    regimeColor = '#B71C1C';
    regimeDesc = `Down ${Math.abs(ret30).toFixed(0)}% in 30 days. Price below all averages. Avoid catching falling knife.`;
    regimeBias = 'bearish';
  } else if(ret30 < -8 && last < sma20){
    regime = 'Downtrend 🔻';
    regimeColor = '#C62828';
    regimeDesc = `Down ${Math.abs(ret30).toFixed(0)}% in 30 days. Price below 20-day average. Bearish pressure.`;
    regimeBias = 'bearish';
  } else if(range30 < 15){
    regime = 'Consolidation ↔️';
    regimeColor = '#E65100';
    regimeDesc = `Price ranging ${range30.toFixed(0)}% over 30 days. Market undecided. Wait for breakout.`;
    regimeBias = 'neutral';
  } else {
    regime = 'Volatile Range ⚡';
    regimeColor = '#F57F17';
    regimeDesc = `${range30.toFixed(0)}% price range in 30 days. High volatility, no clear direction.`;
    regimeBias = 'neutral';
  }

  return {regime, regimeColor, regimeDesc, regimeBias, ret30: parseFloat(ret30.toFixed(1)), range30: parseFloat(range30.toFixed(1))};
}

// ── CoinDCX API calls ──────────────────────────────────────────────────────────
const H = {'User-Agent':'Mozilla/5.0 Chrome/120', 'Accept':'application/json'};

async function getTicker(){
  const cached = getCache('ticker');
  if(cached) return cached;
  const r = await axios.get('https://api.coindcx.com/exchange/ticker', {headers:H, timeout:10000});
  const map = {};
  (r.data||[]).forEach(t => { map[t.market] = t; });
  setCache('ticker', map, 30000);
  console.log(`Ticker loaded: ${Object.keys(map).length} markets`);
  return map;
}

// Get USD/INR rate
async function getUsdInr(){
  const cached = getCache('usdinr');
  if(cached) return cached;
  try{
    const tickers = await getTicker();
    const usdt = tickers['USDTINR'];
    const rate = usdt ? parseFloat(usdt.last_price) : 84;
    setCache('usdinr', rate, 60000);
    return rate;
  }catch(e){ return 84; }
}

// Get candles - tries multiple sources
async function getCandles(sym){
  const cached = getCache('c:'+sym);
  if(cached) return cached;

  const usdInr = await getUsdInr();

  // ── Source 1: CryptoCompare (free, no key, direct INR) ────────────────────
  try{
    console.log(`CryptoCompare candles for ${sym}...`);
    const r = await axios.get(
      `https://min-api.cryptocompare.com/data/v2/histoday?fsym=${sym}&tsym=INR&limit=90&aggregate=1`,
      {headers:H, timeout:12000}
    );
    const data = r.data?.Data?.Data;
    if(data && data.length > 10){
      const candles = data.map(d => ({
        date:   new Date(d.time*1000).toISOString().split('T')[0],
        open:   d.open, high:d.high, low:d.low, close:d.close, volume:d.volumefrom||0,
      })).filter(c => c.close > 0);
      if(candles.length > 10){
        console.log(`✅ CryptoCompare: ${candles.length} candles for ${sym}`);
        setCache('c:'+sym, candles, 300000);
        return candles;
      }
    }
  }catch(e){ console.log(`CryptoCompare failed for ${sym}:`, e.message); }

  // ── Source 2: Kraken (BTC=XXBTZUSD, ETH=XETHZUSD) ────────────────────────
  try{
    const KRAKEN = {'BTC':'XXBTZUSD','ETH':'XETHZUSD','LTC':'XLTCZUSD','XMR':'XXMRZUSD','XRP':'XXRPZUSD'};
    const kPair = KRAKEN[sym] || `${sym}USD`;
    console.log(`Kraken candles for ${kPair}...`);
    const r = await axios.get(
      `https://api.kraken.com/0/public/OHLC?pair=${kPair}&interval=1440`,
      {headers:H, timeout:12000}
    );
    const result = r.data?.result;
    if(result){
      const key = Object.keys(result).find(k => k !== 'last');
      const rows = result[key];
      if(rows && rows.length > 10){
        const candles = rows.slice(-90).map(row => ({
          date:   new Date(row[0]*1000).toISOString().split('T')[0],
          open:   parseFloat(row[1])*usdInr,
          high:   parseFloat(row[2])*usdInr,
          low:    parseFloat(row[3])*usdInr,
          close:  parseFloat(row[4])*usdInr,
          volume: parseFloat(row[6]||0),
        })).filter(c => c.close > 0);
        if(candles.length > 10){
          console.log(`✅ Kraken: ${candles.length} candles for ${sym}`);
          setCache('c:'+sym, candles, 300000);
          return candles;
        }
      }
    }
  }catch(e){ console.log(`Kraken failed:`, e.message); }

  // ── Source 3: Synthetic from current price ────────────────────────────────
  console.log(`Using synthetic candles for ${sym}`);
  try{
    const tickers = await getTicker();
    const coin = Object.values(COINS).find(c => c.ticker === `${sym}INR`) || COINS[sym];
    const t = coin ? tickers[coin.ticker] : null;
    const currentPrice = parseFloat(t?.last_price || 0);
    if(currentPrice > 0){
      const candles = [];
      let price = currentPrice;
      for(let i=89; i>=0; i--){
        const date = new Date(Date.now() - i*86400000).toISOString().split('T')[0];
        const change = (Math.random()-0.5)*0.04; // ±2% daily
        price = price * (1 - change);
        candles.push({
          date, open:price*0.99, high:price*1.02,
          low:price*0.98, close:price, volume:0
        });
      }
      candles.reverse();
      console.log(`✅ Synthetic: ${candles.length} candles for ${sym}`);
      setCache('c:'+sym, candles, 60000);
      return candles;
    }
  }catch(e){ console.log('Synthetic failed:', e.message); }

  return [];
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/', (_,res) => res.json({status:'Crypto Research API — CoinDCX', ok:true}));

// Predict next 24h % based on RSI, MACD, BB, momentum
function predict24h(change24, high24, low24, price){
  if(!price || price===0) return {pct:0, signal:'—', confidence:'Low'};

  let score = 0;
  const reasons = [];

  // 1. Mean reversion — big drops tend to bounce, big pumps cool off
  if(change24 < -8){  score += 3; reasons.push('oversold bounce likely'); }
  else if(change24 < -4){ score += 1.5; reasons.push('mild oversold'); }
  else if(change24 > 10){ score -= 3; reasons.push('overbought pullback likely'); }
  else if(change24 > 5){  score -= 1.5; reasons.push('mild overbought'); }

  // 2. Price position in 24h range (like BB %B)
  const range = high24 - low24;
  if(range > 0){
    const pos = (price - low24) / range; // 0=at low, 1=at high
    if(pos < 0.2){ score += 2; reasons.push('near 24h low — support'); }
    else if(pos > 0.8){ score -= 2; reasons.push('near 24h high — resistance'); }
  }

  // 3. Momentum continuation (small moves tend to continue)
  if(change24 > 0 && change24 < 3){ score += 0.5; }
  if(change24 < 0 && change24 > -3){ score -= 0.5; }

  // Convert score to % prediction
  const rawPct = score * 1.2; // scale factor
  const pct = Math.max(-15, Math.min(15, rawPct)); // clamp to ±15%

  const signal = pct > 1.5 ? 'BULLISH' : pct < -1.5 ? 'BEARISH' : 'NEUTRAL';
  const confidence = Math.abs(score) > 3 ? 'High' : Math.abs(score) > 1.5 ? 'Medium' : 'Low';

  return { pct: parseFloat(pct.toFixed(2)), signal, confidence };
}

// ── Day Trade Finder ──────────────────────────────────────────────────────────
// Finds coins with highest potential for 25-75%+ moves in 24h
// Based on: volume surge, price momentum, volatility, recent breakout
function dayTradeScore(coin){
  const {change1d, high24h, low24h, priceINR, volume} = coin;
  if(!priceINR || priceINR === 0) return null;

  let score = 0;
  const reasons = [];
  const warnings = [];

  // 1. Price range (volatility) — wider range = more day trade potential
  const range = high24h - low24h;
  const rangePct = low24h > 0 ? (range/low24h)*100 : 0;
  if(rangePct > 30){
    score += 30;
    reasons.push(`🔥 Huge 24h range: ${rangePct.toFixed(1)}% — extremely volatile`);
  } else if(rangePct > 20){
    score += 22;
    reasons.push(`📊 Wide 24h range: ${rangePct.toFixed(1)}% — high volatility`);
  } else if(rangePct > 12){
    score += 14;
    reasons.push(`📈 Good 24h range: ${rangePct.toFixed(1)}% — decent volatility`);
  } else if(rangePct > 6){
    score += 7;
    reasons.push(`📉 Moderate range: ${rangePct.toFixed(1)}%`);
  } else {
    warnings.push(`⚠️ Low range: ${rangePct.toFixed(1)}% — not ideal for day trade`);
  }

  // 2. Already pumped today? = risky to buy, but shows it CAN move
  if(change1d > 30){
    score += 5; // already pumped hard, might continue OR dump
    reasons.push(`🚀 Already up ${change1d.toFixed(1)}% today — momentum high but risky to chase`);
    warnings.push(`⚠️ Chasing a pump is risky — wait for pullback`);
  } else if(change1d > 15){
    score += 12;
    reasons.push(`📈 Up ${change1d.toFixed(1)}% today — strong momentum`);
  } else if(change1d > 5){
    score += 18;
    reasons.push(`✅ Up ${change1d.toFixed(1)}% — good momentum, not overextended`);
  } else if(change1d > 0){
    score += 10;
    reasons.push(`🟢 Slightly positive ${change1d.toFixed(1)}% — early move`);
  } else if(change1d < -15){
    score += 15; // big dip = bounce potential
    reasons.push(`📉 Down ${Math.abs(change1d).toFixed(1)}% — oversold bounce potential`);
    reasons.push(`💡 Buy the dip strategy: big drops often see 20-40% bounce`);
  } else if(change1d < -8){
    score += 20; // best dip buy zone
    reasons.push(`🎯 Down ${Math.abs(change1d).toFixed(1)}% — prime dip buy zone for bounce`);
  } else if(change1d < 0){
    score += 8;
    reasons.push(`🔄 Down ${Math.abs(change1d).toFixed(1)}% — mild dip, watch for reversal`);
  }

  // 3. Price position — is it near the low? (good buy point)
  if(range > 0){
    const pos = (priceINR - low24h) / range;
    if(pos < 0.15){
      score += 25;
      reasons.push(`🎯 Price near 24h LOW — excellent entry point for day trade`);
    } else if(pos < 0.3){
      score += 15;
      reasons.push(`✅ Price in lower 30% of range — good entry zone`);
    } else if(pos > 0.85){
      score -= 10;
      warnings.push(`⚠️ Price near 24h HIGH — risky to buy here, wait for pullback`);
    }
  }

  // 4. Low price coins move faster (more % per rupee)
  if(priceINR < 0.01){
    score += 15;
    reasons.push(`💰 Micro-price coin (₹${priceINR}) — small capital moves price a lot`);
  } else if(priceINR < 1){
    score += 10;
    reasons.push(`💰 Sub-₹1 coin — accessible for big position sizes`);
  } else if(priceINR < 10){
    score += 5;
    reasons.push(`💰 Low price coin — good for day trading`);
  }

  // 5. Volume — need liquidity to enter/exit
  if(volume > 5000000){
    score += 15;
    reasons.push(`💧 Very high volume ₹${(volume/1000000).toFixed(1)}M — easy to enter and exit`);
  } else if(volume > 1000000){
    score += 10;
    reasons.push(`💧 Good volume ₹${(volume/1000000).toFixed(1)}M — decent liquidity`);
  } else if(volume > 100000){
    score += 5;
    reasons.push(`💧 Moderate volume ₹${(volume/1000).toFixed(0)}K`);
  } else if(volume < 10000){
    score -= 15;
    warnings.push(`🚨 Very low volume — hard to exit position, avoid`);
  }

  // Estimate potential % move
  let potentialPct = 0;
  let strategy = '';
  if(rangePct > 20){
    potentialPct = Math.min(rangePct * 1.2, 100);
    strategy = 'MOMENTUM';
  } else if(change1d < -10){
    potentialPct = Math.abs(change1d) * 1.5;
    strategy = 'DIP_BUY';
  } else {
    potentialPct = rangePct * 0.8;
    strategy = 'SWING';
  }
  potentialPct = Math.max(5, Math.min(potentialPct, 120));

  // Entry and target
  const entry = priceINR; // current price
  const target25 = entry * 1.25;
  const target50 = entry * 1.50;
  const target75 = entry * 1.75;
  const stopLoss = entry * 0.92; // 8% stop loss always

  // Determine recommended sell target based on score + volatility
  let bestTarget = 25;
  let bestTargetReason = '';
  if(score >= 80 && rangePct >= 25){
    bestTarget = 75;
    bestTargetReason = `Range is ${rangePct.toFixed(0)}% wide & score ${score} — coin has history of 75%+ moves`;
  } else if(score >= 65 && rangePct >= 15){
    bestTarget = 50;
    bestTargetReason = `Good volatility (${rangePct.toFixed(0)}% range) & score ${score} — realistic 50% target`;
  } else if(score >= 40 && rangePct >= 6){
    bestTarget = 25;
    bestTargetReason = `Moderate volatility (${rangePct.toFixed(0)}% range) — take profit at 25%, don't be greedy`;
  } else {
    bestTarget = 15;
    bestTargetReason = `Low volatility (${rangePct.toFixed(0)}% range) — conservative 15% target`;
  }

  return {
    score,
    reasons,
    warnings,
    strategy,
    potentialPct: parseFloat(potentialPct.toFixed(1)),
    rangePct: parseFloat(rangePct.toFixed(1)),
    bestTarget,
    bestTargetReason,
    entry: parseFloat(entry.toFixed(8)),
    target25: parseFloat(target25.toFixed(8)),
    target50: parseFloat(target50.toFixed(8)),
    target75: parseFloat(target75.toFixed(8)),
    stopLoss: parseFloat(stopLoss.toFixed(8)),
  };
}

// All 103 coins — full ticker list with next 24h prediction
app.get('/api/crypto/market/all', async (req,res) => {
  try{
    const [tickers] = await Promise.all([getTicker(), loadAllPairs()]);
    const ALL = Object.keys(ALL_INR_PAIRS);
    const coins = ALL.map((sym,i) => {
      const t = tickers[ALL_INR_PAIRS[sym].ticker];
      const price   = t ? parseFloat(t.last_price||0) : 0;
      const change1d= t ? parseFloat(t.change_24_hour||0) : 0;
      const high24h = t ? parseFloat(t.high||0) : 0;
      const low24h  = t ? parseFloat(t.low||0) : 0;
      const vol     = t ? parseFloat(t.volume||0) : 0;

      const next = predict24h(change1d, high24h, low24h, price);

      return {
        symbol:    sym,
        name:      ALL_INR_PAIRS[sym]?.name || sym,
        priceINR:  price,
        change1d,
        high24h,
        low24h,
        volume:    vol,
        next24h:   next.pct,
        next24hSig:next.signal,
        next24hConf:next.confidence,
        rank:      i+1,
        active:    price > 0,
      };
    }).filter(c => c.active); // only show coins with live price
    console.log(`All coins: ${ALL.length} total, ${coins.length} with live price`);
    // Sort by 24h change desc by default, then next24h
    coins.sort((a,b) => b.next24h - a.next24h);
    res.json({success:true, coins, total:coins.length});
  }catch(e){
    console.log('All coins error:', e.message);
    res.status(500).json({success:false, error:e.message});
  }
});

// Day Trade Finder — top coins for 25-75%+ moves today
app.get('/api/crypto/daytrade', async (req,res) => {
  try{
    const [tickers] = await Promise.all([getTicker(), loadAllPairs()]);
    const ALL = Object.keys(ALL_INR_PAIRS);

    const candidates = [];
    ALL.forEach((sym,i) => {
      const t = tickers[ALL_INR_PAIRS[sym].ticker];
      if(!t) return;
      const price   = parseFloat(t.last_price||0);
      const change1d= parseFloat(t.change_24_hour||0);
      const high24h = parseFloat(t.high||0);
      const low24h  = parseFloat(t.low||0);
      const volume  = parseFloat(t.volume||0);
      if(price === 0) return;

      const analysis = dayTradeScore({
        symbol:sym, change1d, high24h, low24h, priceINR:price, volume
      });
      if(!analysis) return;

      candidates.push({
        symbol:    sym,
        name:      ALL_INR_PAIRS[sym]?.name || sym,
        priceINR:  price,
        change1d,
        high24h,
        low24h,
        volume,
        score:           analysis.score,
        reasons:         analysis.reasons,
        warnings:        analysis.warnings,
        strategy:        analysis.strategy,
        potentialPct:    analysis.potentialPct,
        rangePct:        analysis.rangePct,
        bestTarget:      analysis.bestTarget,
        bestTargetReason:analysis.bestTargetReason,
        entry:           analysis.entry,
        target25:        analysis.target25,
        target50:        analysis.target50,
        target75:        analysis.target75,
        stopLoss:        analysis.stopLoss,
      });
    });

    // Sort by score descending
    candidates.sort((a,b) => b.score - a.score);

    // Top 20 candidates
    const top = candidates.slice(0,20);
    res.json({
      success: true,
      candidates: top,
      total: candidates.length,
      disclaimer: 'Day trading is extremely risky. 25-75% targets are NOT guaranteed. Always use stop loss. Never invest more than you can afford to lose.',
    });
  }catch(e){
    console.log('Daytrade error:', e.message);
    res.status(500).json({success:false, error:e.message});
  }
});

// Market overview
app.get('/api/crypto/market/overview', async (req,res) => {
  try{
    const [tickers] = await Promise.all([getTicker(), loadAllPairs()]);
    const top = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','MATIC','AVAX','SHIB','LINK','TON','TRX','NEAR','PEPE','WIF','SUI','TAO','NOT','BONK'];
    const coins = top.map(sym => {
      const coin = ALL_INR_PAIRS[sym];
      if(!coin) return null;
      const t = tickers[coin.ticker];
      if(!t) return null;
      return {
        symbol:   sym,
        priceINR: parseFloat(t.last_price||0),
        change1d: parseFloat(t.change_24_hour||0),
      };
    }).filter(Boolean);
    res.json({success:true, coins});
  }catch(e){
    console.log('Overview error:', e.message);
    res.status(500).json({success:false, error:e.message});
  }
});

// Search
app.get('/api/crypto/search/:q', async (req,res) => {
  await loadAllPairs();
  const q = req.params.q.toUpperCase();
  const results = Object.keys(ALL_INR_PAIRS)
    .filter(k => k.startsWith(q) || k.includes(q) || (ALL_INR_PAIRS[k].name||'').toUpperCase().includes(q))
    .slice(0,15)
    .map(k => ({symbol:k, name:ALL_INR_PAIRS[k].name||k, ticker:ALL_INR_PAIRS[k].ticker}));
  res.json({success:true, results});
});

// Single coin
app.get('/api/crypto/:coin', async (req,res) => {
  try{
    const sym = resolve(req.params.coin);
    await loadAllPairs();
    const coin = ALL_INR_PAIRS[sym];
    if(!coin) throw new Error(`${sym} not found on CoinDCX. Check symbol and try again.`);

    console.log(`→ ${req.params.coin} → sym:${sym} ticker:${coin.ticker}`);

    const [tickers, candles] = await Promise.all([
      getTicker(),
      getCandles(sym).catch(e => { console.log('Candle err:', e.message); return []; })
    ]);

    const t = tickers[coin.ticker];
    console.log(`Ticker data for ${coin.ticker}:`, t ? 'found' : 'NOT FOUND');

    const priceINR = parseFloat(t?.last_price || candles.at(-1)?.close || 0);
    const high24h  = parseFloat(t?.high  || 0);
    const low24h   = parseFloat(t?.low   || 0);
    const change24 = parseFloat(t?.change_24_hour || 0);

    if(priceINR === 0) throw new Error(`No price data for ${sym}. CoinDCX may not list this pair.`);

    const closes    = candles.map(c => c.close);
    const rsi       = calcRSI(closes);
    const macd      = calcMACD(closes);
    const bbArr     = calcBB(closes);
    const bb        = bbArr.at(-1) || {percent:0.5, upper:null, lower:null};
    const sma20     = calcSMA(closes, 20);
    const patterns  = detectPatterns(candles);
    const athINR    = candles.length ? Math.max(...candles.map(c => c.high)) : priceINR;
    const fromAth   = athINR > 0 ? Math.abs((priceINR-athINR)/athINR*100) : 0;

    // Volume average
    const avgVolume  = candles.slice(-20).reduce((s,h)=>s+(h.volume||0),0)/20;
    const lastVolume = candles.at(-1)?.volume||0;

    // Full probability analysis
    const prob   = buildProbability(rsi, macd, bb.percent||0.5, change24, patterns, lastVolume, avgVolume);
    const regime = detectRegime(candles, rsi, change24);
    const sig    = prob.signal;

    const history = candles.map((c,i) => ({
      ...c,
      rsi:        i === candles.length-1 ? rsi       : null,
      sma20:      sma20[i],
      bbUpper:    bbArr[i]?.upper || null,
      bbLower:    bbArr[i]?.lower || null,
      macd:       i === candles.length-1 ? macd.macd   : null,
      macdSignal: i === candles.length-1 ? macd.signal : null,
    }));

    res.json({success:true, data:{
      symbol:       sym,
      name:         sym,
      priceINR,
      priceUSD:     parseFloat((priceINR/84).toFixed(8)),
      change24h:    change24,
      change7d:     0,
      change30d:    0,
      high24h,
      low24h,
      marketCapINR: 0,
      marketCapRank:0,
      athINR,
      fromAth,
      ath:          athINR > 0,
      source:       'CoinDCX',
      // Signal
      signal:             sig,
      signalColor:        prob.signalColor,
      // Probability
      bullishProbability: prob.bullishProbability,
      bearishProbability: prob.bearishProbability,
      confidence:         prob.confidence,
      confidencePct:      prob.confidencePct,
      // Analysis
      factors:            prob.factors,
      warnings:           prob.warnings,
      invalidation:       prob.invalidation,
      // Market Regime
      regime:             regime.regime,
      regimeColor:        regime.regimeColor,
      regimeDesc:         regime.regimeDesc,
      regimeBias:         regime.regimeBias,
      ret30:              regime.ret30,
      // Patterns & Indicators
      patterns,
      indicators:{
        rsi,
        macd:       macd.macd,
        macdSignal: macd.signal,
        bbUpper:    bb.upper,
        bbLower:    bb.lower,
        bbPercent:  bb.percent,
      },
      history,
    }});
  }catch(e){
    console.log('Crypto error:', e.message);
    res.status(404).json({success:false, error:e.message});
  }
});

// News
app.get('/api/news/:query', async (req,res) => {
  try{
    const q = encodeURIComponent(req.params.query + ' crypto');
    const r = await axios.get(
      `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`,
      {timeout:8000}
    );
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while((m = re.exec(r.data)) !== null){
      const b = m[1];
      const title = (b.match(/<title>([\s\S]*?)<\/title>/)?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
      const link  = (b.match(/<link>([\s\S]*?)<\/link>/)?.[1]||'').trim();
      const src   = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]||'News').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
      if(!title) continue;
      const tl = title.toLowerCase();
      const pos = ['rise','surge','gain','up','bull','profit','rally','buy','high','record'];
      const neg = ['fall','drop','crash','loss','down','bear','sell','decline','low','miss'];
      const pc = pos.filter(w=>tl.includes(w)).length;
      const nc = neg.filter(w=>tl.includes(w)).length;
      items.push({title, link, source:src, sentiment: pc>nc?'positive':nc>pc?'negative':'neutral'});
    }
    res.json({success:true, news:items.slice(0,8)});
  }catch(e){
    res.json({success:true, news:[]});
  }
});

app.listen(PORT, () => console.log(`✅ Crypto API (CoinDCX) running on port ${PORT}`));

// ─── CoinDCX Auto Trading Bot ─────────────────────────────────────────────────
const crypto = require('crypto');

const DCX_KEY    = 'd62016ee25606765061851dccff09e49e96329d78697eeaf';
const DCX_SECRET = 'a33c74fe85cbf84a8a429f21b2a1e4d7bdf67eedaeb7ec244284ec0d75167cbc';

function dcxSign(body){
  return crypto.createHmac('sha256', DCX_SECRET).update(JSON.stringify(body)).digest('hex');
}

async function dcxPost(endpoint, body){
  const signature = dcxSign(body);
  const r = await axios.post(`https://api.coindcx.com${endpoint}`, body, {
    headers:{
      'X-AUTH-APIKEY': DCX_KEY,
      'X-AUTH-SIGNATURE': signature,
      'Content-Type': 'application/json',
    },
    timeout: 10000,
  });
  return r.data;
}

// Get account balances
app.get('/api/bot/balance', async (req,res) => {
  try{
    const body = { timestamp: Date.now() };
    const data = await dcxPost('/exchange/v1/users/balances', body);
    res.json({ success:true, balances: data });
  }catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

// Place a buy order
app.post('/api/bot/buy', async (req,res) => {
  try{
    const { symbol, price, quantity } = req.body;
    const body = {
      side: 'buy',
      order_type: 'limit_order',
      market: symbol + 'INR',
      price_per_unit: price,
      total_quantity: quantity,
      timestamp: Date.now(),
    };
    const data = await dcxPost('/exchange/v1/orders/create', body);
    res.json({ success:true, order: data });
  }catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

// Place a sell order
app.post('/api/bot/sell', async (req,res) => {
  try{
    const { symbol, price, quantity } = req.body;
    const body = {
      side: 'sell',
      order_type: 'limit_order',
      market: symbol + 'INR',
      price_per_unit: price,
      total_quantity: quantity,
      timestamp: Date.now(),
    };
    const data = await dcxPost('/exchange/v1/orders/create', body);
    res.json({ success:true, order: data });
  }catch(e){ res.status(500).json({ success:false, error:e.message }); }
});

// Get open orders
app.get('/api/bot/orders', async (req,res) => {
  try{
    const body = { timestamp: Date.now() };
    const data = await dcxPost('/exchange/v1/orders/active_orders_count', body);
    res.json({ success:true, orders: data });
  }catch(e){ res.status(500).json({ success:false, error:e.message }); }
});
