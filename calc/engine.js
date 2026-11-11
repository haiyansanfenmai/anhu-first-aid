
function num(v){
  if (v === null || v === undefined || v === '') return 0;
  var n = Number(v);
  return isFinite(n) ? n : 0;
}
function nil(v){ return v === null || v === undefined || v === ''; }
function clamp(v,a,b){ return Math.min(b, Math.max(a,v)); }
function round2(v){ return Math.round((v + Number.EPSILON) * 100) / 100; }
function pct(v){ return clamp(num(v),0,100)/100; }

function normalizeSegments(list){
  var arr = (list || []).map(function(s){
    return { cap: nil(s.cap) ? null : Math.max(0,num(s.cap)), rate: clamp(num(s.rate),0,100) };
  }).filter(function(s){ return s.cap === null || s.cap > 0; });
  var openSegs = arr.filter(function(s){ return s.cap === null; });
  var finite = arr.filter(function(s){ return s.cap !== null; })
                  .sort(function(a,b){ return a.cap - b.cap; });
  var seen = {}, out = [];
  finite.forEach(function(s){
    var key = 'c'+s.cap;
    if (!seen[key]){ seen[key] = 1; out.push(s); }
  });
  if (openSegs.length) out.push(openSegs[openSegs.length-1]);
  else if (out.length) out.push({cap:null, rate:out[out.length-1].rate});
  if (!out.length) out.push({cap:null,rate:0});
  return out;
}

function calculate(input){
  var p = input.policy || {};
  var insured = p.insured !== false;
  var globalPrepay = clamp(num(p.prepayRate),0,100);
  var items = input.items || [];

  // 1) split each item into policy-covered / out-of-scope parts
  var rows = items.map(function(it){
    var amount = Math.max(0, num(it.amount));
    var type = (it.type === 'A' || it.type === 'B') ? it.type : 'C';
    var compliant = 0, prepay = 0;
    if (type === 'A') compliant = amount;
    else if (type === 'B'){
      var pr = nil(it.prepay) ? globalPrepay : clamp(num(it.prepay),0,100);
      prepay = amount * pr/100;
      compliant = amount - prepay;
    }
    return {
      name: String(it.name || '未命名项目'), type: type, amount: amount,
      prepay: prepay, compliant: insured ? compliant : 0,
      outOfScope: insured ? (amount - compliant) : amount
    };
  });

  var total = 0, compliant = 0, classA = 0, classB = 0, classC = 0, bPrepay = 0;
  rows.forEach(function(r){
    total += r.amount; compliant += r.compliant;
    if (r.type === 'A') classA += r.amount;
    else if (r.type === 'B'){ classB += r.amount; bPrepay += r.prepay; }
    else classC += r.amount;
  });
  var outOfScope = total - compliant;

  // 2) deductible (annual accumulated + possible remote uplift)
  var deductible = Math.max(0, num(p.deductible)) * (1 + num(p.deductibleUplift)/100);
  var deductibleRemain = Math.max(0, deductible - Math.max(0,num(p.usedDeductible)));
  var deductibleSelf = Math.min(compliant, deductibleRemain);
  var base = Math.max(0, compliant - deductibleRemain);

  // 3) tiered reimbursement
  var segs = normalizeSegments(p.segments);
  var adjust = num(p.rateAdjust) + num(p.retireBonus);
  var theoretical = 0, acc = 0;
  var segDetail = [];
  for (var i=0;i<segs.length && acc < base - 1e-9;i++){
    var upper = segs[i].cap === null ? Infinity : segs[i].cap;
    var part = Math.min(base, upper) - acc;
    if (part <= 1e-9) continue;
    var eff = insured ? clamp(segs[i].rate + adjust, 0, 100) : 0;
    var pay = part * eff/100;
    theoretical += pay;
    acc += part;
    segDetail.push({ from: acc - part, to: acc, amount: part, rate: eff, pay: pay });
  }

  // 4) annual ceiling of basic fund
  var ceiling = nil(p.ceiling) ? Infinity : Math.max(0, num(p.ceiling));
  var ceilingRemain = Math.max(0, ceiling - Math.max(0,num(p.usedBasicReimburse)));
  var basic = insured ? Math.min(theoretical, ceilingRemain) : 0;
  var copaySelf = base - theoretical;
  var overCeilingSelf = theoretical - basic;
  var personalBurden = Math.max(0, compliant - basic); // policy-covered out-of-pocket

  // 5) critical illness / catastrophic supplementary insurance
  var c = p.critical || {};
  var critBase = 0, critLow = 0, critHigh = 0, critical = 0, critRateLow = 0, critRateHigh = 0;
  if (insured && c.enabled){
    var cd = Math.max(0, num(c.deductible));
    var excess = Math.max(0, personalBurden - cd);
    var hs = nil(c.highStart) ? 0 : Math.max(0, num(c.highStart));
    critRateLow = clamp(num(c.rate),0,100);
    critRateHigh = nil(c.highRate) ? critRateLow : clamp(num(c.highRate),0,100);
    var lowCap = Math.max(0, hs - cd);
    critLow = Math.min(excess, lowCap);
    critHigh = excess - critLow;
    critBase = excess;
    critical = critLow*critRateLow/100 + critHigh*critRateHigh/100;
    var cCeil = nil(c.ceiling) ? Infinity : Math.max(0, num(c.ceiling));
    critical = Math.min(critical, Math.max(0, cCeil - Math.max(0,num(c.used))));
  }

  // 6) medical assistance
  var s = p.rescue || {};
  var rescueBase = 0, rescue = 0;
  if (insured && s.enabled){
    rescueBase = Math.max(0, personalBurden - critical);
    rescue = rescueBase * pct(s.rate);
    var rCeil = nil(s.ceiling) ? Infinity : Math.max(0, num(s.ceiling));
    rescue = Math.min(rescue, Math.max(0, rCeil - Math.max(0,num(s.used))));
  }

  var totalReimburse = basic + critical + rescue;
  var finalSelf = Math.max(0, total - totalReimburse);
  var rate = total > 0 ? totalReimburse/total*100 : 0;

  return {
    total: total, compliant: compliant, outOfScope: outOfScope,
    classA: classA, classB: classB, classC: classC, bPrepay: bPrepay,
    deductible: deductible, deductibleRemain: deductibleRemain, deductibleSelf: deductibleSelf,
    base: base, adjust: adjust, segDetail: segDetail,
    theoretical: theoretical, ceiling: ceiling, ceilingRemain: ceilingRemain,
    basic: basic, copaySelf: copaySelf, overCeilingSelf: overCeilingSelf,
    personalBurden: personalBurden,
    critBase: critBase, critLow: critLow, critHigh: critHigh,
    critRateLow: critRateLow, critRateHigh: critRateHigh, critical: critical,
    rescueBase: rescueBase, rescue: rescue,
    totalReimburse: totalReimburse, finalSelf: finalSelf, rate: rate,
    rows: rows,
    flags: {
      notInsured: !insured,
      belowDeductible: compliant <= 0 || base <= 0,
      hitCeiling: overCeilingSelf > 0.005,
      hitCritical: critical > 0.005,
      hitRescue: rescue > 0.005,
      heavyOutOfScope: total > 0 && outOfScope/total >= 0.3,
      noCoverage: totalReimburse <= 0.005 && total > 0
    }
  };
}
if (typeof globalThis !== 'undefined') globalThis.__MED_ENGINE__ = { calculate: calculate, normalizeSegments: normalizeSegments, round2: round2 };

if (typeof module === "object" && module.exports) module.exports = globalThis.__MED_ENGINE__;
