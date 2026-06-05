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

// ── CoinDCX INR pairs ──────────────────────────────────────────────────────────
const PAIRS = {
  'BTC':'B-BTC_INR','ETH':'B-ETH_INR','BNB':'B-BNB_INR','SOL':'B-SOL_INR',
  'XRP':'B-XRP_INR','DOGE':'B-DOGE_INR','ADA':'B-ADA_INR','TRX':'B-TRX_INR',
  'AVAX':'B-AVAX_INR','SHIB':'B-SHIB_INR','LINK':'B-LINK_INR','DOT':'B-DOT_INR',
  'MATIC':'B-MATIC_INR','LTC':'B-LTC_INR','UNI':'B-UNI_INR','ATOM':'B-ATOM_INR',
  'ETC':'B-ETC_INR','XLM':'B-XLM_INR','BCH':'B-BCH_INR','NEAR':'B-NEAR_INR',
  'ALGO':'B-ALGO_INR','FIL':'B-FIL_INR','HBAR':'B-HBAR_INR','ICP':'B-ICP_INR',
  'APT':'B-APT_INR','INJ':'B-INJ_INR','OP':'B-OP_INR','ARB':'B-ARB_INR',
  'SUI':'B-SUI_INR','PEPE':'B-PEPE_INR','WIF':'B-WIF_INR','MKR':'B-MKR_INR',
  'AAVE':'B-AAVE_INR','CRV':'B-CRV_INR','FTM':'B-FTM_INR','SAND':'B-SAND_INR',
  'MANA':'B-MANA_INR','AXS':'B-AXS_INR','GALA':'B-GALA_INR','CHZ':'B-CHZ_INR',
  'VET':'B-VET_INR','ZIL':'B-ZIL_INR','KAS':'B-KAS_INR','FLOKI':'B-FLOKI_INR',
  'BONK':'B-BONK_INR','TON':'B-TON_INR','NOT':'B-NOT_INR','WLD':'B-WLD_INR',
  'STRK':'B-STRK_INR','TAO':'B-TAO_INR','ONDO':'B-ONDO_INR','ENA':'B-ENA_INR',
  'JUP':'B-JUP_INR','RNDR':'B-RNDR_INR','FET':'B-FET_INR','AGIX':'B-AGIX_INR',
  'SEI':'B-SEI_INR','TIA':'B-TIA_INR','PYTH':'B-PYTH_INR','IMX':'B-IMX_INR',
  'LDO':'B-LDO_INR','DYDX':'B-DYDX_INR','GMX':'B-GMX_INR','GRT':'B-GRT_INR',
  'SNX':'B-SNX_INR','SUSHI':'B-SUSHI_INR','1INCH':'B-1INCH_INR',
  'ZEC':'B-ZEC_INR','DASH':'B-DASH_INR','BAT':'B-BAT_INR','ENJ':'B-ENJ_INR',
  'XMR':'B-XMR_INR','QNT':'B-QNT_INR','ANKR':'B-ANKR_INR','OCEAN':'B-OCEAN_INR',
  'ROSE':'B-ROSE_INR','MINA':'B-MINA_INR','KAVA':'B-KAVA_INR','ONE':'B-ONE_INR',
  'RVN':'B-RVN_INR','KSM':'B-KSM_INR','GLMR':'B-GLMR_INR','EGLD':'B-EGLD_INR',
  'FLOW':'B-FLOW_INR','EOS':'B-EOS_INR','THETA':'B-THETA_INR',
  'YFI':'B-YFI_INR','COMP':'B-COMP_INR','LRC':'B-LRC_INR','MASK':'B-MASK_INR',
  'CELO':'B-CELO_INR','IOTA':'B-IOTA_INR','QTUM':'B-QTUM_INR','WAVES':'B-WAVES_INR',
  'PNUT':'B-PNUT_INR','PENDLE':'B-PENDLE_INR','BLUR':'B-BLUR_INR',
  'ARKM':'B-ARKM_INR','ZK':'B-ZK_INR','EIGEN':'B-EIGEN_INR','IO':'B-IO_INR',
  'GMT':'B-GMT_INR','WOO':'B-WOO_INR','API3':'B-API3_INR','STORJ':'B-STORJ_INR',
};

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
  'MULTIVERSX':'EGLD','KUSAMA':'KSM','MOONBEAM':'GLMR','STEPN':'GMT',
};

function resolve(input){
  const u=input.toUpperCase().trim();
  if(PAIRS[u]) return {sym:u, pair:PAIRS[u]};
  if(NAMES[u] && PAIRS[NAMES[u]]) return {sym:NAMES[u], pair:PAIRS[NAMES[u]]};
  const k=Object.keys(NAMES).find(k=>u.includes(k)||k.includes(u));
  if(k && PAIRS[NAMES[k]]) return {sym:NAMES[k], pair:PAIRS[NAMES[k]]};
  return {sym:u, pair:`B-${u}_INR`};
}

