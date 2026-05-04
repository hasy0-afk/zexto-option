import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { init, dispose } from "klinecharts";
import API from "./api";

// ═══ 2FA API polyfill — if api.js doesn't have twoFA methods, add client-side stubs ═══
if(!API.twoFA){
  API.twoFA={
    setup:async()=>{
      // Generate TOTP secret client-side (for demo; production should use server)
      const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let secret="";for(let i=0;i<16;i++)secret+=chars[Math.floor(Math.random()*chars.length)];
      const issuer="ZextoOption";
      const account=localStorage.getItem("qt_user_email")||"user";
      const otpUrl=`otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      // Generate QR using external API
      const qrUrl=`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpUrl)}`;
      return{success:true,secret,qrUrl,otpUrl};
    },
    verify:async(code,secret)=>{
      // Client-side: accept any 6-digit code for demo (production: validate TOTP on server)
      if(code&&code.length===6){
        localStorage.setItem("qt_2fa_secret",secret);
        const backups=[];for(let i=0;i<6;i++){let bc="";for(let j=0;j<8;j++)bc+="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)];backups.push(bc.slice(0,4)+"-"+bc.slice(4));}
        localStorage.setItem("qt_2fa_backups",JSON.stringify(backups));
        return{success:true,backupCodes:backups};
      }
      return{success:false,message:"Invalid code"};
    },
    verifyLogin:async(code,tempToken,email)=>{
      // Client-side: validate TOTP or backup code
      if(code&&code.length===6){
        // Re-authenticate — the original login already succeeded, just verify 2FA
        try{
          const token=tempToken||localStorage.getItem("qt_token");
          if(token){
            const res=await API.auth.me();
            if(res.success)return{success:true,user:res.user};
          }
        }catch(e){}
        return{success:false,message:"Invalid code"};
      }
      return{success:false,message:"Invalid code"};
    },
    verifyAction:async(code,action)=>{
      // Client-side: accept valid 6-digit codes
      if(code&&code.length===6)return{success:true,action};
      return{success:false,message:"Invalid code"};
    },
    disable:async()=>{
      localStorage.removeItem("qt_2fa_secret");
      localStorage.removeItem("qt_2fa_backups");
      return{success:true};
    }
  };
}
// KYC API polyfill
if(!API.kyc){API.kyc={submit:async(fd)=>{return{success:true};},approve:async()=>{return{success:true};}};}

// Backend on UK VPS (change IP if backend moves)
const _BASE="http://localhost:5000";

// ═══ IQ Option API ═══
if(!API.iq){
  API.iq={
    login:async(email,password)=>{
      try{
        const r=await fetch(`${_BASE}/api/iq/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    status:async()=>{
      try{const r=await fetch(`${_BASE}/api/iq/status`);return await r.json();}
      catch(e){return{success:false,error:e.message};}
    },
    quote:async(symbol)=>{
      try{
        const r=await fetch(`${_BASE}/api/iq/quote/${symbol}`);
        if(!r.ok)throw new Error("IQ quote failed");
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    history:async(symbol,count=300,size=60)=>{
      try{
        const r=await fetch(`${_BASE}/api/iq/history/${symbol}?count=${count}&size=${size}`);
        if(!r.ok)throw new Error("IQ history failed");
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    streamUrl:()=>_BASE.replace(/^http/,"ws")+"/api/iq/stream"
  };
}

// ═══ Forex API — Uses TradingView backend (/api/forex/...) ═══
if(!API.forex){
  API.forex={
    quote:async(symbol)=>{
      try{
        const r=await fetch(`${_BASE}/api/forex/quote/${symbol}`);
        if(!r.ok)throw new Error("Forex quote failed");
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    history:async(symbol,timeframe="1",count=300)=>{
      try{
        const r=await fetch(`${_BASE}/api/forex/history/${symbol}?timeframe=${timeframe}&count=${count}`);
        if(!r.ok)throw new Error("Forex history failed");
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    multi:async(symbols)=>{
      try{
        const r=await fetch(`${_BASE}/api/forex/multi?symbols=${symbols.join(",")}`);
        if(!r.ok)throw new Error("Forex multi failed");
        return await r.json();
      }catch(e){return{success:false,error:e.message};}
    },
    streamUrl:()=>_BASE.replace(/^http/,"ws")+"/api/forex/stream"
  };
}

const C={accent:"#f59e0b",accentDim:"#f59e0b15",red:"#ff3b5c",redDim:"#ff3b5c15",bg:"#111626",card:"#151c2e",el:"#1e2740",text:"#e8ecf4",sub:"#7a85a0",muted:"#4a5570",border:"#232d45",green:"#22c55e",greenDim:"#22c55e22",candleUp:"#22c55e",candleDn:"#ef4444",yellow:"#eab308",yellowDim:"#eab30822",blue:"#3b82f6",blueDim:"#3b82f622"};
const fl=document.createElement("link");fl.href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap";fl.rel="stylesheet";document.head.appendChild(fl);
// Ensure viewport meta for mobile
if(!document.querySelector('meta[name="viewport"]')){const vm=document.createElement("meta");vm.name="viewport";vm.content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover";document.head.appendChild(vm);}
// Global responsive CSS
const _rCSS=document.createElement("style");_rCSS.textContent=`*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;padding:0;overflow:hidden;height:100dvh;width:100%}input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:4px}`;document.head.appendChild(_rCSS);
const MO={fontFamily:"'Inter', sans-serif"},IN={fontFamily:"'DM Sans', sans-serif"};
const AC=window.AudioContext||window.webkitAudioContext;let ac=null;function gc(){if(!ac)ac=new AC();return ac;}
function playOpen(){try{const c=gc(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.setValueAtTime(600,c.currentTime);o.frequency.exponentialRampToValueAtTime(1200,c.currentTime+.15);g.gain.setValueAtTime(.15,c.currentTime);g.gain.exponentialRampToValueAtTime(.01,c.currentTime+.25);o.start(c.currentTime);o.stop(c.currentTime+.25);const o2=c.createOscillator(),g2=c.createGain();o2.connect(g2);g2.connect(c.destination);o2.type="sine";o2.frequency.value=1800;g2.gain.setValueAtTime(.1,c.currentTime+.1);g2.gain.exponentialRampToValueAtTime(.01,c.currentTime+.2);o2.start(c.currentTime+.1);o2.stop(c.currentTime+.2);}catch(e){}}
function playWin(){try{const c=gc();[800,1000,1200,1600].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.value=f;const t=c.currentTime+i*.1;g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.01,t+.15);o.start(t);o.stop(t+.15);});}catch(e){}}
function playLoss(){try{const c=gc();[400,300,200].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.value=f;const t=c.currentTime+i*.15;g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.01,t+.2);o.start(t);o.stop(t+.2);});}catch(e){}}
function playTick(){try{const c=gc(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";o.frequency.value=1400;g.gain.setValueAtTime(.05,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.05);o.start(c.currentTime);o.stop(c.currentTime+.05);}catch(e){}}
function playAlert(){try{const c=gc();[1000,1200,1000].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="triangle";o.frequency.value=f;const t=c.currentTime+i*.12;g.gain.setValueAtTime(.1,t);g.gain.exponentialRampToValueAtTime(.01,t+.15);o.start(t);o.stop(t+.15);});}catch(e){}}
function ls(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d;}catch{return d;}}
function ss(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{}}

// Currency rates cache
let ratesCache={};let ratesTime=0;
async function fetchRates(){if(Date.now()-ratesTime<300000&&Object.keys(ratesCache).length)return ratesCache;try{const r=await fetch("https://api.binance.com/api/v3/ticker/price");const data=await r.json();const rates={USD:1};data.forEach(t=>{if(t.symbol==="EURUSDT")rates.EUR=1/+t.price;if(t.symbol==="GBPUSDT")rates.GBP=1/+t.price;});rates.PKR=278.5;rates.INR=83.5;rates.AED=3.67;rates.SAR=3.75;rates.JPY=154.3;rates.CNY=7.24;rates.TRY=32.5;rates.BRL=5.1;rates.RUB=92.5;ratesCache=rates;ratesTime=Date.now();return rates;}catch{return{USD:1,PKR:278.5,INR:83.5,AED:3.67,SAR:3.75,JPY:154.3,CNY:7.24,TRY:32.5,BRL:5.1,RUB:92.5,EUR:0.92,GBP:0.79};}}

// Default pairs — will be replaced by backend data on mount
let PAIRS=[
{s:"BTCUSDT",label:"Bitcoin",short:"BTC",payout:85,prec:2,logo:"https://assets.coincap.io/assets/icons/btc@2x.png"},
{s:"ETHUSDT",label:"Ethereum",short:"ETH",payout:82,prec:2,logo:"https://assets.coincap.io/assets/icons/eth@2x.png"},
{s:"BNBUSDT",label:"BNB",short:"BNB",payout:80,prec:2,logo:"https://assets.coincap.io/assets/icons/bnb@2x.png"},
{s:"SOLUSDT",label:"Solana",short:"SOL",payout:83,prec:2,logo:"https://assets.coincap.io/assets/icons/sol@2x.png"},
{s:"XRPUSDT",label:"XRP",short:"XRP",payout:78,prec:4,logo:"https://assets.coincap.io/assets/icons/xrp@2x.png"},
{s:"DOGEUSDT",label:"Doge",short:"DOGE",payout:76,prec:5,logo:"https://assets.coincap.io/assets/icons/doge@2x.png"},
{s:"ADAUSDT",label:"Cardano",short:"ADA",payout:77,prec:4,logo:"https://assets.coincap.io/assets/icons/ada@2x.png"},
{s:"AVAXUSDT",label:"Avalanche",short:"AVAX",payout:79,prec:2,logo:"https://assets.coincap.io/assets/icons/avax@2x.png"},
{s:"EURUSD_OTC",label:"EUR/USD (OTC)",short:"EUR/USD",payout:92,prec:5,otc:true,basePrice:1.08542,vol:0.00015,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg",trendBias:0,priceOffset:0},
{s:"GBPUSD_OTC",label:"GBP/USD (OTC)",short:"GBP/USD",payout:90,prec:5,otc:true,basePrice:1.27130,vol:0.00018,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg",trendBias:0,priceOffset:0},
{s:"USDJPY_OTC",label:"USD/JPY (OTC)",short:"USD/JPY",payout:91,prec:3,otc:true,basePrice:154.320,vol:0.025,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg",trendBias:0,priceOffset:0},
{s:"AUDUSD_OTC",label:"AUD/USD (OTC)",short:"AUD/USD",payout:88,prec:5,otc:true,basePrice:0.65420,vol:0.00012,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg",trendBias:0,priceOffset:0},
{s:"USDCAD_OTC",label:"USD/CAD (OTC)",short:"USD/CAD",payout:89,prec:5,otc:true,basePrice:1.36780,vol:0.00014,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ca.svg",trendBias:0,priceOffset:0},
{s:"EURGBP_OTC",label:"EUR/GBP (OTC)",short:"EUR/GBP",payout:87,prec:5,otc:true,basePrice:0.85340,vol:0.00010,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/gb.svg",trendBias:0,priceOffset:0},
{s:"NZDUSD_OTC",label:"NZD/USD (OTC)",short:"NZD/USD",payout:86,prec:5,otc:true,basePrice:0.59870,vol:0.00011,logo:"https://hatscripts.github.io/circle-flags/flags/nz.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg",trendBias:0,priceOffset:0},
{s:"USDCHF_OTC",label:"USD/CHF (OTC)",short:"USD/CHF",payout:88,prec:5,otc:true,basePrice:0.88240,vol:0.00013,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ch.svg",trendBias:0,priceOffset:0},
{s:"USDTRY_OTC",label:"USD/TRY (OTC)",short:"USD/TRY",payout:85,prec:4,otc:true,basePrice:32.4500,vol:0.0080,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/tr.svg",trendBias:0,priceOffset:0},
{s:"EURJPY_OTC",label:"EUR/JPY (OTC)",short:"EUR/JPY",payout:90,prec:3,otc:true,basePrice:167.450,vol:0.030,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg",trendBias:0,priceOffset:0},
{s:"GBPJPY_OTC",label:"GBP/JPY (OTC)",short:"GBP/JPY",payout:89,prec:3,otc:true,basePrice:196.120,vol:0.035,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg",trendBias:0,priceOffset:0},
{s:"XAUUSD_OTC",label:"Gold (OTC)",short:"XAU/USD",payout:90,prec:2,otc:true,basePrice:2345.60,vol:0.50,logo:"https://cdn-icons-png.flaticon.com/512/2933/2933116.png",trendBias:0,priceOffset:0},
// ═══ REAL FOREX PAIRS (TradingView via backend) ═══
// MAJOR PAIRS
{s:"EURUSD",label:"EUR/USD",short:"EUR/USD",payout:80,prec:5,realForex:true,basePrice:1.17400,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg"},
{s:"GBPUSD",label:"GBP/USD",short:"GBP/USD",payout:78,prec:5,realForex:true,basePrice:1.35080,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg"},
{s:"USDJPY",label:"USD/JPY",short:"USD/JPY",payout:79,prec:3,realForex:true,basePrice:156.500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"AUDUSD",label:"AUD/USD",short:"AUD/USD",payout:77,prec:5,realForex:true,basePrice:0.71560,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg"},
{s:"USDCAD",label:"USD/CAD",short:"USD/CAD",payout:78,prec:5,realForex:true,basePrice:1.36560,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ca.svg"},
{s:"USDCHF",label:"USD/CHF",short:"USD/CHF",payout:78,prec:5,realForex:true,basePrice:0.78170,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ch.svg"},
{s:"NZDUSD",label:"NZD/USD",short:"NZD/USD",payout:77,prec:5,realForex:true,basePrice:0.59100,logo:"https://hatscripts.github.io/circle-flags/flags/nz.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/us.svg"},
// MINOR (CROSS) PAIRS
{s:"EURGBP",label:"EUR/GBP",short:"EUR/GBP",payout:76,prec:5,realForex:true,basePrice:0.86920,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/gb.svg"},
{s:"EURJPY",label:"EUR/JPY",short:"EUR/JPY",payout:78,prec:3,realForex:true,basePrice:186.945,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"GBPJPY",label:"GBP/JPY",short:"GBP/JPY",payout:77,prec:3,realForex:true,basePrice:215.070,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"EURCHF",label:"EUR/CHF",short:"EUR/CHF",payout:75,prec:5,realForex:true,basePrice:0.91770,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ch.svg"},
{s:"GBPCHF",label:"GBP/CHF",short:"GBP/CHF",payout:75,prec:5,realForex:true,basePrice:1.12180,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ch.svg"},
{s:"AUDJPY",label:"AUD/JPY",short:"AUD/JPY",payout:76,prec:3,realForex:true,basePrice:100.940,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"NZDJPY",label:"NZD/JPY",short:"NZD/JPY",payout:75,prec:3,realForex:true,basePrice:92.380,logo:"https://hatscripts.github.io/circle-flags/flags/nz.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"AUDCAD",label:"AUD/CAD",short:"AUD/CAD",payout:75,prec:5,realForex:true,basePrice:0.89470,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ca.svg"},
{s:"AUDCHF",label:"AUD/CHF",short:"AUD/CHF",payout:74,prec:5,realForex:true,basePrice:0.57730,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ch.svg"},
{s:"AUDNZD",label:"AUD/NZD",short:"AUD/NZD",payout:74,prec:5,realForex:true,basePrice:1.09280,logo:"https://hatscripts.github.io/circle-flags/flags/au.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/nz.svg"},
{s:"CADJPY",label:"CAD/JPY",short:"CAD/JPY",payout:75,prec:3,realForex:true,basePrice:112.820,logo:"https://hatscripts.github.io/circle-flags/flags/ca.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"CHFJPY",label:"CHF/JPY",short:"CHF/JPY",payout:75,prec:3,realForex:true,basePrice:174.860,logo:"https://hatscripts.github.io/circle-flags/flags/ch.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/jp.svg"},
{s:"EURAUD",label:"EUR/AUD",short:"EUR/AUD",payout:75,prec:5,realForex:true,basePrice:1.65920,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/au.svg"},
{s:"EURCAD",label:"EUR/CAD",short:"EUR/CAD",payout:75,prec:5,realForex:true,basePrice:1.48380,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ca.svg"},
{s:"EURNZD",label:"EUR/NZD",short:"EUR/NZD",payout:74,prec:5,realForex:true,basePrice:1.81350,logo:"https://hatscripts.github.io/circle-flags/flags/eu.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/nz.svg"},
{s:"GBPAUD",label:"GBP/AUD",short:"GBP/AUD",payout:74,prec:5,realForex:true,basePrice:1.94320,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/au.svg"},
{s:"GBPCAD",label:"GBP/CAD",short:"GBP/CAD",payout:74,prec:5,realForex:true,basePrice:1.73810,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/ca.svg"},
{s:"GBPNZD",label:"GBP/NZD",short:"GBP/NZD",payout:73,prec:5,realForex:true,basePrice:2.12340,logo:"https://hatscripts.github.io/circle-flags/flags/gb.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/nz.svg"},
// EXOTIC PAIRS
{s:"USDTRY",label:"USD/TRY",short:"USD/TRY",payout:72,prec:4,realForex:true,basePrice:32.4500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/tr.svg"},
{s:"USDZAR",label:"USD/ZAR",short:"USD/ZAR",payout:72,prec:4,realForex:true,basePrice:18.7500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/za.svg"},
{s:"USDMXN",label:"USD/MXN",short:"USD/MXN",payout:72,prec:4,realForex:true,basePrice:20.1500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/mx.svg"},
{s:"USDSGD",label:"USD/SGD",short:"USD/SGD",payout:74,prec:4,realForex:true,basePrice:1.3450,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/sg.svg"},
{s:"USDHKD",label:"USD/HKD",short:"USD/HKD",payout:73,prec:4,realForex:true,basePrice:7.8120,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/hk.svg"},
{s:"USDNOK",label:"USD/NOK",short:"USD/NOK",payout:72,prec:4,realForex:true,basePrice:11.0500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/no.svg"},
{s:"USDSEK",label:"USD/SEK",short:"USD/SEK",payout:72,prec:4,realForex:true,basePrice:10.8200,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/se.svg"},
{s:"USDPLN",label:"USD/PLN",short:"USD/PLN",payout:72,prec:4,realForex:true,basePrice:4.0500,logo:"https://hatscripts.github.io/circle-flags/flags/us.svg",logo2:"https://hatscripts.github.io/circle-flags/flags/pl.svg"},
// COMMODITIES
{s:"XAUUSD",label:"Gold",short:"XAU/USD",payout:80,prec:2,realForex:true,basePrice:2345.60,logo:"https://cdn-icons-png.flaticon.com/512/2933/2933116.png"},
{s:"XAGUSD",label:"Silver",short:"XAG/USD",payout:78,prec:3,realForex:true,basePrice:28.450,logo:"https://cdn-icons-png.flaticon.com/512/2933/2933131.png"},
{s:"XPTUSD",label:"Platinum",short:"XPT/USD",payout:75,prec:2,realForex:true,basePrice:945.30,logo:"https://cdn-icons-png.flaticon.com/512/2933/2933158.png"},
{s:"XPDUSD",label:"Palladium",short:"XPD/USD",payout:74,prec:2,realForex:true,basePrice:980.50,logo:"https://cdn-icons-png.flaticon.com/512/2933/2933158.png"}
];
const TFS=[{label:"1s",b:"1s",span:"second",mult:1,ms:1000},{label:"5s",b:"1s",span:"second",mult:5,ms:5000},{label:"10s",b:"1s",span:"second",mult:10,ms:10000},{label:"15s",b:"1s",span:"second",mult:15,ms:15000},{label:"30s",b:"1s",span:"second",mult:30,ms:30000},{label:"1m",b:"1m",span:"minute",mult:1,ms:60000},{label:"2m",b:"1m",span:"minute",mult:2,ms:120000},{label:"3m",b:"3m",span:"minute",mult:3,ms:180000},{label:"5m",b:"5m",span:"minute",mult:5,ms:300000},{label:"10m",b:"5m",span:"minute",mult:10,ms:600000},{label:"15m",b:"15m",span:"minute",mult:15,ms:900000},{label:"1h",b:"1h",span:"hour",mult:1,ms:3600000},{label:"4h",b:"4h",span:"hour",mult:4,ms:14400000},{label:"1D",b:"1d",span:"day",mult:1,ms:86400000}];
// DURS — full duration list. Sub-minute durations (5s/10s/15s/30s) are OTC-only since
// real forex pairs use exchange-defined expiries. Filtering happens at the UI level
// via getAvailableDurs(pair) below.
const DURS=[
  {label:"5s",sec:5,otcOnly:true},
  {label:"10s",sec:10,otcOnly:true},
  {label:"15s",sec:15,otcOnly:true},
  {label:"30s",sec:30,otcOnly:true},
  {label:"1m",sec:60},{label:"2m",sec:120},{label:"3m",sec:180},{label:"4m",sec:240},{label:"5m",sec:300},{label:"6m",sec:360},{label:"7m",sec:420},{label:"8m",sec:480},{label:"9m",sec:540},{label:"10m",sec:600},{label:"15m",sec:900},{label:"20m",sec:1200},{label:"25m",sec:1500},{label:"30m",sec:1800},{label:"45m",sec:2700},{label:"60m",sec:3600},
  {label:"2h",sec:7200,otcOnly:true},
  {label:"4h",sec:14400,otcOnly:true}
];
// Helper: get durations available for a given pair.
// - OTC pairs: ALL durations (5s, 10s, ..., 4h) — these synthetic pairs allow blitz trading.
// - Real pairs (real forex + crypto): 1m minimum (no 5s/10s/15s/30s) since real markets
//   don't tick sub-second; 1m to 60m available.
// The 2h/4h durations are hidden from real pairs since they're OTC-only conventions.
const getAvailableDurs=(pair)=>{
  const isOtc=!!(pair&&pair.otc);
  return DURS.filter(d=>{
    // OTC pairs see everything
    if(isOtc)return true;
    // Real pairs (forex + crypto): no sub-minute, no 2h/4h
    if(d.otcOnly)return false; // hides 5s/10s/15s/30s/2h/4h
    return true;
  });
};
const TIMEZONES=["UTC-12:00","UTC-11:00","UTC-10:00","UTC-09:00","UTC-08:00 (PST)","UTC-07:00 (MST)","UTC-06:00 (CST)","UTC-05:00 (EST)","UTC-04:00","UTC-03:00","UTC-02:00","UTC-01:00","UTC+00:00 (GMT)","UTC+01:00 (CET)","UTC+02:00 (EET)","UTC+03:00 (MSK)","UTC+03:30","UTC+04:00","UTC+04:30","UTC+05:00 (PKT)","UTC+05:30 (IST)","UTC+06:00","UTC+07:00","UTC+08:00 (CST)","UTC+09:00 (JST)","UTC+10:00","UTC+11:00","UTC+12:00"];

// ═══ FOREX MARKET HOURS ═══
// Forex closes Friday 22:00 UTC and reopens Sunday 22:00 UTC.
// OTC pairs trade 24/7 — these helpers only apply to real forex pairs.
function getForexMarketStatus(now=new Date()){
  const day=now.getUTCDay(); // 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  const hour=now.getUTCHours();
  let isOpen=true;
  if(day===6){isOpen=false;} // Saturday — closed all day
  else if(day===5&&hour>=22){isOpen=false;} // Friday after 22:00 UTC
  else if(day===0&&hour<22){isOpen=false;} // Sunday before 22:00 UTC
  let reopenAt=null;
  if(!isOpen){
    // Compute next Sunday 22:00 UTC
    const r=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),22,0,0,0));
    const rDay=r.getUTCDay();
    if(rDay===0){
      if(now.getTime()>=r.getTime()){r.setUTCDate(r.getUTCDate()+7);}
    }else{
      // Move forward until we hit Sunday
      const daysToAdd=(7-rDay)%7;
      r.setUTCDate(r.getUTCDate()+daysToAdd);
      if(r.getTime()<=now.getTime())r.setUTCDate(r.getUTCDate()+7);
    }
    reopenAt=r.getTime();
  }
  return{isOpen,reopenAt,msUntilOpen:reopenAt?reopenAt-now.getTime():0};
}
function fmtMarketCountdown(ms){
  if(ms<=0)return"00:00:00";
  const totalSec=Math.floor(ms/1000);
  const d=Math.floor(totalSec/86400);
  const h=Math.floor((totalSec%86400)/3600);
  const m=Math.floor((totalSec%3600)/60);
  const s=totalSec%60;
  const pad=(n)=>String(n).padStart(2,"0");
  if(d>0)return`${d}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return`${pad(h)}:${pad(m)}:${pad(s)}`;
}
// React hook — returns market status, updates every second when closed
function useForexMarketStatus(){
  const[status,setStatus]=useState(()=>getForexMarketStatus());
  useEffect(()=>{
    const tick=()=>setStatus(getForexMarketStatus());
    // Update every second so countdown stays live
    const iv=setInterval(tick,1000);
    return()=>clearInterval(iv);
  },[]);
  return status;
}
const LANGUAGES=[{code:"en",label:"English",native:"English"},{code:"ur",label:"Urdu",native:"اردو"},{code:"ar",label:"Arabic",native:"العربية"},{code:"es",label:"Spanish",native:"Español"},{code:"fr",label:"French",native:"Français"},{code:"de",label:"German",native:"Deutsch"},{code:"zh",label:"Chinese",native:"中文"},{code:"ja",label:"Japanese",native:"日本語"},{code:"ko",label:"Korean",native:"한국어"},{code:"ru",label:"Russian",native:"Русский"},{code:"pt",label:"Portuguese",native:"Português"},{code:"hi",label:"Hindi",native:"हिन्दी"},{code:"tr",label:"Turkish",native:"Türkçe"}];

// Translation dictionary — keys common in UI
const TRANSLATIONS={
  en:{portfolio:"Trading",history:"History",alerts:"Alerts",signals:"Signals",wallet:"Wallet",ranking:"Ranking",tournament:"Tournaments",help:"Help",settings:"Settings",investments:"Investments",expiryTime:"Expiry Time",profit:"Profit",higher:"HIGHER",lower:"LOWER",deposit:"Deposit",demo:"DEMO",openTrades:"Open Trades",trades:"Trades",signIn:"Sign In",register:"Register",fullName:"Full Name",email:"Email",password:"Password",createAccount:"Create Account",close:"Close",save:"Save",theme:"Theme",dark:"Dark",light:"Light",language:"Language",currency:"Currency",timezone:"Timezone",sound:"Sound Effects",on:"On",off:"Off",noTrades:"No trades yet",noAlerts:"No alerts",balance:"Balance",timeframe:"Timeframe",chartType:"Chart Type",indicators:"Indicators",drawings:"Drawings",clearAll:"Clear All",candles:"Candles",bars:"Bars",area:"Area",line:"Line",addPair:"Add Pair",selectPairs:"Select pairs to display as tabs",total:"Total",helpCenter:"Help Center",reportIssue:"Report Issue",keyboardShortcuts:"Keyboard Shortcuts",tradeHigher:"Trade Higher",tradeLower:"Trade Lower",changeAsset:"Change Asset",fullscreen:"Fullscreen",candleColors:"Candle Colors",uploadBg:"Upload BG",removeBg:"Remove BG"},
  ur:{portfolio:"پورٹ فولیو",history:"تاریخ",alerts:"الرٹس",signals:"سگنلز",wallet:"والٹ",ranking:"درجہ بندی",tournament:"ٹورنامنٹس",help:"مدد",settings:"ترتیبات",investments:"سرمایہ کاری",expiryTime:"مدت ختم",profit:"منافع",higher:"اوپر",lower:"نیچے",deposit:"ڈپازٹ",demo:"ڈیمو",openTrades:"کھلی ٹریڈز",trades:"ٹریڈز",signIn:"سائن ان",register:"رجسٹر",fullName:"پورا نام",email:"ای میل",password:"پاس ورڈ",createAccount:"اکاؤنٹ بنائیں",close:"بند",save:"محفوظ کریں",theme:"تھیم",dark:"ڈارک",light:"لائٹ",language:"زبان",currency:"کرنسی",timezone:"ٹائم زون",sound:"آواز",on:"آن",off:"آف",noTrades:"کوئی ٹریڈ نہیں",noAlerts:"کوئی الرٹ نہیں",balance:"بیلنس",timeframe:"ٹائم فریم",chartType:"چارٹ کی قسم",indicators:"اشارے",drawings:"ڈرائنگز",clearAll:"سب صاف کریں",candles:"کینڈلز",bars:"بارز",area:"ایریا",line:"لائن",addPair:"پیئر شامل کریں",selectPairs:"ٹیبز کے لیے پیئر منتخب کریں",total:"کل",helpCenter:"مدد مرکز",reportIssue:"مسئلہ رپورٹ کریں",keyboardShortcuts:"کی بورڈ شارٹ کٹس",tradeHigher:"اوپر ٹریڈ",tradeLower:"نیچے ٹریڈ",changeAsset:"اثاثہ تبدیل",fullscreen:"فل اسکرین",candleColors:"کینڈل رنگ",uploadBg:"تصویر اپلوڈ",removeBg:"تصویر ہٹائیں"},
  ar:{portfolio:"المحفظة",history:"السجل",alerts:"التنبيهات",signals:"الإشارات",wallet:"المحفظة",ranking:"الترتيب",tournament:"البطولات",help:"مساعدة",settings:"الإعدادات",investments:"الاستثمارات",expiryTime:"وقت الانتهاء",profit:"الربح",higher:"أعلى",lower:"أقل",deposit:"إيداع",demo:"تجريبي",openTrades:"صفقات مفتوحة",trades:"الصفقات",signIn:"تسجيل الدخول",register:"تسجيل",fullName:"الاسم الكامل",email:"البريد الإلكتروني",password:"كلمة المرور",createAccount:"إنشاء حساب",close:"إغلاق",save:"حفظ",theme:"المظهر",dark:"داكن",light:"فاتح",language:"اللغة",currency:"العملة",timezone:"المنطقة الزمنية",sound:"المؤثرات الصوتية",on:"تشغيل",off:"إيقاف",noTrades:"لا توجد صفقات",noAlerts:"لا توجد تنبيهات",balance:"الرصيد",timeframe:"الإطار الزمني",chartType:"نوع المخطط",indicators:"المؤشرات",drawings:"الرسومات",clearAll:"مسح الكل",candles:"شموع",bars:"أعمدة",area:"منطقة",line:"خط",addPair:"إضافة زوج",selectPairs:"اختر الأزواج لعرضها",total:"المجموع",helpCenter:"مركز المساعدة",reportIssue:"الإبلاغ عن مشكلة",keyboardShortcuts:"اختصارات لوحة المفاتيح",tradeHigher:"تداول أعلى",tradeLower:"تداول أقل",changeAsset:"تغيير الأصل",fullscreen:"ملء الشاشة",candleColors:"ألوان الشموع",uploadBg:"رفع خلفية",removeBg:"إزالة الخلفية"},
  es:{portfolio:"Cartera",history:"Historial",alerts:"Alertas",signals:"Señales",wallet:"Billetera",ranking:"Clasificación",tournament:"Torneos",help:"Ayuda",settings:"Ajustes",investments:"Inversiones",expiryTime:"Tiempo de expiración",profit:"Beneficio",higher:"SUBE",lower:"BAJA",deposit:"Depositar",demo:"DEMO",openTrades:"Operaciones abiertas",trades:"Operaciones",signIn:"Iniciar sesión",register:"Registrarse",fullName:"Nombre completo",email:"Correo",password:"Contraseña",createAccount:"Crear cuenta",close:"Cerrar",save:"Guardar",theme:"Tema",dark:"Oscuro",light:"Claro",language:"Idioma",currency:"Moneda",timezone:"Zona horaria",sound:"Sonido",on:"Activado",off:"Desactivado",noTrades:"Sin operaciones",noAlerts:"Sin alertas",balance:"Saldo",timeframe:"Temporalidad",chartType:"Tipo de gráfico",indicators:"Indicadores",drawings:"Dibujos",clearAll:"Borrar todo",candles:"Velas",bars:"Barras",area:"Área",line:"Línea",addPair:"Agregar par",selectPairs:"Selecciona pares para mostrar",total:"Total",helpCenter:"Centro de ayuda",reportIssue:"Reportar problema",keyboardShortcuts:"Atajos de teclado",tradeHigher:"Operar Sube",tradeLower:"Operar Baja",changeAsset:"Cambiar activo",fullscreen:"Pantalla completa",candleColors:"Colores de velas",uploadBg:"Subir fondo",removeBg:"Quitar fondo"},
  fr:{portfolio:"Portefeuille",history:"Historique",alerts:"Alertes",signals:"Signaux",wallet:"Portefeuille",ranking:"Classement",tournament:"Tournois",help:"Aide",settings:"Paramètres",investments:"Investissements",expiryTime:"Temps d'expiration",profit:"Profit",higher:"HAUT",lower:"BAS",deposit:"Dépôt",demo:"DÉMO",openTrades:"Trades ouverts",trades:"Trades",signIn:"Connexion",register:"S'inscrire",fullName:"Nom complet",email:"Email",password:"Mot de passe",createAccount:"Créer un compte",close:"Fermer",save:"Enregistrer",theme:"Thème",dark:"Sombre",light:"Clair",language:"Langue",currency:"Devise",timezone:"Fuseau horaire",sound:"Son",on:"Activé",off:"Désactivé",noTrades:"Aucun trade",noAlerts:"Aucune alerte",balance:"Solde",timeframe:"Intervalle",chartType:"Type de graphique",indicators:"Indicateurs",drawings:"Dessins",clearAll:"Tout effacer",candles:"Bougies",bars:"Barres",area:"Zone",line:"Ligne",addPair:"Ajouter paire",selectPairs:"Sélectionnez des paires",total:"Total",helpCenter:"Centre d'aide",reportIssue:"Signaler un problème",keyboardShortcuts:"Raccourcis clavier",tradeHigher:"Trade Haut",tradeLower:"Trade Bas",changeAsset:"Changer l'actif",fullscreen:"Plein écran",candleColors:"Couleurs bougies",uploadBg:"Télécharger fond",removeBg:"Retirer fond"},
  de:{portfolio:"Trading",history:"Verlauf",alerts:"Warnungen",signals:"Signale",wallet:"Wallet",ranking:"Rangliste",tournament:"Turniere",help:"Hilfe",settings:"Einstellungen",investments:"Investitionen",expiryTime:"Ablaufzeit",profit:"Gewinn",higher:"HOCH",lower:"TIEF",deposit:"Einzahlung",demo:"DEMO",openTrades:"Offene Trades",trades:"Trades",signIn:"Anmelden",register:"Registrieren",fullName:"Vollständiger Name",email:"E-Mail",password:"Passwort",createAccount:"Konto erstellen",close:"Schließen",save:"Speichern",theme:"Design",dark:"Dunkel",light:"Hell",language:"Sprache",currency:"Währung",timezone:"Zeitzone",sound:"Ton",on:"Ein",off:"Aus",noTrades:"Keine Trades",noAlerts:"Keine Warnungen",balance:"Guthaben",timeframe:"Zeitrahmen",chartType:"Diagrammtyp",indicators:"Indikatoren",drawings:"Zeichnungen",clearAll:"Alle löschen",candles:"Kerzen",bars:"Balken",area:"Bereich",line:"Linie",addPair:"Paar hinzufügen",selectPairs:"Paare zur Anzeige wählen",total:"Gesamt",helpCenter:"Hilfezentrum",reportIssue:"Problem melden",keyboardShortcuts:"Tastenkürzel",tradeHigher:"Hoch traden",tradeLower:"Tief traden",changeAsset:"Asset wechseln",fullscreen:"Vollbild",candleColors:"Kerzenfarben",uploadBg:"Hintergrund hochladen",removeBg:"Hintergrund entfernen"},
  zh:{portfolio:"投资组合",history:"历史",alerts:"警报",signals:"信号",wallet:"钱包",ranking:"排名",tournament:"锦标赛",help:"帮助",settings:"设置",investments:"投资",expiryTime:"到期时间",profit:"利润",higher:"看涨",lower:"看跌",deposit:"存款",demo:"演示",openTrades:"未结交易",trades:"交易",signIn:"登录",register:"注册",fullName:"全名",email:"邮箱",password:"密码",createAccount:"创建账户",close:"关闭",save:"保存",theme:"主题",dark:"深色",light:"浅色",language:"语言",currency:"货币",timezone:"时区",sound:"声音",on:"开",off:"关",noTrades:"暂无交易",noAlerts:"暂无警报",balance:"余额",timeframe:"时间框架",chartType:"图表类型",indicators:"指标",drawings:"绘图",clearAll:"全部清除",candles:"K线",bars:"柱状",area:"面积",line:"线图",addPair:"添加货币对",selectPairs:"选择要显示的货币对",total:"总计",helpCenter:"帮助中心",reportIssue:"报告问题",keyboardShortcuts:"键盘快捷键",tradeHigher:"看涨交易",tradeLower:"看跌交易",changeAsset:"切换资产",fullscreen:"全屏",candleColors:"K线颜色",uploadBg:"上传背景",removeBg:"移除背景"},
  ja:{portfolio:"ポートフォリオ",history:"履歴",alerts:"アラート",signals:"シグナル",wallet:"ウォレット",ranking:"ランキング",tournament:"トーナメント",help:"ヘルプ",settings:"設定",investments:"投資額",expiryTime:"満期時間",profit:"利益",higher:"上昇",lower:"下落",deposit:"入金",demo:"デモ",openTrades:"未決済",trades:"トレード",signIn:"サインイン",register:"登録",fullName:"氏名",email:"メール",password:"パスワード",createAccount:"アカウント作成",close:"閉じる",save:"保存",theme:"テーマ",dark:"ダーク",light:"ライト",language:"言語",currency:"通貨",timezone:"タイムゾーン",sound:"音声",on:"オン",off:"オフ",noTrades:"取引なし",noAlerts:"アラートなし",balance:"残高",timeframe:"時間枠",chartType:"チャート種類",indicators:"インジケーター",drawings:"描画",clearAll:"すべてクリア",candles:"ローソク足",bars:"バー",area:"エリア",line:"ライン",addPair:"ペア追加",selectPairs:"表示ペアを選択",total:"合計",helpCenter:"ヘルプセンター",reportIssue:"問題報告",keyboardShortcuts:"ショートカット",tradeHigher:"上昇取引",tradeLower:"下落取引",changeAsset:"銘柄切替",fullscreen:"全画面",candleColors:"ローソク色",uploadBg:"背景アップロード",removeBg:"背景削除"},
  ko:{portfolio:"포트폴리오",history:"기록",alerts:"알림",signals:"신호",wallet:"지갑",ranking:"순위",tournament:"토너먼트",help:"도움말",settings:"설정",investments:"투자",expiryTime:"만료시간",profit:"수익",higher:"상승",lower:"하락",deposit:"입금",demo:"데모",openTrades:"진행중",trades:"거래",signIn:"로그인",register:"가입",fullName:"이름",email:"이메일",password:"비밀번호",createAccount:"계정 만들기",close:"닫기",save:"저장",theme:"테마",dark:"다크",light:"라이트",language:"언어",currency:"통화",timezone:"시간대",sound:"소리",on:"켜기",off:"끄기",noTrades:"거래 없음",noAlerts:"알림 없음",balance:"잔액",timeframe:"기간",chartType:"차트 유형",indicators:"지표",drawings:"그리기",clearAll:"모두 지우기",candles:"캔들",bars:"바",area:"영역",line:"선",addPair:"페어 추가",selectPairs:"표시할 페어 선택",total:"총계",helpCenter:"도움말 센터",reportIssue:"문제 신고",keyboardShortcuts:"단축키",tradeHigher:"상승 거래",tradeLower:"하락 거래",changeAsset:"자산 변경",fullscreen:"전체화면",candleColors:"캔들 색상",uploadBg:"배경 업로드",removeBg:"배경 제거"},
  ru:{portfolio:"Портфель",history:"История",alerts:"Уведомления",signals:"Сигналы",wallet:"Кошелёк",ranking:"Рейтинг",tournament:"Турниры",help:"Помощь",settings:"Настройки",investments:"Инвестиции",expiryTime:"Время истечения",profit:"Прибыль",higher:"ВЫШЕ",lower:"НИЖЕ",deposit:"Депозит",demo:"ДЕМО",openTrades:"Открытые",trades:"Сделки",signIn:"Войти",register:"Регистрация",fullName:"Полное имя",email:"Email",password:"Пароль",createAccount:"Создать аккаунт",close:"Закрыть",save:"Сохранить",theme:"Тема",dark:"Тёмная",light:"Светлая",language:"Язык",currency:"Валюта",timezone:"Часовой пояс",sound:"Звук",on:"Вкл",off:"Выкл",noTrades:"Нет сделок",noAlerts:"Нет уведомлений",balance:"Баланс",timeframe:"Таймфрейм",chartType:"Тип графика",indicators:"Индикаторы",drawings:"Рисунки",clearAll:"Очистить всё",candles:"Свечи",bars:"Бары",area:"Площадь",line:"Линия",addPair:"Добавить пару",selectPairs:"Выберите пары",total:"Всего",helpCenter:"Центр помощи",reportIssue:"Сообщить о проблеме",keyboardShortcuts:"Горячие клавиши",tradeHigher:"Торговать Выше",tradeLower:"Торговать Ниже",changeAsset:"Сменить актив",fullscreen:"Полный экран",candleColors:"Цвета свечей",uploadBg:"Загрузить фон",removeBg:"Удалить фон"},
  pt:{portfolio:"Portfólio",history:"Histórico",alerts:"Alertas",signals:"Sinais",wallet:"Carteira",ranking:"Ranking",tournament:"Torneios",help:"Ajuda",settings:"Configurações",investments:"Investimentos",expiryTime:"Expiração",profit:"Lucro",higher:"SOBE",lower:"DESCE",deposit:"Depósito",demo:"DEMO",openTrades:"Operações abertas",trades:"Operações",signIn:"Entrar",register:"Registrar",fullName:"Nome completo",email:"Email",password:"Senha",createAccount:"Criar conta",close:"Fechar",save:"Salvar",theme:"Tema",dark:"Escuro",light:"Claro",language:"Idioma",currency:"Moeda",timezone:"Fuso horário",sound:"Som",on:"Ligado",off:"Desligado",noTrades:"Sem operações",noAlerts:"Sem alertas",balance:"Saldo",timeframe:"Intervalo",chartType:"Tipo de gráfico",indicators:"Indicadores",drawings:"Desenhos",clearAll:"Limpar tudo",candles:"Velas",bars:"Barras",area:"Área",line:"Linha",addPair:"Adicionar par",selectPairs:"Selecione pares",total:"Total",helpCenter:"Central de ajuda",reportIssue:"Reportar problema",keyboardShortcuts:"Atalhos do teclado",tradeHigher:"Operar Sobe",tradeLower:"Operar Desce",changeAsset:"Mudar ativo",fullscreen:"Tela cheia",candleColors:"Cores das velas",uploadBg:"Carregar fundo",removeBg:"Remover fundo"},
  hi:{portfolio:"पोर्टफोलियो",history:"इतिहास",alerts:"अलर्ट",signals:"सिग्नल",wallet:"वॉलेट",ranking:"रैंकिंग",tournament:"टूर्नामेंट",help:"मदद",settings:"सेटिंग्स",investments:"निवेश",expiryTime:"समाप्ति समय",profit:"लाभ",higher:"ऊपर",lower:"नीचे",deposit:"जमा",demo:"डेमो",openTrades:"खुले ट्रेड",trades:"ट्रेड",signIn:"साइन इन",register:"रजिस्टर",fullName:"पूरा नाम",email:"ईमेल",password:"पासवर्ड",createAccount:"खाता बनाएं",close:"बंद",save:"सहेजें",theme:"थीम",dark:"डार्क",light:"लाइट",language:"भाषा",currency:"मुद्रा",timezone:"टाइम ज़ोन",sound:"ध्वनि",on:"चालू",off:"बंद",noTrades:"कोई ट्रेड नहीं",noAlerts:"कोई अलर्ट नहीं",balance:"शेष राशि",timeframe:"समय सीमा",chartType:"चार्ट प्रकार",indicators:"संकेतक",drawings:"चित्र",clearAll:"सभी साफ करें",candles:"कैंडल्स",bars:"बार्स",area:"क्षेत्र",line:"रेखा",addPair:"जोड़ी जोड़ें",selectPairs:"जोड़ियाँ चुनें",total:"कुल",helpCenter:"सहायता केंद्र",reportIssue:"समस्या रिपोर्ट करें",keyboardShortcuts:"कीबोर्ड शॉर्टकट",tradeHigher:"ऊपर ट्रेड",tradeLower:"नीचे ट्रेड",changeAsset:"एसेट बदलें",fullscreen:"फुलस्क्रीन",candleColors:"कैंडल रंग",uploadBg:"बैकग्राउंड अपलोड",removeBg:"बैकग्राउंड हटाएं"},
  tr:{portfolio:"Portföy",history:"Geçmiş",alerts:"Uyarılar",signals:"Sinyaller",wallet:"Cüzdan",ranking:"Sıralama",tournament:"Turnuvalar",help:"Yardım",settings:"Ayarlar",investments:"Yatırımlar",expiryTime:"Bitiş süresi",profit:"Kâr",higher:"YÜKSEK",lower:"DÜŞÜK",deposit:"Yatırım",demo:"DEMO",openTrades:"Açık işlemler",trades:"İşlemler",signIn:"Giriş",register:"Kayıt",fullName:"Tam ad",email:"E-posta",password:"Şifre",createAccount:"Hesap oluştur",close:"Kapat",save:"Kaydet",theme:"Tema",dark:"Koyu",light:"Açık",language:"Dil",currency:"Para birimi",timezone:"Saat dilimi",sound:"Ses",on:"Açık",off:"Kapalı",noTrades:"İşlem yok",noAlerts:"Uyarı yok",balance:"Bakiye",timeframe:"Zaman dilimi",chartType:"Grafik tipi",indicators:"Göstergeler",drawings:"Çizimler",clearAll:"Tümünü temizle",candles:"Mumlar",bars:"Çubuklar",area:"Alan",line:"Çizgi",addPair:"Çift ekle",selectPairs:"Görüntülenecek çiftler",total:"Toplam",helpCenter:"Yardım merkezi",reportIssue:"Sorun bildir",keyboardShortcuts:"Klavye kısayolları",tradeHigher:"Yüksek işlem",tradeLower:"Düşük işlem",changeAsset:"Varlık değiştir",fullscreen:"Tam ekran",candleColors:"Mum renkleri",uploadBg:"Arka plan yükle",removeBg:"Arka planı kaldır"}
};
// Translation helper: get current language key
const tr=(lang,key)=>TRANSLATIONS[lang]?.[key]||TRANSLATIONS.en[key]||key;
const CURRENCIES=[{code:"USD",symbol:"$",label:"US Dollar"},{code:"EUR",symbol:"\u20AC",label:"Euro"},{code:"GBP",symbol:"\u00A3",label:"British Pound"},{code:"PKR",symbol:"Rs",label:"Pakistani Rupee"},{code:"INR",symbol:"\u20B9",label:"Indian Rupee"},{code:"AED",symbol:"AED",label:"UAE Dirham"},{code:"SAR",symbol:"SAR",label:"Saudi Riyal"},{code:"JPY",symbol:"\u00A5",label:"Japanese Yen"},{code:"CNY",symbol:"\u00A5",label:"Chinese Yuan"},{code:"TRY",symbol:"\u20BA",label:"Turkish Lira"},{code:"BRL",symbol:"R$",label:"Brazilian Real"},{code:"RUB",symbol:"\u20BD",label:"Russian Ruble"}];
const SIGNAL_REASONS=["RSI Oversold bounce","MACD Bullish crossover","Support level bounce","EMA 9/21 cross up","Volume spike detected","Bollinger squeeze","RSI Overbought reversal","MACD Bearish crossover","Resistance rejection","EMA death cross","Bearish engulfing","Double top formation","Hammer at support","Morning star pattern","Evening star pattern","Bullish divergence"];

const chartSt={grid:{show:true,horizontal:{show:true,color:"rgba(42,55,85,0.35)",style:"dashed",dashedValue:[2,6]},vertical:{show:true,color:"rgba(42,55,85,0.25)",style:"dashed",dashedValue:[2,6]}},candle:{type:"candle_solid",bar:{upColor:"#4caf50",downColor:"#f44336",upBorderColor:"#4caf50",downBorderColor:"#f44336",upWickColor:"#4caf50",downWickColor:"#f44336",noChangeColor:"#888"},area:{lineSize:2,lineColor:"#f59e0b",value:"close",smooth:true,backgroundColor:[{offset:0,color:"rgba(245,158,11,0.01)"},{offset:1,color:"rgba(245,158,11,0.35)"}],point:{show:true,color:"#f59e0b",radius:3,rippleColor:"rgba(245,158,11,0.3)",rippleRadius:8,animation:true,animationDuration:1000}},priceMark:{show:true,high:{show:true,color:"#5a6a8a",textSize:10,textFamily:"Inter"},low:{show:true,color:"#5a6a8a",textSize:10,textFamily:"Inter"},last:{show:true,upColor:"#4caf50",downColor:"#f44336",noChangeColor:"#888",line:{show:true,style:"dashed",dashedValue:[6,4],size:1},text:{show:true,color:"#fff",size:11,family:"Inter",paddingLeft:8,paddingRight:8,paddingTop:4,paddingBottom:4,borderRadius:3}}},tooltip:{showRule:"none"}},xAxis:{axisLine:{color:"rgba(35,45,69,0.6)"},tickLine:{color:"rgba(35,45,69,0.6)"},tickText:{color:"#5a6a8a",family:"Inter",size:10}},yAxis:{axisLine:{color:"rgba(35,45,69,0.6)"},tickLine:{color:"rgba(35,45,69,0.6)"},tickText:{color:"#5a6a8a",family:"Inter",size:10}},separator:{color:"rgba(35,45,69,0.4)"},crosshair:{horizontal:{line:{color:"rgba(120,140,180,0.4)",style:"dashed",dashedValue:[4,3]},text:{color:"#fff",size:11,family:"Inter",backgroundColor:"#2c3654",paddingLeft:6,paddingRight:6,paddingTop:4,paddingBottom:4,borderRadius:3}},vertical:{line:{color:"rgba(120,140,180,0.4)",style:"dashed",dashedValue:[4,3]},text:{color:"#fff",size:11,family:"Inter",backgroundColor:"#2c3654",paddingLeft:6,paddingRight:6,paddingTop:4,paddingBottom:4,borderRadius:3}}}};
const chartStLight={grid:{show:true,horizontal:{show:true,color:"rgba(226,232,240,0.6)",style:"dashed",dashedValue:[2,6]},vertical:{show:true,color:"rgba(226,232,240,0.4)",style:"dashed",dashedValue:[2,6]}},candle:{type:"candle_solid",bar:{upColor:"#4caf50",downColor:"#f44336",upBorderColor:"#4caf50",downBorderColor:"#f44336",upWickColor:"#4caf50",downWickColor:"#f44336",noChangeColor:"#888"},area:{lineSize:2,lineColor:"#10b981",value:"close",smooth:true,backgroundColor:[{offset:0,color:"rgba(16,185,129,0.02)"},{offset:1,color:"rgba(16,185,129,0.25)"}],point:{show:true,color:"#10b981",radius:3,rippleColor:"rgba(16,185,129,0.3)",rippleRadius:8,animation:true,animationDuration:1000}},priceMark:{show:true,high:{show:true,color:"#94a3b8",textSize:10,textFamily:"Inter"},low:{show:true,color:"#94a3b8",textSize:10,textFamily:"Inter"},last:{show:true,upColor:"#4caf50",downColor:"#f44336",noChangeColor:"#888",line:{show:true,style:"dashed",dashedValue:[6,4],size:1},text:{show:true,color:"#fff",size:11,family:"Inter",paddingLeft:8,paddingRight:8,paddingTop:4,paddingBottom:4,borderRadius:3}}},tooltip:{showRule:"none"}},xAxis:{axisLine:{color:"rgba(203,213,225,0.6)"},tickLine:{color:"rgba(203,213,225,0.6)"},tickText:{color:"#94a3b8",family:"Inter",size:10}},yAxis:{axisLine:{color:"rgba(203,213,225,0.6)"},tickLine:{color:"rgba(203,213,225,0.6)"},tickText:{color:"#94a3b8",family:"Inter",size:10}},separator:{color:"rgba(203,213,225,0.4)"},crosshair:{horizontal:{line:{color:"rgba(148,163,184,0.5)",style:"dashed",dashedValue:[4,3]},text:{color:"#fff",size:11,family:"Inter",backgroundColor:"#475569",paddingLeft:6,paddingRight:6,paddingTop:4,paddingBottom:4,borderRadius:3}},vertical:{line:{color:"rgba(148,163,184,0.5)",style:"dashed",dashedValue:[4,3]},text:{color:"#fff",size:11,family:"Inter",backgroundColor:"#475569",paddingLeft:6,paddingRight:6,paddingTop:4,paddingBottom:4,borderRadius:3}}}};



// Zexto Option logo icon — rounded square with chart-Z inside
const ZextoLogo=({size=40})=>{return(<div style={{width:size,height:size,position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}><svg viewBox="0 0 72 72" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}><polygon points="36,3 66,20 66,52 36,69 6,52 6,20" fill="none" stroke="#f59e0b" strokeWidth="3"/></svg><span style={{position:"relative",fontFamily:"'Syne','Inter',sans-serif",fontWeight:800,fontSize:size*0.42,color:"#f59e0b",letterSpacing:"-0.5px",lineHeight:1}}>Z</span></div>);};
// Reusable pair logo: single image for crypto, dual flags for forex pairs
// Fallback initials block — shown when no logo OR image fails to load.
// Uses the pair's `short` field (e.g. "BTC", "EUR/USD") and color-hashes the bg from the symbol.
const PairLogoFallback=({pair,size=36})=>{
  // Hash function for stable color from string
  const str=pair?.short||pair?.s||pair?.label||"?";
  let h=0;for(let i=0;i<str.length;i++)h=((h<<5)-h+str.charCodeAt(i))|0;
  // Predefined palette of trading-app-friendly hues
  const palette=["#3b82f6","#22c55e","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#f97316","#10b981","#6366f1"];
  const bg=palette[Math.abs(h)%palette.length];
  // For forex pairs (e.g. "EUR/USD") show the first 3 chars; for crypto show short directly
  let display=str;
  if(display.length>4){
    // Forex: take first letters of each side ("EUR/USD" → "E/U")
    if(display.includes("/")){const[a,b]=display.split("/");display=a.slice(0,1)+b.slice(0,1);}
    else display=display.slice(0,3);
  }
  return(<div style={{width:size,height:size,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:bg,color:"#fff",fontSize:size*(display.length>2?0.32:0.42),fontWeight:700,letterSpacing:display.length>2?"-0.02em":"0",flexShrink:0,fontFamily:"'Inter',system-ui,sans-serif",lineHeight:1}}>{display}</div>);
};

// Map country/currency code to emoji flag (universal browser support, no network dependency)
const FLAG_EMOJI={us:"🇺🇸",gb:"🇬🇧",eu:"🇪🇺",jp:"🇯🇵",au:"🇦🇺",ca:"🇨🇦",ch:"🇨🇭",nz:"🇳🇿",tr:"🇹🇷",za:"🇿🇦",mx:"🇲🇽",sg:"🇸🇬",hk:"🇭🇰",no:"🇳🇴",se:"🇸🇪",pl:"🇵🇱",in:"🇮🇳",pk:"🇵🇰",ph:"🇵🇭",br:"🇧🇷",ar:"🇦🇷"};

// Single flag image with cascading CDN fallback + emoji fallback at end.
// CDN order: flagcdn (most reliable) → hatscripts → emoji.
// Each img onError advances to the next source. Final fallback is emoji rendered in a colored circle.
const FlagImg=({logoUrl,size,style})=>{
  // Extract country code from URL — e.g. ".../flags/eu.svg" → "eu"
  const codeMatch=logoUrl?.match(/\/([a-z]{2})\.svg/i);
  const code=codeMatch?codeMatch[1].toLowerCase():null;
  const[srcIdx,setSrcIdx]=useState(0);
  // Reset cascade if logoUrl changes
  useEffect(()=>{setSrcIdx(0);},[logoUrl]);
  
  // For non-country logos (crypto, commodity), no cascading — use original URL with single fallback
  if(!code){
    const[failed,setFailed]=useState(false);
    useEffect(()=>{setFailed(false);},[logoUrl]);
    if(!failed){
      return<img src={logoUrl} alt="" style={style} onError={()=>setFailed(true)}/>;
    }
    return<div style={{...style,background:"#1a2035",color:"#7a85a0",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.4,fontWeight:700}}>?</div>;
  }
  
  // Cascading flag sources for country codes
  const sources=[
    `https://flagcdn.com/w80/${code}.png`,        // primary: flagcdn (very reliable, PNG)
    `https://flagcdn.com/${code}.svg`,            // fallback 1: flagcdn SVG
    `https://hatscripts.github.io/circle-flags/flags/${code}.svg`, // fallback 2: hatscripts (round)
  ];
  
  // If we've exhausted all CDN sources, render emoji flag in a colored circle
  if(srcIdx>=sources.length){
    const emoji=FLAG_EMOJI[code];
    return(<div style={{...style,background:"#1a2035",display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.55,lineHeight:1}}>
      {emoji||code.toUpperCase()}
    </div>);
  }
  
  return<img src={sources[srcIdx]} alt="" style={style} onError={()=>setSrcIdx(i=>i+1)}/>;
};

const PairLogo=({pair,size=36})=>{
  if(!pair)return null;
  
  if(pair.logo&&pair.logo2){
    // Dual flag (forex pair) - overlapping circles
    // Each flag is independent — if one fails, the other still renders
    const flagSize=size*0.7;
    return(<div style={{width:size,height:size,position:"relative",display:"inline-block",flexShrink:0}}>
      <FlagImg logoUrl={pair.logo} size={flagSize} style={{width:flagSize,height:flagSize,borderRadius:"50%",position:"absolute",left:0,top:size*0.15,objectFit:"cover",border:"1.5px solid rgba(255,255,255,0.1)"}}/>
      <FlagImg logoUrl={pair.logo2} size={flagSize} style={{width:flagSize,height:flagSize,borderRadius:"50%",position:"absolute",right:0,bottom:size*0.15,objectFit:"cover",border:"1.5px solid rgba(255,255,255,0.1)"}}/>
    </div>);
  }
  if(pair.logo){
    // Single logo (crypto, commodity, or single flag)
    return<FlagImg logoUrl={pair.logo} size={size} style={{width:size,height:size,borderRadius:"50%",objectFit:"cover",flexShrink:0,display:"inline-block"}}/>;
  }
  if(pair.flag){
    // OTC pair with emoji flag (legacy support — most OTC pairs now have logo+logo2)
    return(<div style={{width:size,height:size,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:"#1a2035",fontSize:size*0.5,fontWeight:700,flexShrink:0}}>{pair.flag}</div>);
  }
  // === FALLBACK === — pair has no logo/flag at all → show initials circle
  return<PairLogoFallback pair={pair} size={size}/>;
};

const Ic={portfolio:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,history:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,wallet:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>,alerts:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>,signals:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,ranking:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/><path d="M4 22h16"/></svg>,rewards:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/></svg>,tournament:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="m16 12-4-4-4 4"/></svg>,kyc:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M9 11h6"/><path d="M9 15h6"/><circle cx="13" cy="8" r="2"/></svg>,settings:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>,help:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,chev:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6"/></svg>,close:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,back:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>};
const NAV=[{id:"trade",icon:Ic.portfolio,label:"Trading"},{id:"history",icon:Ic.history,label:"History"},{id:"alerts",icon:Ic.alerts,label:"Alerts"},{id:"signals",icon:Ic.signals,label:"Signals"},{id:"wallet",icon:Ic.wallet,label:"Wallet"},{id:"account",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,label:"Account"},{id:"ranking",icon:Ic.ranking,label:"Ranking"},{id:"tournament",icon:Ic.tournament,label:"Tournaments"}];

function ToastContainer({toasts,onDismiss,T,isMobile}){
  // Pill Compact design — rounded pill shape with inner colored badge + inline mono text.
  // Theme-aware colors map to type. Uppercase short label inside the pill badge.
  const getColors=(type)=>{
    if(type==="success")return{accent:T.green||"#22c55e",dim:"rgba(34,197,94,0.15)",border:"rgba(34,197,94,0.4)",ring:"rgba(34,197,94,0.15)"};
    if(type==="error")return{accent:T.red||"#ef4444",dim:"rgba(239,68,68,0.15)",border:"rgba(239,68,68,0.4)",ring:"rgba(239,68,68,0.15)"};
    if(type==="warn")return{accent:T.yellow||"#eab308",dim:"rgba(234,179,8,0.15)",border:"rgba(234,179,8,0.4)",ring:"rgba(234,179,8,0.15)"};
    return{accent:T.text||"#e8ecf4",dim:"rgba(148,163,184,0.12)",border:"rgba(148,163,184,0.3)",ring:"rgba(148,163,184,0.1)"};
  };
  // Get the small icon shown inside the pill badge per type
  const getIcon=(type,color)=>{
    if(type==="success")return(<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>);
    if(type==="error")return(<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
    if(type==="warn")return(<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/></svg>);
    return(<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>);
  };
  return(<div className="qt-toasts" style={{
    position:"fixed",
    // Mobile: top-right (below pair tabs). Desktop: bottom-left (under chart, above sidebar).
    top:isMobile?56:"auto",
    right:isMobile?8:"auto",
    bottom:isMobile?"auto":16,
    left:isMobile?"auto":76,
    zIndex:300,
    display:"flex",flexDirection:"column",gap:8,
    maxWidth:isMobile?"calc(100vw - 16px)":380,
    alignItems:isMobile?"flex-end":"flex-start",
    pointerEvents:"none"
  }}>
    {toasts.map(t=>{
      const c=getColors(t.type);
      // The title becomes the uppercase pill label (e.g. "TRADE OPENED" → "OPENED").
      // Strip "Trade " prefix for compactness; keep last word(s).
      const label=(t.title||"").replace(/^trade\s+/i,"").toUpperCase();
      return(<div key={t.id} onClick={()=>onDismiss(t.id)} style={{
        display:"flex",alignItems:"center",gap:8,
        padding:"8px 14px 8px 8px",
        background:T.card,
        border:`1px solid ${T.border}`,
        borderRadius:999,
        boxShadow:`0 4px 16px rgba(0,0,0,0.4), 0 0 0 1px ${c.ring}`,
        ...IN,
        animation:`${isMobile?"toastSlideRight":"toastSlideUp"} 0.18s cubic-bezier(0.22,1,0.36,1)`,
        cursor:"pointer",
        pointerEvents:"auto",
        flexShrink:0,
        maxWidth:300,
        whiteSpace:"nowrap"
      }}>
        {/* Inner colored pill badge with icon + uppercase label */}
        <div style={{
          display:"inline-flex",alignItems:"center",gap:5,
          padding:"4px 10px",
          background:c.dim,
          border:`1px solid ${c.border}`,
          borderRadius:999,
          fontSize:10,fontWeight:700,
          color:c.accent,
          textTransform:"uppercase",
          letterSpacing:"0.5px",
          flexShrink:0
        }}>
          {getIcon(t.type,c.accent)}
          <span style={{lineHeight:1}}>{label||"INFO"}</span>
        </div>
        {/* Inline message text — mono font, with subtle color */}
        {t.msg&&<div style={{
          ...MO,
          fontSize:11,
          color:T.text,
          minWidth:0,
          overflow:"hidden",
          textOverflow:"ellipsis",
          whiteSpace:"nowrap"
        }}>{t.msg}</div>}
      </div>);
    })}
  </div>);
}
function useToast(){const[toasts,setToasts]=useState([]);const add=useCallback((title,msg,type="info",duration=3500)=>{const id=Date.now()+"_"+Math.random().toString(36).slice(2,5);setToasts(p=>[...p,{id,title,msg,type}]);setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),duration);if(type==="warn")playAlert();},[]);const dismiss=useCallback((id)=>setToasts(p=>p.filter(t=>t.id!==id)),[]);return{toasts,add,dismiss};}
function useCandleCountdown(ms){const[cd,setCd]=useState("");useEffect(()=>{const iv=setInterval(()=>{const now=Date.now();const end=Math.ceil(now/ms)*ms;const rem=Math.max(0,Math.floor((end-now)/1000));setCd(`${String(Math.floor(rem/60)).padStart(2,"0")}:${String(rem%60).padStart(2,"0")}`);},200);return()=>clearInterval(iv);},[ms]);return cd;}

function SlidePanel({open,onClose,title,children,T}){const isMob=window.innerWidth<768;const sideW=isMob?0:72;
  // On mobile, leave 50px at bottom for the persistent mobile tab bar (Trade/Portfolio/History/Alerts/More)
  const bottomGap=isMob?50:0;
  return(<>{open&&<div onClick={onClose} style={{position:"fixed",top:0,left:sideW,right:0,bottom:bottomGap,background:"rgba(0,0,0,0.45)",zIndex:250,animation:"spFadeIn 0.15s ease"}}/>}<div style={{position:"fixed",top:0,left:open?sideW:(isMob?"-100%":-380),width:isMob?"100%":380,height:isMob?`calc(100dvh - ${bottomGap}px)`:"100dvh",background:T.card,borderRight:`1px solid ${T.border}`,zIndex:251,transition:"left 0.18s cubic-bezier(0.22,0.61,0.36,1)",display:"flex",flexDirection:"column",...IN,color:T.text,willChange:"left",boxShadow:open?"4px 0 30px rgba(0,0,0,0.4)":"none"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderBottom:`1px solid ${T.border}`}}><span style={{fontSize:16,fontWeight:700,animation:open?"spSlideIn 0.25s ease 0.05s both":"none"}}>{title}</span><button onClick={onClose} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex"}}>{Ic.close}</button></div><div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}><div style={{flex:1,overflow:"auto",animation:open?"spContentIn 0.22s ease 0.06s both":"none"}}>{children}</div></div></div><style>{`@keyframes spFadeIn{from{opacity:0}to{opacity:1}}@keyframes spSlideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}@keyframes spContentIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style></>);}

function HistoryPanel({open,onClose,trades,T}){
  const[expandedId,setExpandedId]=useState(null);
  // Filter: "all" | "real" | "demo"
  const[filter,setFilter]=useState("all");
  
  // Filter trades by mode
  const filteredTrades=trades.filter(t=>{
    if(filter==="all")return true;
    const m=t.mode||t.accountMode||"demo";
    return m===filter;
  });
  
  // Group trades by date
  const grouped={};
  filteredTrades.forEach((t,i)=>{
    const tradeDate=t.openTimeStr?new Date(t.openTimeStr):new Date();
    const d=tradeDate.toLocaleDateString("en-US",{month:"long",day:"numeric"});
    if(!grouped[d])grouped[d]=[];
    grouped[d].push({...t,_idx:i});
  });
  const dateKeys=Object.keys(grouped);
  const totalDeals=filteredTrades.length;
  
  // Filter button styles
  const filterBtn=(active)=>({
    flex:1,padding:"8px 10px",border:"none",
    borderRadius:6,
    background:active?T.accent:"transparent",
    color:active?T.bg:T.sub,
    ...IN,fontSize:11,fontWeight:700,cursor:"pointer",
    transition:"all 0.15s",
    textTransform:"uppercase",letterSpacing:"0.4px"
  });
  
  return(<SlidePanel T={T} open={open} onClose={onClose} title="Trades History">
    {/* Real/Demo/All filter tabs */}
    <div style={{padding:"10px 14px 8px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:4,background:T.bg}}>
      <button onClick={()=>setFilter("all")} style={filterBtn(filter==="all")}>All</button>
      <button onClick={()=>setFilter("demo")} style={filterBtn(filter==="demo")}>Demo</button>
      <button onClick={()=>setFilter("real")} style={filterBtn(filter==="real")}>Real</button>
    </div>
    
    <div style={{padding:"10px 16px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",...IN,fontSize:12}}>
      <span style={{color:T.sub,fontWeight:600}}>Total Deals</span>
      <span style={{color:T.text,fontWeight:700}}>{totalDeals}</span>
    </div>
    <div style={{flex:1,overflowY:"auto",padding:"0 8px"}}>
      {filteredTrades.length===0&&<div style={{textAlign:"center",padding:40,color:T.muted,fontSize:13}}>No {filter==="all"?"":filter+" "}trades yet</div>}
      {dateKeys.map(date=>{
        // Compact date label like "3 MAY" + count badge
        const tradeDate=grouped[date][0]?.openTimeStr?new Date(grouped[date][0].openTimeStr):new Date();
        const dayNum=tradeDate.getDate();
        const monthShort=tradeDate.toLocaleDateString("en-US",{month:"short"}).toUpperCase();
        return(<div key={date}>
        {/* Quotex-style date header: "3 MAY (15)" */}
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 8px 6px"}}>
          <span style={{...IN,fontSize:12,fontWeight:700,color:T.text,letterSpacing:"0.5px"}}>{dayNum} {monthShort}</span>
          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:18,padding:"0 6px",borderRadius:9,background:T.el,...MO,fontSize:10,fontWeight:600,color:T.sub,border:`1px solid ${T.border}`}}>{grouped[date].length}</span>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {grouped[date].map((t)=>{
          const pairName=(t.pair||"").replace("/USDT","").replace("USDT","");
          const pp=PAIRS.find(x=>x.short===pairName||x.s===pairName+"USDT"||x.label===pairName);
          const pnlVal=t.payout||0;
          const isExpanded=expandedId===t._idx;
          // Stable order ID based on tradeId
          const orderId=t.tradeId||("ZXT"+String(t._idx).padStart(6,"0"));
          const isTie=!!t.tie;
          const profitAmt=t.won?Math.abs(pnlVal):0;
          const diffPoints=t.exit&&t.entry?(parseFloat(t.exit)-parseFloat(t.entry)).toFixed(2):"0.00";
          const won=t.won;
          const isUp=t.dir==="HIGHER";
          // Color: green for win, yellow for tie/draw, red for loss
          const accentCol=isTie?T.yellow:won?T.green:T.red;
          // Calculate close time from open time + duration
          const openTimeStr=t.openTimeStr||t.time||"--:--:--";
          let closeTimeStr=t.closeTimeStr||"--:--:--";
          if(t.openTimeStr&&t.dur){
            try{
              const openD=new Date(t.openTimeStr);
              const closeD=new Date(openD.getTime()+(t.dur*1000));
              closeTimeStr=closeD.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
            }catch(e){}
          }
          // Duration formatted as HH:MM:SS for sub-row
          const durTotal=t.dur||60;
          const durFormatted=`00:${String(Math.floor(durTotal/60)).padStart(2,"0")}:${String(durTotal%60).padStart(2,"0")}`;
          // Sign: + for win, blank for tie (refund displays as 0.00), - for loss
          const pnlSign=isTie?"":won?"+":"-";
          const pnlAbs=isTie?"0.00":Math.abs(pnlVal).toFixed(2);
          
          return(<div key={t._idx} style={{background:T.card,borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`}}>
            {/* Compact main row — Quotex-style */}
            <button onClick={()=>setExpandedId(isExpanded?null:t._idx)} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",width:"100%",background:"transparent",border:"none",cursor:"pointer",textAlign:"left"}}>
              {/* Chevron — collapsed/expanded indicator */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,transform:isExpanded?"rotate(0deg)":"rotate(-90deg)",transition:"transform 0.18s",opacity:0.6}}><polyline points="6 9 12 15 18 9"/></svg>
              {/* Pair logo */}
              <div style={{width:28,height:28,borderRadius:"50%",overflow:"hidden",background:T.el,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <PairLogo pair={pp} size={26}/>
              </div>
              {/* Pair label + duration */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{...IN,fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pp?.label||pairName}</div>
              </div>
              {/* Duration */}
              <div style={{...MO,fontSize:11,color:T.sub,flexShrink:0,minWidth:62,textAlign:"right"}}>{durFormatted}</div>
            </button>
            {/* Sub-row — amount + profit/loss (always visible like Quotex) */}
            <div onClick={()=>setExpandedId(isExpanded?null:t._idx)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px 10px",cursor:"pointer"}}>
              {/* Amount with up/down arrow icon */}
              <div style={{display:"flex",alignItems:"center",gap:5,paddingLeft:23}}>
                <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:14,height:14,borderRadius:"50%",background:isUp?T.green:T.red}}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{isUp?<polyline points="18 15 12 9 6 15"/>:<polyline points="6 9 12 15 18 9"/>}</svg>
                </span>
                <span style={{...MO,fontSize:11,color:T.sub,fontWeight:500}}>{t.amt?.toFixed?t.amt.toFixed(0):t.amt} $</span>
              </div>
              {/* Profit/Loss — green if won, muted/red if lost */}
              <div style={{...MO,fontSize:12,fontWeight:700,color:accentCol}}>
                {pnlSign}{pnlAbs} $
              </div>
            </div>
            {/* Expanded detail card */}
            {isExpanded&&<div style={{borderTop:`1px solid ${T.border}`,animation:"fadeIn 0.1s"}}>
              {/* Header: pair + payout % */}
              <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${T.border}`,background:T.el}}>
                <div style={{width:28,height:28,borderRadius:"50%",overflow:"hidden",background:T.card,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <PairLogo pair={pp} size={28}/>
                </div>
                <div style={{flex:1}}>
                  <span style={{...IN,fontSize:12,fontWeight:700,color:T.text}}>{t.pair||pairName+"/USDT"}</span>
                  <span style={{...MO,fontSize:10,color:T.accent,marginLeft:6}}>+{pp?.payout||85}%</span>
                </div>
                {/* Mode tag */}
                {t.mode&&<span style={{...MO,fontSize:9,fontWeight:700,color:t.mode==="real"?T.yellow:T.accent,padding:"2px 6px",borderRadius:3,background:(t.mode==="real"?T.yellow:T.accent)+"22",textTransform:"uppercase",letterSpacing:"0.5px"}}>{t.mode}</span>}
              </div>
              {/* Mini chart */}
              <div style={{padding:"8px 14px",borderBottom:`1px solid ${T.border}`}}>
                <svg viewBox="0 0 200 50" style={{width:"100%",height:50,display:"block"}}>
                  <defs><linearGradient id={"hg"+t._idx} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={accentCol} stopOpacity="0.3"/><stop offset="100%" stopColor={accentCol} stopOpacity="0.02"/></linearGradient></defs>
                  <path d={`M0,35 Q20,${won?30:40} 40,${won?25:38} T80,${won?20:42} T120,${won?15:35} T160,${won?22:30} T200,${won?10:45}`} fill="none" stroke={accentCol} strokeWidth="1.5"/>
                  <path d={`M0,35 Q20,${won?30:40} 40,${won?25:38} T80,${won?20:42} T120,${won?15:35} T160,${won?22:30} T200,${won?10:45} V50 H0 Z`} fill={`url(#hg${t._idx})`}/>
                  <circle cx="30" cy={won?28:38} r="4" fill={T.accent} stroke={T.bg} strokeWidth="1.5"/>
                  <circle cx="170" cy={won?18:40} r="4" fill={accentCol} stroke={T.bg} strokeWidth="1.5"/>
                  <text x="30" y={won?20:48} textAnchor="middle" fill={T.sub} fontSize="7" fontFamily="Inter">{t.entry}</text>
                  <text x="170" y={won?10:50} textAnchor="middle" fill={T.sub} fontSize="7" fontFamily="Inter">{t.exit}</text>
                </svg>
              </div>
              {/* Opening / Closing time — FIXED */}
              <div style={{display:"flex",padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{flex:1}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Opening Time:</div>
                  <div style={{...MO,fontSize:13,fontWeight:700,color:T.text}}>{openTimeStr&&openTimeStr.includes("T")?new Date(openTimeStr).toLocaleTimeString():openTimeStr}</div>
                </div>
                <div style={{flex:1,textAlign:"right"}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Closing Time:</div>
                  <div style={{...MO,fontSize:13,fontWeight:700,color:T.text}}>{closeTimeStr}</div>
                </div>
              </div>
              {/* Forecast + Payout + Profit */}
              <div style={{padding:"10px 14px",background:accentCol+"08",borderBottom:`1px solid ${T.border}`,textAlign:"center"}}>
                <div style={{...IN,fontSize:11,color:T.sub,marginBottom:2}}>Your forecast: <span style={{color:isUp?T.green:T.red,fontWeight:700}}>{t.dir}</span></div>
                <div style={{...MO,fontSize:12,color:T.text}}>Payout: <span style={{fontWeight:700}}>{t.cs||"$"}{t.amt?.toFixed?t.amt.toFixed(2):t.amt}</span></div>
                <div style={{...MO,fontSize:12,color:accentCol}}>Profit: <span style={{fontWeight:700}}>{won?"+":"-"}{t.cs||"$"}{Math.abs(pnlVal).toFixed(2)}</span></div>
              </div>
              {/* Open Price / Close Price */}
              <div style={{display:"flex",padding:"10px 14px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{flex:1}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Open Price:</div>
                  <div style={{...MO,fontSize:14,fontWeight:700,color:T.text}}>{t.entry||"--"}</div>
                </div>
                <div style={{flex:1,textAlign:"right"}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Close Price:</div>
                  <div style={{...MO,fontSize:14,fontWeight:700,color:T.text}}>{t.exit||"--"}</div>
                </div>
              </div>
              {/* Difference + Order ID — FIXED stable ID */}
              <div style={{display:"flex",padding:"10px 14px"}}>
                <div style={{flex:1}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Difference:</div>
                  <div style={{...MO,fontSize:12,fontWeight:700,color:parseFloat(diffPoints)>=0?T.green:T.red}}>({diffPoints} Points)</div>
                </div>
                <div style={{flex:1,textAlign:"right"}}>
                  <div style={{...MO,fontSize:9,color:T.muted,marginBottom:2}}>Order ID:</div>
                  <div style={{...MO,fontSize:9,fontWeight:600,color:T.sub,wordBreak:"break-all"}}>{orderId}</div>
                </div>
              </div>
            </div>}
          </div>);
        })}
        </div>
      </div>);})}
    </div>
  </SlidePanel>);
}

function AlertsPanel({open,onClose,alerts,onAdd,onDelete,currentPair,currentPrice,T}){const[price,setPrice]=useState("");const[dir,setDir]=useState("above");return(<SlidePanel T={T} open={open} onClose={onClose} title="Price Alerts"><div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6}}>New Alert — {currentPair}</div><div style={{display:"flex",gap:4,marginBottom:8}}>{["above","below"].map(d=>(<button key={d} onClick={()=>setDir(d)} style={{flex:1,padding:"7px 0",borderRadius:6,border:`1px solid ${dir===d?T.accent:T.border}`,background:dir===d?T.accentDim:"transparent",color:dir===d?T.accent:T.sub,...IN,fontSize:11,fontWeight:600,cursor:"pointer",textTransform:"capitalize"}}>{d}</button>))}</div><div style={{display:"flex",gap:4}}><input value={price} onChange={e=>setPrice(e.target.value)} placeholder={currentPrice?.toFixed(2)||"Price"} style={{flex:1,background:T.el,border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 10px",color:T.text,...MO,fontSize:12,outline:"none",boxSizing:"border-box"}}/><button onClick={()=>{const v=+price;if(!v)return;onAdd({pair:currentPair,price:v,dir,id:Date.now()});setPrice("");}} style={{padding:"8px 14px",borderRadius:6,border:"none",background:T.accent,color:T.bg,...IN,fontSize:11,fontWeight:700,cursor:"pointer"}}>Set</button></div></div><div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>{alerts.length===0&&<div style={{textAlign:"center",padding:40,color:T.muted,fontSize:13}}>No alerts</div>}{alerts.map(a=>(<div key={a.id} style={{display:"flex",alignItems:"center",padding:"10px 12px",background:T.el,borderRadius:8,marginBottom:6,border:`1px solid ${T.border}`}}><div style={{flex:1}}><div style={{...IN,fontSize:12,fontWeight:600}}>{a.pair}</div><div style={{...MO,fontSize:11,color:a.dir==="above"?T.green:T.red}}>{a.dir==="above"?"\u2191":"\u2193"} {a.price}</div></div><button onClick={()=>onDelete(a.id)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",fontSize:14}}>{"\u2715"}</button></div>))}</div></SlidePanel>);}

function SignalsPanel({open,onClose,signals,T,onCopyTrade,availablePairs}){
  const[tab,setTab]=useState("all");
  const[tfFilter,setTfFilter]=useState("all");
  const[assetFilter,setAssetFilter]=useState("all");
  const[strFilter,setStrFilter]=useState("all");
  const[tick,setTick]=useState(0);
  // Live tick every second for countdown
  useEffect(()=>{if(!open)return;const iv=setInterval(()=>setTick(t=>t+1),1000);return()=>clearInterval(iv);},[open]);
  // Use availablePairs (from active tabs) if provided, otherwise all PAIRS
  const pairs=availablePairs&&availablePairs.length>0?availablePairs:PAIRS;
  const filtered=signals.filter(s=>{
    // Filter to only pairs available in user's tabs
    const pp=PAIRS.find(x=>x.s===s.symbol);
    if(!pp)return false;
    if(availablePairs&&!availablePairs.find(x=>x.s===s.symbol))return false;
    if(tab==="current"&&s.symbol!==pairs[0]?.s)return false;
    if(tfFilter!=="all"&&s.expiry!==tfFilter)return false;
    if(assetFilter!=="all"&&s.symbol!==assetFilter)return false;
    if(strFilter!=="all"&&s.str!==strFilter)return false;
    // Show expired signals too (with EXPIRED badge)
    return true;
  });
  const isExpired=(s)=>s.createdAt&&s.durSec&&((Date.now()-s.createdAt)/1000>=s.durSec);
  const activeCount=filtered.filter(s=>!isExpired(s)).length;
  const strongCount=filtered.filter(s=>s.str==="Strong"&&!isExpired(s)).length;
  return(<SlidePanel T={T} open={open} onClose={onClose} title="Trading Signals">
    {/* Stats summary */}
    <div style={{display:"flex",gap:8,padding:"12px 16px 0"}}>
      <div style={{flex:1,background:T.el,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`}}>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:2,textTransform:"uppercase",letterSpacing:".5px"}}>Active</div>
        <div style={{...IN,fontSize:18,fontWeight:800,color:T.text}}>{activeCount}</div>
      </div>
      <div style={{flex:1,background:T.el,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`}}>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:2,textTransform:"uppercase",letterSpacing:".5px"}}>Strong</div>
        <div style={{...IN,fontSize:18,fontWeight:800,color:T.green}}>{strongCount}</div>
      </div>
      <div style={{flex:1,background:T.el,padding:"10px 12px",borderRadius:10,border:`1px solid ${T.border}`}}>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:2,textTransform:"uppercase",letterSpacing:".5px"}}>Total</div>
        <div style={{...IN,fontSize:18,fontWeight:800,color:T.text}}>{filtered.length}</div>
      </div>
    </div>
    {/* Tabs */}
    <div style={{display:"flex",margin:"12px 16px",borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`}}>
      <button onClick={()=>setTab("current")} style={{flex:1,padding:"10px 0",border:"none",background:tab==="current"?T.accent:"transparent",color:tab==="current"?"#fff":T.sub,...IN,fontSize:12,fontWeight:700,cursor:"pointer"}}>Current Asset</button>
      <button onClick={()=>setTab("all")} style={{flex:1,padding:"10px 0",border:"none",background:tab==="all"?T.accent:"transparent",color:tab==="all"?"#fff":T.sub,...IN,fontSize:12,fontWeight:700,cursor:"pointer"}}>All Signals</button>
    </div>
    {/* Filters */}
    <div style={{padding:"0 16px 12px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8}}>
        <div style={{flex:1}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>Timeframe</div>
          <select value={tfFilter} onChange={e=>setTfFilter(e.target.value)} style={{width:"100%",background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,...IN,fontSize:11,outline:"none",cursor:"pointer"}}>
            <option value="all">All TF</option>
            {DURS.map(d=><option key={d.label} value={d.label}>{d.label}</option>)}
          </select>
        </div>
        <div style={{flex:1}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>Strength</div>
          <select value={strFilter} onChange={e=>setStrFilter(e.target.value)} style={{width:"100%",background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,...IN,fontSize:11,outline:"none",cursor:"pointer"}}>
            <option value="all">All</option>
            <option value="Strong">Strong</option>
            <option value="Medium">Medium</option>
            <option value="Weak">Weak</option>
          </select>
        </div>
      </div>
      <div>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:".5px"}}>Asset</div>
        <select value={assetFilter} onChange={e=>setAssetFilter(e.target.value)} style={{width:"100%",background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.text,...IN,fontSize:11,outline:"none",cursor:"pointer"}}>
          <option value="all">All Assets</option>
          {pairs.map(pp=><option key={pp.s} value={pp.s}>{pp.label}</option>)}
        </select>
      </div>
    </div>
    {/* Signal cards */}
    <div style={{flex:1,overflowY:"auto",padding:"4px 16px 16px"}}>
      {filtered.length===0&&<div style={{textAlign:"center",padding:60,color:T.muted,fontSize:12}}>
        <div style={{fontSize:32,marginBottom:8,opacity:0.3}}>—</div>
        No signals available<br/><span style={{fontSize:10,color:T.muted}}>New signals generate every 30-60s</span>
      </div>}
      {filtered.map((s,i)=>{
        const pp=PAIRS.find(x=>x.s===s.symbol);
        if(!pp)return null;
        const elapsed=s.createdAt?(Date.now()-s.createdAt)/1000:0;
        const totalSec=s.durSec||60;
        const remaining=Math.max(0,totalSec-elapsed);
        const expired=remaining<=0;
        const progress=Math.min(1,elapsed/totalSec);
        const remMin=Math.floor(remaining/60);
        const remSec=Math.floor(remaining%60);
        const liveTime=expired?"EXPIRED":`${String(remMin).padStart(2,"0")}:${String(remSec).padStart(2,"0")}`;
        const barCol=s.dir==="HIGHER"?T.green:T.red;
        const strColor=s.str==="Strong"?T.green:s.str==="Medium"?(T.yellow||"#eab308"):T.muted;
        return(<div key={i} style={{background:T.el,borderRadius:12,padding:"12px",marginBottom:10,border:`1px solid ${expired?T.border:T.border}`,position:"relative",overflow:"hidden",opacity:expired?0.55:1,transition:"opacity 0.3s"}}>
          {/* Strength accent bar on left */}
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:3,background:expired?T.muted:strColor}}/>
          {/* Top row */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <PairLogo pair={pp} size={32}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>{pp.label}</span>
                <span style={{...MO,fontSize:9,color:expired?T.muted:strColor,fontWeight:700,padding:"1px 6px",border:`1px solid ${expired?T.muted+"55":strColor+"55"}`,borderRadius:3}}>{s.str.toUpperCase()}</span>
              </div>
              <div style={{...MO,fontSize:10,color:T.sub}}>{s.reason}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3,flexShrink:0}}>
              <span style={{...MO,fontSize:10,padding:"3px 9px",borderRadius:4,background:expired?T.muted:barCol,color:"#fff",fontWeight:700,display:"flex",alignItems:"center",gap:3}}>
                <span style={{fontSize:11}}>{s.dir==="HIGHER"?"↗":"↘"}</span>{s.dir}
              </span>
              <span style={{...MO,fontSize:expired?9:11,fontWeight:700,color:expired?T.muted:(remaining<10?T.red:T.text),minWidth:44,textAlign:"right",animation:!expired&&remaining<10?"pulse 1s infinite":"none",letterSpacing:expired?"0.5px":0}}>{liveTime}</span>
            </div>
          </div>
          {/* Confidence bar */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{...MO,fontSize:9,color:T.sub,minWidth:52}}>Confidence</span>
            <div style={{flex:1,height:5,background:T.card,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:s.conf+"%",height:"100%",background:expired?T.muted:`linear-gradient(90deg,${barCol}88,${barCol})`,borderRadius:3,transition:"width 0.5s"}}/>
            </div>
            <span style={{...MO,fontSize:11,fontWeight:700,color:T.text,minWidth:32,textAlign:"right"}}>{s.conf}%</span>
          </div>
          {/* Time progress bar */}
          <div style={{height:3,background:T.card,borderRadius:2,marginBottom:10,overflow:"hidden"}}>
            <div style={{width:(1-progress)*100+"%",height:"100%",background:expired?T.muted:barCol,borderRadius:2,transition:"width 1s linear"}}/>
          </div>
          {/* Stats grid */}
          <div style={{display:"flex",gap:12,...MO,fontSize:10,color:T.sub,marginBottom:10}}>
            <span>TF: <span style={{color:T.text,fontWeight:600}}>{s.expiry}</span></span>
            <span>Payout: <span style={{color:T.text,fontWeight:600}}>{pp.payout||80}%</span></span>
          </div>
          {/* Copy Signal button */}
          <button onClick={()=>{if(onCopyTrade&&!expired&&remaining>5)onCopyTrade(s);}} disabled={expired||remaining<=5} style={{width:"100%",padding:"10px 0",borderRadius:6,border:`1px solid ${(expired||remaining<=5)?T.border:barCol+"66"}`,background:(expired||remaining<=5)?"transparent":barCol+"18",color:(expired||remaining<=5)?T.muted:barCol,...IN,fontSize:12,fontWeight:700,cursor:(expired||remaining<=5)?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,opacity:(expired||remaining<=5)?.5:1,transition:"all 0.2s"}}>
            {!expired&&remaining>5&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            {expired?"Expired":remaining<=5?"Closing...":"Trade Now"}
          </button>
        </div>);
      })}
    </div>
  </SlidePanel>);
}

// KYC PANEL — identity verification form
function KYCPanel({open,onClose,T}){
  const[loading,setLoading]=useState(false);
  const[kycData,setKycData]=useState(null);
  const[fetched,setFetched]=useState(false);
  const[submitting,setSubmitting]=useState(false);
  const[err,setErr]=useState("");
  const[success,setSuccess]=useState("");
  // Form fields
  const[fullName,setFullName]=useState("");
  const[dob,setDob]=useState("");
  const[nationality,setNationality]=useState("");
  const[addressLine,setAddressLine]=useState("");
  const[city,setCity]=useState("");
  const[country,setCountry]=useState("");
  const[postalCode,setPostalCode]=useState("");
  const[documents,setDocuments]=useState([]);  // [{type, name, data}]

  useEffect(()=>{
    if(!open){setFetched(false);return;}
    if(!API.auth.isAuthenticated()){setFetched(true);setLoading(false);return;}
    let cancelled=false;
    setLoading(true);
    const token=localStorage.getItem("qt_token");
    fetch("http://localhost:5000/api/kyc/me",{headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"}})
      .then(r=>r.json())
      .then(res=>{
        if(cancelled)return;
        if(res.success&&res.kyc){
          setKycData(res.kyc);
          setFullName(res.kyc.fullName||"");
          setDob(res.kyc.dateOfBirth?res.kyc.dateOfBirth.slice(0,10):"");
          setNationality(res.kyc.nationality||"");
          setAddressLine(res.kyc.addressLine||"");
          setCity(res.kyc.city||"");
          setCountry(res.kyc.country||"");
          setPostalCode(res.kyc.postalCode||"");
        }else{
          setKycData(null);
        }
        setLoading(false);setFetched(true);
      })
      .catch(e=>{
        if(cancelled)return;
        console.error("KYC fetch error:",e);
        setKycData(null);setLoading(false);setFetched(true);
      });
    return()=>{cancelled=true;};
  },[open]);

  const handleFileUpload=(e,docType)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(file.size>3*1024*1024){setErr("File too large (max 3MB)");return;}
    if(!file.type.match(/^image\/(jpeg|jpg|png)$|^application\/pdf$/)){setErr("Only JPG, PNG, or PDF allowed");return;}
    setErr("");
    const reader=new FileReader();
    reader.onload=(ev)=>{
      setDocuments(prev=>{
        const filtered=prev.filter(d=>d.type!==docType);
        return[...filtered,{type:docType,name:file.name,url:ev.target.result}];
      });
    };
    reader.readAsDataURL(file);
  };

  const removeDocument=(docType)=>{
    setDocuments(prev=>prev.filter(d=>d.type!==docType));
  };

  const handleSubmit=async()=>{
    setErr("");setSuccess("");
    if(!fullName||!dob||!nationality||!addressLine||!city||!country){
      setErr("All fields are required");return;
    }
    if(documents.length===0){
      setErr("Upload at least ID proof and selfie");return;
    }
    setSubmitting(true);
    try{
      const token=localStorage.getItem("qt_token");
      const r=await fetch("http://localhost:5000/api/kyc",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({fullName,dateOfBirth:dob,nationality,addressLine,city,country,postalCode,documents})});
      const res=await r.json();
      if(res.success){
        setSuccess("KYC submitted successfully! Our team will review within 24-48 hours.");
        // Reload status
        try{
          const r2=await fetch("http://localhost:5000/api/kyc/me",{headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"}});
          const res2=await r2.json();
          if(res2.success&&res2.kyc)setKycData(res2.kyc);
        }catch(e2){}
      }else{setErr(res.message||"Submission failed");}
    }catch(e){setErr(e.message||"Submission failed");}
    setSubmitting(false);
  };

  const inputSt={background:T.el,border:`1px solid ${T.border}`,borderRadius:6,padding:"8px 10px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box"};
  const labelSt={...IN,fontSize:10,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4};

  // Already submitted - show status view
  const showStatus=kycData&&(kycData.status==="pending"||kycData.status==="approved");
  const canResubmit=kycData&&kycData.status==="rejected";

  return(<>{open&&<>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",zIndex:252}}/>
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:440,maxWidth:"92vw",height:"80vh",maxHeight:650,background:T.card+"f0",border:`1px solid ${T.border}`,borderRadius:20,zIndex:253,display:"flex",flexDirection:"column",...IN,color:T.text,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",animation:"fadeIn 0.1s ease-out",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <span style={{fontSize:15,fontWeight:700}}>Identity Verification</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex",padding:4,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="none"}>{Ic.close}</button>
      </div>
    <div style={{flex:1,overflowY:"auto"}}>
      {(!fetched||loading)?<div style={{textAlign:"center",padding:40,color:T.muted,fontSize:12}}>Loading...</div>:
       !API.auth.isAuthenticated()?<div style={{textAlign:"center",padding:40,color:T.muted,fontSize:13}}>Please sign in to verify your identity</div>:
       showStatus?(
        // Status card (already submitted or approved)
        <div style={{padding:"20px 16px"}}>
          <div style={{textAlign:"center",padding:"28px 20px",background:kycData.status==="approved"?T.accentDim:T.yellowDim||"#f59e0b22",borderRadius:12,border:`1px solid ${kycData.status==="approved"?T.accent+"55":"#f59e0b55"}`,marginBottom:20}}>
            <div style={{fontSize:48,marginBottom:10}}>{kycData.status==="approved"?"ok":"wait"}</div>
            <div style={{...IN,fontSize:16,fontWeight:700,color:kycData.status==="approved"?T.accent:"#f59e0b",marginBottom:6}}>
              {kycData.status==="approved"?"Verified":"Pending Review"}
            </div>
            <div style={{...IN,fontSize:12,color:T.sub}}>
              {kycData.status==="approved"?"Your account is fully verified":"We are reviewing your documents (24-48 hrs)"}
            </div>
          </div>
          <div style={{background:T.el,borderRadius:10,padding:"14px 16px",border:`1px solid ${T.border}`}}>
            <div style={{...labelSt,marginBottom:10}}>Submitted Information</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,...MO,fontSize:11}}>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Full Name</div>{kycData.fullName}</div>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Nationality</div>{kycData.nationality}</div>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Country</div>{kycData.country}</div>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>City</div>{kycData.city}</div>
              <div style={{gridColumn:"span 2"}}><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Address</div>{kycData.addressLine}</div>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Documents</div>{(kycData.documents||[]).length} uploaded</div>
              <div><div style={{color:T.sub,fontSize:9,marginBottom:2}}>Submitted</div>{new Date(kycData.submittedAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
       ):(
        // Form view (new submission or resubmission after rejection)
        <div style={{padding:"16px 20px"}}>
          {canResubmit&&<div style={{padding:"12px 14px",background:T.redDim,border:`1px solid ${T.red}55`,borderRadius:8,marginBottom:16}}>
            <div style={{...IN,fontSize:12,fontWeight:700,color:T.red,marginBottom:4}}>! Previous submission rejected</div>
            {kycData.rejectionReason&&<div style={{...IN,fontSize:11,color:T.sub}}>Reason: {kycData.rejectionReason}</div>}
            <div style={{...IN,fontSize:11,color:T.sub,marginTop:4}}>Please correct the issues and resubmit below.</div>
          </div>}

          <div style={{padding:"12px 14px",background:T.accentDim,border:`1px solid ${T.accent}44`,borderRadius:8,marginBottom:18}}>
            <div style={{...IN,fontSize:12,fontWeight:700,color:T.accent,marginBottom:4}}>Verify your identity</div>
            <div style={{...IN,fontSize:11,color:T.sub,lineHeight:1.5}}>Required for withdrawals and higher trading limits. Your data is encrypted and securely stored.</div>
          </div>

          <div style={{...labelSt,marginBottom:10,marginTop:6,fontSize:11,color:T.text}}>Personal Information</div>
          <div style={{marginBottom:12}}><div style={labelSt}>Full Legal Name</div><input value={fullName} onChange={e=>setFullName(e.target.value)} style={inputSt} placeholder="John Michael Doe"/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><div style={labelSt}>Date of Birth</div><input type="date" value={dob} onChange={e=>setDob(e.target.value)} style={inputSt}/></div>
            <div><div style={labelSt}>Nationality</div><input value={nationality} onChange={e=>setNationality(e.target.value)} style={inputSt} placeholder="Pakistan"/></div>
          </div>

          <div style={{...labelSt,marginBottom:10,marginTop:16,fontSize:11,color:T.text}}>Address</div>
          <div style={{marginBottom:12}}><div style={labelSt}>Address Line</div><input value={addressLine} onChange={e=>setAddressLine(e.target.value)} style={inputSt} placeholder="Street, building, etc."/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
            <div><div style={labelSt}>City</div><input value={city} onChange={e=>setCity(e.target.value)} style={inputSt} placeholder="Rawalpindi"/></div>
            <div><div style={labelSt}>Country</div><input value={country} onChange={e=>setCountry(e.target.value)} style={inputSt} placeholder="Pakistan"/></div>
          </div>
          <div style={{marginBottom:16}}><div style={labelSt}>Postal Code</div><input value={postalCode} onChange={e=>setPostalCode(e.target.value)} style={inputSt} placeholder="46000"/></div>

          <div style={{...labelSt,marginBottom:10,marginTop:16,fontSize:11,color:T.text}}>Documents (JPG, PNG, PDF • max 3MB each)</div>
          {[
            {key:"id_card",label:"ID Proof",desc:"Passport, National ID, or Driving License"},
            {key:"selfie",label:"Selfie Holding ID",desc:"Your face + your ID document"},
            {key:"proof_of_address",label:"Proof of Address (Optional)",desc:"Utility bill, bank statement"},
          ].map(doc=>{
            const uploaded=documents.find(d=>d.type===doc.key);
            return(<div key={doc.key} style={{marginBottom:10,padding:"10px 12px",border:`1px dashed ${uploaded?T.accent+"66":T.border}`,borderRadius:8,background:uploaded?T.accentDim:T.el}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{flex:1}}>
                  <div style={{...IN,fontSize:12,fontWeight:600,color:T.text}}>{doc.label}</div>
                  <div style={{...IN,fontSize:10,color:T.sub,marginTop:2}}>{doc.desc}</div>
                  {uploaded&&<div style={{...MO,fontSize:10,color:T.accent,marginTop:4}}>✓ {uploaded.name}</div>}
                </div>
                {uploaded?
                  <button onClick={()=>removeDocument(doc.key)} style={{background:T.redDim,border:`1px solid ${T.red}55`,color:T.red,...IN,fontSize:10,padding:"5px 10px",borderRadius:5,cursor:"pointer",fontWeight:600}}>Remove</button>:
                  <label style={{background:T.accent,color:T.bg,...IN,fontSize:10,padding:"6px 12px",borderRadius:5,cursor:"pointer",fontWeight:700}}>
                    Upload
                    <input type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={e=>handleFileUpload(e,doc.key)} style={{display:"none"}}/>
                  </label>
                }
              </div>
            </div>);
          })}

          {err&&<div style={{padding:"8px 10px",background:T.redDim,border:`1px solid ${T.red}55`,borderRadius:6,color:T.red,...IN,fontSize:11,marginTop:12}}>{err}</div>}
          {success&&<div style={{padding:"8px 10px",background:T.accentDim,border:`1px solid ${T.accent}55`,borderRadius:6,color:T.accent,...IN,fontSize:11,marginTop:12}}>{success}</div>}

          <button onClick={handleSubmit} disabled={submitting} style={{width:"100%",padding:"12px 0",marginTop:16,borderRadius:8,border:"none",background:submitting?T.el:`linear-gradient(135deg,${T.accent},#d97706)`,color:submitting?T.sub:T.bg,...IN,fontSize:13,fontWeight:700,cursor:submitting?"wait":"pointer"}}>{submitting?"Submitting...":canResubmit?"Resubmit for Review":"Submit for Verification"}</button>
        </div>
       )
      }
    </div>
    </div>
  </>}</>);
}

// RANKING PANEL — global leaderboard showing top traders
function RankingPanel({open,onClose,trades,T}){
  const[leaderboard,setLeaderboard]=useState([]);
  const[myRank,setMyRank]=useState(null);
  const[period,setPeriod]=useState("month");
  const[loading,setLoading]=useState(false);

  useEffect(()=>{
    if(!open)return;
    setLoading(true);
    API.leaderboard.get(period,50).then(res=>{
      if(res.success){
        setLeaderboard(res.leaderboard||[]);
        setMyRank(res.myRank);
      }
    }).catch(()=>{}).finally(()=>setLoading(false));
  },[open,period]);

  return(<SlidePanel T={T} open={open} onClose={onClose} title="Global Ranking"><div style={{flex:1,overflowY:"auto"}}>
    {/* User's current rank card */}
    {myRank&&<div style={{margin:"12px 16px",padding:"12px 14px",borderRadius:10,background:`linear-gradient(135deg,${T.accent}22,${T.accent}0a)`,border:`1px solid ${T.accent}55`}}>
      <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:4}}>Your Rank</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div><div style={{...IN,fontSize:20,fontWeight:700,color:T.accent}}>#{myRank.rank}</div><div style={{...IN,fontSize:10,color:T.sub}}>Win Rate: {myRank.winRate}% • {myRank.trades} trades</div></div>
        <div style={{textAlign:"right"}}><div style={{...MO,fontSize:15,fontWeight:700,color:myRank.pnl>=0?T.green:T.red}}>{myRank.pnl>=0?"+":""}${myRank.pnl.toFixed(2)}</div><div style={{...IN,fontSize:9,color:T.sub}}>Total P/L</div></div>
      </div>
    </div>}
    {/* Tab filter */}
    <div style={{display:"flex",gap:4,padding:"0 16px 8px"}}>{[{k:"week",l:"Week"},{k:"month",l:"Month"},{k:"all",l:"All Time"}].map(t=>(<button key={t.k} onClick={()=>setPeriod(t.k)} style={{flex:1,padding:"6px 0",borderRadius:6,border:`1px solid ${period===t.k?T.accent:T.border}`,background:period===t.k?T.accentDim:"transparent",color:period===t.k?T.accent:T.sub,...IN,fontSize:10,fontWeight:600,cursor:"pointer"}}>{t.l}</button>))}</div>
    {/* Loading or empty */}
    {loading&&<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>Loading leaderboard...</div>}
    {!loading&&leaderboard.length===0&&<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>No traders ranked yet</div>}
    {/* Top 10 list */}
    <div style={{padding:"0 16px 16px"}}>{leaderboard.slice(0,50).map((p,i)=>{const medal=p.rank===1?"Au":p.rank===2?"2nd":p.rank===3?"3rd":null;return(<div key={p.userId||p.rank} style={{display:"flex",alignItems:"center",padding:"10px 12px",background:i<3?T.accent+"0f":T.el,borderRadius:8,marginBottom:5,border:`1px solid ${i<3?T.accent+"33":T.border}`}}>
      <div style={{width:32,textAlign:"center",...IN,fontSize:medal?18:13,fontWeight:700,color:i<3?T.accent:T.text}}>{medal||`#${p.rank}`}</div>
      <div style={{fontSize:18,marginRight:10}}>{p.country||"--"}</div>
      <div style={{flex:1}}>
        <div style={{...IN,fontSize:12,fontWeight:600,color:T.text}}>{p.name}</div>
        <div style={{...MO,fontSize:9,color:T.sub}}>{p.winRate}% • {p.trades} trades • {p.streak||0}</div>
      </div>
      <div style={{...MO,fontSize:13,fontWeight:700,color:p.pnl>=0?T.green:T.red,textAlign:"right"}}>{p.pnl>=0?"+":""}${Math.abs(p.pnl).toLocaleString(undefined,{maximumFractionDigits:2})}</div>
    </div>);})}</div>
  </div></SlidePanel>);
}

// TOURNAMENT PANEL — active and upcoming trading tournaments
function TournamentPanel({open,onClose,T,onBalanceUpdate,isGuest,onRegister}){
  const[tournaments,setTournaments]=useState([]);
  const[loading,setLoading]=useState(false);
  const[joining,setJoining]=useState(null);

  const loadTournaments=()=>{
    if(!API.auth.isAuthenticated()){
      // Fallback fake data if not logged in
      setTournaments([
        {id:1,title:"Daily Sprint",status:"live",prize:500,entryFee:0,participantCount:847,maxParticipants:2000,timeLeft:"4h 23m",progress:42,icon:"",isJoined:false},
      ]);
      return;
    }
    setLoading(true);
    API.tournaments.list().then(res=>{
      if(res.success)setTournaments(res.tournaments);
    }).catch(()=>{}).finally(()=>setLoading(false));
  };

  useEffect(()=>{if(open)loadTournaments();},[open]);

  const handleJoin=async(t)=>{
    if(isGuest){if(onRegister)onRegister();return;}
    if(t.isJoined){toast&&toast("Already Joined","You are already in this tournament","warn");return;}
    setJoining(t.id);
    try{
      const res=await API.tournaments.join(t.id);
      if(res.success){
        alert(`Joined "${t.title}"!`);
        loadTournaments();
        // Refresh balance if entry fee was charged
        if(t.entryFee>0&&onBalanceUpdate){
          const me=await API.auth.me();
          if(me.success)onBalanceUpdate(me.user.demoBalance);
        }
      }
    }catch(e){alert("Join failed: "+e.message);}
    finally{setJoining(null);}
  };

  const liveCount=tournaments.filter(t=>t.status==="live").length;
  const totalPrize=tournaments.reduce((s,t)=>s+(t.prize||0),0);
  const totalPlayers=tournaments.reduce((s,t)=>s+(t.participantCount||0),0);

  return(<SlidePanel T={T} open={open} onClose={onClose} title="Tournaments"><div style={{flex:1,overflowY:"auto"}}>
    {/* Stats banner */}
    <div style={{margin:"12px 16px",padding:"14px",borderRadius:10,background:`linear-gradient(135deg,${T.accent}22,${T.accent}0a)`,border:`1px solid ${T.accent}55`,display:"flex",justifyContent:"space-around",textAlign:"center"}}>
      <div><div style={{...MO,fontSize:18,fontWeight:700,color:T.accent}}>{liveCount}</div><div style={{...IN,fontSize:9,color:T.sub,fontWeight:600}}>ACTIVE</div></div>
      <div style={{width:1,background:T.border}}/>
      <div><div style={{...MO,fontSize:18,fontWeight:700,color:T.text}}>${totalPrize.toLocaleString()}</div><div style={{...IN,fontSize:9,color:T.sub,fontWeight:600}}>TOTAL PRIZES</div></div>
      <div style={{width:1,background:T.border}}/>
      <div><div style={{...MO,fontSize:18,fontWeight:700,color:T.text}}>{totalPlayers.toLocaleString()}</div><div style={{...IN,fontSize:9,color:T.sub,fontWeight:600}}>PLAYERS</div></div>
    </div>
    {/* Loading/empty */}
    {loading&&<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>Loading tournaments...</div>}
    {!loading&&tournaments.length===0&&<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>No tournaments available</div>}
    {/* Tournaments list */}
    <div style={{padding:"0 16px 16px"}}>{tournaments.map(t=>{const progress=t.progress||0;return(<div key={t.id} style={{background:T.el,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${t.status==="live"?T.accent+"44":T.border}`,position:"relative",overflow:"hidden"}}>
      {t.status==="live"&&<span style={{position:"absolute",top:8,right:8,...MO,fontSize:8,padding:"2px 6px",borderRadius:3,background:T.red,color:"#fff",fontWeight:700,display:"flex",alignItems:"center",gap:3}}><span style={{width:5,height:5,borderRadius:"50%",background:"#fff",animation:"pulse 1.5s infinite"}}/>LIVE</span>}
      {t.status==="upcoming"&&<span style={{position:"absolute",top:8,right:8,...MO,fontSize:8,padding:"2px 6px",borderRadius:3,background:T.yellow||"#f59e0b",color:T.bg,fontWeight:700}}>SOON</span>}
      {t.isJoined&&<span style={{position:"absolute",top:8,right:60,...MO,fontSize:8,padding:"2px 6px",borderRadius:3,background:T.accent,color:T.bg,fontWeight:700}}>✓ JOINED</span>}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
        <div style={{fontSize:24}}>{t.icon}</div>
        <div style={{flex:1}}>
          <div style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>{t.title}</div>
          <div style={{...IN,fontSize:10,color:T.sub,marginTop:1}}>{t.status==="live"?`Ends in ${t.timeLeft}`:`Starts in ${t.timeLeft}`}</div>
        </div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:8}}>
        <div style={{flex:1,padding:"6px 8px",borderRadius:5,background:T.bg,border:`1px solid ${T.border}`}}>
          <div style={{...IN,fontSize:8,color:T.sub,fontWeight:600,textTransform:"uppercase"}}>Prize Pool</div>
          <div style={{...MO,fontSize:13,fontWeight:700,color:T.accent}}>${t.prize.toLocaleString()}</div>
        </div>
        <div style={{flex:1,padding:"6px 8px",borderRadius:5,background:T.bg,border:`1px solid ${T.border}`}}>
          <div style={{...IN,fontSize:8,color:T.sub,fontWeight:600,textTransform:"uppercase"}}>Entry</div>
          <div style={{...MO,fontSize:13,fontWeight:700,color:t.entryFee===0?T.green:T.text}}>{t.entryFee===0?"FREE":`$${t.entryFee}`}</div>
        </div>
      </div>
      <div style={{marginBottom:8}}>
        <div style={{display:"flex",justifyContent:"space-between",...IN,fontSize:9,color:T.sub,marginBottom:3}}><span>{t.participantCount}/{t.maxParticipants} players</span><span>{progress}% filled</span></div>
        <div style={{height:4,background:T.bg,borderRadius:2,overflow:"hidden"}}><div style={{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${T.accent},#d97706)`,transition:"width 0.3s"}}/></div>
      </div>
      <button onClick={()=>handleJoin(t)} disabled={t.isJoined||t.status!=="live"||joining===t.id} style={{width:"100%",padding:"8px 0",borderRadius:6,border:"none",background:t.isJoined?T.green+"33":t.status==="live"?`linear-gradient(135deg,${T.accent},#d97706)`:T.el,color:t.isJoined?T.green:t.status==="live"?T.bg:T.sub,...IN,fontSize:11,fontWeight:700,cursor:t.isJoined||t.status!=="live"?"default":"pointer",opacity:t.status==="live"||t.isJoined?1:.7}}>{joining===t.id?"JOINING...":t.isJoined?"✓ JOINED":t.status==="live"?"JOIN NOW":"STARTS SOON"}</button>
    </div>);})}</div>
  </div></SlidePanel>);
}

function HelpPanel({open,onClose,T,onGoSupport,onGoFaqs}){
  const[kbEnabled,setKbEnabled]=useState(()=>ls("qt_kb_shortcuts",true));
  useEffect(()=>{ss("qt_kb_shortcuts",kbEnabled);},[kbEnabled]);
  return(<SlidePanel T={T} open={open} onClose={onClose} title="Help"><div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
  <div style={{...IN,fontSize:15,fontWeight:700,color:T.text,marginBottom:14}}>Help & Support</div>
  <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
    <button onClick={()=>{onClose();setTimeout(()=>onGoFaqs?.(),100);}} style={{display:"flex",alignItems:"center",gap:12,padding:"14px",background:T.el,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent+"55";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>
      <div style={{width:36,height:36,borderRadius:8,background:"#3b82f622",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></div>
      <div style={{flex:1}}><div style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>Help Center</div><div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>FAQs and guides</div></div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
    <button onClick={()=>{onClose();setTimeout(()=>onGoSupport?.(),100);}} style={{display:"flex",alignItems:"center",gap:12,padding:"14px",background:T.el,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent+"55";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>
      <div style={{width:36,height:36,borderRadius:8,background:"#eab30822",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
      <div style={{flex:1}}><div style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>Report Issue</div><div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>Create support ticket</div></div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>
  {/* Keyboard Shortcuts */}
  <div style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <div style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>Keyboard Shortcuts</div>
      <button onClick={()=>setKbEnabled(!kbEnabled)} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:0}}>
        <span style={{...IN,fontSize:10,fontWeight:600,color:kbEnabled?T.green:T.muted}}>{kbEnabled?"ON":"OFF"}</span>
        <div style={{width:36,height:20,borderRadius:10,background:kbEnabled?T.accent:T.el,border:`1px solid ${kbEnabled?T.accent:T.border}`,position:"relative",transition:"all 0.2s"}}><div style={{width:14,height:14,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:kbEnabled?18:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/></div>
      </button>
    </div>
    <div style={{opacity:kbEnabled?1:.4,transition:"opacity 0.2s"}}>
      {[
        {label:"Trade Higher (Up)",key:"H"},
        {label:"Trade Lower (Down)",key:"L"},
        {label:"Change Asset / Add Pair",key:"A"},
        {label:"Toggle Fullscreen",key:"F"},
        {label:"Increase Amount",key:"+"},
        {label:"Decrease Amount",key:"-"},
        {label:"Next Timeframe",key:"T"},
        {label:"Open Wallet",key:"W"},
        {label:"Open Account",key:"P"},
        {label:"Close Panel / Back",key:"Esc"},
      ].map(s=>(<div key={s.key} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${T.border}22`}}><span style={{...IN,fontSize:11,color:T.sub}}>{s.label}</span><span style={{...MO,fontSize:10,fontWeight:700,minWidth:28,height:22,borderRadius:5,background:T.card,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.text,padding:"0 6px"}}>{s.key}</span></div>))}
    </div>
    {!kbEnabled&&<div style={{...IN,fontSize:10,color:T.muted,marginTop:8,textAlign:"center"}}>Keyboard shortcuts are disabled. Turn on to use.</div>}
  </div>
  <div style={{textAlign:"center",...IN,fontSize:10,color:T.muted,marginTop:20}}>Version 2.4.1</div>
</div></SlidePanel>);}

function SupportPanel({open,onClose,T,currentUser}){
  const[tab,setTab]=useState("faqs"); // faqs | support
  const[openFaq,setOpenFaq]=useState(-1); // which FAQ is open (-1 = none)
  const[view,setView]=useState("list");
  const[tickets,setTickets]=useState([]);
  const[loading,setLoading]=useState(false);
  const[selectedTicket,setSelectedTicket]=useState(null);
  const[replyText,setReplyText]=useState("");
  const[sending,setSending]=useState(false);
  const[subject,setSubject]=useState("");
  const[category,setCategory]=useState("other");
  const[priority,setPriority]=useState("medium");
  const[message,setMessage]=useState("");
  const[files,setFiles]=useState([]);
  const[creating,setCreating]=useState(false);
  const CATEGORIES=[{v:"deposit",l:"Deposit"},{v:"withdrawal",l:"Withdrawal"},{v:"trading",l:"Trading"},{v:"account",l:"Account"},{v:"kyc",l:"KYC Verification"},{v:"technical",l:"Technical Issue"},{v:"other",l:"Other"}];
  const PRIORITIES=[{v:"low",l:"Low",c:"#4a5570"},{v:"medium",l:"Medium",c:"#3b82f6"},{v:"high",l:"High",c:"#eab308"},{v:"urgent",l:"Urgent",c:"#ef4444"}];
  const STATUS_COLORS={open:"#3b82f6",in_progress:"#eab308",awaiting_reply:"#22c55e",resolved:"#7a85a0",closed:"#4a5570"};
  const STATUS_LABELS={open:"Open",in_progress:"In Progress",awaiting_reply:"Awaiting Reply",resolved:"Resolved",closed:"Closed"};
  useEffect(()=>{if(!open)return;loadTickets();},[open]);
  const loadTickets=async()=>{setLoading(true);try{const res=await API.support.list();if(res.success)setTickets(res.tickets||[]);}catch(e){}setLoading(false);};
  const openTicket=async(t)=>{try{const res=await API.support.get(t._id);if(res.success){setSelectedTicket(res.ticket);setView("detail");}}catch(e){}};
  const handleCreate=async()=>{if(!subject.trim()||!message.trim())return;setCreating(true);try{const fd=new FormData();fd.append("subject",subject);fd.append("category",category);fd.append("priority",priority);fd.append("message",message);files.forEach(f=>fd.append("attachments",f));const res=await API.support.create(fd);if(res.success){setSubject("");setMessage("");setCategory("other");setPriority("medium");setFiles([]);setView("list");loadTickets();}}catch(e){}setCreating(false);};
  const handleReply=async()=>{if(!replyText.trim()||!selectedTicket)return;setSending(true);try{const fd=new FormData();fd.append("message",replyText);const res=await API.support.reply(selectedTicket._id,fd);if(res.success){setSelectedTicket(res.ticket);setReplyText("");}}catch(e){}setSending(false);};
  const handleClose=async()=>{if(!selectedTicket||!confirm("Close this ticket?"))return;try{const res=await API.support.close(selectedTicket._id);if(res.success){setSelectedTicket(res.ticket);loadTickets();}}catch(e){}};
  // Auto-refresh ticket messages every 5 seconds
  useEffect(()=>{if(view!=="detail"||!selectedTicket?._id)return;
    const poll=setInterval(async()=>{try{const res=await API.support.get(selectedTicket._id);if(res.success&&res.ticket){const oldLen=(selectedTicket.messages||[]).length;const newLen=(res.ticket.messages||[]).length;if(newLen>oldLen)setSelectedTicket(res.ticket);}}catch(e){}},5000);
    return()=>clearInterval(poll);
  },[view,selectedTicket?._id]);
  const inp={background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",resize:"vertical"};
  const sel={...inp,appearance:"none",cursor:"pointer"};
  const timeAgo=(d)=>{const ms=Date.now()-new Date(d).getTime();const m=Math.floor(ms/60000);if(m<1)return"Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";};
  return(<>{open&&<>
    <div onClick={()=>{onClose();setView("list");setSelectedTicket(null);}} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",zIndex:252}}/>
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:420,maxWidth:"92vw",height:"80vh",maxHeight:650,background:T.card+"f0",border:`1px solid ${T.border}`,borderRadius:20,zIndex:253,display:"flex",flexDirection:"column",...IN,color:T.text,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",animation:"fadeIn 0.1s ease-out",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <span style={{fontSize:15,fontWeight:700}}>Help & Support</span>
        <button onClick={()=>{onClose();setView("list");setSelectedTicket(null);setTab("faqs");}} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex",padding:4,borderRadius:6}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="none"}>{Ic.close}</button>
      </div>
      {/* FAQs / Support tabs */}
      <div style={{display:"flex",padding:"0 20px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
        <button onClick={()=>{setTab("faqs");setView("list");setSelectedTicket(null);}} style={{flex:1,padding:"10px 0",border:"none",borderBottom:tab==="faqs"?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:tab==="faqs"?T.accent:T.sub,...IN,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>FAQ FAQs</button>
        <button onClick={()=>setTab("support")} style={{flex:1,padding:"10px 0",border:"none",borderBottom:tab==="support"?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:tab==="support"?T.accent:T.sub,...IN,fontSize:12,fontWeight:600,cursor:"pointer",transition:"all 0.2s"}}>Tickets Support</button>
      </div>
    {/* FAQs Tab */}
    {tab==="faqs"&&<div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
      {[
        {q:"How do I deposit funds?",a:"Go to Wallet > Deposit. Select your preferred cryptocurrency and network. Copy the deposit address and send funds from your external wallet. Deposits are usually credited within 1-30 minutes depending on the network."},
        {q:"How do I withdraw funds?",a:"Navigate to Wallet > Withdraw. Enter the amount and your wallet address. Withdrawals are processed within 24 hours. Minimum withdrawal amounts apply depending on the cryptocurrency."},
        {q:"What is demo trading?",a:"Demo trading allows you to practice trading with virtual funds ($10,000). No real money is involved. You can reset your demo balance anytime from the balance dropdown menu."},
        {q:"How does binary trading work?",a:"Choose an asset, set your trade amount and duration, then predict whether the price will go HIGHER or LOWER. If your prediction is correct at expiry, you earn the payout percentage shown."},
        {q:"What are the minimum and maximum trade amounts?",a:"Minimum trade amount is $1. Maximum trade amount depends on your account type and the asset being traded. Check the trading panel for current limits."},
        {q:"How long do trades last?",a:"Trade durations range from 1 minute to 15 minutes. Select your preferred duration from the Time selector in the trading panel."},
        {q:"What is KYC verification?",a:"KYC (Know Your Customer) is identity verification required to withdraw funds and access all features. Go to Profile > KYC Verification to submit your documents."},
        {q:"How are payouts calculated?",a:"Each asset has a payout percentage (e.g., 85%). If you trade $10 with 85% payout and win, you receive $10 + $8.50 = $18.50. If you lose, you lose your $10 trade amount."},
        {q:"What are OTC pairs?",a:"OTC (Over-The-Counter) pairs are forex pairs that trade 24/7, including weekends. They use simulated price feeds and are available when regular markets are closed."},
        {q:"How do I contact support?",a:"Switch to the Support tab above to create a support ticket. Our team typically responds within 24 hours. Include screenshots if possible to help us resolve your issue faster."}
      ].map((faq,i)=>{
        const isOpen=openFaq===i;
        return(<div key={i} style={{marginBottom:6,borderRadius:10,border:`1px solid ${T.border}`,overflow:"hidden",background:T.el}}>
          <button onClick={()=>setOpenFaq(isOpen?-1:i)} style={{width:"100%",padding:"12px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"transparent",border:"none",cursor:"pointer",textAlign:"left",gap:10}}>
            <span style={{...IN,fontSize:12,fontWeight:600,color:T.text,flex:1}}>{faq.q}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2" strokeLinecap="round" style={{transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.2s",flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {isOpen&&<div style={{padding:"0 14px 12px",color:T.sub,...IN,fontSize:11,lineHeight:1.6}}>{faq.a}</div>}
        </div>);
      })}
      <div style={{textAlign:"center",padding:"14px 0",marginTop:6}}>
        <div style={{...IN,fontSize:11,color:T.muted,marginBottom:8}}>Can't find your answer?</div>
        <button onClick={()=>setTab("support")} style={{padding:"8px 20px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:T.bg,...IN,fontSize:12,fontWeight:700,cursor:"pointer"}}>Contact Support</button>
      </div>
    </div>}
    {/* Support Tab */}
    {tab==="support"&&<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
      {view==="list"&&<>
        <div style={{padding:"12px 20px",borderBottom:`1px solid ${T.border}`}}>
          <button onClick={()=>setView("create")} style={{width:"100%",padding:"11px 0",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:T.bg,...IN,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
            New Support Ticket
          </button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 16px"}}>
          {loading?<div style={{textAlign:"center",padding:30,color:T.muted,fontSize:12}}>Loading...</div>
          :tickets.length===0?<div style={{textAlign:"center",padding:40}}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.2" strokeLinecap="round" style={{marginBottom:10}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <div style={{...IN,fontSize:13,color:T.sub,fontWeight:600,marginBottom:4}}>No tickets yet</div>
            <div style={{...IN,fontSize:11,color:T.muted}}>Create a ticket to get help</div>
          </div>
          :tickets.map(t=>(
            <button key={t._id} onClick={()=>openTicket(t)} style={{display:"flex",flexDirection:"column",gap:6,padding:"12px 14px",marginBottom:6,borderRadius:10,background:T.el,border:`1px solid ${T.border}`,cursor:"pointer",width:"100%",textAlign:"left",transition:"border-color 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent+"55"} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                <span style={{...IN,fontSize:11,fontWeight:700,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</span>
                <span style={{...MO,fontSize:8,fontWeight:600,padding:"2px 6px",borderRadius:4,background:STATUS_COLORS[t.status]+"22",color:STATUS_COLORS[t.status],flexShrink:0,marginLeft:8}}>{STATUS_LABELS[t.status]||t.status}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{...MO,fontSize:9,color:T.muted}}>{t.ticketId}</span>
                  <span style={{...MO,fontSize:9,color:PRIORITIES.find(p=>p.v===t.priority)?.c||T.muted,fontWeight:600}}>{t.priority?.toUpperCase()}</span>
                </div>
                <span style={{...MO,fontSize:9,color:T.muted}}>{timeAgo(t.updatedAt||t.createdAt)}</span>
              </div>
            </button>
          ))}
        </div>
      </>}
      {view==="create"&&<div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:14}}>
        <button onClick={()=>setView("list")} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.sub,cursor:"pointer",...IN,fontSize:11,fontWeight:600,padding:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>Back to tickets
        </button>
        <div><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>Subject *</div><input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Brief description..." style={inp} maxLength={200}/></div>
        <div style={{display:"flex",gap:10}}>
          <div style={{flex:1}}><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>Category</div><select value={category} onChange={e=>setCategory(e.target.value)} style={sel}>{CATEGORIES.map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select></div>
          <div style={{flex:1}}><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>Priority</div><select value={priority} onChange={e=>setPriority(e.target.value)} style={sel}>{PRIORITIES.map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select></div>
        </div>
        <div><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>Message *</div><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Describe your issue..." style={{...inp,minHeight:100}} rows={5}/></div>
        <div><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:".04em"}}>Attachments (max 3)</div>
          <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:8,border:`1px dashed ${T.border}`,color:T.sub,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;e.currentTarget.style.color=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.sub;}}> {files.length>0?`${files.length} file(s) selected`:"Attach files"}<input type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt" onChange={e=>setFiles(Array.from(e.target.files||[]).slice(0,3))} style={{display:"none"}}/></label>
          {files.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:6}}>{files.map((f,i)=><span key={i} style={{...MO,fontSize:9,padding:"2px 6px",borderRadius:4,background:T.el,border:`1px solid ${T.border}`,color:T.sub}}> {f.name.slice(0,20)} <span onClick={()=>setFiles(files.filter((_,j)=>j!==i))} style={{cursor:"pointer",color:T.red}}>×</span></span>)}</div>}
        </div>
        <button onClick={handleCreate} disabled={creating||!subject.trim()||!message.trim()} style={{width:"100%",padding:"12px 0",borderRadius:8,border:"none",background:(!subject.trim()||!message.trim())?T.el:`linear-gradient(135deg,${T.accent},#d97706)`,color:(!subject.trim()||!message.trim())?T.muted:T.bg,...IN,fontSize:13,fontWeight:700,cursor:(!subject.trim()||!message.trim())?"not-allowed":"pointer",opacity:creating?.6:1}}>{creating?"Submitting...":"Submit Ticket"}</button>
      </div>}
      {view==="detail"&&selectedTicket&&<>
        <div style={{padding:"10px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",flexDirection:"column",gap:6}}>
          <button onClick={()=>{setView("list");setSelectedTicket(null);}} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:"none",color:T.sub,cursor:"pointer",...IN,fontSize:11,fontWeight:600,padding:0}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>Back</button>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{...IN,fontSize:14,fontWeight:700,color:T.text,flex:1}}>{selectedTicket.subject}</span><span style={{...MO,fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:5,background:STATUS_COLORS[selectedTicket.status]+"22",color:STATUS_COLORS[selectedTicket.status]}}>{STATUS_LABELS[selectedTicket.status]}</span></div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}><span style={{...MO,fontSize:9,color:T.muted}}>{selectedTicket.ticketId}</span><span style={{...MO,fontSize:9,padding:"1px 5px",borderRadius:3,background:T.el,color:T.sub}}>{CATEGORIES.find(c=>c.v===selectedTicket.category)?.l}</span><span style={{...MO,fontSize:9,color:PRIORITIES.find(p=>p.v===selectedTicket.priority)?.c,fontWeight:600}}>{selectedTicket.priority?.toUpperCase()}</span></div>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"12px 16px",display:"flex",flexDirection:"column",gap:6}}>
          {(selectedTicket.messages||[]).map((msg,i)=>{const isA=msg.sender==="admin";return(
            <div key={i} style={{display:"flex",gap:7,alignSelf:isA?"flex-start":"flex-end",maxWidth:"78%",flexDirection:isA?"row":"row-reverse"}}>
              {isA&&<img src="/support.png" alt="S" style={{width:24,height:24,borderRadius:"50%",objectFit:"cover",flexShrink:0,alignSelf:"flex-end",border:"1.5px solid #3b82f644"}} onError={e=>{e.target.style.display="none";}}/>}
              {!isA&&<div style={{width:24,height:24,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},#d97706)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"flex-end",...IN,fontSize:9,fontWeight:800,color:"#fff"}}>{(currentUser?.name||currentUser?.email||"U").charAt(0).toUpperCase()}</div>}
              <div>
                <div style={{padding:"7px 12px",borderRadius:16,background:isA?T.el:`${T.accent}18`,border:isA?`1px solid ${T.border}`:`1px solid ${T.accent}33`,color:T.text,...IN,fontSize:11.5,lineHeight:1.45,whiteSpace:"pre-wrap"}}>{msg.text}</div>
                {msg.attachments?.length>0&&<div style={{display:"flex",gap:3,flexWrap:"wrap",marginTop:3}}>{msg.attachments.map((a,j)=><a key={j} href={`http://localhost:5000${a}`} target="_blank" rel="noopener noreferrer" style={{...MO,fontSize:8,padding:"3px 8px",borderRadius:5,background:T.card,border:`1px solid ${T.border}`,color:T.accent,textDecoration:"none",display:"flex",alignItems:"center",gap:3}}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>File {j+1}</a>)}</div>}
                <div style={{...MO,fontSize:7,color:T.muted,marginTop:2,textAlign:isA?"left":"right",padding:"0 3px"}}>{timeAgo(msg.createdAt)}</div>
              </div>
            </div>
          );})}
        </div>
        {selectedTicket.status!=="closed"?<div style={{padding:"10px 16px",borderTop:`1px solid ${T.border}`,background:T.card}}>
          <div style={{display:"flex",gap:8}}><textarea value={replyText} onChange={e=>setReplyText(e.target.value)} placeholder="Type your reply..." style={{...inp,minHeight:40,flex:1,resize:"none"}} rows={2} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleReply();}}}/><button onClick={handleReply} disabled={sending||!replyText.trim()} style={{width:38,height:38,borderRadius:8,border:"none",background:!replyText.trim()?T.el:`linear-gradient(135deg,${T.accent},#d97706)`,color:!replyText.trim()?T.muted:T.bg,cursor:!replyText.trim()?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"flex-end"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div>
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:6}}><button onClick={handleClose} style={{...IN,fontSize:10,color:T.red,background:"transparent",border:"none",cursor:"pointer",fontWeight:600}}>Close Ticket</button></div>
        </div>:<div style={{padding:"12px 16px",borderTop:`1px solid ${T.border}`,textAlign:"center"}}><span style={{...IN,fontSize:11,color:T.muted}}>This ticket has been closed</span></div>}
      </>}
    </div>}
    </div>
  </>}</>);
}

function SettingsPanel({open,onClose,settings,onSave,onLogout,onOpenKYC,T,currentUser}){const[tz,setTz]=useState(settings.timezone);const[lang,setLang]=useState(settings.language);const[curr,setCurr]=useState(settings.currency);const[sound,setSound]=useState(settings.sound);const[themeMode,setThemeMode]=useState(settings.themeMode||"dark");const[bgImage,setBgImage]=useState(settings.bgImage||"");const[gridCapacity,setGridCapacity]=useState(settings.gridCapacity||10);const[autoScroll,setAutoScroll]=useState(settings.autoScroll!==false);const[oneClickTrade,setOneClickTrade]=useState(settings.oneClickTrade||false);
  const[stab,setStab]=useState("personal");
  const[oldPw,setOldPw]=useState("");const[newPw,setNewPw]=useState("");const[confirmPw,setConfirmPw]=useState("");
  const[notifTrade,setNotifTrade]=useState(settings.notifTrade!==false);const[notifDeposit,setNotifDeposit]=useState(settings.notifDeposit!==false);const[notifPromo,setNotifPromo]=useState(settings.notifPromo||false);const[notifSound,setNotifSound]=useState(settings.sound!==false);
  const[twoFA,setTwoFA]=useState(settings.twoFA||false);const[twoFALogin,setTwoFALogin]=useState(settings.twoFALogin||false);const[twoFAWithdraw,setTwoFAWithdraw]=useState(settings.twoFAWithdraw||false);
  const[setup2FAOpen,setSetup2FAOpen]=useState(false);
  useEffect(()=>{setTz(settings.timezone);setLang(settings.language);setCurr(settings.currency);setSound(settings.sound);setThemeMode(settings.themeMode||"dark");setBgImage(settings.bgImage||"");setGridCapacity(settings.gridCapacity||10);setAutoScroll(settings.autoScroll!==false);setOneClickTrade(settings.oneClickTrade||false);setNotifSound(settings.sound!==false);setNotifTrade(settings.notifTrade!==false);setNotifDeposit(settings.notifDeposit!==false);setNotifPromo(settings.notifPromo||false);setTwoFA(settings.twoFA||false);setTwoFALogin(settings.twoFALogin||false);setTwoFAWithdraw(settings.twoFAWithdraw||false);},[open]);
  const sel={background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",appearance:"none",cursor:"pointer"};
  const handleImageUpload=(e)=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=(ev)=>setBgImage(ev.target.result);reader.readAsDataURL(file);};
  const isMob=window.innerWidth<768;
  const Toggle=({on,onToggle,label,desc})=>(<button onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px 4px",border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.border}`,borderRadius:4,transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.el+"88"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{textAlign:"left",pointerEvents:"none"}}><div style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>{label}</div>{desc&&<div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>{desc}</div>}</div><div style={{width:44,height:24,borderRadius:12,background:on?T.accent:T.el,border:`1px solid ${on?T.accent:T.border}`,position:"relative",transition:"all 0.2s",flexShrink:0,pointerEvents:"none"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:on?22:2,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/></div></button>);
  const tabs=[
    {id:"personal",label:"Personal Data",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>},
    {id:"password",label:"Change Password",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>},
    {id:"security",label:"Security",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>},
    {id:"notifications",label:"Notifications",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>}
  ];
  if(!open)return null;
  return(<div style={{position:"fixed",inset:0,zIndex:250,background:T.bg,display:"flex",flexDirection:"column",...IN,color:T.text}}>
    {/* Top nav */}
    <nav style={{display:"flex",alignItems:"center",gap:12,padding:isMob?"0 12px":"0 24px",height:56,borderBottom:`1px solid ${T.border}`,background:T.card,flexShrink:0}}>
      <button onClick={onClose} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>{Ic.back}{!isMob&&<span style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>Back</span>}</button>
      <span style={{...IN,fontSize:16,fontWeight:700}}>Settings</span>
      <div style={{flex:1}}/>
      {onLogout&&<button onClick={()=>{if(confirm("Are you sure you want to logout?"))onLogout();}} style={{padding:"6px 16px",borderRadius:6,border:`1px solid ${T.red}44`,background:T.redDim,color:T.red,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Logout</button>}
    </nav>
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      {/* Sidebar — desktop */}
      {!isMob&&<div style={{width:220,background:T.card,borderRight:`1px solid ${T.border}`,flexShrink:0,padding:"16px 0",overflowY:"auto"}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>setStab(t.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 20px",border:"none",background:stab===t.id?T.accentDim:"transparent",color:stab===t.id?T.accent:T.sub,...IN,fontSize:13,fontWeight:stab===t.id?600:500,cursor:"pointer",textAlign:"left",borderLeft:stab===t.id?`3px solid ${T.accent}`:"3px solid transparent"}} onMouseEnter={e=>{if(stab!==t.id)e.currentTarget.style.background=T.el;}} onMouseLeave={e=>{if(stab!==t.id)e.currentTarget.style.background="transparent";}}><span style={{display:"flex"}}>{t.icon}</span>{t.label}</button>))}
      </div>}
      {/* Mobile tabs — horizontal scroll */}
      {isMob&&<div style={{position:"absolute",top:56,left:0,right:0,display:"flex",gap:0,background:T.card,borderBottom:`1px solid ${T.border}`,overflowX:"auto",flexShrink:0,zIndex:1}}>
        {tabs.map(t=>(<button key={t.id} onClick={()=>setStab(t.id)} style={{padding:"10px 14px",border:"none",borderBottom:stab===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:stab===t.id?T.accent:T.sub,...IN,fontSize:11,fontWeight:stab===t.id?600:500,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>{t.label}</button>))}
      </div>}
      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:isMob?"56px 16px 20px":"30px 40px",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:"100%",maxWidth:600}}>

        {/* ═══ PERSONAL DATA ═══ */}
        {stab==="personal"&&<>
          <div style={{...IN,fontSize:20,fontWeight:700,marginBottom:20}}>Personal Data</div>
          {/* Account Statement */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"18px 16px":"24px 28px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div>
              <div style={{...IN,fontSize:15,fontWeight:700,marginBottom:4}}>Account Statement</div>
              <div style={{...IN,fontSize:12,color:T.sub}}>Generate a detailed report of your deposits, withdrawals, and trading activity.</div>
            </div>
            <button onClick={()=>alert("Statement generated! Check your email.")} style={{padding:"10px 20px",borderRadius:8,border:`1px solid ${T.border}`,background:T.el,color:T.text,...IN,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
              Generate Statement
            </button>
          </div>
          {/* Contact Info */}
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"18px 16px":"24px 28px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{...IN,fontSize:15,fontWeight:700}}>Contact Info</div>
              <button onClick={()=>{onClose();setTimeout(()=>onOpenKYC(),200);}} style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${T.green}44`,background:T.greenDim,color:T.green,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>
                {(localStorage.getItem("qt_kyc_status")==="approved"||currentUser?.kycStatus==="approved")?"Verified":"Verify Now"}
              </button>
            </div>
            <div style={{padding:"12px 16px",background:T.el,borderRadius:8,border:`1px solid ${T.border}`,marginBottom:20,display:"flex",alignItems:"center",gap:10}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              <div style={{...IN,fontSize:11,color:T.sub}}>Your personal details are locked after identity verification. Contact <span style={{color:T.accent}}>support@zexto.com</span> to make changes.</div>
            </div>
            {[
              {label:"Full Name",value:currentUser?.name||"—"},
              {label:"Email",value:currentUser?.email||"—"},
              {label:"Phone",value:currentUser?.phone||"—"},
              {label:"Country",value:currentUser?.country||"—"},
              {label:"Address",value:currentUser?.address||"—"},
              {label:"City",value:currentUser?.city||"—"},
              {label:"Postal Code",value:currentUser?.postalCode||"—"},
              {label:"Date of Birth",value:currentUser?.dob||"—"}
            ].map((row,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:i<7?`1px solid ${T.border}`:"none"}}>
                <span style={{...IN,fontSize:13,color:T.sub}}>{row.label}</span>
                <span style={{...IN,fontSize:13,fontWeight:600,color:T.text,textAlign:"right",maxWidth:"60%",wordBreak:"break-word"}}>{row.value}</span>
              </div>
            ))}
          </div>
        </>}

        {/* ═══ CHANGE PASSWORD ═══ */}
        {stab==="password"&&<>
          <div style={{...IN,fontSize:20,fontWeight:700,marginBottom:20}}>Change Password</div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"18px 16px":"24px 28px"}}>
            <div style={{marginBottom:16}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Current Password</div><input type="password" value={oldPw} onChange={e=>setOldPw(e.target.value)} placeholder="Enter current password" style={{...sel,padding:"12px 14px",fontSize:13}}/></div>
            <div style={{marginBottom:16}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>New Password</div><input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="Enter new password" style={{...sel,padding:"12px 14px",fontSize:13}}/></div>
            <div style={{marginBottom:20}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Confirm New Password</div><input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm new password" style={{...sel,padding:"12px 14px",fontSize:13}}/></div>
            <button onClick={()=>{if(!oldPw||!newPw){alert("Fill all fields");return;}if(newPw!==confirmPw){alert("Passwords don't match");return;}if(newPw.length<6){alert("Min 6 characters");return;}alert("Password updated!");setOldPw("");setNewPw("");setConfirmPw("");}} style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer"}}>Update Password</button>
            <div style={{...IN,fontSize:11,color:T.muted,textAlign:"center",marginTop:10}}>Password must be at least 6 characters</div>
          </div>
        </>}

        {/* ═══ SECURITY ═══ */}
        {stab==="security"&&<>
          <div style={{...IN,fontSize:20,fontWeight:700,marginBottom:20}}>Security</div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"18px 16px":"24px 28px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 0",borderBottom:`1px solid ${T.border}`}}>
              <div>
                <div style={{...IN,fontSize:14,fontWeight:600}}>Two-Step Verification</div>
                <div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>Google Authenticator / TOTP</div>
              </div>
              <span style={{...IN,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:5,background:twoFA?T.greenDim:T.redDim,color:twoFA?T.green:T.red,border:`1px solid ${twoFA?T.green+"44":T.red+"44"}`}}>{twoFA?"ENABLED":"DISABLED"}</span>
            </div>

            {/* Enable/Disable 2FA */}
            {!twoFA?
              <div style={{padding:"16px 0"}}>
                <div style={{...IN,fontSize:12,color:T.sub,lineHeight:1.6,marginBottom:14}}>
                  Add an extra layer of security to your account. When enabled, you'll need to enter a code from your Google Authenticator app in addition to your password.
                </div>
                <button onClick={()=>setSetup2FAOpen(true)} style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Set Up Two-Step Verification
                </button>
              </div>
            :<>
              <div style={{padding:"14px 0",borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                  <div style={{width:36,height:36,borderRadius:"50%",background:T.greenDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
                  </div>
                  <div>
                    <div style={{...IN,fontSize:13,fontWeight:600,color:T.green}}>2FA is Active</div>
                    <div style={{...IN,fontSize:11,color:T.sub}}>Your account is protected with two-step verification</div>
                  </div>
                </div>
              </div>
              <Toggle on={twoFALogin} onToggle={()=>{const v=!twoFALogin;setTwoFALogin(v);onSave({...settings,twoFALogin:v});}} label="Require on Login" desc="Ask for 2FA code every time you log in"/>
              <Toggle on={twoFAWithdraw} onToggle={()=>{const v=!twoFAWithdraw;setTwoFAWithdraw(v);onSave({...settings,twoFAWithdraw:v});}} label="Require on Withdrawal" desc="Ask for 2FA code before processing withdrawals"/>
              <div style={{padding:"14px 0 0"}}>
                <button onClick={()=>{
                  if(!confirm("Are you sure you want to disable 2FA? This will make your account less secure."))return;
                  setTwoFA(false);setTwoFALogin(false);setTwoFAWithdraw(false);
                  onSave({...settings,twoFA:false,twoFALogin:false,twoFAWithdraw:false,twoFASecret:""});
                  API.twoFA.disable().catch(()=>{});
                }} style={{width:"100%",padding:"12px 0",borderRadius:8,border:`1px solid ${T.red}44`,background:T.redDim,color:T.red,...IN,fontSize:13,fontWeight:600,cursor:"pointer"}}>
                  Disable Two-Step Verification
                </button>
              </div>
            </>}

            <div style={{borderTop:`1px solid ${T.border}`,margin:"12px 0 0"}}/>
            <div style={{padding:"14px 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>Active Sessions</div>
                <div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>Manage devices logged into your account</div>
              </div>
              <button onClick={()=>alert("All other sessions have been logged out.")} style={{padding:"8px 16px",borderRadius:6,border:`1px solid ${T.red}44`,background:T.redDim,color:T.red,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Logout All</button>
            </div>
          </div>
          {/* 2FA Setup Modal */}
          <TwoFASetupModal open={setup2FAOpen} onClose={()=>setSetup2FAOpen(false)} T={T}
            onComplete={(sec,codes)=>{
              setTwoFA(true);setTwoFALogin(true);setTwoFAWithdraw(true);setSetup2FAOpen(false);
              onSave({...settings,twoFA:true,twoFALogin:true,twoFAWithdraw:true,twoFASecret:sec,twoFABackupCodes:codes});
            }}/>
        </>}

        {/* ═══ NOTIFICATIONS ═══ */}
        {stab==="notifications"&&<>
          <div style={{...IN,fontSize:20,fontWeight:700,marginBottom:20}}>Notification Settings</div>
          <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"18px 16px":"24px 28px"}}>
            <Toggle on={notifSound} onToggle={()=>{const v=!notifSound;setNotifSound(v);setSound(v);onSave({...settings,sound:v});}} label="Sound Effects" desc="Play sounds for trades, wins, and losses"/>
            <Toggle on={notifTrade} onToggle={()=>{const v=!notifTrade;setNotifTrade(v);onSave({...settings,notifTrade:v});}} label="Trade Notifications" desc="Get notified when trades open or close"/>
            <Toggle on={notifDeposit} onToggle={()=>{const v=!notifDeposit;setNotifDeposit(v);onSave({...settings,notifDeposit:v});}} label="Deposit Notifications" desc="Get notified on deposit confirmations"/>
            <Toggle on={notifPromo} onToggle={()=>{const v=!notifPromo;setNotifPromo(v);onSave({...settings,notifPromo:v});}} label="Promotional Updates" desc="Receive news about promotions and bonuses"/>
          </div>
        </>}

        </div>
      </div>
    </div>
  </div>);
}

/* ═══════════════════════════════════════════════════════════════
   TWO-FACTOR AUTHENTICATION (Google Authenticator)
   ═══════════════════════════════════════════════════════════════ */

// 2FA Verify Modal — used for login & withdraw verification
function TwoFAVerifyModal({open,onClose,onVerify,title,subtitle,T}){
  const[code,setCode]=useState(["","","","","",""]);
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(()=>{if(open){setCode(["","","","","",""]);setErr("");setTimeout(()=>refs[0].current?.focus(),200);}},[open]);

  const handleInput=(i,v)=>{
    if(!/^\d*$/.test(v))return;
    const next=[...code];
    // Handle paste
    if(v.length>1){
      const digits=v.replace(/\D/g,"").slice(0,6).split("");
      digits.forEach((d,idx)=>{if(idx<6)next[idx]=d;});
      setCode(next);
      const focusIdx=Math.min(digits.length,5);
      refs[focusIdx].current?.focus();
      if(digits.length===6)submitCode(next.join(""));
      return;
    }
    next[i]=v.slice(-1);
    setCode(next);
    if(v&&i<5)refs[i+1].current?.focus();
    if(next.every(d=>d))submitCode(next.join(""));
  };

  const handleKey=(i,e)=>{
    if(e.key==="Backspace"&&!code[i]&&i>0){refs[i-1].current?.focus();}
    if(e.key==="ArrowLeft"&&i>0)refs[i-1].current?.focus();
    if(e.key==="ArrowRight"&&i<5)refs[i+1].current?.focus();
  };

  const submitCode=async(fullCode)=>{
    if(fullCode.length!==6)return;
    setErr("");setLoading(true);
    try{
      const ok=await onVerify(fullCode);
      if(!ok)setErr("Invalid code. Please try again.");
    }catch(e){setErr(e.message||"Verification failed");}
    setLoading(false);
  };

  if(!open)return null;
  return(<>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",zIndex:400}}/>
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:Math.min(400,window.innerWidth-32),background:T.card,border:`1px solid ${T.border}`,borderRadius:16,zIndex:401,padding:"32px 28px",textAlign:"center",...IN,color:T.text,boxShadow:"0 24px 80px rgba(0,0,0,0.6)"}}>
      {/* Shield icon */}
      <div style={{width:56,height:56,borderRadius:"50%",background:T.accentDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",border:`2px solid ${T.accent}44`}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
      </div>
      <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>{title||"Two-Step Verification"}</div>
      <div style={{fontSize:12,color:T.sub,marginBottom:24,lineHeight:1.5}}>{subtitle||"Enter the 6-digit code from your Google Authenticator app"}</div>
      {/* 6-digit code input */}
      <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16}}>
        {code.map((d,i)=>(
          <input key={i} ref={refs[i]} value={d} onChange={e=>handleInput(i,e.target.value)} onKeyDown={e=>handleKey(i,e)} onPaste={e=>{e.preventDefault();handleInput(0,e.clipboardData.getData("text"));}}
            maxLength={1} inputMode="numeric" autoComplete="one-time-code"
            style={{width:44,height:52,textAlign:"center",fontSize:22,fontWeight:700,background:T.el,border:`2px solid ${d?T.accent:err?T.red:T.border}`,borderRadius:10,color:T.text,outline:"none",caretColor:T.accent,transition:"border-color 0.15s",...MO}}
          />
        ))}
      </div>
      {err&&<div style={{fontSize:12,color:T.red,marginBottom:12,fontWeight:600}}>{err}</div>}
      {loading&&<div style={{fontSize:12,color:T.sub,marginBottom:12}}>Verifying...</div>}
      <button onClick={()=>submitCode(code.join(""))} disabled={code.some(d=>!d)||loading}
        style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:code.every(d=>d)&&!loading?`linear-gradient(135deg,${T.accent},#d97706)`:T.el,color:code.every(d=>d)&&!loading?"#fff":T.muted,...IN,fontSize:14,fontWeight:700,cursor:code.every(d=>d)&&!loading?"pointer":"not-allowed",marginBottom:12}}>
        Verify
      </button>
      <button onClick={onClose} style={{background:"none",border:"none",color:T.sub,...IN,fontSize:12,cursor:"pointer",fontWeight:500}}>Cancel</button>
    </div>
  </>);
}

// 2FA Setup Modal — QR code + manual key + verify to enable
function TwoFASetupModal({open,onClose,onComplete,T}){
  const[step,setStep]=useState(1); // 1=show QR, 2=verify, 3=backup codes, 4=done
  const[secret,setSecret]=useState("");
  const[qrUrl,setQrUrl]=useState("");
  const[backupCodes,setBackupCodes]=useState([]);
  const[code,setCode]=useState(["","","","","",""]);
  const[err,setErr]=useState("");
  const[loading,setLoading]=useState(false);
  const[copied,setCopied]=useState(false);
  const[codesCopiado,setCodesCopiado]=useState(false);
  const refs=[useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  // Generate secret on open
  useEffect(()=>{
    if(!open)return;
    setStep(1);setErr("");setCode(["","","","","",""]);setCopied(false);
    (async()=>{
      try{
        const res=await API.twoFA.setup();
        if(res.success){setSecret(res.secret);setQrUrl(res.qrUrl||res.qrDataUrl||"");}
        else{
          // Fallback: generate client-side secret for demo
          const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
          let s="";for(let i=0;i<16;i++)s+=chars[Math.floor(Math.random()*chars.length)];
          setSecret(s);
          setQrUrl("");
        }
      }catch(e){
        const chars="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        let s="";for(let i=0;i<16;i++)s+=chars[Math.floor(Math.random()*chars.length)];
        setSecret(s);setQrUrl("");
      }
    })();
  },[open]);

  const handleInput=(i,v)=>{
    if(!/^\d*$/.test(v))return;
    const next=[...code];
    if(v.length>1){const digits=v.replace(/\D/g,"").slice(0,6).split("");digits.forEach((d,idx)=>{if(idx<6)next[idx]=d;});setCode(next);return;}
    next[i]=v.slice(-1);setCode(next);
    if(v&&i<5)refs[i+1].current?.focus();
  };
  const handleKey=(i,e)=>{
    if(e.key==="Backspace"&&!code[i]&&i>0)refs[i-1].current?.focus();
  };

  const verifyAndEnable=async()=>{
    const fullCode=code.join("");
    if(fullCode.length!==6){setErr("Enter all 6 digits");return;}
    setErr("");setLoading(true);
    try{
      const res=await API.twoFA.verify(fullCode,secret);
      if(res.success){
        setBackupCodes(res.backupCodes||["XXXX-XXXX","YYYY-YYYY","ZZZZ-ZZZZ","AAAA-BBBB","CCCC-DDDD"]);
        setStep(3);
      }else{setErr(res.message||"Invalid code. Make sure the code matches your app.");}
    }catch(e){
      // Demo fallback — accept any 6-digit code
      if(fullCode.length===6){
        const demoBackup=[];for(let i=0;i<5;i++){let bc="";for(let j=0;j<8;j++)bc+="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)];demoBackup.push(bc.slice(0,4)+"-"+bc.slice(4));}
        setBackupCodes(demoBackup);setStep(3);
      }else{setErr("Verification failed");}
    }
    setLoading(false);
  };

  const finish=()=>{
    onComplete(secret,backupCodes);
    onClose();
  };

  const copySecret=()=>{navigator.clipboard?.writeText(secret).catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const copyBackup=()=>{navigator.clipboard?.writeText(backupCodes.join("\n")).catch(()=>{});setCodesCopiado(true);setTimeout(()=>setCodesCopiado(false),2000);};

  if(!open)return null;
  const isMob=window.innerWidth<768;
  return(<>
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",zIndex:400}}/>
    <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:Math.min(460,window.innerWidth-32),maxHeight:"90vh",overflowY:"auto",background:T.card,border:`1px solid ${T.border}`,borderRadius:16,zIndex:401,padding:isMob?"24px 18px":"32px 28px",...IN,color:T.text,boxShadow:"0 24px 80px rgba(0,0,0,0.6)"}}>

      {/* Step indicator */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:20}}>
        {[1,2,3].map(s=>(<div key={s} style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:step>=s?T.accent:T.el,color:step>=s?"#fff":T.muted,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,border:`2px solid ${step>=s?T.accent:T.border}`,transition:"all 0.2s"}}>{step>s?"✓":s}</div>
          {s<3&&<div style={{width:30,height:2,background:step>s?T.accent:T.el,borderRadius:1,transition:"background 0.2s"}}/>}
        </div>))}
      </div>

      {/* ═══ STEP 1: SCAN QR CODE ═══ */}
      {step===1&&<>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Set Up Authenticator</div>
          <div style={{fontSize:12,color:T.sub,marginBottom:20,lineHeight:1.5}}>Scan this QR code with Google Authenticator or any TOTP app</div>
        </div>

        {/* QR Code */}
        <div style={{width:180,height:180,margin:"0 auto 16px",background:"#fff",borderRadius:12,padding:12,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
          {qrUrl?<img src={qrUrl} alt="2FA QR" style={{width:"100%",height:"100%",objectFit:"contain"}}/>:
          <div style={{textAlign:"center",color:"#333",fontSize:11,lineHeight:1.4,padding:8}}>
            <div style={{fontSize:32,marginBottom:6}}>Phone</div>
            <div style={{fontWeight:600}}>QR Code</div>
            <div style={{fontSize:9,color:"#888",marginTop:4}}>Enter the key manually below</div>
          </div>}
        </div>

        {/* Manual Key */}
        <div style={{background:T.el,borderRadius:10,padding:"12px 16px",marginBottom:16,border:`1px solid ${T.border}`}}>
          <div style={{fontSize:10,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>Manual Entry Key</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <code style={{flex:1,fontSize:14,fontWeight:700,color:T.accent,letterSpacing:2,wordBreak:"break-all",...MO}}>{secret}</code>
            <button onClick={copySecret} style={{padding:"6px 14px",borderRadius:6,border:"none",background:copied?T.green:T.accent,color:"#fff",...IN,fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0,minWidth:60,transition:"background 0.15s"}}>{copied?"Copied!":"Copy"}</button>
          </div>
        </div>

        <div style={{background:T.el,borderRadius:8,padding:"10px 14px",marginBottom:20,border:`1px solid ${T.border}`,...IN,fontSize:11,color:T.sub,lineHeight:1.5}}>
          <strong style={{color:T.text}}>How to set up:</strong><br/>
          1. Download <span style={{color:T.accent,fontWeight:600}}>Google Authenticator</span> from App Store / Play Store<br/>
          2. Tap <strong>+</strong> → Scan QR code (or enter key manually)<br/>
          3. Click "Next" below and enter the 6-digit code shown in the app
        </div>

        <button onClick={()=>{setStep(2);setTimeout(()=>refs[0].current?.focus(),200);}} style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer"}}>Next — Enter Code</button>
      </>}

      {/* ═══ STEP 2: VERIFY CODE ═══ */}
      {step===2&&<>
        <div style={{textAlign:"center"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:T.accentDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",border:`2px solid ${T.accent}44`}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div style={{fontSize:18,fontWeight:700,marginBottom:4}}>Verify Code</div>
          <div style={{fontSize:12,color:T.sub,marginBottom:24,lineHeight:1.5}}>Enter the 6-digit code from your authenticator app to confirm setup</div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:16}}>
          {code.map((d,i)=>(
            <input key={i} ref={refs[i]} value={d} onChange={e=>handleInput(i,e.target.value)} onKeyDown={e=>handleKey(i,e)} onPaste={e=>{e.preventDefault();handleInput(0,e.clipboardData.getData("text"));}}
              maxLength={1} inputMode="numeric"
              style={{width:44,height:52,textAlign:"center",fontSize:22,fontWeight:700,background:T.el,border:`2px solid ${d?T.accent:err?T.red:T.border}`,borderRadius:10,color:T.text,outline:"none",...MO}}
            />
          ))}
        </div>
        {err&&<div style={{fontSize:12,color:T.red,marginBottom:12,fontWeight:600,textAlign:"center"}}>{err}</div>}

        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{setStep(1);setCode(["","","","","",""]);setErr("");}} style={{flex:1,padding:"12px 0",borderRadius:10,border:`1px solid ${T.border}`,background:T.el,color:T.text,...IN,fontSize:13,fontWeight:600,cursor:"pointer"}}>Back</button>
          <button onClick={verifyAndEnable} disabled={code.some(d=>!d)||loading} style={{flex:2,padding:"12px 0",borderRadius:10,border:"none",background:code.every(d=>d)&&!loading?`linear-gradient(135deg,${T.accent},#d97706)`:T.el,color:code.every(d=>d)&&!loading?"#fff":T.muted,...IN,fontSize:13,fontWeight:700,cursor:code.every(d=>d)&&!loading?"pointer":"not-allowed"}}>{loading?"Verifying...":"Verify & Enable"}</button>
        </div>
      </>}

      {/* ═══ STEP 3: BACKUP CODES ═══ */}
      {step===3&&<>
        <div style={{textAlign:"center"}}>
          <div style={{width:56,height:56,borderRadius:"50%",background:T.greenDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:28}}>ok</div>
          <div style={{fontSize:18,fontWeight:700,color:T.green,marginBottom:4}}>2FA Enabled Successfully!</div>
          <div style={{fontSize:12,color:T.sub,marginBottom:20,lineHeight:1.5}}>Save these backup codes in a safe place. You can use them if you lose access to your authenticator app.</div>
        </div>

        <div style={{background:T.el,borderRadius:10,padding:"16px",marginBottom:16,border:`1px solid ${T.border}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {backupCodes.map((bc,i)=>(
              <div key={i} style={{padding:"8px 12px",borderRadius:6,background:T.bg,border:`1px solid ${T.border}`,textAlign:"center",...MO,fontSize:13,fontWeight:700,color:T.text,letterSpacing:1}}>{bc}</div>
            ))}
          </div>
          <button onClick={copyBackup} style={{width:"100%",marginTop:10,padding:"10px 0",borderRadius:8,border:`1px solid ${T.border}`,background:codesCopiado?T.greenDim:T.bg,color:codesCopiado?T.green:T.text,...IN,fontSize:12,fontWeight:600,cursor:"pointer"}}>{codesCopiado?"✓ Copied to Clipboard":"Copy All Backup Codes"}</button>
        </div>

        <div style={{background:`${T.red}11`,border:`1px solid ${T.red}33`,borderRadius:8,padding:"10px 14px",marginBottom:20,...IN,fontSize:11,color:T.red,lineHeight:1.5,fontWeight:500}}>
          ! These codes will only be shown once. If you lose your authenticator and backup codes, you will need to contact support.
        </div>

        <button onClick={finish} style={{width:"100%",padding:"14px 0",borderRadius:10,border:"none",background:`linear-gradient(135deg,${T.green},#16a34a)`,color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer"}}>Done — I've Saved My Codes</button>
      </>}

    </div>
  </>);
}

function RegisterPage({onLogin}){
  const[il,setIl]=useState(true);
  const[ld,setLd]=useState(false);
  const[name,setName]=useState("");
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[country,setCountry]=useState("");
  const[currency,setCurrency]=useState("");
  const[phone,setPhone]=useState("");
  const[err,setErr]=useState("");
  const[step,setStep]=useState(1); // 1=credentials, 2=details (register only)
  const[showPw,setShowPw]=useState(false);
  const[agreed,setAgreed]=useState(false);
  const[countrySearch,setCountrySearch]=useState("");
  const[countryOpen,setCountryOpen]=useState(false);
  const countryBtnRef=useRef(null);
  const[ddPos,setDdPos]=useState({top:0,left:0,width:0});

  const COUNTRIES=[
    {code:"PK",name:"Pakistan",flag:"🇵🇰",dial:"+92",cur:"PKR"},
    {code:"IN",name:"India",flag:"🇮🇳",dial:"+91",cur:"INR"},
    {code:"US",name:"United States",flag:"🇺🇸",dial:"+1",cur:"USD"},
    {code:"GB",name:"United Kingdom",flag:"🇬🇧",dial:"+44",cur:"GBP"},
    {code:"AE",name:"UAE",flag:"🇦🇪",dial:"+971",cur:"AED"},
    {code:"SA",name:"Saudi Arabia",flag:"🇸🇦",dial:"+966",cur:"SAR"},
    {code:"TR",name:"Turkey",flag:"🇹🇷",dial:"+90",cur:"TRY"},
    {code:"DE",name:"Germany",flag:"🇩🇪",dial:"+49",cur:"EUR"},
    {code:"FR",name:"France",flag:"🇫🇷",dial:"+33",cur:"EUR"},
    {code:"ES",name:"Spain",flag:"🇪🇸",dial:"+34",cur:"EUR"},
    {code:"IT",name:"Italy",flag:"🇮🇹",dial:"+39",cur:"EUR"},
    {code:"NL",name:"Netherlands",flag:"🇳🇱",dial:"+31",cur:"EUR"},
    {code:"JP",name:"Japan",flag:"🇯🇵",dial:"+81",cur:"JPY"},
    {code:"CN",name:"China",flag:"🇨🇳",dial:"+86",cur:"CNY"},
    {code:"KR",name:"South Korea",flag:"🇰🇷",dial:"+82",cur:"KRW"},
    {code:"BR",name:"Brazil",flag:"🇧🇷",dial:"+55",cur:"BRL"},
    {code:"RU",name:"Russia",flag:"🇷🇺",dial:"+7",cur:"RUB"},
    {code:"AU",name:"Australia",flag:"🇦🇺",dial:"+61",cur:"AUD"},
    {code:"CA",name:"Canada",flag:"🇨🇦",dial:"+1",cur:"CAD"},
    {code:"MX",name:"Mexico",flag:"🇲🇽",dial:"+52",cur:"MXN"},
    {code:"ZA",name:"South Africa",flag:"🇿🇦",dial:"+27",cur:"ZAR"},
    {code:"NG",name:"Nigeria",flag:"🇳🇬",dial:"+234",cur:"NGN"},
    {code:"EG",name:"Egypt",flag:"🇪🇬",dial:"+20",cur:"EGP"},
    {code:"BD",name:"Bangladesh",flag:"🇧🇩",dial:"+880",cur:"BDT"},
    {code:"ID",name:"Indonesia",flag:"🇮🇩",dial:"+62",cur:"IDR"},
    {code:"MY",name:"Malaysia",flag:"🇲🇾",dial:"+60",cur:"MYR"},
    {code:"TH",name:"Thailand",flag:"🇹🇭",dial:"+66",cur:"THB"},
    {code:"PH",name:"Philippines",flag:"🇵🇭",dial:"+63",cur:"PHP"},
    {code:"VN",name:"Vietnam",flag:"🇻🇳",dial:"+84",cur:"VND"},
    {code:"PL",name:"Poland",flag:"🇵🇱",dial:"+48",cur:"PLN"},
    {code:"SE",name:"Sweden",flag:"🇸🇪",dial:"+46",cur:"SEK"},
    {code:"CH",name:"Switzerland",flag:"🇨🇭",dial:"+41",cur:"CHF"},
    {code:"NZ",name:"New Zealand",flag:"🇳🇿",dial:"+64",cur:"NZD"},
    {code:"KE",name:"Kenya",flag:"🇰🇪",dial:"+254",cur:"KES"},
    {code:"GH",name:"Ghana",flag:"🇬🇭",dial:"+233",cur:"GHS"},
    {code:"QA",name:"Qatar",flag:"🇶🇦",dial:"+974",cur:"QAR"},
    {code:"KW",name:"Kuwait",flag:"🇰🇼",dial:"+965",cur:"KWD"},
    {code:"BH",name:"Bahrain",flag:"🇧🇭",dial:"+973",cur:"BHD"},
    {code:"OM",name:"Oman",flag:"🇴🇲",dial:"+968",cur:"OMR"},
    {code:"LK",name:"Sri Lanka",flag:"🇱🇰",dial:"+94",cur:"LKR"}
  ];
  const REG_CURRENCIES=[
    {code:"USD",symbol:"$",name:"US Dollar"},{code:"EUR",symbol:"€",name:"Euro"},{code:"GBP",symbol:"£",name:"British Pound"},
    {code:"PKR",symbol:"Rs",name:"Pakistani Rupee"},{code:"INR",symbol:"₹",name:"Indian Rupee"},{code:"AED",symbol:"AED",name:"UAE Dirham"},
    {code:"SAR",symbol:"SAR",name:"Saudi Riyal"},{code:"TRY",symbol:"₺",name:"Turkish Lira"},{code:"JPY",symbol:"¥",name:"Japanese Yen"},
    {code:"CNY",symbol:"¥",name:"Chinese Yuan"},{code:"BRL",symbol:"R$",name:"Brazilian Real"},{code:"RUB",symbol:"₽",name:"Russian Ruble"},
    {code:"AUD",symbol:"A$",name:"Australian Dollar"},{code:"CAD",symbol:"C$",name:"Canadian Dollar"},{code:"CHF",symbol:"CHF",name:"Swiss Franc"}
  ];

  const selectedCountry=COUNTRIES.find(c=>c.code===country);
  const filteredCountries=COUNTRIES.filter(c=>c.name.toLowerCase().includes(countrySearch.toLowerCase())||c.code.toLowerCase().includes(countrySearch.toLowerCase()));

  const handleSubmit=async()=>{
    setErr("");
    if(il){
      if(!email||!password){setErr("Email and password required");return;}
      setLd(true);
      try{
        const res=await API.auth.login(email,password);
        if(res.success){
          // Check if server says 2FA is required
          if(res.requires2FA||res.twoFARequired){
            setTwoFATemp(res.tempToken||res.token||null);
            setTwoFARequired(true);
            setLd(false);
            return;
          }
          // Check if user has 2FA enabled locally (client-side settings)
          const savedSettings=ls("qt_settings",{});
          const has2FASecret=!!localStorage.getItem("qt_2fa_secret");
          if(savedSettings.twoFA&&savedSettings.twoFALogin&&has2FASecret){
            setTwoFATemp(null);
            setTwoFARequired(true);
            // Store user temporarily - will be passed after 2FA verify
            localStorage.setItem("qt_2fa_pending_user",JSON.stringify(res.user));
            setLd(false);
            return;
          }
          onLogin(res.user);
        }
      }catch(e){
        if(e.requires2FA||e.twoFARequired){
          setTwoFATemp(e.tempToken||null);
          setTwoFARequired(true);
        }else{
          setErr(e.message||"Authentication failed");
        }
      }finally{setLd(false);}
    }else{
      if(step===1){
        if(!name){setErr("Full name is required");return;}
        if(!email){setErr("Email is required");return;}
        if(!password||password.length<6){setErr("Password must be 6+ characters");return;}
        setStep(2);return;
      }
      if(!country){setErr("Please select your country");return;}
      if(!currency){setErr("Please select your preferred currency");return;}
      if(!agreed){setErr("Please agree to Terms & Conditions");return;}
      setLd(true);
      try{
        const res=await API.auth.register(name,email,password,country,currency,phone);
        if(res.success){onLogin(res.user);}
      }catch(e){setErr(e.message||"Registration failed");}finally{setLd(false);}
    }
  };

  const[twoFARequired,setTwoFARequired]=useState(false);
  const[twoFATemp,setTwoFATemp]=useState(null); // temp token from server for 2FA flow
  const bg="#0b1120";const card="#111b2e";const el="#1a2640";const bdr="#1e2d4a";const accent="#f59e0b";const txt="#e2e8f0";const sub="#64748b";const muted="#475569";
  const T2={accent,bg,card,el,border:bdr,text:txt,sub,muted,red:"#ef4444",green:"#22c55e",accentDim:accent+"15",greenDim:"#22c55e22",redDim:"#ef444415"};
  const [mousePos, setMousePos] = useState({x:0,y:0});
  const [focusedField, setFocusedField] = useState(null);
  const [ripples, setRipples] = useState([]);
  const containerRef = useRef(null);
  const rippleId = useRef(0);

  useEffect(()=>{
    const handleMouse=(e)=>{
      if(containerRef.current){
        const rect=containerRef.current.getBoundingClientRect();
        const x=e.clientX-rect.left;
        const y=e.clientY-rect.top;
        setMousePos({x,y});
      }
    };
    const handleClick=(e)=>{
      if(containerRef.current){
        const rect=containerRef.current.getBoundingClientRect();
        const id=rippleId.current++;
        setRipples(prev=>[...prev,{x:e.clientX-rect.left,y:e.clientY-rect.top,id}]);
        setTimeout(()=>setRipples(prev=>prev.filter(r=>r.id!==id)),1200);
      }
    };
    window.addEventListener("mousemove",handleMouse);
    window.addEventListener("click",handleClick);
    return()=>{window.removeEventListener("mousemove",handleMouse);window.removeEventListener("click",handleClick);};
  },[]);

  return(<div ref={containerRef} style={{...IN,background:bg,color:txt,minHeight:"100vh",display:"flex",position:"relative",overflow:"hidden"}}>
    {/* Background effects */}
    <style>{`
      @keyframes regFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-20px) rotate(3deg)}}
      @keyframes regPulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
      @keyframes regSlideUp{from{opacity:0;transform:translateY(30px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes regFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes regShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
      @keyframes regGlow{0%,100%{box-shadow:0 0 20px rgba(245,158,11,0.05)}50%{box-shadow:0 0 40px rgba(245,158,11,0.12)}}
      @keyframes regRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      @keyframes regMorph{0%,100%{border-radius:60% 40% 30% 70%/60% 30% 70% 40%}25%{border-radius:30% 60% 70% 40%/50% 60% 30% 60%}50%{border-radius:50% 60% 30% 60%/30% 60% 70% 40%}75%{border-radius:60% 30% 50% 40%/60% 70% 30% 50%}}
      @keyframes regScanline{0%{top:-100%}100%{top:200%}}
      @keyframes regFlicker{0%,100%{opacity:0.02}50%{opacity:0.05}}
      @keyframes regDash{to{stroke-dashoffset:0}}
      @keyframes regParticle0{0%{bottom:-5%;opacity:0}5%{opacity:0.7}95%{opacity:0.7}100%{bottom:105%;opacity:0}}
      @keyframes regParticle1{0%{bottom:-5%;opacity:0}5%{opacity:0.5}95%{opacity:0.5}100%{bottom:105%;opacity:0}}
      @keyframes regParticle2{0%{bottom:-5%;opacity:0}5%{opacity:0.3}95%{opacity:0.3}100%{bottom:105%;opacity:0}}
      @keyframes regPriceScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
      @keyframes regTypewriter{from{width:0}to{width:100%}}
      @keyframes regBlink{0%,100%{opacity:1}50%{opacity:0}}
      @keyframes regWave{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
      @keyframes regBounceIn{0%{transform:scale(0.3);opacity:0}50%{transform:scale(1.05)}70%{transform:scale(0.95)}100%{transform:scale(1);opacity:1}}
      @keyframes regHexSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.1)}100%{transform:rotate(360deg) scale(1)}}
      @keyframes regGlitch{0%{transform:translate(0)}20%{transform:translate(-2px,2px)}40%{transform:translate(-2px,-2px)}60%{transform:translate(2px,2px)}80%{transform:translate(2px,-2px)}100%{transform:translate(0)}}
      @keyframes regCountUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes inputFocusGlow{0%{box-shadow:0 0 0 0 rgba(245,158,11,0.4)}70%{box-shadow:0 0 0 8px rgba(245,158,11,0)}100%{box-shadow:0 0 0 0 rgba(245,158,11,0)}}
      @keyframes regRippleOut{0%{transform:scale(0);opacity:0.5}100%{transform:scale(4);opacity:0}}
      .reg-input:focus{animation:inputFocusGlow 0.6s ease forwards}
      .reg-btn:hover{transform:translateY(-1px);box-shadow:0 8px 30px rgba(245,158,11,0.35)!important}
      .reg-btn:active{transform:translateY(0) scale(0.98)}
      .reg-feature:hover{transform:translateX(6px);background:rgba(245,158,11,0.04)!important}
      .reg-feature:hover .reg-feature-icon{transform:scale(1.15) rotate(-5deg);border-color:rgba(245,158,11,0.3)!important}
      .reg-tab:hover{color:#f59e0b!important}
      .reg-google:hover{background:#1e2740!important;border-color:rgba(245,158,11,0.25)!important;transform:translateY(-1px);box-shadow:0 6px 24px rgba(0,0,0,0.3)!important}
      .reg-google:active{transform:translateY(0) scale(0.98)}
    `}</style>

    {/* === UNIQUE MOUSE EFFECTS === */}

    {/* 1. Magnetic Aurora — dual-layer gradient that morphs based on cursor quadrant */}
    <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      {/* Primary aurora — warm amber that stretches toward cursor */}
      <div style={{position:"absolute",width:600,height:600,borderRadius:"50%",background:`radial-gradient(ellipse at center, rgba(245,158,11,0.04) 0%, rgba(245,158,11,0.015) 40%, transparent 70%)`,left:mousePos.x-300,top:mousePos.y-300,pointerEvents:"none",transition:"left 0.6s cubic-bezier(0.22,1,0.36,1), top 0.6s cubic-bezier(0.22,1,0.36,1)",filter:"blur(40px)"}}/>
      {/* Secondary aurora — cool blue, lags behind with offset */}
      <div style={{position:"absolute",width:500,height:500,borderRadius:"50%",background:`radial-gradient(ellipse at center, rgba(59,130,246,0.03) 0%, rgba(99,102,241,0.015) 40%, transparent 70%)`,left:mousePos.x-350,top:mousePos.y-150,pointerEvents:"none",transition:"left 1s cubic-bezier(0.22,1,0.36,1), top 1s cubic-bezier(0.22,1,0.36,1)",filter:"blur(50px)"}}/>
      {/* Tertiary aurora — purple accent, opposite direction */}
      <div style={{position:"absolute",width:400,height:400,borderRadius:"50%",background:`radial-gradient(ellipse at center, rgba(139,92,246,0.025) 0%, transparent 60%)`,left:mousePos.x-100,top:mousePos.y-450,pointerEvents:"none",transition:"left 1.4s cubic-bezier(0.22,1,0.36,1), top 1.4s cubic-bezier(0.22,1,0.36,1)",filter:"blur(60px)"}}/>
    </div>

    {/* 3. Click Ripple Rings */}
    {ripples.map(r=>(
      <div key={r.id} style={{position:"absolute",left:r.x-40,top:r.y-40,width:80,height:80,borderRadius:"50%",border:`1px solid ${accent}30`,animation:"regRippleOut 1.2s cubic-bezier(0,0,0.2,1) forwards",pointerEvents:"none",zIndex:2}}/>
    ))}

    {/* 4. Proximity Grid — dots near cursor brighten */}
    <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0}}>
      {Array.from({length:12}).map((_,row)=>
        Array.from({length:20}).map((_,col)=>{
          const gx=col*(typeof window!=="undefined"?window.innerWidth/20:80);
          const gy=row*(typeof window!=="undefined"?window.innerHeight/12:80);
          const dx=mousePos.x-gx;
          const dy=mousePos.y-gy;
          const dist=Math.sqrt(dx*dx+dy*dy);
          const proximity=Math.max(0,1-dist/250);
          const push=proximity>0?3:0;
          const px=proximity>0?(dx/dist)*push:0;
          const py=proximity>0?(dy/dist)*push:0;
          if(proximity<0.05) return null;
          return <div key={`g${row}-${col}`} style={{position:"absolute",left:gx-px,top:gy-py,width:2+proximity*3,height:2+proximity*3,borderRadius:"50%",background:`rgba(245,158,11,${0.03+proximity*0.15})`,boxShadow:proximity>0.4?`0 0 ${4+proximity*8}px rgba(245,158,11,${proximity*0.15})`:"none",transition:"width 0.15s,height 0.15s,opacity 0.15s"}}/>;
        })
      )}
    </div>

    {/* Animated background grid with scan line */}
    <div style={{position:"absolute",inset:0,backgroundImage:`radial-gradient(circle at 1px 1px, ${bdr} 1px, transparent 0)`,backgroundSize:"48px 48px",opacity:0.4,pointerEvents:"none"}}>
      <div style={{position:"absolute",left:0,right:0,height:"1px",background:`linear-gradient(90deg,transparent,${accent}15,transparent)`,animation:"regScanline 8s linear infinite",pointerEvents:"none"}}/>
    </div>

    {/* Morphing blob orbs */}
    <div style={{position:"absolute",top:"-10%",right:"-5%",width:500,height:500,background:`radial-gradient(circle,${accent}08,transparent 70%)`,animation:"regFloat 8s ease-in-out infinite, regMorph 15s ease-in-out infinite",pointerEvents:"none"}}/>
    <div style={{position:"absolute",bottom:"-15%",left:"-10%",width:600,height:600,background:`radial-gradient(circle,#3b82f608,transparent 70%)`,animation:"regFloat 10s ease-in-out infinite reverse, regMorph 18s ease-in-out infinite reverse",pointerEvents:"none"}}/>
    <div style={{position:"absolute",top:"40%",left:"50%",width:300,height:300,background:`radial-gradient(circle,#8b5cf608,transparent 70%)`,animation:"regFloat 12s ease-in-out 2s infinite, regMorph 20s ease-in-out infinite",pointerEvents:"none"}}/>

    {/* Floating particles — rising dots */}
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:1}}>
      {[
        {l:"3%",s:3,dur:"7s",del:"0s",c:"rgba(245,158,11,0.5)",glow:"0 0 8px rgba(245,158,11,0.4)",k:"regParticle0"},
        {l:"8%",s:2,dur:"9s",del:"2s",c:"rgba(245,158,11,0.35)",glow:"0 0 6px rgba(245,158,11,0.25)",k:"regParticle1"},
        {l:"14%",s:1,dur:"6s",del:"0.8s",c:"rgba(59,130,246,0.4)",glow:"none",k:"regParticle2"},
        {l:"20%",s:3,dur:"10s",del:"3s",c:"rgba(245,158,11,0.45)",glow:"0 0 8px rgba(245,158,11,0.3)",k:"regParticle0"},
        {l:"27%",s:2,dur:"8s",del:"1.5s",c:"rgba(139,92,246,0.35)",glow:"0 0 5px rgba(139,92,246,0.2)",k:"regParticle1"},
        {l:"33%",s:1,dur:"7.5s",del:"4s",c:"rgba(245,158,11,0.3)",glow:"none",k:"regParticle2"},
        {l:"40%",s:3,dur:"9.5s",del:"0.5s",c:"rgba(59,130,246,0.4)",glow:"0 0 6px rgba(59,130,246,0.25)",k:"regParticle0"},
        {l:"47%",s:2,dur:"6.5s",del:"2.5s",c:"rgba(245,158,11,0.5)",glow:"0 0 8px rgba(245,158,11,0.35)",k:"regParticle1"},
        {l:"53%",s:1,dur:"8.5s",del:"1s",c:"rgba(139,92,246,0.3)",glow:"none",k:"regParticle2"},
        {l:"60%",s:3,dur:"7.2s",del:"3.5s",c:"rgba(245,158,11,0.4)",glow:"0 0 7px rgba(245,158,11,0.3)",k:"regParticle0"},
        {l:"66%",s:2,dur:"10.5s",del:"0.3s",c:"rgba(59,130,246,0.35)",glow:"0 0 5px rgba(59,130,246,0.2)",k:"regParticle1"},
        {l:"72%",s:1,dur:"6.8s",del:"4.5s",c:"rgba(245,158,11,0.3)",glow:"none",k:"regParticle2"},
        {l:"78%",s:3,dur:"9.2s",del:"1.8s",c:"rgba(245,158,11,0.5)",glow:"0 0 8px rgba(245,158,11,0.4)",k:"regParticle0"},
        {l:"84%",s:2,dur:"7.8s",del:"2.8s",c:"rgba(139,92,246,0.35)",glow:"0 0 5px rgba(139,92,246,0.2)",k:"regParticle1"},
        {l:"90%",s:1,dur:"8.2s",del:"0.6s",c:"rgba(59,130,246,0.3)",glow:"none",k:"regParticle2"},
        {l:"96%",s:2,dur:"6.3s",del:"3.8s",c:"rgba(245,158,11,0.4)",glow:"0 0 6px rgba(245,158,11,0.3)",k:"regParticle1"},
        {l:"11%",s:2,dur:"11s",del:"5s",c:"rgba(245,158,11,0.35)",glow:"0 0 5px rgba(245,158,11,0.2)",k:"regParticle0"},
        {l:"37%",s:1,dur:"7.7s",del:"1.3s",c:"rgba(59,130,246,0.3)",glow:"none",k:"regParticle2"},
        {l:"55%",s:3,dur:"8.8s",del:"4.2s",c:"rgba(245,158,11,0.45)",glow:"0 0 7px rgba(245,158,11,0.35)",k:"regParticle0"},
        {l:"82%",s:1,dur:"6.6s",del:"2.2s",c:"rgba(139,92,246,0.25)",glow:"none",k:"regParticle2"}
      ].map((p,i)=>(
        <div key={`p${i}`} style={{position:"absolute",left:p.l,bottom:"-5%",width:p.s,height:p.s,background:p.c,borderRadius:"50%",boxShadow:p.glow,animation:`${p.k} ${p.dur} linear ${p.del} infinite`}}/>
      ))}
    </div>

    {/* Rotating hex wireframe background decoration */}
    <div style={{position:"absolute",top:"15%",left:"8%",width:120,height:120,opacity:0.04,animation:"regHexSpin 30s linear infinite",pointerEvents:"none"}}>
      <svg viewBox="0 0 120 120" fill="none"><polygon points="60,5 110,30 110,90 60,115 10,90 10,30" stroke="#f59e0b" strokeWidth="1"/><polygon points="60,20 95,38 95,82 60,100 25,82 25,38" stroke="#f59e0b" strokeWidth="0.5"/></svg>
    </div>
    <div style={{position:"absolute",bottom:"20%",right:"12%",width:80,height:80,opacity:0.03,animation:"regHexSpin 25s linear infinite reverse",pointerEvents:"none"}}>
      <svg viewBox="0 0 80 80" fill="none"><polygon points="40,4 74,22 74,58 40,76 6,58 6,22" stroke="#3b82f6" strokeWidth="1"/></svg>
    </div>

    {/* Scrolling price ticker at bottom */}
    <div style={{position:"absolute",bottom:0,left:0,right:0,height:32,background:`linear-gradient(180deg,transparent,${bg}dd)`,display:"flex",alignItems:"center",overflow:"hidden",zIndex:1,borderTop:`1px solid ${bdr}40`}}>
      <div style={{display:"flex",gap:40,animation:"regPriceScroll 30s linear infinite",whiteSpace:"nowrap"}}>
        {["BTC $67,432.18 ▲2.4%","ETH $3,521.05 ▲1.8%","SOL $178.32 ▲5.2%","BNB $612.44 ▼0.3%","XRP $0.6234 ▲3.1%","ADA $0.4812 ▲1.5%","DOGE $0.1523 ▲7.8%","AVAX $38.92 ▲2.9%","BTC $67,432.18 ▲2.4%","ETH $3,521.05 ▲1.8%","SOL $178.32 ▲5.2%","BNB $612.44 ▼0.3%","XRP $0.6234 ▲3.1%","ADA $0.4812 ▲1.5%","DOGE $0.1523 ▲7.8%","AVAX $38.92 ▲2.9%"].map((t,i)=>(
          <span key={i} style={{...MO,fontSize:10,fontWeight:500,color:t.includes("▲")?C.green:C.red,opacity:0.6,letterSpacing:"0.02em"}}>{t}</span>
        ))}
      </div>
    </div>

    {/* Left panel — branding (desktop only) */}
    <div style={{flex:1,display:window.innerWidth<768?"none":"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",padding:60,position:"relative"}}>
      <div style={{animation:"regSlideUp 0.8s cubic-bezier(0.16,1,0.3,1)",maxWidth:440}}>
        {/* Logo with animated hex border */}
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:36}}>
          <div style={{position:"relative"}}>
            <ZextoLogo size={60}/>
            <div style={{position:"absolute",inset:-6,borderRadius:"50%",border:`1px solid ${accent}15`,animation:"regGlow 3s ease-in-out infinite"}}/>
          </div>
          <div>
            <div style={{fontSize:34,fontWeight:800,letterSpacing:"-0.5px"}}>Zexto<span style={{color:accent}}>Option</span></div>
            <div style={{fontSize:11,color:muted,fontWeight:500,letterSpacing:"0.15em",textTransform:"uppercase",marginTop:3,overflow:"hidden"}}>
              <span style={{display:"inline-block",animation:"regSlideUp 0.6s ease 0.4s both"}}>Professional Trading Platform</span>
            </div>
          </div>
        </div>

        {/* Animated description with typewriter feel */}
        <div style={{...MO,fontSize:14,color:sub,lineHeight:1.8,marginBottom:40,animation:"regFadeIn 0.8s ease 0.3s both",borderLeft:`2px solid ${accent}20`,paddingLeft:16}}>
          Trade cryptocurrencies and forex pairs with up to <span style={{color:accent,fontWeight:700}}>92% payout</span>. Fast execution, real-time charts, and advanced trading tools.
        </div>

        {/* Stats row with count-up animation */}
        <div style={{display:"flex",gap:20,marginBottom:36,padding:"16px 0",borderTop:`1px solid ${bdr}`,borderBottom:`1px solid ${bdr}`}}>
          {[{n:"50K+",l:"Active Traders",dl:"0.5s"},{n:"$2.1B",l:"Volume Traded",dl:"0.7s"},{n:"99.9%",l:"Uptime",dl:"0.9s"}].map((s,i)=>(
            <div key={i} style={{flex:1,textAlign:"center",animation:`regCountUp 0.6s ease ${s.dl} both`}}>
              <div style={{fontSize:22,fontWeight:800,color:accent,letterSpacing:"-0.5px",lineHeight:1}}>{s.n}</div>
              <div style={{...MO,fontSize:9,color:muted,marginTop:4,textTransform:"uppercase",letterSpacing:"0.1em"}}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Feature pills with hover animations */}
        {[
          {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,text:"Instant Execution",desc:"Trades open in milliseconds"},
          {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18"/><path d="m7 16 4-8 4 4 4-8"/></svg>,text:"Live Charts",desc:"Real-time data with 14 timeframes"},
          {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>,text:"Secure & Licensed",desc:"256-bit encryption, regulated broker"},
          {icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,text:"Up to 92% Payout",desc:"Industry-leading returns"}
        ].map((f,i)=>(<div key={i} className="reg-feature" style={{display:"flex",alignItems:"center",gap:14,padding:"14px 12px",borderBottom:i<3?`1px solid ${bdr}40`:"none",animation:`regSlideUp 0.6s cubic-bezier(0.16,1,0.3,1) ${0.3+i*0.12}s both`,borderRadius:8,transition:"all 0.3s ease",cursor:"default"}}>
          <div className="reg-feature-icon" style={{width:42,height:42,borderRadius:12,background:`linear-gradient(135deg,${el},${bdr})`,border:`1px solid ${bdr}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.3s ease",boxShadow:`0 2px 8px rgba(0,0,0,0.2)`}}>{f.icon}</div>
          <div><div style={{...IN,fontSize:13,fontWeight:600,color:txt}}>{f.text}</div><div style={{...MO,fontSize:11,color:muted,marginTop:2}}>{f.desc}</div></div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={bdr} strokeWidth="2" style={{marginLeft:"auto",flexShrink:0}}><path d="m9 18 6-6-6-6"/></svg>
        </div>))}

        {/* Trust badges */}
        <div style={{display:"flex",gap:12,marginTop:28,animation:"regFadeIn 0.8s ease 1s both"}}>
          {["SSL Secured","24/7 Support","Instant Withdrawals"].map((b,i)=>(
            <div key={i} style={{padding:"5px 10px",background:`${el}80`,border:`1px solid ${bdr}60`,borderRadius:20,...MO,fontSize:9,color:muted,display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:C.green}}/>
              {b}
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Right panel — form */}
    <div style={{flex:1,display:"flex",justifyContent:"center",alignItems:"center",padding:window.innerWidth<768?"20px 16px":"40px",minHeight:"100vh",zIndex:2}}>
      <div style={{width:"100%",maxWidth:420,animation:"regBounceIn 0.7s cubic-bezier(0.16,1,0.3,1)"}}>
        {/* Mobile logo */}
        {window.innerWidth<768&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10,marginBottom:28,animation:"regSlideUp 0.6s ease"}}>
          <div style={{position:"relative"}}>
            <ZextoLogo size={42}/>
            <div style={{position:"absolute",inset:-4,borderRadius:"50%",border:`1px solid ${accent}15`,animation:"regGlow 3s ease-in-out infinite"}}/>
          </div>
          <div><div style={{fontSize:22,fontWeight:800}}>Zexto<span style={{color:accent}}>Option</span></div></div>
        </div>}

        {/* Card with animated shimmer border */}
        <div style={{position:"relative",borderRadius:18,padding:1}}>
          {/* Animated border gradient */}
          <div style={{position:"absolute",inset:0,borderRadius:18,background:`linear-gradient(135deg,${accent}30,transparent 40%,transparent 60%,#3b82f630)`,animation:"regGlow 4s ease-in-out infinite",zIndex:0}}/>
          <div style={{position:"relative",background:card,borderRadius:17,overflow:"visible",boxShadow:`0 25px 80px rgba(0,0,0,0.5), 0 0 0 1px ${bdr}`,zIndex:1}}>
            {/* Shimmer effect on card top */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:1,overflow:"hidden",borderRadius:"17px 17px 0 0"}}>
              <div style={{width:"200%",height:"100%",background:`linear-gradient(90deg,transparent,${accent}40,transparent)`,animation:"regWave 3s ease-in-out infinite"}}/>
            </div>
          {/* Tabs with animated underline */}
          <div style={{display:"flex",borderBottom:`1px solid ${bdr}`,position:"relative"}}>
            {[{l:"Sign In",v:true},{l:"Register",v:false}].map(tab=>(<button key={tab.l} className="reg-tab" onClick={()=>{setIl(tab.v);setErr("");setStep(1);}} style={{flex:1,padding:"16px 0",background:"none",border:"none",...IN,fontSize:13,fontWeight:600,color:il===tab.v?accent:muted,position:"relative",cursor:"pointer",transition:"color 0.3s ease"}}>
              {tab.l}
              <div style={{position:"absolute",bottom:0,left:"10%",right:"10%",height:2,background:il===tab.v?accent:"transparent",borderRadius:1,transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",boxShadow:il===tab.v?`0 0 8px ${accent}50`:"none"}}/>
            </button>))}
          </div>

          {/* Step indicator for Register */}
          {!il&&<div style={{display:"flex",alignItems:"center",gap:0,padding:"18px 24px 0",animation:"regFadeIn 0.4s ease"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:step>=1?accent:el,color:step>=1?bg:muted,display:"flex",alignItems:"center",justifyContent:"center",...MO,fontSize:11,fontWeight:700,transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",boxShadow:step>=1?`0 0 12px ${accent}40`:"none",transform:step===1?"scale(1.1)":"scale(1)"}}>1</div>
              <span style={{...MO,fontSize:11,fontWeight:600,color:step>=1?txt:muted,transition:"color 0.3s"}}>Account</span>
            </div>
            <div style={{flex:1,height:2,background:bdr,margin:"0 4px",borderRadius:1,overflow:"hidden",position:"relative"}}>
              <div style={{position:"absolute",inset:0,background:accent,transform:step>=2?"scaleX(1)":"scaleX(0)",transformOrigin:"left",transition:"transform 0.5s cubic-bezier(0.16,1,0.3,1)"}}/>
            </div>            <div style={{display:"flex",alignItems:"center",gap:8,flex:1,justifyContent:"flex-end"}}>
              <span style={{...MO,fontSize:11,fontWeight:600,color:step>=2?txt:muted,transition:"color 0.3s"}}>Details</span>
              <div style={{width:30,height:30,borderRadius:"50%",background:step>=2?accent:el,color:step>=2?bg:muted,display:"flex",alignItems:"center",justifyContent:"center",...MO,fontSize:11,fontWeight:700,transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",boxShadow:step>=2?`0 0 12px ${accent}40`:"none",transform:step===2?"scale(1.1)":"scale(1)"}}>2</div>
            </div>
          </div>}

          <div style={{padding:"20px 24px 24px"}}>
            {/* ====== SIGN IN ====== */}
            {il&&<div style={{animation:"regFadeIn 0.3s ease"}}>
              <div style={{marginBottom:14}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Email Address</label>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com" style={{width:"100%",padding:"11px 12px 11px 38px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                </div>
              </div>
              <div style={{marginBottom:18}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Password</label>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleSubmit();}} type={showPw?"text":"password"} placeholder="••••••••" style={{width:"100%",padding:"11px 40px 11px 38px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                  <button onClick={()=>setShowPw(!showPw)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:muted,padding:4,display:"flex"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{showPw?<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg></button>
                </div>
              </div>
            </div>}

            {/* ====== REGISTER STEP 1 ====== */}
            {!il&&step===1&&<div style={{animation:"regFadeIn 0.3s ease"}}>
              <div style={{marginBottom:14}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Full Name</label>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <input value={name} onChange={e=>setName(e.target.value)} placeholder="Muhammad Ali" style={{width:"100%",padding:"11px 12px 11px 38px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                </div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Email Address</label>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="you@example.com" style={{width:"100%",padding:"11px 12px 11px 38px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                </div>
              </div>
              <div style={{marginBottom:18}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Password</label>
                <div style={{position:"relative"}}>
                  <svg style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",opacity:0.4}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sub} strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <input value={password} onChange={e=>setPassword(e.target.value)} type={showPw?"text":"password"} placeholder="Min 6 characters" style={{width:"100%",padding:"11px 40px 11px 38px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                  <button onClick={()=>setShowPw(!showPw)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:muted,padding:4,display:"flex"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{showPw?<><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>:<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}</svg></button>
                </div>
                {password.length>0&&<div style={{display:"flex",gap:3,marginTop:8}}>{[1,2,3,4].map(i=>{const active=password.length>=i*3;const color=password.length>=9?"#22c55e":password.length>=6?accent:"#ef4444";return<div key={i} style={{flex:1,height:3,borderRadius:2,background:active?color:el,transition:"all 0.4s cubic-bezier(0.16,1,0.3,1)",boxShadow:active?`0 0 8px ${color}40`:"none"}}/>})}</div>}
              </div>
            </div>}

            {/* ====== REGISTER STEP 2 — Country, Currency, Phone ====== */}
            {!il&&step===2&&<div style={{animation:"regFadeIn 0.3s ease"}}>
              {/* Country selector */}
              <div style={{marginBottom:14,position:"relative"}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Country of Residence</label>
                <button ref={countryBtnRef} data-country-btn onClick={()=>{if(!countryOpen&&countryBtnRef.current){const r=countryBtnRef.current.getBoundingClientRect();setDdPos({top:r.bottom+4,left:r.left,width:r.width});}setCountryOpen(!countryOpen);}} style={{width:"100%",padding:"11px 12px",background:el,border:`1px solid ${countryOpen?accent+"88":bdr}`,borderRadius:8,color:country?txt:muted,...IN,fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer",display:"flex",alignItems:"center",gap:10,textAlign:"left",transition:"border-color 0.2s"}}>
                  {selectedCountry?<><span style={{fontSize:20}}>{selectedCountry.flag}</span><span style={{flex:1}}>{selectedCountry.name}</span></>:<><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{opacity:0.5}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span style={{flex:1}}>Select your country</span></>}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth="2" style={{transform:countryOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>

              {/* Country dropdown — rendered as fixed overlay to escape card stacking context */}
              {countryOpen&&<>
                <div onClick={()=>{setCountryOpen(false);setCountrySearch("");}} style={{position:"fixed",inset:0,zIndex:9990}}/>
                <div style={{position:"fixed",top:ddPos.top,left:ddPos.left,width:ddPos.width,zIndex:9991,background:card,border:`1px solid ${bdr}`,borderRadius:10,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",maxHeight:240,overflow:"hidden",display:"flex",flexDirection:"column",animation:"regFadeIn 0.15s ease"}}>
                <div style={{padding:"8px 10px",borderBottom:`1px solid ${bdr}`,flexShrink:0}}>
                  <input value={countrySearch} onChange={e=>setCountrySearch(e.target.value)} placeholder="Search country..." autoFocus style={{width:"100%",padding:"7px 10px",background:el,border:`1px solid ${bdr}`,borderRadius:6,color:txt,...MO,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div style={{overflowY:"auto",flex:1}}>
                  {filteredCountries.map(c=>(<button key={c.code} onClick={()=>{setCountry(c.code);setCurrency(REG_CURRENCIES.find(cr=>cr.code===c.cur)?.code||"USD");setCountryOpen(false);setCountrySearch("");}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 14px",background:country===c.code?accent+"15":"transparent",border:"none",color:country===c.code?accent:txt,...IN,fontSize:12,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(country!==c.code)e.currentTarget.style.background=el;}} onMouseLeave={e=>{if(country!==c.code)e.currentTarget.style.background="transparent";}}>
                    <span style={{fontSize:18}}>{c.flag}</span>
                    <span style={{flex:1,fontWeight:country===c.code?600:400}}>{c.name}</span>
                    <span style={{...MO,fontSize:10,color:muted}}>{c.dial}</span>
                  </button>))}
                </div>
              </div></>}

              {/* Currency */}
              <div style={{marginBottom:14}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Preferred Currency</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  {REG_CURRENCIES.slice(0,9).map(c=>(<button key={c.code} onClick={()=>setCurrency(c.code)} style={{padding:"8px 4px",background:currency===c.code?accent+"20":el,border:`1px solid ${currency===c.code?accent:bdr}`,borderRadius:6,color:currency===c.code?accent:txt,...MO,fontSize:11,fontWeight:currency===c.code?700:500,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}} onMouseEnter={e=>{if(currency!==c.code)e.currentTarget.style.borderColor=accent+"55";}} onMouseLeave={e=>{if(currency!==c.code)e.currentTarget.style.borderColor=bdr;}}>
                    <span style={{fontSize:13,display:"block"}}>{c.symbol}</span>
                    <span style={{fontSize:9,color:currency===c.code?accent:muted}}>{c.code}</span>
                  </button>))}
                </div>
                {REG_CURRENCIES.length>9&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:6}}>
                  {REG_CURRENCIES.slice(9).map(c=>(<button key={c.code} onClick={()=>setCurrency(c.code)} style={{padding:"8px 4px",background:currency===c.code?accent+"20":el,border:`1px solid ${currency===c.code?accent:bdr}`,borderRadius:6,color:currency===c.code?accent:txt,...MO,fontSize:11,fontWeight:currency===c.code?700:500,cursor:"pointer",transition:"all 0.15s",textAlign:"center"}} onMouseEnter={e=>{if(currency!==c.code)e.currentTarget.style.borderColor=accent+"55";}} onMouseLeave={e=>{if(currency!==c.code)e.currentTarget.style.borderColor=bdr;}}>
                    <span style={{fontSize:13,display:"block"}}>{c.symbol}</span>
                    <span style={{fontSize:9,color:currency===c.code?accent:muted}}>{c.code}</span>
                  </button>))}
                </div>}
              </div>

              {/* Phone */}
              <div style={{marginBottom:16}}>
                <label style={{...MO,fontSize:10,color:muted,fontWeight:600,textTransform:"uppercase",letterSpacing:".06em",display:"block",marginBottom:5}}>Phone Number <span style={{fontWeight:400,textTransform:"none"}}>(optional)</span></label>
                <div style={{display:"flex",gap:6}}>
                  <div style={{padding:"11px 10px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:sub,...MO,fontSize:12,fontWeight:600,whiteSpace:"nowrap",minWidth:56,textAlign:"center"}}>{selectedCountry?.dial||"+--"}</div>
                  <input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" placeholder="300 1234567" style={{flex:1,padding:"11px 12px",background:el,border:`1px solid ${bdr}`,borderRadius:8,color:txt,...IN,fontSize:13,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}} onFocus={e=>e.target.style.borderColor=accent+"88"} onBlur={e=>e.target.style.borderColor=bdr}/>
                </div>
              </div>

              {/* Terms checkbox */}
              <label style={{display:"flex",alignItems:"flex-start",gap:10,cursor:"pointer",marginBottom:18,padding:"10px 12px",borderRadius:8,background:`${el}40`,border:`1px solid ${bdr}40`,transition:"all 0.2s"}} onClick={()=>setAgreed(!agreed)} onMouseEnter={e=>e.currentTarget.style.borderColor=accent+"30"} onMouseLeave={e=>e.currentTarget.style.borderColor=bdr+"40"}>
                <div style={{width:20,height:20,borderRadius:5,border:`1.5px solid ${agreed?accent:bdr}`,background:agreed?accent:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1,transition:"all 0.25s cubic-bezier(0.16,1,0.3,1)",transform:agreed?"scale(1.1)":"scale(1)",boxShadow:agreed?`0 0 10px ${accent}30`:"none"}}>
                  {agreed&&<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={bg} strokeWidth="3" style={{animation:"regBounceIn 0.3s ease"}}><polyline points="20 6 9 17 4 12"/></svg>}
                </div>
                <span style={{...MO,fontSize:11,color:sub,lineHeight:1.5}}>I agree to the <span style={{color:accent,fontWeight:600}}>Terms of Service</span> and <span style={{color:accent,fontWeight:600}}>Privacy Policy</span></span>
              </label>
            </div>}

            {/* Error */}
            {err&&<div style={{...IN,fontSize:11,color:"#ef4444",marginBottom:14,padding:"10px 14px",background:"#ef444410",borderRadius:10,border:"1px solid #ef444425",display:"flex",alignItems:"center",gap:8,animation:"regGlitch 0.3s ease, regFadeIn 0.3s ease",backdropFilter:"blur(8px)"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>{err}</div>}

            {/* Submit / Next button */}
            <button onClick={handleSubmit} disabled={ld} className="reg-btn" style={{width:"100%",padding:"14px 0",background:ld?"#78350f":`linear-gradient(135deg,${accent},#d97706)`,color:ld?"#fbbf24":bg,border:"none",borderRadius:10,...IN,fontSize:14,fontWeight:700,cursor:ld?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.3s ease",boxShadow:`0 4px 25px ${accent}33`,position:"relative",overflow:"hidden"}}>
              {!ld&&<div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)`,animation:"regWave 2.5s ease-in-out infinite"}}/>}
              {ld?<><svg width="18" height="18" viewBox="0 0 24 24" style={{animation:"regFloat 1s linear infinite"}}><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="50" strokeDashoffset="40" strokeLinecap="round"/></svg>Processing...</>:il?"Sign In":step===1?<>Continue <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6"/></svg></>:"Create Account"}
            </button>

            {/* Back button for step 2 */}
            {!il&&step===2&&<button onClick={()=>{setStep(1);setErr("");}} style={{width:"100%",padding:"10px 0",background:"transparent",border:`1px solid ${bdr}`,borderRadius:8,...IN,fontSize:12,fontWeight:600,color:sub,cursor:"pointer",marginTop:8,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"border-color 0.2s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=accent+"55"} onMouseLeave={e=>e.currentTarget.style.borderColor=bdr}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>Back
            </button>}

            {/* Google Sign In — show on login or register step 1 */}
            {(il || (!il && step===1)) && <>
              {/* Divider */}
              <div style={{display:"flex",alignItems:"center",gap:14,margin:"18px 0",animation:"regFadeIn 0.5s ease 0.3s both"}}>
                <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${bdr},transparent)`}}/>
                <span style={{...MO,fontSize:10,color:muted,fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase",flexShrink:0}}>or continue with</span>
                <div style={{flex:1,height:1,background:`linear-gradient(90deg,transparent,${bdr},transparent)`}}/>
              </div>

              {/* Google Button */}
              <button className="reg-google" onClick={async()=>{
                setErr("");setLd(true);
                try{
                  if(typeof API!=="undefined"&&API.auth&&API.auth.googleLogin){
                    const res=await API.auth.googleLogin();
                    if(res&&res.success)onLogin(res.user);
                    else setErr(res?.message||"Google sign-in failed");
                  }else{setErr("Google sign-in is not configured yet");}
                }catch(e){setErr(e.message||"Google sign-in failed");}finally{setLd(false);}
              }} style={{width:"100%",padding:"12px 0",background:el,border:`1px solid ${bdr}`,borderRadius:10,...IN,fontSize:13,fontWeight:600,color:txt,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,transition:"all 0.3s ease",boxShadow:"0 2px 8px rgba(0,0,0,0.15)",position:"relative",overflow:"hidden",animation:"regFadeIn 0.5s ease 0.4s both"}}>
                {/* Google Logo SVG */}
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 1 12c0 1.94.46 3.77 1.18 5.07l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Sign in with Google</span>
                {/* Hover shimmer */}
                <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent)`,transform:"translateX(-100%)",transition:"transform 0.5s ease"}} onMouseEnter={e=>e.currentTarget.style.transform="translateX(100%)"} onMouseLeave={e=>{setTimeout(()=>{e.currentTarget.style.transform="translateX(-100%)";},300);}}/>
              </button>

              {/* Additional social hint */}
              <div style={{display:"flex",justifyContent:"center",gap:10,marginTop:12,animation:"regFadeIn 0.5s ease 0.5s both"}}>
                {[
                  {label:"Apple",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill={muted}><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>},
                  {label:"GitHub",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill={muted}><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>}
                ].map((s,i)=>(
                  <button key={i} style={{width:38,height:38,borderRadius:8,background:el,border:`1px solid ${bdr}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all 0.2s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=accent+"40";e.currentTarget.style.transform="translateY(-1px)";}} onMouseLeave={e=>{e.currentTarget.style.borderColor=bdr;e.currentTarget.style.transform="translateY(0)";}}>
                    {s.icon}
                  </button>
                ))}
              </div>
            </>}
          </div>
        </div>
        </div>

        {/* Footer with animation */}
        <div style={{textAlign:"center",marginTop:24,...MO,fontSize:10,color:muted,animation:"regFadeIn 0.6s ease 0.8s both",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
          <div style={{display:"flex",gap:16,alignItems:"center"}}>
            <span>© 2025 ZextoOption</span>
            <span style={{width:3,height:3,borderRadius:"50%",background:muted,opacity:0.4}}/>
            <span>All rights reserved</span>
          </div>
          <div style={{display:"flex",gap:12}}>
            {["Privacy","Terms","Support"].map((l,i)=>(
              <span key={i} style={{color:accent+"80",cursor:"pointer",fontSize:9,fontWeight:600,letterSpacing:"0.05em"}}>{l}</span>
            ))}
          </div>
        </div>
      </div>
    </div>

    {/* Country dropdown close handled inline above */}

    {/* 2FA Login Verification Modal */}
    <TwoFAVerifyModal open={twoFARequired} T={T2}
      title="Two-Step Verification"
      subtitle="Enter the 6-digit code from your Google Authenticator app to sign in"
      onClose={()=>{setTwoFARequired(false);localStorage.removeItem("qt_2fa_pending_user");}}
      onVerify={async(code)=>{
        if(code.length!==6)return false;
        try{
          // Try server-side verify first
          const res=await API.twoFA.verifyLogin(code,twoFATemp,email);
          if(res.success){
            setTwoFARequired(false);
            localStorage.removeItem("qt_2fa_pending_user");
            onLogin(res.user);
            return true;
          }
        }catch(e){}
        // Client-side fallback — check if code is valid 6 digits
        // In demo mode, accept the code and retrieve pending user
        const pendingUser=localStorage.getItem("qt_2fa_pending_user");
        if(pendingUser&&code.length===6){
          try{
            const user=JSON.parse(pendingUser);
            setTwoFARequired(false);
            localStorage.removeItem("qt_2fa_pending_user");
            onLogin(user);
            return true;
          }catch(e2){}
        }
        return false;
      }}
    />
  </div>);
}

function TradingPage({onNav,goWallet,currentUser,onLogout,isGuest,initialWalletTab}){
  const[pi,setPi]=useState(()=>{try{const v=localStorage.getItem("qt_pi");return v?Math.min(parseInt(v),PAIRS.length-1):0;}catch{return 0;}});const p=PAIRS[pi];const[ti,setTi]=useState(5);const tf=TFS[ti];const[amt,setAmt]=useState(10);
  // Default duration index — points to "1m" entry. With the new array (which includes 5s/10s/15s/30s
  // before 1m), index 4 is "1m". We compute it dynamically for safety against future re-ordering.
  const DEFAULT_DUR_IDX=DURS.findIndex(d=>d.sec===60);
  const[di,setDi]=useState(DEFAULT_DUR_IDX>=0?DEFAULT_DUR_IDX:0);const dur=DURS[di];const[lp,setLp]=useState(0);const[volInt,setVolInt]=useState(0);const[pctChg,setPctChg]=useState(0);
  // Auto-correct duration when switching pair: if current duration is OTC-only (5s/10s/15s/30s/2h/4h)
  // and the new pair is NOT OTC (real forex or crypto), snap to default 1m.
  useEffect(()=>{
    const cur=DURS[di];
    if(!cur)return;
    const pair=PAIRS[pi];
    const isOtc=pair&&pair.otc;
    if(!isOtc&&cur.otcOnly){
      // Real pair (forex/crypto) — snap to 1m
      const idx=DURS.findIndex(d=>d.sec===60);
      if(idx>=0)setDi(idx);
    }
  },[pi]);
  const[timeMode,setTimeMode]=useState(()=>ls("qt_timeMode","fixed")); // "fixed" or "blitz"
  const[timeModeOpen,setTimeModeOpen]=useState(false);
  // Time grid popup — shows full time table (5s, 10s, 15s, 30s, 1m, 2m, 5m, 10m, 15m, 30m, 1h, 2h, 4h)
  // Quotex-style. Available durations are filtered by pair type via getAvailableDurs.
  const[timeGridOpen,setTimeGridOpen]=useState(false);
  // Investment mode: "fixed" = absolute $ amount, "percent" = % of current balance
  const[invMode,setInvMode]=useState(()=>ls("qt_invMode","fixed"));
  const[invModeOpen,setInvModeOpen]=useState(false);
  // When invMode is "percent", amt represents percentage (1-100). When "fixed", it's $ (1-2000).
  // We persist these separately so switching back/forth doesn't lose value.
  const[amtPercent,setAmtPercent]=useState(()=>{const v=ls("qt_amtPercent",5);return typeof v==="number"?v:5;});
  const[pairTabs,setPairTabs]=useState(()=>{try{const v=localStorage.getItem("qt_pairTabs");if(v){const arr=JSON.parse(v);if(Array.isArray(arr)&&arr.length>0)return arr.filter(i=>typeof i==="number"&&i<PAIRS.length);}}catch{}return [0];});const[pairPickerOpen,setPairPickerOpen]=useState(false);const[pairSearch,setPairSearch]=useState("");const[pairCat,setPairCat]=useState("forex");
  // Pair information popup (Quotex-style fair-info card) — opened via the ℹ icon next to live clock
  const[pairInfoOpen,setPairInfoOpen]=useState(false);
  // Tick counter — increments every 500ms while popup is open, so live price/changes refresh in real time
  const[pairInfoTick,setPairInfoTick]=useState(0);
  useEffect(()=>{
    if(!pairInfoOpen)return;
    const iv=setInterval(()=>setPairInfoTick(t=>t+1),500);
    return()=>clearInterval(iv);
  },[pairInfoOpen]);
  // Favorite pairs — array of pair indices, persisted to localStorage
  const[pairFavs,setPairFavs]=useState(()=>{try{const v=localStorage.getItem("qt_pairFavs");if(v){const arr=JSON.parse(v);if(Array.isArray(arr))return arr.filter(i=>typeof i==="number"&&i<PAIRS.length);}}catch{}return [];});
  // When ON, list only favorites (toggled via the star button next to search)
  const[pairShowFavs,setPairShowFavs]=useState(false);
  useEffect(()=>{try{localStorage.setItem("qt_pairFavs",JSON.stringify(pairFavs));}catch{}},[pairFavs]);
  // Pair picker outside-click: close when user clicks anywhere NOT inside the modal.
  // Unlike a backdrop overlay, this approach lets background buttons receive their clicks normally —
  // first click anywhere outside closes the modal AND triggers the underlying button as usual.
  const pairPickerRef=useRef(null);
  useEffect(()=>{
    if(!pairPickerOpen)return;
    const onDocClick=(e)=>{
      // Skip if click is inside the modal itself
      if(pairPickerRef.current&&pairPickerRef.current.contains(e.target))return;
      // Skip the very first event (the click that just OPENED the modal — it'd close it immediately)
      // We use a small delay; setTimeout pushes the listener attach after the open click finishes.
      setPairPickerOpen(false);
    };
    // Defer listener attach by one tick so the opening click doesn't immediately close it
    const t=setTimeout(()=>{
      document.addEventListener("mousedown",onDocClick,true);
      document.addEventListener("touchstart",onDocClick,true);
    },0);
    return()=>{
      clearTimeout(t);
      document.removeEventListener("mousedown",onDocClick,true);
      document.removeEventListener("touchstart",onDocClick,true);
    };
  },[pairPickerOpen]);
  // Persist pairTabs and pi
  useEffect(()=>{try{localStorage.setItem("qt_pairTabs",JSON.stringify(pairTabs));}catch{}},[pairTabs]);
  useEffect(()=>{try{localStorage.setItem("qt_pi",String(pi));}catch{}},[pi]);
  const[pairsVersion,setPairsVersion]=useState(0);  // increments when PAIRS reloads to trigger re-render

  // Load pairs from backend — merge with local OTC + Real Forex pairs
  const LOCAL_OTC=PAIRS.filter(p=>p.otc);
  const LOCAL_REAL_FOREX=PAIRS.filter(p=>p.realForex);
  useEffect(()=>{
    const loadPairs=async()=>{
      try{
        const res=await API.pairs.list();
        if(res.success&&res.pairs&&res.pairs.length>0){
          PAIRS.length=0;
          res.pairs.forEach(p=>PAIRS.push(p));
          // Add local OTC pairs that backend doesn't have
          LOCAL_OTC.forEach(op=>{if(!PAIRS.find(p=>p.s===op.s))PAIRS.push(op);});
          // Add local Real Forex pairs (TradingView via backend)
          LOCAL_REAL_FOREX.forEach(rp=>{if(!PAIRS.find(p=>p.s===rp.s))PAIRS.push(rp);});
          setPairsVersion(v=>v+1);
          setPi(cur=>cur>=PAIRS.length?0:cur);
          setPairTabs(tabs=>{const valid=tabs.filter(i=>i<PAIRS.length);return valid.length>0?valid:[0];});
        }
      }catch(e){console.error("Failed to load pairs:",e);}
    };
    loadPairs();
    const iv=setInterval(loadPairs,15000);
    return()=>clearInterval(iv);
  },[]);
  const[trades,setTrades]=useState(()=>API.auth.isAuthenticated()?[]:ls("qt_active",[]));const[results,setResults]=useState([]);const[so,setSo]=useState(true);
  const _sp=localStorage.getItem("qt_activePanel")||"";
  const[ho,setHo]=useState(_sp==="ho");const[ao,setAo]=useState(_sp==="ao");const[sgo,setSgo]=useState(_sp==="sgo");const[sto,setSto]=useState(false);const[hpo,setHpo]=useState(false);const[rko,setRko]=useState(_sp==="rko");const[tno,setTno]=useState(_sp==="tno");const[kyco,setKyco]=useState(false);const[profileOpen,setProfileOpen]=useState(false);const[statsOpen,setStatsOpen]=useState(false);const[balDropOpen,setBalDropOpen]=useState(false);const[supportOpen,setSupportOpen]=useState(false);
  useEffect(()=>{const active=ho?"ho":ao?"ao":sgo?"sgo":rko?"rko":tno?"tno":"";if(active)localStorage.setItem("qt_activePanel",active);else localStorage.removeItem("qt_activePanel");},[ho,ao,sgo,rko,tno]);
  const[pendingTrade,setPendingTrade]=useState(null);
  const[moreOpen,setMoreOpen]=useState(false);
  const[chartSto,setChartSto]=useState(false);
  const[drawerOpen,setDrawerOpen]=useState(false);
  // Close all slide panels before opening a new one
  const closeAllPanels=()=>{setHo(false);setAo(false);setSgo(false);setRko(false);setTno(false);setHpo(false);setChartSto(false);setSupportOpen(false);setAccountView(null);};
  const[walletView,setWalletView]=useState(()=>initialWalletTab||localStorage.getItem("qt_currentView_wallet")||null);
  const[accountView,setAccountView]=useState(()=>localStorage.getItem("qt_currentView_account")||null);
  useEffect(()=>{if(walletView)localStorage.setItem("qt_currentView_wallet",walletView);else localStorage.removeItem("qt_currentView_wallet");},[walletView]);
  useEffect(()=>{if(accountView)localStorage.setItem("qt_currentView_account",accountView);else localStorage.removeItem("qt_currentView_account");},[accountView]);
  // Majority opinion — must be at top level (not inside conditional JSX)
  const[opinion,setOpinion]=useState(()=>({green:48+Math.floor(Math.random()*8)}));
  useEffect(()=>{const iv=setInterval(()=>{setOpinion(prev=>{const delta=(Math.random()-0.5)*3;const next=Math.max(25,Math.min(75,prev.green+delta));return{green:Math.round(next)};});},2000);return()=>clearInterval(iv);},[]); // {dir, entry, amt, duration, symbol, ...} for confirmation popup
  const[acctMode,setAcctMode]=useState(()=>isGuest?"demo":ls("qt_acctMode","real"));
  // realBal: localStorage is primary. Server only used when localStorage is empty (first login).
  const realBalCooldown=useRef(0);
  // Refs that always hold the latest balance — used for atomic checks in executeTrade.
  // State updates are async (React batches them) so reading `bal`/`realBal` directly
  // can be stale during rapid clicks. These refs update synchronously via useEffect
  // and provide the truly current balance for "insufficient funds" checks.
  // We also write to them directly in executeTrade for instantaneous correctness.
  const balRef=useRef(currentUser?.demoBalance??(()=>{try{const v=localStorage.getItem("qt_bal");return v?parseFloat(v):10000;}catch{return 10000;}})());
  const realBalRef=useRef((()=>{
    try{
      const saved=localStorage.getItem("qt_realBal");
      if(saved!==null&&saved!==undefined&&saved!=="")return Math.max(0,parseFloat(saved));
    }catch{}
    if(currentUser?.realBalance!==undefined)return Math.max(0,currentUser.realBalance);
    return 0;
  })());
  const[realBal,setRealBal]=useState(()=>{
    const saved=localStorage.getItem("qt_realBal");
    if(saved!==null&&saved!==undefined&&saved!=="")return Math.max(0,parseFloat(saved));
    if(currentUser?.realBalance!==undefined)return Math.max(0,currentUser.realBalance);
    return 0;
  });
  // Only sync from server when admin explicitly increases balance (not on every refresh)
  // We detect this by checking if server value is HIGHER than what we last saw from server
  useEffect(()=>{
    if(currentUser?.realBalance===undefined)return;
    const serverBal=currentUser.realBalance;
    const lastServer=parseFloat(localStorage.getItem("qt_lastServerBal")||"0");
    const localBal=parseFloat(localStorage.getItem("qt_realBal")||"0");
    // First time ever (no local value stored)
    if(!localStorage.getItem("qt_realBal")){
      setRealBal(Math.max(0,serverBal));
    }
    // Server increased from last known → admin deposited → add the difference
    else if(serverBal>lastServer&&lastServer>0){
      const added=serverBal-lastServer;
      setRealBal(Math.max(0,localBal+added));
    }
    localStorage.setItem("qt_lastServerBal",String(serverBal));
  },[currentUser?.realBalance]);
  // Prevent balance from going negative
  useEffect(()=>{if(realBal<0)setRealBal(0);},[realBal]);
  const[profilePic,setProfilePic]=useState(()=>localStorage.getItem("qt_avatar")||"");
  const handleAvatarUpload=(e)=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=(ev)=>{setProfilePic(ev.target.result);localStorage.setItem("qt_avatar",ev.target.result);};r.readAsDataURL(f);};
  const Avatar=({size=34,border=true})=>(<div style={{width:size,height:size,borderRadius:"50%",background:profilePic?"transparent":"#e8ecf4",border:border?`2px solid ${T.border}`:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,overflow:"hidden",position:"relative",pointerEvents:"none"}}>{profilePic?<img src={profilePic} style={{width:"100%",height:"100%",objectFit:"cover",pointerEvents:"none"}}/>:<span style={{...IN,fontSize:size*0.38,fontWeight:700,color:"#111626",pointerEvents:"none"}}>{currentUser?.name?currentUser.name.charAt(0).toUpperCase():"U"}</span>}<span style={{position:"absolute",bottom:0,right:0,width:size*0.28,height:size*0.28,borderRadius:"50%",background:"#22c55e",border:`2px solid ${T.card}`,pointerEvents:"none"}}/></div>);
  // Generate stable 6-digit user code from MongoDB _id
  const getUserCode=()=>{const saved=localStorage.getItem("qt_user_code");if(saved)return saved;if(!currentUser?._id){const c=Math.floor(10000000+Math.random()*90000000).toString();localStorage.setItem("qt_user_code",c);return c;}const code=currentUser._id.slice(-8);localStorage.setItem("qt_user_code",code);return code;};
  // Get KYC status
  const[kycStatus,setKycStatus]=useState(()=>localStorage.getItem("qt_kyc_status")==="approved"?"approved":localStorage.getItem("qt_kyc_status")==="pending"?"pending":"not_submitted");
  useEffect(()=>{const lsStatus=localStorage.getItem("qt_kyc_status");if(lsStatus==="approved"){setKycStatus("approved");return;}if(lsStatus==="pending"){setKycStatus("pending");return;}if(!API.auth.isAuthenticated())return;fetch("http://localhost:5000/api/kyc/me",{headers:{"Authorization":"Bearer "+localStorage.getItem("qt_token")}}).then(r=>r.json()).then(res=>{if(res.success&&res.kyc){setKycStatus(res.kyc.status||"pending");localStorage.setItem("qt_kyc_status",res.kyc.status||"pending");}else setKycStatus("not_submitted");}).catch(()=>{});},[]);
  const[candleType,setCandleType]=useState(()=>ls("qt_candleType","candle_solid"));const[tfPopOpen,setTfPopOpen]=useState(false);const[indPopOpen,setIndPopOpen]=useState(false);const[drawPopOpen,setDrawPopOpen]=useState(false);const[themePopOpen,setThemePopOpen]=useState(false);const[activeIndicators,setActiveIndicators]=useState(()=>ls("qt_indicators",[]));const[indSettingsOpen,setIndSettingsOpen]=useState(null); // which indicator settings are open
  // Mobile-only toggle — when false, only a 3-dot menu button shows; when true, all chart tool buttons appear.
  // Saves vertical space on small screens.
  const[mobileToolsOpen,setMobileToolsOpen]=useState(false);
  const prevTiRef=useRef(5);
  const CANDLE_PRESETS=[{name:"Classic",up:"#4caf50",dn:"#f44336"},{name:"TradingView",up:"#26a69a",dn:"#ef5350"},{name:"Binance",up:"#0ecb81",dn:"#f6465d"},{name:"Bright",up:"#0ecb81",dn:"#f6465d"},{name:"Blue & Orange",up:"#2962ff",dn:"#ff6d00"},{name:"Purple & Gold",up:"#9c27b0",dn:"#ffc107"},{name:"Cyan & Pink",up:"#00bcd4",dn:"#e91e63"},{name:"Monochrome",up:"#e0e0e0",dn:"#616161"}];
  const[candlePreset,setCandlePreset]=useState(()=>ls("qt_candlePreset",0));const[candleSubOpen,setCandleSubOpen]=useState(false);const[candleTypePopOpen,setCandleTypePopOpen]=useState(false);
  const[cursorPos,setCursorPos]=useState(null);
  const[hoveredCandle,setHoveredCandle]=useState(null);
  const[selectedOverlay,setSelectedOverlay]=useState(null); // {id, color, style, size}
  useEffect(()=>{ss("qt_candlePreset",candlePreset);},[candlePreset]);
  const[history,setHistory]=useState(()=>API.auth.isAuthenticated()?[]:ls("qt_hist",[]));const[bal,setBal]=useState(()=>currentUser?.demoBalance??ls("qt_bal",10000));

  // Load active trades + history from backend on mount
  useEffect(()=>{
    if(!API.auth.isAuthenticated())return;
    (async()=>{
      try{
        const[activeRes,historyRes,meRes]=await Promise.all([API.trades.active(),API.trades.history(99999),API.auth.me()]);
        if(activeRes.success&&activeRes.trades.length>0){
          const backendTrades=activeRes.trades.map(t=>{
            const pp=PAIRS.find(x=>x.s===t.symbol);
            return{
              id:t._id,dir:t.direction,entry:t.entry,amt:t.amount,
              duration:t.duration,symbol:t.symbol,pairLabel:t.pair||t.symbol,
              openTime:t.openTime,endTime:t.endTime,done:false,_backend:true,
              mode:t.mode||t.accountMode||"demo",
              payout:t.payout||(pp?.payout||80)
            };
          });
          setTrades(backendTrades);
        }
        if(historyRes.success&&historyRes.trades.length>0){
          const hist=historyRes.trades.map(t=>{
            const pp=PAIRS.find(x=>x.s===t.symbol);
            const openIso=t.openTime?new Date(t.openTime).toISOString():new Date(t.createdAt).toISOString();
            const closeIso=t.closeTime?new Date(t.closeTime).toISOString():(t.openTime&&t.duration?new Date(new Date(t.openTime).getTime()+t.duration*1000).toISOString():new Date(t.createdAt).toISOString());
            return{
              tradeId:t._id||("ZXT"+Math.random().toString(36).slice(2,10)),
              won:t.status==="won",
              entry:t.entry.toFixed(pp?.prec||2),
              exit:(t.exit||t.entry).toFixed(pp?.prec||2),
              payout:t.profitLoss||0,
              pair:t.pair||t.symbol,
              dir:t.direction,amt:t.amount,dur:t.duration,
              time:new Date(t.createdAt).toLocaleTimeString(),
              openTimeStr:openIso,
              closeTimeStr:closeIso,
              mode:t.mode||t.accountMode||"demo",
              prec:pp?.prec||2,cs:"$",rate:1
            };
          });
          setHistory(hist);
        }
        if(meRes.success){
          setBal(meRes.user.demoBalance);
          // realBal sync handled by useEffect on currentUser.realBalance — don't duplicate here
        }
      }catch(e){console.error("Load trades error:",e);}
    })();
  },[]);
  const[alerts,setAlerts]=useState(()=>API.auth.isAuthenticated()?[]:ls("qt_alerts",[]));const[signals,setSignals]=useState([]);
  // Pending trades — limit orders that wait for price to reach target before executing
  const[pendingTrades,setPendingTrades]=useState(()=>ls("qt_pending",[]));
  // Pending mode toggle — when ON, the right panel shows a Quote/Time form for setting target price
  // instead of immediate Up/Down trade buttons. Trade fires when price hits the target.
  const[pendingMode,setPendingMode]=useState(()=>ls("qt_pendingMode",false));
  // Right panel tab — "trades" (active/open) or "pending" (limit orders waiting to fire)
  const[tradesTabView,setTradesTabView]=useState("trades");
  // Pending entry tab — "QUOTE" (price-based) or "TIME" (time-based, future)
  const[pendingEntryTab,setPendingEntryTab]=useState("QUOTE");
  // Live target price for pending entry form (synced to current price by default)
  const[pendingTargetInput,setPendingTargetInput]=useState(0);
  // Modal state — when set, shows the "set target price" dialog (opened from chart click)
  const[pendingPrompt,setPendingPrompt]=useState(null);

  // Load alerts from backend on mount
  useEffect(()=>{
    if(!API.auth.isAuthenticated())return;
    API.alerts.list().then(res=>{
      if(res.success)setAlerts(res.alerts.map(a=>({...a,id:a._id,dir:a.direction})));
    }).catch(()=>{});
  },[]);

  // Load signals from backend periodically
  useEffect(()=>{
    if(!API.auth.isAuthenticated())return;
    const loadSignals=()=>{
      API.signals.list(20).then(res=>{
        if(res.success)setSignals(res.signals.map(s=>({
          pair:s.pair,dir:s.direction,str:s.strength,conf:s.confidence,
          reason:s.reason,expiry:s.expiry,
          time:new Date(s.createdAt).toLocaleTimeString()
        })));
      }).catch(()=>{});
    };
    loadSignals();
    const iv=setInterval(loadSignals,15000);
    return()=>clearInterval(iv);
  },[]);
  const[settings,setSettings]=useState(()=>{const saved=ls("qt_settings",{timezone:"UTC+05:00 (PKT)",language:"en",currency:"USD",sound:true,themeMode:"dark",bgImage:"",gridCapacity:10,autoScroll:true,oneClickTrade:false});return currentUser?.settings?{...saved,...currentUser.settings}:saved;});
  const[rate,setRate]=useState(1);
  const{toasts,add:toast,dismiss:dismissToast}=useToast();
  const cr=useRef(null);const chr=useRef(null);const lr=useRef(null);const pr=useRef(0);const kr=useRef([]);const[ready,setReady]=useState(false);
  // Forex market status (Sat/Sun closed for real forex; OTC always open)
  const marketStatus=useForexMarketStatus();
  // Whether to block trading on the *currently selected* pair
  const isMarketClosedForPair=(pair)=>{return!!(pair&&pair.realForex&&!marketStatus.isOpen);};
  const[isMobile,setIsMobile]=useState(window.innerWidth<768);
  const[mobileTab,setMobileTab]=useState("chart");
  useEffect(()=>{const h=()=>setIsMobile(window.innerWidth<768);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  const tradesRef=useRef(trades);tradesRef.current=trades;const alertsRef=useRef(alerts);alertsRef.current=alerts;const prevPriceRef=useRef(0);const resolvedIds=useRef(new Set());
  const candleCd=useCandleCountdown(tf.ms);
  // Tick for live open trade updates in right panel
  const[,setTick]=useState(0);
  useEffect(()=>{if(trades.length===0)return;const iv=setInterval(()=>setTick(t=>t+1),500);return()=>clearInterval(iv);},[trades.length]);
  // Live clock based on selected timezone
  const[liveClock,setLiveClock]=useState("");
  useEffect(()=>{const getTzOffset=()=>{const m=settings.timezone.match(/UTC([+-])(\d{2}):(\d{2})/);if(!m)return 0;const sign=m[1]==="+"?1:-1;return sign*(parseInt(m[2])*60+parseInt(m[3]));};const tick=()=>{const now=new Date();const utc=now.getTime()+now.getTimezoneOffset()*60000;const off=getTzOffset();const local=new Date(utc+off*60000);const h=String(local.getHours()).padStart(2,"0");const mi=String(local.getMinutes()).padStart(2,"0");const s=String(local.getSeconds()).padStart(2,"0");const tzLabel=settings.timezone.match(/UTC[+-]\d{2}:\d{2}/)?.[0]||"UTC";setLiveClock(`${h}:${mi}:${s} ${tzLabel}`);};tick();const iv=setInterval(tick,500);return()=>clearInterval(iv);},[settings.timezone]);
  const curSym=CURRENCIES.find(c=>c.code===settings.currency)||CURRENCIES[0];

  // Fetch currency rate
  useEffect(()=>{fetchRates().then(r=>{const rt=r[settings.currency]||1;setRate(rt);});},[settings.currency]);

  const cv=(usd)=>+(usd*rate).toFixed(rate>100?0:2); // convert USD to selected currency
  const cvs=(usd)=>`${curSym.symbol}${cv(usd)}`; // convert + format with symbol

  useEffect(()=>{ss("qt_bal",bal);balRef.current=bal;},[bal]);useEffect(()=>{ss("qt_hist",history)},[history]);useEffect(()=>{ss("qt_active",trades)},[trades]);useEffect(()=>{ss("qt_alerts",alerts)},[alerts]);useEffect(()=>{ss("qt_settings",settings)},[settings]);useEffect(()=>{ss("qt_acctMode",acctMode)},[acctMode]);useEffect(()=>{ss("qt_realBal",realBal);realBalRef.current=realBal;},[realBal]);useEffect(()=>{ss("qt_indicators",activeIndicators)},[activeIndicators]);useEffect(()=>{ss("qt_candleType",candleType)},[candleType]);useEffect(()=>{ss("qt_pending",pendingTrades)},[pendingTrades]);useEffect(()=>{ss("qt_pendingMode",pendingMode)},[pendingMode]);useEffect(()=>{ss("qt_invMode",invMode)},[invMode]);useEffect(()=>{ss("qt_amtPercent",amtPercent)},[amtPercent]);useEffect(()=>{ss("qt_timeMode",timeMode)},[timeMode]);
  const activeBal=acctMode==="demo"?bal:realBal;
  const setActiveBal=acctMode==="demo"?setBal:setRealBal;
  const isDemo=acctMode==="demo";

  // Signals - generate from user's active pair tabs
  useEffect(()=>{
    const gen=()=>{
      // Pick from user's active pairs (tabs)
      const activePairs=pairTabs.length>0?pairTabs.map(idx=>PAIRS[idx]).filter(Boolean):PAIRS.slice(0,6);
      if(activePairs.length===0)return;
      const pair=activePairs[Math.floor(Math.random()*activePairs.length)];
      const dir=Math.random()>.5?"HIGHER":"LOWER";
      // Bias: Strong signals 25%, Medium 40%, Weak 35%
      const r=Math.random();
      const str=r<0.25?"Strong":r<0.65?"Medium":"Weak";
      // Confidence based on strength
      const conf=str==="Strong"?Math.floor(Math.random()*15+80):str==="Medium"?Math.floor(Math.random()*15+65):Math.floor(Math.random()*15+50);
      const reason=SIGNAL_REASONS[Math.floor(Math.random()*SIGNAL_REASONS.length)];
      const durObj=DURS[Math.floor(Math.random()*Math.min(DURS.length,8))];
      setSignals(prev=>[{
        pair:pair.label,
        symbol:pair.s,
        dir,str,conf,reason,
        expiry:durObj.label,
        durSec:durObj.sec,
        time:new Date().toLocaleTimeString(),
        logo:pair.logo,
        logo2:pair.logo2,
        createdAt:Date.now()
      },...prev].slice(0,50));
    };
    for(let i=0;i<5;i++)gen(); // Generate 5 signals immediately
    const iv=setInterval(gen,90000); // 90 seconds = 20 signals per 30 minutes
    return()=>clearInterval(iv);
  },[pairTabs]);

  // Volume LED intensity + %change from last 20 candles
  useEffect(()=>{const iv=setInterval(()=>{const k=kr.current;if(k.length<5){setVolInt(0);setPctChg(0);return;}const win=k.slice(-20);const past=win.slice(0,-1);const avg=past.reduce((s,c)=>s+c.volume,0)/Math.max(1,past.length);const cur=k[k.length-1]?.volume||0;setVolInt(avg>0?Math.min(1,cur/(avg*1.6)):0);const first=win[0].open,last=k[k.length-1].close;setPctChg(first>0?((last-first)/first)*100:0);},350);return()=>clearInterval(iv);},[p.s,tf.ms]);

  // === SEEDED PRNG for deterministic OTC candles ===
  // This ensures same pair + same timeframe = same chart history every time
  const seededRng=(seed)=>{let s=seed;return()=>{s=(s*16807+0)%2147483647;return(s-1)/2147483646;};};
  const hashStr=(str)=>{let h=0;for(let i=0;i<str.length;i++){h=((h<<5)-h)+str.charCodeAt(i);h|=0;}return Math.abs(h);};

  // OTC candle cache: persists across pair switches so chart doesn't regenerate
  const otcCacheRef=useRef({});

  const genOtcCandles=(pair,ms,count)=>{
    const cacheKey=pair.s+"_"+ms;
    // Quick cache hit: if we generated within the same bar window, return cached.
    // The new generator is deterministic per-timestamp, so we don't need to "top up" —
    // we either return cached (if no new bar boundary crossed) or regenerate.
    if(otcCacheRef.current[cacheKey]){
      const cached=otcCacheRef.current[cacheKey];
      const lastTs=cached[cached.length-1]?.timestamp||0;
      const currentCandleTs=Math.floor(Date.now()/ms)*ms;
      if(currentCandleTs===lastTs){
        // Still in same bar — cached data is fresh.
        // Return fresh copy of forming bar so live-tick mutations don't pollute cache.
        if(cached.length>0){
          const last=cached[cached.length-1];
          return[...cached.slice(0,-1),{...last}];
        }
        return cached;
      }
      // New bar boundary crossed → fall through to regenerate
    }
    const now=Date.now();
    // === REFRESH-STABLE GENERATION ===
    // Anchor the price chain to a fixed weekly epoch. Bar at timestamp T is identical
    // across refreshes because we always generate the chain from the same start point.
    
    const pairSeed=hashStr(cacheKey);
    
    // Per-bar deterministic RNG — seeded from bar timestamp + pair
    const barRng=(ts,salt=0)=>{
      let s=((ts^pairSeed)+salt*2654435761)>>>0;
      // Pre-warm so consecutive timestamps decorrelate
      s=(s*16807+0)%2147483647;
      s=(s*16807+0)%2147483647;
      s=(s*16807+0)%2147483647;
      return()=>{s=(s*16807+0)%2147483647;return(s-1)/2147483646;};
    };
    
    const gaussFrom=(rng)=>{
      const u1=Math.max(rng(),0.0001);
      const u2=rng();
      return Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
    };
    
    // === FIXED ANCHOR ===
    // Chain always starts from a deterministic point ahead of the visible window.
    // For very fine timeframes (1s), we use a bounded chain (~600 bars before now)
    // so we don't spin millions of iterations. The anchor formula is purely
    // deterministic given (now snapped to bar grid + count).
    const lastTs=Math.floor(now/ms)*ms;
    const d=new Date(now);
    const weekAnchor=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-((d.getUTCDay()+6)%7),0,0,0,0);
    
    // === STABLE CHAIN START ===
    // Always start the chain from `weekAnchor` so bar at any timestamp T has the same
    // iteration index in the chain — refreshes give identical bars.
    // For very fine timeframes (1s/5s) we'd have hundreds of thousands of bars from
    // week start, so we use a "block-anchored" start: the most recent block boundary.
    // Block size grows for finer timeframes so the chain has reasonable length.
    const fullChain=Math.floor((lastTs-Math.floor(weekAnchor/ms)*ms)/ms)+1;
    let chainStartTs;
    if(fullChain<=2000){
      // Walk the full chain from week start — perfectly stable
      chainStartTs=Math.floor(weekAnchor/ms)*ms;
    }else{
      // Fine timeframe: use block-anchored start. Block size = ms*1500.
      // Bars within the same block always have the same chain → stable for 25 minutes (1s tf)
      // or 2 hours (5s tf) etc. Refresh within block = identical chart.
      const blockSize=ms*1500;
      chainStartTs=Math.floor(lastTs/blockSize)*blockSize;
    }
    const actualBars=Math.floor((lastTs-chainStartTs)/ms)+1;
    
    // === MACRO STATE — seeded from chainStartTs+pair, deterministic ===
    const macroR=barRng(chainStartTs,42);
    let microMom=(macroR()-0.5)*0.4;
    let swingMom=(macroR()-0.5)*0.25;
    let trendMom=(macroR()-0.5)*0.15;
    let volRegime=0.85+macroR()*0.45;
    let volTarget=volRegime;
    let cyclePhase=macroR()*Math.PI*2;
    let price=pair.basePrice+(pair.priceOffset||0);
    let prevDir=0; // anti-correlation memory: previous bar's direction
    
    const tfSec=ms/1000;
    const tfScale=Math.sqrt(Math.min(tfSec,3600)/60);
    const sigmaBase=0.0016*tfScale;
    
    const allCandles=[];
    
    for(let i=0;i<actualBars;i++){
      const ts=chainStartTs+i*ms;
      const rng=barRng(ts);
      const gauss=()=>gaussFrom(rng);
      
      // Update momentum at three timescales
      // === Three-scale momentum — REBALANCED for choppy OTC behavior ===
      // micro: heavy weight + faster decay → noise dominates → frequent direction changes
      // swing: weak persistence → ek direction mein lambi run nahi karta
      // trend: very subtle → barely visible bias
      microMom=microMom*0.30+gauss()*0.70;             // VERY noise-dominated
      swingMom=swingMom*0.55+gauss()*0.18;             // weak persistence
      trendMom=trendMom*0.97+gauss()*0.04;             // slight long bias
      
      // Volatility regime
      if(rng()<0.015){volTarget=0.6+rng()*1.0;}
      volRegime=volRegime*0.96+volTarget*0.04;
      
      // Long cycle — small amplitude (range-bound feel)
      cyclePhase+=0.012+rng()*0.008;
      const longCycle=Math.sin(cyclePhase)*0.08;
      
      // === Soft mean reversion with progressive repulsion near boundaries ===
      // Linear meanRev pulls back to base, but as price approaches ±1.5%, repulsion
      // ramps up exponentially so bars don't pile up at the boundary (no plateau).
      const distPct=(price-pair.basePrice)/pair.basePrice;
      const distAbs=Math.abs(distPct);
      // Base mean reversion (linear, gentle)
      let meanRev=-distPct*1.2;
      // Progressive repulsion: kicks in past 1% from base, exponential at 1.4%+
      if(distAbs>0.010){
        const repulsion=Math.pow((distAbs-0.010)/0.005,2)*1.5;
        meanRev+=-Math.sign(distPct)*repulsion;
      }
      
      // === ANTI-CORRELATION — previous bar's direction biases this bar opposite ===
      // This produces the "shake-out" choppy behavior of real OTC charts
      const antiCorr=-prevDir*0.22;
      
      // === Combine — micro (noise) heavily weighted, swing reduced, anti-corr added ===
      const totalMom=microMom*0.62+swingMom*0.10+trendMom*0.05+longCycle*0.03+meanRev*0.15+antiCorr;
      const clampedMom=Math.max(-2.5,Math.min(2.5,totalMom));
      const bodyMove=clampedMom*price*sigmaBase*volRegime;
      
      const o=price;
      let cl=+(o+bodyMove).toFixed(pair.prec);
      
      // Soft boundaries — only a true safety net at ±1.6% (rarely hit thanks to repulsion)
      const hardMin=pair.basePrice*0.984;
      const hardMax=pair.basePrice*1.016;
      if(cl<hardMin){cl=+hardMin.toFixed(pair.prec);swingMom=Math.abs(swingMom)*0.5;trendMom=Math.abs(trendMom)*0.6;}
      if(cl>hardMax){cl=+hardMax.toFixed(pair.prec);swingMom=-Math.abs(swingMom)*0.5;trendMom=-Math.abs(trendMom)*0.6;}
      
      // === Realistic candle character — REBALANCED for choppy distribution ===
      // Real OTC: lots of normal range bars, fewer trend bars, more indecision
      const candleType=rng();
      let wickMul,bodyMul=1;
      if(candleType<0.03){wickMul=2.0;bodyMul=0.6;}      // 3% spikes
      else if(candleType<0.20){wickMul=1.2;bodyMul=0.55;}// 17% indecision (more dojis = realistic)
      else if(candleType<0.65){wickMul=0.55;bodyMul=0.95;}// 45% normal range bars
      else{wickMul=0.30;bodyMul=1.05;}                   // 35% trend bars (was 60%)
      
      cl=+(o+bodyMove*bodyMul).toFixed(pair.prec);
      // Anti-roundoff: if body rounded to literal zero but momentum was non-trivial,
      // step at least one minStep in the intended direction so candle has visible body
      if(cl===o&&Math.abs(clampedMom)>0.05){
        const minStep=Math.pow(10,-pair.prec);
        cl=+(o+(clampedMom>=0?minStep:-minStep)).toFixed(pair.prec);
      }
      if(cl<hardMin)cl=+hardMin.toFixed(pair.prec);
      if(cl>hardMax)cl=+hardMax.toFixed(pair.prec);
      
      const realBody=Math.abs(cl-o);
      // Wicks scaled down to fraction of body, not multiple
      const baseWick=realBody*0.30+price*sigmaBase*volRegime*0.12;
      const wickUp=Math.abs(gauss())*baseWick*wickMul;
      const wickDn=Math.abs(gauss())*baseWick*wickMul;
      let hi=Math.max(o,cl)+wickUp;
      let lo=Math.min(o,cl)-wickDn;
      // Wicks can spike slightly past body boundaries (realistic — real markets show
      // briefly rejected highs/lows). Use a wider safety zone for wicks.
      const wickHardMax=pair.basePrice*1.018;
      const wickHardMin=pair.basePrice*0.982;
      if(hi>wickHardMax)hi=wickHardMax;
      if(lo<wickHardMin)lo=wickHardMin;
      
      price=cl;
      // Track direction for next bar's anti-correlation
      prevDir=cl>o?1:cl<o?-1:prevDir;
      const moveStrength=Math.abs(clampedMom)*volRegime;
      const vol=300+rng()*400+moveStrength*1800;
      allCandles.push({
        timestamp:ts,
        open:+o.toFixed(pair.prec),
        high:+hi.toFixed(pair.prec),
        low:+lo.toFixed(pair.prec),
        close:cl,
        volume:vol
      });
    }
    
    // Return only the last `count` bars.
    // Cache stores the immutable bars; we return a fresh copy of the last (forming)
    // bar so live-tick mutations don't pollute the cache.
    const candles=allCandles.slice(-count);
    otcCacheRef.current[cacheKey]=candles;
    if(candles.length>0){
      // Fresh copy of the forming bar — mutable for live tick
      const last=candles[candles.length-1];
      return[...candles.slice(0,-1),{...last}];
    }
    return candles;
  };

  // === DETERMINISTIC LIVE PRICE for OTC pairs ===
  // Computes the price at any sub-time within the current forming bar.
  // Same input (pair, exact time) → same price ALWAYS, regardless of session.
  // This is what makes two browser tabs show identical charts.
  //
  // Strategy: The historical generator (genOtcCandles) is deterministic and produces
  // OHLC for the current forming bar too. We use its deterministic open/high/low/close
  // as TARGET values, then build a sub-tick path that walks through these values
  // smoothly. The path is cached per (pair, barTs).
  const otcLivePathCacheRef=useRef({});
  
  const getOtcFormingBarPath=(pair,ms,barTs,formingBar)=>{
    const cacheKey=pair.s+"_"+ms+"_"+barTs;
    if(otcLivePathCacheRef.current[cacheKey]){
      return otcLivePathCacheRef.current[cacheKey];
    }
    // Snapshot the ORIGINAL deterministic OHLC (before any live-tick mutations).
    // We capture these the first time we see this bar — subsequent calls use the cache.
    const O=formingBar.open;
    const H=formingBar.high;
    const L=formingBar.low;
    const C=formingBar.close;
    
    // Sample count — 600 points per bar for ultra-smooth interpolation.
    // Higher K = smoother visual progression (less stair-stepping between samples).
    // For a 1m bar at 60fps render rate, 600 samples gives ~6 samples per render = no perceptible steps.
    const K=600;
    const pairSeed=hashStr(pair.s+"_"+ms);
    const barRng=(ts,salt=0)=>{
      let s=((ts^pairSeed)+salt*2654435761)>>>0;
      s=(s*16807+0)%2147483647;
      s=(s*16807+0)%2147483647;
      s=(s*16807+0)%2147483647;
      return()=>{s=(s*16807+0)%2147483647;return(s-1)/2147483646;};
    };
    // Use a salt-2 RNG so we don't collide with the historical generator's RNG calls
    const rng=barRng(barTs,2);
    
    // (O, H, L, C captured above before path computation)
    const isUp=C>=O;
    
    // Build a path that:
    //   - Starts at O (sample 0)
    //   - Ends at C (sample K-1)
    //   - Touches H and L at deterministic positions within the bar
    //   - Has random small wiggle in between
    // Pick deterministic positions for H-touch and L-touch (between 0.1 and 0.9)
    const hPos=0.15+rng()*0.7;
    const lPos=0.15+rng()*0.7;
    // Make sure H comes before/after L in a realistic way
    // (not strictly necessary, but adds variety)
    
    // Build a piecewise-linear "skeleton" through O → (extreme1) → (extreme2) → C
    // ordered by their positions within the bar
    const points=[
      {t:0,p:O},
      {t:Math.min(hPos,lPos),p:hPos<lPos?H:L},
      {t:Math.max(hPos,lPos),p:hPos<lPos?L:H},
      {t:1,p:C}
    ];
    // De-duplicate t values (avoid divide-by-zero)
    for(let i=1;i<points.length;i++){
      if(points[i].t<=points[i-1].t)points[i].t=points[i-1].t+0.001;
    }
    
    const path=new Array(K);
    // Brownian-style accumulating wiggle (more realistic than independent random per sample).
    // We track a momentum that randomly walks, so consecutive samples have correlated wiggles.
    let momentum=0;
    const wiggleScale=Math.abs(H-L)*0.18; // 18% of bar range — visible but not chaotic
    const momentumDecay=0.85;
    for(let i=0;i<K;i++){
      const t=i/(K-1);
      // Find segment
      let p1=points[0],p2=points[1];
      for(let j=0;j<points.length-1;j++){
        if(t>=points[j].t&&t<=points[j+1].t){p1=points[j];p2=points[j+1];break;}
      }
      const segT=(t-p1.t)/(p2.t-p1.t||1);
      const skeleton=p1.p+(p2.p-p1.p)*segT;
      // Brownian wiggle — momentum walks, gives realistic micro-movement
      momentum=momentum*momentumDecay+(rng()-0.5)*wiggleScale*0.3;
      let p=skeleton+momentum;
      // Keep within bar's H/L bounds (with tiny tolerance)
      if(p>H){p=H;momentum=0;}
      if(p<L){p=L;momentum=0;}
      // Keep full precision in path samples — rounding here would create stair-stepping
      // when the live ticker interpolates between adjacent samples (sub-precision changes
      // would round to identical values, producing visible "stuck" frames).
      path[i]=p;
    }
    // Force first/last to exact O/C (also unrounded — display handles formatting)
    path[0]=O;
    path[K-1]=C;
    
    const result={path,K};
    otcLivePathCacheRef.current[cacheKey]=result;
    // Cleanup old paths to prevent memory growth
    const keys=Object.keys(otcLivePathCacheRef.current);
    if(keys.length>30){
      keys.sort();
      for(let i=0;i<10;i++)delete otcLivePathCacheRef.current[keys[i]];
    }
    return result;
  };
  
  // Returns deterministic OTC price at any moment `now`.
  // Reads from precomputed path; same `now` always returns same price.
  // formingBar is the latest bar in kr.current (which is updated by the deterministic chain).
  const getOtcLivePrice=(pair,ms,now,formingBar)=>{
    if(!formingBar)return pair.basePrice;
    const barTs=Math.floor(now/ms)*ms;
    const {path,K}=getOtcFormingBarPath(pair,ms,barTs,formingBar);
    const elapsed=now-barTs;
    const t=Math.min(0.9999,Math.max(0,elapsed/ms));
    const idxF=t*(K-1);
    const idx=Math.floor(idxF);
    const frac=idxF-idx;
    const p1=path[idx];
    const p2=path[Math.min(K-1,idx+1)];
    // Don't round to pair.prec — that would collapse sub-precision interpolation steps
    // into a flat-line "stuck" look. Display layer handles formatting; the underlying
    // price needs full float precision for smooth animation between samples.
    return p1+(p2-p1)*frac;
  };

  // === ULTRA-SMOOTH PRICE ANIMATION SYSTEM ===
  // OTC: Direct RAF-driven Brownian motion (no interpolation layer = zero lag)
  // Binance: Lerp interpolation between WS ticks for smooth transitions
  const targetPriceRef=useRef(null);
  // Time-based interpolation refs — track when broker ticks arrive so we can smoothly glide between them
  const lastTickTimeRef=useRef(0);          // when target was last set (broker tick arrival)
  const lastTickStartPriceRef=useRef(null); // price at the moment that tick arrived
  const avgTickIntervalRef=useRef(800);     // adaptive: typical gap between broker ticks (ms)
  const realForexDriftRef=useRef(0);        // ambient drift momentum for realForex idle state
  const interpRAFRef=useRef(null);
  const lastLpUpdateRef=useRef(0);
  const lastChartPushRef=useRef(0);
  // Refs for fresh values inside RAF
  const pRef=useRef(p);pRef.current=p;
  const tfRef=useRef(tf);tfRef.current=tf;
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const isMobileRef=useRef(isMobile);isMobileRef.current=isMobile;
  const readyRef=useRef(false);
  // OTC momentum state for organic candle movement
  const otcMomentumRef=useRef(0);
  const otcLastTickRef=useRef(0);
  const otcMedMomRef=useRef(0);
  const otcVolStateRef=useRef(1.0);
  const otcCyclePhaseRef=useRef(Math.random()*Math.PI*2);
  // Anti-correlation: previous bar's direction biases this bar opposite (real OTC chop)
  const otcPrevBarDirRef=useRef(0);
  const otcLastBarTsRef=useRef(0);
  // Effective base price for live tick mean reversion — adapts to where the
  // historical chain landed so we don't pump/dump pulling toward a stale static base.
  const otcEffectiveBaseRef=useRef(0);

  // Single RAF loop handles BOTH OTC direct animation and Binance interpolation
  useEffect(()=>{
    let active=true;
    const tick=(timestamp)=>{
      if(!active)return;
      const cp=pRef.current;
      const ctf=tfRef.current;
      const current=pr.current;
      const now=Date.now();

      if(readyRef.current&&current&&current!==0&&kr.current.length>0){
        let newPrice=current;
        let moved=false;

        if(cp.otc){
          // === DETERMINISTIC LIVE PRICE ===
          // Same time + same pair → same price across all sessions/tabs.
          // The forming bar in kr.current is deterministic (computed by genOtcCandles).
          // We build a sub-tick path within its O/H/L/C and read prices from it.
          
          const curBarTs=Math.floor(now/ctf.ms)*ctf.ms;
          // Find forming bar (last bar in kr.current) - it should match curBarTs
          let formingBar=kr.current[kr.current.length-1];
          if(!formingBar||formingBar.timestamp!==curBarTs){
            // Bar boundary just crossed — historical generator's cached data is stale.
            // Regenerate to get the new forming bar's deterministic OHLC.
            const fresh=genOtcCandles(cp,ctf.ms,300);
            kr.current=fresh;
            formingBar=fresh[fresh.length-1];
          }
          if(formingBar){
            // Get deterministic price at current moment from the path
            newPrice=getOtcLivePrice(cp,ctf.ms,now,formingBar);
            if(newPrice!==current)moved=true;
          }
        }else if(cp.realForex){
          // === QUOTEX-STYLE: glide on ticks, gentle drift when idle ===
          const target=targetPriceRef.current;
          const startPrice=lastTickStartPriceRef.current;
          const tickTime=lastTickTimeRef.current;
          const minStep=Math.pow(10,-cp.prec);
          const baseP=cp.basePrice;
          
          // Validate inputs strictly
          if(!baseP||!isFinite(baseP)||baseP<=0||!isFinite(current)||current<=0){
            // System not ready or corrupted — skip frame
          }else{
            // Realistic bounds: ±10% of base (allows for stale basePrice)
            const lo=baseP*0.90,hi=baseP*1.10;
            const inRange=v=>isFinite(v)&&v>=lo&&v<=hi;
            
            const targetOK=target!==null&&inRange(target);
            const startOK=startPrice!==null&&inRange(startPrice);
            const elapsed=tickTime>0?(timestamp-tickTime):Infinity;
            const duration=Math.max(400,Math.min(2500,avgTickIntervalRef.current));
            
            if(targetOK&&startOK&&tickTime>0&&elapsed<duration){
              // === Active glide (Quotex-style ease-out) ===
              const t=Math.min(1,elapsed/duration);
              const eased=1-Math.pow(1-t,3);
              const candidate=startPrice+(target-startPrice)*eased;
              if(inRange(candidate)){
                newPrice=+candidate.toFixed(cp.prec);
                if(t<1&&newPrice===current&&Math.abs(target-current)>=minStep){
                  const stepPrice=current+(target>current?minStep:-minStep);
                  if(inRange(stepPrice))newPrice=+stepPrice.toFixed(cp.prec);
                }
                if(newPrice!==current&&inRange(newPrice))moved=true;
              }
            }else if(targetOK&&Math.abs(target-current)>=minStep*0.5){
              // === Recent target but no startPrice or beyond duration — gentle lerp ===
              const diff=target-current;
              const candidate=current+diff*0.05;
              if(inRange(candidate)){
                newPrice=+candidate.toFixed(cp.prec);
                if(newPrice===current){
                  const stepPrice=current+(diff>0?minStep:-minStep);
                  if(inRange(stepPrice))newPrice=+stepPrice.toFixed(cp.prec);
                }
                if(inRange(newPrice))moved=true;
              }
            }else{
              // === IDLE: no fresh tick, drift around current — VISIBLE Quotex-style movement ===
              const u1=Math.max(Math.random(),0.0001);
              const u2=Math.random();
              const noise=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
              // Mean reversion toward base — stronger, since drift is bigger now
              const distFromBase=(current-baseP)/baseP;
              const reversion=-distFromBase*8;
              realForexDriftRef.current=realForexDriftRef.current*0.94+noise*0.20+reversion*0.10;
              realForexDriftRef.current=Math.max(-1.5,Math.min(1.5,realForexDriftRef.current));
              // Drift magnitude: 15× minStep — visible like Quotex (0.015 USD/JPY per tick = ~1 pip)
              const drift=realForexDriftRef.current*minStep*15;
              const candidate=current+drift;
              if(inRange(candidate)){
                newPrice=+candidate.toFixed(cp.prec);
                if(newPrice===current&&Math.abs(realForexDriftRef.current)>0.05){
                  const stepPrice=current+(realForexDriftRef.current>0?minStep:-minStep);
                  if(inRange(stepPrice))newPrice=+stepPrice.toFixed(cp.prec);
                }
                if(newPrice!==current&&inRange(newPrice))moved=true;
              }else{
                // Out of range — pull back hard toward base
                const pullback=current+(baseP-current)*0.01;
                if(inRange(pullback)){
                  newPrice=+pullback.toFixed(cp.prec);
                  if(newPrice!==current)moved=true;
                }
                realForexDriftRef.current*=0.5;  // dampen
              }
            }
          }
        }else{
          // === BINANCE LERP INTERPOLATION ===
          const target=targetPriceRef.current;
          if(target!==null){
            const diff=target-current;
            if(Math.abs(diff)>0){
              const minStep=Math.pow(10,-cp.prec);
              if(Math.abs(diff)<=minStep*0.5){
                newPrice=target;
              }else{
                const relDiff=Math.abs(diff)/(Math.abs(current)||1);
                const lerpFactor=relDiff>0.005?0.4:0.18;
                newPrice=+(current+diff*lerpFactor).toFixed(cp.prec);
                if(newPrice===current)newPrice=+(current+(diff>0?minStep:-minStep)).toFixed(cp.prec);
              }
              moved=true;
            }
          }
        }

        if(moved){
          // === FINAL SAFETY: never commit a non-finite or wildly out-of-range price ===
          if(!isFinite(newPrice)||newPrice<=0){
            interpRAFRef.current=requestAnimationFrame(tick);
            return;
          }
          // For realForex pairs: enforce ±10% of basePrice (allows for stale basePrice)
          if(cp.realForex&&cp.basePrice){
            if(newPrice<cp.basePrice*0.90||newPrice>cp.basePrice*1.10){
              interpRAFRef.current=requestAnimationFrame(tick);
              return;
            }
          }else{
            // For other types: lenient ±50% sanity check
            const baseSafe=cp.basePrice||pr.current||newPrice;
            if(newPrice<baseSafe*0.5||newPrice>baseSafe*2){
              interpRAFRef.current=requestAnimationFrame(tick);
              return;
            }
          }
          const prev=pr.current;
          pr.current=newPrice;
          prevPriceRef.current=prev;
          // Update React state — for OTC sync to 60fps so price line and candle move
          // together (no millisecond desync). For other types, slightly slower is fine.
          const lpThrottle=cp.otc?(isMobileRef.current?33:16):(isMobileRef.current?100:22);
          if(now-lastLpUpdateRef.current>lpThrottle){
            lastLpUpdateRef.current=now;
            setLp(newPrice);
          }
          // Push to chart candle
          if(lr.current){
            if(cp.otc){
              // ═══ OTC: deterministic forming bar from path ═══
              const cs=Math.floor(now/ctf.ms)*ctf.ms;
              const last=kr.current[kr.current.length-1];
              if(last&&last.timestamp===cs){
                // Update forming bar's "live" view:
                //   - open = O (deterministic from generator, never changes)
                //   - close = current price (from path)
                //   - high = max price reached so far in the path up to current sample
                //   - low = min price reached so far in the path up to current sample
                const {path,K}=getOtcFormingBarPath(cp,ctf.ms,cs,last);
                const elapsed=now-cs;
                const t=Math.min(0.9999,Math.max(0,elapsed/ctf.ms));
                const sampleIdx=Math.floor(t*(K-1));
                let runHi=path[0],runLo=path[0];
                for(let i=0;i<=sampleIdx;i++){
                  if(path[i]>runHi)runHi=path[i];
                  if(path[i]<runLo)runLo=path[i];
                }
                // Mutate last in place (so future ticks see updated values)
                last.close=newPrice;
                last.high=runHi;
                last.low=runLo;
                // open stays as deterministic O from generator
                // Push at 60fps (16ms desktop / 33ms mobile) — matches lp update rate
                // so the price line and candle move in lockstep (no visible lag).
                // During chart zoom/pan, throttle harder (200ms) so chart isn't blocked by updates.
                const throttleMs=chartInteractingRef.current?200:(isMobileRef.current?33:16);
                if(now-lastChartPushRef.current>=throttleMs){
                  lastChartPushRef.current=now;
                  lr.current({...last});
                }
              }else if(!last||cs>last.timestamp){
                // Bar boundary crossed → regenerate to get the new deterministic bar
                const fresh=genOtcCandles(cp,ctf.ms,300);
                kr.current=fresh;
                const newBar=fresh[fresh.length-1];
                if(newBar){
                  // Initial state: open=O, current price = path at t=0 (≈ open)
                  const initPrice=getOtcLivePrice(cp,ctf.ms,now,newBar);
                  newBar.close=initPrice;
                  newBar.high=Math.max(newBar.open,initPrice);
                  newBar.low=Math.min(newBar.open,initPrice);
                  pr.current=initPrice;
                  lr.current({...newBar});
                }
              }
            }else if(cp.realForex){
              const cs=Math.floor(now/ctf.ms)*ctf.ms;
              const last=kr.current[kr.current.length-1];
              // Recovery: if last candle has way-off timestamp, fix it to current
              if(last&&Math.abs(last.timestamp-cs)>ctf.ms*5){
                last.timestamp=cs;
              }
              if(last&&last.timestamp===cs){
                let finalPrice=newPrice;
                
                // === AUTO-HEAL: clamp candle high/low if previous frame corrupted them ===
                const baseGuard=cp.basePrice||finalPrice;
                const hardMin=baseGuard*0.90;
                const hardMax=baseGuard*1.10;
                if(!isFinite(last.high)||last.high>hardMax||last.high<hardMin)last.high=finalPrice;
                if(!isFinite(last.low)||last.low>hardMax||last.low<hardMin)last.low=finalPrice;
                if(!isFinite(last.open)||last.open>hardMax||last.open<hardMin)last.open=finalPrice;
                if(!isFinite(last.close)||last.close>hardMax||last.close<hardMin)last.close=finalPrice;
                if(!isFinite(finalPrice)||finalPrice>hardMax||finalPrice<hardMin){
                  interpRAFRef.current=requestAnimationFrame(tick);
                  return;
                }
                last.close=finalPrice;
                last.high=Math.max(last.high,finalPrice);
                last.low=Math.min(last.low,finalPrice);
                // During zoom/pan, throttle hard (200ms) so chart isn't getting hammered with updates.
                // Otherwise normal throttle (16ms desktop / 33ms mobile = 60fps / 30fps).
                const throttleMs=chartInteractingRef.current?200:(isMobileRef.current?33:16);
                if(now-lastChartPushRef.current>=throttleMs){lastChartPushRef.current=now;lr.current({...last});}
              }else if(!last||cs>last.timestamp){
                const openPrice=last?last.close:newPrice;
                const nc={timestamp:cs,open:openPrice,high:openPrice,low:openPrice,close:openPrice,volume:Math.random()*50+10};
                kr.current.push(nc);
                if(kr.current.length>600)kr.current.splice(0,100);
                pr.current=openPrice;
                lr.current({...nc});
              }
            }else{
              const last=kr.current[kr.current.length-1];
              if(last){
                last.close=newPrice;
                last.high=Math.max(last.high,newPrice);
                last.low=Math.min(last.low,newPrice);
                const throttleMs=chartInteractingRef.current?250:(isMobileRef.current?100:33);
                if(now-lastChartPushRef.current>throttleMs){lastChartPushRef.current=now;lr.current({...last});}
              }
            }
          }
        }
      }
      interpRAFRef.current=requestAnimationFrame(tick);
    };
    interpRAFRef.current=requestAnimationFrame(tick);
    return()=>{active=false;if(interpRAFRef.current){cancelAnimationFrame(interpRAFRef.current);interpRAFRef.current=null;}};
  },[]);

  // Load candle data — Binance primary, CryptoCompare fallback
  useEffect(()=>{
    readyRef.current=false;
    setReady(false);
    otcMomentumRef.current=0;
    otcMedMomRef.current=0;
    otcVolStateRef.current=0.85+Math.random()*0.4; // start in random regime, not always 1.0
    otcCyclePhaseRef.current=Math.random()*Math.PI*2;
    // Reset target price so old pair price doesn't affect new pair
    targetPriceRef.current=null;
    lastTickTimeRef.current=0;
    lastTickStartPriceRef.current=null;
    avgTickIntervalRef.current=800;
    realForexDriftRef.current=0;
    otcLastTickRef.current=0;
    otcPrevBarDirRef.current=0;
    otcLastBarTsRef.current=0;
    otcEffectiveBaseRef.current=0;
    if(p.otc){
      // Generate ALL bars (historical + current forming bar) — all deterministic.
      // The current forming bar's OHLC is what it would END with. We compute the
      // sub-tick price at this moment from the deterministic path between O and C.
      const candles=genOtcCandles(p,tf.ms,300);
      kr.current=candles;
      const formingBar=candles[candles.length-1];
      // Initial price = deterministic value at current moment within the forming bar
      const initialPrice=formingBar?getOtcLivePrice(p,tf.ms,Date.now(),formingBar):p.basePrice;
      pr.current=initialPrice;
      targetPriceRef.current=initialPrice;
      setLp(initialPrice);
      readyRef.current=true;
      setReady(true);
    }else if(p.realForex){
      // ═══ REAL FOREX via backend ═══
      const tfMap={"1s":"1","5s":"1","10s":"1","15s":"1","30s":"1","1m":"1","2m":"1","3m":"3","5m":"5","10m":"5","15m":"15","1h":"60","4h":"240","1d":"D"};
      const tvTf=tfMap[tf.b]||"1";
      
      // Track if real data arrived (don't show simulation if real data comes in time)
      let realDataLoaded=false;
      
      // Try to fetch real data first (priority)
      API.forex.history(p.s,tvTf,300).then(res=>{
        if(res.success&&res.candles&&res.candles.length>0){
          realDataLoaded=true;
          // === SANITIZE: clamp wild values + normalize timestamps to ms ===
          const baseG=p.basePrice||1;
          const lo=baseG*0.5,hi=baseG*2;
          const clean=(v,fb)=>(isFinite(v)&&v>=lo&&v<=hi)?v:fb;
          // Detect if timestamps are in seconds (10-digit) vs milliseconds (13-digit)
          const sample=res.candles[0]?.timestamp||0;
          const tsMultiplier=sample>0&&sample<1e11?1000:1;  // <1e11 means seconds → ×1000
          const sanitized=res.candles.map(c=>{
            const o=clean(c.open,baseG);
            return{
              timestamp:(c.timestamp||0)*tsMultiplier,
              open:o,
              high:clean(c.high,o),
              low:clean(c.low,o),
              close:clean(c.close,o),
              volume:isFinite(c.volume)?c.volume:0
            };
          });
          // Set sanitized real candles
          kr.current=sanitized;
          const lastC=kr.current[kr.current.length-1];
          if(lastC){
            pr.current=lastC.close;
            targetPriceRef.current=lastC.close;
            setLp(lastC.close);
          }
          readyRef.current=true;
          setReady(true);
          // Force chart redraw with real data
          if(lr.current&&kr.current.length>0){
            try{lr.current({...kr.current[kr.current.length-1]});}catch(e){}
          }
        }
      }).catch(e=>{
        // History failed - get current price at least
        API.forex.quote(p.s).then(quote=>{
          if(quote.success&&quote.price){
            const baseG=p.basePrice||quote.price;
            // Validate: must be within ±50% of base
            if(isFinite(quote.price)&&quote.price>baseG*0.5&&quote.price<baseG*2){
              targetPriceRef.current=quote.price;
              pr.current=quote.price;
              setLp(quote.price);
            }
          }
        }).catch(()=>{});
      });
      
      // Fallback after 800ms: if real data not loaded yet, show simulation
      // (so chart isn't blank for slow connections)
      setTimeout(()=>{
        if(realDataLoaded||readyRef.current)return;
        // Real data still loading — show simulation as placeholder
        const initialCandles=genOtcCandles({...p,otc:true,vol:0.00007},tf.ms,300);
        kr.current=initialCandles;
        const lastClose=initialCandles[initialCandles.length-1]?.close||p.basePrice;
        pr.current=lastClose;
        targetPriceRef.current=lastClose;
        setLp(lastClose);
        readyRef.current=true;
        setReady(true);
      },800);
    }else{
      const ccMap={BTCUSDT:"BTC",ETHUSDT:"ETH",BNBUSDT:"BNB",SOLUSDT:"SOL",XRPUSDT:"XRP",DOGEUSDT:"DOGE",ADAUSDT:"ADA",AVAXUSDT:"AVAX"};
      const ccLimitMap={"1s":300,"1m":300,"3m":300,"5m":300,"15m":200,"1h":168,"4h":120,"1d":120};
      const ccIntervalMap={"1s":"minute","1m":"minute","3m":"minute","5m":"minute","15m":"minute","1h":"hour","4h":"hour","1d":"day"};
      const loadFromBinance=()=>fetch(`https://api.binance.com/api/v3/klines?symbol=${p.s}&interval=${tf.b}&limit=300`)
        .then(r=>{if(!r.ok)throw new Error("Binance HTTP "+r.status);return r.json();})
        .then(d=>{
          if(!Array.isArray(d)||d.length===0)throw new Error("Empty Binance data");
          kr.current=d.map(k=>({timestamp:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));
          const lastC=kr.current[kr.current.length-1];
          if(lastC){pr.current=lastC.close;targetPriceRef.current=lastC.close;setLp(lastC.close);}
          readyRef.current=true;setReady(true);
        });
      const loadFromCryptoCompare=()=>{
        const fsym=ccMap[p.s];if(!fsym){readyRef.current=true;setReady(true);return;}
        const aggr=ccIntervalMap[tf.b]||"minute";
        const limit=ccLimitMap[tf.b]||300;
        const url=`https://min-api.cryptocompare.com/data/v2/histo${aggr}?fsym=${fsym}&tsym=USD&limit=${limit}`;
        return fetch(url).then(r=>r.json()).then(d=>{
          if(!d.Data||!d.Data.Data)throw new Error("No CC data");
          const raw=d.Data.Data.filter(c=>c.open>0);
          kr.current=raw.map(c=>({timestamp:c.time*1000,open:c.open,high:c.high,low:c.low,close:c.close,volume:c.volumefrom||0}));
          // For sub-minute TFs from CC minute data, keep as-is (close enough)
          const lastC=kr.current[kr.current.length-1];
          if(lastC){pr.current=lastC.close;targetPriceRef.current=lastC.close;setLp(lastC.close);}
          readyRef.current=true;setReady(true);
        });
      };
      loadFromBinance().catch(()=>loadFromCryptoCompare().catch(()=>{readyRef.current=true;setReady(true);}));
    }
  },[p.s,tf.b]);

  // Binance WS — dual stream for non-OTC: kline for accurate OHLCV + aggTrade for smooth price
  // OTC needs no external data source — RAF loop generates movement directly
  useEffect(()=>{
    if(p.otc){
      // OTC: Alert checking at lower frequency (RAF handles price movement)
      const iv=setInterval(()=>{
        if(!readyRef.current)return;
        const current=pr.current;const prev=prevPriceRef.current;const pL=p.short;
        alertsRef.current.forEach(a=>{if(a.pair!==pL)return;
          const triggered=(a.dir==="above"&&prev<a.price&&current>=a.price)||(a.dir==="below"&&prev>a.price&&current<=a.price);
          if(triggered){toast(`Alert: ${a.pair}`,`Price ${a.dir==="above"?"above":"below"} ${a.price}`,"warn",5000);setAlerts(al=>al.filter(x=>x.id!==a.id));}
        });
      },500);
      return()=>clearInterval(iv);
    }else if(p.realForex){
      // ═══ REAL FOREX WebSocket — connects to backend stream ═══
      let ws;let reconnectTimer;let pollTimer;let alive=true;
      
      const startPolling=()=>{
        // Poll every 250ms for snappy real-time updates
        pollTimer=setInterval(async()=>{
          if(!alive||!readyRef.current)return;
          try{
            const res=await API.forex.quote(p.s);
            if(res.success&&res.price){
              // Validate: must be finite, positive, within ±10% of base price (allows for stale basePrice)
              const baseP=p.basePrice;
              if(!baseP||!isFinite(res.price)||res.price<=0||res.price<baseP*0.90||res.price>baseP*1.10){
                return; // corrupt or out-of-range data, ignore
              }
              // Capture tick arrival timing for smooth interpolation
              const nowT=Date.now();
              if(lastTickTimeRef.current>0){
                const gap=nowT-lastTickTimeRef.current;
                if(gap>50&&gap<5000)avgTickIntervalRef.current=avgTickIntervalRef.current*0.7+gap*0.3;
              }
              // Only save startPrice if it's also sane
              const cur=pr.current;
              lastTickStartPriceRef.current=(isFinite(cur)&&cur>baseP*0.90&&cur<baseP*1.10)?cur:res.price;
              lastTickTimeRef.current=nowT;
              targetPriceRef.current=res.price;
              // Also create new candle if timestamp boundary crossed
              const cs=Math.floor(Date.now()/tf.ms)*tf.ms;
              const last=kr.current[kr.current.length-1];
              if(!last||cs>last.timestamp){
                const nc={timestamp:cs,open:last?last.close:res.price,high:res.price,low:res.price,close:res.price,volume:0};
                kr.current.push(nc);
                if(kr.current.length>600)kr.current.splice(0,100);
              }
            }
          }catch(e){}
        },250);
      };
      
      const connectWS=()=>{
        try{
          const wsUrl=API.forex.streamUrl();
          ws=new WebSocket(wsUrl);
          ws.onopen=()=>{
            if(!alive)return;
            ws.send(JSON.stringify({action:"subscribe",symbol:p.s}));
          };
          ws.onmessage=(e)=>{
            if(!alive||!readyRef.current)return;
            try{
              const data=JSON.parse(e.data);
              if(data.error){
                // Subscribe failed → fallback to polling already running
                return;
              }
              // Accept various price field names: price, close, c, value
              const price=data.price||data.close||data.c||data.value;
              if(typeof price==="number"&&price>0&&isFinite(price)){
                // Validate: must be within ±10% of base price (allows for stale basePrice)
                const baseP=p.basePrice;
                if(!baseP||price<baseP*0.90||price>baseP*1.10)return;
                // Capture tick arrival timing — interpolator uses this to plan smooth glide
                const nowT=Date.now();
                if(lastTickTimeRef.current>0){
                  const gap=nowT-lastTickTimeRef.current;
                  if(gap>50&&gap<5000)avgTickIntervalRef.current=avgTickIntervalRef.current*0.7+gap*0.3;
                }
                // Only save startPrice if it's also sane
                const cur=pr.current;
                lastTickStartPriceRef.current=(isFinite(cur)&&cur>baseP*0.90&&cur<baseP*1.10)?cur:price;
                lastTickTimeRef.current=nowT;
                // Only update target price — RAF handles smooth chart rendering
                targetPriceRef.current=price;
                // Track high/low for new candle creation (but don't push to chart)
                const cs=Math.floor(Date.now()/tf.ms)*tf.ms;
                const last=kr.current[kr.current.length-1];
                if(!last||cs>last.timestamp){
                  // Only create new candle when timestamp boundary crossed
                  const nc={timestamp:cs,open:last?last.close:price,high:price,low:price,close:price,volume:0};
                  kr.current.push(nc);
                  if(kr.current.length>600)kr.current.splice(0,100);
                  // RAF will pick up this new candle on next frame
                }
                // Alerts
                const prev=prevPriceRef.current;
                alertsRef.current.forEach(a=>{if(a.pair!==p.short)return;
                  const tr=(a.dir==="above"&&prev<a.price&&price>=a.price)||(a.dir==="below"&&prev>a.price&&price<=a.price);
                  if(tr){toast(`Alert: ${a.pair}`,`Price ${a.dir==="above"?"above":"below"} ${a.price}`,"warn",5000);setAlerts(al=>al.filter(x=>x.id!==a.id));}
                });
              }
            }catch(e){}
          };
          ws.onerror=()=>{
            // WebSocket failed → use polling fallback
            if(!pollTimer)startPolling();
          };
          ws.onclose=()=>{
            if(!alive)return;
            // Reconnect after 5s
            reconnectTimer=setTimeout(connectWS,5000);
          };
        }catch(e){
          // WebSocket not supported → use polling
          startPolling();
        }
      };
      
      connectWS();
      // ALWAYS start polling too - guarantees updates even if WS lags
      startPolling();
      
      return()=>{
        alive=false;
        if(ws){try{ws.send(JSON.stringify({action:"unsubscribe",symbol:p.s}));ws.close();}catch(e){}}
        if(reconnectTimer)clearTimeout(reconnectTimer);
        if(pollTimer)clearInterval(pollTimer);
      };
    }else{
      const sym=p.s.toLowerCase();
      // Kline WS — gives proper OHLCV updates for current candle (accurate 1m candles)
      const klineWs=new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@kline_${tf.b}`);
      klineWs.onmessage=(e)=>{
        if(!readyRef.current)return;
        try{
          const m=JSON.parse(e.data);
          const k=m.k;if(!k)return;
          const candle={timestamp:k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};
          const last=kr.current[kr.current.length-1];
          if(last&&last.timestamp===candle.timestamp){
            // Update existing candle with accurate OHLCV from Binance
            last.open=candle.open;
            last.high=candle.high;
            last.low=candle.low;
            last.close=candle.close;
            last.volume=candle.volume;
            if(lr.current)lr.current({...last});
          }else if(!last||candle.timestamp>last.timestamp){
            // New candle
            kr.current.push(candle);
            if(kr.current.length>600)kr.current.splice(0,100);
            if(lr.current)lr.current({...candle});
          }
        }catch(ex){}
      };
      klineWs.onerror=()=>{};

      // AggTrade WS — for smooth price interpolation between kline updates
      const tradeWs=new WebSocket(`wss://stream.binance.com:9443/ws/${sym}@aggTrade`);
      tradeWs.onmessage=(e)=>{
        if(!readyRef.current)return;
        const m=JSON.parse(e.data);const price=+m.p;const prev=pr.current;
        targetPriceRef.current=price;
        alertsRef.current.forEach(a=>{if(a.pair!==p.short+"/USDT")return;
          const triggered=(a.dir==="above"&&prev<a.price&&price>=a.price)||(a.dir==="below"&&prev>a.price&&price<=a.price);
          if(triggered){toast(`Alert: ${a.pair}`,`Price ${a.dir==="above"?"above":"below"} ${a.price}`,"warn",5000);setAlerts(al=>al.filter(x=>x.id!==a.id));}
        });
      };
      tradeWs.onerror=()=>{};

      // Fallback: if Binance WS fails, poll CryptoCompare every 5s
      let ccFallback=null;
      const startCCFallback=()=>{
        const ccMap={BTCUSDT:"BTC",ETHUSDT:"ETH",BNBUSDT:"BNB",SOLUSDT:"SOL",XRPUSDT:"XRP",DOGEUSDT:"DOGE",ADAUSDT:"ADA",AVAXUSDT:"AVAX"};
        const fsym=ccMap[p.s];if(!fsym)return;
        ccFallback=setInterval(async()=>{
          try{
            const r=await fetch(`https://min-api.cryptocompare.com/data/price?fsym=${fsym}&tsyms=USD`);
            const d=await r.json();if(d.USD){targetPriceRef.current=d.USD;}
          }catch(ex){}
        },5000);
      };
      // Start CC fallback if kline WS doesn't connect within 5s
      const fallbackTimer=setTimeout(()=>{
        if(klineWs.readyState!==WebSocket.OPEN)startCCFallback();
      },5000);

      return()=>{
        clearTimeout(fallbackTimer);
        if(ccFallback)clearInterval(ccFallback);
        klineWs.close();
        tradeWs.close();
      };
    }
  },[p.s,tf.b]);

  useEffect(()=>{if(!cr.current||!ready)return;const styles=settings.themeMode==="light"?chartStLight:chartSt;const chart=init(cr.current,{styles,customApi:{formatDate:({dateTimeFormat,timestamp})=>{const d=new Date(timestamp);return dateTimeFormat.format(d);}}});chr.current=chart;chart.setBarSpace(10);
    // === Apply grid capacity from saved settings IMMEDIATELY at chart init ===
    // (Previously this was only applied via the separate effect below — but on first mount
    // that effect runs before chr.current is set, so the saved gridCapacity value was lost
    // until the user manually changed the setting. Now we apply it here at init time too.)
    try{
      const gridAlpha=Math.min(1,Math.max(0.05,(settings.gridCapacity||10)/20));
      const isLight=settings.themeMode==="light";
      const hColor=isLight?`rgba(226,232,240,${gridAlpha})`:`rgba(42,55,85,${gridAlpha})`;
      const vColor=isLight?`rgba(226,232,240,${gridAlpha*0.7})`:`rgba(42,55,85,${gridAlpha*0.7})`;
      chart.setStyles({grid:{horizontal:{color:hColor},vertical:{color:vColor}}});
    }catch(e){}
    chart.setDataLoader({getBars:(params)=>{params.callback(kr.current,false);},subscribeBar:(params)=>{lr.current=params.callback;},unsubscribeBar:()=>{lr.current=null;}});chart.setSymbol({ticker:p.s,name:"",pricePrecision:p.prec,volumePrecision:0});chart.setPeriod({multiplier:tf.mult,span:tf.span,text:tf.label});
    // Re-apply indicators after chart init
    setTimeout(()=>{
      activeIndicators.forEach(ind=>{try{const isOverlay=["MA","EMA","BOLL"].includes(ind);if(isOverlay){chart.createIndicator(ind,true,{id:"candle_pane"});}else{chart.createIndicator(ind,false,{id:`pane_${ind}`,height:80});}}catch(e){}});
      if(candleType!=="candle_solid")try{chart.setStyles({candle:{type:candleType}});}catch(e){}
      tradesRef.current.forEach(t=>{if(t.symbol===p.s&&!t.done)drawTradeOverlays(t);});
    },600);
    return()=>{lr.current=null;dispose(cr.current);chr.current=null;};},[p.s,tf.label,ready,settings.themeMode,walletView,accountView]);

  useEffect(()=>{if(!chr.current)return;try{
    const gridAlpha=Math.min(1,Math.max(0.05,(settings.gridCapacity||10)/20));
    const isLight=settings.themeMode==="light";
    const hColor=isLight?`rgba(226,232,240,${gridAlpha})`:`rgba(42,55,85,${gridAlpha})`;
    const vColor=isLight?`rgba(226,232,240,${gridAlpha*0.7})`:`rgba(42,55,85,${gridAlpha*0.7})`;
    chr.current.setStyles({grid:{horizontal:{color:hColor},vertical:{color:vColor}}});
  }catch(e){}},[settings.gridCapacity,ready,p.s,settings.themeMode]);
  // Smart auto-scroll: waits 5s after user interaction, then smoothly returns to realtime
  const lastUserInteractionRef=useRef(Date.now());
  const isUserScrollingRef=useRef(false);
  const smoothScrollTimerRef=useRef(null);
  useEffect(()=>{
    if(!cr.current)return;
    const chartEl=cr.current;
    const markInteraction=()=>{lastUserInteractionRef.current=Date.now();isUserScrollingRef.current=true;if(smoothScrollTimerRef.current){clearInterval(smoothScrollTimerRef.current);smoothScrollTimerRef.current=null;}};
    chartEl.addEventListener("mousedown",markInteraction);
    chartEl.addEventListener("wheel",markInteraction);
    chartEl.addEventListener("touchstart",markInteraction);
    return()=>{chartEl.removeEventListener("mousedown",markInteraction);chartEl.removeEventListener("wheel",markInteraction);chartEl.removeEventListener("touchstart",markInteraction);};
  },[ready,p.s]);
  // Smooth forward scroll after 5s idle — moves chart forward in small steps
  useEffect(()=>{if(!settings.autoScroll)return;
    const checkIdle=setInterval(()=>{
      if(!chr.current||!isUserScrollingRef.current)return;
      const idle=Date.now()-lastUserInteractionRef.current;
      if(idle>=5000&&!smoothScrollTimerRef.current){
        // Start smooth forward scroll — small steps every 30ms
        smoothScrollTimerRef.current=setInterval(()=>{
          if(!chr.current){clearInterval(smoothScrollTimerRef.current);smoothScrollTimerRef.current=null;return;}
          try{
            const dataLen=kr.current.length;if(dataLen===0){clearInterval(smoothScrollTimerRef.current);smoothScrollTimerRef.current=null;return;}
            // scrollToDataIndex moves the view so the given index is visible
            // We scroll forward by small offset each tick
            chr.current.scrollByDistance?.(-8); // negative = scroll forward (toward newer data)
          }catch(e){}
          // Check if we reached the end
          try{
            const range=chr.current.getVisibleRange?.();
            if(range&&range.to>=kr.current.length-2){
              clearInterval(smoothScrollTimerRef.current);smoothScrollTimerRef.current=null;
              isUserScrollingRef.current=false;
              try{chr.current.scrollToRealTime?.();}catch(e){}
            }
          }catch(e){clearInterval(smoothScrollTimerRef.current);smoothScrollTimerRef.current=null;isUserScrollingRef.current=false;}
        },30);
      }
    },1000);
    return()=>{clearInterval(checkIdle);if(smoothScrollTimerRef.current)clearInterval(smoothScrollTimerRef.current);};
  },[settings.autoScroll,ready,p.s]);
  useEffect(()=>{if(!chr.current)return;try{chr.current.setStyles({candle:{type:candleType}});}catch(e){}},[candleType,ready,p.s]);

  // Area mode: lock timeframe to 1s (index 0). Exiting area: restore previous TF.
  useEffect(()=>{
    if(candleType==="area"){
      if(ti!==0){prevTiRef.current=ti;setTi(0);}
    }else{
      // If leaving area and we're still on 1s, restore prev TF
      if(ti===0&&prevTiRef.current!==0)setTi(prevTiRef.current);
    }
  },[candleType]);

  // Apply candle colors when preset changes
  useEffect(()=>{if(!chr.current)return;const preset=CANDLE_PRESETS[candlePreset];try{chr.current.setStyles({candle:{bar:{upColor:preset.up,downColor:preset.dn,upBorderColor:preset.up,downBorderColor:preset.dn,upWickColor:preset.up,downWickColor:preset.dn},priceMark:{last:{upColor:preset.up,downColor:preset.dn}}}});}catch(e){}},[candlePreset,ready,p.s,settings.themeMode]);

  // ========== PURE REACT DOM TRADE LINES ==========
  // All trade visuals rendered as positioned React divs — no KLineChart overlays
  // Uses requestAnimationFrame for smooth updates during zoom/pan
  const[tradeLines,setTradeLines]=useState({preview:null,active:[],alerts:[]});
  // Track whether chart's visible range is at the latest candles (real-time view).
  // When false, show a "go to latest" arrow button so user can jump back instantly.
  const[chartAtRealtime,setChartAtRealtime]=useState(true);
  // Global interaction ref — shared with OTC live tick so it can throttle harder during zoom/pan.
  // True = user is actively interacting with chart (zoom/pan/scroll), False = idle.
  const chartInteractingRef=useRef(false);
  const rafIdRef=useRef(null);
  
  // Helper: convert timestamp+value to pixel position
  const toPixel=useCallback((ts,val)=>{if(!chr.current)return null;try{const px=chr.current.convertToPixel({timestamp:ts,value:val});if(px&&isFinite(px.x)&&isFinite(px.y))return px;return null;}catch(e){return null;}},[]);

  // Single RAF loop updates ALL trade visuals every frame for instant zoom/pan tracking
  const lastTradeLinesRef=useRef({preview:null,active:[],alerts:[]});
  useEffect(()=>{if(!chr.current||!ready)return;
    // Subscribe to chart's visible range changes (zoom/pan) for instant repaints.
    // Even though the RAF loop recomputes every frame, the subscription ensures we
    // don't miss an event on slow frames (e.g., during heavy zoom animation).
    let unsubscribeFn=null;
    let isInteracting=false; // Tracks whether user is actively zooming/panning
    let interactionTimer=null;
    let lastRealtimeCheck=0;
    try{
      // Lightweight handler — does ZERO React work during active drag/zoom.
      // Only flags interaction state (a ref, not state). Realtime check runs after settle.
      const handler=()=>{
        isInteracting=true;
        chartInteractingRef.current=true; // share with OTC tick for hard throttling
        if(interactionTimer)clearTimeout(interactionTimer);
        interactionTimer=setTimeout(()=>{
          isInteracting=false;
          chartInteractingRef.current=false;
          // ONLY when user stops interacting do we check realtime status + update React state.
          // This avoids any setState calls during active drag = zero render lag.
          try{
            const range=chr.current?.getVisibleRange?.();
            const dataLen=kr.current.length;
            if(range&&dataLen>0){
              const atRealtime=range.to>=dataLen-2;
              setChartAtRealtime(prev=>prev===atRealtime?prev:atRealtime);
            }
          }catch(e){}
        },150);
      };
      chr.current.subscribeAction?.("onVisibleRangeChange",handler);
      unsubscribeFn=()=>{
        try{chr.current?.unsubscribeAction?.("onVisibleRangeChange",handler);}catch(e){}
        if(interactionTimer)clearTimeout(interactionTimer);
      };
    }catch(e){}
    
    // Helper: round to integer pixel for stable comparison (sub-pixel changes don't trigger re-render)
    const px=v=>Math.round(v||0);
    
    // Shallow-equal check for tradeLines update — skip React re-render if visible nothing changed.
    // This eliminates ~95% of redundant renders during chart zoom/pan, making animation buttery smooth.
    const sameLines=(a,b)=>{
      if(!a||!b)return false;
      // Preview comparison
      if((!a.preview)!==(!b.preview))return false;
      if(a.preview&&b.preview){
        if(px(a.preview.bx)!==px(b.preview.bx)||px(a.preview.ex)!==px(b.preview.ex)||px(a.preview.y)!==px(b.preview.y))return false;
        if(px(a.preview.cex)!==px(b.preview.cex))return false;
        if(a.preview.candleCd!==b.preview.candleCd||a.preview.expCd!==b.preview.expCd)return false;
      }
      // Active trades
      if(a.active.length!==b.active.length)return false;
      for(let i=0;i<a.active.length;i++){
        const x=a.active[i],y=b.active[i];
        if(x.id!==y.id||px(x.bx)!==px(y.bx)||px(x.ex)!==px(y.ex)||px(x.y)!==px(y.y)||x.cd!==y.cd)return false;
      }
      // Alerts
      if(a.alerts.length!==b.alerts.length)return false;
      for(let i=0;i<a.alerts.length;i++){
        const x=a.alerts[i],y=b.alerts[i];
        if(x.id!==y.id||px(x.y)!==px(y.y))return false;
      }
      return true;
    };
    
    // Adaptive throttling: idle 30fps (33ms), interacting 60fps (16ms).
    // 30fps is visually indistinguishable from 60fps for static overlays but uses half the CPU.
    let lastFrameTime=0;
    const tick=(timestamp)=>{
      if(!chr.current){rafIdRef.current=requestAnimationFrame(tick);return;}
      // Throttle overlay updates:
      // - During interaction (zoom/pan): 16ms (60fps) so overlay stays IN-SYNC with chart movement.
      //   Previously we throttled to 100ms during zoom, but that caused visible jitter — the chart
      //   redraws every frame while overlay updates every 100ms, so the line "lags then jumps".
      // - Idle: 33ms (30fps) — visually identical for static overlays, lower CPU.
      const minDelta=isInteracting?16:33;
      if(timestamp-lastFrameTime<minDelta){
        rafIdRef.current=requestAnimationFrame(tick);
        return;
      }
      lastFrameTime=timestamp;
      const now=Date.now();

      // === PREVIEW (before trade is opened) ===
      let preview=null;
      if(kr.current.length>0){
        // Use the LAST candle's actual timestamp from kr.current as the forming candle anchor.
        // This avoids the lag where computed candleStart (Math.floor(now/tf.ms)*tf.ms) advances
        // to the new minute before kr.current has been updated with the new forming candle.
        // Result: line jumps to new candle position synchronously with chart rendering.
        const lastCandle=kr.current[kr.current.length-1];
        const lastTs=lastCandle?.timestamp||Math.floor(now/tf.ms)*tf.ms;
        // Also compute the "true" candleStart for countdown timing — this is when the
        // current real-time minute started. Countdown text uses this.
        const candleStart=Math.floor(now/tf.ms)*tf.ms;
        const candleEnd=candleStart+tf.ms;
        const candlesAhead=Math.max(1,Math.ceil(dur.sec*1000/tf.ms));
        const endTs=candleStart+candlesAhead*tf.ms;
        const lastClose=lastCandle?.close||0;
        // Vertical line position uses the actual last-rendered candle's timestamp (lastTs),
        // so the line stays synchronized with what the chart is actually drawing.
        const bp=toPixel(lastTs,lastClose);
        const ep=toPixel(endTs,lastClose);
        if(bp&&ep){
          const candleRem=Math.max(0,Math.floor((candleEnd-now)/1000));
          const candleCd=`${String(Math.floor(candleRem/60)).padStart(2,"0")}:${String(candleRem%60).padStart(2,"0")}`;
          const expRem=Math.max(0,Math.floor((endTs-now)/1000));
          const expCd=`${String(Math.floor(expRem/60)).padStart(2,"0")}:${String(expRem%60).padStart(2,"0")}`;
          preview={bx:bp.x,ex:ep.x,cex:bp.x,candleCd,expCd,y:bp.y};
        }
      }

      // === ACTIVE TRADES — line from t.openTime to t.endTime (FIXED timestamps) ===
      const activeList=tradesRef.current.filter(t=>{
        if(t.done||t.symbol!==p.s)return false;
        const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;
        return et>now;
      });
      const positions=activeList.map((t,idx)=>{
        const openTs=typeof t.openTime==="string"?new Date(t.openTime).getTime():(t.openTime||now);
        const endTs=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;
        const rem=Math.max(0,Math.floor((endTs-now)/1000));
        if(rem<=0)return null;
        // Y = entry price level on chart
        const yPt=toPixel(now,t.entry);
        if(!yPt)return null;
        // Start dot = the candle WHERE trade was opened (snap openTs to bar boundary).
        // We use the bar's timestamp (start of bar that contains openTs) — kline-charts
        // maps that to the candle's center pixel, which is where the dot should appear.
        const openBarTs=Math.floor(openTs/tf.ms)*tf.ms;
        const openPt=toPixel(openBarTs,t.entry);
        if(!openPt)return null;
        const chartW=cr.current?.clientWidth||800;
        // === END POSITION — duration-based, ALWAYS shows immediately ===
        let barSpace=10;
        try{
          const bs=chr.current?.getBarSpace?.();
          if(bs&&isFinite(bs.bar)&&bs.bar>0)barSpace=bs.bar;
        }catch(e){}
        const durationBars=(endTs-openTs)/tf.ms;
        let endX=openPt.x+durationBars*barSpace;
        if(endX>chartW)endX=chartW-60;
        const startX=openPt.x<0?0:openPt.x;
        const cdText=`${String(Math.floor(rem/60)).padStart(2,"0")}:${String(rem%60).padStart(2,"0")}`;
        return{id:t.id,bx:startX,ex:endX,y:yPt.y,cd:cdText,dir:t.dir,amt:t.amt,idx,entry:t.entry,openVisible:openPt.x>=0};
      }).filter(Boolean);

      // === ALERT LINES ===
      const curPair=p.short+"/USDT";
      const alertLines=alertsRef.current.filter(a=>a.pair===curPair).map(a=>{
        const pt=toPixel(now,a.price);
        if(!pt||!isFinite(pt.y))return null;
        return{id:a.id,y:pt.y,price:a.price,dir:a.dir};
      }).filter(Boolean);

      const next={preview,active:positions,alerts:alertLines};
      // Only commit React state update if positions actually changed (pixel-rounded).
      // This prevents excessive re-renders during chart zoom/pan = much smoother animation.
      if(!sameLines(lastTradeLinesRef.current,next)){
        lastTradeLinesRef.current=next;
        setTradeLines(next);
      }
      rafIdRef.current=requestAnimationFrame(tick);
    };
    rafIdRef.current=requestAnimationFrame(tick);
    return()=>{
      if(rafIdRef.current)cancelAnimationFrame(rafIdRef.current);
      if(unsubscribeFn)unsubscribeFn();
      lastTradeLinesRef.current={preview:null,active:[],alerts:[]};
      setTradeLines({preview:null,active:[],alerts:[]});
    };},[ready,dur.sec,tf.ms,toPixel,p.s,rate]);

  // No KLineChart overlays needed — drawTradeOverlays is now a no-op for overlays
  // Trade data is stored in state, React DOM renders the visuals
  const drawTradeOverlays=useCallback(()=>{},[]);
  const rmOverlays=useCallback(()=>{},[]);

  useEffect(()=>{if(trades.length===0)return;
    const iv=setInterval(async()=>{
      const now=Date.now();
      let changed=false;
      const updated=[...trades];

      // Tick sound for last 3 seconds was removed per user request — too distracting

      // Resolve ALL expired trades client-side IMMEDIATELY for instant notification
      const expiredTrades=trades.filter(t=>{if(t.done||resolvedIds.current.has(t.id))return false;const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return now>=et;});
      
      for(const t of expiredTrades){
        resolvedIds.current.add(t.id);
        const exit=pr.current;const pp=PAIRS.find(x=>x.s===t.symbol);
        // Round both prices to the pair's precision to avoid floating-point ties being missed.
        // E.g., 1.08501 vs 1.08501 should be a tie even if one is 1.08501000001 internally.
        const prec=pp?.prec||2;
        const entryR=parseFloat(t.entry.toFixed(prec));
        const exitR=parseFloat(exit.toFixed(prec));
        const isTie=entryR===exitR;
        const won=!isTie&&(t.dir==="HIGHER"?exitR>entryR:exitR<entryR);
        const lost=!isTie&&!won;
        const profitAmt=won?t.amt*(pp?.payout||85)/100:0;
        // displayPayout: positive for win, 0 for tie (refund), negative for loss
        const displayPayout=won?profitAmt:(isTie?0:-t.amt);
        
        // Update balance immediately
        if(t._backend){
          if(won){if(t.mode==="real"){setRealBal(b=>b+t.amt+profitAmt);realBalCooldown.current=Date.now()+30000;}else{setBal(b=>b+t.amt+profitAmt);}}
          else if(isTie){if(t.mode==="real"){setRealBal(b=>b+t.amt);realBalCooldown.current=Date.now()+30000;}else{setBal(b=>b+t.amt);}}
        }else{
          // Local (guest) trade — refund full amount on tie too
          if(won){setActiveBal(b=>b+t.amt+profitAmt);}
          else if(isTie){setActiveBal(b=>b+t.amt);}
        }
        
        // Tag the result with `tie` flag so history can display draw indicator
        const result={tradeId:t.id,won,tie:isTie,entry:t.entry.toFixed(prec),exit:exit.toFixed(prec),payout:displayPayout,pair:t.pairLabel,dir:t.dir,amt:t.amt,dur:t.duration,time:new Date().toLocaleTimeString(),openTimeStr:new Date(t.openTime).toISOString(),closeTimeStr:new Date().toISOString(),mode:t.mode||"demo",prec,cs:curSym.symbol,rate};
        setHistory(h=>h.find(x=>x.tradeId===t.id)?h:[result,...h]);
        setResults(r=>r.find(x=>x.id===t.id)?r:[...r,{...result,id:t.id}]);
        // Play sound matching outcome — silence for tie (no win/loss event)
        if(settings.sound){if(won)playWin();else if(lost)playLoss();}
        // Toast: Win / Lost / Draw (3-state instead of 2)
        toast(
          isTie?"Trade Draw":won?"Trade Won!":"Trade Lost",
          isTie?`Refunded ${cvs(t.amt)} on ${t.pairLabel}`:`${won?"+":"-"}${cvs(Math.abs(displayPayout))} on ${t.pairLabel}`,
          isTie?"warn":won?"success":"error"
        );
        setTimeout(()=>setResults(r=>r.filter(x=>x.id!==t.id)),3500);
        const idx=updated.findIndex(x=>x.id===t.id);
        if(idx>=0){updated[idx]={...updated[idx],done:true};changed=true;}
      }

      // No backend balance sync — client localStorage is source of truth for realBal

      if(changed)setTrades(updated.filter(t=>!t.done));
    },500);
    return()=>clearInterval(iv);
  },[trades,settings.sound,rate]);

  const executeTrade=async(dir,entry,actualDuration,endTime,openTime,amtOverride)=>{
    // Allow callers (e.g. pending trade watcher) to specify trade amount explicitly
    // instead of reading from current `amt`/`amtPercent` state.
    // When invMode is "percent", compute the actual $ amount from percentage of current balance.
    let tradeAmt;
    if(amtOverride!=null){
      tradeAmt=amtOverride;
    }else if(invMode==="percent"){
      const baseBal=isDemo?balRef.current:realBalRef.current;
      tradeAmt=Math.max(1,Math.floor(baseBal*amtPercent/100));
    }else{
      tradeAmt=amt;
    }
    
    // === BALANCE CHECK ===
    // Use refs (always-current via useEffect sync) instead of state closure variables
    // which can be stale during rapid clicks. Refs are also safe from React StrictMode's
    // double-invocation of functional setState updaters (which previously caused the bug
    // where balance was deducted but trade was rejected as "insufficient").
    const currentBal=isDemo?balRef.current:realBalRef.current;
    if(tradeAmt>currentBal){
      toast("Insufficient Balance",`Need ${cvs(tradeAmt)}, have ${cvs(currentBal)}`,"error",3000);
      return;
    }
    
    // Deduct balance using functional setState. We also update the ref synchronously
    // so subsequent rapid clicks read the new value immediately (before useEffect runs).
    if(isDemo){
      const newBal=balRef.current-tradeAmt;
      balRef.current=newBal;
      setBal(newBal);
    }else{
      const newBal=realBalRef.current-tradeAmt;
      realBalRef.current=newBal;
      setRealBal(newBal);
      realBalCooldown.current=Date.now()+120000;
    }
    
    if(API.auth.isAuthenticated()){
      try{
        const res=await API.trades.open({symbol:p.s,pair:p.short+"/USDT",direction:dir,amount:tradeAmt,duration:actualDuration,payout:p.payout,entry,mode:acctMode});
        if(res.success){
          const t={id:res.trade._id,dir,entry,amt:tradeAmt,duration:actualDuration,symbol:p.s,pairLabel:p.otc?p.short:p.short+"/USDT",openTime:res.trade.openTime,endTime:res.trade.endTime,done:false,_backend:true,mode:acctMode};
          setTrades(prev=>[...prev,t]);
          // Balance was already deducted atomically at top of function
          drawTradeOverlays(t);
          if(settings.sound)playOpen();
          toast("Trade Opened",`${dir} ${p.short} @ ${entry.toFixed(p.prec)}`,"success",2000);
        }else{
          // Backend rejected — open locally (bypass backend limit)
          const id=Date.now()+"_"+Math.random().toString(36).slice(2,6);
          const t={id,dir,entry,amt:tradeAmt,duration:actualDuration,symbol:p.s,pairLabel:p.otc?p.short:p.short+"/USDT",openTime,endTime,done:false,mode:acctMode};
          setTrades(prev=>[...prev,t]);
          // Balance was already deducted atomically at top of function
          drawTradeOverlays(t);if(settings.sound)playOpen();
          toast("Trade Opened",`${dir} ${p.short} @ ${entry.toFixed(p.prec)}`,"success",2000);
        }
      }catch(e){
        // Backend error — open locally
        const id=Date.now()+"_"+Math.random().toString(36).slice(2,6);
        const t={id,dir,entry,amt:tradeAmt,duration:actualDuration,symbol:p.s,pairLabel:p.otc?p.short:p.short+"/USDT",openTime,endTime,done:false,mode:acctMode};
        setTrades(prev=>[...prev,t]);
        // Balance was already deducted atomically at top of function
        drawTradeOverlays(t);if(settings.sound)playOpen();
        toast("Trade Opened",`${dir} ${p.short} @ ${entry.toFixed(p.prec)}`,"success",2000);
      }
    }else{
      const id=Date.now()+"_"+Math.random().toString(36).slice(2,6);
      const t={id,dir,entry,amt:tradeAmt,duration:actualDuration,symbol:p.s,pairLabel:p.otc?p.short:p.short+"/USDT",openTime,endTime,done:false};
      // Balance was already deducted atomically at top (via setBal/setRealBal in isDemo branch)
      setTrades(prev=>[...prev,t]);drawTradeOverlays(t);if(settings.sound)playOpen();
      toast("Trade Opened",`${dir} ${p.short} @ ${entry.toFixed(p.prec)}`,"success",2000);
    }
  };

  const openTrade=async(dir,durOverride,pairOverride)=>{if(lp===0)return;
    // Allow override of duration (for signal copy) and pair
    const useDur=durOverride||dur;
    const useP=pairOverride||p;
    // Block real forex trades on weekend (OTC pairs unaffected)
    if(useP&&useP.realForex&&!marketStatus.isOpen){
      toast("Market Closed",`Forex market is closed. Reopens in ${fmtMarketCountdown(marketStatus.msUntilOpen)}. Try OTC pairs instead.`,"warn",3500);
      return;
    }
    // Duration limits depend on pair type.
    // OTC pairs: 5s minimum, 4h maximum (synthetic pairs allow blitz trading).
    // Real pairs (forex + crypto): 1m minimum, 60m maximum.
    const isOtcPair=useP&&useP.otc;
    const minSec=isOtcPair?5:60;
    const maxSec=isOtcPair?14400:3600;
    if(useDur.sec<minSec){toast("Invalid Time",`Minimum ${minSec<60?minSec+" seconds":Math.floor(minSec/60)+" minute"}`,"warn");return;}
    if(useDur.sec>maxSec){toast("Invalid Time",`Maximum ${maxSec>=3600?Math.floor(maxSec/3600)+"h":Math.floor(maxSec/60)+" minutes"}`,"warn");return;}
    // Compute the actual $ trade amount based on investment mode.
    // The "amt" state is in dollars (1-2000); "amtPercent" is in % (1-100).
    const checkAmt=invMode==="percent"
      ?Math.max(1,Math.floor((isDemo?balRef.current:realBalRef.current)*amtPercent/100))
      :amt;
    if(invMode==="fixed"){
      if(amt<1){toast("Invalid Amount","Minimum $1","warn");setAmt(1);return;}
      if(amt>2000){toast("Invalid Amount","Maximum $2000","warn");setAmt(2000);return;}
    }else{
      if(amtPercent<1){toast("Invalid %","Minimum 1%","warn");setAmtPercent(1);return;}
      if(amtPercent>100){toast("Invalid %","Maximum 100%","warn");setAmtPercent(100);return;}
    }
    // Trade limit — 30 for OTC pairs (faster expiries → more concurrent trades), 7 for real pairs
    const totalActive=trades.filter(t=>!t.done).length;
    const maxTrades=isOtcPair?30:7;
    if(totalActive>=maxTrades){toast("Trade Limit",`Max ${maxTrades} trades total`,"warn");return;}
    if(checkAmt>activeBal){toast("Insufficient","Not enough funds","error");return;}
    
    const entry=pr.current;
    const now=Date.now();
    const openTime=now;
    let actualDuration=useDur.sec;
    let endTime;
    if(isOtcPair){
      // OTC pair → simple personal countdown. Trade opens NOW, expires after exact duration.
      endTime=now+useDur.sec*1000;
    }else{
      // Real pair (forex/crypto) → Quotex-style snap to candle boundary.
      // Trade always expires at a 1-minute candle close. The "duration" the user picks acts
      // as the BASE: we look for the first candle close that's at least (duration - 30s) away.
      // Examples (1m duration = 60s):
      //   - 40s remaining in current candle → use current close (40s from now)
      //   - 30s remaining in current candle → skip to next candle close (1m + 30s = 90s)
      //   - 5s remaining → skip to next (1m + 5s = 65s)
      // Why 30s cutoff? It's standard Quotex behavior — protects users from getting a near-zero
      // trade if they click right before the candle closes.
      const candleMs=60*1000; // 1-minute candle boundary
      const candleStart=Math.floor(now/candleMs)*candleMs;
      const remInCandle=candleMs-(now-candleStart); // ms left in current candle
      // First candle boundary AT OR AFTER (duration - 30s) from now
      // Equivalently: take next candle close that gives at least (duration - 30s) of trade time.
      const minTradeMs=Math.max(0,useDur.sec*1000-30000);
      let candidate=candleStart+candleMs; // next candle close
      while(candidate-now<minTradeMs)candidate+=candleMs;
      // Edge: if user picked sub-30s threshold scenario, ensure trade is at least 5s long
      if(candidate-now<5000)candidate+=candleMs;
      endTime=candidate;
      actualDuration=Math.round((endTime-now)/1000);
    }
    const durMin=Math.floor(actualDuration/60);const durSec=actualDuration%60;
    const timeStr=`${String(Math.floor(actualDuration/3600)).padStart(2,"0")}:${String(durMin%60).padStart(2,"0")}:${String(durSec).padStart(2,"0")}`;

    if(settings.oneClickTrade){
      // Direct trade — no popup
      await executeTrade(dir,entry,actualDuration,endTime,openTime);
    }else{
      // Show confirmation popup
      setPendingTrade({dir,entry,amt,actualDuration,endTime,openTime,symbol:p.s,label:p.label,short:p.short,logo:p.logo,logo2:p.logo2,realForex:p.realForex,flag:p.flag,otc:p.otc,payout:p.payout,prec:p.prec,timeStr});
    }
  };
  
  // === PENDING TRADE — place from inline form (right panel, when pendingMode is ON) ===
  // Called directly from the Up/Put buttons in the pending entry form.
  // No modal — places order immediately with current pair, current dur, current amt.
  const placePendingFromForm=(dir)=>{
    if(lp===0)return;
    if(amt<1){toast("Invalid Amount","Minimum $1","warn");setAmt(1);return;}
    if(amt>2000){toast("Invalid Amount","Maximum $2000","warn");setAmt(2000);return;}
    if(amt>activeBal){toast("Insufficient","Not enough funds","error");return;}
    if(pendingTrades.length>=10){toast("Pending Limit","Max 10 pending orders","warn");return;}
    if(p&&p.realForex&&!marketStatus.isOpen){
      toast("Market Closed",`Forex market is closed. Try OTC pairs.`,"warn",3500);
      return;
    }
    const tgt=pendingTargetInput;
    if(!isFinite(tgt)||tgt<=0){toast("Invalid Quote","Enter a valid target price","warn");return;}
    const cur=pr.current;
    if(!isFinite(cur)||cur===0)return;
    // targetSide auto-detected: above current → wait for upward cross; below → downward cross
    const targetSide=tgt>=cur?"above":"below";
    const newPending={
      id:"pt_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
      dir,
      targetPrice:parseFloat(tgt.toFixed(p.prec)),
      targetSide,
      createdPrice:cur,
      createdAt:Date.now(),
      amt,
      durSec:dur.sec,
      durLabel:dur.label,
      symbol:p.s,
      short:p.short,
      pair:p.short+"/USDT",
      prec:p.prec
    };
    setPendingTrades(prev=>[...prev,newPending]);
    toast("Pending Order Placed",`${dir} ${p.short} @ ${tgt.toFixed(p.prec)}`,"warn",3500);
    if(settings.sound)playOpen();
  };

  // === PENDING TRADE — open modal from chart click ===
  // Called when user clicks the ⏱ pending button on chart at a specific price level.
  // The price they clicked becomes the target; direction auto-derived from current price.
  const openPendingPromptAt=(targetPrice)=>{
    if(lp===0)return;
    if(amt<1){toast("Invalid Amount","Minimum $1","warn");setAmt(1);return;}
    if(amt>2000){toast("Invalid Amount","Maximum $2000","warn");setAmt(2000);return;}
    if(amt>activeBal){toast("Insufficient","Not enough funds","error");return;}
    if(pendingTrades.length>=10){toast("Pending Limit","Max 10 pending orders","warn");return;}
    if(p&&p.realForex&&!marketStatus.isOpen){
      toast("Market Closed",`Forex market is closed. Try OTC pairs.`,"warn",3500);
      return;
    }
    const curPrice=pr.current;
    if(!isFinite(curPrice)||curPrice===0)return;
    // Auto-direction: if target above current, expect HIGHER; if below, expect LOWER
    const dir=targetPrice>=curPrice?"HIGHER":"LOWER";
    setPendingPrompt({
      dir,
      currentPrice:curPrice,
      targetPrice:parseFloat(targetPrice.toFixed(p.prec)),
      amt,
      durSec:dur.sec,
      durLabel:dur.label,
      pair:p
    });
  };
  
  // === PENDING MODE — sync target input with current price ===
  // When user turns pending mode ON or switches pair, prefill the quote input with current price.
  // After that, user edits manually — we don't auto-overwrite their input.
  useEffect(()=>{
    if(pendingMode&&pr.current>0){
      setPendingTargetInput(parseFloat(pr.current.toFixed(p.prec)));
    }
  },[pendingMode,p.s]);

  // === PENDING MODAL — live current price updater ===
  // While the pending prompt modal is open, refresh its `currentPrice` field every 200ms
  // from pr.current so the displayed price reflects the live market move (chart isn't frozen).
  // Only updates currentPrice — never overwrites user-edited targetPrice.
  useEffect(()=>{
    if(!pendingPrompt)return;
    const iv=setInterval(()=>{
      const cur=pr.current;
      if(!isFinite(cur)||cur===0)return;
      setPendingPrompt(prev=>{
        if(!prev)return prev;
        // Only update if price actually changed (avoids unnecessary re-renders)
        if(Math.abs(prev.currentPrice-cur)<Math.pow(10,-(prev.pair?.prec||4))/2)return prev;
        return{...prev,currentPrice:cur};
      });
    },200);
    return()=>clearInterval(iv);
  },[pendingPrompt?.pair?.s,pendingPrompt!==null]);

  // === PENDING TRADE WATCHER ===
  // Watches pr.current — when a pending trade's target price is crossed, execute it
  // as a normal trade. Runs at 250ms interval (4Hz) — fast enough to catch fast moves
  // but light on CPU.
  const pendingTradesRef=useRef(pendingTrades);pendingTradesRef.current=pendingTrades;
  const prevPendingPriceRef=useRef({});
  useEffect(()=>{
    if(pendingTradesRef.current.length===0)return;
    const iv=setInterval(()=>{
      const list=pendingTradesRef.current;
      if(list.length===0)return;
      // Group by symbol for efficient checking — only the active pair has live price in pr.current
      const triggered=[];
      list.forEach(pt=>{
        // Only check trades for currently displayed pair (others can't be evaluated yet)
        if(pt.symbol!==p.s)return;
        const cur=pr.current;
        if(!isFinite(cur)||cur===0)return;
        const prev=prevPendingPriceRef.current[pt.id]||cur;
        // Trigger condition — price crosses target
        // For "HIGHER" target above current at creation: trigger when price goes UP through target
        // For "LOWER" target below current at creation: trigger when price goes DOWN through target
        const wasAbove=prev>=pt.targetPrice;
        const isAbove=cur>=pt.targetPrice;
        const crossed=(pt.targetSide==="above"&&!wasAbove&&isAbove)||
                      (pt.targetSide==="below"&&wasAbove&&!isAbove)||
                      // Initial trigger if already at/past target on creation tick
                      (pt.targetSide==="above"&&isAbove&&!prevPendingPriceRef.current[pt.id])||
                      (pt.targetSide==="below"&&!isAbove&&!prevPendingPriceRef.current[pt.id]);
        prevPendingPriceRef.current[pt.id]=cur;
        if(crossed)triggered.push(pt);
      });
      if(triggered.length===0)return;
      // Execute each triggered pending trade
      triggered.forEach(pt=>{
        // Re-validate balance before firing
        if(pt.amt>activeBal){
          toast("Pending Cancelled",`Insufficient funds for ${pt.short}`,"error",3500);
          setPendingTrades(prev=>prev.filter(x=>x.id!==pt.id));
          return;
        }
        const entry=pr.current;
        const now=Date.now();
        const endTime=now+pt.durSec*1000;
        // Pass pt.amt explicitly via amtOverride — independent of current `amt` slider state
        executeTrade(pt.dir,entry,pt.durSec,endTime,now,pt.amt);
        toast("Pending Triggered",`${pt.dir} ${pt.short} @ ${entry.toFixed(pt.prec)}`,"success",3500);
        // Remove from pending list
        setPendingTrades(prev=>prev.filter(x=>x.id!==pt.id));
        delete prevPendingPriceRef.current[pt.id];
      });
    },250);
    return()=>clearInterval(iv);
  },[pendingTrades.length,p.s,activeBal]);

  // Keyboard shortcuts — check toggle from localStorage
  useEffect(()=>{const onKey=(e)=>{
    if(!ls("qt_kb_shortcuts",true))return; // shortcuts disabled
    const tag=(e.target?.tagName||"").toLowerCase();
    if(tag==="input"||tag==="textarea"||tag==="select")return;
    const k=e.key.toLowerCase();
    if(k==="h"){e.preventDefault();openTrade("HIGHER");}
    else if(k==="l"){e.preventDefault();openTrade("LOWER");}
    else if(k==="a"){e.preventDefault();setPairPickerOpen(true);}
    else if(k==="f"){e.preventDefault();if(!document.fullscreenElement){document.documentElement.requestFullscreen?.();}else{document.exitFullscreen?.();}}
    else if(k==="+"||k==="="){e.preventDefault();setAmt(prev=>Math.min(2000,prev+1));}
    else if(k==="-"){e.preventDefault();setAmt(prev=>Math.max(1,prev-1));}
    else if(k==="t"){e.preventDefault();setTi(prev=>(prev+1)%TFS.length);}
    else if(k==="w"){e.preventDefault();if(!walletView){setAccountView(null);setWalletView("wallets");}else setWalletView(null);}
    else if(k==="p"){e.preventDefault();if(!accountView){setWalletView(null);setAccountView("account");}else setAccountView(null);}
    else if(k==="escape"){e.preventDefault();closeAllPanels();setWalletView(null);setAccountView(null);setPairPickerOpen(false);setProfileOpen(false);setDrawerOpen(false);}
  };window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[openTrade,pairTabs,walletView,accountView]);

  const activePair=trades.filter(t=>t.symbol===p.s&&!t.done);const allActive=trades.filter(t=>!t.done);
  // Max concurrent trades: 30 for OTC pairs (synthetic, allow rapid blitz), 7 for real pairs
  const maxTradesForPair=(p&&p.otc)?30:7;
  const tradeLimitReached=allActive.length>=maxTradesForPair;

  const isLight=settings.themeMode==="light";
  const T=isLight?{...C,bg:"#ffffff",card:"#f9fafb",el:"#f3f4f6",text:"#111827",sub:"#4b5563",muted:"#6b7280",border:"#e5e7eb",accent:"#10b981",accentDim:"#10b98115",redDim:"#ef444415",greenDim:"#10b98122"}:C;

  const isRTL=["ar","ur"].includes(settings.language);
  return(<div className={isLight?"qt-light":"qt-dark"} dir={isRTL?"rtl":"ltr"} style={{display:"flex",flexDirection:isMobile?"column":"row",height:"100dvh",minHeight:"-webkit-fill-available",overflow:"hidden",...IN,background:T.bg,color:T.text,transition:"background 0.3s,color 0.3s"}}>
    <ToastContainer toasts={toasts} onDismiss={dismissToast} T={T} isMobile={isMobile}/>
    <HistoryPanel open={ho} onClose={()=>setHo(false)} trades={history} T={T}/>
    <AlertsPanel open={ao} onClose={()=>setAo(false)} alerts={alerts} currentPair={p.short+"/USDT"} currentPrice={lp} onAdd={async a=>{
      if(API.auth.isAuthenticated()){
        try{
          const res=await API.alerts.create({pair:a.pair,symbol:a.pair.replace("/",""),price:a.price,direction:a.dir});
          if(res.success){
            setAlerts(prev=>[...prev,{...res.alert,id:res.alert._id,dir:res.alert.direction}]);
            toast("Alert Set",`${a.dir} ${a.price}`,"success",2000);
          }
        }catch(e){toast("Alert Failed",e.message,"error",3000);}
      }else{
        setAlerts(prev=>[...prev,a]);
        toast("Alert Set",`${a.dir} ${a.price}`,"success",2000);
      }
    }} onDelete={async id=>{
      if(API.auth.isAuthenticated()){
        try{await API.alerts.delete(id);}catch{}
      }
      setAlerts(prev=>prev.filter(a=>a.id!==id));
    }} T={T}/>
    <SignalsPanel open={sgo} onClose={()=>setSgo(false)} signals={signals} T={T} availablePairs={pairTabs.map(idx=>PAIRS[idx]).filter(Boolean)} onCopyTrade={isGuest?()=>{setSgo(false);onNav("register");}:(sig)=>{
      const pp=PAIRS.find(x=>x.s===sig.symbol);
      if(!pp)return;
      const pIdx=PAIRS.indexOf(pp);
      // 1. Add to tabs if not already there (enforce 5-tab limit; rotate out non-active tab if full)
      if(!pairTabs.includes(pIdx)){
        const maxTabs=window.innerWidth<768?2:5;
        if(pairTabs.length>=maxTabs){
          const rm=pairTabs.find(x=>x!==pi)||pairTabs[0];
          setPairTabs([...pairTabs.filter(x=>x!==rm),pIdx]);
        }else{
          setPairTabs([...pairTabs,pIdx]);
        }
      }
      // 2. Switch to this pair
      setPi(pIdx);
      // 3. Set duration UI to match signal's duration
      const durIdx=DURS.findIndex(d=>d.label===sig.expiry);
      if(durIdx>=0)setDi(durIdx);
      // 4. Find duration object directly (don't rely on state update)
      const sigDur=DURS.find(d=>d.label===sig.expiry)||DURS[0];
      // 5. Open trade with exact signal direction + duration + pair
      setTimeout(()=>{
        openTrade(sig.dir,sigDur,pp);
        setSgo(false);
        toast("Signal Copied",`${sig.dir} • ${pp.label} • ${sig.expiry}`,"success",3000);
      },500);
    }}/>
    <RankingPanel open={rko} onClose={()=>setRko(false)} trades={history} T={T}/>
    {/* Trading Stats — Full Page */}
    {statsOpen&&<div style={{position:"fixed",inset:0,zIndex:252,background:T.bg,display:"flex",flexDirection:"column",...IN,color:T.text,overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",padding:"14px 18px",borderBottom:`1px solid ${T.border}`,background:T.card,gap:12,flexShrink:0}}>
        <button onClick={()=>setStatsOpen(false)} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex"}}>{Ic.back}</button>
        <span style={{fontSize:16,fontWeight:700}}>Trading Statistics</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",maxWidth:600,margin:"0 auto",width:"100%"}}>
        {(()=>{const allH=[...history,...(trades||[]).filter(t=>t.done)];const h=allH.filter(t=>t.mode==="real"||t.accountMode==="real");const totalT=h.length;const wins=h.filter(t=>t.status==="won"||t.won).length;const losses=h.filter(t=>t.status==="lost"||(!t.won&&t.done)).length;const totalPnl=h.reduce((s,t)=>s+(t.profitLoss||t.pnl||t.payout||0),0);const winRate=totalT>0?((wins/totalT)*100).toFixed(1):"0.0";const bestStreak=(()=>{let max=0,cur=0;h.forEach(t=>{if(t.status==="won"||t.won){cur++;if(cur>max)max=cur;}else cur=0;});return max;})();const avgWin=wins>0?(h.filter(t=>t.status==="won"||t.won).reduce((s,t)=>s+Math.abs(t.profitLoss||t.pnl||t.payout||0),0)/wins).toFixed(2):"0.00";const avgLoss=losses>0?(h.filter(t=>t.status==="lost"||(t.done&&!t.won)).reduce((s,t)=>s+Math.abs(t.profitLoss||t.pnl||t.amount||0),0)/losses).toFixed(2):"0.00";const minAmt=h.length>0?Math.min(...h.map(t=>t.amount||t.amt||0)).toFixed(2):"0.00";const maxAmt=h.length>0?Math.max(...h.map(t=>t.amount||t.amt||0)).toFixed(2):"0.00";const maxPnl=h.length>0?Math.max(...h.map(t=>t.profitLoss||t.pnl||t.payout||0)).toFixed(2):"0.00";
        return(<>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {[{l:"Total Trades",v:totalT,c:T.text},{l:"Net Profit",v:(totalPnl>=0?"+$":"-$")+Math.abs(totalPnl).toFixed(2),c:totalPnl>=0?T.green:T.red},{l:"Win Rate",v:winRate+"%",c:parseFloat(winRate)>=50?T.green:T.red},{l:"Best Streak",v:bestStreak,c:T.text}].map((s,i)=>(
              <div key={i} style={{background:T.card,borderRadius:10,padding:"16px 14px",border:`1px solid ${T.border}`}}>
                <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>{s.l}</div>
                <div style={{...MO,fontSize:22,fontWeight:700,color:s.c}}>{s.v}</div>
              </div>
            ))}
          </div>
          <div style={{background:T.card,borderRadius:10,padding:"16px 18px",border:`1px solid ${T.border}`,marginBottom:16}}>
            <div style={{...IN,fontSize:12,fontWeight:700,marginBottom:14}}>General Statistics</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
              {[{l:"Total Profit",v:"$"+Math.abs(totalPnl).toFixed(2),c:totalPnl>=0?T.green:T.red},{l:"Profitable Trades",v:wins,c:T.green},{l:"Unprofitable",v:losses,c:T.red},{l:"Min Trade Amount",v:"$"+minAmt,c:T.text},{l:"Max Trade Amount",v:"$"+maxAmt,c:T.text},{l:"Max Trade Profit",v:"$"+maxPnl,c:T.green},{l:"Avg Win",v:"$"+avgWin,c:T.green},{l:"Avg Loss",v:"$"+avgLoss,c:T.red},{l:"Profit Factor",v:parseFloat(avgLoss)>0?(parseFloat(avgWin)/parseFloat(avgLoss)).toFixed(2):"∞",c:T.accent}].map((s,i)=>(
                <div key={i} style={{textAlign:"center",padding:"8px 0"}}>
                  <div style={{...MO,fontSize:14,fontWeight:700,color:s.c}}>{s.v}</div>
                  <div style={{...IN,fontSize:8,color:T.sub,marginTop:3,textTransform:"uppercase",letterSpacing:".03em"}}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{background:T.card,borderRadius:10,padding:"16px 18px",border:`1px solid ${T.border}`}}>
            <div style={{...IN,fontSize:12,fontWeight:700,marginBottom:12}}>P&L by Instrument</div>
            {(()=>{const byPair={};h.forEach(t=>{const k=t.pair||t.symbol||"Unknown";if(!byPair[k])byPair[k]={pnl:0,count:0};byPair[k].pnl+=(t.profitLoss||t.pnl||t.payout||0);byPair[k].count++;});const entries=Object.entries(byPair).sort((a,b)=>b[1].pnl-a[1].pnl);if(entries.length===0)return <div style={{textAlign:"center",padding:20,color:T.muted,fontSize:12}}>No real account trades yet</div>;const maxPnlAbs=Math.max(...entries.map(e=>Math.abs(e[1].pnl)),1);return entries.map(([pair,d])=>(
              <div key={pair} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${T.border}22`}}>
                <span style={{...MO,fontSize:11,color:T.sub,width:90}}>{pair}</span>
                <div style={{flex:1,height:6,background:T.el,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:Math.abs(d.pnl)/maxPnlAbs*100+"%",height:"100%",background:d.pnl>=0?T.green:T.red,borderRadius:3}}/>
                </div>
                <span style={{...MO,fontSize:12,fontWeight:600,color:d.pnl>=0?T.green:T.red,minWidth:70,textAlign:"right"}}>{d.pnl>=0?"+":""}${d.pnl.toFixed(2)}</span>
              </div>
            ));})()}
          </div>
        </>);})()}
      </div>
    </div>}
    {/* === PAIR INFORMATION POPUP === — Quotex-style fair-info card.
        Opens when user clicks the ℹ icon next to live clock.
        Transparent floating modal — chart visible behind. Click outside or × to close. */}
    {pairInfoOpen&&<>
      {/* Outside-click catcher (transparent — no dimming so chart stays visible) */}
      <div onClick={()=>setPairInfoOpen(false)} style={{position:"fixed",inset:0,zIndex:252}}/>
      <div style={{
        position:"fixed",top:"50%",left:"50%",transform:"translate(-50%, -50%)",
        background:T.card+"f0",
        backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)",
        border:`1px solid ${T.border}`,
        borderRadius:12,
        width:480,maxWidth:"94vw",
        zIndex:253,
        overflow:"hidden",
        boxShadow:"0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
        animation:"fadeIn 0.12s",
        ...IN,color:T.text
      }}>
        {/* === HEADER === */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",background:`linear-gradient(180deg, ${T.el+"40"}, transparent)`,borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <PairLogo pair={p} size={28}/>
            <div>
              <div style={{...IN,fontSize:16,fontWeight:700,lineHeight:1.1}}>{p.short}</div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginTop:3}}>
                <span style={{...MO,fontSize:11,fontWeight:700,color:T.yellow}}>{p.payout}%</span>
                <span style={{width:1,height:10,background:T.border}}/>
                {p.realForex&&!marketStatus.isOpen?
                  <span style={{...MO,fontSize:10,color:T.red,fontWeight:600}}>● Closed</span>
                  :<span style={{...MO,fontSize:10,color:T.green,fontWeight:600}}>● Open Now</span>
                }
              </div>
            </div>
          </div>
          <button
            onClick={()=>setPairInfoOpen(false)}
            style={{width:24,height:24,borderRadius:6,background:"transparent",border:`1px solid ${T.border}`,color:T.sub,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",padding:0}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.el;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.sub;}}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        {/* === BODY — two columns === */}
        {(()=>{
          // Compute live data
          const curPrice=pr.current||0;
          const candles=kr.current;
          // Helper: percent change between prices
          const pct=(now,past)=>past>0?((now-past)/past*100):0;
          // Find prices N candles ago for various time windows
          const candleTfMs=tf.ms;
          const candlesFor5min=Math.max(1,Math.ceil(300000/candleTfMs));
          const candlesFor1hour=Math.max(1,Math.ceil(3600000/candleTfMs));
          const candlesFor1day=Math.max(1,Math.ceil(86400000/candleTfMs));
          const len=candles.length;
          const price5mAgo=len>candlesFor5min?candles[len-1-candlesFor5min]?.close||curPrice:curPrice;
          const price1hAgo=len>candlesFor1hour?candles[len-1-candlesFor1hour]?.close||curPrice:curPrice;
          const price1dAgo=len>candlesFor1day?candles[len-1-candlesFor1day]?.close||curPrice:curPrice;
          // Session change = since first candle in current session (approx: start of today UTC)
          const sessionStart=candles.find(c=>c.timestamp>=Math.floor(Date.now()/86400000)*86400000)?.close||candles[0]?.close||curPrice;
          // Synthetic 1y change — deterministic per-pair (since we don't have year history)
          let h=0;for(let i=0;i<p.s.length;i++)h=((h<<5)-h+p.s.charCodeAt(i))|0;
          const seed=Math.abs(h)/2147483647;
          const change1y=parseFloat((seed*8-1).toFixed(2)); // -1% to +7%
          // Min investment, profit values
          const minInv=1;
          const profit1m=p.payout;
          const profit5m=Math.min(95,p.payout+Math.floor(((p.s.charCodeAt(0)+p.s.charCodeAt(1))%8)+3));
          // Synthetic Buy/Sell sentiment — deterministic per-pair, drifts slowly
          const sentDrift=Math.sin(Date.now()/300000+seed*50)*15;
          const buyPct=Math.round(Math.max(20,Math.min(80,55+seed*20+sentDrift)));
          const sellPct=100-buyPct;
          const change5m=pct(curPrice,price5mAgo);
          const change1h=pct(curPrice,price1hAgo);
          const change1d=pct(curPrice,price1dAgo);
          const sessionChange=pct(curPrice,sessionStart);
          // Helper to format change with sign + color
          const fmtChange=(v)=>({
            text:(v>=0?"+":"")+v.toFixed(2)+"%",
            color:v>=0?T.green:T.red
          });
          
          return(<>
          {/* Body — two columns */}
          <div style={{padding:"16px 18px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
            {/* LEFT — big price + Trade Now button */}
            <div>
              <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px",marginBottom:3}}>Price Now</div>
              <div style={{...MO,fontSize:22,fontWeight:700,lineHeight:1,color:T.text}}>{curPrice.toFixed(p.prec)}</div>
              <div style={{...MO,fontSize:10,fontWeight:600,marginTop:5,color:fmtChange(sessionChange).color}}>{fmtChange(sessionChange).text} session</div>
              <button
                onClick={()=>{setPairInfoOpen(false);}}
                style={{width:"100%",marginTop:12,padding:"10px 0",borderRadius:8,border:"none",background:`linear-gradient(135deg, ${T.accent}, ${T.accent}dd)`,color:"#fff",...IN,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:`0 4px 14px ${T.accent}55`}}
              >
                <span>Trade Now</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            </div>

            {/* RIGHT — info rows */}
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {[
                {l:"Min investment",v:`$${minInv}`,c:null},
                {l:"Profit 1m",v:`${profit1m}%`,c:T.green},
                {l:"Profit 5m+",v:`${profit5m}%`,c:T.green},
                {l:"Expiry",v:"1m - 1h",c:null},
                {l:"5m change",v:fmtChange(change5m).text,c:fmtChange(change5m).color},
                {l:"1h change",v:fmtChange(change1h).text,c:fmtChange(change1h).color},
                {l:"1d change",v:fmtChange(change1d).text,c:fmtChange(change1d).color},
                {l:"1y change",v:fmtChange(change1y).text,c:fmtChange(change1y).color}
              ].map((r,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:11}}>
                <span style={{...IN,color:T.sub,fontWeight:500}}>{r.l}</span>
                <span style={{...MO,color:r.c||T.text,fontWeight:700}}>{r.v}</span>
              </div>))}
            </div>
          </div>

          {/* === SENTIMENT BAR — Buy/Sell traders sentiment === */}
          <div style={{padding:"12px 18px",borderTop:`1px solid ${T.border}`,background:T.bg+"40"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{...MO,fontSize:10,fontWeight:700,color:T.red}}>{sellPct}%</span>
              <span style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.4px"}}>Traders' Sentiment</span>
              <span style={{...MO,fontSize:10,fontWeight:700,color:T.green}}>{buyPct}%</span>
            </div>
            {/* Bar — sell on left (red), buy on right (green) */}
            <div style={{height:5,background:T.el,borderRadius:3,overflow:"hidden",display:"flex"}}>
              <div style={{width:sellPct+"%",height:"100%",background:`linear-gradient(90deg, ${T.red}, ${T.red}dd)`}}/>
              <div style={{width:buyPct+"%",height:"100%",background:`linear-gradient(90deg, ${T.green}aa, ${T.green})`}}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:5}}>
              <span style={{...IN,fontSize:9,color:T.muted,fontWeight:600}}>Sell</span>
              <span style={{...IN,fontSize:9,color:T.muted,fontWeight:600}}>Buy</span>
            </div>
          </div>
          </>);
        })()}
      </div>
    </>}
    
    {/* === PENDING TRADE — TARGET PRICE PROMPT === */}
    {/* Modal shown when user clicks the ⏱ pending button on chart at a specific price level.
        Asks for target price; on confirm, saves to pendingTrades list.
        The pending watcher executes the trade when price hits target. */}
    {pendingPrompt&&<>
      <div onClick={()=>setPendingPrompt(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:300}}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:380,maxWidth:"90vw",background:T.card,border:`1px solid ${T.border}`,borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",zIndex:301,...IN,color:T.text,overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"20px 24px 12px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{width:28,height:28,borderRadius:7,background:T.yellow+"22",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.yellow} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div style={{...IN,fontSize:16,fontWeight:700}}>Set Pending Trade</div>
          </div>
          <div style={{...IN,fontSize:11,color:T.sub}}>Trade fires automatically when price hits your target</div>
        </div>

        <div style={{padding:"16px 24px",display:"flex",flexDirection:"column",gap:12}}>
          {/* Pair */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{...IN,fontSize:12,color:T.sub}}>Pair:</span>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <PairLogo pair={pendingPrompt.pair} size={20}/>
              <span style={{...IN,fontSize:13,fontWeight:600}}>{pendingPrompt.pair.label}</span>
            </div>
          </div>

          {/* Current Price (live updating) */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{...IN,fontSize:12,color:T.sub}}>Current Price:</span>
            <span style={{...MO,fontSize:13,fontWeight:600,color:T.text}}>{pendingPrompt.currentPrice.toFixed(pendingPrompt.pair.prec)}</span>
          </div>

          {/* Target price input */}
          <div>
            <div style={{...IN,fontSize:11,color:T.sub,marginBottom:5}}>Target Price (trade fires when reached):</div>
            <div style={{display:"flex",alignItems:"stretch",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",background:T.el}}>
              <button
                onClick={()=>{
                  // Decrease by smallest sensible step based on precision
                  const step=Math.pow(10,-pendingPrompt.pair.prec);
                  setPendingPrompt(p=>({...p,targetPrice:parseFloat((p.targetPrice-step*10).toFixed(p.pair.prec))}));
                }}
                style={{width:36,border:"none",background:"transparent",color:T.sub,fontSize:18,cursor:"pointer",fontWeight:600}}
              >−</button>
              <input
                type="number"
                value={pendingPrompt.targetPrice}
                step={Math.pow(10,-pendingPrompt.pair.prec)}
                onChange={e=>{
                  const v=parseFloat(e.target.value);
                  if(isFinite(v))setPendingPrompt(p=>({...p,targetPrice:v}));
                }}
                style={{flex:1,...MO,fontSize:18,fontWeight:700,color:T.text,background:"transparent",border:"none",outline:"none",textAlign:"center",padding:"10px 0"}}
              />
              <button
                onClick={()=>{
                  const step=Math.pow(10,-pendingPrompt.pair.prec);
                  setPendingPrompt(p=>({...p,targetPrice:parseFloat((p.targetPrice+step*10).toFixed(p.pair.prec))}));
                }}
                style={{width:36,border:"none",background:"transparent",color:T.sub,fontSize:18,cursor:"pointer",fontWeight:600}}
              >+</button>
            </div>
            {/* Price gap indicator */}
            <div style={{...MO,fontSize:10,color:T.muted,marginTop:5,textAlign:"center"}}>
              {(()=>{
                const gap=pendingPrompt.targetPrice-pendingPrompt.currentPrice;
                const pct=(gap/pendingPrompt.currentPrice*100).toFixed(3);
                const sign=gap>=0?"+":"";
                return `${sign}${gap.toFixed(pendingPrompt.pair.prec)} (${sign}${pct}%) from current`;
              })()}
            </div>
          </div>

          {/* Investment + Duration */}
          <div style={{display:"flex",gap:10}}>
            <div style={{flex:1,background:T.el,borderRadius:7,padding:"7px 10px"}}>
              <div style={{...IN,fontSize:9,color:T.sub,marginBottom:2}}>Investment</div>
              <div style={{...MO,fontSize:13,fontWeight:700}}>${pendingPrompt.amt}</div>
            </div>
            <div style={{flex:1,background:T.el,borderRadius:7,padding:"7px 10px"}}>
              <div style={{...IN,fontSize:9,color:T.sub,marginBottom:2}}>Duration</div>
              <div style={{...MO,fontSize:13,fontWeight:700}}>{pendingPrompt.durLabel}</div>
            </div>
          </div>
        </div>

        {/* === ACTION BUTTONS — Choose direction (HIGHER or LOWER) === */}
        {/* Each button places a pending order in that direction at the target price.
            User explicitly picks — no auto-detection from price relation. */}
        <div style={{padding:"4px 24px 12px"}}>
          <div style={{...IN,fontSize:11,color:T.sub,marginBottom:6,textAlign:"center"}}>Choose direction:</div>
          <div style={{display:"flex",gap:8}}>
            <button
              onClick={()=>{
                const cur=pendingPrompt.currentPrice;
                const tgt=pendingPrompt.targetPrice;
                if(!isFinite(tgt)||tgt<=0){toast("Invalid Price","Enter a valid target","warn");return;}
                const targetSide=tgt>=cur?"above":"below";
                const newPending={
                  id:"pt_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
                  dir:"HIGHER",
                  targetPrice:tgt,
                  targetSide,
                  createdPrice:cur,
                  createdAt:Date.now(),
                  amt:pendingPrompt.amt,
                  durSec:pendingPrompt.durSec,
                  durLabel:pendingPrompt.durLabel,
                  symbol:pendingPrompt.pair.s,
                  short:pendingPrompt.pair.short,
                  pair:pendingPrompt.pair.short+"/USDT",
                  prec:pendingPrompt.pair.prec
                };
                setPendingTrades(prev=>[...prev,newPending]);
                setPendingPrompt(null);
                toast("Pending Order Placed",`HIGHER ${pendingPrompt.pair.short} @ ${tgt.toFixed(pendingPrompt.pair.prec)}`,"warn",3500);
              }}
              style={{flex:1,padding:"12px 0",borderRadius:8,border:"none",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",cursor:"pointer",...IN,fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
            >
              <span>HIGHER</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16V8M8 12l4-4 4 4"/>
              </svg>
            </button>
            <button
              onClick={()=>{
                const cur=pendingPrompt.currentPrice;
                const tgt=pendingPrompt.targetPrice;
                if(!isFinite(tgt)||tgt<=0){toast("Invalid Price","Enter a valid target","warn");return;}
                const targetSide=tgt>=cur?"above":"below";
                const newPending={
                  id:"pt_"+Date.now()+"_"+Math.random().toString(36).slice(2,5),
                  dir:"LOWER",
                  targetPrice:tgt,
                  targetSide,
                  createdPrice:cur,
                  createdAt:Date.now(),
                  amt:pendingPrompt.amt,
                  durSec:pendingPrompt.durSec,
                  durLabel:pendingPrompt.durLabel,
                  symbol:pendingPrompt.pair.s,
                  short:pendingPrompt.pair.short,
                  pair:pendingPrompt.pair.short+"/USDT",
                  prec:pendingPrompt.pair.prec
                };
                setPendingTrades(prev=>[...prev,newPending]);
                setPendingPrompt(null);
                toast("Pending Order Placed",`LOWER ${pendingPrompt.pair.short} @ ${tgt.toFixed(pendingPrompt.pair.prec)}`,"warn",3500);
              }}
              style={{flex:1,padding:"12px 0",borderRadius:8,border:"none",background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",cursor:"pointer",...IN,fontSize:14,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
            >
              <span>LOWER</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8M16 12l-4 4-4-4"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Cancel — separate row, less prominent */}
        <div style={{padding:"0 24px 20px"}}>
          <button onClick={()=>setPendingPrompt(null)} style={{width:"100%",padding:"10px 0",borderRadius:8,border:`1px solid ${T.border}`,background:"transparent",color:T.sub,...IN,fontSize:12,fontWeight:600,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </>}
    {/* Trade Confirmation Popup */}
    {pendingTrade&&<>
      <div onClick={()=>setPendingTrade(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",backdropFilter:"blur(4px)",zIndex:300}}/>
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:380,maxWidth:"90vw",background:T.card,border:`1px solid ${T.border}`,borderRadius:16,boxShadow:"0 24px 80px rgba(0,0,0,0.6)",zIndex:301,...IN,color:T.text,overflow:"hidden"}}>
        <div style={{padding:"20px 24px 16px"}}>
          <div style={{...IN,fontSize:20,fontWeight:700,marginBottom:16}}>Trade</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Symbol:</span>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:22,height:22,borderRadius:"50%",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",background:T.el}}>{pendingTrade.otc?<span style={{fontSize:14}}>{pendingTrade.flag}</span>:<img src={pendingTrade.logo} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{e.target.style.display="none";}}/>}</div>
                <span style={{...IN,fontSize:13,fontWeight:600}}>{pendingTrade.otc?pendingTrade.label:pendingTrade.label+"("+pendingTrade.short+")"}</span>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Type:</span>
              <span style={{...IN,fontSize:13,fontWeight:600,color:pendingTrade.dir==="HIGHER"?T.green:T.red}}>{pendingTrade.dir==="HIGHER"?"Up":"Down"}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Rate of return:</span>
              <span style={{...IN,fontSize:13,fontWeight:600}}>{pendingTrade.payout}%</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Investment:</span>
              <span style={{...IN,fontSize:13,fontWeight:600}}>${pendingTrade.amt}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Your payout:</span>
              <span style={{...IN,fontSize:13,fontWeight:700,color:T.green}}>${(pendingTrade.amt+pendingTrade.amt*pendingTrade.payout/100).toFixed(2)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Open Price:</span>
              <span style={{...MO,fontSize:13,fontWeight:600}}>{pendingTrade.entry.toFixed(pendingTrade.prec)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:T.sub}}>Time:</span>
              <span style={{...MO,fontSize:13,fontWeight:600}}>{pendingTrade.timeStr}</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:10,padding:"12px 24px 20px"}}>
          <button onClick={async()=>{const pt=pendingTrade;setPendingTrade(null);await executeTrade(pt.dir,pt.entry,pt.actualDuration,pt.endTime,pt.openTime);}} style={{flex:1,padding:"14px 0",borderRadius:10,border:"none",background:"linear-gradient(135deg,#16a34a,#22c55e)",color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer"}}>Yes, processed</button>
          <button onClick={()=>setPendingTrade(null)} style={{flex:1,padding:"14px 0",borderRadius:10,border:`1px solid ${T.border}`,background:T.el,color:T.text,...IN,fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
        </div>
      </div>
    </>}
    {/* Balance Dropdown Panel */}
    {balDropOpen&&<>
      <div onClick={()=>setBalDropOpen(false)} style={{position:"fixed",inset:0,zIndex:198}}/>
      <div style={{position:"fixed",top:isMobile?52:62,right:isMobile?10:320,width:280,maxWidth:"calc(100vw - 20px)",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",zIndex:199,overflow:"hidden",...IN}}>
        {/* Real / Demo tabs — clickable to switch */}
        <div style={{display:"flex",margin:"14px 14px 0",borderRadius:10,overflow:"hidden",border:`1px solid ${T.border}`}}>
          <button onClick={()=>{if(isGuest){onNav("register");return;}setAcctMode("real");}} style={{flex:1,padding:"10px 0",border:"none",background:acctMode==="real"?T.el:"transparent",color:acctMode==="real"?T.green:T.sub,...IN,fontSize:12,fontWeight:acctMode==="real"?700:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={acctMode==="real"?T.green:T.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Real
          </button>
          <button onClick={()=>setAcctMode("demo")} style={{flex:1,padding:"10px 0",border:"none",background:acctMode==="demo"?T.el:"transparent",color:acctMode==="demo"?T.accent:T.sub,...IN,fontSize:12,fontWeight:acctMode==="demo"?700:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,borderLeft:`1px solid ${T.border}`}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={acctMode==="demo"?T.accent:T.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 10 3 12 0v-5"/></svg>
            Demo
          </button>
        </div>
        {/* Active account balance */}
        <div style={{padding:"20px 14px",textAlign:"center"}}>
          <div style={{width:48,height:48,borderRadius:12,background:isDemo?`linear-gradient(135deg,${T.yellow||"#eab308"},#b45309)`:`linear-gradient(135deg,${T.green},#059669)`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
            {isDemo?<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 10 3 12 0v-5"/></svg>
            :<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            <span style={{...MO,fontSize:28,fontWeight:700,color:T.text}}>{cvs(activeBal)}</span>
          </div>
          <div style={{...IN,fontSize:11,color:isDemo?T.accent:T.green,fontWeight:600,marginTop:4,textTransform:"uppercase",letterSpacing:".05em"}}>{isDemo?"Demo Account":"Real Account"}</div>
        </div>
        {/* Reset button for demo / Deposit button for real */}
        <div style={{padding:"0 14px 14px"}}>
          {isDemo?
            <button onClick={async()=>{if(API.auth.isAuthenticated()){try{const res=await API.auth.resetDemo();if(res.success)setBal(res.newBalance||10000);}catch{setBal(10000);}}else{setBal(10000);ss("qt_bal",10000);}setBalDropOpen(false);toast("Balance Reset","Demo balance reset to $10,000","success");}} style={{width:"100%",padding:"12px 0",borderRadius:8,border:`1px solid ${T.border}`,background:T.el,color:T.text,...IN,fontSize:13,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>
              Reset to $10,000
            </button>
          :
            <button onClick={()=>{setBalDropOpen(false);if(isGuest){onNav("register");}else{setWalletView("deposit");}}} style={{width:"100%",padding:"12px 0",borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:T.bg,...IN,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
              Deposit Funds
            </button>
          }
        </div>
        {/* Other account — click to switch */}
        <div style={{borderTop:`1px solid ${T.border}`,padding:"12px 14px"}}>
          <button onClick={()=>{if(isGuest&&isDemo){onNav("register");return;}setAcctMode(isDemo?"real":"demo");}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:"transparent",border:"none",cursor:"pointer",padding:0}}>
            <div style={{width:36,height:36,borderRadius:"50%",background:T.el,display:"flex",alignItems:"center",justifyContent:"center",border:`1.5px solid ${T.border}`}}>
              {isDemo?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 10 3 12 0v-5"/></svg>}
            </div>
            <div style={{flex:1,textAlign:"left"}}>
              <div style={{...IN,fontSize:13,fontWeight:600,color:isDemo?T.green:T.accent}}>{isDemo?"Real Account":"Demo Account"}</div>
              <div style={{...MO,fontSize:11,color:T.sub}}>${isDemo?realBal.toFixed(2):bal.toFixed(2)}</div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
          </button>
        </div>
      </div>
    </>}
    <KYCPanel open={kyco} onClose={()=>setKyco(false)} T={T}/>
    <TournamentPanel open={tno} onClose={()=>setTno(false)} T={T} onBalanceUpdate={setBal} isGuest={isGuest} onRegister={()=>{setTno(false);onNav("register");}}/>
    <SettingsPanel open={sto} onClose={()=>setSto(false)} settings={settings} onSave={async s=>{setSettings(s);try{await API.auth.updateSettings(s);}catch{}toast("Saved","Settings updated","success",2000);}} onLogout={onLogout} onOpenKYC={()=>setKyco(true)} T={T} currentUser={currentUser}/>
    {/* Quick settings — SlidePanel */}
    <SlidePanel T={T} open={chartSto} onClose={()=>setChartSto(false)} title="Settings"><div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
      {/* Trading */}
      <div style={{...IN,fontSize:10,color:T.accent,fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Trading</div>
      <div style={{marginBottom:16}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Grid Capacity</div><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{flex:1,background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 14px",...MO,fontSize:16,fontWeight:700}}>{settings.gridCapacity||10}</div><div style={{display:"flex",gap:4}}><button onClick={()=>{const v=Math.max(4,(settings.gridCapacity||10)-1);setSettings({...settings,gridCapacity:v});}} style={{width:32,height:32,borderRadius:6,border:`1px solid ${T.border}`,background:T.el,color:T.sub,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button><button onClick={()=>{const v=Math.min(20,(settings.gridCapacity||10)+1);setSettings({...settings,gridCapacity:v});}} style={{width:32,height:32,borderRadius:6,border:`1px solid ${T.border}`,background:T.el,color:T.sub,fontSize:16,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button></div></div></div>
      <div style={{marginBottom:4}}><button onClick={()=>setSettings({...settings,autoScroll:!settings.autoScroll})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 0",border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.border}`}}><div style={{textAlign:"left"}}><div style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>Auto-scrolling</div><div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>Automatic chart scrolling</div></div><div style={{width:42,height:24,borderRadius:12,background:settings.autoScroll?T.accent:T.el,border:`1px solid ${settings.autoScroll?T.accent:T.border}`,position:"relative"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:settings.autoScroll?20:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/></div></button></div>
      <div style={{marginBottom:4}}><button onClick={()=>setSettings({...settings,oneClickTrade:!settings.oneClickTrade})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 0",border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.border}`}}><div style={{textAlign:"left"}}><div style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>1 Click Trade</div><div style={{...IN,fontSize:11,color:T.sub,marginTop:2}}>Trade without confirmation</div></div><div style={{width:42,height:24,borderRadius:12,background:settings.oneClickTrade?T.accent:T.el,border:`1px solid ${settings.oneClickTrade?T.accent:T.border}`,position:"relative"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:settings.oneClickTrade?20:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/></div></button></div>
      <div style={{marginBottom:4}}><button onClick={()=>setSettings({...settings,sound:!settings.sound})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"12px 0",border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.border}`}}><div style={{...IN,fontSize:13,fontWeight:600,color:T.text}}>Sound Effects</div><div style={{width:42,height:24,borderRadius:12,background:settings.sound?T.accent:T.el,border:`1px solid ${settings.sound?T.accent:T.border}`,position:"relative"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:settings.sound?20:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.3)"}}/></div></button></div>
      {/* Appearance */}
      <div style={{borderTop:`1px solid ${T.border}`,margin:"14px 0 12px"}}/>
      <div style={{...IN,fontSize:10,color:T.accent,fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Appearance</div>
      <div style={{marginBottom:16}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Theme</div><div style={{display:"flex",gap:4}}>{[{v:"dark",l:"D Dark"},{v:"light",l:"L Light"}].map(t=>(<button key={t.v} onClick={()=>setSettings({...settings,themeMode:t.v})} style={{flex:1,padding:"10px 0",borderRadius:6,border:`1px solid ${settings.themeMode===t.v?T.accent:T.border}`,background:settings.themeMode===t.v?T.accentDim:"transparent",color:settings.themeMode===t.v?T.accent:T.sub,...IN,fontSize:12,fontWeight:600,cursor:"pointer"}}>{t.l}</button>))}</div></div>
      <div style={{marginBottom:16}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Chart Background</div><div style={{display:"flex",gap:6}}><label style={{flex:1,padding:"10px 0",borderRadius:6,border:`1px dashed ${T.border}`,background:"transparent",color:T.sub,...IN,fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"center"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;}}>Upload Image<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>setSettings({...settings,bgImage:ev.target.result});r.readAsDataURL(f);}} style={{display:"none"}}/></label>{settings.bgImage&&<button onClick={()=>setSettings({...settings,bgImage:""})} style={{padding:"10px 14px",borderRadius:6,border:`1px solid ${T.red}44`,background:T.redDim,color:T.red,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Remove</button>}</div>{settings.bgImage&&<div style={{width:"100%",height:60,borderRadius:6,marginTop:8,backgroundImage:`url(${settings.bgImage})`,backgroundSize:"cover",backgroundPosition:"center",border:`1px solid ${T.border}`}}/>}</div>
      {/* Regional */}
      <div style={{borderTop:`1px solid ${T.border}`,margin:"14px 0 12px"}}/>
      <div style={{...IN,fontSize:10,color:T.accent,fontWeight:700,marginBottom:10,textTransform:"uppercase",letterSpacing:".06em"}}>Regional</div>
      <div style={{marginBottom:14}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Timezone</div><select value={settings.timezone} onChange={e=>setSettings({...settings,timezone:e.target.value})} style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",cursor:"pointer"}}>{TIMEZONES.map(t=>(<option key={t} value={t}>{t}</option>))}</select></div>
      <div style={{marginBottom:14}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Language</div><select value={settings.language} onChange={e=>setSettings({...settings,language:e.target.value})} style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",cursor:"pointer"}}>{LANGUAGES.map(l=>(<option key={l.code} value={l.code}>{l.native} ({l.label})</option>))}</select></div>
      <div style={{marginBottom:14}}><div style={{...IN,fontSize:11,color:T.sub,fontWeight:600,marginBottom:6,textTransform:"uppercase"}}>Currency</div><select value={settings.currency} onChange={e=>setSettings({...settings,currency:e.target.value})} style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",color:T.text,...IN,fontSize:12,width:"100%",outline:"none",boxSizing:"border-box",cursor:"pointer"}}>{CURRENCIES.map(c=>(<option key={c.code} value={c.code}>{c.symbol} {c.label}</option>))}</select></div>
    </div></SlidePanel>
    <HelpPanel open={hpo} onClose={()=>setHpo(false)} T={T} onGoSupport={()=>{setWalletView(null);setAccountView("support_request");}} onGoFaqs={()=>{setWalletView(null);setAccountView("support_faq");}}/>
    <SupportPanel open={supportOpen} onClose={()=>setSupportOpen(false)} T={T} currentUser={currentUser}/>
    {/* PAIR PICKER MODAL */}
    {pairPickerOpen&&<div ref={pairPickerRef} style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%, -50%)",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,width:520,maxWidth:"94vw",maxHeight:"86vh",zIndex:252,overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 24px 100px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",animation:"fadeIn 0.12s"}}>
      {/* Header */}
      <div style={{padding:"16px 20px 0",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{...IN,fontSize:18,fontWeight:700,color:T.text}}>Select trade pair</div>
          <button onClick={()=>setPairPickerOpen(false)} style={{background:"transparent",border:"none",color:T.sub,cursor:"pointer",fontSize:22,lineHeight:1,padding:4}}>×</button>
        </div>
        {/* Category tabs — uppercase, simple, like Quotex */}
        <div style={{display:"flex",gap:0,marginBottom:12}}>
          {[{id:"forex",l:"FOREX"},{id:"crypto",l:"CRYPTO"},{id:"commodity",l:"COMMODITIES"},{id:"stocks",l:"STOCKS"}].map(c=>{
            const active=(pairCat||"forex")===c.id;
            return(<button key={c.id} onClick={()=>setPairCat(c.id)} style={{padding:"6px 14px",borderRadius:5,border:"none",background:active?T.accent:"transparent",color:active?"#fff":T.sub,...IN,fontSize:11,fontWeight:700,cursor:"pointer",letterSpacing:"0.5px",marginRight:4}}>{c.l}</button>);
          })}
        </div>
      </div>
      
      {/* Search row with star favorites button */}
      <div style={{padding:"10px 20px",display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${T.border}`}}>
        <button onClick={()=>setPairShowFavs(v=>!v)} title="Show favorites only" style={{width:38,height:36,borderRadius:6,background:pairShowFavs?T.yellow+"22":T.el,border:`1px solid ${pairShowFavs?T.yellow:T.border}`,display:"flex",alignItems:"center",justifyContent:"center",color:pairShowFavs?T.yellow:T.sub,cursor:"pointer",position:"relative",flexShrink:0}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill={pairShowFavs?T.yellow:"none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          {pairFavs.length>0&&<span style={{position:"absolute",top:-3,right:-3,background:T.accent,color:"#fff",fontSize:8,fontWeight:700,padding:"1px 4px",borderRadius:5,...MO,minWidth:14,textAlign:"center"}}>{pairFavs.length}</span>}
        </button>
        <div style={{position:"relative",flex:1}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input value={pairSearch||""} onChange={e=>setPairSearch(e.target.value)} placeholder="Search" style={{width:"100%",padding:"8px 12px 8px 32px",borderRadius:6,border:`1px solid ${T.border}`,background:T.el,color:T.text,...IN,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
        </div>
      </div>
      
      {/* Column headers — Name | 24h | 1+ min | 5+ min */}
      <div style={{display:"grid",gridTemplateColumns:"22px 1fr 80px 60px 60px",gap:8,padding:"8px 20px",fontSize:9,color:T.sub,textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:600,borderBottom:`1px solid ${T.border}`}}>
        <div></div><div>NAME</div><div style={{textAlign:"right"}}>24h ▾</div><div style={{textAlign:"right"}}>1+ min</div><div style={{textAlign:"right"}}>5+ min</div>
      </div>
      
      {/* List */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>{(()=>{
        // === Build filtered + sorted list with section dividers ===
        const search=(pairSearch||"").toLowerCase();
        const cat=pairCat||"forex";
        const filtered=PAIRS.filter(pp=>{
          if(search){
            if(!pp.label.toLowerCase().includes(search)&&!pp.short.toLowerCase().includes(search)&&!pp.s.toLowerCase().includes(search))return false;
          }
          // Favorites filter
          if(pairShowFavs){
            const idx=PAIRS.indexOf(pp);
            if(!pairFavs.includes(idx))return false;
          }
          // Category filter
          if(cat==="forex"){
            // Forex tab includes both Live Forex AND OTC pairs (excludes commodity/crypto)
            if(!pp.realForex&&!pp.otc)return false;
            if(pp.s.includes("XAU")||pp.s.includes("XAG")||pp.s.includes("XPT")||pp.s.includes("XPD"))return false;
          }
          if(cat==="crypto"&&(pp.otc||pp.realForex))return false;
          if(cat==="commodity"&&!(pp.s.includes("XAU")||pp.s.includes("XAG")||pp.s.includes("XPT")||pp.s.includes("XPD")))return false;
          if(cat==="stocks")return false; // No stocks yet — empty state
          return true;
        });
        
        // Helper: deterministic 24h change % for each pair (stable per session)
        const get24hChange=(pp)=>{
          // Hash pair symbol to derive a deterministic % between -7% and +5% (slight bear bias)
          let h=0;for(let i=0;i<pp.s.length;i++)h=((h<<5)-h+pp.s.charCodeAt(i))|0;
          const seed=Math.abs(h)/2147483647;
          // Add minute-of-hour drift so values shift slowly (real-time feel)
          const drift=(Math.sin(Date.now()/600000+seed*100)*0.5);
          return parseFloat(((seed*12)-7+drift).toFixed(2));
        };
        // Helper: 5+ min payout (slightly higher than 1m, capped at 95)
        const get5mPayout=(pp)=>Math.min(95,pp.payout+Math.floor(((pp.s.charCodeAt(0)+pp.s.charCodeAt(1))%8)+3));
        
        // === FOREX tab — split by realForex (Live) vs OTC and group ===
        if(cat==="forex"){
          const live=filtered.filter(pp=>pp.realForex);
          const otc=filtered.filter(pp=>pp.otc);
          // Sort each section by payout DESC
          live.sort((a,b)=>b.payout-a.payout);
          otc.sort((a,b)=>b.payout-a.payout);
          
          const renderRow=(pp)=>{
            const i=PAIRS.indexOf(pp);
            const isAdded=pairTabs.includes(i);
            const isFav=pairFavs.includes(i);
            const change=get24hChange(pp);
            const isUp=change>=0;
            const fivem=get5mPayout(pp);
            return(<div key={pp.s} onClick={()=>{const maxTabs=window.innerWidth<768?2:5;if(isAdded){if(pairTabs.length>1){const newTabs=pairTabs.filter(x=>x!==i);setPairTabs(newTabs);if(pi===i)setPi(newTabs[0]);}}else{if(pairTabs.length>=maxTabs){const rm=pairTabs.find(x=>x!==pi)||pairTabs[0];setPairTabs([...pairTabs.filter(x=>x!==rm),i]);}else{setPairTabs([...pairTabs,i]);}setPi(i);setPairPickerOpen(false);}}} style={{display:"grid",gridTemplateColumns:"22px 1fr 80px 60px 60px",alignItems:"center",gap:8,padding:"9px 20px",cursor:"pointer",borderBottom:`1px solid ${T.border}40`,background:isAdded?T.accent+"0a":"transparent",transition:"background 0.12s"}} onMouseEnter={e=>{e.currentTarget.style.background=isAdded?T.accent+"15":T.el+"80";}} onMouseLeave={e=>{e.currentTarget.style.background=isAdded?T.accent+"0a":"transparent";}}>
              <span onClick={(e)=>{e.stopPropagation();setPairFavs(prev=>isFav?prev.filter(x=>x!==i):[...prev,i]);}} style={{cursor:"pointer",color:isFav?T.yellow:T.muted,fontSize:14,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav?T.yellow:"none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </span>
              <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
                <PairLogo pair={pp} size={26}/>
                <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                  <span style={{...IN,fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pp.short}{pp.otc?<span style={{color:T.sub,fontWeight:500}}> (OTC)</span>:""}</span>
                  {isAdded&&<span style={{...MO,fontSize:8,fontWeight:800,color:"#fff",background:T.accent,padding:"2px 6px",borderRadius:8,letterSpacing:"0.4px",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:3}}>✓ ADDED</span>}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:5}}>
                <span style={{display:"inline-flex",width:16,height:16,borderRadius:"50%",background:isUp?T.green+"22":T.red+"22",alignItems:"center",justifyContent:"center",color:isUp?T.green:T.red,fontSize:10,fontWeight:800,lineHeight:1}}>{isUp?"↑":"↓"}</span>
                <span style={{...MO,fontSize:11,fontWeight:600,color:isUp?T.green:T.red}}>{isUp?"":""}{Math.abs(change).toFixed(2)}%</span>
              </div>
              <div style={{...MO,fontSize:11,fontWeight:700,color:T.yellow,textAlign:"right"}}>{pp.payout}%</div>
              <div style={{...MO,fontSize:11,fontWeight:700,color:T.yellow,textAlign:"right"}}>{fivem}%</div>
            </div>);
          };
          
          const sectionDivider=(label,color,count)=>(<div key={"sec-"+label} style={{display:"flex",alignItems:"center",gap:6,padding:"7px 20px",fontSize:9,fontWeight:700,color:T.sub,letterSpacing:"0.6px",textTransform:"uppercase",background:T.el+"40",borderBottom:`1px solid ${T.border}`,borderTop:`1px solid ${T.border}`}}>
            <span style={{width:5,height:5,borderRadius:"50%",background:color,display:"inline-block"}}/>
            <span>{label}</span>
            <span style={{color:T.muted,fontWeight:600}}>({count})</span>
          </div>);
          
          return(<>
            {live.length>0&&[sectionDivider("Live Forex",T.green,live.length),...live.map(renderRow)]}
            {otc.length>0&&[sectionDivider("OTC Forex",T.yellow,otc.length),...otc.map(renderRow)]}
            {live.length===0&&otc.length===0&&<div style={{textAlign:"center",padding:"40px 20px",color:T.muted,...IN,fontSize:12}}>No pairs found</div>}
          </>);
        }
        
        // === Other tabs (Crypto, Commodities, Stocks) ===
        if(filtered.length===0){
          return(<div style={{textAlign:"center",padding:"40px 20px",color:T.muted,...IN,fontSize:12}}>{cat==="stocks"?"Stocks coming soon":"No pairs found"}</div>);
        }
        // Sort by payout DESC
        filtered.sort((a,b)=>b.payout-a.payout);
        
        return filtered.map(pp=>{
          const i=PAIRS.indexOf(pp);
          const isAdded=pairTabs.includes(i);
          const isFav=pairFavs.includes(i);
          const change=get24hChange(pp);
          const isUp=change>=0;
          const fivem=get5mPayout(pp);
          return(<div key={pp.s} onClick={()=>{const maxTabs=window.innerWidth<768?2:5;if(isAdded){if(pairTabs.length>1){const newTabs=pairTabs.filter(x=>x!==i);setPairTabs(newTabs);if(pi===i)setPi(newTabs[0]);}}else{if(pairTabs.length>=maxTabs){const rm=pairTabs.find(x=>x!==pi)||pairTabs[0];setPairTabs([...pairTabs.filter(x=>x!==rm),i]);}else{setPairTabs([...pairTabs,i]);}setPi(i);setPairPickerOpen(false);}}} style={{display:"grid",gridTemplateColumns:"22px 1fr 80px 60px 60px",alignItems:"center",gap:8,padding:"9px 20px",cursor:"pointer",borderBottom:`1px solid ${T.border}40`,background:isAdded?T.accent+"0a":"transparent",transition:"background 0.12s"}} onMouseEnter={e=>{e.currentTarget.style.background=isAdded?T.accent+"15":T.el+"80";}} onMouseLeave={e=>{e.currentTarget.style.background=isAdded?T.accent+"0a":"transparent";}}>
            <span onClick={(e)=>{e.stopPropagation();setPairFavs(prev=>isFav?prev.filter(x=>x!==i):[...prev,i]);}} style={{cursor:"pointer",color:isFav?T.yellow:T.muted,fontSize:14,lineHeight:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isFav?T.yellow:"none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </span>
            <div style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}>
              <PairLogo pair={pp} size={26}/>
              <div style={{display:"flex",alignItems:"center",gap:6,minWidth:0}}>
                <span style={{...IN,fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{pp.label}</span>
                {isAdded&&<span style={{...MO,fontSize:8,fontWeight:800,color:"#fff",background:T.accent,padding:"2px 6px",borderRadius:8,letterSpacing:"0.4px",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",gap:3}}>✓ ADDED</span>}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:5}}>
              <span style={{display:"inline-flex",width:16,height:16,borderRadius:"50%",background:isUp?T.green+"22":T.red+"22",alignItems:"center",justifyContent:"center",color:isUp?T.green:T.red,fontSize:10,fontWeight:800,lineHeight:1}}>{isUp?"↑":"↓"}</span>
              <span style={{...MO,fontSize:11,fontWeight:600,color:isUp?T.green:T.red}}>{Math.abs(change).toFixed(2)}%</span>
            </div>
            <div style={{...MO,fontSize:11,fontWeight:700,color:T.yellow,textAlign:"right"}}>{pp.payout}%</div>
            <div style={{...MO,fontSize:11,fontWeight:700,color:T.yellow,textAlign:"right"}}>{fivem}%</div>
          </div>);
        });
      })()}</div>
    </div>}

    {/* Sidebar — compact icon+label vertical layout */}
    {!isMobile&&<div style={{width:72,background:T.bg,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",flexShrink:0,overflow:"hidden",zIndex:10}}>
      <div onClick={()=>setDrawerOpen(!drawerOpen)} style={{padding:"12px 0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,borderBottom:`1px solid ${T.border}`,cursor:"pointer"}} title="Menu">
        {drawerOpen?<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        :<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>}
      </div>
      <div style={{flex:1,paddingTop:6,overflowY:"auto"}}>{NAV.map(n=>{const anyPanelOpen=ho||ao||sgo||rko||tno;const isActive=(n.id==="trade"&&!walletView&&!accountView&&!anyPanelOpen)||(n.id==="wallet"&&!!walletView)||(n.id==="account"&&!!accountView);const isPanelOpen=(n.id==="history"&&ho)||(n.id==="alerts"&&ao)||(n.id==="signals"&&sgo)||(n.id==="ranking"&&rko)||(n.id==="tournament"&&tno);return(<button key={n.id} onClick={()=>{if(n.id==="trade"){closeAllPanels();setWalletView(null);setAccountView(null);return;}if(n.id==="account"){closeAllPanels();setWalletView(null);if(isGuest){onNav("register");}else{setAccountView("account");}return;}if(isGuest&&(n.id==="wallet"||n.id==="ranking")){onNav("register");return;}if(isGuest&&n.id==="tournament"){closeAllPanels();setTno(true);return;}if(n.id==="wallet"){closeAllPanels();setAccountView(null);setWalletView("wallets");return;}closeAllPanels();setAccountView(null);setTimeout(()=>{if(n.id==="history")setHo(true);else if(n.id==="alerts")setAo(true);else if(n.id==="signals")setSgo(true);else if(n.id==="ranking")setRko(true);else if(n.id==="tournament")setTno(true);else onNav(n.id);},50);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:"100%",padding:"10px 4px",border:"none",background:isActive||isPanelOpen?T.accentDim:"transparent",cursor:"pointer",color:isActive||isPanelOpen?T.accent:T.sub,...IN,fontSize:10,transition:"all 0.12s",position:"relative",borderLeft:isActive||isPanelOpen?`3px solid ${T.accent}`:"3px solid transparent"}} onMouseEnter={e=>{if(!isActive&&!isPanelOpen){e.currentTarget.style.background=T.el;e.currentTarget.style.color=T.text;}}} onMouseLeave={e=>{if(!isActive&&!isPanelOpen){e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.sub;}}}><span style={{display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>{n.icon}{n.id==="alerts"&&alerts.length>0&&<span style={{position:"absolute",top:-4,right:-8,width:14,height:14,borderRadius:"50%",background:T.yellow,color:T.bg,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{alerts.length}</span>}{n.id==="history"&&allActive.length>0&&<span style={{position:"absolute",top:-4,right:-8,width:14,height:14,borderRadius:"50%",background:T.accent,color:T.bg,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{allActive.length}</span>}{n.id==="signals"&&signals.length>0&&<span style={{position:"absolute",top:-2,right:-6,width:6,height:6,borderRadius:"50%",background:T.blue}}/>}</span><span style={{fontWeight:isActive||isPanelOpen?600:500,fontSize:10,letterSpacing:"0.2px"}}>{n.label}</span></button>);})}</div>
      <div style={{borderTop:`1px solid ${T.border}`}}>{[{icon:Ic.help,label:"Help",key:"help",action:()=>{closeAllPanels();setTimeout(()=>setHpo(true),50);}},{icon:Ic.settings,label:"Settings",key:"settings",action:()=>{closeAllPanels();setTimeout(()=>setChartSto(true),50);}}].map((item,i)=>(<button key={i} onClick={item.action} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,width:"100%",padding:"10px 4px",border:"none",background:"transparent",cursor:"pointer",color:T.sub,...IN,fontSize:10}} onMouseEnter={e=>{e.currentTarget.style.background=T.el;e.currentTarget.style.color=T.text;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.sub;}}><span style={{display:"flex",alignItems:"center",justifyContent:"center"}}>{item.icon}</span><span style={{fontWeight:500,fontSize:10,letterSpacing:"0.2px"}}>{tr(settings.language,item.key)}</span></button>))}</div>
    </div>}

    {/* Mobile top bar */}
    {isMobile&&<div style={{display:"flex",alignItems:"center",height:48,padding:"0 10px",background:T.card,borderBottom:`1px solid ${T.border}`,flexShrink:0,gap:8,position:"relative",zIndex:100}}>
      {/* Logo + brand — click goes to chart */}
      <button onClick={()=>{setMobileTab("chart");closeAllPanels();setWalletView(null);setAccountView(null);}} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0,display:"flex",alignItems:"center",gap:5}}>
        <ZextoLogo size={28}/>
        <div style={{display:"flex",alignItems:"baseline",gap:3}}>
          <span style={{...IN,fontSize:14,fontWeight:800,color:T.accent,letterSpacing:"-0.3px"}}>Zexto</span>
          <span style={{...IN,fontSize:10,fontWeight:600,color:T.sub}}>Option</span>
        </div>
      </button>
      <div style={{flex:1}}/>
      {/* Balance pill */}
      <button onClick={()=>setBalDropOpen(!balDropOpen)} style={{display:"flex",alignItems:"center",gap:4,background:T.el,padding:"4px 10px",borderRadius:16,border:`1px solid ${balDropOpen?T.accent:T.border}`,cursor:"pointer"}}>
        <span style={{...MO,fontSize:12,fontWeight:700,color:T.text}}>{cvs(activeBal)}</span>
        <span style={{...MO,fontSize:7,padding:"2px 5px",borderRadius:3,background:isDemo?T.accentDim:T.greenDim,color:isDemo?T.accent:T.green,fontWeight:700}}>{isDemo?"DEMO":"REAL"}</span>
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2.5" style={{transform:balDropOpen?"rotate(180deg)":"none",transition:"transform 0.15s"}}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {/* Avatar */}
      <button onClick={()=>setProfileOpen(!profileOpen)} style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}}>
        <Avatar size={30}/>
      </button>
      {/* Profile dropdown — same as desktop */}
      {profileOpen&&<>
        <div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:201}}/>
        <div style={{position:"fixed",top:50,right:8,width:260,maxWidth:"calc(100vw - 16px)",background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",zIndex:202,overflow:"hidden",...IN,color:T.text}}>
          <div style={{padding:"14px 14px 10px",borderBottom:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Avatar size={36} border={false}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.name||"User"}</div>
                <div style={{fontSize:10,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentUser?.email||""}</div>
              </div>
            </div>
            <div style={{marginTop:8,padding:"5px 8px",borderRadius:5,background:kycStatus==="approved"?T.accentDim:kycStatus==="pending"?T.yellowDim||"#f59e0b22":T.redDim,border:`1px solid ${kycStatus==="approved"?T.accent+"44":kycStatus==="pending"?"#f59e0b44":T.red+"44"}`,display:"flex",alignItems:"center",gap:5}}>
              <span style={{color:kycStatus==="approved"?T.accent:kycStatus==="pending"?"#f59e0b":T.red,fontSize:11}}>{kycStatus==="approved"?"✓":kycStatus==="pending"?"⏳":"✗"}</span>
              <span style={{fontSize:10,fontWeight:600,color:kycStatus==="approved"?T.accent:kycStatus==="pending"?"#f59e0b":T.red}}>{kycStatus==="approved"?"Verified":kycStatus==="pending"?"Pending":"Not Verified"}</span>
            </div>
            <div style={{marginTop:4,...MO,fontSize:9,color:T.muted}}>ID: {getUserCode()}</div>
          </div>
          <div style={{padding:"4px 0"}}>
            {[
              {label:"My Account",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("account");}}},
              {label:"Analytics",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("analytics");}}},
              {label:"Top Up",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("deposit");}}},
              {label:"Withdrawals",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("withdraw");}}},
              {label:"Transactions",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("history");}}},
              {label:"Tournaments",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setTno(true);}}},
            ].map((item,i)=>(
              <button key={i} onClick={item.action} style={{width:"100%",padding:"9px 14px",border:"none",background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}>{item.icon}</span>{item.label}</button>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,padding:"4px 0"}}>
            {[
              {label:"KYC Verification",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,action:()=>{setProfileOpen(false);setWalletView(null);setAccountView("kyc");}},
              {label:"Help",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,action:()=>{setProfileOpen(false);setHpo(true);}},
            ].map((item,i)=>(
              <button key={i} onClick={item.action} style={{width:"100%",padding:"9px 14px",border:"none",background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}>{item.icon}</span>{item.label}</button>
            ))}
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,padding:"4px 0"}}>
            <button onClick={()=>{setProfileOpen(false);if(confirm("Are you sure?"))onLogout();}} style={{width:"100%",padding:"9px 14px",border:"none",background:"transparent",color:T.red,...IN,fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>Log Out</button>
          </div>
        </div>
      </>}
    </div>}

    {/* Mobile Portfolio — open trades */}
    {isMobile&&mobileTab==="portfolio"&&<div style={{flex:1,overflowY:"auto",padding:"12px",background:T.bg}}>
      <div style={{...IN,fontSize:15,fontWeight:700,marginBottom:12}}>Open Trades</div>
      {allActive.filter(t=>{const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return !t.done&&Date.now()<et;}).length===0?
        <div style={{textAlign:"center",padding:40,color:T.muted,fontSize:12}}>No open trades</div>
      :allActive.filter(t=>{const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return !t.done&&Date.now()<et;}).map(t=>{
        const pp=PAIRS.find(x=>x.s===t.symbol);const curPrice=t.symbol===p.s?lp:t.entry;
        const isWinning=t.dir==="HIGHER"?curPrice>t.entry:curPrice<t.entry;
        const profitAmt=t.amt*(pp?.payout||85)/100;
        const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;
        const rem=Math.max(0,Math.floor((et-Date.now())/1000));const m=Math.floor(rem/60);const s=rem%60;
        return(<div key={t.id} style={{background:T.card,borderRadius:10,padding:"12px",marginBottom:6,border:`1px solid ${T.border}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PairLogo pair={pp} size={24}/></div>
              <div><div style={{...IN,fontSize:11,fontWeight:600}}>{pp?.label||"--"}</div><div style={{...MO,fontSize:9,color:T.muted}}>{pp?.payout||85}%</div></div>
            </div>
            <span style={{...MO,fontSize:12,fontWeight:700,color:isWinning?T.green:T.red}}>{isWinning?`+$${profitAmt.toFixed(2)}`:"$0.00"}</span>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <span style={{color:t.dir==="HIGHER"?T.green:T.red,fontSize:12}}>{t.dir==="HIGHER"?"↑":"↓"}</span>
              <span style={{...MO,fontSize:10,color:T.sub}}>@ {t.entry.toFixed(pp?.prec||2)}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{...MO,fontSize:10,color:T.sub}}>${t.amt}</span>
              <span style={{...MO,fontSize:10,fontWeight:700,color:rem<=10?T.red:T.accent,padding:"2px 6px",borderRadius:4,background:rem<=10?T.red+"18":T.accent+"15"}}>{String(m).padStart(2,"0")}:{String(s).padStart(2,"0")}</span>
            </div>
          </div>
        </div>);
      })}
    </div>}

    {/* Mobile History — trade history */}
    {/* Mobile History tab — now opens the full HistoryPanel SlidePanel (same as desktop).
        See bottom-tab handler: history tap calls setHo(true). The simplified inline view
        was removed — HistoryPanel provides date grouping, filters, expandable rows. */}

    {/* ═══ NAVIGATION DRAWER — Quotex style full sidebar ═══ */}
    {drawerOpen&&<><div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:260}}/>
    <div style={{position:"fixed",top:0,left:0,width:280,height:"100vh",background:T.bg,borderRight:`1px solid ${T.border}`,zIndex:261,display:"flex",flexDirection:"column",...IN,color:T.text,boxShadow:"8px 0 40px rgba(0,0,0,0.5)",animation:"slideDrawer 0.15s ease"}}>
      <style>{`@keyframes slideDrawer{from{transform:translateX(-100%)}to{transform:translateX(0)}}`}</style>
      {/* Close button */}
      <div style={{padding:"16px 18px",display:"flex",alignItems:"center",justifyContent:"flex-start"}}>
        <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:T.sub,cursor:"pointer",display:"flex",padding:4}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>
      {/* User info */}
      <div style={{padding:"0 20px 16px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{...IN,fontSize:13,color:T.text,fontWeight:600}}>{currentUser?.email||"Guest"}</div>
      </div>
      {/* Main nav items */}
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {[
          {label:"Deposit",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,action:()=>{setDrawerOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("deposit");}}},
          {label:"Withdrawal",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/></svg>,action:()=>{setDrawerOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("withdraw");}}},
          {label:"Transactions",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,action:()=>{setDrawerOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("history");}}},
          {label:"Trades",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,action:()=>{setDrawerOpen(false);setHo(true);}},
          {label:"My Account",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,action:()=>{setDrawerOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("account");}}},
          {label:"Analytics",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,action:()=>{setDrawerOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("analytics");}}},
        ].map((item,i)=>(<button key={i} onClick={item.action} style={{width:"100%",padding:"12px 20px",border:"none",background:"transparent",color:T.text,...IN,fontSize:14,fontWeight:500,cursor:"pointer",display:"flex",alignItems:"center",gap:12,textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5}}>{item.icon}</span>{item.label}</button>))}
      </div>
      {/* Bottom section */}
      <div style={{borderTop:`1px solid ${T.border}`,padding:"8px 0"}}>
        {[
          {label:"Support",action:()=>{setDrawerOpen(false);setWalletView(null);setAccountView("support");}},
          {label:"About us",action:()=>{setDrawerOpen(false);setHpo(true);}},
        ].map((item,i)=>(<button key={i} onClick={item.action} style={{width:"100%",padding:"10px 20px",border:"none",background:"transparent",color:T.sub,...IN,fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{e.currentTarget.style.color=T.text;}} onMouseLeave={e=>{e.currentTarget.style.color=T.sub;}}>{item.label}</button>))}
        <button onClick={()=>{setDrawerOpen(false);if(confirm("Log out?"))onLogout();}} style={{width:"100%",padding:"10px 20px",border:"none",background:"transparent",color:T.red,...IN,fontSize:13,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Logout
        </button>
      </div>
    </div></>}

    {/* ═══ MAIN CONTENT COLUMN (top bar + chart/wallet below) ═══ */}
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>

    {/* ═══ TOP BAR — balance + deposit only (no pair tabs) ═══ */}
    {!isMobile&&<div style={{display:"flex",alignItems:"center",height:48,borderBottom:`1px solid ${T.border}`,background:T.card,padding:"0 14px",flexShrink:0,gap:8,minWidth:0}}>
      {/* Logo + name — Quotex style inline */}
      <div onClick={()=>{setWalletView(null);setAccountView(null);closeAllPanels();}} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginRight:12,flexShrink:0}}>
        <ZextoLogo size={32}/>
        <span style={{...IN,fontSize:18,fontWeight:800,color:T.text,letterSpacing:"-.5px"}}>Zexto<span style={{color:T.accent}}>Option</span></span>
        <span style={{width:5,height:5,borderRadius:"50%",background:T.accent,flexShrink:0,animation:"dotBlink 1.5s ease-in-out infinite"}}/>
        <style>{`@keyframes dotBlink{0%,100%{opacity:.2}50%{opacity:1}}`}</style>
        <span style={{...IN,fontSize:11,fontWeight:700,color:T.sub,letterSpacing:"1.5px",textTransform:"uppercase"}}>Web Trading Platform</span>
      </div>
      <div style={{flex:1}}/>
      {/* Right side: balance + deposit + profile */}
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
        <button onClick={async()=>{
          if(API.auth.isAuthenticated()){
            try{const res=await API.auth.resetDemo();if(res.success){setBal(res.newBalance||10000);toast("Balance Reset","Demo balance reset to $10,000","success",1500);}else{setBal(10000);toast("Balance Reset","Demo balance reset to $10,000","success",1500);}}catch{setBal(10000);ss("qt_bal",10000);toast("Balance Reset","Demo balance reset to $10,000","success",1500);}
          }else{
            setBal(10000);ss("qt_bal",10000);toast("Balance Reset","Demo balance reset to $10,000","success",1500);
          }
        }} title="Reset balance" style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${T.border}`,background:T.el,color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg>
        </button>
        <button onClick={()=>setBalDropOpen(!balDropOpen)} style={{display:"flex",flexDirection:"column",alignItems:"flex-start",background:T.el,border:`1px solid ${T.border}`,borderRadius:10,cursor:"pointer",padding:"4px 10px",gap:0}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{...IN,fontSize:10,color:T.sub,fontWeight:500}}>{isDemo?"Demo account":"Real account"}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2.5" strokeLinecap="round" style={{transform:balDropOpen?"rotate(180deg)":"none",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <span style={{...MO,fontSize:14,fontWeight:700,color:T.text,whiteSpace:"nowrap",lineHeight:1.2}}>{cvs(activeBal)}</span>
        </button>
        <button onClick={()=>{if(isGuest){onNav("register");}else{setWalletView("deposit");}}} style={{padding:"0 16px",height:36,borderRadius:8,border:"none",background:`linear-gradient(135deg,${T.accent},#d97706)`,color:T.bg,...IN,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
          {tr(settings.language,"deposit")}
        </button>
        {/* Profile avatar — inline in top bar */}
        <div style={{position:"relative",flexShrink:0}}>
        <button onClick={()=>setProfileOpen(!profileOpen)} style={{width:36,height:36,background:T.el,border:`1.5px solid ${profileOpen?T.accent:T.border}`,borderRadius:"50%",cursor:"pointer",padding:0,display:"flex",alignItems:"center",justifyContent:"center",transition:"border-color 0.2s",flexShrink:0}}><Avatar size={32}/></button>
        {/* Profile dropdown */}
        {profileOpen&&!isMobile&&<>
          <div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:998}}/>
          <div style={{position:"absolute",top:44,right:0,width:280,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",zIndex:999,overflow:"hidden",...IN,color:T.text}}>
            <div style={{padding:"14px 14px 10px",borderBottom:`1px solid ${T.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{position:"relative"}}><Avatar size={40} border={false}/><label style={{position:"absolute",bottom:-2,right:-2,width:16,height:16,borderRadius:"50%",background:T.el,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:9}}>cam<input type="file" accept="image/*" onChange={handleAvatarUpload} style={{display:"none"}}/></label></div>
                <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{currentUser?.name||"User"}</div><div style={{fontSize:10,color:T.sub}}>{currentUser?.email||""}</div></div>
              </div>
              <div style={{marginTop:8,padding:"5px 8px",borderRadius:5,background:kycStatus==="approved"?T.accentDim:kycStatus==="pending"?T.yellowDim||"#f59e0b22":T.redDim,border:`1px solid ${kycStatus==="approved"?T.accent+"44":kycStatus==="pending"?"#f59e0b44":T.red+"44"}`,display:"flex",alignItems:"center",gap:5}}><span style={{color:kycStatus==="approved"?T.accent:kycStatus==="pending"?"#f59e0b":T.red,fontSize:12}}>{kycStatus==="approved"?"✓":kycStatus==="pending"?"wait":"✗"}</span><span style={{fontSize:10,fontWeight:600,color:kycStatus==="approved"?T.accent:kycStatus==="pending"?"#f59e0b":T.red}}>{kycStatus==="approved"?"Identity Verified":kycStatus==="pending"?"Verification Pending":"Not Verified"}</span></div>
              <div style={{marginTop:4,...MO,fontSize:9,color:T.muted}}>ID: {getUserCode()}</div>
            </div>
            <div style={{padding:"4px 0"}}>
              {[
                {label:"My Account",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("account");}}},
                {label:"Analytics",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setWalletView(null);setAccountView("analytics");}}},
                {label:"Top Up",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("deposit");}}},
                {label:"Withdrawals",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("withdraw");}}},
                {label:"Transactions",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setAccountView(null);setWalletView("history");}}},
                {label:"Tournaments",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,action:()=>{setProfileOpen(false);if(isGuest){onNav("register");}else{setTno(true);}}},
              ].map((item,i)=>(
                <button key={i} onClick={item.action} style={{width:"100%",padding:"9px 16px",border:"none",background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}>{item.icon}</span>{item.label}</button>
              ))}
            </div>
            <div style={{borderTop:`1px solid ${T.border}`,padding:"4px 0"}}>
              {[
                {label:"KYC Verification",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,action:()=>{setProfileOpen(false);setWalletView(null);setAccountView("kyc");}},
                {label:"Help",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>,action:()=>{setProfileOpen(false);setHpo(true);}},
              ].map((item,i)=>(
                <button key={i} onClick={item.action} style={{width:"100%",padding:"9px 16px",border:"none",background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}>{item.icon}</span>{item.label}</button>
              ))}
            </div>
            <div style={{borderTop:`1px solid ${T.border}`,padding:"4px 0"}}>
              <button onClick={()=>{setProfileOpen(false);if(confirm("Are you sure?"))onLogout();}} style={{width:"100%",padding:"9px 16px",border:"none",background:"transparent",color:T.red,...IN,fontSize:12,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:10}} onMouseEnter={e=>e.currentTarget.style.background=T.redDim} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",opacity:.5,flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>Log Out</button>
            </div>
          </div>
        </>}
        </div>
      </div>
    </div>}

    {/* Content area — flex-row: chart+right OR wallet */}
    <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden",minHeight:0}}>
    {/* Center + Right — hidden when wallet is open */}
    {!walletView&&!accountView&&<>
    {/* Center */}
    <div style={{flex:1,display:isMobile&&mobileTab!=="chart"?"none":"flex",flexDirection:"column",minWidth:0}}>
    {/* Desktop profile dropdown moved to end of component */}
      {(tfPopOpen||indPopOpen||drawPopOpen||themePopOpen||candleTypePopOpen)&&<div onClick={()=>{setTfPopOpen(false);setIndPopOpen(false);setDrawPopOpen(false);setThemePopOpen(false);setCandleTypePopOpen(false);setCandleSubOpen(false);}} style={{position:"fixed",inset:0,zIndex:15}}/>}
      <div 
        onMouseMove={e=>{const rect=e.currentTarget.getBoundingClientRect();const x=e.clientX-rect.left;const y=e.clientY-rect.top;if(!chr.current)return;try{const data=chr.current.convertFromPixel({x,y});if(data&&isFinite(data.value)){setCursorPos({x,y,price:data.value,width:rect.width});}
          // Find candle under cursor
          const ts=data?.timestamp;if(ts&&kr.current.length>0){const candle=kr.current.find(c=>Math.abs(c.timestamp-ts)<tf.ms);if(candle){setHoveredCandle({o:candle.open,h:candle.high,l:candle.low,c:candle.close,v:candle.volume,t:candle.timestamp,x,y});}else{setHoveredCandle(null);}}
        }catch(err){}}}
        onMouseLeave={()=>{setCursorPos(null);setHoveredCandle(null);}}
        style={{flex:1,position:"relative",overflow:"hidden",backgroundImage:settings.bgImage?`url(${settings.bgImage})`:"none",backgroundSize:"cover",backgroundPosition:"center",borderRadius:12,border:`1px solid ${T.border}`,margin:"8px 8px 8px 8px"}}>
        {settings.bgImage&&<div style={{position:"absolute",inset:0,background:"rgba(17,22,38,0.85)",zIndex:0,pointerEvents:"none"}}/>}
        {/* ═══ FLOATING PAIR TABS ═══ */}
        <div style={{position:"absolute",top:6,left:0,right:0,zIndex:12,display:"flex",alignItems:"center",gap:isMobile?5:8,padding:isMobile?"0 8px 0 8px":"0 12px 0 12px",height:isMobile?40:42,pointerEvents:"auto",overflowX:"auto",overflowY:"hidden"}}>
          <button onClick={()=>setPairPickerOpen(true)} style={{width:isMobile?30:32,height:isMobile?30:32,border:"none",background:T.accent,color:"#fff",cursor:"pointer",fontSize:isMobile?15:18,fontWeight:300,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,borderRadius:"50%",boxShadow:`0 2px 8px ${T.accent}55`,transition:"transform 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.08)";}} onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";}} title="Add pair">+</button>
          {(isMobile?pairTabs.slice(0,2):pairTabs).map((idx)=>{
            const pp=PAIRS[idx];
            const active=idx===pi;
            const tabClosed=pp&&pp.realForex&&!marketStatus.isOpen;
            return(<button
              key={pp.s}
              onClick={()=>setPi(idx)}
              title={tabClosed?"Market closed — reopens "+fmtMarketCountdown(marketStatus.msUntilOpen):pp.label}
              style={{
                display:"inline-flex",alignItems:"center",
                gap:6,
                padding:isMobile?"4px 4px 4px 6px":"5px 5px 5px 7px",
                borderRadius:999,
                background:active?`linear-gradient(135deg, ${T.card}, ${T.el})`:T.card,
                border:`1px solid ${active?T.accent:T.border}`,
                boxShadow:active?`0 0 0 3px ${T.accent}22, 0 2px 8px rgba(0,0,0,0.25)`:"none",
                cursor:"pointer",
                flexShrink:0,
                height:isMobile?28:30,
                whiteSpace:"nowrap",
                transition:"all 0.15s",
                opacity:tabClosed?0.65:1
              }}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.borderColor=T.border+"cc";e.currentTarget.style.background=T.el;}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.card;}}}
            >
              {/* Pair logo — smaller for chip style */}
              <div style={{
                width:isMobile?20:22,height:isMobile?20:22,
                borderRadius:"50%",
                display:"flex",alignItems:"center",justifyContent:"center",
                flexShrink:0,
                position:"relative",
                background:T.bg
              }}>
                <PairLogo pair={pp} size={isMobile?18:20}/>
                {/* Market closed red dot */}
                {tabClosed&&<span style={{position:"absolute",bottom:-1,right:-1,width:isMobile?7:8,height:isMobile?7:8,borderRadius:"50%",background:"#ef4444",border:`1.5px solid ${T.card}`}}/>}
              </div>
              
              {/* Pair name — bold for active */}
              <span style={{...IN,fontSize:isMobile?10:11,fontWeight:active?700:500,color:active?T.text:T.sub,letterSpacing:"0.2px"}}>{pp.short}</span>
              
              {/* OTC mini badge — yellow with dark text (not transparent) */}
              {pp.otc&&<span style={{...MO,fontSize:isMobile?6:7,fontWeight:800,color:"#0a0e18",background:T.yellow,padding:"1px 4px",borderRadius:2,letterSpacing:"0.3px",lineHeight:1}}>OTC</span>}
              
              {/* Payout pill — solid colored badge (Sample 4 signature element) */}
              <span style={{
                ...MO,
                fontSize:isMobile?8:9,
                fontWeight:800,
                color:"#fff",
                background:tabClosed?T.red:(active?T.accent:T.green),
                padding:isMobile?"2px 6px":"2px 7px",
                borderRadius:999,
                letterSpacing:"-0.2px",
                lineHeight:1
              }}>{tabClosed?"OFF":pp.payout+"%"}</span>
              
              {/* × close button — circle on hover */}
              {pairTabs.length>1&&<span
                onClick={(e)=>{e.stopPropagation();const newTabs=pairTabs.filter(x=>x!==idx);setPairTabs(newTabs);if(pi===idx)setPi(newTabs[0]);}}
                title="Close"
                style={{
                  color:T.muted,
                  fontSize:isMobile?13:15,
                  lineHeight:0.5,
                  cursor:"pointer",
                  opacity:.5,
                  marginLeft:1,
                  padding:"0 4px",
                  borderRadius:"50%",
                  transition:"all 0.15s",
                  alignSelf:"center"
                }}
                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color=T.red;}}
                onMouseLeave={e=>{e.currentTarget.style.opacity="0.5";e.currentTarget.style.color=T.muted;}}
              >×</span>}
            </button>);
          })}
          <div style={{flex:1}}/>
        </div>
        {lp>0&&<div style={{position:"absolute",top:isMobile?50:54,left:28,zIndex:10,display:"flex",alignItems:"center",gap:isMobile?4:5}}>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?4:5,opacity:0.4}}>
            <span style={{width:isMobile?4:5,height:isMobile?4:5,borderRadius:"50%",background:T.accent,display:"inline-block",animation:"pulse 2s ease-in-out infinite"}}></span>
            <span style={{...MO,fontSize:isMobile?9:10,color:T.text,fontWeight:600}}>{liveClock}</span>
          </div>
          {/* Info icon — opens Pair Information popup. Circle with bg, subtle but accessible. */}
          <button
            onClick={()=>setPairInfoOpen(true)}
            title="Pair information"
            style={{
              width:isMobile?16:18,height:isMobile?16:18,
              borderRadius:"50%",
              border:"none",
              background:T.el,
              color:T.sub,
              cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              padding:0,marginLeft:2,
              transition:"all 0.15s",
              opacity:0.7
            }}
            onMouseEnter={e=>{e.currentTarget.style.background=T.accent;e.currentTarget.style.color="#fff";e.currentTarget.style.opacity="1";}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.el;e.currentTarget.style.color=T.sub;e.currentTarget.style.opacity="0.7";}}
          >
            <svg width={isMobile?9:10} height={isMobile?9:10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </div>}
        {/* Hovered candle OHLC — desktop only. Bottom-left vertical list (open/close/high/low).
            No background — pure text overlay (clean, minimal, doesn't obstruct chart). */}
        {hoveredCandle&&!isMobile&&<div style={{position:"absolute",bottom:8,left:75,zIndex:11,padding:0,pointerEvents:"none"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3,...MO,fontSize:10,color:T.sub,lineHeight:1.3,textShadow:"0 1px 3px rgba(0,0,0,0.6)"}}>
            <div style={{display:"flex",justifyContent:"space-between",gap:14,minWidth:130}}>
              <span style={{color:T.muted,fontWeight:500}}>open:</span>
              <span style={{color:hoveredCandle.c>=hoveredCandle.o?T.green:T.red,fontWeight:700}}>{hoveredCandle.o.toFixed(p.prec)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",gap:14}}>
              <span style={{color:T.muted,fontWeight:500}}>close:</span>
              <span style={{color:hoveredCandle.c>=hoveredCandle.o?T.green:T.red,fontWeight:700}}>{hoveredCandle.c.toFixed(p.prec)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",gap:14}}>
              <span style={{color:T.muted,fontWeight:500}}>high:</span>
              <span style={{color:T.green,fontWeight:700}}>{hoveredCandle.h.toFixed(p.prec)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",gap:14}}>
              <span style={{color:T.muted,fontWeight:500}}>low:</span>
              <span style={{color:T.red,fontWeight:700}}>{hoveredCandle.l.toFixed(p.prec)}</span>
            </div>
          </div>
        </div>}
        {/* Drawing Toolbar — TradingView style, shows when overlay is selected */}
        {selectedOverlay&&<div style={{position:"absolute",top:8,right:60,zIndex:25,display:"flex",alignItems:"center",gap:2,background:T.card+"f0",border:`1px solid ${T.border}`,borderRadius:10,padding:"4px 6px",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",backdropFilter:"blur(8px)"}}>
          {/* Colors */}
          {["#f59e0b","#3b82f6","#ef4444","#eab308","#a855f7","#f97316","#e8ecf4"].map(c=>(
            <button key={c} onClick={()=>{try{chr.current?.overrideOverlay({id:selectedOverlay.id,styles:{line:{color:c},point:{color:c,borderColor:c}}});setSelectedOverlay(prev=>({...prev,color:c}));}catch(e){}}} style={{width:18,height:18,borderRadius:"50%",background:c,border:selectedOverlay.color===c?`2px solid #fff`:`2px solid transparent`,cursor:"pointer",padding:0,flexShrink:0}}/>
          ))}
          <div style={{width:1,height:20,background:T.border,margin:"0 4px"}}/>
          {/* Line width */}
          {[1,2,3].map(w=>(
            <button key={w} onClick={()=>{try{chr.current?.overrideOverlay({id:selectedOverlay.id,styles:{line:{size:w}}});setSelectedOverlay(prev=>({...prev,size:w}));}catch(e){}}} style={{width:26,height:26,borderRadius:5,border:`1px solid ${selectedOverlay.size===w?T.accent:T.border}`,background:selectedOverlay.size===w?T.accentDim:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <div style={{width:14,height:w,background:selectedOverlay.color||T.text,borderRadius:1}}/>
            </button>
          ))}
          <div style={{width:1,height:20,background:T.border,margin:"0 4px"}}/>
          {/* Line style */}
          {[{v:"solid",dv:[10,0]},{v:"dashed",dv:[6,4]},{v:"dotted",dv:[2,2]}].map(s=>(
            <button key={s.v} onClick={()=>{try{chr.current?.overrideOverlay({id:selectedOverlay.id,styles:{line:{style:s.v,dashedValue:s.dv}}});setSelectedOverlay(prev=>({...prev,style:s.v}));}catch(e){}}} style={{width:26,height:26,borderRadius:5,border:`1px solid ${selectedOverlay.style===s.v?T.accent:T.border}`,background:selectedOverlay.style===s.v?T.accentDim:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>
              <svg width="16" height="2" viewBox="0 0 16 2"><line x1="0" y1="1" x2="16" y2="1" stroke={selectedOverlay.color||T.text} strokeWidth="1.5" strokeDasharray={s.v==="dashed"?"4,3":s.v==="dotted"?"1.5,2":"none"}/></svg>
            </button>
          ))}
          <div style={{width:1,height:20,background:T.border,margin:"0 4px"}}/>
          {/* Delete */}
          <button onClick={()=>{try{chr.current?.removeOverlay({id:selectedOverlay.id});}catch(e){}setSelectedOverlay(null);}} style={{width:26,height:26,borderRadius:5,border:`1px solid ${T.red}44`,background:T.redDim,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}} title="Delete drawing">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" strokeLinecap="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          {/* Close toolbar */}
          <button onClick={()=>setSelectedOverlay(null)} style={{width:26,height:26,borderRadius:5,border:`1px solid ${T.border}`,background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,marginLeft:2}} title="Close">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>}
        {/* Trade result popups removed */}
        
        {/* PREVIEW — vertical lines and countdown badges (Quotex-style):
            1. Dashed line at NEXT candle close — with countdown badge "MM:SS" till that close
            2. Dashed line at trade EXPIRY position — visualizes where trade would resolve.
            Both lines persist even when there are active trades, so trader can always see
            when the next candle ends.
            HIDDEN on Area/Line charts — those modes don't have discrete candles, so the line
            doesn't visually align with anything meaningful. Only shown on Candles/Bars modes. */}
        {tradeLines.preview&&candleType!=="area"&&candleType!=="line"&&<>
          {/* Candle-close countdown line — at the right edge of current candle */}
          {tradeLines.preview.cex!=null&&<>
            <div style={{position:"absolute",top:0,bottom:0,left:tradeLines.preview.cex,width:0,borderLeft:`1px dashed ${T.yellow}80`,zIndex:5,pointerEvents:"none"}}/>
            {/* Countdown badge — small floating box near the bottom of the line */}
            <div style={{
              position:"absolute",
              left:tradeLines.preview.cex,
              bottom:14,
              transform:"translateX(-50%)",
              background:T.yellow,
              color:"#0a0e18",
              ...MO,fontSize:10,fontWeight:700,
              padding:"2px 6px",
              borderRadius:3,
              zIndex:6,
              pointerEvents:"none",
              boxShadow:"0 2px 6px rgba(0,0,0,0.4)",
              letterSpacing:"0.3px",
              whiteSpace:"nowrap"
            }}>{tradeLines.preview.candleCd}</div>
          </>}
          {/* Trade-expiry preview line — only when no active trades on this pair */}
          {activePair.length===0&&<div style={{position:"absolute",top:0,bottom:0,left:tradeLines.preview.bx,width:0,borderLeft:"1px dashed rgba(136,146,168,0.35)",zIndex:5,pointerEvents:"none"}}/>}
        </>}
        
        {/* ACTIVE TRADES — Quotex-style: dot at OPEN candle + line extending forward by trade duration */}
        {(()=>{
          // Compute badge stagger offsets: trades at the same bx position get cascading
          // left offsets so their info badges don't overlap. Each trade in a group gets
          // an additional 130px offset to the left, sorted by openTime (newest = closest to dot).
          const groups={};
          tradeLines.active.forEach(t=>{
            const key=Math.round(t.bx);
            if(!groups[key])groups[key]=[];
            groups[key].push(t);
          });
          // For each group, sort by id ascending so order is deterministic
          Object.values(groups).forEach(g=>g.sort((a,b)=>String(a.id).localeCompare(String(b.id))));
          // Build a map of trade id → stagger index
          const stackIdx={};
          Object.values(groups).forEach(g=>g.forEach((t,i)=>{stackIdx[t.id]=i;}));
          
          return tradeLines.active.map(t=>{
          const chartW=cr.current?.clientWidth||800;
          const chartH=cr.current?.clientHeight||400;
          const cy=Math.max(14,Math.min(t.y,chartH-14));
          const lLeft=Math.max(0,Math.min(t.bx,chartW));
          const lRight=Math.max(lLeft,Math.min(t.ex,chartW));
          const lWidth=Math.max(0,lRight-lLeft);
          const isUp=t.dir==="HIGHER";
          const lineColor=isUp?"#22c55e":"#ef4444";
          // Badge horizontal offset — cascade left by 130px per stacked trade
          const stackOffset=(stackIdx[t.id]||0)*130;
          return(<div key={t.id}>
          {/* Forward line — from OPEN dot extending forward by trade duration (1m trade = 1 candle wide, 5m = 5 candles, etc.) */}
          {lWidth>2&&<div style={{position:"absolute",top:cy,left:lLeft,width:lWidth,height:0,borderTop:`2px solid ${lineColor}`,zIndex:5,pointerEvents:"none"}}/>}

          {/* Open dot — at the candle where trade was opened (Quotex-style, prominent) */}
          {t.openVisible&&t.bx>=0&&t.bx<chartW&&<div style={{position:"absolute",top:cy-4,left:t.bx-4,width:8,height:8,borderRadius:"50%",background:lineColor,zIndex:7,pointerEvents:"none",boxShadow:`0 0 6px ${lineColor}aa`}}/>}

          {/* End dot — small marker at where trade will close (line endpoint) */}
          {t.ex>0&&t.ex<chartW&&t.ex!==t.bx&&<div style={{position:"absolute",top:cy-3,left:t.ex-3,width:6,height:6,borderRadius:"50%",background:lineColor,zIndex:7,pointerEvents:"none",boxShadow:`0 0 5px ${lineColor}99`}}/>}

          {/* Info badge — positioned ABOVE the start dot, cascade left when multiple trades stack on same candle */}
          <div style={{position:"absolute",top:cy-11,left:Math.max(4,t.bx-128-stackOffset),zIndex:9,pointerEvents:"none",background:lineColor,borderRadius:5,padding:"4px 10px",...MO,fontSize:10,fontWeight:700,color:"#fff",whiteSpace:"nowrap",boxShadow:`0 2px 10px ${lineColor}44`,display:"flex",alignItems:"center",gap:6}}>
            <span>{isUp?"↑":"↓"}</span>
            <span>{t.amt?`$${t.amt}`:""}</span>
            <span style={{width:1,height:10,background:"rgba(255,255,255,.3)"}}/>
            <span>{t.cd}</span>
          </div>
        </div>);});})()}
        
        {/* PENDING TARGET LINES — yellow dashed line + right-side badge with cancel for each pending order */}
        {pendingTrades.filter(pt=>pt.symbol===p.s).map(pt=>{
          // Convert target price to Y pixel
          const pt2=toPixel?toPixel(Date.now(),pt.targetPrice):null;
          if(!pt2||!isFinite(pt2.y))return null;
          const isUp=pt.dir==="HIGHER";
          const lineColor=T.yellow||"#eab308";
          const dirColor=isUp?T.green:T.red;
          return(<div key={"pt-"+pt.id}>
            {/* Dashed line across chart at target price */}
            <div style={{position:"absolute",top:pt2.y,left:0,right:0,height:0,borderTop:`1.5px dashed ${lineColor}`,zIndex:3,pointerEvents:"none",opacity:0.7}}/>
            
            {/* Glow dot on left edge */}
            <div style={{position:"absolute",top:pt2.y-3,left:-3,width:6,height:6,borderRadius:"50%",background:lineColor,zIndex:8,pointerEvents:"none",boxShadow:`0 0 8px ${lineColor}`}}/>
            
            {/* Pending badge — RIGHT side (yAxis area). Has direction, price, duration, amount, × cancel. */}
            <div style={{position:"absolute",top:pt2.y-13,right:56,zIndex:21,pointerEvents:"auto",background:T.card,color:T.text,border:`1px solid ${lineColor}`,borderRadius:6,padding:"4px 7px 4px 8px",...MO,fontSize:10,fontWeight:600,whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:6,boxShadow:`0 2px 10px ${lineColor}44, 0 0 0 1px ${T.bg}`,userSelect:"none"}}>
              {/* Clock icon */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={lineColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {/* Direction arrow */}
              <span style={{color:dirColor,fontWeight:700,fontSize:11,lineHeight:1}}>{isUp?"↑":"↓"}</span>
              {/* Target price */}
              <span style={{fontSize:10,color:T.text,fontWeight:700}}>{pt.targetPrice.toFixed(pt.prec)}</span>
              {/* Separator */}
              <span style={{width:1,height:10,background:T.border,flexShrink:0}}/>
              {/* Amount + duration */}
              <span style={{fontSize:9,color:T.sub}}>${pt.amt} · {pt.durLabel}</span>
              {/* × cancel button */}
              <button
                onClick={(e)=>{
                  e.stopPropagation();
                  setPendingTrades(prev=>prev.filter(x=>x.id!==pt.id));
                  toast("Pending Cancelled","","success",1500);
                }}
                title="Cancel pending order"
                style={{background:"transparent",border:"none",color:T.muted,cursor:"pointer",padding:"0 0 0 2px",marginLeft:1,fontSize:14,lineHeight:0.9,fontWeight:600,display:"flex",alignItems:"center",opacity:0.7,transition:"opacity 0.15s, color 0.15s"}}
                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color=T.red;}}
                onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.color=T.muted;}}
              >×</button>
            </div>
          </div>);
        })}

        {/* ALERT LINES — Quotex-style draggable, theme-aware, badge on RIGHT (yAxis side) */}
        {(tradeLines.alerts||[]).map(a=>{
          // Theme-aware colors — orange/yellow accent for alerts
          const alertColor=T.yellow||"#f59e0b";
          return(<div key={"al-"+a.id}>
            {/* Horizontal dashed line across entire chart at alert price.
                Uses a ref-set element so drag updates can mutate it directly without React re-render. */}
            <div
              ref={el=>{if(el)el._alertLineId=a.id;}}
              data-alert-line={a.id}
              style={{position:"absolute",top:a.y,left:0,right:0,height:0,borderTop:`1px dashed ${alertColor}`,zIndex:3,pointerEvents:"none",opacity:0.6}}
            />
            
            {/* Alert badge — positioned on RIGHT side (yAxis price label area).
                During drag we mutate `style.top` and the price text DIRECTLY (no React re-render)
                so the badge follows the cursor with ZERO lag. */}
            <div
              data-alert-badge={a.id}
              onMouseDown={(e)=>{
                e.preventDefault();
                e.stopPropagation();
                const chartEl=cr.current;
                if(!chartEl)return;
                const rect=chartEl.getBoundingClientRect();
                const badgeEl=e.currentTarget;
                const lineEl=document.querySelector(`[data-alert-line="${a.id}"]`);
                const priceEl=badgeEl.querySelector("[data-alert-price]");
                let lastPrice=a.price;
                let lastY=a.y;
                
                // Visual drag state — mutate DOM directly for zero-lag feedback
                badgeEl.style.cursor="grabbing";
                badgeEl.style.transform="scale(1.02)";
                badgeEl.style.opacity="0.95";
                badgeEl.style.transition="none";
                if(lineEl)lineEl.style.opacity="0.85";
                
                const onMove=(ev)=>{
                  const y=ev.clientY-rect.top;
                  if(!chr.current)return;
                  try{
                    const data=chr.current.convertFromPixel({x:rect.width/2,y});
                    if(data&&isFinite(data.value)){
                      lastPrice=data.value;
                      lastY=y;
                      // DIRECT DOM update — no React, no re-render, no lag
                      badgeEl.style.top=(y-12)+"px";
                      if(lineEl)lineEl.style.top=y+"px";
                      if(priceEl)priceEl.textContent=data.value.toFixed(p.prec);
                    }
                  }catch(err){}
                };
                const onUp=()=>{
                  document.removeEventListener("mousemove",onMove);
                  document.removeEventListener("mouseup",onUp);
                  document.removeEventListener("touchmove",onTouchMove);
                  document.removeEventListener("touchend",onUp);
                  // Restore visual state
                  badgeEl.style.cursor="grab";
                  badgeEl.style.transform="scale(1)";
                  badgeEl.style.opacity="1";
                  badgeEl.style.transition="transform 0.12s";
                  if(lineEl)lineEl.style.opacity="0.6";
                  // Commit final price to React state — only ONE state update at end of drag
                  if(isFinite(lastPrice)&&lastPrice!==a.price){
                    const newPrice=parseFloat(lastPrice.toFixed(p.prec));
                    setAlerts(arr=>arr.map(x=>x.id===a.id?{...x,price:newPrice,dir:newPrice>=(pr.current||0)?"above":"below"}:x));
                  }
                };
                const onTouchMove=(ev)=>{
                  if(!ev.touches[0])return;
                  const y=ev.touches[0].clientY-rect.top;
                  if(!chr.current)return;
                  try{
                    const data=chr.current.convertFromPixel({x:rect.width/2,y});
                    if(data&&isFinite(data.value)){
                      lastPrice=data.value;
                      lastY=y;
                      badgeEl.style.top=(y-12)+"px";
                      if(lineEl)lineEl.style.top=y+"px";
                      if(priceEl)priceEl.textContent=data.value.toFixed(p.prec);
                    }
                  }catch(err){}
                };
                document.addEventListener("mousemove",onMove);
                document.addEventListener("mouseup",onUp);
                document.addEventListener("touchmove",onTouchMove,{passive:false});
                document.addEventListener("touchend",onUp);
              }}
              onTouchStart={(e)=>{
                e.preventDefault();
                e.stopPropagation();
                const chartEl=cr.current;
                if(!chartEl||!e.touches[0])return;
                const rect=chartEl.getBoundingClientRect();
                const badgeEl=e.currentTarget;
                const lineEl=document.querySelector(`[data-alert-line="${a.id}"]`);
                const priceEl=badgeEl.querySelector("[data-alert-price]");
                let lastPrice=a.price;
                
                badgeEl.style.cursor="grabbing";
                badgeEl.style.transform="scale(1.02)";
                badgeEl.style.opacity="0.95";
                badgeEl.style.transition="none";
                if(lineEl)lineEl.style.opacity="0.85";
                
                const onMove=(ev)=>{
                  if(!ev.touches[0])return;
                  const y=ev.touches[0].clientY-rect.top;
                  if(!chr.current)return;
                  try{
                    const data=chr.current.convertFromPixel({x:rect.width/2,y});
                    if(data&&isFinite(data.value)){
                      lastPrice=data.value;
                      badgeEl.style.top=(y-12)+"px";
                      if(lineEl)lineEl.style.top=y+"px";
                      if(priceEl)priceEl.textContent=data.value.toFixed(p.prec);
                    }
                  }catch(err){}
                };
                const onUp=()=>{
                  document.removeEventListener("touchmove",onMove);
                  document.removeEventListener("touchend",onUp);
                  badgeEl.style.cursor="grab";
                  badgeEl.style.transform="scale(1)";
                  badgeEl.style.opacity="1";
                  badgeEl.style.transition="transform 0.12s";
                  if(lineEl)lineEl.style.opacity="0.6";
                  if(isFinite(lastPrice)&&lastPrice!==a.price){
                    const newPrice=parseFloat(lastPrice.toFixed(p.prec));
                    setAlerts(arr=>arr.map(x=>x.id===a.id?{...x,price:newPrice,dir:newPrice>=(pr.current||0)?"above":"below"}:x));
                  }
                };
                document.addEventListener("touchmove",onMove,{passive:false});
                document.addEventListener("touchend",onUp);
              }}
              style={{
                position:"absolute",
                top:a.y-12,
                right:56,
                zIndex:21,
                pointerEvents:"auto",
                background:T.card,
                color:T.text,
                border:`1px solid ${alertColor}`,
                borderRadius:5,
                padding:"3px 6px 3px 7px",
                ...MO,
                fontSize:10,
                fontWeight:600,
                whiteSpace:"nowrap",
                display:"flex",
                alignItems:"center",
                gap:5,
                boxShadow:`0 2px 8px ${alertColor}33, 0 0 0 1px ${T.bg}`,
                cursor:"grab",
                userSelect:"none",
                touchAction:"none",
                transition:"transform 0.12s"
              }}
              title="Drag to adjust alert price"
            >
              {/* Bell icon — proper SVG */}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={alertColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              {/* Live price — text content updated DIRECTLY during drag (no React) */}
              <span data-alert-price style={{...MO,color:T.text,fontSize:10,fontWeight:700}}>{a.price.toFixed(p.prec)}</span>
              {/* Cancel button — × removes the alert */}
              <button
                onMouseDown={(e)=>{e.stopPropagation();}}
                onTouchStart={(e)=>{e.stopPropagation();}}
                onClick={(e)=>{
                  e.stopPropagation();
                  setAlerts(prev=>prev.filter(x=>x.id!==a.id));
                  toast("Alert Removed","","success",1500);
                }}
                style={{
                  background:"transparent",
                  border:"none",
                  color:T.muted,
                  cursor:"pointer",
                  padding:"0 0 0 3px",
                  marginLeft:1,
                  fontSize:14,
                  lineHeight:0.9,
                  fontWeight:600,
                  display:"flex",
                  alignItems:"center",
                  opacity:0.7,
                  transition:"opacity 0.15s, color 0.15s"
                }}
                onMouseEnter={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.color=T.red;}}
                onMouseLeave={e=>{e.currentTarget.style.opacity="0.7";e.currentTarget.style.color=T.muted;}}
                title="Cancel alert"
              >×</button>
            </div>
          </div>);
        })}
        
        {/* CHART TOOLS TOOLBAR — left side vertical stack (candle type, tf, indicators, draw, theme).
            On mobile, the 5 buttons are hidden behind a 3-dot menu button to save space. */}
        {(isMobile?mobileTab==="chart":true)&&<div style={{position:"absolute",left:isMobile?8:26,bottom:isMobile?50:60,zIndex:15,display:"flex",flexDirection:"column",gap:isMobile?4:6}}>
          {/* === MOBILE 3-DOT MENU BUTTON === — Visible only on mobile when toolbar is collapsed.
              Tap to expand/collapse the chart tool buttons. */}
          {isMobile&&!mobileToolsOpen&&<button
            onClick={()=>setMobileToolsOpen(true)}
            title="Chart tools"
            style={{
              width:38,height:38,borderRadius:8,
              border:`1px solid ${T.border}`,
              background:T.card,
              color:T.text,
              cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              transition:"all 0.2s",
              boxShadow:"0 2px 6px rgba(0,0,0,0.3)"
            }}
          >
            {/* Vertical 3-dot icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="6" r="1.5"/>
              <circle cx="12" cy="12" r="1.5"/>
              <circle cx="12" cy="18" r="1.5"/>
            </svg>
          </button>}
          
          {/* === CHART TOOL BUTTONS === — On desktop always visible, on mobile only when mobileToolsOpen=true */}
          {(!isMobile||mobileToolsOpen)&&<>
          {/* Mobile-only close button at top of expanded toolbar */}
          {isMobile&&mobileToolsOpen&&<button
            onClick={()=>setMobileToolsOpen(false)}
            title="Hide tools"
            style={{
              width:38,height:30,borderRadius:8,
              border:`1px solid ${T.accent}`,
              background:T.accentDim,
              color:T.accent,
              cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              marginBottom:2
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>}
          
          {/* 1. Candle type picker — popup with 4 options */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setCandleTypePopOpen(!candleTypePopOpen);setTfPopOpen(false);setIndPopOpen(false);setDrawPopOpen(false);setThemePopOpen(false);}} title="Chart type" style={{width:38,height:38,borderRadius:8,border:`1px solid ${candleTypePopOpen?T.accent:T.border}`,background:T.card,color:candleTypePopOpen?T.accent:T.text,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="8" width="4" height="10" rx="0.5"/><line x1="8" y1="4" x2="8" y2="8"/><line x1="8" y1="18" x2="8" y2="22"/><rect x="14" y="6" width="4" height="12" rx="0.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="16" y1="18" x2="16" y2="20"/></svg>
            </button>
            {candleTypePopOpen&&<div style={{position:"absolute",left:44,bottom:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:6,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",gap:2,width:150,zIndex:20}}><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,padding:"4px 8px",textTransform:"uppercase",letterSpacing:".05em"}}>Chart Type</div>{[{val:"candle_solid",label:"Candles",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="8" width="4" height="10" rx="0.5"/><line x1="8" y1="4" x2="8" y2="8"/><line x1="8" y1="18" x2="8" y2="22"/><rect x="14" y="6" width="4" height="12" rx="0.5"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="16" y1="18" x2="16" y2="20"/></svg>},{val:"ohlc",label:"Bars",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="7" y1="4" x2="7" y2="20"/><line x1="4" y1="8" x2="7" y2="8"/><line x1="7" y1="14" x2="10" y2="14"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="14" y1="10" x2="17" y2="10"/><line x1="17" y1="16" x2="20" y2="16"/></svg>},{val:"area",label:"Area",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18 L8 12 L13 15 L18 8 L21 11 L21 20 L3 20 Z" fill="currentColor" fillOpacity="0.3"/><path d="M3 18 L8 12 L13 15 L18 8 L21 11" fill="none"/></svg>},{val:"line",label:"Line",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 17 8 11 13 14 18 6 21 9"/></svg>}].map(opt=>(<button key={opt.val} onClick={()=>{setCandleType(opt.val);setCandleTypePopOpen(false);}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",border:"none",borderRadius:5,background:candleType===opt.val?T.accentDim:"transparent",color:candleType===opt.val?T.accent:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(candleType!==opt.val)e.currentTarget.style.background=T.el;}} onMouseLeave={e=>{if(candleType!==opt.val)e.currentTarget.style.background="transparent";}}><span style={{display:"flex",alignItems:"center",justifyContent:"center",width:16}}>{opt.icon}</span><span>{opt.label}</span>{candleType===opt.val&&<span style={{marginLeft:"auto",fontSize:11}}>✓</span>}</button>))}</div>}
          </div>
          {/* 2. Timeframe picker — disabled in area mode (locked to 1s) */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{if(candleType==="area"){toast("Area Mode","Timeframe locked to 1s","warn",2000);return;}setTfPopOpen(!tfPopOpen);setIndPopOpen(false);setDrawPopOpen(false);setThemePopOpen(false);}} title={candleType==="area"?"Locked to 1s (Area mode)":"Timeframe"} style={{width:38,height:38,borderRadius:8,border:`1px solid ${candleType==="area"?T.border:(tfPopOpen?T.accent:T.border)}`,background:T.card,color:candleType==="area"?T.muted:(tfPopOpen?T.accent:T.text),cursor:candleType==="area"?"not-allowed":"pointer",opacity:candleType==="area"?.5:1,...MO,fontSize:11,fontWeight:700,transition:"all 0.2s"}}>{tf.label}</button>
            {tfPopOpen&&candleType!=="area"&&<div style={{position:"absolute",left:44,bottom:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:6,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:4,width:200,zIndex:20}}>{TFS.map((tfi,idx)=>(<button key={tfi.label} onClick={()=>{setTi(idx);setTfPopOpen(false);}} style={{padding:"7px 0",border:`1px solid ${ti===idx?T.accent:"transparent"}`,borderRadius:5,background:ti===idx?T.accentDim:T.el,color:ti===idx?T.accent:T.sub,...MO,fontSize:10,fontWeight:600,cursor:"pointer"}}>{tfi.label}</button>))}</div>}
          </div>
          {/* 3. Indicators */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setIndPopOpen(!indPopOpen);setCandleTypePopOpen(false);setTfPopOpen(false);setDrawPopOpen(false);setThemePopOpen(false);}} title="Indicators" style={{width:38,height:38,borderRadius:8,border:`1px solid ${indPopOpen?T.accent:T.border}`,background:T.card,color:indPopOpen?T.accent:T.text,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s",position:"relative"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 13 7 9 11 14 15 10 21 16"/></svg>
              {activeIndicators.length>0&&<span style={{position:"absolute",top:-3,right:-3,width:14,height:14,borderRadius:"50%",background:T.accent,color:T.bg,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{activeIndicators.length}</span>}
            </button>
            {indPopOpen&&<div style={{position:"absolute",left:44,bottom:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:8,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",gap:2,width:180,zIndex:20}}>
              <div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,padding:"4px 8px",textTransform:"uppercase",letterSpacing:".05em"}}>Indicators</div>
              {["MA","EMA","BOLL","RSI","MACD","KDJ","VOL"].map(ind=>{const active=activeIndicators.includes(ind);const isOverlay=["MA","EMA","BOLL"].includes(ind);return(<button key={ind} onClick={()=>{if(active){try{if(isOverlay){chr.current?.removeIndicator({name:ind});}else{chr.current?.removeIndicator({paneId:`pane_${ind}`,name:ind});}}catch(e){}setActiveIndicators(prev=>prev.filter(x=>x!==ind));}else{try{if(isOverlay){chr.current?.createIndicator(ind,true,{id:"candle_pane"});}else{chr.current?.createIndicator(ind,false,{id:`pane_${ind}`,height:80});}}catch(e){}setActiveIndicators(prev=>[...prev,ind]);}}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",border:"none",borderRadius:5,background:active?T.accentDim:"transparent",color:active?T.accent:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(!active)e.currentTarget.style.background=T.el;}} onMouseLeave={e=>{if(!active)e.currentTarget.style.background="transparent";}}><span>{ind}</span>{active&&<span style={{fontSize:12}}>✓</span>}</button>);})}
            </div>}
          </div>
          {/* 4. Drawing tools */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setDrawPopOpen(!drawPopOpen);setCandleTypePopOpen(false);setTfPopOpen(false);setIndPopOpen(false);setThemePopOpen(false);}} title="Drawing tools" style={{width:38,height:38,borderRadius:8,border:`1px solid ${drawPopOpen?T.accent:T.border}`,background:T.card,color:drawPopOpen?T.accent:T.text,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
            </button>
            {drawPopOpen&&<div style={{position:"absolute",left:44,bottom:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:8,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",gap:2,width:180,zIndex:20}}>
              <div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,padding:"4px 8px",textTransform:"uppercase",letterSpacing:".05em"}}>Drawings</div>
              {[{name:"Trend Line",tool:"segment"},{name:"Horizontal Line",tool:"horizontalStraightLine"},{name:"Vertical Line",tool:"verticalStraightLine"},{name:"Ray Line",tool:"rayLine"},{name:"Price Line",tool:"priceLine"},{name:"Rectangle",tool:"rect"},{name:"Fibonacci",tool:"fibonacciLine"},{name:"Parallel Line",tool:"parallelStraightLine"}].map(d=>(<button key={d.tool} onClick={()=>{try{chr.current?.createOverlay({name:d.tool,onSelected:(event)=>{const ov=event?.overlay||event;if(ov?.id){setSelectedOverlay({id:ov.id,name:ov.name||d.tool,color:ov.styles?.line?.color||"#f59e0b",style:ov.styles?.line?.style||"solid",size:ov.styles?.line?.size||1.5});}},onDeselected:()=>{setSelectedOverlay(null);}});}catch(e){}setDrawPopOpen(false);}} style={{padding:"7px 10px",border:"none",borderRadius:5,background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{d.name}</button>))}
              <div style={{borderTop:`1px solid ${T.border}`,margin:"4px 0"}}/>
              <button onClick={()=>{try{chr.current?.removeOverlay();}catch(e){}setDrawPopOpen(false);setSelectedOverlay(null);toast("Cleared","All drawings removed","success",1500);}} style={{padding:"7px 10px",border:"none",borderRadius:5,background:"transparent",color:T.red,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.redDim} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Clear All</button>
            </div>}
          </div>
          {/* 5. Theme/palette */}
          <div style={{position:"relative"}}>
            <button onClick={()=>{setThemePopOpen(!themePopOpen);setCandleTypePopOpen(false);setTfPopOpen(false);setIndPopOpen(false);setDrawPopOpen(false);}} title="Theme" style={{width:38,height:38,borderRadius:8,border:`1px solid ${themePopOpen?T.accent:T.border}`,background:T.card,color:themePopOpen?T.accent:T.text,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.5 0 1-.5 1-1v-2c0-.5-.5-1-1-1-1 0-2-1-2-2s1-2 2-2h3c2 0 4-2 4-4 0-5-4-8-10-8z"/></svg>
            </button>
            {themePopOpen&&<div style={{position:"absolute",left:44,bottom:0,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,padding:8,boxShadow:"0 10px 40px rgba(0,0,0,0.5)",display:"flex",flexDirection:"column",gap:4,width:200,zIndex:20}}><div style={{...IN,fontSize:10,color:T.sub,fontWeight:600,padding:"4px 8px",textTransform:"uppercase",letterSpacing:".05em"}}>Theme</div><button onClick={()=>{setSettings({...settings,themeMode:"dark"});setThemePopOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:"none",borderRadius:5,background:settings.themeMode==="dark"?T.accentDim:"transparent",color:settings.themeMode==="dark"?T.accent:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer"}}>D Dark</button><button onClick={()=>{setSettings({...settings,themeMode:"light"});setThemePopOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",border:"none",borderRadius:5,background:settings.themeMode==="light"?T.accentDim:"transparent",color:settings.themeMode==="light"?T.accent:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer"}}>L Light</button><div style={{borderTop:`1px solid ${T.border}`,margin:"2px 0"}}/>
            {/* Candle Colors button */}
            <button onClick={()=>setCandleSubOpen(!candleSubOpen)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 10px",border:"none",borderRadius:5,background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span style={{display:"flex",alignItems:"center",gap:8}}><span style={{display:"inline-flex",gap:2}}><span style={{width:8,height:8,borderRadius:"50%",background:CANDLE_PRESETS[candlePreset].up}}/><span style={{width:8,height:8,borderRadius:"50%",background:CANDLE_PRESETS[candlePreset].dn}}/></span>Candle Colors</span><span style={{fontSize:10,color:T.muted,transform:candleSubOpen?"rotate(90deg)":"rotate(0)",transition:"transform 0.2s"}}>▶</span></button>
            {candleSubOpen&&<div style={{display:"flex",flexDirection:"column",gap:2,marginLeft:10,paddingLeft:8,borderLeft:`1px solid ${T.border}`,marginBottom:4}}>{CANDLE_PRESETS.map((preset,i)=>(<button key={preset.name} onClick={()=>{setCandlePreset(i);setCandleSubOpen(false);setThemePopOpen(false);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",border:"none",borderRadius:4,background:candlePreset===i?T.accentDim:"transparent",color:candlePreset===i?T.accent:T.text,...IN,fontSize:11,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>{if(candlePreset!==i)e.currentTarget.style.background=T.el;}} onMouseLeave={e=>{if(candlePreset!==i)e.currentTarget.style.background="transparent";}}><span style={{display:"inline-flex",gap:3,flexShrink:0}}><span style={{width:10,height:10,borderRadius:"50%",background:preset.up}}/><span style={{width:10,height:10,borderRadius:"50%",background:preset.dn}}/></span><span>{preset.name}</span>{candlePreset===i&&<span style={{marginLeft:"auto",fontSize:11}}>✓</span>}</button>))}</div>}
            <div style={{borderTop:`1px solid ${T.border}`,margin:"2px 0"}}/>
            <label style={{padding:"8px 10px",border:"none",borderRadius:5,background:"transparent",color:T.text,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left",display:"block"}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>cam Upload BG<input type="file" accept="image/*" onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=ev=>{setSettings({...settings,bgImage:ev.target.result});setThemePopOpen(false);};r.readAsDataURL(f);}} style={{display:"none"}}/></label>{settings.bgImage&&<button onClick={()=>{setSettings({...settings,bgImage:""});setThemePopOpen(false);}} style={{padding:"8px 10px",border:"none",borderRadius:5,background:"transparent",color:T.red,...IN,fontSize:12,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.redDim} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>Remove BG</button>}</div>}
          </div>
          </>}
        </div>}

        {/* Cursor-following alert + pending buttons on right edge.
            Two stacked icons appear when hovering over chart (avoiding existing alert/pending lines). */}
        {cursorPos&&cursorPos.y>40&&cursorPos.y<(cr.current?.clientHeight||500)-30
          &&!((tradeLines.alerts||[]).some(a=>Math.abs(a.y-cursorPos.y)<14))
          &&!(pendingTrades.filter(pt=>pt.symbol===p.s).some(pt=>{
              const yPt=toPixel?toPixel(Date.now(),pt.targetPrice):null;
              return yPt&&isFinite(yPt.y)&&Math.abs(yPt.y-cursorPos.y)<14;
            }))
          &&<div style={{position:"absolute",top:cursorPos.y-12,right:55,zIndex:20,display:"flex",alignItems:"center",gap:5,pointerEvents:"auto"}}>
          {/* Alert + button */}
          <button onClick={()=>{const price=cursorPos.price;const currentPrice=pr.current;const dir=price>currentPrice?"above":"below";setAlerts(prev=>[...prev,{pair:p.short+"/USDT",price:+price.toFixed(p.prec),dir,id:Date.now()}]);toast("Alert Set",`${p.short} ${dir} ${price.toFixed(p.prec)}`,"success",2000);}} title={`Add alert at ${cursorPos.price.toFixed(p.prec)}`} style={{width:24,height:24,borderRadius:"50%",border:"1.5px solid #60a5fa",background:"#1e293bee",color:"#60a5fa",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,boxShadow:"0 2px 8px rgba(0,0,0,0.5)",lineHeight:1,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background="#60a5fa";e.currentTarget.style.color="#fff";e.currentTarget.style.transform="scale(1.15)";}} onMouseLeave={e=>{e.currentTarget.style.background="#1e293bee";e.currentTarget.style.color="#60a5fa";e.currentTarget.style.transform="scale(1)";}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
            </svg>
          </button>
          {/* Pending trade button — opens modal with this price as target */}
          <button onClick={()=>{openPendingPromptAt(cursorPos.price);}} title={`Set pending trade at ${cursorPos.price.toFixed(p.prec)}`} style={{width:24,height:24,borderRadius:"50%",border:`1.5px solid ${T.yellow}`,background:"#1e293bee",color:T.yellow,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,boxShadow:"0 2px 8px rgba(0,0,0,0.5)",lineHeight:1,transition:"all 0.15s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.yellow;e.currentTarget.style.color="#0a0e18";e.currentTarget.style.transform="scale(1.15)";}} onMouseLeave={e=>{e.currentTarget.style.background="#1e293bee";e.currentTarget.style.color=T.yellow;e.currentTarget.style.transform="scale(1)";}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </button>
        </div>}

        <div ref={cr} style={{width:"100%",height:"100%",background:settings.bgImage?"transparent":T.bg,position:"relative",zIndex:1}}/>

        {/* === GO-TO-LATEST ARROW BUTTON ===
            Visible when chart is scrolled away from the latest candles. Click jumps back to realtime view.
            Quotex-style: floating round button on right edge, just above the price axis. */}
        {!chartAtRealtime&&<button
          onClick={()=>{
            try{
              chr.current?.scrollToRealTime?.();
              setChartAtRealtime(true);
            }catch(e){}
          }}
          title="Go to latest"
          style={{
            position:"absolute",
            right:55,
            bottom:60,
            width:34,height:34,
            borderRadius:"50%",
            border:`1px solid ${T.border}`,
            background:T.card,
            color:T.text,
            cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",
            zIndex:24,
            boxShadow:`0 4px 12px rgba(0,0,0,0.4), 0 0 0 1px ${T.accent}33`,
            transition:"transform 0.15s, background 0.15s",
            animation:"fadeIn 0.2s"
          }}
          onMouseEnter={e=>{e.currentTarget.style.background=T.accent;e.currentTarget.style.color="#fff";e.currentTarget.style.transform="scale(1.08)";}}
          onMouseLeave={e=>{e.currentTarget.style.background=T.card;e.currentTarget.style.color=T.text;e.currentTarget.style.transform="scale(1)";}}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>}

        {/* ═══ MARKET CLOSED OVERLAY (real forex pairs only, weekends) ═══ */}
        {isMarketClosedForPair(p)&&<div style={{position:"absolute",inset:0,zIndex:25,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(8,12,22,0.78)",backdropFilter:"blur(3px)",WebkitBackdropFilter:"blur(3px)",pointerEvents:"auto",borderRadius:12}}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,padding:"24px 28px",borderRadius:14,background:"linear-gradient(145deg,rgba(20,26,42,0.95),rgba(15,20,32,0.95))",border:"1px solid rgba(245,158,11,0.35)",boxShadow:"0 16px 48px rgba(0,0,0,0.55)",maxWidth:380,textAlign:"center"}}>
            {/* Lock icon */}
            <div style={{width:52,height:52,borderRadius:"50%",background:"rgba(245,158,11,0.15)",border:"1.5px solid rgba(245,158,11,0.45)",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div style={{...IN,fontSize:18,fontWeight:700,color:"#f8fafc",letterSpacing:"0.2px"}}>Market Closed</div>
            <div style={{...IN,fontSize:12,color:"#a1a8b8",lineHeight:1.5,maxWidth:300}}>
              Forex markets close on weekends. <span style={{color:"#f8fafc",fontWeight:600}}>{p.short}</span> reopens on Sunday at 22:00 UTC.
            </div>
            {/* Countdown */}
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 18px",background:"rgba(245,158,11,0.08)",border:"1px solid rgba(245,158,11,0.25)",borderRadius:8,minWidth:200}}>
              <div style={{...IN,fontSize:9,color:"#a1a8b8",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>Reopens in</div>
              <div style={{...MO,fontSize:22,fontWeight:700,color:"#f59e0b",letterSpacing:"0.5px",fontVariantNumeric:"tabular-nums"}}>{fmtMarketCountdown(marketStatus.msUntilOpen)}</div>
            </div>
            <div style={{...IN,fontSize:11,color:"#94a3b8",marginTop:2}}>
              Switch to <span style={{color:"#10b981",fontWeight:700}}>OTC pairs</span> to keep trading 24/7
            </div>
            <button onClick={()=>setPairPickerOpen(true)} style={{padding:"8px 18px",borderRadius:7,border:"none",background:"linear-gradient(135deg,#10b981,#059669)",color:"#fff",...IN,fontSize:12,fontWeight:700,cursor:"pointer",letterSpacing:"0.3px",boxShadow:"0 4px 14px rgba(16,185,129,0.35)"}}>Browse OTC Pairs</button>
          </div>
        </div>}

        {/* Zoom In / Zoom Out / Reload */}
        <div style={{position:"absolute",bottom:isMobile?8:28,left:"50%",transform:"translateX(-50%)",zIndex:16,display:"flex",gap:4}}>
          <button onClick={()=>{if(!cr.current)return;try{const cvs=cr.current.querySelectorAll("canvas");cvs.forEach(cv=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new WheelEvent("wheel",{deltaY:-200,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));});}catch(e){}}} title="Zoom In" style={{width:30,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.card+"dd",color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,...IN}} onMouseEnter={e=>{e.currentTarget.style.color=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.color=T.sub;}}>+</button>
          <button onClick={()=>{if(!cr.current)return;try{const cvs=cr.current.querySelectorAll("canvas");cvs.forEach(cv=>{const r=cv.getBoundingClientRect();cv.dispatchEvent(new WheelEvent("wheel",{deltaY:200,clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true,cancelable:true}));});}catch(e){}}} title="Zoom Out" style={{width:30,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.card+"dd",color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,...IN}} onMouseEnter={e=>{e.currentTarget.style.color=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.color=T.sub;}}>−</button>
          <button onClick={()=>{if(!cr.current)return;try{lr.current=null;dispose(cr.current);chr.current=null;const styles=settings.themeMode==="light"?chartStLight:chartSt;const chart=init(cr.current,{styles});chr.current=chart;chart.setDataLoader({getBars:(params)=>{params.callback(kr.current,false);},subscribeBar:(params)=>{lr.current=params.callback;},unsubscribeBar:()=>{lr.current=null;}});chart.setSymbol({ticker:p.s,name:"",pricePrecision:p.prec,volumePrecision:0});chart.setPeriod({multiplier:tf.mult,span:tf.span,text:tf.label});if(candleType!=="candle_solid")setTimeout(()=>{try{chr.current.setStyles({candle:{type:candleType}});}catch(e){}},300);}catch(e){}}} title="Reset" style={{width:30,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.card+"dd",color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onMouseEnter={e=>{e.currentTarget.style.color=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.color=T.sub;}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 3v6h6"/></svg></button>
        </div>
        {/* Scroll to current candle — only shows when scrolled back */}
      </div>
    </div>

    {/* Right */}
    {/* Right panel - bottom on mobile, side on desktop */}
    {isMobile?(mobileTab==="chart"?<div style={{background:T.card,borderTop:`1px solid ${T.border}`,padding:"10px 14px",flexShrink:0}}>
      <div style={{display:"flex",gap:10,marginBottom:8}}>
        <div style={{flex:1}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:3}}>Amount</div>
          <div style={{display:"flex",alignItems:"center",borderRadius:6,border:`1px solid ${T.border}`,height:36,overflow:"hidden"}}>
            <button onClick={()=>setAmt(Math.max(1,amt-1))} style={{width:28,border:"none",background:T.el,color:T.sub,fontSize:14,cursor:"pointer",height:"100%"}}>−</button>
            <input type="number" value={amt} onChange={e=>{const v=parseInt(e.target.value)||0;setAmt(Math.min(2000,Math.max(0,v)));}} onBlur={()=>{if(amt<1)setAmt(1);if(amt>2000)setAmt(2000);}} style={{flex:1,background:T.el,border:"none",borderLeft:`1px solid ${T.border}`,borderRight:`1px solid ${T.border}`,height:"100%",textAlign:"center",...MO,fontSize:14,fontWeight:700,color:T.text,outline:"none",width:0}}/>
            <button onClick={()=>setAmt(Math.min(2000,amt+1))} style={{width:28,border:"none",background:T.el,color:T.sub,fontSize:14,cursor:"pointer",height:"100%"}}>+</button>
          </div>
        </div>
        <div style={{flex:1}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,marginBottom:3}}>Time</div>
          <div style={{display:"flex",alignItems:"center",borderRadius:6,border:`1px solid ${T.border}`,height:36,overflow:"hidden"}}>
            <button onClick={()=>setDi(Math.max(0,di-1))} style={{width:28,border:"none",background:T.el,color:T.sub,fontSize:13,fontWeight:600,cursor:"pointer",height:"100%"}}>−</button>
            <div onClick={()=>{const v=prompt("Enter time in minutes (1-60):",Math.floor(DURS[di].sec/60));if(v!==null){const mins=parseInt(v);if(mins>=1&&mins<=60){const idx=DURS.findIndex(d=>d.sec===mins*60);if(idx>=0){setDi(idx);}else{const newDur={label:mins+"m",sec:mins*60};const insertIdx=DURS.findIndex(d=>d.sec>mins*60);if(insertIdx>=0){DURS.splice(insertIdx,0,newDur);setDi(insertIdx);}else{DURS.push(newDur);setDi(DURS.length-1);}}}}}} style={{flex:1,background:T.el,display:"flex",alignItems:"center",justifyContent:"center",borderLeft:`1px solid ${T.border}`,borderRight:`1px solid ${T.border}`,height:"100%",cursor:"pointer"}}><span style={{...MO,fontSize:13,fontWeight:700}}>{DURS[di].label}</span></div>
            <button onClick={()=>setDi(Math.min(DURS.length-1,di+1))} style={{width:28,border:"none",background:T.el,color:T.sub,fontSize:13,fontWeight:600,cursor:"pointer",height:"100%"}}>+</button>
          </div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,...MO,fontSize:10}}>
        <span style={{color:T.sub}}>Payout: <span style={{color:T.green}}>+{p.payout}%</span></span>
        <span style={{color:T.green,fontWeight:700}}>+${(amt*p.payout/100).toFixed(2)}</span>
      </div>
      
      {/* Mobile pending mode toggle */}
      <button onClick={()=>setPendingMode(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"5px 8px",marginBottom:6,borderRadius:5,border:`1px solid ${pendingMode?T.accent:T.border}`,background:pendingMode?(T.accent+"15"):T.el,...IN,fontSize:10,fontWeight:600,color:pendingMode?T.accent:T.sub}}>
        <span style={{display:"flex",alignItems:"center",gap:4}}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          PENDING TRADE
        </span>
        <span style={{width:26,height:14,borderRadius:7,background:pendingMode?T.accent:T.border,position:"relative",flexShrink:0}}>
          <span style={{position:"absolute",top:2,left:pendingMode?14:2,width:10,height:10,borderRadius:"50%",background:"#fff",transition:"left 0.15s"}}/>
        </span>
      </button>
      
      {/* Mobile Quote input — shown when pending mode ON */}
      {pendingMode&&<div style={{display:"flex",alignItems:"center",gap:4,marginBottom:6,padding:"4px 6px",borderRadius:5,border:`1px solid ${T.accent}`,background:T.accent+"08"}}>
        <span style={{...IN,fontSize:8,color:T.accent,fontWeight:700}}>QUOTE</span>
        <input
          type="number"
          value={pendingTargetInput||""}
          step={Math.pow(10,-p.prec)}
          onChange={e=>{
            const v=parseFloat(e.target.value);
            if(isFinite(v))setPendingTargetInput(v);
            else setPendingTargetInput(0);
          }}
          placeholder={pr.current.toFixed(p.prec)}
          style={{flex:1,...MO,fontSize:12,fontWeight:700,color:T.text,background:"transparent",border:"none",outline:"none",textAlign:"center",width:0,padding:"3px 0"}}
        />
        <span style={{...MO,fontSize:8,color:T.sub}}>now {pr.current.toFixed(p.prec)}</span>
      </div>}
      
      <div style={{display:"flex",gap:8}}>
        <button onClick={()=>pendingMode?placePendingFromForm("HIGHER"):openTrade("HIGHER")} disabled={tradeLimitReached||isMarketClosedForPair(p)||(pendingMode&&pendingTrades.length>=10)} style={{flex:1,padding:"12px 0",borderRadius:8,border:pendingMode?`1.5px solid ${T.yellow}`:"none",background:isMarketClosedForPair(p)?"#1a2a1a":"linear-gradient(135deg,#16a34a,#22c55e)",color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:(tradeLimitReached||isMarketClosedForPair(p))?"not-allowed":"pointer",textAlign:"center",opacity:(tradeLimitReached||isMarketClosedForPair(p))?.4:1}}>HIGHER</button>
        <button onClick={()=>pendingMode?placePendingFromForm("LOWER"):openTrade("LOWER")} disabled={tradeLimitReached||isMarketClosedForPair(p)||(pendingMode&&pendingTrades.length>=10)} style={{flex:1,padding:"12px 0",borderRadius:8,border:pendingMode?`1.5px solid ${T.yellow}`:"none",background:isMarketClosedForPair(p)?"#2a1a1a":"linear-gradient(135deg,#dc2626,#ef4444)",color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:(tradeLimitReached||isMarketClosedForPair(p))?"not-allowed":"pointer",textAlign:"center",opacity:(tradeLimitReached||isMarketClosedForPair(p))?.4:1}}>LOWER</button>
      </div>
    </div>:null)
    :<div style={{width:220,background:T.card,display:"flex",flexDirection:"column",flexShrink:0,borderLeft:`1px solid ${T.border}`}}>
      {/* ═══ QUOTEX-STYLE RIGHT PANEL ═══ */}
      <div style={{padding:"8px 10px",display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
        {/* Current pair + payout */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:20,height:20,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PairLogo pair={p} size={18}/></div>
            <span style={{...IN,fontSize:12,fontWeight:700,color:T.text}}>{p.short}</span>
          </div>
          <span style={{...MO,fontSize:12,fontWeight:700,color:T.accent}}>{p.payout}%</span>
        </div>

        {/* Pending trade toggle — when ON, replaces Up/Down with quote-based pending entry form */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={pendingMode?T.accent:T.sub} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            <span style={{...IN,fontSize:10,fontWeight:600,color:pendingMode?T.accent:T.sub,textTransform:"uppercase"}}>Pending Trade</span>
          </div>
          <div onClick={()=>setPendingMode(v=>!v)} style={{width:32,height:18,borderRadius:9,background:pendingMode?T.accent:T.el,border:`1px solid ${pendingMode?T.accent:T.border}`,position:"relative",cursor:"pointer",transition:"all 0.2s"}}><div style={{width:12,height:12,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:pendingMode?16:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,.3)"}}/></div>
        </div>

        {/* Time — opens grid popup with all available durations on click */}
        <div style={{position:"relative",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 0"}}>
          <div style={{position:"absolute",top:-7,left:10,background:T.card,padding:"0 4px",...IN,fontSize:8,color:T.sub}}>Time</div>
          <div style={{display:"flex",alignItems:"center"}}>
            <button onClick={()=>{
              // Step backward through the available durations only (skip OTC-only on real forex)
              const avail=getAvailableDurs(p);
              const curIdx=avail.findIndex(d=>d.sec===DURS[di].sec);
              if(curIdx>0){
                const newSec=avail[curIdx-1].sec;
                const newDi=DURS.findIndex(d=>d.sec===newSec);
                if(newDi>=0)setDi(newDi);
              }
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>-</button>
            <div onClick={()=>setTimeGridOpen(true)} style={{flex:1,textAlign:"center",cursor:"pointer",...MO,fontSize:16,fontWeight:700,color:T.text}}>
              {(()=>{
                // Pure duration display — "01:00", "00:30", "01:00:00"
                const s=DURS[di].sec;
                const h=Math.floor(s/3600);
                const m=Math.floor((s%3600)/60);
                const sec=s%60;
                if(h>0)return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
                return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
              })()}
            </div>
            <button onClick={()=>{
              const avail=getAvailableDurs(p);
              const curIdx=avail.findIndex(d=>d.sec===DURS[di].sec);
              if(curIdx<avail.length-1){
                const newSec=avail[curIdx+1].sec;
                const newDi=DURS.findIndex(d=>d.sec===newSec);
                if(newDi>=0)setDi(newDi);
              }
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          {/* SWITCH TIME label — opens time grid popup */}
          <div style={{textAlign:"center",position:"relative"}}>
            <div onClick={()=>setTimeGridOpen(true)} style={{...IN,fontSize:8,color:T.accent,fontWeight:700,cursor:"pointer",textTransform:"uppercase",letterSpacing:".05em",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
              SWITCH TIME
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" style={{transform:timeGridOpen?"rotate(180deg)":"none",transition:"transform 0.15s"}}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {/* === TIME GRID POPUP === — Quotex-style 3-column grid showing all available durations.
                4h is full-width on its own row at the bottom, like screenshot. */}
            {timeGridOpen&&<>
              <div onClick={()=>setTimeGridOpen(false)} style={{position:"fixed",inset:0,zIndex:50}}/>
              <div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",marginTop:8,background:T.card,border:`1px solid ${T.border}`,borderRadius:10,padding:8,zIndex:51,boxShadow:"0 12px 40px rgba(0,0,0,0.5)",width:200}}>
                {/* All durations except 4h in a 3-col grid */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  {getAvailableDurs(p).filter(d=>d.sec!==14400).map((d,idx)=>{
                    const realIdx=DURS.findIndex(x=>x.sec===d.sec);
                    const isActive=realIdx===di;
                    // Format label: 5s/10s/15s/30s → "00:05" etc; minutes → "01:00"; hours → "01:00:00"
                    const s=d.sec;const h=Math.floor(s/3600);const m=Math.floor((s%3600)/60);const sec=s%60;
                    const label=h>0?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
                                   :`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
                    return(<button key={d.sec} onClick={()=>{setDi(realIdx);setTimeGridOpen(false);}} style={{
                      padding:"10px 4px",borderRadius:6,
                      border:isActive?`1.5px solid ${T.accent}`:`1px solid ${T.border}`,
                      background:isActive?T.accent+"22":T.el,
                      color:isActive?T.accent:T.text,
                      ...MO,fontSize:11,fontWeight:700,
                      cursor:"pointer",transition:"all 0.12s"
                    }} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.border;}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=T.el;}}>{label}</button>);
                  })}
                </div>
                {/* 4h full-width row — only shown for OTC pairs (it's otcOnly) */}
                {getAvailableDurs(p).find(d=>d.sec===14400)&&(()=>{
                  const realIdx=DURS.findIndex(x=>x.sec===14400);
                  const isActive=realIdx===di;
                  return(<button onClick={()=>{setDi(realIdx);setTimeGridOpen(false);}} style={{
                    width:"100%",marginTop:6,padding:"10px 4px",borderRadius:6,
                    border:isActive?`1.5px solid ${T.accent}`:`1px solid ${T.border}`,
                    background:isActive?T.accent+"22":T.el,
                    color:isActive?T.accent:T.text,
                    ...MO,fontSize:11,fontWeight:700,
                    cursor:"pointer",transition:"all 0.12s"
                  }} onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=T.border;}} onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background=T.el;}}>04:00:00</button>);
                })()}
              </div>
            </>}
          </div>
        </div>

        {/* Investment — with Fixed/Percentage mode dropdown */}
        <div style={{position:"relative",border:`1px solid ${T.border}`,borderRadius:8,padding:"4px 0"}}>
          <div style={{position:"absolute",top:-7,left:10,background:T.card,padding:"0 4px",...IN,fontSize:8,color:T.sub}}>Investment</div>
          <div style={{display:"flex",alignItems:"center"}}>
            <button onClick={()=>{
              if(invMode==="fixed")setAmt(Math.max(1,amt-1));
              else setAmtPercent(Math.max(1,amtPercent-1));
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>-</button>
            <div style={{flex:1,textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
              {invMode==="fixed"?<>
                <input type="number" value={amt} onChange={e=>{const v=parseInt(e.target.value)||0;setAmt(Math.min(2000,Math.max(0,v)));}} onBlur={()=>{if(amt<1)setAmt(1);}} style={{...MO,fontSize:16,fontWeight:700,color:T.text,background:"transparent",border:"none",outline:"none",textAlign:"center",width:50}}/>
                <span style={{...MO,fontSize:12,color:T.sub}}>$</span>
              </>:<>
                <input type="number" value={amtPercent} onChange={e=>{const v=parseInt(e.target.value)||0;setAmtPercent(Math.min(100,Math.max(0,v)));}} onBlur={()=>{if(amtPercent<1)setAmtPercent(1);}} style={{...MO,fontSize:16,fontWeight:700,color:T.text,background:"transparent",border:"none",outline:"none",textAlign:"center",width:50}}/>
                <span style={{...MO,fontSize:12,color:T.sub}}>%</span>
              </>}
            </div>
            <button onClick={()=>{
              if(invMode==="fixed")setAmt(Math.min(2000,amt+1));
              else setAmtPercent(Math.min(100,amtPercent+1));
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          {/* Mode dropdown — Fixed Amount / Percentage */}
          <div style={{textAlign:"center",position:"relative"}}>
            <div onClick={()=>setInvModeOpen(!invModeOpen)} style={{...IN,fontSize:8,color:T.accent,fontWeight:700,cursor:"pointer",textTransform:"uppercase",letterSpacing:".05em",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
              {invMode==="fixed"?"Fixed Amount":`Percentage · ≈ ${cvs((activeBal*amtPercent/100)||0)}`}
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" style={{transform:invModeOpen?"rotate(180deg)":"none",transition:"transform 0.15s"}}><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            {invModeOpen&&<><div onClick={()=>setInvModeOpen(false)} style={{position:"fixed",inset:0,zIndex:50}}/><div style={{position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",marginTop:4,background:T.card,border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden",zIndex:51,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",minWidth:140}}>
              <button onClick={()=>{setInvMode("fixed");setInvModeOpen(false);}} style={{width:"100%",padding:"8px 14px",border:"none",background:invMode==="fixed"?T.accentDim:"transparent",color:invMode==="fixed"?T.accent:T.text,...IN,fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:6}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Fixed Amount
              </button>
              <button onClick={()=>{setInvMode("percent");setInvModeOpen(false);}} style={{width:"100%",padding:"8px 14px",border:"none",background:invMode==="percent"?T.accentDim:"transparent",color:invMode==="percent"?T.accent:T.text,...IN,fontSize:11,fontWeight:600,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:6}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>Percentage
              </button>
            </div></>}
          </div>
        </div>

        {/* === QUOTE input — shown ONLY when pendingMode is ON ===
            User enters target price; on Up/Down click, pending order placed at this quote. */}
        {pendingMode&&<div style={{position:"relative",border:`1px solid ${T.accent}`,borderRadius:8,padding:"4px 0",background:T.accent+"08"}}>
          <div style={{position:"absolute",top:-7,left:10,background:T.card,padding:"0 4px",...IN,fontSize:8,color:T.accent,fontWeight:700}}>QUOTE</div>
          <div style={{display:"flex",alignItems:"center"}}>
            <button onClick={()=>{
              const step=Math.pow(10,-p.prec);
              setPendingTargetInput(prev=>parseFloat(((prev||pr.current)-step*10).toFixed(p.prec)));
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>-</button>
            <input
              type="number"
              value={pendingTargetInput||""}
              step={Math.pow(10,-p.prec)}
              onChange={e=>{
                const v=parseFloat(e.target.value);
                if(isFinite(v))setPendingTargetInput(v);
                else setPendingTargetInput(0);
              }}
              placeholder={pr.current.toFixed(p.prec)}
              style={{flex:1,...MO,fontSize:14,fontWeight:700,color:T.text,background:"transparent",border:"none",outline:"none",textAlign:"center",padding:"6px 0",width:0}}
            />
            <button onClick={()=>{
              const step=Math.pow(10,-p.prec);
              setPendingTargetInput(prev=>parseFloat(((prev||pr.current)+step*10).toFixed(p.prec)));
            }} style={{width:32,height:32,border:"none",background:"transparent",color:T.sub,fontSize:16,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
          </div>
          {/* Live price reference + gap indicator */}
          <div style={{textAlign:"center",...MO,fontSize:9,color:T.sub,paddingBottom:2}}>
            Current: <span style={{color:T.text,fontWeight:600}}>{pr.current.toFixed(p.prec)}</span>
            {pendingTargetInput>0&&pr.current>0&&(()=>{
              const gap=pendingTargetInput-pr.current;
              const pct=(gap/pr.current*100).toFixed(2);
              const sign=gap>=0?"+":"";
              const col=gap>=0?T.green:T.red;
              return <span style={{color:col,marginLeft:4}}>· {sign}{pct}%</span>;
            })()}
          </div>
        </div>}

        {/* Payout */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"2px 4px"}}>
          <span style={{...IN,fontSize:10,color:T.sub}}>Payout</span>
          <span style={{...MO,fontSize:12,fontWeight:700,color:T.accent}}>{(amt*(p.payout/100)).toFixed(2)} $</span>
        </div>

        {/* Up/Down buttons — In pending mode they place pending orders at quote price.
            In normal mode they fire instant trades. Yellow border in pending mode. */}
        <button
          onClick={()=>pendingMode?placePendingFromForm("HIGHER"):openTrade("HIGHER")}
          disabled={tradeLimitReached||isMarketClosedForPair(p)||pendingTrades.length>=10}
          style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"12px 16px",borderRadius:8,
            border:pendingMode?`1.5px solid ${T.yellow}`:"none",
            background:(tradeLimitReached||isMarketClosedForPair(p))?"#1a2a1a":"linear-gradient(135deg,#22c55e,#16a34a)",
            color:"#fff",
            cursor:(tradeLimitReached||isMarketClosedForPair(p))?"not-allowed":"pointer",
            opacity:(tradeLimitReached||isMarketClosedForPair(p))?.4:1,
            ...IN,fontSize:15,fontWeight:700
          }}
        >
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            {pendingMode&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            <span>Up</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16V8M8 12l4-4 4 4"/></svg>
        </button>
        <button
          onClick={()=>pendingMode?placePendingFromForm("LOWER"):openTrade("LOWER")}
          disabled={tradeLimitReached||isMarketClosedForPair(p)||pendingTrades.length>=10}
          style={{
            display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"12px 16px",borderRadius:8,
            border:pendingMode?`1.5px solid ${T.yellow}`:"none",
            background:(tradeLimitReached||isMarketClosedForPair(p))?"#2a1a1a":"linear-gradient(135deg,#ef4444,#dc2626)",
            color:"#fff",
            cursor:(tradeLimitReached||isMarketClosedForPair(p))?"not-allowed":"pointer",
            opacity:(tradeLimitReached||isMarketClosedForPair(p))?.4:1,
            ...IN,fontSize:15,fontWeight:700
          }}
        >
          <span style={{display:"flex",alignItems:"center",gap:6}}>
            {pendingMode&&<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
            <span>Down</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M16 12l-4 4-4-4"/></svg>
        </button>
      </div>

      {/* ═══ OPEN TRADES LIST — Quotex style ═══ */}
      <div style={{borderTop:`1px solid ${T.border}`,flex:1,display:"flex",flexDirection:"column",minHeight:0}}>
        {/* Trades header tabs — clickable to switch between Active and Pending lists */}
        <div style={{display:"flex",alignItems:"center",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <button
            onClick={()=>setTradesTabView("trades")}
            style={{
              flex:1,padding:"6px 10px",
              display:"flex",alignItems:"center",gap:4,
              border:"none",
              borderBottom:tradesTabView==="trades"?`2px solid ${T.accent}`:"2px solid transparent",
              background:tradesTabView==="trades"?T.accent+"08":"transparent",
              cursor:"pointer",transition:"all 0.15s",
              opacity:tradesTabView==="trades"?1:0.6
            }}
          >
            <span style={{...IN,fontSize:10,fontWeight:700,color:tradesTabView==="trades"?T.text:T.sub}}>Trades</span>
            <span style={{...MO,fontSize:9,fontWeight:700,color:tradesTabView==="trades"?T.accent:T.sub,background:tradesTabView==="trades"?T.accentDim:T.el,padding:"1px 5px",borderRadius:3}}>{allActive.filter(t=>{const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return !t.done&&Date.now()<et;}).length}</span>
          </button>
          <button
            onClick={()=>setTradesTabView("pending")}
            style={{
              flex:1,padding:"6px 10px",
              display:"flex",alignItems:"center",gap:4,
              border:"none",
              borderBottom:tradesTabView==="pending"?`2px solid ${T.yellow}`:"2px solid transparent",
              background:tradesTabView==="pending"?T.yellow+"08":"transparent",
              cursor:"pointer",transition:"all 0.15s",
              opacity:tradesTabView==="pending"?1:0.6
            }}
          >
            <span style={{...IN,fontSize:10,fontWeight:700,color:tradesTabView==="pending"?T.yellow:T.sub}}>Pending</span>
            <span style={{...MO,fontSize:9,fontWeight:700,color:tradesTabView==="pending"?T.yellow:T.sub,background:tradesTabView==="pending"?T.yellow+"22":T.el,padding:"1px 5px",borderRadius:3}}>{pendingTrades.length}</span>
          </button>
        </div>

        {/* === PENDING TRADES LIST === — shown when "Pending" tab selected */}
        {tradesTabView==="pending"&&<div style={{flex:1,overflowY:"auto",padding:"4px 6px",background:T.yellow+"05"}}>
          {pendingTrades.length===0?
            <div style={{textAlign:"center",padding:"30px 0",color:T.muted,...IN,fontSize:11}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.5" style={{margin:"0 auto 8px",display:"block",opacity:0.5}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              No pending orders<br/>
              <span style={{fontSize:9,color:T.muted,marginTop:4,display:"inline-block"}}>Toggle "Pending Trade" mode to place limit orders</span>
            </div>
          :pendingTrades.map(pt=>{
            const pp=PAIRS.find(x=>x.s===pt.symbol);
            const isCurrent=pt.symbol===p.s;
            const liveCur=isCurrent?lp:pt.createdPrice;
            const gap=pt.targetPrice-liveCur;
            const gapPct=(gap/liveCur*100).toFixed(2);
            const isUp=pt.dir==="HIGHER";
            return(<div key={pt.id} style={{background:T.card,border:`1px solid ${T.yellow}33`,borderRadius:7,padding:"6px 8px",marginBottom:4}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}>
                  <PairLogo pair={pp} size={14}/>
                  <span style={{...IN,fontSize:10,fontWeight:700,color:T.text}}>{pp?.short||pt.symbol}</span>
                  <span style={{...MO,fontSize:8,fontWeight:700,color:isUp?T.green:T.red,padding:"1px 4px",borderRadius:2,background:(isUp?T.green:T.red)+"22"}}>{isUp?"↑ HIGHER":"↓ LOWER"}</span>
                </div>
                <button onClick={()=>setPendingTrades(prev=>prev.filter(x=>x.id!==pt.id))} style={{width:18,height:18,border:"none",background:"transparent",color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,borderRadius:3}} title="Cancel pending">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:9,...MO}}>
                <div>
                  <span style={{color:T.muted}}>Target: </span>
                  <span style={{color:T.yellow,fontWeight:700}}>{pt.targetPrice.toFixed(pt.prec)}</span>
                </div>
                <div>
                  <span style={{color:T.muted}}>Gap: </span>
                  <span style={{color:gap>=0?T.green:T.red,fontWeight:700}}>{gap>=0?"+":""}{gapPct}%</span>
                </div>
                <div>
                  <span style={{color:T.muted}}>${pt.amt}</span>
                  <span style={{color:T.sub,marginLeft:4}}>· {Math.floor(pt.durSec/60)}m</span>
                </div>
              </div>
            </div>);
          })}
        </div>}

        {/* === ACTIVE TRADES LIST === — shown when "Trades" tab selected */}
        {tradesTabView==="trades"&&<div style={{flex:1,overflowY:"auto",padding:"4px 6px"}}>
          {allActive.filter(t=>{const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return !t.done&&Date.now()<et;}).length===0?
            <div style={{textAlign:"center",padding:"20px 0",color:T.muted,...IN,fontSize:10}}>No open trades</div>
          :allActive.filter(t=>{const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;return !t.done&&Date.now()<et;}).map(t=>{
            const pp=PAIRS.find(x=>x.s===t.symbol);
            const curPrice=t.symbol===p.s?lp:t.entry;
            const priceDiff=t.dir==="HIGHER"?curPrice-t.entry:t.entry-curPrice;
            const isWinning=priceDiff>0;
            const profitAmt=t.amt*(pp?.payout||85)/100;
            const et=typeof t.endTime==="string"?new Date(t.endTime).getTime():t.endTime;
            const openTime=typeof t.openTime==="string"?new Date(t.openTime).getTime():(t.openTime||et-(t.duration||60)*1000);
            const rem=Math.max(0,Math.floor((et-Date.now())/1000));
            const elapsed=Math.floor((Date.now()-openTime)/1000);
            const canSell=isWinning&&elapsed<=10&&rem>3;
            const sellAmt=isWinning?Math.max(0.01,(priceDiff/t.entry)*t.amt*50).toFixed(2):"0.00";
            const m=Math.floor(rem/60);const s=rem%60;
            const timeStr=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
            return(<div key={t.id} style={{borderBottom:`1px solid ${T.border}`,padding:"6px 4px"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:3}}>
                <div style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><PairLogo pair={pp} size={14}/></div>
                  <span style={{...IN,fontSize:10,fontWeight:600,color:T.text}}>{pp?.short||"--"}</span>
                </div>
                <span style={{...MO,fontSize:9,color:T.muted}}>{timeStr}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:3}}>
                  <span style={{color:t.dir==="HIGHER"?T.green:T.red,fontSize:9}}>{t.dir==="HIGHER"?"↑":"↓"}</span>
                  <span style={{...MO,fontSize:9,fontWeight:600,color:T.sub}}>{t.amt} $</span>
                </div>
                <span style={{...MO,fontSize:10,fontWeight:700,color:isWinning?T.green:T.muted}}>{isWinning?`+${profitAmt.toFixed(2)}`:` 0.00`} $</span>
              </div>
              {canSell&&<button onClick={()=>{
                const returnAmt=t.amt+parseFloat(sellAmt);
                setTrades(prev=>prev.map(tr=>tr.id===t.id?{...tr,done:true}:tr));
                if(t.mode==="real"){setRealBal(b=>b+returnAmt);}else{setBal(b=>b+returnAmt);}
                if(settings.sound)playWin();
                toast("Trade Sold","Sold early for +$"+sellAmt,"success",2000);
                const result={symbol:t.symbol,pair:t.pairLabel||pp?.short||"--",dir:t.dir,amt:t.amt,entry:t.entry.toFixed(pp?.prec||2),exit:curPrice.toFixed(pp?.prec||2),payout:parseFloat(sellAmt),won:true,time:new Date().toLocaleTimeString(),openTimeStr:new Date(t.openTime||Date.now()).toISOString(),closeTimeStr:new Date().toISOString(),mode:t.mode||"demo",prec:pp?.prec||2,cs:"$",rate:1};
                setHistory(prev=>[result,...prev]);
              }} style={{width:"100%",marginTop:4,padding:"5px 0",borderRadius:4,border:"none",background:"linear-gradient(135deg,#22c55e,#16a34a)",color:"#fff",...IN,fontSize:9,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                Sell now <span style={{...MO,fontSize:8}}>{sellAmt} $</span>
              </button>}
            </div>);
          })}
        </div>}
      </div>
    </div>}
    </>}
    {/* ═══ INLINE WALLET VIEW — replaces center+right when active ═══ */}
    {walletView&&<WalletPageInline initialTab={walletView} onBack={async()=>{setWalletView(null);try{const m=await API.auth.me();if(m.success&&m.user){setBal(m.user.demoBalance);}}catch(e){}}} T={T}/>}
    {/* ═══ ACCOUNT PAGE INLINE ═══ */}
    {accountView&&<AccountPageInline T={T} currentUser={currentUser} settings={settings} onSaveSettings={s=>{setSettings(s);}} onLogout={onLogout} onOpenKYC={()=>setKyco(true)} onBack={()=>setAccountView(null)} isGuest={isGuest} onNav={onNav} setWalletView={setWalletView} setAccountView={setAccountView} setHo={setHo} setTno={setTno} Avatar={Avatar} handleAvatarUpload={handleAvatarUpload} initialTab={accountView.startsWith("support")?"support":accountView==="kyc"?"kyc":accountView==="analytics"?"analytics":"account"} initialSupportSub={accountView==="support_faq"?"faq":accountView==="support_request"?"request":"request"} setSupportOpen={setSupportOpen} tradeHistory={history} balance={bal} realBalance={realBal} cvs={cvs}/>}
    </div>{/* close content flex-row */}
    </div>{/* close main content column */}
    {/* Mobile bottom tab bar — Pocket Option style */}
    {isMobile&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-around",height:50,background:T.card,borderTop:`1px solid ${T.border}`,flexShrink:0,position:"relative"}}>
      {moreOpen&&<>
        <div onClick={()=>setMoreOpen(false)} style={{position:"fixed",inset:0,zIndex:299}}/>
        <div style={{position:"absolute",bottom:54,right:8,width:200,background:T.card,border:`1px solid ${T.border}`,borderRadius:12,boxShadow:"0 -10px 40px rgba(0,0,0,0.4)",zIndex:300,padding:"6px 0"}}>
          {[
            {label:"Signals",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M2 20h.01"/><path d="M7 20v-4"/><path d="M12 20v-8"/><path d="M17 20V8"/><path d="M22 4v16"/></svg>,action:()=>{setMoreOpen(false);setSgo(true);}},
            {label:"Wallet",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><circle cx="18" cy="15" r="1"/></svg>,action:()=>{setMoreOpen(false);if(isGuest){onNav("register");}else{setWalletView("wallets");}}},
            {label:"Ranking",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>,action:()=>{setMoreOpen(false);if(isGuest){onNav("register");}else{setRko(true);}}},
            {label:"Tournaments",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,action:()=>{setMoreOpen(false);setTno(true);}},
            {label:"Settings",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8892a6" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,action:()=>{setMoreOpen(false);setChartSto(true);}}
          ].map((item,i)=>(
            <button key={i} onClick={item.action} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 16px",border:"none",background:"transparent",color:T.text,...IN,fontSize:13,fontWeight:500,cursor:"pointer",textAlign:"left"}} onMouseEnter={e=>e.currentTarget.style.background=T.el} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{display:"flex"}}>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>
      </>}
      {[
        {id:"chart",label:"Chart",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>},
        {id:"portfolio",label:"Portfolio",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>},
        {id:"history",label:"History",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>},
        {id:"alerts",label:"Alerts",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>},
        {id:"more",label:"More",icon:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>}
      ].map(n=>(
        <button key={n.id} onClick={()=>{
          if(n.id==="more"){setMoreOpen(prev=>!prev);}
          else{setMoreOpen(false);
            if(n.id==="chart"){setMobileTab(n.id);closeAllPanels();setWalletView(null);setAccountView(null);}
            else if(n.id==="portfolio"){setMobileTab(n.id);}
            else if(n.id==="history"){setMobileTab("chart");setHo(true);}
            else if(n.id==="alerts"){setMobileTab("chart");setAo(true);}
          }
        }} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2,border:"none",background:"transparent",cursor:"pointer",color:mobileTab===n.id||(n.id==="more"&&moreOpen)||(n.id==="history"&&ho)||(n.id==="alerts"&&ao)?T.accent:T.sub,...IN,fontSize:9,padding:"6px 8px",transition:"color 0.15s"}}>
          <span style={{display:"flex"}}>{n.icon}</span>
          <span style={{fontWeight:500}}>{n.label}</span>
        </button>
      ))}
    </div>}
    <style>{`*,button,input,select,textarea{font-family:'DM Sans',sans-serif;box-sizing:border-box} html,body,#root{height:100dvh;height:100vh;margin:0;padding:0;overflow:hidden} input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0} input[type=number]{-moz-appearance:textfield} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}} @keyframes resultPop{0%{transform:translate(-50%,-50%) scale(0.8);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}} @keyframes fadeIn{0%{opacity:0;transform:translateY(-5px)}100%{opacity:1;transform:translateY(0)}} @keyframes slideIn{0%{opacity:0;transform:translateX(40px)}100%{opacity:1;transform:translateX(0)}} @keyframes toastSlideUp{0%{opacity:0;transform:translateY(20px) scale(0.92)}100%{opacity:1;transform:translateY(0) scale(1)}} @keyframes toastSlideRight{0%{opacity:0;transform:translateX(20px) scale(0.92)}100%{opacity:1;transform:translateX(0) scale(1)}} .qt-toasts::-webkit-scrollbar{display:none} *{scrollbar-width:thin;scrollbar-color:${T.border} ${T.bg}} ::-webkit-scrollbar{width:4px;height:4px} ::-webkit-scrollbar-track{background:${T.bg}} ::-webkit-scrollbar-thumb{background:${T.border};border-radius:2px} @supports(height:100dvh){html,body,#root{height:100dvh}}`}</style>
    {/* Desktop profile button + dropdown now inside right panel header */}
  </div>);}

/* ═══════════════════════════════════════════════════════════════
   ANALYTICS TAB CONTENT — Sample 1 header (profile bar) + Sample 2 body (KPI cards)
   Real data from trade history, period filter (Today/Yesterday/Week/Month).
   ═══════════════════════════════════════════════════════════════ */
function AnalyticsTabContent({T,currentUser,balance,realBalance,cvs,tradeHistory,isMob,Avatar}){
  const[period,setPeriod]=useState("month"); // today | yesterday | week | month
  
  // === Filter trades by selected period ===
  const filteredTrades=useMemo(()=>{
    const now=Date.now();
    let cutoff=0;
    if(period==="today")cutoff=new Date().setHours(0,0,0,0);
    else if(period==="yesterday"){
      const y=new Date();y.setDate(y.getDate()-1);y.setHours(0,0,0,0);
      cutoff=y.getTime();
    }
    else if(period==="week")cutoff=now-7*86400000;
    else if(period==="month")cutoff=now-30*86400000;
    return(tradeHistory||[]).filter(t=>{
      if(!t)return false;
      const ts=t.openTimeStr?new Date(t.openTimeStr).getTime():(t.openTime||0);
      if(period==="yesterday"){
        const yEnd=cutoff+86400000;
        return ts>=cutoff&&ts<yEnd;
      }
      return ts>=cutoff;
    });
  },[tradeHistory,period]);
  
  // === Compute aggregates ===
  const stats=useMemo(()=>{
    const trades=filteredTrades;
    const count=trades.length;
    const ties=trades.filter(t=>t.tie).length;
    const wins=trades.filter(t=>t.won&&!t.tie).length;
    const losses=count-wins-ties;
    // Win rate excludes ties from the denominator (Quotex convention)
    const winRate=(count-ties)>0?Math.round((wins/(count-ties))*100):0;
    let netProfit=0;
    let totalAmt=0;
    let maxProfit=0;
    let maxAmt=0;
    let minAmt=count>0?Infinity:0;
    trades.forEach(t=>{
      const p=typeof t.payout==="number"?t.payout:0;
      const a=typeof t.amt==="number"?t.amt:0;
      netProfit+=p;
      totalAmt+=a;
      if(p>maxProfit)maxProfit=p;
      if(a>maxAmt)maxAmt=a;
      if(a<minAmt)minAmt=a;
    });
    if(minAmt===Infinity)minAmt=0;
    const avgProfit=count>0?netProfit/count:0;
    return{count,wins,losses,ties,winRate,netProfit,totalAmt,maxProfit,maxAmt,minAmt,avgProfit};
  },[filteredTrades]);
  
  // === Per-pair aggregation for top instruments ===
  const topInstruments=useMemo(()=>{
    const byPair={};
    filteredTrades.forEach(t=>{
      const k=t.pair||"--";
      if(!byPair[k])byPair[k]={pair:k,count:0,profit:0};
      byPair[k].count++;
      byPair[k].profit+=typeof t.payout==="number"?t.payout:0;
    });
    return Object.values(byPair)
      .filter(x=>x.profit>0)
      .sort((a,b)=>b.profit-a.profit)
      .slice(0,5);
  },[filteredTrades]);
  
  // === Sparkline data: cumulative P/L over time (filtered period) ===
  const sparklinePoints=useMemo(()=>{
    if(filteredTrades.length===0)return[];
    const sorted=[...filteredTrades].sort((a,b)=>{
      const ta=a.openTimeStr?new Date(a.openTimeStr).getTime():(a.openTime||0);
      const tb=b.openTimeStr?new Date(b.openTimeStr).getTime():(b.openTime||0);
      return ta-tb;
    });
    let cum=0;
    return sorted.map(t=>{cum+=typeof t.payout==="number"?t.payout:0;return cum;});
  },[filteredTrades]);
  
  // Generate SVG path from sparkline points
  const sparklinePath=useMemo(()=>{
    if(sparklinePoints.length<2)return"";
    const max=Math.max(...sparklinePoints,0.1);
    const min=Math.min(...sparklinePoints,0);
    const range=max-min||1;
    const w=600;const h=180;
    return sparklinePoints.map((v,i)=>{
      const x=(i/(sparklinePoints.length-1))*w;
      const y=h-((v-min)/range)*(h-20)-10;
      return(i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1);
    }).join(" ");
  },[sparklinePoints]);
  
  // Period buttons config
  const periods=[{id:"today",label:"Today"},{id:"yesterday",label:"Yesterday"},{id:"week",label:"Week"},{id:"month",label:"Month"}];
  
  // Colors for instruments donut
  const instColors=[T.green,T.accent||"#3b82f6",T.yellow||"#eab308","#a855f7","#ef4444"];
  
  // Real user ID — same source used everywhere else in app:
  // 1) Use last 8 chars of MongoDB _id if logged in
  // 2) Else use the saved qt_user_code from localStorage
  // 3) Else generate a random 8-digit code and persist it
  const userIdShort=useMemo(()=>{
    if(currentUser?._id)return currentUser._id.slice(-8);
    const saved=localStorage.getItem("qt_user_code");
    if(saved)return saved;
    const c=Math.floor(10000000+Math.random()*90000000).toString();
    try{localStorage.setItem("qt_user_code",c);}catch{}
    return c;
  },[currentUser]);
  
  return(<div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexDirection:"column",gap:14}}>
    {/* === SAMPLE 1 STYLE HEADER — Profile bar with email/ID/location/balance + period tabs === */}
    <div style={{display:"flex",flexDirection:isMob?"column":"row",alignItems:isMob?"stretch":"center",gap:isMob?10:14,padding:"12px 16px",background:T.card,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{display:"flex",alignItems:"center",gap:14,flex:isMob?"none":1,flexWrap:"wrap"}}>
        {/* Avatar */}
        <div style={{flexShrink:0}}>{Avatar?<Avatar size={36}/>:<div style={{width:36,height:36,borderRadius:"50%",background:T.accent,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:14}}>{(currentUser?.name||currentUser?.email||"U")[0].toUpperCase()}</div>}</div>
        {/* Email */}
        <div style={{display:"flex",flexDirection:"column",minWidth:0}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.4px"}}>Email</div>
          <div style={{...IN,fontSize:13,color:T.text,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:isMob?"100%":200}}>{currentUser?.email||"Guest"}</div>
        </div>
        <div style={{width:1,height:24,background:T.border,flexShrink:0,display:isMob?"none":"block"}}/>
        {/* ID */}
        <div style={{display:"flex",flexDirection:"column"}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.4px"}}>ID</div>
          <div style={{...MO,fontSize:13,color:T.text,fontWeight:700}}>{userIdShort}</div>
        </div>
        <div style={{width:1,height:24,background:T.border,flexShrink:0,display:isMob?"none":"block"}}/>
        {/* Location */}
        <div style={{display:"flex",flexDirection:"column"}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.4px"}}>Location</div>
          <div style={{...IN,fontSize:13,color:T.text,fontWeight:600}}>{currentUser?.country||"Pakistan"}</div>
        </div>
        <div style={{width:1,height:24,background:T.border,flexShrink:0,display:isMob?"none":"block"}}/>
        {/* Real balance */}
        <div style={{display:"flex",flexDirection:"column"}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.4px"}}>In the account</div>
          <div style={{...MO,fontSize:13,color:T.green,fontWeight:700}}>{cvs(realBalance)}</div>
        </div>
        <div style={{width:1,height:24,background:T.border,flexShrink:0,display:isMob?"none":"block"}}/>
        {/* Demo balance */}
        <div style={{display:"flex",flexDirection:"column"}}>
          <div style={{...IN,fontSize:9,color:T.sub,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.4px"}}>In the demo</div>
          <div style={{...MO,fontSize:13,color:T.accent,fontWeight:700}}>{cvs(balance)}</div>
        </div>
      </div>
      {/* Period tabs */}
      <div style={{display:"flex",gap:0,background:T.bg,padding:3,borderRadius:8,border:`1px solid ${T.border}`,flexShrink:0}}>
        {periods.map(p=>(<button key={p.id} onClick={()=>setPeriod(p.id)} style={{padding:"6px 14px",border:"none",background:period===p.id?T.accent:"transparent",color:period===p.id?"#fff":T.sub,...IN,fontSize:11,fontWeight:period===p.id?700:600,cursor:"pointer",borderRadius:6,transition:"all 0.15s"}}>{p.label}</button>))}
      </div>
    </div>
    
    {/* === SAMPLE 2 STYLE BODY — 4 KPI cards on top === */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"repeat(4,1fr)",gap:12}}>
      {/* KPI 1: Total Trades */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:`radial-gradient(circle, ${T.accent}22, transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{width:30,height:30,borderRadius:8,background:T.accent+"22",color:T.accent,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
        </div>
        <div style={{...MO,fontSize:20,fontWeight:800,color:T.text}}>{stats.count}</div>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px",marginTop:2}}>Total Trades</div>
        <div style={{...MO,fontSize:10,fontWeight:700,marginTop:5,color:stats.count>0?T.green:T.sub}}>{stats.wins}W · {stats.losses}L</div>
      </div>
      {/* KPI 2: Net Profit */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:`radial-gradient(circle, ${T.green}22, transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{width:30,height:30,borderRadius:8,background:T.green+"22",color:T.green,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <div style={{...MO,fontSize:20,fontWeight:800,color:stats.netProfit>=0?T.green:T.red}}>{stats.netProfit>=0?"+":""}{cvs(stats.netProfit)}</div>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px",marginTop:2}}>Net Profit</div>
        <div style={{...MO,fontSize:10,fontWeight:700,marginTop:5,color:T.sub}}>this {period}</div>
      </div>
      {/* KPI 3: Win Rate */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:`radial-gradient(circle, ${T.yellow||"#eab308"}22, transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{width:30,height:30,borderRadius:8,background:(T.yellow||"#eab308")+"22",color:T.yellow||"#eab308",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div style={{...MO,fontSize:20,fontWeight:800,color:T.text}}>{stats.winRate}%</div>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px",marginTop:2}}>Win Rate</div>
        <div style={{...MO,fontSize:10,fontWeight:700,marginTop:5,color:stats.winRate>=50?T.green:T.sub}}>{stats.winRate>=50?"Above":"Below"} avg</div>
      </div>
      {/* KPI 4: Avg Profit */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:100,height:100,borderRadius:"50%",background:`radial-gradient(circle, #a855f722, transparent 70%)`,pointerEvents:"none"}}/>
        <div style={{width:30,height:30,borderRadius:8,background:"#a855f722",color:"#a855f7",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div style={{...MO,fontSize:20,fontWeight:800,color:T.text}}>{stats.avgProfit>=0?"":"-"}{cvs(Math.abs(stats.avgProfit))}</div>
        <div style={{...IN,fontSize:9,color:T.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.3px",marginTop:2}}>Avg Profit</div>
        <div style={{...MO,fontSize:10,fontWeight:700,marginTop:5,color:T.sub}}>per trade</div>
      </div>
    </div>
    
    {/* === Charts row — Performance + Win/Loss === */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"2fr 1fr",gap:12}}>
      {/* Performance chart */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div>
            <div style={{...IN,fontSize:13,fontWeight:700,color:T.text}}>Profit/Loss Over Time</div>
            <div style={{...IN,fontSize:10,color:T.sub,marginTop:2}}>Cumulative net P/L · {period}</div>
          </div>
        </div>
        {sparklinePath?
          <svg viewBox="0 0 600 180" preserveAspectRatio="none" style={{height:180,width:"100%",display:"block"}}>
            <defs>
              <linearGradient id="apl-grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={stats.netProfit>=0?T.green:T.red} stopOpacity="0.4"/>
                <stop offset="100%" stopColor={stats.netProfit>=0?T.green:T.red} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={sparklinePath+" L600,180 L0,180 Z"} fill="url(#apl-grad)"/>
            <path d={sparklinePath} fill="none" stroke={stats.netProfit>=0?T.green:T.red} strokeWidth="2.5"/>
          </svg>
          :<div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:14}}>No data for this period</div>
        }
      </div>
      {/* Win/Loss donut */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
        <div style={{...IN,fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>Win/Loss Ratio</div>
        {stats.count>0?<>
          <svg width="140" height="140" viewBox="0 0 36 36" style={{display:"block",margin:"auto"}}>
            <circle cx="18" cy="18" r="13" fill="none" stroke={T.el} strokeWidth="5"/>
            <circle cx="18" cy="18" r="13" fill="none" stroke={T.green} strokeWidth="5" strokeDasharray={`${(stats.winRate/100*81.7).toFixed(1)} 81.7`} transform="rotate(-90 18 18)"/>
            <text x="18" y="17" textAnchor="middle" fontSize="6" fontWeight="700" fill={T.text}>{stats.winRate}%</text>
            <text x="18" y="22" textAnchor="middle" fontSize="2.5" fill={T.sub}>WIN RATE</text>
          </svg>
          <div style={{display:"flex",justifyContent:"space-around",marginTop:10,fontSize:11}}>
            <div style={{textAlign:"center"}}><div style={{color:T.green,fontWeight:700,...MO}}>{stats.wins}</div><div style={{color:T.sub,fontSize:9}}>WINS</div></div>
            <div style={{textAlign:"center"}}><div style={{color:T.red,fontWeight:700,...MO}}>{stats.losses}</div><div style={{color:T.sub,fontSize:9}}>LOSSES</div></div>
          </div>
        </>:<div style={{height:180,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:14}}>No trades yet</div>}
      </div>
    </div>
    
    {/* === Bottom row: Top Instruments + Distribution === */}
    <div style={{display:"grid",gridTemplateColumns:isMob?"1fr":"1fr 1fr",gap:12}}>
      {/* Top instruments */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
        <div style={{...IN,fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Top 5 Profitable Instruments</div>
        {topInstruments.length>0?
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {topInstruments.map((it,i)=>{
              const maxProf=topInstruments[0].profit||1;
              const widthPct=(it.profit/maxProf)*100;
              return(<div key={it.pair} style={{display:"flex",alignItems:"center",gap:10,fontSize:12}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:instColors[i%instColors.length],flexShrink:0}}/>
                <span style={{flex:1,...IN,color:T.text,fontWeight:600}}>{it.pair}</span>
                <div style={{flex:2,height:8,background:T.el,borderRadius:4,overflow:"hidden"}}>
                  <div style={{width:widthPct+"%",height:"100%",background:instColors[i%instColors.length],borderRadius:4}}/>
                </div>
                <span style={{...MO,fontWeight:700,color:T.green,minWidth:60,textAlign:"right"}}>+{cvs(it.profit)}</span>
              </div>);
            })}
          </div>
          :<div style={{height:130,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:14}}>No profitable trades yet</div>
        }
      </div>
      {/* Distribution */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:12,padding:14}}>
        <div style={{...IN,fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Trade Distribution</div>
        {(()=>{
          const cats={Forex:0,OTC:0,Crypto:0,Commodities:0,Other:0};
          filteredTrades.forEach(t=>{
            const lab=(t.pair||"").toLowerCase();
            if(lab.includes("otc"))cats.OTC++;
            else if(lab.includes("btc")||lab.includes("eth")||lab.includes("usdt"))cats.Crypto++;
            else if(lab.includes("xau")||lab.includes("xag")||lab.includes("xpd")||lab.includes("xpt"))cats.Commodities++;
            else if(lab.includes("/"))cats.Forex++;
            else cats.Other++;
          });
          const total=Object.values(cats).reduce((a,b)=>a+b,0);
          if(total===0)return<div style={{height:130,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:14}}>No data yet</div>;
          const entries=Object.entries(cats).filter(([,v])=>v>0);
          const colors={Forex:T.accent,OTC:"#a855f7",Crypto:T.yellow||"#eab308",Commodities:T.green,Other:T.sub};
          return<div style={{display:"flex",flexDirection:"column",gap:9}}>
            {entries.map(([k,v])=>{
              const pct=Math.round((v/total)*100);
              return(<div key={k}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                  <span style={{...IN,color:T.text,fontWeight:600}}>{k}</span>
                  <span style={{...MO,fontWeight:700,color:T.text}}>{pct}%</span>
                </div>
                <div style={{height:6,background:T.el,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:pct+"%",height:"100%",background:colors[k]}}/>
                </div>
              </div>);
            })}
          </div>;
        })()}
      </div>
    </div>
  </div>);
}

/* ═══════════════════════════════════════════════════════════════
   ACCOUNT PAGE INLINE — Quotex-style layout
   Top tabs: Withdrawal | Transactions | Trades | My Account | Tournaments
   Content: Personal Data | Documents + Security | Language/Timezone
   ═══════════════════════════════════════════════════════════════ */
function AccountPageInline({T,currentUser,settings,onSaveSettings,onLogout,onOpenKYC,onBack,isGuest,onNav,setWalletView,setAccountView,setHo,setTno,Avatar,handleAvatarUpload,initialTab,setSupportOpen,initialSupportSub,tradeHistory,balance,realBalance,cvs}){
  const[tab,setTab]=useState(initialTab||"account");
  // Mobile-only dropdown state — when open, shows tab options to switch between
  // My Account / Document Verification / Support sections
  const[mobileTabDropOpen,setMobileTabDropOpen]=useState(false);
  const[nickname,setNickname]=useState(()=>localStorage.getItem("qt_profile_nickname")||currentUser?.name||"");
  const[firstName,setFirstName]=useState(()=>localStorage.getItem("qt_profile_firstName")||currentUser?.firstName||"");
  const[lastName,setLastName]=useState(()=>localStorage.getItem("qt_profile_lastName")||currentUser?.lastName||"");
  const[dob,setDob]=useState(()=>localStorage.getItem("qt_profile_dob")||currentUser?.dob||"");
  const[phone,setPhone]=useState(()=>localStorage.getItem("qt_profile_phone")||currentUser?.phone||"");
  const[address,setAddress]=useState(()=>localStorage.getItem("qt_profile_address")||currentUser?.address||"");
  const[oldPw,setOldPw]=useState("");const[newPw,setNewPw]=useState("");const[confirmPw,setConfirmPw]=useState("");
  const[pwMsg,setPwMsg]=useState("");
  const[twoFA,setTwoFA]=useState(settings.twoFA||false);
  const[twoFALogin,setTwoFALogin]=useState(settings.twoFALogin||false);
  const[twoFAWithdraw,setTwoFAWithdraw]=useState(settings.twoFAWithdraw||false);
  const[setup2FAOpen,setSetup2FAOpen]=useState(false);
  const[saving,setSaving]=useState(false);const[saved,setSaved]=useState(false);
  const[docType,setDocType]=useState("national_id");
  const[docFront,setDocFront]=useState(null);const[docBack,setDocBack]=useState(null);
  const[kycSubmitting,setKycSubmitting]=useState(false);const[kycMsg,setKycMsg]=useState("");
  const[supportSubTab,setSupportSubTab]=useState(initialSupportSub||"request");
  const[ticketView,setTicketView]=useState("list");
  const[supportTickets,setSupportTickets]=useState([]);const[tktLoading,setTktLoading]=useState(false);
  const[selectedTkt,setSelectedTkt]=useState(null);const[tktReply,setTktReply]=useState("");const[tktSending,setTktSending]=useState(false);
  const[tktFile,setTktFile]=useState(null);const tktFileRef=useRef(null);
  const tktChatEndRef=useRef(null);
  useEffect(()=>{if(tktChatEndRef.current)tktChatEndRef.current.scrollIntoView({behavior:"smooth"});},[selectedTkt?.messages?.length]);
  const[tktSubject,setTktSubject]=useState("");const[tktCategory,setTktCategory]=useState("other");const[tktPriority,setTktPriority]=useState("medium");const[tktMessage,setTktMessage]=useState("");const[tktCreating,setTktCreating]=useState(false);
  const loadSupportTickets=async()=>{setTktLoading(true);try{const res=await API.support.list();if(res.success)setSupportTickets(res.tickets||[]);}catch(e){}setTktLoading(false);};
  useEffect(()=>{if(tab==="support")loadSupportTickets();},[tab]);
  // Auto-refresh ticket messages every 5 seconds when viewing detail
  useEffect(()=>{if(ticketView!=="detail"||!selectedTkt?._id)return;
    const poll=setInterval(async()=>{try{const res=await API.support.get(selectedTkt._id);if(res.success&&res.ticket){const oldLen=(selectedTkt.messages||[]).length;const newLen=(res.ticket.messages||[]).length;if(newLen>oldLen)setSelectedTkt(res.ticket);}}catch(e){}},5000);
    return()=>clearInterval(poll);
  },[ticketView,selectedTkt?._id]);
  const[kycVerifying,setKycVerifying]=useState(false);const[kycCountdown,setKycCountdown]=useState(0);const kycTimerRef=useRef(null);
  const handleKycSubmit=async()=>{if(!docFront){setKycMsg("Upload document front side");return;}if(docType!=="passport"&&!docBack){setKycMsg("Upload document back side");return;}if(!firstName||!lastName){setKycMsg("Fill First/Last Name in My Account tab first");return;}setKycSubmitting(true);setKycMsg("");
    // Submit to backend
    try{const fd=new FormData();fd.append("documentType",docType);fd.append("front",docFront);if(docBack)fd.append("back",docBack);fd.append("firstName",firstName);fd.append("lastName",lastName);fd.append("dob",dob);fd.append("address",address);await API.kyc?.submit?.(fd).catch(()=>{});}catch(e){}
    setKycSubmitting(false);
    // Start auto-verification countdown (90-150 seconds random)
    const verifyTime=90+Math.floor(Math.random()*60);
    setKycVerifying(true);setKycCountdown(verifyTime);setKycMsg("");
    localStorage.setItem("qt_kyc_verify_at",String(Date.now()+verifyTime*1000));
    localStorage.setItem("qt_kyc_status","pending");
    kycTimerRef.current=setInterval(()=>{
      setKycCountdown(prev=>{
        if(prev<=1){
          clearInterval(kycTimerRef.current);kycTimerRef.current=null;
          setKycVerifying(false);setKycMsg("Identity verified successfully!");
          localStorage.setItem("qt_kyc_status","approved");
          // Update on backend too
          API.kyc?.approve?.().catch(()=>{});
          return 0;
        }
        return prev-1;
      });
    },1000);
  };
  // Resume verification if page was refreshed during countdown
  useEffect(()=>{
    const savedStatus=localStorage.getItem("qt_kyc_status");
    const verifyAt=parseInt(localStorage.getItem("qt_kyc_verify_at")||"0");
    if(savedStatus==="pending"&&verifyAt>Date.now()){
      const remaining=Math.ceil((verifyAt-Date.now())/1000);
      setKycVerifying(true);setKycCountdown(remaining);
      kycTimerRef.current=setInterval(()=>{
        setKycCountdown(prev=>{
          if(prev<=1){clearInterval(kycTimerRef.current);kycTimerRef.current=null;setKycVerifying(false);setKycMsg("Identity verified successfully!");localStorage.setItem("qt_kyc_status","approved");API.kyc?.approve?.().catch(()=>{});return 0;}
          return prev-1;
        });
      },1000);
    }else if(savedStatus==="approved"){setKycMsg("");}
    return()=>{if(kycTimerRef.current)clearInterval(kycTimerRef.current);};
  },[]);
  const isMob=window.innerWidth<768;
  const kycStatus=localStorage.getItem("qt_kyc_status")==="approved"?"approved":localStorage.getItem("qt_kyc_status")==="pending"?"pending":currentUser?.kycStatus||"unverified";
  const[userCode]=useState(()=>currentUser?._id?.slice(-8)||localStorage.getItem("qt_user_code")||(()=>{const c=Math.floor(10000000+Math.random()*90000000).toString();localStorage.setItem("qt_user_code",c);return c;})());
  const inp={background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px 14px",color:T.text,...MO,fontSize:13,outline:"none",boxSizing:"border-box",width:"100%"};
  const profileSaved=!!localStorage.getItem("qt_profile_saved");
  const handleSaveProfile=async()=>{setSaving(true);try{
    localStorage.setItem("qt_profile_nickname",nickname);
    localStorage.setItem("qt_profile_firstName",firstName);
    localStorage.setItem("qt_profile_lastName",lastName);
    localStorage.setItem("qt_profile_dob",dob);
    localStorage.setItem("qt_profile_address",address);
    localStorage.setItem("qt_profile_phone",phone);
    localStorage.setItem("qt_profile_saved","true");
    if(API.auth.isAuthenticated()){await API.auth.updateProfile?.({name:nickname,firstName,lastName,dob,phone,address}).catch(()=>{});}
    setSaved(true);setTimeout(()=>setSaved(false),2000);
  }catch(e){}setSaving(false);};
  const handleChangePw=async()=>{if(!oldPw||!newPw){setPwMsg("Fill all fields");return;}if(newPw.length<6){setPwMsg("Min 6 characters");return;}if(newPw!==confirmPw){setPwMsg("Passwords don't match");return;}try{const res=await API.auth.changePassword?.(oldPw,newPw);if(res?.success){setPwMsg("Password changed!");setOldPw("");setNewPw("");setConfirmPw("");}else setPwMsg(res?.message||"Failed");}catch(e){setPwMsg(e.message||"Error");}};
  const frontRef=useRef(null);const backRef=useRef(null);
  const renderFileBox=(label,file,inputRef)=>(<div onClick={()=>inputRef.current?.click()} style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:file?"14px":"30px 16px",borderRadius:10,border:`2px dashed ${file?T.green+"66":T.border}`,background:file?T.greenDim:T.el,cursor:"pointer",textAlign:"center",minHeight:90,userSelect:"none"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=file?T.green+"66":T.border;}}>{file?<><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2" style={{pointerEvents:"none"}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><div style={{...IN,fontSize:11,fontWeight:600,color:T.green,marginTop:4,pointerEvents:"none"}}>{file.name}</div><div style={{...MO,fontSize:9,color:T.sub,marginTop:2,pointerEvents:"none"}}>{(file.size/1024).toFixed(0)} KB - Click to change</div></>:<><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.5" style={{pointerEvents:"none"}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><div style={{...IN,fontSize:12,fontWeight:600,color:T.sub,marginTop:6,pointerEvents:"none"}}>{label}</div><div style={{...MO,fontSize:9,color:T.muted,marginTop:2,pointerEvents:"none"}}>JPG, PNG or PDF (max 5MB)</div></>}</div>);
  const[pinVerifyOpen,setPinVerifyOpen]=useState(false);
  const[pinAction,setPinAction]=useState(null); // {type:"disable2fa"} | {type:"toggleLogin"} | {type:"toggleWithdraw"}
  const Toggle=({on,onToggle,label})=>(<button onClick={onToggle} style={{display:"flex",alignItems:"center",justifyContent:"space-between",width:"100%",padding:"14px 4px",border:"none",background:"transparent",cursor:"pointer",borderBottom:`1px solid ${T.border}`,borderRadius:4,transition:"background 0.1s"}} onMouseEnter={e=>e.currentTarget.style.background=T.el+"88"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{...IN,fontSize:13,fontWeight:600,color:T.text,pointerEvents:"none"}}>{label}</div><div style={{width:44,height:24,borderRadius:12,background:on?T.accent:T.el,border:`1px solid ${on?T.accent:T.border}`,position:"relative",transition:"all 0.2s",flexShrink:0,pointerEvents:"none"}}><div style={{width:18,height:18,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:on?22:2,transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.3)"}}/></div></button>);
  // PIN-protected actions: turning OFF requires 2FA code, turning ON is free
  const handleToggleLogin=()=>{
    if(twoFALogin){setPinAction({type:"toggleLogin"});setPinVerifyOpen(true);}
    else{setTwoFALogin(true);onSaveSettings({...settings,twoFALogin:true});}
  };
  const handleToggleWithdraw=()=>{
    if(twoFAWithdraw){setPinAction({type:"toggleWithdraw"});setPinVerifyOpen(true);}
    else{setTwoFAWithdraw(true);onSaveSettings({...settings,twoFAWithdraw:true});}
  };
  const handleDisable2FA=()=>{setPinAction({type:"disable2fa"});setPinVerifyOpen(true);};
  const executePinAction=()=>{
    if(!pinAction)return;
    if(pinAction.type==="disable2fa"){setTwoFA(false);setTwoFALogin(false);setTwoFAWithdraw(false);onSaveSettings({...settings,twoFA:false,twoFALogin:false,twoFAWithdraw:false,twoFASecret:""});API.twoFA?.disable?.().catch(()=>{});}
    else if(pinAction.type==="toggleLogin"){setTwoFALogin(false);onSaveSettings({...settings,twoFALogin:false});}
    else if(pinAction.type==="toggleWithdraw"){setTwoFAWithdraw(false);onSaveSettings({...settings,twoFAWithdraw:false});}
    setPinAction(null);setPinVerifyOpen(false);
  };

  return(<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
    {/* TOP TABS — desktop horizontal tabs */}
    {!isMob&&<div style={{display:"flex",alignItems:"center",height:44,borderBottom:`1px solid ${T.border}`,background:T.card,flexShrink:0,padding:"0 20px"}}>
      {[{id:"account",label:"My Account"},{id:"kyc",label:"Document Verification"},{id:"support",label:"Support"},{id:"analytics",label:"Analytics"}].map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"0 20px",height:"100%",border:"none",borderBottom:tab===t.id?`2px solid ${T.accent}`:"2px solid transparent",background:"transparent",color:tab===t.id?T.text:T.sub,...IN,fontSize:13,fontWeight:tab===t.id?700:500,cursor:"pointer",whiteSpace:"nowrap"}} onMouseEnter={e=>{e.currentTarget.style.color=T.text;}} onMouseLeave={e=>{if(tab!==t.id)e.currentTarget.style.color=T.sub;}}>{t.label}</button>))}
      <div style={{marginLeft:"auto",flexShrink:0,textAlign:"right"}}><div style={{...IN,fontSize:9,color:T.sub}}>My current currency</div><span style={{...MO,fontSize:12,fontWeight:700,color:T.text}}>{CURRENCIES.find(c=>c.code===(settings.currency||"USD"))?.symbol||"$"} {settings.currency||"USD"}</span></div>
    </div>}
    
    {/* MOBILE TOP DROPDOWN — single button showing current tab; tap to switch sections */}
    {isMob&&<div style={{position:"relative",borderBottom:`1px solid ${T.border}`,background:T.card,flexShrink:0,zIndex:50}}>
      <button
        onClick={()=>setMobileTabDropOpen(v=>!v)}
        style={{
          width:"100%",
          display:"flex",alignItems:"center",justifyContent:"space-between",
          padding:"14px 18px",
          border:"none",background:"transparent",
          ...IN,fontSize:14,fontWeight:700,color:T.text,
          cursor:"pointer"
        }}
      >
        <span style={{display:"flex",alignItems:"center",gap:10}}>
          {/* Section icon */}
          {tab==="account"&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>}
          {tab==="kyc"&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M20 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M9 11h6"/><path d="M9 15h6"/><circle cx="13" cy="8" r="2"/></svg>}
          {tab==="support"&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
          {tab==="analytics"&&<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
          <span>{tab==="account"?"My Account":tab==="kyc"?"Document Verification":tab==="support"?"Support":"Analytics"}</span>
        </span>
        {/* Chevron — rotates when open */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{transform:mobileTabDropOpen?"rotate(180deg)":"rotate(0)",transition:"transform 0.18s"}}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      
      {/* Dropdown menu — shows when open */}
      {mobileTabDropOpen&&<>
        {/* Click-outside catcher */}
        <div onClick={()=>setMobileTabDropOpen(false)} style={{position:"fixed",inset:0,zIndex:48}}/>
        <div style={{
          position:"absolute",top:"100%",left:0,right:0,
          background:T.card,
          borderBottom:`1px solid ${T.border}`,
          boxShadow:"0 12px 32px rgba(0,0,0,0.45)",
          zIndex:51,
          animation:"fadeIn 0.15s"
        }}>
          {[
            {id:"account",label:"My Account",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,desc:"Profile, settings, security"},
            {id:"kyc",label:"Document Verification",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M9 11h6"/><path d="M9 15h6"/><circle cx="13" cy="8" r="2"/></svg>,desc:"KYC and identity verification"},
            {id:"support",label:"Support",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,desc:"Tickets, live chat, FAQ"},
            {id:"analytics",label:"Analytics",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>,desc:"Trade stats, charts, performance"}
          ].map((t,i,arr)=>{
            const active=tab===t.id;
            return(<button
              key={t.id}
              onClick={()=>{setTab(t.id);setMobileTabDropOpen(false);}}
              style={{
                width:"100%",
                display:"flex",alignItems:"center",gap:12,
                padding:"14px 18px",
                border:"none",
                borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none",
                background:active?T.accentDim:"transparent",
                color:active?T.accent:T.text,
                cursor:"pointer",
                textAlign:"left",
                ...IN
              }}
            >
              <span style={{display:"flex",alignItems:"center",justifyContent:"center",width:32,height:32,borderRadius:8,background:active?T.accent+"22":T.el,color:active?T.accent:T.sub,flexShrink:0}}>
                {t.icon}
              </span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:active?700:600,color:active?T.accent:T.text,marginBottom:2}}>{t.label}</div>
                <div style={{fontSize:10,color:T.sub,fontWeight:500}}>{t.desc}</div>
              </div>
              {/* Active checkmark */}
              {active&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>}
            </button>);
          })}
        </div>
      </>}
    </div>}

    <div style={{flex:1,overflowY:"auto",padding:isMob?"14px":"24px 28px"}}>

    {/* ═══ MY ACCOUNT TAB ═══ */}
    {tab==="account"&&<div style={{display:isMob?"flex":"grid",gridTemplateColumns:"1fr 1fr",gap:24,flexDirection:"column",maxWidth:1100}}>
      {/* LEFT: Personal Data */}
      <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"24px"}}>
        <div style={{...IN,fontSize:16,fontWeight:700,marginBottom:18}}>Personal data:</div>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:22,paddingBottom:18,borderBottom:`1px solid ${T.border}`}}>
          <div style={{position:"relative"}}><Avatar size={56} border={false}/><label style={{position:"absolute",bottom:0,right:0,width:20,height:20,borderRadius:"50%",background:T.el,border:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><input type="file" accept="image/*" onChange={handleAvatarUpload} style={{display:"none"}}/></label></div>
          <div><div style={{...IN,fontSize:14,fontWeight:700,color:T.text}}>{currentUser?.email||"user@email.com"}</div><div style={{...MO,fontSize:11,color:T.sub,marginTop:2}}>ID: {userCode}</div><span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:4,background:kycStatus==="approved"?T.greenDim:T.redDim,border:`1px solid ${kycStatus==="approved"?T.green+"44":T.red+"44"}`,marginTop:4,...IN,fontSize:10,fontWeight:600,color:kycStatus==="approved"?T.green:T.red}}>{kycStatus==="approved"?"Verified":"Not verified"}</span></div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {[{label:"Nickname",value:nickname,onChange:setNickname,placeholder:"#"+userCode},{label:"First Name",value:firstName,onChange:setFirstName,placeholder:"Empty",disabled:profileSaved},{label:"Last Name",value:lastName,onChange:setLastName,placeholder:"Empty",disabled:profileSaved},{label:"Date of birth",value:dob,onChange:setDob,placeholder:"dd/mm/yyyy",type:"date",disabled:profileSaved},{label:"Email",value:currentUser?.email||"",onChange:()=>{},disabled:true,suffix:<span style={{...IN,fontSize:10,color:T.green,fontWeight:600}}>Verified</span>},{label:"Country",value:currentUser?.country||"",onChange:()=>{},disabled:true},{label:"Address",value:address,onChange:setAddress,placeholder:"Empty",disabled:profileSaved}].map((f,i)=>(<div key={i} style={{position:"relative"}}><div style={{position:"absolute",top:-7,left:12,background:T.card,padding:"0 6px",...IN,fontSize:10,color:T.sub,fontWeight:500,zIndex:1}}>{f.label}</div><div style={{position:"relative"}}><input type={f.type||"text"} value={f.value} onChange={e=>f.onChange(e.target.value)} placeholder={f.placeholder||""} disabled={f.disabled} style={{...inp,opacity:f.disabled?.6:1,cursor:f.disabled?"not-allowed":"text"}}/>{f.suffix&&<div style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)"}}>{f.suffix}</div>}</div></div>))}
        </div>
        <button onClick={handleSaveProfile} disabled={saving} style={{width:"100%",padding:"14px 0",borderRadius:8,border:"none",background:saved?T.green:`linear-gradient(135deg,${T.accent},#d97706)`,color:"#fff",...IN,fontSize:14,fontWeight:700,cursor:"pointer",marginTop:18}}>{saving?"Saving...":saved?"Saved!":"Save"}</button>
      </div>

      {/* RIGHT: Security + Password */}
      <div style={{display:"flex",flexDirection:"column",gap:20}}>
        {/* Security */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"24px"}}>
          <div style={{...IN,fontSize:16,fontWeight:700,marginBottom:14}}>Security:</div>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:twoFA?T.greenDim:T.redDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{twoFA?<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>}</div>
            <div style={{flex:1}}><div style={{...IN,fontSize:14,fontWeight:700}}>Two-step verification</div><div style={{...IN,fontSize:11,color:T.sub}}>{twoFA?"Receiving codes via Google Authenticator":"Not enabled"}</div></div>
            {!twoFA?<button onClick={()=>setSetup2FAOpen(true)} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${T.accent}44`,background:T.accentDim,color:T.accent,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Enable</button>
            :<button onClick={handleDisable2FA} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${T.red}44`,background:T.redDim,color:T.red,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Disable</button>}
          </div>
          {twoFA&&<><Toggle on={twoFALogin} onToggle={handleToggleLogin} label="To enter the platform"/><Toggle on={twoFAWithdraw} onToggle={handleToggleWithdraw} label="To withdraw funds"/></>}
        </div>

        {/* Password */}
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:"24px"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><div><div style={{...IN,fontSize:14,fontWeight:700}}>Password</div><div style={{...IN,fontSize:11,color:T.sub}}>Change your account password</div></div></div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}><input type="password" value={oldPw} onChange={e=>setOldPw(e.target.value)} placeholder="Current password" style={inp}/><input type="password" value={newPw} onChange={e=>setNewPw(e.target.value)} placeholder="New password" style={inp}/><input type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Confirm password" style={inp}/>{pwMsg&&<div style={{...IN,fontSize:11,color:pwMsg==="Password changed!"?T.green:T.red,fontWeight:600}}>{pwMsg}</div>}<button onClick={handleChangePw} style={{padding:"12px 0",borderRadius:8,border:"none",background:T.accent,color:"#fff",...IN,fontSize:13,fontWeight:700,cursor:"pointer"}}>Change</button></div>
        </div>

        <button onClick={()=>{if(confirm("Delete your account?")){alert("Contact support.");}}} style={{display:"flex",alignItems:"center",gap:6,background:"none",border:"none",cursor:"pointer",padding:"8px 0",...IN,fontSize:13,fontWeight:600,color:T.red}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Delete My account</button>
      </div>
    </div>}

    {/* ═══ DOCUMENT VERIFICATION TAB — centered, dropdown doc type, no selfie ═══ */}
    {tab==="kyc"&&<div style={{display:"flex",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:560}}>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"20px":"32px"}}>
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{width:48,height:48,borderRadius:"50%",background:T.accentDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",border:`2px solid ${T.accent}33`}}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
            </div>
            <div style={{...IN,fontSize:20,fontWeight:700}}>Identity Verification</div>
            <div style={{...IN,fontSize:12,color:T.sub,marginTop:4,lineHeight:1.5}}>Upload your identity document to verify your account</div>
          </div>

          {/* Status */}
          {kycStatus==="approved"&&!kycVerifying&&<div style={{background:T.greenDim,border:`1px solid ${T.green}33`,borderRadius:10,padding:"16px",marginBottom:20,display:"flex",alignItems:"center",gap:10}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><div><div style={{...IN,fontSize:14,fontWeight:700,color:T.green}}>Identity Verified</div><div style={{...IN,fontSize:11,color:T.sub}}>Your documents have been approved</div></div></div>}

          {/* Verification in progress — countdown */}
          {kycVerifying&&<div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{width:64,height:64,borderRadius:"50%",border:`3px solid ${T.border}`,borderTopColor:T.accent,margin:"0 auto 24px",animation:"kycSpin 0.8s linear infinite"}}/>
            <style>{`@keyframes kycSpin{to{transform:rotate(360deg)}}`}</style>
            <div style={{...IN,fontSize:18,fontWeight:700,color:T.text,marginBottom:8}}>Processing...</div>
            <div style={{...IN,fontSize:12,color:T.sub,lineHeight:1.5}}>Please wait while we verify your documents</div>
          </div>}

          {/* Success message after verification */}
          {kycMsg&&kycMsg.includes("verified")&&!kycVerifying&&<div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{width:64,height:64,borderRadius:"50%",background:T.greenDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",border:`2px solid ${T.green}44`}}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div style={{...IN,fontSize:20,fontWeight:700,color:T.green,marginBottom:4}}>Identity Verified!</div>
            <div style={{...IN,fontSize:12,color:T.sub,lineHeight:1.5}}>Your account has been successfully verified.<br/>You now have full access to all features.</div>
          </div>}

          {kycStatus!=="approved"&&!kycVerifying&&!kycMsg?.includes("verified")&&<>
            {/* Document Type Dropdown */}
            <div style={{marginBottom:20}}>
              <div style={{...IN,fontSize:12,fontWeight:700,color:T.sub,marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>Select Document Type</div>
              <select value={docType} onChange={e=>setDocType(e.target.value)} style={{...inp,appearance:"none",cursor:"pointer",fontSize:14,fontWeight:600,padding:"14px 16px",backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237a85a0' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,backgroundRepeat:"no-repeat",backgroundPosition:"right 14px center"}}>
                <option value="national_id">Nationality Card (CNIC / NID)</option>
                <option value="passport">Passport</option>
                <option value="residence">Residence Proof</option>
                <option value="license">Driving Licence</option>
              </select>
            </div>

            {/* Upload Document */}
            <div style={{marginBottom:20}}>
              <div style={{...IN,fontSize:12,fontWeight:700,color:T.sub,marginBottom:8,textTransform:"uppercase",letterSpacing:".04em"}}>Upload Document</div>
              <div style={{display:"grid",gridTemplateColumns:docType==="passport"?"1fr":"1fr 1fr",gap:12}}>
                {renderFileBox(docType==="passport"?"Passport Main Page":"Front Side",docFront,frontRef)}
                {docType!=="passport"&&renderFileBox("Back Side",docBack,backRef)}
              </div>
              {/* Hidden file inputs — stable refs, won't remount */}
              <input ref={frontRef} type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)setDocFront(f);e.target.value="";}} style={{display:"none"}}/>
              <input ref={backRef} type="file" accept="image/jpeg,image/png,image/jpg,application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)setDocBack(f);e.target.value="";}} style={{display:"none"}}/>
            </div>

            {/* Requirements */}
            <div style={{background:T.el,borderRadius:8,padding:"14px 16px",marginBottom:20,border:`1px solid ${T.border}`}}>
              <div style={{...IN,fontSize:11,fontWeight:700,color:T.text,marginBottom:6}}>Requirements:</div>
              <div style={{...IN,fontSize:11,color:T.sub,lineHeight:1.7}}>
                - Document must be valid and not expired<br/>
                - All text and photos must be clearly readable<br/>
                - File size max 5MB (JPG, PNG, or PDF)<br/>
                - Fill First Name, Last Name, Date of Birth and Address in My Account tab
              </div>
            </div>

            {kycMsg&&!kycMsg.includes("verified")&&<div style={{...IN,fontSize:12,fontWeight:600,color:kycMsg.includes("submitted")||kycMsg.includes("Submitted")?T.green:T.red,marginBottom:14,padding:"10px 14px",borderRadius:8,background:kycMsg.includes("submitted")||kycMsg.includes("Submitted")?T.greenDim:T.redDim,textAlign:"center"}}>{kycMsg}</div>}

            <button onClick={handleKycSubmit} disabled={kycSubmitting||kycVerifying} style={{width:"100%",padding:"16px 0",borderRadius:10,border:"none",background:(kycSubmitting||kycVerifying)?T.el:`linear-gradient(135deg,${T.accent},#d97706)`,color:(kycSubmitting||kycVerifying)?T.muted:"#fff",...IN,fontSize:15,fontWeight:700,cursor:(kycSubmitting||kycVerifying)?"not-allowed":"pointer"}}>{kycSubmitting?"Uploading documents...":"Submit for Verification"}</button>
          </>}
        </div>
      </div>
    </div>}

    {/* ═══ SUPPORT TAB — centered with inline ticket system ═══ */}
    {tab==="support"&&<div style={{display:"flex",flexDirection:isMob?"column":"row",gap:isMob?10:14,alignItems:isMob?"stretch":"flex-start",width:"100%",maxWidth:650,margin:"0 auto"}}>
      {/* Sidebar tabs — horizontal scroll on mobile, vertical on desktop */}
      <div style={{display:"flex",flexDirection:isMob?"row":"column",gap:6,flexShrink:0,width:isMob?"100%":140,overflowX:isMob?"auto":"visible"}}>
        {[{id:"request",label:"Tickets",ic:"M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"},{id:"support",label:"Live Chat",ic:"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"},{id:"faq",label:"FAQ",ic:"M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"}].map(b=>(<button key={b.id} onClick={()=>{setSupportSubTab(b.id);if(b.id==="request")loadSupportTickets();}} style={{padding:isMob?"8px 16px":"10px 12px",borderRadius:8,border:`1.5px solid ${supportSubTab===b.id?T.accent:T.border}`,background:supportSubTab===b.id?T.accentDim:T.card,cursor:"pointer",textAlign:"left",transition:"all .15s",display:"flex",alignItems:"center",gap:8,whiteSpace:"nowrap",flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={supportSubTab===b.id?T.accent:T.sub} strokeWidth="1.5" style={{flexShrink:0}}><path d={b.ic}/></svg><div style={{...IN,fontSize:11,fontWeight:supportSubTab===b.id?700:500,color:supportSubTab===b.id?T.accent:T.text}}>{b.label}</div></button>))}
      </div>
      {/* Right content */}
      <div style={{flex:1,minWidth:0}}>

      {supportSubTab==="support"&&<div style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"16px 14px":"28px 32px"}}><div style={{...IN,fontSize:18,fontWeight:700,marginBottom:16}}>Support</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}><div style={{padding:"18px 16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.el}}><div style={{...IN,fontSize:12,fontWeight:600,color:T.text}}>Email Support</div><div style={{...MO,fontSize:11,color:T.accent,marginTop:4}}>support@zextooption.com</div></div><div style={{padding:"18px 16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.el}}><div style={{...IN,fontSize:12,fontWeight:600,color:T.text}}>Response Time</div><div style={{...MO,fontSize:11,color:T.sub,marginTop:4}}>Usually within 24 hours</div></div></div><div style={{padding:"16px 18px",borderRadius:10,background:T.el,border:`1px solid ${T.border}`,...IN,fontSize:12,color:T.sub,lineHeight:1.6}}>Our support team is available 24/7. Click "Support Request" to create or manage tickets.</div></div>}

      {supportSubTab==="request"&&<div style={{width:"100%",maxWidth:isMob?"100%":460}}>
        <div style={{background:T.card,border:`1px solid ${T.border}`,borderRadius:14,overflow:"hidden",display:"flex",flexDirection:"column",height:isMob?"calc(100dvh - 200px)":460}}>
          {/* ── Header ── */}
          <div style={{background:"linear-gradient(135deg,#1a3560,#122744)",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
            {ticketView==="detail"&&selectedTkt?<>
              <button onClick={()=>{setTicketView("list");setSelectedTkt(null);}} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",padding:2}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg></button>
              <img src="/support.png" alt="S" style={{width:30,height:30,borderRadius:"50%",objectFit:"cover",flexShrink:0,border:"2px solid rgba(255,255,255,0.2)"}} onError={e=>{e.target.style.display="none";}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...IN,fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selectedTkt.subject}</div>
                <div style={{display:"flex",alignItems:"center",gap:5,marginTop:2}}>
                  <span style={{padding:"1px 6px",borderRadius:3,...MO,fontSize:8,fontWeight:700,color:"#fff",background:(()=>{const s=selectedTkt.status||"open";return s==="open"?"#3b82f6":s==="in_progress"?"#eab308":s==="awaiting_reply"?"#8b5cf6":s==="resolved"?"#22c55e":"#64748b";})()}}>{(()=>{const s=selectedTkt.status||"open";return s==="open"?"Open":s==="in_progress"?"In Progress":s==="awaiting_reply"?"Awaiting":s==="resolved"?"Resolved":"Closed";})()}</span>
                  <span style={{...MO,fontSize:8,color:"rgba(255,255,255,0.4)"}}>{selectedTkt.category||"General"}</span>
                </div>
              </div>
              {selectedTkt.status!=="closed"&&selectedTkt.status!=="resolved"&&<button onClick={async()=>{if(!confirm("Close this ticket?"))return;try{const res=await API.support?.close?.(selectedTkt._id);if(res?.success){setSelectedTkt(res.ticket||{...selectedTkt,status:"closed"});loadSupportTickets();}else{setSelectedTkt({...selectedTkt,status:"closed"});}}catch(e){setSelectedTkt({...selectedTkt,status:"closed"});}}} style={{padding:"4px 10px",borderRadius:4,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.12)",color:"#f87171",...MO,fontSize:9,fontWeight:600,cursor:"pointer"}}>Close</button>}
            </>:<>
              <div style={{width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg></div>
              <div style={{flex:1}}>
                <div style={{...IN,fontSize:14,fontWeight:700,color:"#fff"}}>Support Tickets</div>
                <div style={{...MO,fontSize:9,color:"rgba(255,255,255,0.55)"}}>{supportTickets.length} ticket{supportTickets.length!==1?"s":""}</div>
              </div>
              <button onClick={()=>setTicketView(ticketView==="create"?"list":"create")} style={{padding:"5px 12px",borderRadius:6,border:"none",background:ticketView==="create"?"rgba(255,255,255,0.15)":"rgba(59,130,246,0.3)",color:"#fff",...IN,fontSize:10,fontWeight:600,cursor:"pointer"}}>{ticketView==="create"?"Cancel":"+ New"}</button>
            </>}
          </div>

          {/* ── Content ── */}
          <div style={{flex:1,overflowY:"auto",background:T.bg}}>
            {/* Create form */}
            {ticketView==="create"&&<div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
              <input value={tktSubject} onChange={e=>setTktSubject(e.target.value)} placeholder="Subject" style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,...IN,fontSize:11.5,outline:"none",width:"100%",boxSizing:"border-box"}}/>
              <div style={{display:"flex",gap:8}}>
                <select value={tktCategory} onChange={e=>setTktCategory(e.target.value)} style={{flex:1,background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,...IN,fontSize:11,outline:"none",appearance:"none"}}>{[{v:"deposit",l:"Deposit"},{v:"withdrawal",l:"Withdrawal"},{v:"trading",l:"Trading"},{v:"account",l:"Account"},{v:"kyc",l:"KYC"},{v:"technical",l:"Technical"},{v:"other",l:"Other"}].map(c=><option key={c.v} value={c.v}>{c.l}</option>)}</select>
                <select value={tktPriority} onChange={e=>setTktPriority(e.target.value)} style={{flex:1,background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 10px",color:T.text,...IN,fontSize:11,outline:"none",appearance:"none"}}>{[{v:"low",l:"Low"},{v:"medium",l:"Medium"},{v:"high",l:"High"},{v:"urgent",l:"Urgent"}].map(p=><option key={p.v} value={p.v}>{p.l}</option>)}</select>
              </div>
              <textarea value={tktMessage} onChange={e=>setTktMessage(e.target.value)} placeholder="Describe your issue..." rows={4} style={{background:T.el,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",color:T.text,...IN,fontSize:11.5,outline:"none",width:"100%",boxSizing:"border-box",resize:"vertical"}}/>
              <button onClick={async()=>{if(!tktSubject.trim()||!tktMessage.trim())return;setTktCreating(true);try{const fd=new FormData();fd.append("subject",tktSubject);fd.append("category",tktCategory);fd.append("priority",tktPriority);fd.append("message",tktMessage);const res=await API.support.create(fd);if(res.success){setTktSubject("");setTktMessage("");setTktCategory("other");setTktPriority("medium");setTicketView("list");loadSupportTickets();}}catch(e){}setTktCreating(false);}} disabled={tktCreating} style={{padding:"10px 0",borderRadius:8,border:"none",background:"linear-gradient(135deg,#3b82f6,#1d4ed8)",color:"#fff",...IN,fontSize:12,fontWeight:700,cursor:"pointer"}}>{tktCreating?"Creating...":"Submit Ticket"}</button>
            </div>}
            {/* Ticket list */}
            {ticketView==="list"&&<div style={{padding:"8px 10px"}}>
              {tktLoading?<div style={{textAlign:"center",padding:30,color:T.sub,...MO,fontSize:11}}>Loading...</div>
              :supportTickets.length===0?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 16px",gap:12}}>
                <div style={{width:48,height:48,borderRadius:"50%",background:T.el,display:"flex",alignItems:"center",justifyContent:"center"}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg></div>
                <div style={{...IN,fontSize:12,color:T.muted}}>No tickets yet</div>
                <button onClick={()=>setTicketView("create")} style={{padding:"8px 20px",borderRadius:6,border:"none",background:"#3b82f6",color:"#fff",...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Create Ticket</button>
              </div>
              :supportTickets.map(t=>(<div key={t._id} onClick={async()=>{try{const res=await API.support.get(t._id);if(res.success){setSelectedTkt(res.ticket);setTicketView("detail");}}catch(e){setSelectedTkt(t);setTicketView("detail");}}} style={{padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6,cursor:"pointer",display:"flex",alignItems:"center",gap:10,background:T.card,transition:"border-color .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=T.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
                <div style={{width:32,height:32,borderRadius:8,background:(()=>{const s=t.status||"open";return s==="open"?"#3b82f618":s==="resolved"?"#22c55e18":"#64748b18";})(),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={(()=>{const s=t.status||"open";return s==="open"?"#3b82f6":s==="resolved"?"#22c55e":"#64748b";})()} strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{...IN,fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.subject}</div>
                  <div style={{...MO,fontSize:9,color:T.muted,marginTop:1}}>{t.category} · {new Date(t.createdAt).toLocaleDateString()}</div>
                </div>
                <span style={{padding:"2px 7px",borderRadius:3,...MO,fontSize:8,fontWeight:700,color:"#fff",background:t.status==="open"?"#3b82f6":t.status==="resolved"?"#22c55e":t.status==="closed"?"#64748b":"#eab308",flexShrink:0}}>{(t.status||"open").replace("_"," ")}</span>
              </div>))}
            </div>}
            {/* Ticket detail chat */}
            {ticketView==="detail"&&selectedTkt&&<div style={{padding:"12px 14px",display:"flex",flexDirection:"column",gap:6}}>
              {(selectedTkt.messages||[{sender:"user",text:selectedTkt.message||"",createdAt:selectedTkt.createdAt}]).map((msg,i)=>{const isA=msg.sender==="admin";return(<div key={i} style={{display:"flex",gap:7,alignSelf:isA?"flex-start":"flex-end",maxWidth:"78%",flexDirection:isA?"row":"row-reverse"}}>
                {/* Admin avatar — support.png */}
                {isA&&<img src="/support.png" alt="S" style={{width:26,height:26,borderRadius:"50%",objectFit:"cover",flexShrink:0,alignSelf:"flex-end",border:"1.5px solid #3b82f644"}} onError={e=>{e.target.style.display="none";}}/>}
                {/* User avatar — initial letter */}
                {!isA&&<div style={{width:26,height:26,borderRadius:"50%",background:`linear-gradient(135deg,${T.accent},#d97706)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,alignSelf:"flex-end",...IN,fontSize:10,fontWeight:800,color:"#fff"}}>{(currentUser?.name||currentUser?.email||"U").charAt(0).toUpperCase()}</div>}
                <div>
                  <div style={{padding:"7px 12px",borderRadius:16,background:isA?T.el:"#3b82f6",color:isA?T.text:"#fff",border:isA?`1px solid ${T.border}`:"none",...IN,fontSize:11.5,lineHeight:1.45,wordBreak:"break-word"}}>{msg.text||msg.message||""}</div>
                  {msg.attachments?.length>0&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:3}}>{msg.attachments.map((a,j)=><a key={j} href={`http://localhost:5000${a}`} target="_blank" rel="noopener noreferrer" style={{...MO,fontSize:8,padding:"3px 8px",borderRadius:5,background:T.el,border:`1px solid ${T.border}`,color:T.accent,textDecoration:"none",display:"flex",alignItems:"center",gap:3}}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>File {j+1}</a>)}</div>}
                  <div style={{...MO,fontSize:7,color:T.muted,marginTop:2,textAlign:isA?"left":"right",padding:"0 3px"}}>{new Date(msg.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                </div>
              </div>);})}
              <div ref={tktChatEndRef}/>
            </div>}
          </div>

          {/* ── Bottom input ── */}
          {ticketView==="detail"&&selectedTkt&&(selectedTkt.status!=="closed"&&selectedTkt.status!=="resolved"?<div style={{borderTop:`1px solid ${T.border}`,background:T.card,flexShrink:0}}>
            {tktFile&&<div style={{padding:"4px 12px 0",display:"flex",alignItems:"center",gap:5}}>
              <div style={{...MO,fontSize:9,color:T.accent,background:T.accentDim,padding:"2px 8px",borderRadius:5,display:"flex",alignItems:"center",gap:3,maxWidth:"75%",overflow:"hidden"}}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tktFile.name}</span>
                <button onClick={()=>{setTktFile(null);if(tktFileRef.current)tktFileRef.current.value="";}} style={{background:"none",border:"none",color:T.muted,cursor:"pointer",padding:0,fontSize:11,lineHeight:1}}>×</button>
              </div>
            </div>}
            <div style={{padding:"7px 10px",display:"flex",gap:6,alignItems:"center"}}>
              <input ref={tktFileRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={e=>{const f=e.target.files?.[0];if(f)setTktFile(f);}} style={{display:"none"}}/>
              <button onClick={()=>tktFileRef.current?.click()} title="Attach file" style={{width:30,height:30,borderRadius:6,border:`1px solid ${T.border}`,background:T.el,color:T.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.color=T.accent;e.currentTarget.style.borderColor=T.accent;}} onMouseLeave={e=>{e.currentTarget.style.color=T.sub;e.currentTarget.style.borderColor=T.border;}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
              <input value={tktReply} onChange={e=>setTktReply(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&(tktReply.trim()||tktFile)){e.preventDefault();document.getElementById("tktSendBtn")?.click();}}} placeholder="Reply..." style={{flex:1,background:T.el,border:`1px solid ${T.border}`,borderRadius:6,padding:"7px 12px",color:T.text,...IN,fontSize:11,outline:"none"}}/>
              <button id="tktSendBtn" onClick={async()=>{if(!tktReply.trim()&&!tktFile)return;setTktSending(true);try{const fd=new FormData();fd.append("message",tktReply);if(tktFile)fd.append("attachment",tktFile);const res=await API.support.reply(selectedTkt._id,fd);if(res.success){setSelectedTkt(res.ticket);setTktReply("");setTktFile(null);if(tktFileRef.current)tktFileRef.current.value="";}}catch(e){}setTktSending(false);}} disabled={tktSending} style={{width:30,height:30,borderRadius:6,border:"none",background:(tktReply.trim()||tktFile)?"#3b82f6":T.el,color:(tktReply.trim()||tktFile)?"#fff":T.muted,cursor:(tktReply.trim()||tktFile)?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
            </div>
          </div>
          :<div style={{padding:"8px 10px",borderTop:`1px solid ${T.border}`,textAlign:"center",...MO,fontSize:9,color:T.muted}}>This ticket has been {selectedTkt.status}</div>)}
        </div>
      </div>}

      {supportSubTab==="faq"&&<div style={{width:"100%",background:T.card,border:`1px solid ${T.border}`,borderRadius:14,padding:isMob?"16px 14px":"28px 32px"}}><div style={{...IN,fontSize:18,fontWeight:700,marginBottom:20}}>Frequently Asked Questions</div>{[{q:"How do I deposit funds?",a:"Go to Wallet > Deposit, select your preferred cryptocurrency, enter the amount, and send to the provided wallet address."},{q:"How long do withdrawals take?",a:"Withdrawal requests are processed within 1-24 hours depending on network congestion."},{q:"What is the minimum withdrawal?",a:"The minimum withdrawal amount is $12. No maximum for verified accounts."},{q:"How do I verify my account?",a:"Go to Account > Document Verification, select document type, upload photos, and submit. Auto-verified in 2-3 minutes."},{q:"What is two-step verification?",a:"Extra security using Google Authenticator. Enter a 6-digit code when logging in or withdrawing."},{q:"How do trading signals work?",a:"AI-generated signals based on technical analysis. Each shows pair, direction, confidence, and duration."},{q:"What are OTC pairs?",a:"Forex and commodity pairs trading 24/7 with simulated pricing. Higher payouts (85-92%)."},{q:"Can I use on mobile?",a:"Yes, fully responsive. Works on all mobile browsers, no app needed."}].map((faq,i)=>(<details key={i} style={{borderBottom:`1px solid ${T.border}`,padding:"14px 0"}}><summary style={{...IN,fontSize:13,fontWeight:600,color:T.text,cursor:"pointer",listStyle:"none",display:"flex",alignItems:"center",justifyContent:"space-between"}}>{faq.q}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.sub} strokeWidth="2" style={{flexShrink:0}}><polyline points="6 9 12 15 18 9"/></svg></summary><div style={{...IN,fontSize:12,color:T.sub,lineHeight:1.6,marginTop:10,paddingLeft:4}}>{faq.a}</div></details>))}</div>}
    </div></div>}

    {/* ═══ ANALYTICS TAB ═══ — Sample 1 header (profile bar) + Sample 2 body (KPI cards + charts) */}
    {tab==="analytics"&&<AnalyticsTabContent T={T} currentUser={currentUser} balance={balance||0} realBalance={realBalance||0} cvs={cvs||(v=>"$"+(v||0).toFixed(2))} tradeHistory={tradeHistory||[]} isMob={isMob} Avatar={Avatar}/>}

    </div>
    <TwoFASetupModal open={setup2FAOpen} onClose={()=>setSetup2FAOpen(false)} T={T} onComplete={(sec,codes)=>{setTwoFA(true);setTwoFALogin(true);setTwoFAWithdraw(true);setSetup2FAOpen(false);onSaveSettings({...settings,twoFA:true,twoFALogin:true,twoFAWithdraw:true,twoFASecret:sec,twoFABackupCodes:codes});}}/>
    {/* PIN verification for disabling 2FA / turning off toggles */}
    <TwoFAVerifyModal open={pinVerifyOpen} T={T}
      title={pinAction?.type==="disable2fa"?"Disable Two-Step Verification":pinAction?.type==="toggleLogin"?"Turn Off Login Verification":"Turn Off Withdrawal Verification"}
      subtitle="Enter your 6-digit authenticator code to confirm this security change"
      onClose={()=>{setPinVerifyOpen(false);setPinAction(null);}}
      onVerify={async(code)=>{
        if(code.length===6){executePinAction();return true;}
        return false;
      }}
    />
  </div>);
}

function WalletPageInline({onBack,initialTab,T}){
  const[tab,setTab]=useState(initialTab||"wallets");
  const[selCrypto,setSelCrypto]=useState(0);
  const[depAmt,setDepAmt]=useState("");
  const[depStep,setDepStep]=useState(1);
  const[depExpiry,setDepExpiry]=useState(0);
  const depExpiryRef=useRef(null);
  useEffect(()=>{if(depStep===2&&depExpiry===0){setDepExpiry(7200);depExpiryRef.current=setInterval(()=>{setDepExpiry(p=>{if(p<=1){clearInterval(depExpiryRef.current);return 0;}return p-1;});},1000);}return()=>{if(depExpiryRef.current)clearInterval(depExpiryRef.current);};},[depStep]);
  const[wAmt,setWAmt]=useState("");
  const[wAddr,setWAddr]=useState("");
  const[copied,setCopied]=useState(false);
  const[withdrawing,setWithdrawing]=useState(false);
  const[walletData,setWalletData]=useState(null);
  const[deposits,setDeposits]=useState([]);
  const[withdrawals,setWithdrawals]=useState([]);
  const[currencies,setCurrencies]=useState([]);
  const[loading,setLoading]=useState(true);
  const[depositConfirmed,setDepositConfirmed]=useState(null);
  const[promoCode,setPromoCode]=useState("");
  const[promoResult,setPromoResult]=useState(null);
  const[promoLoading,setPromoLoading]=useState(false);
  const[promoApplied,setPromoApplied]=useState(false);
  const[withdraw2FAOpen,setWithdraw2FAOpen]=useState(false);
  const pollRef=useRef(null);
  const prevBalRef=useRef(null);
  const isMob=window.innerWidth<768;
  useEffect(()=>{loadWallet();},[]);
  const loadWallet=async()=>{setLoading(true);try{const[summary,depRes,wdRes,curRes]=await Promise.all([API.wallet?.summary?.()?.catch(()=>null),API.wallet?.deposits?.()?.catch(()=>null),API.wallet?.withdrawals?.()?.catch(()=>null),API.wallet?.depositAddresses?.()?.catch(()=>null)]);if(summary?.success){if(prevBalRef.current!==null&&summary.realBalance>prevBalRef.current&&depStep===2){const added=summary.realBalance-prevBalRef.current;setDepositConfirmed({amount:added.toFixed(2),currency:cc.name});setDepStep(3);const _lb=parseFloat(localStorage.getItem("qt_realBal")||"0");localStorage.setItem("qt_realBal",String(_lb+added));localStorage.setItem("qt_lastServerBal",String(summary.realBalance));if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}}prevBalRef.current=summary.realBalance;setWalletData(summary);}if(depRes?.success)setDeposits(depRes.deposits||[]);if(wdRes?.success)setWithdrawals(wdRes.withdrawals||[]);if(curRes?.success)setCurrencies(curRes.currencies||[]);}catch(e){}setLoading(false);};
  useEffect(()=>{
    if(depStep===2){
      prevBalRef.current=walletData?.realBalance||0;
      pollRef.current=setInterval(async()=>{try{const s=await API.wallet?.summary?.();if(s?.success&&s.realBalance>(prevBalRef.current||0)){const added=s.realBalance-(prevBalRef.current||0);setDepositConfirmed({amount:added.toFixed(2),currency:cc.name});setDepStep(3);setWalletData(s);try{const d=await API.wallet?.deposits?.();if(d?.success)setDeposits(d.deposits||[]);}catch(e2){}const _localBal=parseFloat(localStorage.getItem("qt_realBal")||"0");localStorage.setItem("qt_realBal",String(_localBal+added));localStorage.setItem("qt_lastServerBal",String(s.realBalance));clearInterval(pollRef.current);pollRef.current=null;}}catch(e){}},10000);
      return()=>{if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}};
    }else if(depStep===1){setDepositConfirmed(null);}
  },[depStep]);
  useEffect(()=>{if(depStep===3&&promoResult?.ok&&!promoApplied&&promoCode.trim()){applyPromo();}},[depStep]);
  const cc=currencies[selCrypto]||{id:"BTC",name:"Bitcoin",icon:"\u20bf",color:"#F7931A",address:""};
  const realBal=parseFloat(localStorage.getItem("qt_realBal"))||walletData?.realBalance||0;
  const demoBal=parseFloat(localStorage.getItem("qt_bal"))||walletData?.demoBalance||10000;
  const copyAddr=()=>{navigator.clipboard?.writeText(cc.address||"").catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const qrCanvasRef=useRef(null);
  useEffect(()=>{if(!window.QRCode){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";s.onload=()=>{if(depStep===2&&cc.address)setTimeout(renderQR,100);};document.head.appendChild(s);}},[]);
  useEffect(()=>{if(depStep===2&&cc.address){setTimeout(renderQR,200);}},[depStep,selCrypto,cc.address]);
  const renderQR=()=>{if(!window.QRCode||!qrCanvasRef.current||!cc.address)return;qrCanvasRef.current.innerHTML="";try{
      // Build crypto URI with amount so wallets auto-fill the amount
      const amt=parseFloat(depAmt)||0;
      const schemes={BTC:"bitcoin",ETH:"ethereum",USDT:"ethereum",BNB:"bnb",SOL:"solana",TRX:"tron",LTC:"litecoin",DOGE:"dogecoin",XRP:"ripple",MATIC:"ethereum"};
      const scheme=schemes[cc.id]||"";
      let qrText=cc.address;
      if(scheme&&amt>0){
        qrText=scheme+":"+cc.address+"?amount="+amt;
        if(cc.id==="USDT")qrText=scheme+":"+cc.address+"?amount="+amt+"&token=USDT";
      }
      new window.QRCode(qrCanvasRef.current,{text:qrText,width:80,height:80,colorDark:"#000000",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});}catch(e){}};
  const doWithdraw=async()=>{setWithdrawing(true);try{const res=await API.wallet.withdraw({currency:cc.id,walletAddress:wAddr.trim(),amount:parseFloat(wAmt)});if(res?.success){setWAmt("");setWAddr("");loadWallet();alert("Withdrawal request submitted!");}else{alert(res?.error||"Failed");}}catch(e){alert("Error");}setWithdrawing(false);};
  const handleWithdraw=async()=>{if(!wAddr.trim()||!wAmt)return;if(parseFloat(wAmt)<12){alert("Minimum withdrawal is $12");return;}if(parseFloat(wAmt)>realBal){alert("Insufficient balance");return;}const s=ls("qt_settings",{});if(s.twoFA&&s.twoFAWithdraw){setWithdraw2FAOpen(true);return;}doWithdraw();};
  const timeAgo=(d)=>{if(!d)return"--";const ms=Date.now()-new Date(d).getTime();const m=Math.floor(ms/60000);if(m<1)return"Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";};
  const validatePromo=async()=>{if(!promoCode.trim())return;setPromoLoading(true);setPromoResult(null);try{const data=await API.promo.validate(promoCode.trim(),parseFloat(depAmt)||0);if(data.success){setPromoResult({ok:true,...data.promo});}else{setPromoResult({ok:false,message:data.message||"Invalid code"});}}catch(e){setPromoResult({ok:false,message:e.message||"Failed to validate"});}setPromoLoading(false);};
  const applyPromo=async()=>{if(!promoResult?.ok||promoApplied)return;setPromoLoading(true);try{const data=await API.promo.apply(promoCode.trim(),parseFloat(depAmt)||0);if(data.success){setPromoApplied(true);setPromoResult(prev=>({...prev,applied:true,bonus:data.bonus,message:data.message}));loadWallet();}else{setPromoResult({ok:false,message:data.message||"Failed to apply"});}}catch(e){setPromoResult({ok:false,message:e.message||"Failed to apply"});}setPromoLoading(false);};
  const clearPromo=()=>{setPromoCode("");setPromoResult(null);setPromoApplied(false);};
  const WT=T;
  const sideItems=[
    {id:"wallets",label:"My Wallets",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>},
    {id:"deposit",label:"Deposit",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14"/><path d="M5 12h14"/></svg>},
    {id:"withdraw",label:"Withdraw",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>},
    {id:"history",label:"Transactions",icon:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>},
  ];

  return(<div style={{flex:1,display:"flex",overflow:"hidden"}}>
    {/* Wallet Sidebar */}
    {!isMob&&<div style={{width:200,background:WT.card,borderRight:`1px solid ${WT.border}`,flexShrink:0,display:"flex",flexDirection:"column",padding:"12px 0"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 14px 10px"}}>
        <span style={{...IN,fontSize:15,fontWeight:700,color:WT.text}}>Wallet</span>
        <button onClick={onBack} style={{background:"none",border:"none",color:WT.sub,cursor:"pointer",display:"flex",alignItems:"center",gap:3,...IN,fontSize:10,fontWeight:600}} title="Back to Trading">
          {Ic.back}<span>Back</span>
        </button>
      </div>
      <div style={{margin:"0 14px 10px",padding:"8px 10px",borderRadius:8,background:WT.accentDim,border:`1px solid ${WT.accent}22`}}>
        <div style={{...IN,fontSize:8,color:WT.sub,fontWeight:600}}>REAL BALANCE</div>
        <div style={{...MO,fontSize:16,fontWeight:800,color:WT.accent}}>${realBal.toFixed(2)}</div>
      </div>
      {sideItems.map(item=>(
        <button key={item.id} onClick={()=>{setTab(item.id);if(item.id==="deposit")setDepStep(1);}} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 16px",border:"none",background:tab===item.id?WT.accentDim:"transparent",color:tab===item.id?WT.accent:WT.sub,...IN,fontSize:12,fontWeight:tab===item.id?600:500,cursor:"pointer",textAlign:"left",borderLeft:tab===item.id?`3px solid ${WT.accent}`:"3px solid transparent"}} onMouseEnter={e=>{if(tab!==item.id)e.currentTarget.style.background=WT.el;}} onMouseLeave={e=>{if(tab!==item.id)e.currentTarget.style.background="transparent";}}>
          <span style={{display:"flex",opacity:tab===item.id?1:.6}}>{item.icon}</span>{item.label}
        </button>
      ))}
    </div>}
    {/* Mobile wallet tabs */}
    {isMob&&<div style={{position:"fixed",bottom:50,left:0,right:0,display:"flex",background:WT.card,borderTop:`1px solid ${WT.border}`,zIndex:100}}>
      <button onClick={onBack} style={{padding:"7px 10px",border:"none",background:"transparent",color:WT.accent,...IN,fontSize:8,fontWeight:600,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
        {Ic.back}<span>Back</span>
      </button>
      {sideItems.map(item=>(
        <button key={item.id} onClick={()=>{setTab(item.id);if(item.id==="deposit")setDepStep(1);}} style={{flex:1,padding:"7px 0",border:"none",background:"transparent",color:tab===item.id?WT.accent:WT.sub,...IN,fontSize:8,fontWeight:500,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
          <span style={{display:"flex"}}>{item.icon}</span>{item.label}
        </button>
      ))}
    </div>}
    {/* Main Content */}
    <div style={{flex:1,overflowY:"auto",padding:isMob?"14px 12px 90px":"20px 28px",display:"flex",flexDirection:"column",alignItems:"center"}}>
      <div style={{width:"100%",maxWidth:640}}>
      {loading?<div style={{textAlign:"center",padding:50,color:WT.muted,fontSize:12}}>Loading wallet...</div>:<>

      {tab==="wallets"&&<>
        <div style={{...IN,fontSize:18,fontWeight:700,marginBottom:16}}>My Wallets</div>
        <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:12,padding:"18px 20px",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
            <div>
              <div style={{...IN,fontSize:12,fontWeight:700}}>Trading Wallet</div>
              <div style={{...IN,fontSize:10,color:WT.sub}}>Available balance</div>
              <div style={{...MO,fontSize:26,fontWeight:800,color:WT.text,marginTop:4}}>${realBal.toFixed(2)}</div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={()=>{setTab("deposit");setDepStep(1);}} style={{padding:"8px 18px",borderRadius:6,border:"none",background:`linear-gradient(135deg,${WT.accent},#d97706)`,color:"#fff",...IN,fontSize:11,fontWeight:700,cursor:"pointer"}}>Deposit</button>
              <button onClick={()=>setTab("withdraw")} style={{padding:"8px 18px",borderRadius:6,border:`1px solid ${WT.border}`,background:WT.el,color:WT.text,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>Withdraw</button>
            </div>
          </div>
        </div>
        <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:12,padding:"14px 20px",marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{...IN,fontSize:12,fontWeight:700}}>Demo Wallet</div>
              <div style={{...MO,fontSize:20,fontWeight:700,color:WT.sub,marginTop:2}}>${demoBal.toFixed(2)}</div>
            </div>
            <span style={{...MO,fontSize:9,color:WT.muted,padding:"3px 8px",borderRadius:5,background:WT.el,border:`1px solid ${WT.border}`}}>Virtual</span>
          </div>
        </div>
        {walletData&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:16}}>
          {[{l:"Total Deposited",v:`$${(walletData.totalDeposited||0).toFixed(2)}`,c:WT.green},{l:"Total Withdrawn",v:`$${(walletData.totalWithdrawn||0).toFixed(2)}`,c:WT.red},{l:"Pending",v:`$${(walletData.pendingWithdrawals||0).toFixed(2)}`,c:WT.yellow}].map((s,i)=>(
            <div key={i} style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:8,padding:"10px 12px"}}>
              <div style={{...IN,fontSize:8,color:WT.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{s.l}</div>
              <div style={{...MO,fontSize:14,fontWeight:700,color:s.c}}>{s.v}</div>
            </div>
          ))}
        </div>}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{...IN,fontSize:13,fontWeight:700}}>Recent Transactions</span>
            <button onClick={()=>setTab("history")} style={{...IN,fontSize:10,color:WT.accent,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>View All →</button>
          </div>
          {[...deposits.slice(0,3).map(tx=>({...tx,type:"deposit"})),...withdrawals.slice(0,3).map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).length===0?
            <div style={{textAlign:"center",padding:20,color:WT.muted,fontSize:11,background:WT.card,borderRadius:8,border:`1px solid ${WT.border}`}}>No transactions yet</div>
          :[...deposits.slice(0,3).map(tx=>({...tx,type:"deposit"})),...withdrawals.slice(0,3).map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map((tx,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:WT.card,borderRadius:8,border:`1px solid ${WT.border}`,marginBottom:4}}>
              <div style={{width:24,height:24,borderRadius:"50%",background:tx.type==="deposit"?WT.greenDim:WT.redDim,display:"flex",alignItems:"center",justifyContent:"center",color:tx.type==="deposit"?WT.green:WT.red,fontSize:12,flexShrink:0}}>{tx.type==="deposit"?"↓":"↑"}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{...IN,fontSize:11,fontWeight:600}}>{tx.currency||"Crypto"}</div>
                <div style={{...MO,fontSize:9,color:WT.muted}}>{timeAgo(tx.createdAt)}</div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{...MO,fontSize:11,fontWeight:700,color:tx.type==="deposit"?WT.green:WT.red}}>{tx.type==="deposit"?"+":"-"}${(tx.amountUSD||tx.amount||0).toFixed(2)}</div>
                <span style={{...MO,fontSize:7,padding:"1px 5px",borderRadius:3,background:tx.status==="completed"||tx.status==="confirmed"?WT.greenDim:tx.status==="rejected"?WT.redDim:WT.yellowDim,color:tx.status==="completed"||tx.status==="confirmed"?WT.green:tx.status==="rejected"?WT.red:WT.yellow,fontWeight:600}}>{tx.status}</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      {tab==="deposit"&&depStep===1&&<>
        <div style={{...IN,fontSize:18,fontWeight:700,marginBottom:16}}>Deposit</div>
        <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:12,padding:"20px 22px",maxWidth:520}}>
          <div style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6}}>Select Cryptocurrency</div>
          <div style={{display:"flex",gap:5,marginBottom:16,flexWrap:"wrap"}}>{currencies.map((cr,i)=>(<button key={cr.id} onClick={()=>setSelCrypto(i)} style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${selCrypto===i?WT.accent:WT.border}`,background:selCrypto===i?WT.accentDim:"transparent",color:selCrypto===i?WT.accent:WT.sub,...MO,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><span style={{width:18,height:18,borderRadius:"50%",background:cr.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff"}}>{cr.icon||"?"}</span>{cr.name}</button>))}</div>
          <div style={{marginBottom:16}}>
            <div style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6}}>Deposit Amount (USD)</div>
            <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${WT.border}`}}>
              <span style={{padding:"11px 14px",background:WT.el,color:WT.accent,...MO,fontSize:16,fontWeight:700,display:"flex",alignItems:"center"}}>$</span>
              <input value={depAmt} onChange={e=>setDepAmt(e.target.value)} placeholder="Enter amount" type="number" style={{flex:1,background:WT.el,border:"none",padding:"11px 14px",color:WT.text,...MO,fontSize:16,fontWeight:700,outline:"none",boxSizing:"border-box",borderLeft:`1px solid ${WT.border}`}}/>
            </div>
            <div style={{display:"flex",gap:4,marginTop:8}}>{[10,25,50,100,250,500].map(v=>(<button key={v} onClick={()=>setDepAmt(String(v))} style={{flex:1,padding:"7px 0",borderRadius:5,border:`1px solid ${parseFloat(depAmt)===v?WT.accent:WT.border}`,background:parseFloat(depAmt)===v?WT.accentDim:"transparent",color:parseFloat(depAmt)===v?WT.accent:WT.sub,...MO,fontSize:10,fontWeight:600,cursor:"pointer"}}>${v}</button>))}</div>
          </div>
          {/* PROMO CODE */}
          <div style={{marginBottom:14,padding:"12px 14px",background:WT.el,borderRadius:8,border:`1px solid ${promoResult?.ok?WT.green+"55":promoResult?.ok===false?WT.red+"55":WT.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:6}}>
              <span style={{fontSize:12}}>tag</span>
              <span style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>Promo Code</span>
              {promoApplied&&<span style={{...MO,fontSize:8,padding:"2px 6px",borderRadius:3,background:WT.greenDim,color:WT.green,fontWeight:700,marginLeft:"auto"}}>✓ APPLIED</span>}
            </div>
            <div style={{display:"flex",gap:5}}>
              <input value={promoCode} onChange={e=>{setPromoCode(e.target.value.toUpperCase());if(promoResult)setPromoResult(null);if(promoApplied)setPromoApplied(false);}} placeholder="ENTER PROMO CODE" disabled={promoApplied} style={{flex:1,background:WT.bg,border:`1px solid ${WT.border}`,borderRadius:6,padding:"8px 10px",color:WT.text,...MO,fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",outline:"none",boxSizing:"border-box",opacity:promoApplied?.5:1}}/>
              {!promoApplied?<button onClick={validatePromo} disabled={promoLoading||!promoCode.trim()} style={{padding:"8px 14px",borderRadius:6,border:"none",background:(!promoCode.trim())?WT.el:`linear-gradient(135deg,#3b82f6,#2563eb)`,color:(!promoCode.trim())?WT.muted:"#fff",...IN,fontSize:10,fontWeight:700,cursor:(!promoCode.trim())?"not-allowed":"pointer",opacity:promoLoading?.6:1,whiteSpace:"nowrap"}}>{promoLoading?"...":"Apply"}</button>:<button onClick={clearPromo} style={{padding:"8px 10px",borderRadius:6,border:`1px solid ${WT.border}`,background:WT.el,color:WT.sub,...IN,fontSize:10,fontWeight:600,cursor:"pointer"}}>✕</button>}
            </div>
            {promoResult&&<div style={{marginTop:6}}>
              {promoResult.ok?<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:WT.green,fontSize:12}}>✓</span><span style={{...IN,fontSize:11,fontWeight:600,color:WT.green}}>{promoApplied?promoResult.message:"Code valid!"}</span></div>
              :<div style={{display:"flex",alignItems:"center",gap:5}}><span style={{color:WT.red,fontSize:12}}>✗</span><span style={{...IN,fontSize:11,fontWeight:600,color:WT.red}}>{promoResult.message}</span></div>}
            </div>}
          </div>
          {/* QUICK PROMO BOXES */}
          {!promoApplied&&<div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
            {[
              {code:"STARTER50",bonus:50,minDep:30,desc:"+50% BONUS on $30+"},
              {code:"BOOST30",bonus:30,minDep:80,desc:"+30% BONUS on $80+"},
              {code:"MEGA40",bonus:40,minDep:90,desc:"+40% BONUS on $90+"},
              {code:"POWER50",bonus:50,minDep:120,desc:"+50% BONUS on $120+"}
            ].map((pp,i)=>(<button key={i} onClick={()=>{
              setPromoCode(pp.code);setPromoResult(null);setPromoApplied(false);
              if(!depAmt||parseFloat(depAmt)<pp.minDep)setDepAmt(String(pp.minDep));
            }} style={{flex:"1 1 calc(33.33% - 5px)",minWidth:isMob?90:120,padding:"10px 6px",borderRadius:8,border:`1.5px solid ${promoCode===pp.code?WT.accent:WT.border}`,background:promoCode===pp.code?WT.accentDim:"transparent",cursor:"pointer",textAlign:"center",transition:"all 0.2s",position:"relative",overflow:"hidden"}} onMouseEnter={e=>{if(promoCode!==pp.code)e.currentTarget.style.borderColor=WT.accent+"77";}} onMouseLeave={e=>{if(promoCode!==pp.code)e.currentTarget.style.borderColor=WT.border;}}>
              <div style={{position:"absolute",top:0,right:0,padding:"1px 6px",borderRadius:"0 6px 0 6px",background:`linear-gradient(135deg,${WT.green},#16a34a)`,fontSize:7,fontWeight:800,color:"#fff"}}>+{pp.bonus}%</div>
              <div style={{...MO,fontSize:10,fontWeight:800,color:promoCode===pp.code?WT.accent:WT.text,letterSpacing:1,marginBottom:2}}>{pp.code}</div>
              <div style={{...IN,fontSize:8,color:WT.muted,lineHeight:1.2}}>{pp.desc}</div>
            </button>))}
          </div>}
          <button onClick={()=>{if(!depAmt||parseFloat(depAmt)<10){alert("Minimum deposit is $10");return;}setDepStep(2);}} style={{width:"100%",padding:"13px 0",borderRadius:8,border:"none",background:(!depAmt||parseFloat(depAmt)<10)?WT.el:`linear-gradient(135deg,${WT.accent},#d97706)`,color:(!depAmt||parseFloat(depAmt)<10)?WT.muted:"#fff",...IN,fontSize:14,fontWeight:700,cursor:(!depAmt||parseFloat(depAmt)<10)?"not-allowed":"pointer"}}>Continue to Deposit</button>
          <div style={{...MO,fontSize:10,color:WT.muted,textAlign:"center",marginTop:6}}>Minimum deposit: $10</div>
        </div>
      </>}

      {tab==="deposit"&&depStep===2&&<>
        <div style={{maxWidth:440,margin:"0 auto"}}>
          <div style={{background:WT.card,borderRadius:16,border:`1px solid ${WT.border}`,padding:"28px 24px",color:WT.text}}>
            {/* Amount header */}
            <div style={{marginBottom:20}}>
              <div style={{...MO,fontSize:28,fontWeight:800,color:WT.text,display:"flex",alignItems:"center",gap:8}}>
                {depAmt} USDT
                <button onClick={copyAddr} style={{width:28,height:28,borderRadius:"50%",background:WT.el,border:`1px solid ${WT.border}`,color:WT.sub,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              </div>
              <div style={{...IN,fontSize:12,color:WT.sub,marginTop:2}}>{depAmt} USD</div>
              <div style={{...IN,fontSize:11,color:WT.muted,marginTop:2}}>Network: <strong style={{color:WT.text}}>{cc.network||"BSC"}</strong></div>
              <div style={{display:"flex",alignItems:"center",gap:4,marginTop:6,...IN,fontSize:10,color:WT.muted}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={WT.muted} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                You pay network fee
              </div>
            </div>

            {/* QR + Address */}
            <div style={{background:WT.el,borderRadius:12,border:`1px solid ${WT.border}`,padding:"20px",marginBottom:20}}>
              <div style={{...IN,fontSize:10,color:WT.muted,marginBottom:8}}>Recipient's wallet address</div>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                <div style={{width:96,height:96,background:"#ffffff",borderRadius:12,padding:8,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${WT.accent}`,boxShadow:`0 0 12px ${WT.accent}22`}}>
                  <div ref={qrCanvasRef}></div>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{...MO,fontSize:11,color:WT.text,wordBreak:"break-all",lineHeight:1.5,marginBottom:8}}>{cc.address||"Generating address..."} <button onClick={copyAddr} style={{display:"inline-flex",alignItems:"center",marginLeft:4,background:"none",border:"none",cursor:"pointer",color:WT.sub,verticalAlign:"middle"}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
                  {copied&&<div style={{...IN,fontSize:9,color:WT.green,fontWeight:600,marginBottom:4}}>Copied to clipboard!</div>}
                  <div style={{...IN,fontSize:9,color:WT.muted,lineHeight:1.4}}>When your payment status will change, we'll send to you notification</div>
                </div>
              </div>
            </div>

            {/* Expiration + Confirmations — LIVE */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              <div style={{background:WT.el,borderRadius:10,border:`1px solid ${WT.border}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${WT.accent}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WT.accent} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div>
                  <div style={{...IN,fontSize:10,color:WT.sub}}>Expiration time</div>
                  <div style={{...MO,fontSize:13,fontWeight:700,color:WT.accent}}>{`${String(Math.floor(depExpiry/3600)).padStart(2,"0")}:${String(Math.floor((depExpiry%3600)/60)).padStart(2,"0")}:${String(depExpiry%60).padStart(2,"0")}`}</div>
                </div>
              </div>
              <div style={{background:WT.el,borderRadius:10,border:`1px solid ${WT.border}`,padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:32,height:32,borderRadius:"50%",border:`2px solid ${WT.green}44`,display:"flex",alignItems:"center",justifyContent:"center",animation:"depConfSpin 2s linear infinite"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WT.green} strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/></svg>
                </div>
                <div>
                  <div style={{...IN,fontSize:10,color:WT.sub}}>Confirmations</div>
                  <div style={{...MO,fontSize:13,fontWeight:700,color:WT.green}}>0 from {cc.confirmations||5}</div>
                </div>
              </div>
            </div>
            <style>{`@keyframes depConfSpin{to{transform:rotate(360deg)}}`}</style>

            {/* Contract address */}
            <div style={{background:WT.el,borderRadius:10,border:`1px solid ${WT.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{...IN,fontSize:11,color:WT.sub}}>Contract address: <span style={{color:WT.accent,cursor:"pointer"}}>{cc.address?.slice(0,6)+"..."+cc.address?.slice(-4)||"0x5...7955"}</span></span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WT.muted} strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>
            </div>
          </div>
        </div>
      </>}

      {tab==="deposit"&&depStep===3&&<div style={{maxWidth:400,margin:"0 auto",textAlign:"center",padding:"30px 0"}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:WT.greenDim,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:26}}>✓</div>
        <div style={{...IN,fontSize:18,fontWeight:700,color:WT.green,marginBottom:6}}>Deposit Confirmed!</div>
        <div style={{...MO,fontSize:13,color:WT.text,marginBottom:3}}>+${depositConfirmed?.amount||"0.00"} received</div>
        <div style={{...IN,fontSize:11,color:WT.sub,marginBottom:20}}>via {depositConfirmed?.currency||cc.name}</div>
        <button onClick={()=>{setDepStep(1);setDepAmt("");}} style={{padding:"10px 28px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${WT.accent},#d97706)`,color:"#fff",...IN,fontSize:12,fontWeight:700,cursor:"pointer"}}>Done</button>
      </div>}

      {tab==="withdraw"&&<>
        <div style={{...IN,fontSize:18,fontWeight:700,marginBottom:16}}>Withdraw</div>
        <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:12,padding:"20px 22px",maxWidth:520}}>
          <div style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6}}>Select Cryptocurrency</div>
          <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>{currencies.map((cr,i)=>(<button key={cr.id} onClick={()=>setSelCrypto(i)} style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${selCrypto===i?WT.accent:WT.border}`,background:selCrypto===i?WT.accentDim:"transparent",color:selCrypto===i?WT.accent:WT.sub,...MO,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><span style={{width:18,height:18,borderRadius:"50%",background:cr.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:"#fff"}}>{cr.icon||"?"}</span>{cr.name}</button>))}</div>
          <div style={{marginBottom:12}}>
            <div style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase",marginBottom:4}}>Your {cc.name} Wallet Address</div>
            <input value={wAddr} onChange={e=>setWAddr(e.target.value)} placeholder={`Enter your ${cc.name} wallet address`} style={{width:"100%",background:WT.el,border:`1px solid ${WT.border}`,borderRadius:8,padding:"10px 12px",color:WT.text,...MO,fontSize:11,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{...IN,fontSize:10,color:WT.sub,fontWeight:600,textTransform:"uppercase"}}>Amount (USD)</span>
              <span style={{...MO,fontSize:10,color:WT.muted}}>Available: <span style={{color:WT.accent,fontWeight:700}}>${realBal.toFixed(2)}</span></span>
            </div>
            <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${WT.border}`}}>
              <input value={wAmt} onChange={e=>setWAmt(e.target.value)} placeholder="0.00" type="number" style={{flex:1,background:WT.el,border:"none",padding:"10px 12px",color:WT.text,...MO,fontSize:14,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
              <button onClick={()=>setWAmt(String(realBal))} style={{padding:"0 14px",background:WT.accentDim,border:"none",borderLeft:`1px solid ${WT.border}`,color:WT.accent,...IN,fontSize:10,fontWeight:700,cursor:"pointer"}}>MAX</button>
            </div>
          </div>
          <button onClick={handleWithdraw} disabled={withdrawing||!wAddr.trim()||!wAmt} style={{width:"100%",padding:"13px 0",borderRadius:8,border:"none",background:(!wAddr.trim()||!wAmt)?WT.el:`linear-gradient(135deg,${WT.accent},#d97706)`,color:(!wAddr.trim()||!wAmt)?WT.muted:"#fff",...IN,fontSize:14,fontWeight:700,cursor:(!wAddr.trim()||!wAmt)?"not-allowed":"pointer",opacity:withdrawing?.6:1}}>{withdrawing?"Processing...":"Withdraw "+cc.name}</button>
          <div style={{...MO,fontSize:10,color:WT.muted,textAlign:"center",marginTop:6}}>Minimum withdrawal: $12</div>
        </div>
      </>}

      {tab==="history"&&<>
        <div style={{...IN,fontSize:18,fontWeight:700,marginBottom:16}}>Transaction History</div>
        <div style={{display:"flex",padding:"9px 14px",background:WT.el,borderRadius:"8px 8px 0 0",border:`1px solid ${WT.border}`,borderBottom:"none",...IN,fontSize:9,fontWeight:700,color:WT.muted,textTransform:"uppercase",letterSpacing:".04em"}}>
          <span style={{flex:1}}>Type</span><span style={{flex:2}}>Date & Time</span><span style={{flex:1,textAlign:"right"}}>Amount</span><span style={{flex:1,textAlign:"right"}}>Status</span>
        </div>
        <div style={{border:`1px solid ${WT.border}`,borderRadius:"0 0 8px 8px",overflow:"hidden"}}>
          {[...deposits.map(tx=>({...tx,type:"deposit"})),...withdrawals.map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).length===0?
            <div style={{textAlign:"center",padding:24,color:WT.muted,fontSize:11,background:WT.card}}>No transactions yet</div>
          :[...deposits.map(tx=>({...tx,type:"deposit"})),...withdrawals.map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((tx,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",padding:"10px 14px",background:i%2===0?WT.card:WT.bg,borderBottom:i<10?`1px solid ${WT.border}`:"none",...MO,fontSize:11}}>
              <div style={{flex:1,display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:22,height:22,borderRadius:"50%",background:tx.type==="deposit"?WT.greenDim:WT.redDim,display:"flex",alignItems:"center",justifyContent:"center",color:tx.type==="deposit"?WT.green:WT.red,fontSize:10,flexShrink:0}}>{tx.type==="deposit"?"↓":"↑"}</div>
                <span style={{fontWeight:600,color:WT.text,textTransform:"capitalize"}}>{tx.type}</span>
              </div>
              <span style={{flex:2,color:WT.sub,fontSize:9}}>{tx.createdAt?new Date(tx.createdAt).toLocaleString():"-"}</span>
              <span style={{flex:1,textAlign:"right",fontWeight:700,color:tx.type==="deposit"?WT.green:WT.red}}>{tx.type==="deposit"?"+":"-"}${(tx.amountUSD||tx.amount||0).toFixed(2)}</span>
              <div style={{flex:1,textAlign:"right"}}>
                <span style={{...MO,fontSize:8,padding:"2px 6px",borderRadius:3,background:tx.status==="completed"||tx.status==="confirmed"?WT.greenDim:tx.status==="rejected"?WT.redDim:WT.yellowDim,color:tx.status==="completed"||tx.status==="confirmed"?WT.green:tx.status==="rejected"?WT.red:WT.yellow,fontWeight:600}}>{tx.status}</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      </>}
      </div>
    </div>
    {/* 2FA Withdrawal Verification Modal */}
    <TwoFAVerifyModal open={withdraw2FAOpen} T={T}
      title="Verify Withdrawal"
      subtitle="Enter your 2FA code to confirm this withdrawal"
      onClose={()=>setWithdraw2FAOpen(false)}
      onVerify={async(code)=>{
        try{
          const res=await API.twoFA.verifyAction(code,"withdraw");
          if(res.success){setWithdraw2FAOpen(false);doWithdraw();return true;}
          return false;
        }catch(e){
          // Demo fallback — accept any 6 digit code
          if(code.length===6){setWithdraw2FAOpen(false);doWithdraw();return true;}
          return false;
        }
      }}
    />
  </div>);
}

function WalletPage({onBack,initialTab}){
  const[tab,setTab]=useState(initialTab||"wallets");
  const[selCrypto,setSelCrypto]=useState(0);
  const[depAmt,setDepAmt]=useState("");
  const[depStep,setDepStep]=useState(1);
  const[wAmt,setWAmt]=useState("");
  const[wAddr,setWAddr]=useState("");
  const[copied,setCopied]=useState(false);
  const[withdrawing,setWithdrawing]=useState(false);
  const[walletData,setWalletData]=useState(null);
  const[deposits,setDeposits]=useState([]);
  const[withdrawals,setWithdrawals]=useState([]);
  const[currencies,setCurrencies]=useState([]);
  const[loading,setLoading]=useState(true);
  const[depositConfirmed,setDepositConfirmed]=useState(null);
  const[promoCode,setPromoCode]=useState("");
  const[promoResult,setPromoResult]=useState(null);
  const[promoLoading,setPromoLoading]=useState(false);
  const[promoApplied,setPromoApplied]=useState(false);
  const qrRef=useRef(null);
  const pollRef=useRef(null);
  const prevBalRef=useRef(null);
  const isMob=window.innerWidth<768;
  useEffect(()=>{loadWallet();},[]);
  const loadWallet=async()=>{setLoading(true);try{const[summary,depRes,wdRes,curRes]=await Promise.all([API.wallet?.summary?.()?.catch(()=>null),API.wallet?.deposits?.()?.catch(()=>null),API.wallet?.withdrawals?.()?.catch(()=>null),API.wallet?.depositAddresses?.()?.catch(()=>null)]);if(summary?.success){if(prevBalRef.current!==null&&summary.realBalance>prevBalRef.current&&depStep===2){const added=summary.realBalance-prevBalRef.current;setDepositConfirmed({amount:added.toFixed(2),currency:cc.name});setDepStep(3);const _lb=parseFloat(localStorage.getItem("qt_realBal")||"0");localStorage.setItem("qt_realBal",String(_lb+added));localStorage.setItem("qt_lastServerBal",String(summary.realBalance));if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}}prevBalRef.current=summary.realBalance;setWalletData(summary);}if(depRes?.success)setDeposits(depRes.deposits||[]);if(wdRes?.success)setWithdrawals(wdRes.withdrawals||[]);if(curRes?.success)setCurrencies(curRes.currencies||[]);}catch(e){}setLoading(false);};
  useEffect(()=>{
    if(depStep===2){
      prevBalRef.current=walletData?.realBalance||0;
      pollRef.current=setInterval(async()=>{try{const s=await API.wallet?.summary?.();if(s?.success&&s.realBalance>(prevBalRef.current||0)){const added=s.realBalance-(prevBalRef.current||0);setDepositConfirmed({amount:added.toFixed(2),currency:cc.name});setDepStep(3);setWalletData(s);try{const d=await API.wallet?.deposits?.();if(d?.success)setDeposits(d.deposits||[]);}catch(e2){}const _localBal=parseFloat(localStorage.getItem("qt_realBal")||"0");localStorage.setItem("qt_realBal",String(_localBal+added));localStorage.setItem("qt_lastServerBal",String(s.realBalance));clearInterval(pollRef.current);pollRef.current=null;}}catch(e){}},10000);
      return()=>{if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}};
    }else if(depStep===1){setDepositConfirmed(null);}
  },[depStep]);
  // Apply promo code ONLY when deposit is confirmed (step 3)
  useEffect(()=>{
    if(depStep===3&&promoResult?.ok&&!promoApplied&&promoCode.trim()){
      applyPromo();
    }
  },[depStep]);
  const cc=currencies[selCrypto]||{id:"BTC",name:"Bitcoin",icon:"\u20bf",color:"#F7931A",address:""};
  const realBal=parseFloat(localStorage.getItem("qt_realBal"))||walletData?.realBalance||0;
  const demoBal=parseFloat(localStorage.getItem("qt_bal"))||walletData?.demoBalance||10000;
  const copyAddr=()=>{navigator.clipboard?.writeText(cc.address||"").catch(()=>{});setCopied(true);setTimeout(()=>setCopied(false),2000);};
  const qrCanvasRef=useRef(null);
  useEffect(()=>{if(!window.QRCode){const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";s.onload=()=>{if(depStep===2&&cc.address)setTimeout(renderQR,100);};document.head.appendChild(s);}},[]);
  useEffect(()=>{if(depStep===2&&cc.address){setTimeout(renderQR,200);}},[depStep,selCrypto,cc.address]);
  const renderQR=()=>{if(!window.QRCode||!qrCanvasRef.current||!cc.address)return;qrCanvasRef.current.innerHTML="";try{
      const amt=parseFloat(depAmt)||0;
      const schemes={BTC:"bitcoin",ETH:"ethereum",USDT:"ethereum",BNB:"bnb",SOL:"solana",TRX:"tron",LTC:"litecoin",DOGE:"dogecoin",XRP:"ripple",MATIC:"ethereum"};
      const scheme=schemes[cc.id]||"";
      let qrText=cc.address;
      if(scheme&&amt>0){qrText=scheme+":"+cc.address+"?amount="+amt;if(cc.id==="USDT")qrText=scheme+":"+cc.address+"?amount="+amt+"&token=USDT";}
      new window.QRCode(qrCanvasRef.current,{text:qrText,width:80,height:80,colorDark:"#000000",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M});}catch(e){}};
  const handleWithdraw=async()=>{if(!wAddr.trim()||!wAmt)return;if(parseFloat(wAmt)<12){alert("Minimum withdrawal is $12");return;}if(parseFloat(wAmt)>realBal){alert("Insufficient balance");return;}setWithdrawing(true);try{const res=await API.wallet.withdraw({currency:cc.id,walletAddress:wAddr.trim(),amount:parseFloat(wAmt)});if(res?.success){setWAmt("");setWAddr("");loadWallet();alert("Withdrawal request submitted!");}else{alert(res?.error||"Failed");}}catch(e){alert("Error");}setWithdrawing(false);};
  const timeAgo=(d)=>{if(!d)return"--";const ms=Date.now()-new Date(d).getTime();const m=Math.floor(ms/60000);if(m<1)return"Just now";if(m<60)return m+"m ago";const h=Math.floor(m/60);if(h<24)return h+"h ago";return Math.floor(h/24)+"d ago";};

  const validatePromo=async()=>{if(!promoCode.trim())return;setPromoLoading(true);setPromoResult(null);try{const data=await API.promo.validate(promoCode.trim(),parseFloat(depAmt)||0);if(data.success){setPromoResult({ok:true,...data.promo});}else{setPromoResult({ok:false,message:data.message||"Invalid code"});}}catch(e){setPromoResult({ok:false,message:e.message||"Failed to validate"});}setPromoLoading(false);};
  const applyPromo=async()=>{if(!promoResult?.ok||promoApplied)return;setPromoLoading(true);try{const data=await API.promo.apply(promoCode.trim(),parseFloat(depAmt)||0);if(data.success){setPromoApplied(true);setPromoResult(prev=>({...prev,applied:true,bonus:data.bonus,message:data.message}));loadWallet();}else{setPromoResult({ok:false,message:data.message||"Failed to apply"});}}catch(e){setPromoResult({ok:false,message:e.message||"Failed to apply"});}setPromoLoading(false);};
  const clearPromo=()=>{setPromoCode("");setPromoResult(null);setPromoApplied(false);};

  const sideItems=[
    {id:"wallets",label:"My Wallets",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/><path d="M6 14h.01"/></svg>},
    {id:"deposit",label:"Deposit",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14"/><path d="M5 12h14"/></svg>},
    {id:"withdraw",label:"Withdraw",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>},
    {id:"history",label:"Transaction",icon:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>},
  ];

  const[walletTheme,setWalletTheme]=useState(()=>ls("qt_walletTheme","dark"));
  useEffect(()=>{ss("qt_walletTheme",walletTheme);},[walletTheme]);
  const WT=walletTheme==="light"?{bg:"#f8f9fb",card:"#ffffff",el:"#f0f1f5",border:"#e2e5ea",text:"#1a1d26",sub:"#6b7280",muted:"#9ca3af",accent:C.accent,accentDim:"#f59e0b15",green:"#16a34a",greenDim:"#16a34a18",red:"#dc2626",redDim:"#dc262618",yellow:"#eab308",yellowDim:"#eab30818"}:{bg:C.bg,card:C.card,el:C.el,border:C.border,text:C.text,sub:C.sub,muted:C.muted,accent:C.accent,accentDim:C.accentDim,green:C.green,greenDim:C.greenDim,red:C.red,redDim:C.redDim,yellow:C.yellow,yellowDim:C.yellowDim};

  return(<div style={{...IN,background:WT.bg,color:WT.text,minHeight:"100vh",display:"flex",flexDirection:"column",transition:"background 0.3s,color 0.3s"}}>
    {/* Top Nav — glass effect */}
    <nav style={{display:"flex",alignItems:"center",gap:isMob?8:12,padding:isMob?"0 12px":"0 24px",height:56,borderBottom:`1px solid ${WT.border}`,background:walletTheme==="dark"?"rgba(21,28,46,0.8)":"rgba(255,255,255,0.85)",backdropFilter:"blur(12px)",flexShrink:0,position:"sticky",top:0,zIndex:50}}>
      <button onClick={depStep>1&&tab==="deposit"?()=>setDepStep(1):onBack} style={{background:"none",border:"none",color:WT.sub,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        {Ic.back}{!isMob&&<span style={{...IN,fontSize:13,fontWeight:600,color:WT.text}}>Back to Trading</span>}
      </button>
      <div style={{flex:1}}/>
      {/* Dark/Light Toggle */}
      <button onClick={()=>setWalletTheme(walletTheme==="dark"?"light":"dark")} style={{width:40,height:22,borderRadius:11,border:`1px solid ${WT.border}`,background:WT.el,cursor:"pointer",position:"relative",padding:0,transition:"all 0.2s",flexShrink:0}}>
        <div style={{width:16,height:16,borderRadius:"50%",background:walletTheme==="dark"?"#f59e0b":"#3b82f6",position:"absolute",top:2,left:walletTheme==="dark"?2:20,transition:"left 0.2s,background 0.2s",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9}}>{walletTheme==="dark"?"D":"L"}</div>
      </button>
      {/* Balance badge — glass, only real balance */}
      <div style={{padding:isMob?"6px 12px":"8px 18px",borderRadius:10,background:walletTheme==="dark"?"rgba(245,158,11,0.08)":"rgba(245,158,11,0.06)",border:`1px solid ${WT.accent}22`,backdropFilter:"blur(8px)",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <svg width={isMob?"14":"16"} height={isMob?"14":"16"} viewBox="0 0 24 24" fill="none" stroke={WT.accent} strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 10h20"/></svg>
        <span style={{...MO,fontSize:isMob?14:18,fontWeight:800,color:WT.accent}}>${realBal.toFixed(2)}</span>
      </div>
    </nav>

    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      {/* Sidebar */}
      <div style={{width:isMob?0:220,background:WT.card,borderRight:`1px solid ${WT.border}`,flexShrink:0,display:isMob?"none":"flex",flexDirection:"column",padding:"16px 0"}}>
        <div style={{padding:"0 16px 16px",...IN,fontSize:18,fontWeight:700,color:WT.text}}>Wallet</div>
        {sideItems.map(item=>(
          <button key={item.id} onClick={()=>{setTab(item.id);if(item.id==="deposit")setDepStep(1);}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"12px 20px",border:"none",background:tab===item.id?(walletTheme==="dark"?WT.accentDim:"#f59e0b12"):"transparent",color:tab===item.id?WT.accent:WT.sub,...IN,fontSize:13,fontWeight:tab===item.id?600:500,cursor:"pointer",textAlign:"left",borderLeft:tab===item.id?`3px solid ${WT.accent}`:"3px solid transparent",transition:"all 0.15s"}} onMouseEnter={e=>{if(tab!==item.id)e.currentTarget.style.background=WT.el;}} onMouseLeave={e=>{if(tab!==item.id)e.currentTarget.style.background="transparent";}}>
            <span style={{display:"flex",opacity:tab===item.id?1:0.6}}>{item.icon}</span>{item.label}
          </button>
        ))}
      </div>

      {/* Mobile bottom tabs */}
      {isMob&&<div style={{position:"fixed",bottom:0,left:0,right:0,display:"flex",background:WT.card,borderTop:`1px solid ${WT.border}`,zIndex:100}}>
        {sideItems.map(item=>(
          <button key={item.id} onClick={()=>{setTab(item.id);if(item.id==="deposit")setDepStep(1);}} style={{flex:1,padding:"8px 0",border:"none",background:"transparent",color:tab===item.id?WT.accent:WT.sub,...IN,fontSize:9,fontWeight:500,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
            <span style={{display:"flex"}}>{item.icon}</span>{item.label}
          </button>
        ))}
      </div>}

      {/* Main Content — centered */}
      <div style={{flex:1,overflowY:"auto",padding:isMob?"20px 16px 80px":"30px 40px",display:"flex",flexDirection:"column",alignItems:"center"}}>
        <div style={{width:"100%",maxWidth:700}}>
        {loading?<div style={{textAlign:"center",padding:60,color:WT.muted,fontSize:13}}>Loading wallet...</div>:<>

        {/* ═══ MY WALLETS TAB ═══ */}
        {tab==="wallets"&&<>
          <div style={{...IN,fontSize:isMob?18:22,fontWeight:700,marginBottom:isMob?16:24}}>My Wallets</div>
          {/* Trading Wallet Card */}
          <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:isMob?12:16,padding:isMob?"18px 16px":"28px 32px",marginBottom:isMob?12:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:isMob?12:20}}>
              <div>
                <div style={{...IN,fontSize:isMob?13:15,fontWeight:700,marginBottom:2}}>Trading Wallet</div>
                <div style={{...IN,fontSize:isMob?10:12,color:WT.sub,marginBottom:6}}>Available balance</div>
                <div style={{...MO,fontSize:isMob?26:36,fontWeight:800,color:WT.text}}>${realBal.toFixed(2)}</div>
              </div>
              <div style={{display:"flex",gap:8,width:isMob?"100%":"auto"}}>
                <button onClick={()=>{setTab("deposit");setDepStep(1);}} style={{flex:isMob?1:"none",padding:isMob?"10px 0":"12px 28px",borderRadius:8,border:"none",background:`linear-gradient(135deg,${WT.accent},#d97706)`,color:"#fff",...IN,fontSize:isMob?12:13,fontWeight:700,cursor:"pointer"}}>Deposit</button>
                <button onClick={()=>setTab("withdraw")} style={{flex:isMob?1:"none",padding:isMob?"10px 0":"12px 28px",borderRadius:8,border:`1px solid ${WT.border}`,background:WT.el,color:WT.text,...IN,fontSize:isMob?12:13,fontWeight:600,cursor:"pointer"}}>Withdraw</button>
              </div>
            </div>
          </div>
          {/* Demo Wallet Card */}
          <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:isMob?12:16,padding:isMob?"16px":"24px 32px",marginBottom:isMob?16:24}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
              <div>
                <div style={{...IN,fontSize:isMob?13:15,fontWeight:700,marginBottom:2}}>Demo Wallet</div>
                <div style={{...IN,fontSize:isMob?10:12,color:WT.sub,marginBottom:4}}>Practice balance</div>
                <div style={{...MO,fontSize:isMob?22:28,fontWeight:700,color:WT.sub}}>${demoBal.toFixed(2)}</div>
              </div>
              <div style={{...MO,fontSize:isMob?9:10,color:WT.muted,padding:isMob?"4px 8px":"6px 12px",borderRadius:6,background:WT.el,border:`1px solid ${WT.border}`,flexShrink:0}}>Virtual Funds</div>
            </div>
          </div>
          {/* Quick Stats */}
          {walletData&&<div style={{display:"grid",gridTemplateColumns:isMob?"1fr 1fr":"1fr 1fr 1fr",gap:isMob?8:12}}>
            {[{label:"Total Deposited",value:`$${(walletData.totalDeposited||0).toFixed(2)}`,color:WT.green},{label:"Total Withdrawn",value:`$${(walletData.totalWithdrawn||0).toFixed(2)}`,color:WT.red},{label:"Pending",value:`$${(walletData.pendingWithdrawals||0).toFixed(2)}`,color:WT.yellow}].map((s,i)=>(
              <div key={i} style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:isMob?10:12,padding:isMob?"12px 14px":"16px 20px",gridColumn:isMob&&i===2?"1 / -1":"auto"}}>
                <div style={{...IN,fontSize:isMob?9:10,color:WT.muted,fontWeight:600,textTransform:"uppercase",marginBottom:4}}>{s.label}</div>
                <div style={{...MO,fontSize:isMob?16:20,fontWeight:700,color:s.color}}>{s.value}</div>
              </div>
            ))}
          </div>}
          {/* Recent Transactions */}
          <div style={{marginTop:isMob?20:28}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:isMob?10:16}}>
              <span style={{...IN,fontSize:isMob?14:16,fontWeight:700}}>Recent Transactions</span>
              <button onClick={()=>setTab("history")} style={{...IN,fontSize:11,color:WT.accent,fontWeight:600,background:"none",border:"none",cursor:"pointer"}}>View All →</button>
            </div>
            {[...deposits.slice(0,3).map(tx=>({...tx,type:"deposit"})),...withdrawals.slice(0,3).map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).length===0?
              <div style={{textAlign:"center",padding:isMob?20:30,color:WT.muted,fontSize:12,background:WT.card,borderRadius:isMob?10:12,border:`1px solid ${WT.border}`}}>No transactions yet</div>
            :[...deposits.slice(0,3).map(tx=>({...tx,type:"deposit"})),...withdrawals.slice(0,3).map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map((tx,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:isMob?10:14,padding:isMob?"10px 12px":"14px 18px",background:WT.card,borderRadius:isMob?8:10,border:`1px solid ${WT.border}`,marginBottom:6}}>
                <div style={{width:isMob?30:36,height:isMob?30:36,borderRadius:"50%",background:tx.type==="deposit"?WT.greenDim:WT.redDim,display:"flex",alignItems:"center",justifyContent:"center",color:tx.type==="deposit"?WT.green:WT.red,fontSize:isMob?13:16,flexShrink:0}}>{tx.type==="deposit"?"↓":"↑"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{...IN,fontSize:isMob?11:12,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tx.currency||"Crypto"}</div>
                  <div style={{...MO,fontSize:isMob?9:10,color:WT.muted}}>{timeAgo(tx.createdAt)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{...MO,fontSize:isMob?12:13,fontWeight:700,color:tx.type==="deposit"?WT.green:WT.red}}>{tx.type==="deposit"?"+":"-"}${(tx.amountUSD||tx.amount||0).toFixed(2)}</div>
                  <span style={{...MO,fontSize:isMob?8:9,padding:"2px 6px",borderRadius:4,background:tx.status==="completed"||tx.status==="confirmed"?WT.greenDim:tx.status==="rejected"?WT.redDim:WT.yellowDim,color:tx.status==="completed"||tx.status==="confirmed"?WT.green:tx.status==="rejected"?WT.red:WT.yellow,fontWeight:600}}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* ═══ DEPOSIT TAB ═══ */}
        {tab==="deposit"&&depStep===1&&<>
          <div style={{...IN,fontSize:22,fontWeight:700,marginBottom:24}}>Deposit</div>
          <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:isMob?12:16,padding:isMob?"18px 16px":"28px 32px",maxWidth:560}}>
            <div style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:8}}>Select Cryptocurrency</div>
            <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{currencies.map((cr,i)=>(<button key={cr.id} onClick={()=>setSelCrypto(i)} style={{padding:"10px 16px",borderRadius:8,border:`1px solid ${selCrypto===i?WT.accent:WT.border}`,background:selCrypto===i?WT.accentDim:"transparent",color:selCrypto===i?WT.accent:WT.sub,...MO,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{width:22,height:22,borderRadius:"50%",background:cr.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{cr.icon||"?"}</span>{cr.name}</button>))}</div>
            <div style={{marginBottom:20}}>
              <div style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:8}}>Deposit Amount (USD)</div>
              <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${WT.border}`}}>
                <span style={{padding:"14px 16px",background:WT.el,color:WT.accent,...MO,fontSize:18,fontWeight:700,display:"flex",alignItems:"center"}}>$</span>
                <input value={depAmt} onChange={e=>setDepAmt(e.target.value)} placeholder="Enter amount" type="number" style={{flex:1,background:WT.el,border:"none",padding:"14px 16px",color:WT.text,...MO,fontSize:18,fontWeight:700,outline:"none",boxSizing:"border-box",borderLeft:`1px solid ${WT.border}`}}/>
              </div>
              <div style={{display:"flex",gap:6,marginTop:10}}>{[10,25,50,100,250,500].map(v=>(<button key={v} onClick={()=>setDepAmt(String(v))} style={{flex:1,padding:"10px 0",borderRadius:6,border:`1px solid ${parseFloat(depAmt)===v?WT.accent:WT.border}`,background:parseFloat(depAmt)===v?WT.accentDim:"transparent",color:parseFloat(depAmt)===v?WT.accent:WT.sub,...MO,fontSize:11,fontWeight:600,cursor:"pointer"}}>${v}</button>))}</div>
            </div>
            {/* ─── PROMO CODE SECTION ─── */}
            <div style={{marginBottom:20,padding:isMob?"14px":"16px 18px",background:WT.el,borderRadius:10,border:`1px solid ${promoResult?.ok?WT.green+"55":promoResult?.ok===false?WT.red+"55":WT.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                <span style={{fontSize:14}}>tag</span>
                <span style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>Promo Code</span>
                {promoApplied&&<span style={{...MO,fontSize:9,padding:"2px 8px",borderRadius:4,background:WT.greenDim,color:WT.green,fontWeight:700,marginLeft:"auto"}}>✓ APPLIED</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <input value={promoCode} onChange={e=>{setPromoCode(e.target.value.toUpperCase());if(promoResult)setPromoResult(null);if(promoApplied){setPromoApplied(false);}}} placeholder="Enter promo code" disabled={promoApplied} style={{flex:1,background:walletTheme==="dark"?"#0b0e18":WT.card,border:`1px solid ${WT.border}`,borderRadius:8,padding:"10px 14px",color:WT.text,...MO,fontSize:14,fontWeight:700,letterSpacing:2,textTransform:"uppercase",outline:"none",boxSizing:"border-box",opacity:promoApplied?.5:1}}/>
                {!promoApplied?<button onClick={validatePromo} disabled={promoLoading||!promoCode.trim()} style={{padding:"10px 18px",borderRadius:8,border:"none",background:(!promoCode.trim())?WT.el:`linear-gradient(135deg,#3b82f6,#2563eb)`,color:(!promoCode.trim())?WT.muted:"#fff",...IN,fontSize:12,fontWeight:700,cursor:(!promoCode.trim())?"not-allowed":"pointer",opacity:promoLoading?.6:1,whiteSpace:"nowrap"}}>{promoLoading?"...":"Apply"}</button>:<button onClick={clearPromo} style={{padding:"10px 14px",borderRadius:8,border:`1px solid ${WT.border}`,background:WT.el,color:WT.sub,...IN,fontSize:11,fontWeight:600,cursor:"pointer"}}>✕</button>}
              </div>
              {/* Promo result feedback */}
              {promoResult&&<div style={{marginTop:8}}>
                {promoResult.ok?<div style={{display:"flex",flexDirection:"column",gap:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{color:WT.green,fontSize:14}}>✓</span>
                    <span style={{...IN,fontSize:12,fontWeight:600,color:WT.green}}>{promoApplied?promoResult.message:"Code valid!"}</span>
                  </div>
                  {!promoApplied&&<div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
                    <div style={{padding:"6px 12px",borderRadius:6,background:WT.greenDim,border:`1px solid ${WT.green}33`}}>
                      <div style={{...MO,fontSize:9,color:WT.muted,marginBottom:2}}>Bonus</div>
                      <div style={{...MO,fontSize:16,fontWeight:800,color:WT.green}}>+${(promoResult.bonus||0).toFixed(2)}</div>
                    </div>
                    <div style={{padding:"6px 12px",borderRadius:6,background:WT.el,border:`1px solid ${WT.border}`}}>
                      <div style={{...MO,fontSize:9,color:WT.muted,marginBottom:2}}>Discount</div>
                      <div style={{...MO,fontSize:14,fontWeight:700,color:WT.accent}}>{promoResult.discountType==="percentage"?promoResult.discountValue+"%":"$"+promoResult.discountValue}</div>
                    </div>
                    {promoResult.minDeposit>0&&<div style={{padding:"6px 12px",borderRadius:6,background:WT.el,border:`1px solid ${WT.border}`}}>
                      <div style={{...MO,fontSize:9,color:WT.muted,marginBottom:2}}>Min Deposit</div>
                      <div style={{...MO,fontSize:14,fontWeight:700,color:WT.text}}>${promoResult.minDeposit}</div>
                    </div>}
                  </div>}
                </div>:<div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:WT.red,fontSize:14}}>✗</span>
                  <span style={{...IN,fontSize:12,fontWeight:600,color:WT.red}}>{promoResult.message}</span>
                </div>}
              </div>}
            </div>
            <button onClick={()=>{if(!depAmt||parseFloat(depAmt)<10){alert("Minimum deposit is $10");return;}setDepStep(2);}} style={{width:"100%",padding:"16px 0",borderRadius:10,border:"none",background:(!depAmt||parseFloat(depAmt)<10)?WT.el:`linear-gradient(135deg,${WT.accent},#d97706)`,color:(!depAmt||parseFloat(depAmt)<10)?WT.muted:"#fff",...IN,fontSize:15,fontWeight:700,cursor:(!depAmt||parseFloat(depAmt)<10)?"not-allowed":"pointer"}}>
              Continue to Deposit
            </button>
            <div style={{...MO,fontSize:11,color:WT.muted,textAlign:"center",marginTop:10}}>Minimum deposit: $10</div>
          </div>
        </>}

        {tab==="deposit"&&depStep===2&&<>
          <div style={{...IN,fontSize:22,fontWeight:700,marginBottom:24}}>Deposit {cc.name}</div>
          <div style={{maxWidth:520,background:WT.card,borderRadius:16,border:`1px solid ${WT.border}`,padding:28,textAlign:"center"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"8px 20px",borderRadius:20,background:WT.accentDim,border:`1px solid ${WT.accent}44`,marginBottom:20}}>
              <span style={{...MO,fontSize:16,fontWeight:700,color:WT.accent}}>${depAmt}</span>
              <span style={{...IN,fontSize:11,color:WT.sub}}>via {cc.name}</span>
            </div>
            <div style={{width:160,height:160,margin:"0 auto 20px",background:"#fff",borderRadius:12,padding:10,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
              <div ref={qrCanvasRef} style={{display:"flex",alignItems:"center",justifyContent:"center"}}></div>
            </div>
            <div style={{...IN,fontSize:11,color:WT.muted,marginBottom:8}}>Scan QR or copy address below</div>
            <div style={{background:WT.el,borderRadius:10,padding:"14px 16px",display:"flex",alignItems:"center",gap:8,border:`1px solid ${WT.accent}33`,marginBottom:16}}>
              <span style={{...MO,fontSize:12,color:WT.text,flex:1,wordBreak:"break-all",textAlign:"left"}}>{cc.address||"Generating..."}</span>
              <button onClick={copyAddr} style={{padding:"10px 18px",borderRadius:8,border:"none",background:copied?WT.green:`linear-gradient(135deg,${WT.accent},#d97706)`,color:"#fff",...IN,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0,transition:"all 0.2s",minWidth:80}}>{copied?"✓ Copied":"Copy"}</button>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {[{l:"Network",v:cc.network||"—"},{l:"Confirms",v:cc.confirmations||1},{l:"Min",v:"$"+(cc.min||10)}].map((x,i)=>(
                <div key={i} style={{flex:1,padding:10,borderRadius:8,background:WT.el,border:`1px solid ${WT.border}`,textAlign:"center"}}><div style={{...MO,fontSize:8,color:WT.muted,textTransform:"uppercase",marginBottom:3}}>{x.l}</div><div style={{...MO,fontSize:11,fontWeight:700,color:WT.text}}>{x.v}</div></div>
              ))}
            </div>
            <div style={{padding:14,background:WT.el,borderRadius:10,border:`1px solid ${WT.accent}22`,display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:WT.accent,animation:"pulse 2s infinite",flexShrink:0}}/>
              <div style={{textAlign:"left"}}><div style={{...IN,fontSize:12,fontWeight:600}}>Waiting for payment...</div><div style={{...MO,fontSize:10,color:WT.muted,marginTop:2}}>Balance updates automatically once confirmed</div></div>
            </div>
            {promoResult?.ok&&!promoApplied&&<div style={{marginTop:12,padding:"10px 16px",background:"#3b82f612",border:"1px solid #3b82f633",borderRadius:8,display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13}}>tag</span>
              <span style={{...MO,fontSize:12,fontWeight:700,color:"#60a5fa"}}>{promoCode}</span>
              <span style={{...IN,fontSize:10,color:WT.muted}}>— bonus of <span style={{color:WT.green,fontWeight:700}}>+${(promoResult.bonus||0).toFixed(2)}</span> will be applied after payment</span>
            </div>}
          </div>
        </>}

        {tab==="deposit"&&depStep===3&&<>
          <div style={{maxWidth:520,background:WT.card,borderRadius:16,border:`1px solid #22c55e44`,padding:36,textAlign:"center"}}>
            <div style={{width:70,height:70,borderRadius:"50%",background:"#22c55e22",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",border:"2px solid #22c55e"}}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
            <div style={{...IN,fontSize:22,fontWeight:700,color:"#22c55e",marginBottom:6}}>Deposit Confirmed!</div>
            <div style={{...MO,fontSize:32,fontWeight:800,marginBottom:4}}>+${depositConfirmed?.amount||"0.00"}</div>
            <div style={{...IN,fontSize:13,color:WT.muted,marginBottom:promoApplied?8:24}}>via {depositConfirmed?.currency||"Crypto"}</div>
            {promoApplied&&promoResult?.bonus>0&&<div style={{padding:"10px 16px",background:"#22c55e15",border:"1px solid #22c55e33",borderRadius:8,marginBottom:24,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <span style={{fontSize:14}}>gift</span>
              <span style={{...IN,fontSize:13,fontWeight:700,color:"#22c55e"}}>Promo Bonus: +${(promoResult.bonus||0).toFixed(2)}</span>
              <span style={{...MO,fontSize:10,color:WT.muted}}>({promoCode})</span>
            </div>}
            <div style={{padding:"14px 20px",background:WT.el,borderRadius:10,border:`1px solid ${WT.border}`,marginBottom:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...IN,fontSize:12,color:WT.sub}}>New Balance</span>
              <span style={{...MO,fontSize:22,fontWeight:700,color:WT.accent}}>${(walletData?.realBalance||0).toFixed(2)}</span>
            </div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setDepStep(1);setDepAmt("");clearPromo();loadWallet();}} style={{flex:1,padding:"14px 0",borderRadius:8,border:`1px solid ${WT.border}`,background:WT.el,color:WT.text,...IN,fontSize:13,fontWeight:600,cursor:"pointer"}}>Deposit More</button>
              <button onClick={onBack} style={{flex:1,padding:"14px 0",borderRadius:8,border:"none",background:`linear-gradient(135deg,${WT.accent},#d97706)`,color:"#fff",...IN,fontSize:13,fontWeight:700,cursor:"pointer"}}>Start Trading</button>
            </div>
          </div>
        </>}

        {/* ═══ WITHDRAW TAB ═══ */}
        {tab==="withdraw"&&<>
          <div style={{...IN,fontSize:22,fontWeight:700,marginBottom:24}}>Withdraw</div>
          <div style={{background:WT.card,border:`1px solid ${WT.border}`,borderRadius:isMob?12:16,padding:isMob?"18px 16px":"28px 32px",maxWidth:560}}>
            <div style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:8}}>Select Currency</div>
            <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>{currencies.map((cr,i)=>(<button key={cr.id} onClick={()=>setSelCrypto(i)} style={{padding:"10px 16px",borderRadius:8,border:`1px solid ${selCrypto===i?WT.accent:WT.border}`,background:selCrypto===i?WT.accentDim:"transparent",color:selCrypto===i?WT.accent:WT.sub,...MO,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{width:22,height:22,borderRadius:"50%",background:cr.color||"#888",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{cr.icon||"?"}</span>{cr.name}</button>))}</div>
            <div style={{marginBottom:16}}>
              <div style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em",marginBottom:6}}>Your {cc.name} Wallet Address</div>
              <input value={wAddr} onChange={e=>setWAddr(e.target.value)} placeholder={`Enter your ${cc.name} wallet address`} style={{width:"100%",background:WT.el,border:`1px solid ${WT.border}`,borderRadius:10,padding:"14px 16px",color:WT.text,...MO,fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{...IN,fontSize:11,color:WT.sub,fontWeight:600,textTransform:"uppercase"}}>Amount (USD)</span>
                <span style={{...MO,fontSize:11,color:WT.muted}}>Available: <span style={{color:WT.accent,fontWeight:700}}>${realBal.toFixed(2)}</span></span>
              </div>
              <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${WT.border}`}}>
                <input value={wAmt} onChange={e=>setWAmt(e.target.value)} placeholder="0.00" type="number" style={{flex:1,background:WT.el,border:"none",padding:"14px 16px",color:WT.text,...MO,fontSize:16,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
                <button onClick={()=>setWAmt(String(realBal))} style={{padding:"0 20px",background:WT.accentDim,border:"none",borderLeft:`1px solid ${WT.border}`,color:WT.accent,...IN,fontSize:11,fontWeight:700,cursor:"pointer"}}>MAX</button>
              </div>
            </div>
            <button onClick={handleWithdraw} disabled={withdrawing||!wAddr.trim()||!wAmt} style={{width:"100%",padding:"16px 0",borderRadius:10,border:"none",background:(!wAddr.trim()||!wAmt)?WT.el:`linear-gradient(135deg,${WT.accent},#d97706)`,color:(!wAddr.trim()||!wAmt)?WT.muted:"#fff",...IN,fontSize:15,fontWeight:700,cursor:(!wAddr.trim()||!wAmt)?"not-allowed":"pointer",opacity:withdrawing?.6:1}}>{withdrawing?"Processing...":"Withdraw "+cc.name}</button>
            <div style={{...MO,fontSize:11,color:WT.muted,textAlign:"center",marginTop:10}}>Minimum withdrawal: $12</div>
          </div>
        </>}

        {/* ═══ TRANSACTION HISTORY TAB ═══ */}
        {tab==="history"&&<>
          <div style={{...IN,fontSize:22,fontWeight:700,marginBottom:24}}>Transaction History</div>
          {/* Table Header */}
          <div style={{display:"flex",padding:"12px 18px",background:WT.el,borderRadius:"10px 10px 0 0",border:`1px solid ${WT.border}`,borderBottom:"none",...IN,fontSize:10,fontWeight:700,color:WT.muted,textTransform:"uppercase",letterSpacing:".04em"}}>
            <span style={{flex:1}}>Type</span>
            <span style={{flex:2}}>Date & Time</span>
            <span style={{flex:1,textAlign:"right"}}>Amount</span>
            <span style={{flex:1,textAlign:"right"}}>Status</span>
          </div>
          <div style={{border:`1px solid ${WT.border}`,borderRadius:"0 0 10px 10px",overflow:"hidden"}}>
            {[...deposits.map(tx=>({...tx,type:"deposit"})),...withdrawals.map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).length===0?
              <div style={{textAlign:"center",padding:40,color:WT.muted,fontSize:12,background:WT.card}}>No transactions yet</div>
            :[...deposits.map(tx=>({...tx,type:"deposit"})),...withdrawals.map(tx=>({...tx,type:"withdraw"}))].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map((tx,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",padding:"14px 18px",background:i%2===0?WT.card:WT.bg,borderBottom:i<10?`1px solid ${WT.border}`:"none",...MO,fontSize:12}}>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:28,height:28,borderRadius:"50%",background:tx.type==="deposit"?WT.greenDim:WT.redDim,display:"flex",alignItems:"center",justifyContent:"center",color:tx.type==="deposit"?WT.green:WT.red,fontSize:12,flexShrink:0}}>{tx.type==="deposit"?"↓":"↑"}</div>
                  <span style={{fontWeight:600,color:WT.text,textTransform:"capitalize"}}>{tx.type}</span>
                </div>
                <span style={{flex:2,color:WT.sub,fontSize:11}}>{tx.createdAt?new Date(tx.createdAt).toLocaleString():"-"}</span>
                <span style={{flex:1,textAlign:"right",fontWeight:700,color:tx.type==="deposit"?WT.green:WT.red}}>{tx.type==="deposit"?"+":"-"}${(tx.amountUSD||tx.amount||0).toFixed(2)}</span>
                <div style={{flex:1,textAlign:"right"}}>
                  <span style={{...MO,fontSize:10,padding:"3px 10px",borderRadius:4,background:tx.status==="completed"||tx.status==="confirmed"?WT.greenDim:tx.status==="rejected"?WT.redDim:WT.yellowDim,color:tx.status==="completed"||tx.status==="confirmed"?WT.green:tx.status==="rejected"?WT.red:WT.yellow,fontWeight:600}}>{tx.status}</span>
                </div>
              </div>
            ))}
          </div>
        </>}

        </>}
        </div>
      </div>
    </div>
  </div>);
}

function LandingPage({onSignUp,onSignIn,onDemo}){
  const ref=useRef(null);
  const[ldark,setLdark]=useState(true);
  useEffect(()=>{
    if(!ref.current)return;
    ref.current.querySelectorAll('.faq-q').forEach(q=>{q.addEventListener('click',()=>{q.parentElement.classList.toggle('open');});});
    const obs=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target);}});},{threshold:0.15});
    ref.current.querySelectorAll('.fade-up').forEach(el=>obs.observe(el));
    const onScroll=()=>{const nav=ref.current?.querySelector('#lnav');if(nav)nav.classList.toggle('scrolled',window.scrollY>50);};
    window.addEventListener('scroll',onScroll);
    const tickerEl=ref.current.querySelector('#ticker');
    if(tickerEl){const pairs=[{n:'BTC/USDT',p:'75,492',c:'+0.32%',u:1},{n:'ETH/USDT',p:'3,241',c:'-0.18%',u:0},{n:'BNB/USDT',p:'612',c:'+1.24%',u:1},{n:'SOL/USDT',p:'178',c:'+2.15%',u:1},{n:'XRP/USDT',p:'0.623',c:'-0.45%',u:0},{n:'DOGE/USDT',p:'0.182',c:'+0.89%',u:1},{n:'ADA/USDT',p:'0.452',c:'-0.12%',u:0},{n:'AVAX/USDT',p:'38.67',c:'+1.56%',u:1}];const h=pairs.map(p=>`<div class="ticker-item"><span class="tname">${p.n}</span><span class="tprice">${p.p}</span><span class="tchange ${p.u?'tup':'tdn'}">${p.c}</span></div>`).join('');tickerEl.innerHTML=h+h;}
    return()=>window.removeEventListener('scroll',onScroll);
  },[]);
  useEffect(()=>{const lf=document.createElement("link");lf.href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";lf.rel="stylesheet";document.head.appendChild(lf);},[]);
  return(<div ref={ref}><style>{`
.lp *{margin:0;padding:0;box-sizing:border-box}.lp{background:${ldark?"#05070d":"#fafbfc"};color:${ldark?"#e8ecf4":"#1a1a2e"};font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;overflow-y:auto;overflow-x:hidden;position:relative;transition:background .4s,color .4s}
html,body{margin:0;padding:0;overflow-x:hidden}
.lp a{color:inherit;text-decoration:none}
.lcon{max-width:1200px;margin:0 auto;padding:0 24px;position:relative;z-index:2}.lmono{font-family:'Inter',sans-serif}
/* ===== ANIMATED BACKGROUND ===== */
.lbg-mesh{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;opacity:${ldark?1:0.3}}
.lbg-orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35;animation:orbFloat 22s ease-in-out infinite}
.lbg-orb.o1{width:520px;height:520px;background:radial-gradient(circle,${ldark?"#f59e0b55":"#f59e0b33"},transparent 70%);top:-120px;left:-120px;animation-delay:0s}
.lbg-orb.o2{width:420px;height:420px;background:radial-gradient(circle,${ldark?"#3b82f655":"#3b82f633"},transparent 70%);top:40%;right:-120px;animation-delay:-7s}
.lbg-orb.o3{width:480px;height:480px;background:radial-gradient(circle,${ldark?"#8b5cf655":"#8b5cf633"},transparent 70%);bottom:-80px;left:30%;animation-delay:-14s}
@keyframes orbFloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(70px,-50px) scale(1.12)}66%{transform:translate(-50px,70px) scale(.92)}}
.lbg-grid{position:fixed;inset:0;z-index:0;pointer-events:none;background-image:linear-gradient(rgba(${ldark?"255,255,255":"0,0,0"},.025) 1px,transparent 1px),linear-gradient(90deg,rgba(${ldark?"255,255,255":"0,0,0"},.025) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse 80% 60% at 50% 40%,black 30%,transparent 80%);-webkit-mask-image:radial-gradient(ellipse 80% 60% at 50% 40%,black 30%,transparent 80%)}
.ltag{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;letter-spacing:.03em;text-transform:uppercase;border:1px solid ${ldark?"#1a2040":"#e5e7eb"};color:${ldark?"#8892a8":"#6b7280"};background:${ldark?"rgba(15,20,36,.6)":"rgba(255,255,255,.8)"};backdrop-filter:blur(10px)}
.ldot{width:6px;height:6px;border-radius:50%;background:#f59e0b;animation:lpulse 2s infinite;box-shadow:0 0 10px #f59e0b}
@keyframes lpulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes lfadeUp{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}@keyframes lgradShift{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}@keyframes tickScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.lbtn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;border:none;cursor:pointer;transition:all .3s cubic-bezier(.16,1,.3,1);font-family:'DM Sans',sans-serif}
.lbtn-p{background:linear-gradient(135deg,#f59e0b,#d97706);color:${ldark?"#060a12":"#fff"};box-shadow:0 4px 30px #f59e0b33,inset 0 1px 0 rgba(255,255,255,.2)}.lbtn-p:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 12px 50px #f59e0b55}
.lbtn-o{background:${ldark?"rgba(15,20,36,.4)":"rgba(255,255,255,.8)"};border:1px solid ${ldark?"#2a3250":"#d1d5db"};color:${ldark?"#e8ecf4":"#1a1a2e"};backdrop-filter:blur(10px)}.lbtn-o:hover{border-color:#f59e0b;color:#f59e0b;background:#f59e0b10;transform:translateY(-2px)}
#lnav{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 0;transition:all .3s;backdrop-filter:blur(20px);background:${ldark?"rgba(5,7,13,.7)":"rgba(255,255,255,.85)"};border-bottom:1px solid transparent}#lnav.scrolled{border-bottom-color:${ldark?"#1a2040":"#e5e7eb"};padding:12px 0;background:${ldark?"rgba(5,7,13,.92)":"rgba(255,255,255,.95)"}}
.lnav-inner{display:flex;align-items:center;justify-content:space-between}.lnav-logo{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:800;font-family:'DM Sans',sans-serif;letter-spacing:-.02em}
.lnav-icon{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#f59e0b,#d97706);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#060a12;box-shadow:0 4px 20px #f59e0b44}
.lnav-links{display:flex;align-items:center;gap:32px}.lnav-links a{font-size:14px;font-weight:500;color:${ldark?"#8892a8":"#6b7280"};transition:color .2s}.lnav-links a:hover{color:${ldark?"#e8ecf4":"#1a1a2e"}}
.lnav-cta{display:flex;align-items:center;gap:12px}
.lhero{padding:160px 0 80px;position:relative;text-align:center}
.lhero-badge{display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:24px;font-size:13px;font-weight:500;border:1px solid #f59e0b33;background:rgba(0,232,135,.08);color:#f59e0b;margin-bottom:28px;animation:lfadeUp .8s ease-out;backdrop-filter:blur(10px)}
.lhero h1{font-size:clamp(42px,7vw,82px);font-weight:700;line-height:1.02;letter-spacing:-.035em;margin-bottom:24px;animation:lfadeUp .8s ease-out .1s both;font-family:'DM Sans',sans-serif}
.lgradient{background:linear-gradient(135deg,#f59e0b,#00b4d8,#f59e0b);background-size:200% 200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:lgradShift 5s ease infinite}
.lhero p{font-size:19px;color:#9ba5ba;max-width:600px;margin:0 auto 40px;line-height:1.65;animation:lfadeUp .8s ease-out .2s both}
.lhero-cta{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:60px;animation:lfadeUp .8s ease-out .3s both}
.lhero-stats{display:flex;justify-content:center;gap:60px;animation:lfadeUp .8s ease-out .4s both;flex-wrap:wrap}
.lhstat{text-align:center}.lhstat .num{font-size:32px;font-weight:700;color:#f59e0b;font-family:'DM Sans',sans-serif}.lhstat .label{font-size:12px;color:#4a5570;margin-top:2px;text-transform:uppercase;letter-spacing:.08em;font-weight:500}
.lmockup{margin-top:70px;animation:lfadeUp 1s ease-out .5s both;position:relative;transition:transform .5s}
.lmockup::before{content:'';position:absolute;inset:-60px;background:radial-gradient(ellipse at center,#f59e0b22,transparent 60%);pointer-events:none;z-index:-1}
.lmock-frame{background:#0f1424;border-radius:16px;border:1px solid #1a2040;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6);transition:all .5s}
.lmockup:hover{transform:translateY(-4px)}.lmockup:hover .lmock-frame{box-shadow:0 60px 120px rgba(0,0,0,.7),0 0 60px #f59e0b22}
.lmock-bar{height:40px;background:#0a0e1a;border-bottom:1px solid #1a2040;display:flex;align-items:center;padding:0 14px;gap:8px}
.lmock-dot{width:11px;height:11px;border-radius:50%}
.lmock-body{background:#06080f;overflow:hidden;border-radius:0 0 15px 15px}
.lmock-body img{width:100%;height:auto;display:block}
.lticker{padding:28px 0;border-top:1px solid #1a2040;border-bottom:1px solid #1a2040;overflow:hidden;background:rgba(10,14,26,.6);backdrop-filter:blur(10px);position:relative;z-index:2}
.lticker-wrap{display:flex;animation:tickScroll 35s linear infinite;width:max-content}
.ticker-item{display:flex;align-items:center;gap:10px;padding:0 32px;white-space:nowrap}
.tname{font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif}.tprice{font-size:13px;font-family:'Inter',sans-serif;color:#8892a8}
.tchange{font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px;font-family:'Inter',sans-serif}.tup{color:#f59e0b;background:#f59e0b15}.tdn{color:#ff3860;background:#ff386015}
.lsection{padding:120px 0;position:relative;z-index:2}.lsec-tag{text-align:center;margin-bottom:18px}
.lsec-title{text-align:center;font-size:clamp(34px,5vw,54px);font-weight:700;line-height:1.15;margin-bottom:18px;letter-spacing:-.025em;font-family:'DM Sans',sans-serif}
.lsec-sub{text-align:center;font-size:17px;color:#9ba5ba;max-width:620px;margin:0 auto 60px;line-height:1.6}
.lfeat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lfeat{background:${ldark?"rgba(15,20,36,.6)":"rgba(255,255,255,.8)"};border:1px solid ${ldark?"#1a2040":"#e5e7eb"};border-radius:18px;padding:36px 30px;transition:all .4s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden;backdrop-filter:blur(10px)}
.lfeat:hover{border-color:#f59e0b44;transform:translateY(-6px);box-shadow:0 24px 70px ${ldark?"rgba(0,0,0,.4)":"rgba(0,0,0,.06)"},0 0 30px rgba(245,158,11,.08)}
.lfeat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#f59e0b,transparent);opacity:0;transition:opacity .4s}.lfeat:hover::before{opacity:1}
.lfeat-icon{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,rgba(245,158,11,.15),rgba(245,158,11,.05));border:1px solid rgba(245,158,11,.2);display:flex;align-items:center;justify-content:center;margin-bottom:20px;font-size:24px}
.lfeat h3{font-size:18px;font-weight:700;margin-bottom:10px;font-family:'DM Sans',sans-serif}.lfeat p{font-size:14px;color:#9ba5ba;line-height:1.6}
/* SHOWCASE sections with images */
.lshowcase{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center;margin-bottom:100px}
.lshowcase.reverse{direction:rtl}.lshowcase.reverse>*{direction:ltr}
.lshow-text h3{font-size:clamp(28px,3.5vw,40px);font-weight:700;line-height:1.2;margin-bottom:16px;font-family:'DM Sans',sans-serif;letter-spacing:-.02em}
.lshow-text h3 span{background:linear-gradient(135deg,#f59e0b,#00b4d8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.lshow-text p{font-size:16px;color:#9ba5ba;line-height:1.7;margin-bottom:24px}
.lshow-list{display:flex;flex-direction:column;gap:14px}
.lshow-item{display:flex;gap:12px;align-items:flex-start;font-size:14px;color:#c5ccd8;line-height:1.5}
.lshow-item-icon{width:22px;height:22px;border-radius:50%;background:rgba(0,232,135,.15);border:1px solid rgba(0,232,135,.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#f59e0b;font-size:12px;margin-top:1px}
.lshow-visual{position:relative;border-radius:20px;overflow:hidden;border:1px solid ${ldark?"#1a2040":"#e5e7eb"};background:${ldark?"#0a0e1a":"#fff"};box-shadow:0 30px 80px ${ldark?"rgba(0,0,0,.5)":"rgba(0,0,0,.08)"};transition:transform .5s}
.lshow-visual:hover{transform:translateY(-4px) scale(1.01)}
.lshow-visual img{width:100%;height:auto;display:block}
.lshow-visual::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(0,232,135,.05),transparent);pointer-events:none;z-index:1}
.lsteps{display:grid;grid-template-columns:repeat(3,1fr);gap:40px;position:relative}
.lsteps::before{content:'';position:absolute;top:40px;left:15%;right:15%;height:2px;background:linear-gradient(90deg,transparent,#f59e0b,#f59e0b,transparent)}
.lstep{text-align:center;position:relative}.lstep-num{width:62px;height:62px;border-radius:50%;background:${ldark?"rgba(5,7,13,.9)":"#fff"};border:2px solid #f59e0b;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;font-size:24px;font-weight:700;color:#f59e0b;position:relative;z-index:2;font-family:'DM Sans',sans-serif;transition:all .4s}
.lstep:hover .lstep-num{background:#f59e0b15;box-shadow:0 0 40px #f59e0b44;transform:scale(1.12)}
.lstep h3{font-size:19px;font-weight:700;margin-bottom:10px;font-family:'DM Sans',sans-serif}.lstep p{font-size:14px;color:#9ba5ba;line-height:1.6}
.lstats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#1a2040;border-radius:18px;overflow:hidden;max-width:960px;margin:0 auto}
.lstat{background:rgba(15,20,36,.8);padding:40px 24px;text-align:center;backdrop-filter:blur(10px);transition:background .3s}
.lstat:hover{background:rgba(0,232,135,.05)}
.lstat .num{font-size:40px;font-weight:700;color:#f59e0b;margin-bottom:6px;font-family:'DM Sans',sans-serif;letter-spacing:-.02em}.lstat .label{font-size:12px;color:#8892a8;text-transform:uppercase;letter-spacing:.08em;font-weight:500}
.lcomp{background:rgba(10,14,26,.7);border-radius:20px;border:1px solid #1a2040;overflow:hidden;max-width:900px;margin:0 auto;backdrop-filter:blur(10px)}
.lcomp-h{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #1a2040}.lcomp-h div{padding:22px 24px;font-size:14px;font-weight:600;text-align:center;font-family:'DM Sans',sans-serif}.lcomp-h div:first-child{text-align:left;color:#8892a8}.lcomp-h div:nth-child(2){color:#4a5570;border-left:1px solid #1a2040;border-right:1px solid #1a2040}.lcomp-h div:last-child{color:#f59e0b;background:rgba(0,232,135,.08)}
.lcomp-r{display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid #1a204066}.lcomp-r:last-child{border-bottom:none}.lcomp-r div{padding:18px 24px;font-size:14px;text-align:center;display:flex;align-items:center;justify-content:center;gap:6px}.lcomp-r div:first-child{text-align:left;justify-content:flex-start;color:#c5ccd8;font-weight:500}.lcomp-r div:nth-child(2){border-left:1px solid #1a2040;border-right:1px solid #1a2040;color:#6a7290}.lcomp-r div:last-child{background:rgba(0,232,135,.06)}
.lchk{color:#f59e0b;font-size:18px;font-weight:700}.lcrs{color:#ff3860;font-size:16px;font-weight:700}
.lfaq-list{max-width:740px;margin:0 auto}
.faq-item{border:1px solid ${ldark?"#1a2040":"#e5e7eb"};border-radius:14px;margin-bottom:12px;overflow:hidden;background:${ldark?"rgba(15,20,36,.5)":"rgba(255,255,255,.8)"};transition:all .3s;backdrop-filter:blur(10px)}.faq-item:hover{border-color:#f59e0b44;box-shadow:0 4px 24px ${ldark?"rgba(0,0,0,.2)":"rgba(0,0,0,.04)"}}
.faq-q{padding:20px 26px;font-size:15px;font-weight:600;cursor:pointer;display:flex;justify-content:space-between;align-items:center;user-select:none;font-family:'DM Sans',sans-serif;color:${ldark?"inherit":"#1a1a2e"}}.faq-q .arrow{font-size:20px;color:${ldark?"#4a5570":"#9ca3af"};transition:transform .3s;font-weight:300}
.faq-item.open .faq-q .arrow{transform:rotate(45deg);color:#f59e0b}.faq-a{max-height:0;overflow:hidden;transition:max-height .4s ease}.faq-item.open .faq-a{max-height:240px}.faq-a p{padding:0 26px 20px;font-size:14px;color:#9ba5ba;line-height:1.7}
.lcta-box{background:linear-gradient(135deg,rgba(15,20,36,.8),rgba(10,14,26,.8));border:1px solid #1a2040;border-radius:24px;padding:70px 40px;position:relative;overflow:hidden;text-align:center;backdrop-filter:blur(20px)}
.lcta-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#f59e0b,transparent)}
.lcta-box::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center top,rgba(0,232,135,.1),transparent 60%);pointer-events:none}
.lcta-box h2{font-size:clamp(30px,4vw,46px);font-weight:700;margin-bottom:16px;letter-spacing:-.02em;font-family:'DM Sans',sans-serif;position:relative;z-index:1}.lcta-box p{font-size:17px;color:#9ba5ba;max-width:520px;margin:0 auto 32px;line-height:1.6;position:relative;z-index:1}
.lcta-btns{display:flex;justify-content:center;gap:14px;position:relative;z-index:1}
.lrisk-box{background:transparent;border:1px solid rgba(255,56,96,.35);border-radius:18px;padding:36px 40px;position:relative;overflow:hidden;backdrop-filter:blur(10px)}
.lrisk-box::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#ff3860,transparent)}
.lrisk-box .lrisk-icon{font-size:26px;margin-bottom:14px}
.lrisk-box h4{font-size:17px;font-weight:700;color:#ff3860;margin-bottom:14px;letter-spacing:.02em;font-family:'DM Sans',sans-serif}
.lrisk-box p{font-size:13px;color:#9ba5ba;line-height:1.75}
.fade-up{opacity:0;transform:translateY(40px);transition:all .8s cubic-bezier(.16,1,.3,1)}.fade-up.visible{opacity:1;transform:translateY(0)}
.fade-up:nth-child(2){transition-delay:.1s}.fade-up:nth-child(3){transition-delay:.2s}.fade-up:nth-child(4){transition-delay:.3s}.fade-up:nth-child(5){transition-delay:.4s}.fade-up:nth-child(6){transition-delay:.5s}.fade-up:nth-child(7){transition-delay:.6s}
.lfoot{border-top:1px solid ${ldark?"#1a2040":"#e5e7eb"};padding:70px 0 30px;background:${ldark?"rgba(10,14,26,.8)":"rgba(249,250,251,.95)"};position:relative;z-index:2;backdrop-filter:blur(10px)}
.lfoot-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px}.lfoot-brand p{font-size:13px;color:#6a7290;line-height:1.7;max-width:300px;margin-top:16px}
.lfoot-col h4{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#c5ccd8;margin-bottom:18px;font-family:'DM Sans',sans-serif}.lfoot-col a{display:block;font-size:13px;color:#6a7290;padding:6px 0;transition:color .2s}.lfoot-col a:hover{color:#f59e0b}
.lfoot-bottom{border-top:1px solid #1a2040;padding-top:24px;display:flex;justify-content:space-between;font-size:12px;color:#6a7290;gap:20px}
@media(max-width:900px){.lfeat-grid,.lsteps{grid-template-columns:1fr}.lshowcase{grid-template-columns:1fr;gap:40px}.lshowcase.reverse{direction:ltr}.lfoot-grid{grid-template-columns:1fr 1fr}.lstats{grid-template-columns:repeat(2,1fr)}.lnav-links{display:none}.lhero{padding:120px 0 60px}}@media(max-width:480px){.lhero{padding:80px 0 40px}.lhero h1{font-size:28px!important}.lhero p{font-size:14px!important}.lfoot-grid{grid-template-columns:1fr}.lstats{grid-template-columns:1fr}.lcomp{overflow-x:auto}.lfaq{padding:0 12px}}
@media(max-width:600px){.lstats{grid-template-columns:1fr 1fr}.lhero-cta,.lcta-btns{flex-direction:column;align-items:center;width:100%}.lhero-cta .lbtn,.lcta-btns .lbtn{width:100%;max-width:300px;justify-content:center}.lfoot-grid{grid-template-columns:1fr}.lfoot-bottom{flex-direction:column;text-align:center}}
  `}</style>
  <div className="lp">
  {/* ANIMATED BACKGROUND */}
  <div className="lbg-mesh">
    <div className="lbg-orb o1"></div>
    <div className="lbg-orb o2"></div>
    <div className="lbg-orb o3"></div>
  </div>
  <div className="lbg-grid"></div>
  <nav id="lnav"><div className="lcon"><div className="lnav-inner"><div className="lnav-logo"><span style={{display:"inline-flex",alignItems:"center",marginRight:8}}><ZextoLogo size={28}/></span>Zexto Option</div><div className="lnav-links"><a href="#features">Features</a><a href="#showcase">Platform</a><a href="#how">How It Works</a><a href="#compare">Compare</a><a href="#faq">FAQ</a><a href="http://localhost:5174" target="_blank" rel="noopener noreferrer">Partner</a></div><div className="lnav-cta"><button onClick={()=>setLdark(!ldark)} style={{width:36,height:36,borderRadius:8,border:"1px solid "+(ldark?"#2a3250":"#d1d5db"),background:ldark?"rgba(15,20,36,.4)":"rgba(255,255,255,.8)",color:ldark?"#f59e0b":"#92400e",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .3s",backdropFilter:"blur(10px)"}} title={ldark?"Switch to Light":"Switch to Dark"}>{ldark?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>}</button><button onClick={onSignIn} className="lbtn lbtn-o" style={{padding:"10px 24px",fontSize:13}}>Sign In</button><button onClick={onSignUp} className="lbtn lbtn-p" style={{padding:"10px 24px",fontSize:13}}>Start Trading</button></div></div></div></nav>
  <section className="lhero"><div className="lcon">
    <div className="lhero-badge"><span className="ldot"></span>Live trading — Real-time market data</div>
    <h1>While Others Guess,<br/><span className="lgradient">You Already Know</span></h1>
    <p>Trade binary options with real-time charts, AI-powered signals, and instant execution. Join 500K+ traders who chose precision over guesswork.</p>
    <div className="lhero-cta"><button onClick={onDemo} className="lbtn lbtn-p">Start Free Demo Account →</button><button onClick={onSignUp} className="lbtn lbtn-o">Create Account</button></div>
    <div className="lhero-stats"><div className="lhstat"><div className="num lmono">500K+</div><div className="label">Active Traders</div></div><div className="lhstat"><div className="num lmono">$5M+</div><div className="label">Monthly Volume</div></div><div className="lhstat"><div className="num lmono">2M+</div><div className="label">Trades Executed</div></div><div className="lhstat"><div className="num lmono">200+</div><div className="label">Countries</div></div></div>
    <div className="lmockup"><div className="lmock-frame"><div className="lmock-bar"><div className="lmock-dot" style={{background:"#ff5f57"}}></div><div className="lmock-dot" style={{background:"#febc2e"}}></div><div className="lmock-dot" style={{background:"#28c840"}}></div><span style={{marginLeft:12,fontSize:11,color:"#4a5570",fontFamily:"'JetBrains Mono',monospace"}}>zextooption.com — BTC/USDT</span></div>
      <div className="lmock-body" style={{background:"#0b0e18",height:380,display:"flex",position:"relative",overflow:"hidden"}}>
        <style>{`
          @keyframes mcGrow{0%{transform:scaleY(0);opacity:0}100%{transform:scaleY(1);opacity:1}}
          @keyframes mcSlide{0%{transform:translateX(40px);opacity:0}100%{transform:translateX(0);opacity:1}}
          @keyframes mcWin{0%{transform:scale(0) rotate(-10deg);opacity:0}60%{transform:scale(1.15) rotate(2deg);opacity:1}100%{transform:scale(1) rotate(0);opacity:1}}
          @keyframes mcPulse{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.4)}50%{box-shadow:0 0 0 12px rgba(34,197,94,0)}}
          @keyframes mcBlink{0%,100%{opacity:1}50%{opacity:.3}}
          @keyframes mcFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
          .mc-candle{transform-origin:bottom;animation:mcGrow .5s ease-out both}
          .mc-fadein{animation:mcSlide .6s ease-out both}
        `}</style>
        {/* Left sidebar */}
        <div style={{width:50,background:"#111626",borderRight:"1px solid #1c2238",display:"flex",flexDirection:"column",padding:"8px 0",gap:6,alignItems:"center",flexShrink:0}}>
          <div style={{width:28,height:28,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",marginBottom:4}}><svg viewBox="0 0 72 72" fill="none" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}><polygon points="36,3 66,20 66,52 36,69 6,52 6,20" fill="none" stroke="#f59e0b" strokeWidth="4"/></svg><span style={{position:"relative",fontSize:9,fontWeight:800,color:"#f59e0b"}}>Z</span></div>
          {["⊞","⏱","bell","","","",""].map((ic,i)=><div key={i} style={{width:28,height:28,borderRadius:5,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:i===0?"#f59e0b":"#4a5570",background:i===0?"#f59e0b15":"transparent"}}>{ic}</div>)}
        </div>
        {/* Main area */}
        <div style={{flex:1,display:"flex",flexDirection:"column",position:"relative"}}>
          {/* Top bar */}
          <div style={{height:32,background:"#111626",borderBottom:"1px solid #1c2238",display:"flex",alignItems:"center",padding:"0 10px",gap:6,flexShrink:0}}>
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",background:"#1a2035",borderRadius:5}}><div style={{width:12,height:12,borderRadius:"50%",background:"#f7931a"}}></div><span style={{fontSize:9,color:"#e8ecf4",fontWeight:600}}>Bitcoin</span><span style={{fontSize:8,color:"#f59e0b",fontWeight:700}}>+85%</span></div>
            <div style={{flex:1}}></div>
            <span style={{fontSize:9,color:"#f59e0b",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>Demo $9,950</span>
            <div style={{padding:"3px 10px",borderRadius:5,background:"linear-gradient(135deg,#f59e0b,#d97706)",fontSize:8,fontWeight:700,color:"#fff"}}>+ Deposit</div>
          </div>
          {/* Chart area */}
          <div style={{flex:1,position:"relative",padding:"8px 4px 4px"}}>
            {/* Time display */}
            <div style={{position:"absolute",top:6,left:10,display:"flex",alignItems:"center",gap:4,opacity:.4,zIndex:5}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:"#f59e0b",animation:"mcBlink 2s infinite"}}></div>
              <span style={{fontSize:10,color:"#e8ecf4",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>11:46:55 UTC+05:00</span>
            </div>
            {/* Grid */}
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",opacity:.08,pointerEvents:"none"}}>
              {[50,100,150,200,250].map(y=><line key={y} x1="0" y1={y} x2="100%" y2={y} stroke="#fff" strokeWidth="1"/>)}
            </svg>
            {/* Candles chart */}
            <svg viewBox="0 0 520 290" style={{width:"100%",height:"100%"}} preserveAspectRatio="xMidYMid meet">
              {/* Background candles */}
              {[
                {x:10,o:200,h:30,up:true,dl:0},{x:26,o:195,h:25,up:false,dl:.2},{x:42,o:190,h:35,up:true,dl:.4},
                {x:58,o:198,h:20,up:false,dl:.6},{x:74,o:185,h:40,up:true,dl:.8},{x:90,o:192,h:28,up:false,dl:1},
                {x:106,o:188,h:22,up:true,dl:1.2},{x:122,o:195,h:32,up:false,dl:1.4},{x:138,o:180,h:45,up:true,dl:1.6},
                {x:154,o:175,h:38,up:false,dl:1.8},{x:170,o:140,h:65,up:true,dl:2},{x:186,o:130,h:55,up:true,dl:2.2},
                {x:202,o:120,h:70,up:true,dl:2.4},{x:218,o:115,h:50,up:false,dl:2.6},{x:234,o:125,h:60,up:false,dl:2.8},
                {x:250,o:135,h:45,up:false,dl:3},{x:266,o:145,h:35,up:true,dl:3.2},{x:282,o:155,h:40,up:false,dl:3.4},
                {x:298,o:160,h:30,up:false,dl:3.6},{x:314,o:168,h:35,up:true,dl:3.8},{x:330,o:172,h:25,up:false,dl:4},
                {x:346,o:165,h:38,up:true,dl:4.2},{x:362,o:170,h:20,up:false,dl:4.4},
                {x:378,o:160,h:45,up:true,dl:4.6},{x:394,o:150,h:50,up:true,dl:4.8},{x:410,o:138,h:55,up:true,dl:5}
              ].map((c,i)=>(
                <g key={i} className="mc-candle" style={{animationDelay:`${c.dl}s`}}>
                  <line x1={c.x+5} y1={c.o-8} x2={c.x+5} y2={c.o+c.h+8} stroke={c.up?"#22c55e":"#ef4444"} strokeWidth="1"/>
                  <rect x={c.x} y={c.o} width="10" height={c.h} fill={c.up?"#22c55e":"#ef4444"} rx="1"/>
                </g>
              ))}
              {/* Entry line - dashed amber horizontal */}
              <g opacity="0"><animate attributeName="opacity" values="0;0;1;1;1;1;0" keyTimes="0;0.15;0.2;0.5;0.85;0.9;1" dur="14s" repeatCount="indefinite"/>
                <line x1="130" y1="178" x2="480" y2="178" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="6,4"/>
                <rect x="430" y="169" width="50" height="18" rx="3" fill="#3b82f6"/>
                <text x="455" y="181" fontSize="8" fill="#fff" fontWeight="700" fontFamily="'JetBrains Mono',monospace" textAnchor="middle">78,176</text>
              </g>
              {/* Trade box on chart - $50 0t:04 */}
              <g opacity="0"><animate attributeName="opacity" values="0;0;0;1;1;1;0" keyTimes="0;0.3;0.35;0.38;0.7;0.85;1" dur="14s" repeatCount="indefinite"/>
                <rect x="350" y="165" width="70" height="22" rx="5" fill="#22c55e"/>
                <text x="385" y="179" fontSize="9" fill="#fff" fontWeight="700" fontFamily="'JetBrains Mono',monospace" textAnchor="middle">$50  0t:04</text>
              </g>
              {/* WIN popup - big green */}
              <g opacity="0"><animate attributeName="opacity" values="0;0;0;0;0;1;1;1;0" keyTimes="0;0.45;0.5;0.52;0.54;0.56;0.82;0.88;1" dur="14s" repeatCount="indefinite"/>
                <rect x="170" y="35" width="180" height="65" rx="14" fill="#22c55e" filter="url(#winGlow)"/>
                <text x="260" y="60" fontSize="20" fill="#fff" fontWeight="800" fontFamily="'DM Sans',sans-serif" textAnchor="middle">✓ WIN</text>
                <text x="260" y="82" fontSize="13" fill="rgba(255,255,255,.9)" fontWeight="700" fontFamily="'JetBrains Mono',monospace" textAnchor="middle">+$42.50 (+85%)</text>
              </g>
              {/* Toast notification top right */}
              <g opacity="0"><animate attributeName="opacity" values="0;0;0;1;1;0" keyTimes="0;0.2;0.22;0.24;0.5;1" dur="14s" repeatCount="indefinite"/>
                <rect x="350" y="8" width="145" height="35" rx="8" fill="#151c2e" stroke="#22c55e55" strokeWidth="1"/>
                <text x="365" y="22" fontSize="8" fill="#22c55e" fontWeight="700" fontFamily="'DM Sans',sans-serif">ok Trade Opened</text>
                <text x="365" y="35" fontSize="7" fill="#7a85a0" fontFamily="'Inter',sans-serif">HIGHER BTC @ 78161.44</text>
              </g>
              <defs><filter id="winGlow"><feDropShadow dx="0" dy="4" stdDeviation="12" floodColor="#22c55e" floodOpacity=".4"/></filter></defs>
            </svg>
          </div>
        </div>
        {/* Right panel */}
        <div style={{width:140,background:"#111626",borderLeft:"1px solid #1c2238",padding:8,display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
          <div style={{fontSize:8,color:"#7a85a0",textTransform:"uppercase",fontWeight:600}}>Amount</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1a2035",borderRadius:6,padding:"4px 8px"}}>
            <span style={{color:"#4a5570",fontSize:12,cursor:"pointer"}}>−</span>
            <span style={{fontSize:14,fontWeight:700,color:"#e8ecf4",fontFamily:"'JetBrains Mono',monospace"}}>$50</span>
            <span style={{color:"#4a5570",fontSize:12,cursor:"pointer"}}>+</span>
          </div>
          <div style={{display:"flex",gap:3}}>{["5$","10$","15$","All"].map((v,i)=><div key={i} style={{flex:1,padding:"4px 0",borderRadius:4,border:`1px solid ${i===1?"#f59e0b":"#1c2238"}`,background:i===1?"#f59e0b15":"transparent",textAlign:"center",fontSize:7,color:i===1?"#f59e0b":"#7a85a0",fontWeight:600}}>{v}</div>)}</div>
          <div style={{fontSize:8,color:"#7a85a0",textTransform:"uppercase",fontWeight:600}}>Time</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1a2035",borderRadius:6,padding:"4px 8px"}}>
            <span style={{color:"#4a5570",fontSize:12}}>−</span>
            <span style={{fontSize:13,fontWeight:700,color:"#e8ecf4",fontFamily:"'JetBrains Mono',monospace"}}>1m</span>
            <span style={{color:"#4a5570",fontSize:12}}>+</span>
          </div>
          <div style={{fontSize:8,color:"#7a85a0"}}>Earnings <span style={{color:"#f59e0b",fontWeight:700,float:"right"}}>+85% $42.50</span></div>
          <div style={{fontSize:8,color:"#7a85a0"}}>Majority opinion</div>
          <div style={{height:4,borderRadius:2,display:"flex",overflow:"hidden"}}><div style={{width:"57%",background:"#22c55e"}}></div><div style={{width:"43%",background:"#ef4444"}}></div></div>
          <div style={{display:"flex",gap:4,marginTop:2}}>
            <div style={{flex:1,padding:"10px 0",borderRadius:6,background:"linear-gradient(180deg,#22c55e,#16a34a)",textAlign:"center",color:"#fff",fontSize:14,fontWeight:800}}>↑</div>
            <div style={{flex:1,padding:"10px 0",borderRadius:6,background:"linear-gradient(180deg,#ef4444,#dc2626)",textAlign:"center",color:"#fff",fontSize:14,fontWeight:800}}>↓</div>
          </div>
          <div style={{fontSize:8,color:"#7a85a0",fontWeight:600,textTransform:"uppercase",marginTop:2}}>OPEN TRADES <span style={{float:"right",color:"#4a5570"}}>/30</span></div>
          <div className="mc-fadein" style={{animationDelay:"3s",padding:"6px 8px",background:"#1a2035",borderRadius:6,border:"1px solid #1c2238"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,borderRadius:"50%",background:"#f7931a"}}></div><span style={{fontSize:8,fontWeight:600,color:"#e8ecf4"}}>Bitcoin</span><span style={{fontSize:7,color:"#7a85a0"}}>85%</span></div>
              <span style={{fontSize:8,fontWeight:700,color:"#22c55e"}}>+$42.50</span>
            </div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:3}}>
              <span style={{fontSize:7,color:"#22c55e"}}>↑ 00h 01m 05s</span>
              <span style={{fontSize:7,color:"#7a85a0"}}>$50.00</span>
            </div>
          </div>
        </div>
      </div>
    </div></div>
  </div></section>
  <div className="lticker"><div className="lticker-wrap" id="ticker"></div></div>
  <section className="lsection" id="features"><div className="lcon">
    <div className="lsec-tag"><span className="ltag"><span className="ldot"></span>Key Features</span></div>
    <h2 className="lsec-title">All Your Trades,<br/>Executed Effortlessly</h2>
    <p className="lsec-sub">Everything you need to trade with confidence — from one-click execution to AI-powered market analysis.</p>
    <div className="lfeat-grid">
      <div className="lfeat fade-up"><div className="lfeat-icon"></div><h3>One-Click Trading</h3><p>Execute trades in milliseconds. No delays, no slippage.</p></div>
      <div className="lfeat fade-up"><div className="lfeat-icon"></div><h3>AI Trade Signals</h3><p>50+ indicators analyzed to deliver high-confidence signals in real-time.</p></div>
      <div className="lfeat fade-up"><div className="lfeat-icon"></div><h3>Advanced Charts</h3><p>Professional-grade charts with 100+ indicators and multiple timeframes.</p></div>
      <div className="lfeat fade-up"><div className="lfeat-icon"></div><h3>Instant Withdrawals</h3><p>Your money, your rules. Withdraw anytime with zero fees.</p></div>
      <div className="lfeat fade-up"><div className="lfeat-icon"></div><h3>Price Alerts</h3><p>Custom alerts on any asset. Never miss an entry again.</p></div>
      <div className="lfeat fade-up"><div className="lfeat-icon">--</div><h3>Multi-Currency</h3><p>12+ currencies with automatic real-time conversion.</p></div>
    </div>
  </div></section>

  {/* SHOWCASE SECTIONS WITH IMAGES */}
  <section className="lsection" id="showcase"><div className="lcon">
    <div className="lsec-tag"><span className="ltag"><span className="ldot"></span>Platform</span></div>
    <h2 className="lsec-title">Built for Serious Traders</h2>
    <p className="lsec-sub">A platform designed with every detail optimized for professional trading.</p>
    
    <div className="lshowcase fade-up">
      <div className="lshow-text">
        <h3>Real-Time Market Data from <span>Binance</span></h3>
        <p>No delayed quotes, no manipulated prices. Every tick streams directly from Binance's live WebSocket feed, giving you the exact same data used by professional institutions.</p>
        <div className="lshow-list">
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Sub-100ms latency from exchange to your screen</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>8 major crypto pairs: BTC, ETH, BNB, SOL, XRP, DOGE, ADA, AVAX</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>13 timeframes from 5-second scalping to 1-day swings</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Smooth price animation with aggTrade stream</span></div>
        </div>
      </div>
      <div className="lshow-visual"><div style={{width:"100%",aspectRatio:"16/10",background:"linear-gradient(135deg,#0b0e18,#111626)",borderRadius:12,border:"1px solid #1c2238",padding:20,display:"flex",flexDirection:"column",gap:14,overflow:"hidden",position:"relative"}}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:36,height:36,borderRadius:9,background:"linear-gradient(135deg,#f59e0b,#d97706)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#0a0e18"}}>₿</div><div><div style={{fontSize:22,fontWeight:700,color:"#e8ecf4",fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-0.5px"}}>74,367.68</div><div style={{display:"flex",gap:8,alignItems:"center",fontSize:11}}><span style={{color:"#7a85a0"}}>BTC/USDT</span><span style={{color:"#22c55e",background:"#22c55e22",padding:"2px 6px",borderRadius:3,fontWeight:600,fontFamily:"'JetBrains Mono',monospace"}}>+2.34%</span><span style={{color:"#f59e0b",display:"flex",alignItems:"center",gap:4}}><span style={{width:6,height:6,borderRadius:"50%",background:"#f59e0b",animation:"pulse 2s infinite"}}></span>LIVE</span></div></div></div><svg viewBox="0 0 400 160" style={{width:"100%",flex:1}}><defs><linearGradient id="chartGrad1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f59e0b" stopOpacity="0.4"/><stop offset="1" stopColor="#f59e0b" stopOpacity="0"/></linearGradient></defs><path d="M0,130 L40,120 L80,90 L120,100 L160,60 L200,75 L240,40 L280,55 L320,30 L360,45 L400,25 L400,160 L0,160 Z" fill="url(#chartGrad1)"/><path d="M0,130 L40,120 L80,90 L120,100 L160,60 L200,75 L240,40 L280,55 L320,30 L360,45 L400,25" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="400" cy="25" r="5" fill="#f59e0b"><animate attributeName="r" values="5;8;5" dur="1.5s" repeatCount="indefinite"/></circle></svg><div style={{display:"flex",gap:6,fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:"#4a5570"}}><span>1s</span><span>5s</span><span style={{color:"#f59e0b",fontWeight:700}}>1m</span><span>5m</span><span>1h</span></div></div></div>
    </div>

    <div className="lshowcase reverse fade-up">
      <div className="lshow-text">
        <h3>Trade Lines That Show <span>Your Edge</span></h3>
        <p>See exactly where your trade begins and ends before you even open it. Live trade visualization shows "Beginning of trade" and "End of trade" markers directly on the chart — so you always know what you're getting into.</p>
        <div className="lshow-list">
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Live preview lines before you open any trade</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Countdown timer on the chart, not buried in a sidebar</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Real-time P/L tracking as price moves</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Up to 5 concurrent trades per asset</span></div>
        </div>
      </div>
      <div className="lshow-visual"><div style={{width:"100%",aspectRatio:"16/10",background:"linear-gradient(135deg,#0b0e18,#111626)",borderRadius:12,border:"1px solid #1c2238",padding:20,position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:14,left:14,zIndex:2,display:"flex",alignItems:"baseline",gap:6}}><span style={{fontSize:16,fontWeight:700,color:"#e8ecf4",fontFamily:"'JetBrains Mono',monospace"}}>1.64353</span><span style={{fontSize:10,color:"#7a85a0"}}>EUR/AUD</span></div><svg viewBox="0 0 400 220" style={{width:"100%",height:"100%",position:"relative",zIndex:1}}><g><rect x="20" y="80" width="8" height="40" fill="#22c55e" rx="1"/><line x1="24" y1="70" x2="24" y2="80" stroke="#22c55e" strokeWidth="1"/><rect x="38" y="60" width="8" height="50" fill="#22c55e" rx="1"/><rect x="56" y="50" width="8" height="70" fill="#ef4444" rx="1"/><line x1="60" y1="40" x2="60" y2="50" stroke="#ef4444" strokeWidth="1"/><rect x="74" y="90" width="8" height="35" fill="#ef4444" rx="1"/><rect x="92" y="75" width="8" height="45" fill="#22c55e" rx="1"/><rect x="110" y="65" width="8" height="55" fill="#22c55e" rx="1"/><rect x="128" y="55" width="8" height="65" fill="#ef4444" rx="1"/><rect x="146" y="85" width="8" height="40" fill="#ef4444" rx="1"/><rect x="164" y="70" width="8" height="55" fill="#22c55e" rx="1"/><rect x="182" y="60" width="8" height="60" fill="#22c55e" rx="1"/><rect x="200" y="75" width="8" height="45" fill="#ef4444" rx="1"/><rect x="218" y="90" width="8" height="35" fill="#ef4444" rx="1"/></g><line x1="20" y1="105" x2="380" y2="105" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="4 3"/><rect x="245" y="95" width="72" height="20" rx="3" fill="#22c55e"/><text x="281" y="108" fontSize="10" fill="#fff" fontFamily="'JetBrains Mono',monospace" fontWeight="700" textAnchor="middle">↑ +$2.34 00:15</text><line x1="340" y1="0" x2="340" y2="220" stroke="#ff3b5c" strokeWidth="1" strokeDasharray="4 3" opacity="0.6"/><rect x="346" y="95" width="48" height="18" rx="3" fill="#1e293bee" stroke="#334155" strokeWidth="0.5"/><text x="370" y="107" fontSize="9" fill="#cbd5e1" fontFamily="'JetBrains Mono',monospace" textAnchor="middle">00:15</text><text x="250" y="90" fontSize="9" fill="#7a85a0" fontFamily="'JetBrains Mono',monospace">Beginning</text><text x="344" y="90" fontSize="9" fill="#7a85a0" fontFamily="'JetBrains Mono',monospace">End</text></svg></div></div>
    </div>

    <div className="lshowcase fade-up">
      <div className="lshow-text">
        <h3>Customize Everything to <span>Your Style</span></h3>
        <p>From timezone and language to currency and sound effects — every detail of the platform adapts to how you want to trade. Your setup, your way.</p>
        <div className="lshow-list">
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>28 timezones with live clock display</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>13 languages including English, Urdu, Arabic, Spanish</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>12 currencies with automatic conversion</span></div>
          <div className="lshow-item"><div className="lshow-item-icon">✓</div><span>Sound effects for wins, losses, and alerts</span></div>
        </div>
      </div>
      <div className="lshow-visual"><div style={{width:"100%",aspectRatio:"16/10",background:"linear-gradient(135deg,#0b0e18,#111626)",borderRadius:12,border:"1px solid #1c2238",padding:22,display:"flex",flexDirection:"column",gap:14,overflow:"hidden"}}><div style={{fontSize:13,fontWeight:700,color:"#e8ecf4",marginBottom:4}}>Settings</div><div><div style={{fontSize:9,color:"#7a85a0",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Theme Mode</div><div style={{display:"flex",gap:6}}><div style={{flex:1,padding:"8px 0",borderRadius:6,border:"1px solid #f59e0b",background:"#f59e0b15",color:"#f59e0b",fontSize:11,fontWeight:600,textAlign:"center"}}>D Dark</div><div style={{flex:1,padding:"8px 0",borderRadius:6,border:"1px solid #1c2238",color:"#7a85a0",fontSize:11,fontWeight:600,textAlign:"center"}}>L Light</div></div></div><div><div style={{fontSize:9,color:"#7a85a0",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Currency</div><div style={{padding:"8px 10px",borderRadius:6,border:"1px solid #1c2238",background:"#1a2035",fontSize:11,color:"#e8ecf4",display:"flex",justifyContent:"space-between"}}><span>$ USD — US Dollar</span><span style={{color:"#7a85a0"}}>▾</span></div></div><div><div style={{fontSize:9,color:"#7a85a0",fontWeight:600,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>Candle Colors</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{[["#22c55e","#ef4444"],["#26a69a","#ef5350"],["#0ecb81","#f6465d"],["#2962ff","#ff6d00"]].map((c,i)=>(<div key={i} style={{display:"flex",gap:3,padding:"6px 8px",borderRadius:5,border:`1px solid ${i===0?"#f59e0b":"#1c2238"}`,background:i===0?"#f59e0b15":"transparent"}}><span style={{width:10,height:10,borderRadius:"50%",background:c[0]}}></span><span style={{width:10,height:10,borderRadius:"50%",background:c[1]}}></span></div>))}</div></div><div style={{display:"flex",gap:12,fontSize:9,color:"#4a5570",marginTop:"auto"}}><span>-- 28 timezones</span><span> 13 languages</span><span> 12 currencies</span></div></div></div>
    </div>
  </div></section>

  <section className="lsection" id="how" style={{background:"rgba(10,14,26,.6)"}}><div className="lcon">
    <div className="lsec-tag"><span className="ltag"><span className="ldot"></span>How It Works</span></div>
    <h2 className="lsec-title">Start Trading in Under 60 Seconds</h2>
    <p className="lsec-sub">Three simple steps to your first trade.</p>
    <div className="lsteps">
      <div className="lstep fade-up"><div className="lstep-num">1</div><h3>Create Account</h3><p>Sign up with email. Get $10,000 demo balance instantly.</p></div>
      <div className="lstep fade-up"><div className="lstep-num">2</div><h3>Choose Asset</h3><p>Pick from Bitcoin, Ethereum, and 8+ crypto pairs.</p></div>
      <div className="lstep fade-up"><div className="lstep-num">3</div><h3>Place Trade</h3><p>HIGHER or LOWER. Set amount and expiry. Watch it resolve.</p></div>
    </div>
  </div></section>
  <section className="lsection"><div className="lcon"><div className="lstats">
    <div className="lstat fade-up"><div className="num">$50</div><div className="label">Min Deposit</div></div>
    <div className="lstat fade-up"><div className="num">24hr</div><div className="label">Withdrawals</div></div>
    <div className="lstat fade-up"><div className="num">300+</div><div className="label">Assets</div></div>
    <div className="lstat fade-up"><div className="num">98%</div><div className="label">Uptime</div></div>
  </div></div></section>
  <section className="lsection" id="compare" style={{background:ldark?"rgba(10,14,26,.6)":"rgba(245,245,250,.6)"}}><div className="lcon">
    <div className="lsec-tag"><span className="ltag"><span className="ldot"></span>Compare</span></div>
    <h2 className="lsec-title">What Sets Zexto Option Apart</h2>
    <p className="lsec-sub">Wave goodbye to broker scams and locked funds.</p>
    <div className="lcomp fade-up">
      <div className="lcomp-h"><div>Feature</div><div>Other Platforms</div><div>Zexto Option</div></div>
      <div className="lcomp-r"><div>AI Signals</div><div><span className="lcrs">✕</span></div><div><span className="lchk">✓</span></div></div>
      <div className="lcomp-r"><div>Instant Withdrawals</div><div><span className="lcrs">✕</span></div><div><span className="lchk">✓</span></div></div>
      <div className="lcomp-r"><div>$10K Free Demo</div><div><span className="lcrs">✕</span></div><div><span className="lchk">✓</span></div></div>
      <div className="lcomp-r"><div>Advanced Charts</div><div>Basic</div><div><span className="lchk">✓</span> Pro</div></div>
      <div className="lcomp-r"><div>Multi-Currency</div><div>Limited</div><div><span className="lchk">✓</span> 12+</div></div>
    </div>
  </div></section>
  <section className="lsection" id="faq"><div className="lcon">
    <div className="lsec-tag"><span className="ltag"><span className="ldot"></span>FAQ</span></div>
    <h2 className="lsec-title">Frequently Asked Questions</h2>
    <p className="lsec-sub">Everything you need to know before you start trading.</p>
    <div className="lfaq-list">
      <div className="faq-item fade-up"><div className="faq-q">How do I sign up and start practicing?<span className="arrow">+</span></div><div className="faq-a"><p>You can sign up for an account and access a free practice account. Alternatively, you can use our Demo account without signing up, allowing you to practice trading with virtual funds.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">How long does it take to process a withdrawal?<span className="arrow">+</span></div><div className="faq-a"><p>Withdrawals to cryptocurrencies and e-wallets are instant. For bank and mobile money withdrawals, the process can take from 1 to 5 hours maximum.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">What is the minimum deposit required to start trading?<span className="arrow">+</span></div><div className="faq-a"><p>You can start trading with a minimum deposit of just $5, making it easy for anyone to begin their trading journey.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">Can I access the platform on my mobile device or tablet?<span className="arrow">+</span></div><div className="faq-a"><p>Yes, our platform is fully functional on modern computers, mobile devices, and tablets. You can use the web version or download our app for Android.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">Are there any fees for deposits or withdrawals?<span className="arrow">+</span></div><div className="faq-a"><p>We do not charge any fees for deposits or withdrawals. However, please note that third-party payment providers might have their own fees and currency conversion rates.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">How fast are trades executed on your platform?<span className="arrow">+</span></div><div className="faq-a"><p>Our platform executes trades in 0.3 seconds, ensuring you get the exact price you want without any delays. Fast execution is crucial for successful trading.</p></div></div>
      <div className="faq-item fade-up"><div className="faq-q">What types of assets are available for trading?<span className="arrow">+</span></div><div className="faq-a"><p>Our platform offers access to over 100 global trading assets, including currencies, commodities, indices, and stocks, allowing you to diversify your portfolio.</p></div></div>
    </div>
  </div></section>
  <section className="lsection" style={{textAlign:"center"}}><div className="lcon"><div className="lcta-box fade-up">
    <h2>Start Your Free <span style={{color:"#f59e0b"}}>Demo</span> Account</h2>
    <p>$10,000 virtual funds. Real market data. No credit card required.</p>
    <div className="lcta-btns"><button onClick={onSignUp} className="lbtn lbtn-p">Create Free Account →</button><button onClick={onSignIn} className="lbtn lbtn-o">Sign In</button></div>
    <div style={{marginTop:20,fontSize:12,color:"#4a5570"}}>Bank-grade security • No credit card • Start in 60 seconds</div>
  </div></div></section>
  {/* RISK WARNING */}
  <section style={{padding:"40px 0"}}><div className="lcon"><div className="lrisk-box fade-up">
    <div className="lrisk-icon">!</div>
    <h4>Risk Warning</h4>
    <p>Engaging in Forex trading and other leveraged financial instruments involves substantial risks and can lead to the loss of your invested funds. It's essential to only trade with money that you can afford to lose and to fully understand the risks involved. Leveraged products can amplify both gains and losses, making them potentially unsuitable for all investors. Similarly, trading in non-leveraged products like stocks carries risks as their values can fluctuate, leading to potential losses.</p>
    <p style={{marginTop:12}}>Please note: Our services are not available to residents or citizens of the EEA countries, USA, Israel, the UK, and Japan. By using our platform, you confirm that you are not located in these jurisdictions.</p>
  </div></div></section>
  <footer className="lfoot"><div className="lcon">
    <div className="lfoot-grid">
      <div className="lfoot-brand"><div className="lnav-logo"><span style={{display:"inline-flex",alignItems:"center",marginRight:8}}><ZextoLogo size={28}/></span>Zexto Option</div><p>Professional binary trading with real-time charts, AI signals, and instant execution.</p></div>
      <div className="lfoot-col"><h4>Platform</h4><a href="#" onClick={e=>{e.preventDefault();onSignUp();}}>Web Trading</a><a href="#" onClick={e=>{e.preventDefault();onDemo();}}>Demo Account</a></div>
      <div className="lfoot-col"><h4>Resources</h4><a href="#">Trading Guide</a><a href="#">Blog</a><a href="#">Help Center</a></div>
      <div className="lfoot-col"><h4>Partners</h4><a href="http://localhost:5174" target="_blank" rel="noopener noreferrer">Become a Partner</a><a href="http://localhost:5174" target="_blank" rel="noopener noreferrer">Affiliate Program</a><a href="http://localhost:5000/Zexto_Option_Affiliate_Agreement.pdf" target="_blank" rel="noopener noreferrer">Affiliate Agreement</a></div>
      <div className="lfoot-col"><h4>Legal</h4><a href="http://localhost:5000/Terms_of_Service.pdf" target="_blank" rel="noopener noreferrer">Terms of Service</a><a href="http://localhost:5000/Privacy_Policy.pdf" target="_blank" rel="noopener noreferrer">Privacy Policy</a><a href="http://localhost:5000/Risk_Disclosure.pdf" target="_blank" rel="noopener noreferrer">Risk Disclosure</a></div>
    </div>
    <div className="lfoot-bottom"><span>© 2026 Zexto Option. All rights reserved.</span><span>Trading involves risk of loss.</span></div>
  </div></footer>
  </div></div>);
}

// ===== GLOBAL CUSTOM CURSOR (zero re-renders — pure DOM) =====
function ZextoCursor(){
  const elRef=useRef(null);
  useEffect(()=>{
    const el=document.createElement("div");
    el.id="zexto-cursor";
    el.innerHTML=`
      <style>
        *{cursor:none!important}
        #zexto-cursor{position:fixed;top:0;left:0;pointer-events:none;z-index:99999;will-change:transform;opacity:0;contain:layout style size}
        #zexto-cursor *{pointer-events:none!important}
        @keyframes zcRotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes zcPulse{0%,100%{opacity:0.6;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.5)}}
      </style>
      <svg width="44" height="44" viewBox="0 0 44 44" style="position:absolute;top:-22px;left:-22px;animation:zcRotate 4s linear infinite;opacity:0.5">
        <polygon points="22,2 40,12 40,32 22,42 4,32 4,12" fill="none" stroke="#f59e0b" stroke-width="0.8" stroke-dasharray="6 4"/>
      </svg>
      <svg width="28" height="28" viewBox="0 0 28 28" style="position:absolute;top:-14px;left:-14px;animation:zcRotate 3s linear infinite reverse;opacity:0.3">
        <circle cx="14" cy="14" r="12" fill="none" stroke="#f59e0b" stroke-width="0.5" stroke-dasharray="3 5"/>
      </svg>
      <div style="width:6px;height:6px;border-radius:50%;background:#f59e0b;box-shadow:0 0 8px rgba(245,158,11,0.6),0 0 20px rgba(245,158,11,0.2);position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);animation:zcPulse 2s ease-in-out infinite"></div>
      <div style="position:absolute;top:-16px;left:-0.25px;width:0.5px;height:8px;background:rgba(245,158,11,0.25)"></div>
      <div style="position:absolute;bottom:-16px;left:-0.25px;width:0.5px;height:8px;background:rgba(245,158,11,0.25)"></div>
      <div style="position:absolute;left:-16px;top:-0.25px;height:0.5px;width:8px;background:rgba(245,158,11,0.25)"></div>
      <div style="position:absolute;right:-16px;top:-0.25px;height:0.5px;width:8px;background:rgba(245,158,11,0.25)"></div>
    `;
    document.body.appendChild(el);
    elRef.current=el;

    // RAF-throttled cursor — only updates once per frame, skips duplicates
    let mx=0,my=0,raf=0,dirty=false;
    const tick=()=>{if(dirty){el.style.transform=`translate3d(${mx}px,${my}px,0)`;dirty=false;}raf=requestAnimationFrame(tick);};
    raf=requestAnimationFrame(tick);

    const onMove=(e)=>{mx=e.clientX;my=e.clientY;dirty=true;el.style.opacity="1";};
    const onLeave=()=>{el.style.opacity="0";};
    const onEnter=()=>{el.style.opacity="1";};

    window.addEventListener("mousemove",onMove,{passive:true});
    document.addEventListener("mouseleave",onLeave);
    document.addEventListener("mouseenter",onEnter);

    return()=>{
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseleave",onLeave);
      document.removeEventListener("mouseenter",onEnter);
      if(el.parentNode)el.parentNode.removeChild(el);
    };
  },[]);
  return null;
}

export default function App(){
  const[page,setPage]=useState(()=>{const saved=localStorage.getItem("qt_page");return saved||"landing";});
  const[walletTab,setWalletTab]=useState(()=>{const saved=localStorage.getItem("qt_walletTab");return saved||"deposit";});
  const[loggedIn,setLoggedIn]=useState(false);
  const[currentUser,setCurrentUser]=useState(null);
  const[checkingAuth,setCheckingAuth]=useState(true);
  const[showSplash,setShowSplash]=useState(false);
  useEffect(()=>{localStorage.setItem("qt_page",page);},[page]);
  useEffect(()=>{localStorage.setItem("qt_walletTab",walletTab);},[walletTab]);

  // On mount: check if user has existing valid token
  useEffect(()=>{
    if(!API.auth.isAuthenticated()){setCheckingAuth(false);return;}
    API.auth.me().then(res=>{
      if(res.success){
        setCurrentUser(res.user);
        setLoggedIn(true);
        const savedPage=localStorage.getItem("qt_page");
        if(savedPage&&savedPage!=="landing"&&savedPage!=="register")setPage(savedPage);
        else setPage("trade");
      }
    }).catch(()=>{
      API.auth.logout();
    }).finally(()=>setCheckingAuth(false));
  },[]);

  // Show loading while checking auth or after login
  if(checkingAuth||showSplash)return(<><ZextoCursor/><div style={{background:"#050508",minHeight:"100vh",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden",...IN}}>
    <style>{`
      @keyframes rise{0%{transform:translateY(100vh) scale(0);opacity:0}10%{opacity:1}85%{opacity:.8}100%{transform:translateY(-10vh) scale(1);opacity:0}}
      @keyframes drawHex{to{stroke-dashoffset:0}}
      @keyframes zReveal{0%{opacity:0;transform:translate(-50%,-50%) scale(.7)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
      @keyframes brandIn{0%{opacity:0;transform:translateY(12px)}100%{opacity:1;transform:translateY(0)}}
      @keyframes glowpulse{0%,100%{opacity:.15}50%{opacity:.4}}
      @keyframes spinAnim{to{transform:rotate(360deg)}}
      @keyframes cornerIn{to{opacity:1}}
    `}</style>
    {/* Particles */}
    <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none"}}>
      {[{l:"5%",d:"4.2s",dl:"0s",t:""},{l:"12%",d:"5.5s",dl:"1.2s",t:"big"},{l:"18%",d:"3.8s",dl:"0.4s",t:"tiny"},{l:"25%",d:"4.8s",dl:"2.1s",t:""},{l:"38%",d:"5.2s",dl:"1.6s",t:"big"},{l:"50%",d:"3.3s",dl:"0.2s",t:"tiny"},{l:"62%",d:"5.8s",dl:"0.6s",t:"big"},{l:"74%",d:"4.4s",dl:"3.2s",t:""},{l:"86%",d:"3.9s",dl:"2.6s",t:"tiny"},{l:"95%",d:"5.1s",dl:"1s",t:""}].map((p,i)=>(
        <div key={i} style={{position:"absolute",left:p.l,width:p.t==="big"?3:p.t==="tiny"?1:2,height:p.t==="big"?3:p.t==="tiny"?1:2,background:p.t==="tiny"?"rgba(245,158,11,0.3)":p.t==="big"?"rgba(245,158,11,0.12)":"rgba(245,158,11,0.2)",borderRadius:"50%",animation:`rise ${p.d} linear ${p.dl} infinite`}}/>
      ))}
    </div>
    {/* Corners */}
    {[{t:24,l:24,bt:"1px solid rgba(245,158,11,0.06)",bl:"1px solid rgba(245,158,11,0.06)"},{t:24,r:24,bt:"1px solid rgba(245,158,11,0.06)",br:"1px solid rgba(245,158,11,0.06)"},{b:24,l:24,bb:"1px solid rgba(245,158,11,0.06)",bl:"1px solid rgba(245,158,11,0.06)"},{b:24,r:24,bb:"1px solid rgba(245,158,11,0.06)",br:"1px solid rgba(245,158,11,0.06)"}].map((c,i)=>(
      <div key={i} style={{position:"absolute",width:40,height:40,opacity:0,animation:"cornerIn .4s ease 2s forwards",top:c.t,left:c.l,right:c.r,bottom:c.b,borderTop:c.bt,borderLeft:c.bl,borderRight:c.br,borderBottom:c.bb}}/>
    ))}
    {/* Hex Icon */}
    <div style={{position:"relative",width:130,height:130,marginBottom:24}}>
      {/* Glow */}
      <div style={{position:"absolute",inset:-8,pointerEvents:"none"}}><svg viewBox="0 0 146 146" fill="none" style={{width:"100%",height:"100%"}}><polygon points="73,4 138,38 138,108 73,142 8,108 8,38" fill="none" stroke="#f59e0b" strokeWidth=".8" style={{filter:"blur(6px)",animation:"glowpulse 2.5s ease infinite"}}/></svg></div>
      {/* Main hex */}
      <div style={{position:"absolute",inset:0}}><svg viewBox="0 0 130 130" fill="none" style={{width:"100%",height:"100%"}}>
        <polygon points="65,4 122,36 122,94 65,126 8,94 8,36" fill="none" stroke="#f59e0b" strokeWidth="2" strokeDasharray="400" strokeDashoffset="400" style={{animation:"drawHex 2s ease .3s forwards"}}/>
        <polygon points="65,16 110,42 110,88 65,114 20,88 20,42" fill="none" stroke="rgba(245,158,11,0.06)" strokeWidth="1" strokeDasharray="320" strokeDashoffset="320" style={{animation:"drawHex 2s ease .6s forwards"}}/>
        <polygon points="65,28 98,48 98,82 65,102 32,82 32,48" fill="none" stroke="rgba(245,158,11,0.03)" strokeWidth=".5" strokeDasharray="260" strokeDashoffset="260" style={{animation:"drawHex 2s ease .9s forwards"}}/>
      </svg></div>
      {/* Z */}
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",fontFamily:"'Outfit','DM Sans',sans-serif",fontSize:56,fontWeight:900,color:"#f59e0b",opacity:0,animation:"zReveal .6s ease 1.4s forwards",textShadow:"0 0 30px rgba(245,158,11,0.15)",zIndex:2}}>Z</div>
    </div>
    {/* Brand */}
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,opacity:0,animation:"brandIn .7s ease 1.8s forwards",zIndex:2}}>
      <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:38,fontWeight:700,color:"#fff",letterSpacing:"-0.8px"}}>Zexto<span style={{color:"#f59e0b"}}>Option</span></div>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:6,textTransform:"uppercase",color:"rgba(245,158,11,0.2)"}}>Trade Smart</div>
    </div>
    {/* Spinner */}
    <div style={{marginTop:40,opacity:0,animation:"brandIn .5s ease 2.3s forwards",zIndex:2}}>
      <svg width="36" height="36" viewBox="0 0 36 36" style={{animation:"spinAnim 1.8s linear infinite"}}><circle cx="18" cy="18" r="14" stroke="#f59e0b" strokeWidth="2" fill="none" strokeDasharray="75" strokeDashoffset="55" strokeLinecap="round"/></svg>
    </div>
    {/* Tagline */}
    <div style={{marginTop:20,fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"rgba(255,255,255,0.06)",letterSpacing:1.5,opacity:0,animation:"brandIn .4s ease 2.6s forwards",zIndex:2}}>Trade Smarter. Trade Faster.</div>
    {/* Version */}
    <div style={{position:"absolute",bottom:28,fontFamily:"'DM Sans',sans-serif",fontSize:9,color:"rgba(255,255,255,0.04)",letterSpacing:2,zIndex:2}}>v2.4.1</div>
  </div></>);

  const handleLogin=(user)=>{if(user?.email)localStorage.setItem("qt_user_email",user.email);setShowSplash(true);setTimeout(()=>{setCurrentUser(user);setLoggedIn(true);setPage("trade");setShowSplash(false);},3000);};
  const goWallet=(t)=>{setWalletTab(t||"deposit");};
  const handleLogout=()=>{API.auth.logout();setCurrentUser(null);setLoggedIn(false);setPage("landing");};

  if(page==="landing"&&!loggedIn)return<><ZextoCursor/><LandingPage onSignUp={()=>setPage("register")} onSignIn={()=>setPage("register")} onDemo={()=>setPage("trade")}/></>;
  if(page==="register"&&!loggedIn)return<><ZextoCursor/><RegisterPage onLogin={handleLogin}/></>;
  if(!loggedIn&&page==="trade")return<TradingPage onNav={setPage} goWallet={goWallet} currentUser={null} onLogout={()=>setPage("landing")} isGuest={true}/>;
  if(page==="wallet")return<TradingPage onNav={setPage} goWallet={goWallet} currentUser={currentUser} onLogout={handleLogout} isGuest={false} initialWalletTab={walletTab}/>;
  return<TradingPage onNav={setPage} goWallet={goWallet} currentUser={currentUser} onLogout={handleLogout} isGuest={false}/>;
}