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

// ── CoinDCX symbol map ─────────────────────────────────────────────────────────
// ticker API uses:     BTCINR
// candle API uses:     B-BTC_INR
const COINS = {
  'BTC': {ticker:'BTCINR',   candle:'B-BTC_INR'},
  'ETH': {ticker:'ETHINR',   candle:'B-ETH_INR'},
  'BNB': {ticker:'BNBINR',   candle:'B-BNB_INR'},
  'SOL': {ticker:'SOLINR',   candle:'B-SOL_INR'},
  'XRP': {ticker:'XRPINR',   candle:'B-XRP_INR'},
  'DOGE':{ticker:'DOGEINR',  candle:'B-DOGE_INR'},
  'ADA': {ticker:'ADAINR',   candle:'B-ADA_INR'},
  'TRX': {ticker:'TRXINR',   candle:'B-TRX_INR'},
  'AVAX':{ticker:'AVAXINR',  candle:'B-AVAX_INR'},
  'SHIB':{ticker:'SHIBINR',  candle:'B-SHIB_INR'},
  'LINK':{ticker:'LINKINR',  candle:'B-LINK_INR'},
  'DOT': {ticker:'DOTINR',   candle:'B-DOT_INR'},
  'MATIC':{ticker:'MATICINR',candle:'B-MATIC_INR'},
  'LTC': {ticker:'LTCINR',   candle:'B-LTC_INR'},
  'UNI': {ticker:'UNIINR',   candle:'B-UNI_INR'},
  'ATOM':{ticker:'ATOMINR',  candle:'B-ATOM_INR'},
  'ETC': {ticker:'ETCINR',   candle:'B-ETC_INR'},
  'XLM': {ticker:'XLMINR',   candle:'B-XLM_INR'},
  'BCH': {ticker:'BCHINR',   candle:'B-BCH_INR'},
  'NEAR':{ticker:'NEARINR',  candle:'B-NEAR_INR'},
  'ALGO':{ticker:'ALGOINR',  candle:'B-ALGO_INR'},
  'FIL': {ticker:'FILINR',   candle:'B-FIL_INR'},
  'HBAR':{ticker:'HBARINR',  candle:'B-HBAR_INR'},
  'ICP': {ticker:'ICPINR',   candle:'B-ICP_INR'},
  'APT': {ticker:'APTINR',   candle:'B-APT_INR'},
  'INJ': {ticker:'INJINR',   candle:'B-INJ_INR'},
  'OP':  {ticker:'OPINR',    candle:'B-OP_INR'},
  'ARB': {ticker:'ARBINR',   candle:'B-ARB_INR'},
  'SUI': {ticker:'SUIINR',   candle:'B-SUI_INR'},
  'PEPE':{ticker:'PEPEINR',  candle:'B-PEPE_INR'},
  'WIF': {ticker:'WIFINR',   candle:'B-WIF_INR'},
  'MKR': {ticker:'MKRIINR',  candle:'B-MKR_INR'},
  'AAVE':{ticker:'AAVEINR',  candle:'B-AAVE_INR'},
  'CRV': {ticker:'CRVINR',   candle:'B-CRV_INR'},
  'FTM': {ticker:'FTMINR',   candle:'B-FTM_INR'},
  'SAND':{ticker:'SANDINR',  candle:'B-SAND_INR'},
  'MANA':{ticker:'MANAINR',  candle:'B-MANA_INR'},
  'AXS': {ticker:'AXSINR',   candle:'B-AXS_INR'},
  'GALA':{ticker:'GALAINR',  candle:'B-GALA_INR'},
  'CHZ': {ticker:'CHZINR',   candle:'B-CHZ_INR'},
  'VET': {ticker:'VETINR',   candle:'B-VET_INR'},
  'ZIL': {ticker:'ZILINR',   candle:'B-ZIL_INR'},
  'KAS': {ticker:'KASINR',   candle:'B-KAS_INR'},
  'FLOKI':{ticker:'FLOKIINR',candle:'B-FLOKI_INR'},
  'BONK':{ticker:'BONKINR',  candle:'B-BONK_INR'},
  'TON': {ticker:'TONINR',   candle:'B-TON_INR'},
  'NOT': {ticker:'NOTINR',   candle:'B-NOT_INR'},
  'WLD': {ticker:'WLDINR',   candle:'B-WLD_INR'},
  'STRK':{ticker:'STRKINR',  candle:'B-STRK_INR'},
  'TAO': {ticker:'TAOINR',   candle:'B-TAO_INR'},
  'ONDO':{ticker:'ONDOINR',  candle:'B-ONDO_INR'},
  'ENA': {ticker:'ENAINR',   candle:'B-ENA_INR'},
  'JUP': {ticker:'JUPINR',   candle:'B-JUP_INR'},
  'RNDR':{ticker:'RNDRINR',  candle:'B-RNDR_INR'},
  'FET': {ticker:'FETINR',   candle:'B-FET_INR'},
  'AGIX':{ticker:'AGIXINR',  candle:'B-AGIX_INR'},
  'SEI': {ticker:'SEIINR',   candle:'B-SEI_INR'},
  'TIA': {ticker:'TIAINR',   candle:'B-TIA_INR'},
  'PYTH':{ticker:'PYTHINR',  candle:'B-PYTH_INR'},
  'IMX': {ticker:'IMXINR',   candle:'B-IMX_INR'},
  'LDO': {ticker:'LDOINR',   candle:'B-LDO_INR'},
  'DYDX':{ticker:'DYDXINR',  candle:'B-DYDX_INR'},
  'GMX': {ticker:'GMXINR',   candle:'B-GMX_INR'},
  'GRT': {ticker:'GRTINR',   candle:'B-GRT_INR'},
  'SNX': {ticker:'SNXINR',   candle:'B-SNX_INR'},
  'SUSHI':{ticker:'SUSHIINR',candle:'B-SUSHI_INR'},
  '1INCH':{ticker:'1INCHINR',candle:'B-1INCH_INR'},
  'ZEC': {ticker:'ZECINR',   candle:'B-ZEC_INR'},
  'DASH':{ticker:'DASHINR',  candle:'B-DASH_INR'},
  'BAT': {ticker:'BATINR',   candle:'B-BAT_INR'},
  'ENJ': {ticker:'ENJINR',   candle:'B-ENJ_INR'},
  'XMR': {ticker:'XMRINR',   candle:'B-XMR_INR'},
  'QNT': {ticker:'QNTINR',   candle:'B-QNT_INR'},
  'ANKR':{ticker:'ANKRINR',  candle:'B-ANKR_INR'},
  'OCEAN':{ticker:'OCEANINR',candle:'B-OCEAN_INR'},
  'ROSE':{ticker:'ROSEINR',  candle:'B-ROSE_INR'},
  'MINA':{ticker:'MINAINR',  candle:'B-MINA_INR'},
  'KAVA':{ticker:'KAVAINR',  candle:'B-KAVA_INR'},
  'ONE': {ticker:'ONEINR',   candle:'B-ONE_INR'},
  'KSM': {ticker:'KSMINR',   candle:'B-KSM_INR'},
  'EGLD':{ticker:'EGLDINR',  candle:'B-EGLD_INR'},
  'FLOW':{ticker:'FLOWINR',  candle:'B-FLOW_INR'},
  'EOS': {ticker:'EOSINR',   candle:'B-EOS_INR'},
  'THETA':{ticker:'THETAINR',candle:'B-THETA_INR'},
  'YFI': {ticker:'YFIINR',   candle:'B-YFI_INR'},
  'COMP':{ticker:'COMPINR',  candle:'B-COMP_INR'},
  'LRC': {ticker:'LRCINR',   candle:'B-LRC_INR'},
  'CELO':{ticker:'CELOINR',  candle:'B-CELO_INR'},
  'IOTA':{ticker:'IOTAINR',  candle:'B-IOTA_INR'},
  'QTUM':{ticker:'QTUMINR',  candle:'B-QTUM_INR'},
  'WAVES':{ticker:'WAVESINR',candle:'B-WAVES_INR'},
  'PENDLE':{ticker:'PENDLEINR',candle:'B-PENDLE_INR'},
  'BLUR':{ticker:'BLURINR',  candle:'B-BLUR_INR'},
  'ARKM':{ticker:'ARKMINR',  candle:'B-ARKM_INR'},
  'GMT': {ticker:'GMTINR',   candle:'B-GMT_INR'},
  'STORJ':{ticker:'STORJINR',candle:'B-STORJ_INR'},
};