// ── Indicators ─────────────────────────────────────────────────────────────────
function calcSMA(data,p){
  return data.map((_,i)=>{
    if(i<p-1)return null;
    return data.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p;
  });
}
function calcRSI(c,p=14){
  if(c.length<p+1)return 50;
  let g=0,l=0;
  for(let i=c.length-p;i<c.length;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l+=Math.abs(d);}
  const rs=(g/p)/((l/p)||0.0001);
  return parseFloat((100-100/(1+rs)).toFixed(2));
}
function calcMACD(c){
  const ema=(d,p)=>{const k=2/(p+1);let e=d[0];return d.map(v=>{e=v*k+e*(1-k);return e;});};
  if(c.length<26)return{macd:0,signal:0,histogram:0};
  const ml=ema(c,12).map((v,i)=>v-ema(c,26)[i]);
  const sig=ema(ml,9);
  const l=c.length-1;
  return{macd:parseFloat(ml[l].toFixed(6)),signal:parseFloat(sig[l].toFixed(6)),histogram:parseFloat((ml[l]-sig[l]).toFixed(6))};
}
function calcBB(c,p=20){
  const sma=calcSMA(c,p);
  return c.map((_,i)=>{
    if(i<p-1)return{upper:null,lower:null,middle:null,percent:0.5};
    const sl=c.slice(i-p+1,i+1),mean=sma[i];
    const std=Math.sqrt(sl.reduce((s,v)=>s+(v-mean)**2,0)/p);
    const upper=mean+2*std,lower=mean-2*std;
    return{upper,lower,middle:mean,percent:(c[i]-lower)/(upper-lower||1)};
  });
}
function detectPatterns(hist){
  const p=[];
  if(hist.length<3)return p;
  const[,p1,c]=hist.slice(-3);
  const bC=Math.abs(c.close-c.open),rC=c.high-c.low;
  if(rC>0&&bC<rC*0.1) p.push({name:'Doji',type:'neutral',description:'Indecision — market looking for direction.'});
  if(c.close>c.open&&p1.close<p1.open&&c.open<p1.close&&c.close>p1.open) p.push({name:'Bullish Engulfing',type:'bullish',description:'Strong bullish reversal.'});
  if(c.close<c.open&&p1.close>p1.open&&c.open>p1.close&&c.close<p1.open) p.push({name:'Bearish Engulfing',type:'bearish',description:'Strong bearish reversal.'});
  if(bC<rC*0.3&&c.low<Math.min(c.open,c.close)-rC*0.3&&c.close>c.open) p.push({name:'Hammer',type:'bullish',description:'Potential bottom reversal.'});
  return p;
}
function buildSignal(rsi,macd,bbPct){
  let s=0;
  if(rsi<35)s+=2;else if(rsi<50)s+=1;else if(rsi>70)s-=2;else if(rsi>60)s-=1;
  if(macd.macd>macd.signal)s+=1;else s-=1;
  if(bbPct<0.2)s+=1;else if(bbPct>0.8)s-=1;
  return s>=2?'BUY':s<=-2?'SELL':'HOLD';
}

// ── CoinDCX API ────────────────────────────────────────────────────────────────
const H={'User-Agent':'Mozilla/5.0 Chrome/120','Accept':'application/json'};

async function getTicker(){
  const c=getCache('ticker');
  if(c)return c;
  const r=await axios.get('https://api.coindcx.com/exchange/ticker',{headers:H,timeout:10000});
  const map={};
  (r.data||[]).forEach(t=>{map[t.market]=t;});
  setCache('ticker',map,30000);
  return map;
}

async function getCandles(pair){
  const c=getCache('c:'+pair);
  if(c)return c;
  const r=await axios.get(
    `https://public.coindcx.com/market_data/candlesticks?pair=${pair}&interval=1d&limit=90`,
    {headers:H,timeout:10000}
  );
  const candles=(r.data||[]).map(c=>({
    date:new Date(c[0]).toISOString().split('T')[0],
    open:parseFloat(c[1]),high:parseFloat(c[2]),
    low:parseFloat(c[3]),close:parseFloat(c[4]),
    volume:parseFloat(c[5]||0),
  })).filter(c=>c.close>0);
  setCache('c:'+pair,candles,300000);
  return candles;
}

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get('/', (_,res) => res.json({status:'Crypto Research API — CoinDCX',ok:true}));