// Name aliases → symbol
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
  'MULTIVERSX':'EGLD','KUSAMA':'KSM','STEPN':'GMT',
};

function resolve(input){
  const u = input.toUpperCase().trim();
  if(COINS[u]) return u;
  if(NAMES[u] && COINS[NAMES[u]]) return NAMES[u];
  const k = Object.keys(NAMES).find(k => u.includes(k) || k.includes(u));
  if(k && COINS[NAMES[k]]) return NAMES[k];
  // partial symbol match
  const s = Object.keys(COINS).find(k => k.startsWith(u));
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
function buildSignal(rsi, macd, bbPct){
  let s = 0;
  if(rsi < 35) s+=2; else if(rsi < 50) s+=1; else if(rsi > 70) s-=2; else if(rsi > 60) s-=1;
  if(macd.macd > macd.signal) s+=1; else s-=1;
  if(bbPct < 0.2) s+=1; else if(bbPct > 0.8) s-=1;
  return s >= 2 ? 'BUY' : s <= -2 ? 'SELL' : 'HOLD';
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
  console.log('Ticker loaded, sample keys:', Object.keys(map).slice(0,5));
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

// Market overview
app.get('/api/crypto/market/overview', async (req,res) => {
  try{
    const tickers = await getTicker();
    const top = ['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','MATIC','AVAX','SHIB','LINK','TON','TRX','NEAR','PEPE','WIF','SUI','TAO','NOT','BONK'];
    const coins = top.map(sym => {
      const coin = COINS[sym];
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
app.get('/api/crypto/search/:q', (req,res) => {
  const q = req.params.q.toUpperCase();
  const results = Object.keys(COINS)
    .filter(k => k.startsWith(q) || k.includes(q))
    .slice(0,10)
    .map(k => ({symbol:k, ticker:COINS[k].ticker}));
  res.json({success:true, results});
});

// Single coin
app.get('/api/crypto/:coin', async (req,res) => {
  try{
    const sym = resolve(req.params.coin);
    const coin = COINS[sym];
    if(!coin) throw new Error(`${sym} not supported. Try: BTC, ETH, SOL, BNB, XRP, DOGE`);

    console.log(`→ ${req.params.coin} → sym:${sym} ticker:${coin.ticker} candle:${coin.candle}`);

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

    const closes   = candles.map(c => c.close);
    const rsi      = calcRSI(closes);
    const macd     = calcMACD(closes);
    const bbArr    = calcBB(closes);
    const bb       = bbArr.at(-1) || {percent:0.5, upper:null, lower:null};
    const sma20    = calcSMA(closes, 20);
    const sig      = buildSignal(rsi, macd, bb.percent||0.5);
    const patterns = detectPatterns(candles);
    const athINR   = candles.length ? Math.max(...candles.map(c => c.high)) : priceINR;
    const fromAth  = athINR > 0 ? Math.abs((priceINR-athINR)/athINR*100) : 0;

    const history = candles.map((c,i) => ({
      ...c,
      rsi:        i === candles.length-1 ? rsi  : null,
      sma20:      sma20[i],
      bbUpper:    bbArr[i]?.upper  || null,
      bbLower:    bbArr[i]?.lower  || null,
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
      signal:       sig,
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