app.get('/api/crypto/market/overview', async (req,res) => {
  try{
    const tickers=await getTicker();
    const top=['BTC','ETH','BNB','SOL','XRP','DOGE','ADA','MATIC','AVAX','SHIB','LINK','TON','TRX','NEAR','PEPE','WIF','SUI','TAO','NOT','BONK'];
    const coins=top.map(sym=>{
      const pair=PAIRS[sym];
      if(!pair)return null;
      const t=tickers[pair];
      if(!t)return null;
      return{symbol:sym,priceINR:parseFloat(t.last_price||0),change1d:parseFloat(t.change_24_hour||0)};
    }).filter(Boolean);
    res.json({success:true,coins});
  }catch(e){
    console.log('Overview error:',e.message);
    res.status(500).json({success:false,error:e.message});
  }
});

app.get('/api/crypto/search/:q', (req,res) => {
  const q=req.params.q.toUpperCase();
  const results=Object.keys(PAIRS)
    .filter(k=>k.startsWith(q)||k.includes(q))
    .slice(0,10)
    .map(k=>({symbol:k,pair:PAIRS[k]}));
  res.json({success:true,results});
});

app.get('/api/crypto/:coin', async (req,res) => {
  try{
    const{sym,pair}=resolve(req.params.coin);
    console.log(`Crypto: "${req.params.coin}" → ${sym} → ${pair}`);

    const[tickers,candles]=await Promise.all([
      getTicker(),
      getCandles(pair).catch(e=>{console.log('Candle err:',e.message);return[];})
    ]);

    const t=tickers[pair];
    if(!t && candles.length===0){
      throw new Error(`${sym} not found on CoinDCX. Available: BTC, ETH, SOL, BNB, XRP, DOGE, ADA...`);
    }

    const priceINR = parseFloat(t?.last_price || candles.at(-1)?.close || 0);
    const high24h  = parseFloat(t?.high || 0);
    const low24h   = parseFloat(t?.low || 0);
    const change24 = parseFloat(t?.change_24_hour || 0);

    const closes = candles.map(c=>c.close);
    const rsi    = calcRSI(closes);
    const macd   = calcMACD(closes);
    const bbArr  = calcBB(closes);
    const bb     = bbArr.at(-1) || {percent:0.5,upper:null,lower:null};
    const sma20  = calcSMA(closes,20);
    const sig    = buildSignal(rsi,macd,bb.percent||0.5);
    const patterns = detectPatterns(candles);

    const athINR  = candles.length ? Math.max(...candles.map(c=>c.high)) : priceINR;
    const fromAth = athINR>0 ? Math.abs((priceINR-athINR)/athINR*100) : 0;

    const history = candles.map((c,i)=>({
      ...c,
      rsi:        i===candles.length-1 ? rsi : null,
      sma20:      sma20[i],
      bbUpper:    bbArr[i]?.upper || null,
      bbLower:    bbArr[i]?.lower || null,
      macd:       i===candles.length-1 ? macd.macd : null,
      macdSignal: i===candles.length-1 ? macd.signal : null,
    }));

    res.json({success:true, data:{
      symbol:sym, name:sym,
      priceINR,
      priceUSD: parseFloat((priceINR/84).toFixed(8)),
      change24h:change24, change7d:0, change30d:0,
      high24h, low24h,
      marketCapINR:0, marketCapRank:0,
      athINR, fromAth, ath:athINR>0,
      source:'CoinDCX',
      signal:sig, patterns,
      indicators:{
        rsi, macd:macd.macd, macdSignal:macd.signal,
        bbUpper:bb.upper, bbLower:bb.lower, bbPercent:bb.percent,
      },
      history,
    }});
  }catch(e){
    console.log('Crypto error:',e.message);
    res.status(404).json({success:false, error:e.message});
  }
});

app.get('/api/news/:query', async (req,res) => {
  try{
    const q=encodeURIComponent(req.params.query+' crypto');
    const r=await axios.get(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`,{timeout:8000});
    const items=[];
    const re=/<item>([\s\S]*?)<\/item>/g;
    let m;
    while((m=re.exec(r.data))!==null){
      const b=m[1];
      const title=(b.match(/<title>([\s\S]*?)<\/title>/)?.[1]||'').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
      const link=(b.match(/<link>([\s\S]*?)<\/link>/)?.[1]||'').trim();
      const src=(b.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]||'News').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
      if(!title)continue;
      const tl=title.toLowerCase();
      const pos=['rise','surge','gain','up','bull','profit','rally','buy','high','record','beat'];
      const neg=['fall','drop','crash','loss','down','bear','sell','decline','low','miss','concern'];
      const pc=pos.filter(w=>tl.includes(w)).length;
      const nc=neg.filter(w=>tl.includes(w)).length;
      items.push({title,link,source:src,sentiment:pc>nc?'positive':nc>pc?'negative':'neutral'});
    }
    res.json({success:true, news:items.slice(0,8)});
  }catch(e){
    res.json({success:true, news:[]});
  }
});

app.listen(PORT, () => console.log(`✅ Crypto API (CoinDCX) running on port ${PORT}`));
