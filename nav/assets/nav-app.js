/* ==========================================================================
   assets/nav-app.js · 智能定位与就医流程导航（navigation.html 专用逻辑）
   --------------------------------------------------------------------------
   依赖：assets/location.js（NavLocation）、assets/amap.js（NavMap）
   对外：window.NavModule —— 组员整合入口，签名与旧版兼容
   数据：NAV_* 全部为课程演示数据，组长可整体替换，逻辑不用动
   ========================================================================== */
(function () {
  'use strict';

  /* ==========================================================
     数据区
     ========================================================== */
  var NAV_CITY = {
    name: '演示城市 · 杭州市',
    origins: [
      { id: 'east',  name: '城东 · 居民区', lat: 30.290, lng: 120.230 },
      { id: 'west',  name: '城西 · 商圈',   lat: 30.270, lng: 120.130 },
      { id: 'south', name: '城南 · 车站',   lat: 30.230, lng: 120.200 },
      { id: 'north', name: '城北 · 学校',   lat: 30.330, lng: 120.170 }
    ]
  };

  var DEMO_HOSPITALS = [
    { id: 'h1', name: '城西社区卫生服务中心（示例）', lat: 30.272, lng: 120.132,
      caps: ['24h急诊'],
      gate: '正门进，进门左手是急诊', park: '门前临时车位约 6 个，傍晚常常停满',
      night: '正门 24 小时开放', where: '一层东侧', note: '适合常见小病与复诊，不设专科救治中心' },
    { id: 'h2', name: '市第一人民医院（示例）', lat: 30.281, lng: 120.168,
      caps: ['胸痛中心', '卒中中心', '创伤中心', '儿科急诊', '24h急诊'],
      gate: '急诊走北门 2 号岗，别绕去门诊南门', park: '地下 B1，急诊入口右侧，夜间通常有位',
      night: '北门 24 小时开放，有导医', where: '独立急诊楼，与门诊楼不相连', note: '综合三甲，夜间介入与卒中团队在岗' },
    { id: 'h3', name: '市中医院（示例）', lat: 30.262, lng: 120.182,
      caps: ['卒中中心', '血液净化', '24h急诊'],
      gate: '西门进，急诊有独立车道', park: '地面停车场西侧，靠近急诊',
      night: '西门夜间开放，东门关闭', where: '急诊在 1 号楼一层', note: '设有卒中绿道与血液净化室' },
    { id: 'h4', name: '市儿童医院（示例）', lat: 30.301, lng: 120.152,
      caps: ['儿科急诊', '24h急诊'],
      gate: '东门进，儿童急诊有单独入口', park: '地下车库 B1，乘 3 号梯到一层',
      night: '东门 24 小时开放', where: '2 号楼一层儿童急诊', note: '只接诊 18 岁以下，成人请另选医院' },
    { id: 'h5', name: '市第二人民医院（示例）', lat: 30.242, lng: 120.215,
      caps: ['创伤中心', '烧伤科', '24h急诊'],
      gate: '急诊走南门，救护车可直接到门口', park: '南门右侧地面停车场',
      night: '南门 24 小时开放', where: '急诊楼一层，创伤抢救室在内侧', note: '创伤与烧伤处理经验较多' },
    { id: 'h6', name: '城东专科门诊（示例 · 日间接诊）', lat: 30.288, lng: 120.226,
      caps: ['烧伤科'],
      gate: '仅工作日白天开放', park: '路边临停', night: '夜间不接诊', where: '一层门诊',
      note: '日间专科门诊，没有夜间急诊，突发情况不要直接过去' },
    { id: 'h7', name: '城南妇幼保健院（示例）', lat: 30.232, lng: 120.198,
      caps: ['儿科急诊', '24h急诊'],
      gate: '北门进，儿科急诊在右手边', park: '北门地下车库',
      night: '北门 24 小时开放', where: '门诊楼一层西侧', note: '以妇产与儿科为主' },
    { id: 'h8', name: '大学附属医院（示例）', lat: 30.318, lng: 120.188,
      caps: ['胸痛中心', '卒中中心', '烧伤科', '血液净化', '24h急诊'],
      gate: '急诊走西北门，院区较大容易走错', park: '西北门 P2 停车场，离急诊最近',
      night: '西北门 24 小时开放', where: '急诊医学中心独立楼', note: '专科最全，但院区大、院内步行时间要留出来' }
  ];

  var ICONS = {
    heart:  '<path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z"/>',
    brain:  '<path d="M12 5a3 3 0 0 0-5.6 1.5A3 3 0 0 0 5 12a3 3 0 0 0 2 4.8A3 3 0 0 0 12 19z"/><path d="M12 5a3 3 0 0 1 5.6 1.5A3 3 0 0 1 19 12a3 3 0 0 1-2 4.8A3 3 0 0 1 12 19z"/>',
    drop:   '<path d="M12 3s6 6.6 6 10.5A6 6 0 0 1 6 13.5C6 9.6 12 3 12 3z"/>',
    flame:  '<path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 2 1.5 3 2.5 3 .5-2 0-4.5.5-7z"/>',
    child:  '<circle cx="12" cy="8" r="3.2"/><path d="M6 21c0-3.6 2.7-6 6-6s6 2.4 6 6"/>',
    breath: '<path d="M4 8h9a3 3 0 0 1 0 6H8M4 12h11a3 3 0 0 1 0 6h-3M4 16h6"/>',
    flask:  '<path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3M7.5 15h9"/>',
    care:   '<path d="M4 12h4l2-4 3 8 2-4h5"/><circle cx="12" cy="12" r="9.5"/>'
  };

  var NAV_SITUATIONS = [
    { id: 'chest',  label: '胸口痛 / 胸闷', sub: '压着疼、喘不上气', icon: 'heart',
      need: ['胸痛中心', '24h急诊'], flow: 'emergency',
      tip: '先让人坐下，别自己开车；顺手记一下不舒服是从几点开始的，医生会问。' },
    { id: 'stroke', label: '口角歪 / 说话不清', sub: '一侧没力气、含糊', icon: 'brain',
      need: ['卒中中心', '24h急诊'], flow: 'emergency',
      tip: '记住症状出现的时间很重要。别给喂水喂饭，也别自己开车颠簸。' },
    { id: 'bleed',  label: '外伤出血', sub: '割伤、碰撞后流血', icon: 'drop',
      need: ['创伤中心', '24h急诊'], flow: 'emergency',
      tip: '路上继续用干净布压住伤口，别反复掀开看。带上一份正在吃的药名。' },
    { id: 'burn',   label: '烧烫伤', sub: '热水、蒸汽、明火', icon: 'flame',
      need: ['烧伤科', '24h急诊'], flow: 'emergency',
      tip: '先用流动凉水冲够时间，别抹牙膏酱油，也别自己挑破水泡。' },
    { id: 'child',  label: '孩子发热 / 抽搐', sub: '婴幼儿突然不舒服', icon: 'child',
      need: ['儿科急诊', '24h急诊'], flow: 'emergency',
      prefer: ['h4', 'h7'], preferNote: '儿童专科，看孩子更对口',
      tip: '带上疫苗本和近期用药记录。孩子的东西交给一个人专门拿，别全家都找。' },
    { id: 'breath', label: '呼吸费力', sub: '喘不上气、憋得慌', icon: 'breath',
      need: ['24h急诊'], flow: 'emergency',
      tip: '让人保持舒服的坐位，别平躺。松开领口，路上别说话太多。' },
    { id: 'poison', label: '误食 / 中毒', sub: '吃错东西、接触不明物', icon: 'flask',
      need: ['血液净化', '24h急诊'], flow: 'emergency',
      tip: '把包装、瓶子或剩余物一起带去医院，比口头描述有用得多。' },
    { id: 'usual',  label: '普通不适 / 复诊', sub: '不急，但需要看医生', icon: 'care',
      need: ['24h急诊'], flow: 'outpatient',
      tip: '不急的话，白天去门诊更从容。带上既往病历和检查单，能少做重复检查。' }
  ];

  /* 情况专属步骤：插到通用流程前面，让「就医流程」随情况变化，而不是固定三套 */
  var SITUATION_EXTRA = {
    chest: [
      { t: '出发前记下开始不舒服的时间', d: '医生判断能不能做介入，第一步就是问「从几点开始的」。', pit: '别只说「疼了好一会儿」，尽量说具体钟点。', bring: '手机备忘录、正在吃的心血管药盒' },
      { t: '到院直接说「胸痛，走胸痛中心」', d: '有胸痛中心的医院设绿色通道，通常先做心电图再办手续。', pit: '别先去普通挂号窗口排队，会绕过绿色通道。', bring: '身份证、医保卡' }
    ],
    stroke: [
      { t: '出发前记下症状出现的时间', d: '溶栓有时间窗，这个钟点会直接决定医生怎么治。', pit: '别给喂水喂饭，路上颠簸也尽量避免。', bring: '手机备忘录、既往病历' },
      { t: '到院直接说「怀疑卒中，走卒中绿道」', d: '卒中中心会先做头颅影像，家属提前把检查单收好。', pit: '别先带去做常规体检或排队挂号，时间最要紧。', bring: '身份证、医保卡、既往用药清单' }
    ],
    bleed: [
      { t: '路上持续压迫伤口，别反复查看', d: '用干净布或毛巾压住，浸透了就在上面再加一层。', pit: '反复掀开看会让刚凝住的血又流起来。', bring: '干净毛巾、备用衣物' },
      { t: '到院说清受伤原因和时间', d: '是割伤、撞伤还是坠落，医生要据此判断有没有深部损伤。', pit: '若伤口里有异物，别自己拔，交给医生处理。', bring: '正在吃的抗凝药名、既往病历' }
    ],
    burn: [
      { t: '先用流动凉水冲够时间再出发', d: '冲够时间能明显减轻后续损伤，别急着往医院跑而跳过这一步。', pit: '别抹牙膏、酱油、香灰，也别自己挑破水泡。', bring: '干净纱布或保鲜膜（覆盖用，不包扎过紧）' },
      { t: '到院先说明烫伤部位与热源', d: '热水、蒸汽、明火或化学品，处理方式不一样。', pit: '别把衣服硬撕下来，粘住的部分留给医生。', bring: '致伤物包装（若是化学品）' }
    ],
    child: [
      { t: '出发前带上疫苗本和用药记录', d: '医生会问最近打了什么、吃过什么，翻本子比回忆准。', pit: '孩子的东西交给一个人专门拿，别全家都找。', bring: '疫苗本、近期用药盒、退烧药包装' },
      { t: '到儿童急诊先报年龄和体重', d: '儿童用药按体重算，这两个数字医生第一时间就要。', pit: '别先去成人急诊排队，儿童专科更对口。', bring: '医保卡或家长身份证、孩子户口本' }
    ],
    breath: [
      { t: '路上让人保持舒服的坐位', d: '别平躺，松开领口，减少说话，车上留一扇窗通风。', pit: '别为了「躺着休息」把人放平，可能更难受。', bring: '平时用的吸入药物（若有）' },
      { t: '到院直接说「呼吸费力」', d: '分诊台会按呼吸情况优先安排，不需要先排队挂号。', pit: '别自己走很远去做检查，先跟分诊护士说一声。', bring: '身份证、医保卡、既往肺病病历' }
    ],
    poison: [
      { t: '把包装、瓶子或剩余物一起带上', d: '成分和剂量比口头描述有用得多，医生据此决定要不要洗胃或血液净化。', pit: '别自行催吐，也别给喝牛奶、盐水「解毒」。', bring: '原包装 / 瓶子 / 剩余物、拍照备份' },
      { t: '到院直接说明接触了什么、多久了', d: '说清名称、大约量、发生时间，能省下大量判断时间。', pit: '不确定成分时把包装给医生看，别靠猜。', bring: '包装、医保卡、陪人家属联系方式' }
    ],
    usual: [
      { t: '先想清楚要挂哪个科', d: '不确定就在导诊台问一句，比自己猜要快。', pit: '挂错科往往要退号重排，一上午就过去了。', bring: '既往病历、检查单' },
      { t: '把想问的问题提前写下来', d: '记在手机备忘录里，进诊室不容易漏。', pit: '别等医生问才想，问诊时间通常很短。', bring: '手机备忘录、用药清单' }
    ]
  };

  var NAV_FLOWS = {
    emergency: {
      name: '急诊流程', desc: '突发情况到院后，通常按这个顺序走。',
      steps: [
        { t: '先到急诊分诊台', d: '说清楚哪里不舒服、从什么时候开始，护士会判断先后次序。', pit: '别先去普通挂号窗口排队，急诊是按轻重分级就诊的。', bring: '身份证、医保卡或医保电子凭证' },
        { t: '挂急诊号并做好医保登记', d: '建档、挂号、把医保信息关联上，之后缴费和报销都靠它。', pit: '医保登记要在就诊这次做，漏了后面补办会多跑一趟。', bring: '少量现金，夜里自助机有时不支持扫码' },
        { t: '按分诊等级候诊', d: '更危重的人会先被叫到，这是正常安排，不是插队。', pit: '等的时候如果更难受了，要主动回去跟分诊护士说，别硬扛。', bring: '手机电量、陪同一人' },
        { t: '检查与化验', d: '缴费前核对单据上的姓名；做完把每份结果收进同一个袋子。', pit: '不同楼之间常要走路，穿好外套、留一个人守着物品。', bring: '既往病历、正在吃的药盒或清单' },
        { t: '取药或处置', d: '问清用法、次数和什么时候回来复诊，不确定就当场再问一遍。', pit: '药房常在一层另一侧，别急着走，先确认药都拿齐了。', bring: '装单据的袋子或文件袋' },
        { t: '离院或转住院', d: '走之前收齐发票、费用清单、诊断证明和检查报告。', pit: '这些单据事后补打很麻烦，离院前一定清点一次。', bring: '所有单据、陪人家属的联系方式' }
      ]
    },
    outpatient: {
      name: '门诊流程', desc: '不急的情况，白天按这个顺序走更从容。',
      steps: [
        { t: '预约或现场挂号', d: '多数医院可以提前在公众号约号，能挑人少的时间段。', pit: '部分专家号只放固定时段，出发前看一眼放号规则。', bring: '手机、既往病历' },
        { t: '到科室签到候诊', d: '到了先在自助机或护士站签到，不签到可能不会被叫号。', pit: '过了号要重新签到，别离开候诊区太久。', bring: '检查单、用药清单' },
        { t: '看诊与缴费检查', d: '把想问的问题提前写在手机备忘录里，不容易漏。', pit: '缴费前核对项目，有疑问当场问清楚。', bring: '既往检查报告原件' },
        { t: '取药并约好复诊', d: '确认用法、复诊时间，把病历和发票收好。', pit: '病历本下次还要用，别随手丢在候诊椅上。', bring: '文件袋' }
      ]
    },
    inpatient: {
      name: '住院流程', desc: '医生说需要住院时，家属按这几步办就行。',
      steps: [
        { t: '拿住院通知单', d: '确认病区、床位是当天还是等床，问清去哪栋楼办。', pit: '住院处和急诊楼常常不在一处，先问路再走。', bring: '住院通知单、身份证、医保卡' },
        { t: '办入院登记与医保登记', d: '在住院处建档，医保信息必须这次核对准确。', pit: '异地就医一般要先备案，漏了会影响报销比例。', bring: '医保电子凭证、异地备案记录' },
        { t: '交押金', d: '押金可退，出院结算时多退少补。', pit: '保留好押金条，别和一堆单据混在一起。', bring: '支付方式、押金条' },
        { t: '到病区交给护士站', d: '把住院单、病历和正在吃的药交给护士，听一遍病区规则。', pit: '陪护证、探视时间、订餐这些都在护士站问，别到处找。', bring: '洗漱用品、吸管、拖鞋、陪护证件' },
        { t: '出院结算', d: '收好费用清单、发票、诊断证明、出院小结和带药单。', pit: '出院小结和诊断证明后续报销、复诊都要用，务必带走。', bring: '文件袋、所有押金条' }
      ]
    }
  };

  var TRAVELS = [
    { id: 'car',       name: '自己开车 / 打车', short: '开车',  factor: 1,    api: 'car'  },
    { id: 'ambulance', name: '救护车',          short: '救护车', factor: .85,  api: 'car'  },
    { id: 'walk',      name: '步行 / 公交',      short: '步行',  factor: 2.5,  api: 'walk' }
  ];

  /* 真实医院的能力依据：认证索引（NavCapability）+ 高德 POI 的客观类型字段。
     命中认证标签的医院排序优先，理由是「已核对」而不是关键词猜测。 */
  var MATCH_WORDS = {
    chest:  ['胸痛中心', '心血管', '心脏', '胸科', '胸痛', '三级甲等', '综合医院'],
    stroke: ['高级卒中中心', '卒中', '脑科', '神经', '三级甲等', '综合医院'],
    bleed:  ['创伤中心', '急救中心', '创伤', '外科', '三级甲等', '综合医院'],
    burn:   ['烧伤', '三级甲等', '综合医院'],
    child:  ['儿童医院', '儿科 / 妇幼', '妇幼', '妇产', '儿科', '妇幼保健'],
    breath: ['呼吸', '胸科', '心肺', '三级甲等', '综合医院'],
    poison: ['中毒', '急救中心', '急诊', '三级甲等', '综合医院'],
    usual:  ['三级甲等', '综合医院', '基层医疗机构']
  };

  /* ==========================================================
     状态与工具
     ========================================================== */
  var state = {
    origin: null, originLabel: '', locMode: 'demo', locInfo: null,
    travel: 'car', situation: null, hospital: null,
    flow: 'emergency', checked: {}, tab: 'guide',
    routeInfo: null, routeError: '', routeBusy: false,
    farNote: '',
    hospitals: DEMO_HOSPITALS,   // 当前名单：演示数据 或 高德真实 POI
    dataSource: 'demo',          // 'demo' | 'real'
    cityName: NAV_CITY.name,
    cityAdcode: '',
    districts: [],
    photos: {}, photoBusy: {}, locating: false,
    realError: ''
  };
  var routeSeq = 0, hospSeq = 0, photoSeq = 0;

  /* 是否真的拿到了用户的精确位置。
     IP 只能到城市，绝不能拿城市中心去算「附近医院」和「几分钟到」——那是骗人。 */
  /* Windows 位置服务常把 WiFi/IP 混合定位当成功返回，误差可达几公里到几十公里
     （用户实际在南山，设备给光明区）。误差超过 2km 的坐标不许当精确位置用。 */
  var GPS_MAX_ACCURACY_M = 2000;
  function accuracyUsable(i) {
    if (!i || i.accuracy == null) return true;   // 区/地址检索、手动输入没有误差字段
    return i.accuracy <= GPS_MAX_ACCURACY_M;
  }
  function coarseGps(i) {
    return !!(i && i.mode === 'gps' && i.accuracy != null && i.accuracy > GPS_MAX_ACCURACY_M);
  }
  function hasPrecise() {
    var i = state.locInfo;
    if (!i || i.mode === 'fail') return false;
    var real = i.locationLevel === 'address' || i.locationLevel === 'district' ||
               i.mode === 'gps' || i.mode === 'manual';
    return real && accuracyUsable(i);
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || ICONS.care) + '</svg>'; }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function chip(text, kind) { return '<span class="chip ' + (kind || '') + '">' + esc(text) + '</span>'; }
  function travel() { return byId(TRAVELS, state.travel) || TRAVELS[0]; }

  /* 手机端判定放在 JS 里，避免写私有媒体查询（组规）。
     手指缩放一律用 CSS transform，不重新请求静态图，所以没有等待图片的延迟。 */
  function isMobileView() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 720px)').matches);
  }
  function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function touchDist(t) {
    var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
  }
  function touchMid(t) {
    return { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
  }
  var miniView = { scale: 1, panX: 0, panY: 0 };
  function miniImg() { var b = $('mapMini'); return b ? b.querySelector('img') : null; }
  function applyMiniTransform() {
    var img = miniImg();
    if (!img) return;
    img.style.transform = 'translate(' + miniView.panX + 'px,' + miniView.panY + 'px) scale(' + miniView.scale + ')';
  }
  function resetMiniView() {
    miniView.scale = 1; miniView.panX = 0; miniView.panY = 0;
    applyMiniTransform();
  }
  /* 小地图的 img 会被 renderMap 重建，所以手势监听绑在容器上（事件委托，只绑一次） */
  function bindMiniGestures() {
    var box = $('mapMini');
    if (!box) return;
    var g = null;
    box.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var m = touchMid(e.touches);
        g = { mode: 'pinch', d: touchDist(e.touches), scale: miniView.scale,
              mx: m.x, my: m.y, panX: miniView.panX, panY: miniView.panY };
        e.preventDefault();
      } else if (e.touches.length === 1 && miniView.scale > 1.02) {
        g = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY,
              panX: miniView.panX, panY: miniView.panY };
        e.preventDefault();
      }
    }, { passive: false });
    box.addEventListener('touchmove', function (e) {
      if (!g) return;
      e.preventDefault();
      if (g.mode === 'pinch' && e.touches.length === 2) {
        var m = touchMid(e.touches);
        miniView.scale = clampNum(g.scale * touchDist(e.touches) / g.d, 1, 3.5);
        miniView.panX = g.panX + (m.x - g.mx);
        miniView.panY = g.panY + (m.y - g.my);
      } else if (g.mode === 'pan' && e.touches.length === 1) {
        miniView.panX = g.panX + e.touches[0].clientX - g.x;
        miniView.panY = g.panY + e.touches[0].clientY - g.y;
      }
      applyMiniTransform();
    }, { passive: false });
    function end(e) { if (!e.touches.length) g = null; }
    box.addEventListener('touchend', end);
    box.addEventListener('touchcancel', end);
    box.addEventListener('dblclick', resetMiniView);
  }

  function haversine(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  function minutes(km, t) {
    var v = t || travel();
    var speed = { car: 26, ambulance: 32, walk: 9 }[v.id] || 26;
    var base = v.id === 'ambulance' ? 4 : (v.id === 'car' ? 6 : 2);
    return Math.max(3, Math.round(km / speed * 60 + base));
  }
  function hospitalKm(h) {
    if (h.real && h.distanceM != null && isFinite(h.distanceM)) return h.distanceM / 1000;
    return haversine(state.origin, h);
  }
  function measure(h) {
    var km = hospitalKm(h);
    // 路径规划只对「当前选中的那家」生效，不能把它的距离套到所有医院上
    var useRoute = !!(state.routeInfo && state.hospital === h.id);
    var baseMin = useRoute ? state.routeInfo.min : minutes(km, TRAVELS[0]);
    return {
      km: useRoute ? state.routeInfo.km : Math.round(km * 10) / 10,
      min: Math.max(1, Math.round(baseMin * travel().factor)),
      real: useRoute
    };
  }

  var toastTimer;
  function toast(msg) {
    var el = $('navToast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }

  /* ==========================================================
     匹配：演示数据看能力标签；真实 POI 看名称 / 类型关键词
     ========================================================== */
  function evaluate(sit) {
    var real = state.dataSource === 'real';
    var words = MATCH_WORDS[sit.id] || [];
    return state.hospitals.map(function (h) {
      var km = hospitalKm(h);
      if (real) {
        var certs = h.certs || [];
        var certText = certs.map(function (c) { return c.label; }).join(' ');
        var text = h.name + ' ' + (h.type || '') + ' ' + (h.caps || []).join(' ') + ' ' + certText;
        var hits = words.filter(function (w) { return text.indexOf(w) >= 0; });
        var base = hits.length * 45;
        if (certs.length) base += 120;                       // 已核对认证，优先级最高
        if (/三级甲等/.test(text)) base += 25;
        if (/综合医院/.test(text)) base += 12;
        if (/基层医疗机构|诊所|卫生服务站/.test(text)) base -= 70;
        return {
          h: h, hits: hits, miss: [], km: km, min: minutes(km),
          full: false, boost: 0, score: base - km * 2.5,
          reason: certs.length
            ? '已核对：' + certs.map(function (c) { return c.label; }).join('、')
            : (hits.length
                ? '医院类型里有「' + hits.join('、') + '」，与' + sit.label + '相关'
                : '附近的' + (h.typeShort || '医疗机构'))
        };
      }
      var need = sit.need;
      var hits2 = need.filter(function (c) { return h.caps.indexOf(c) >= 0; });
      var miss2 = need.filter(function (c) { return h.caps.indexOf(c) < 0; });
      var boost = (sit.prefer && sit.prefer.indexOf(h.id) >= 0) ? 350 : 0;
      return {
        h: h, hits: hits2, miss: miss2, km: km, min: minutes(km),
        full: miss2.length === 0, boost: boost,
        score: hits2.length * 1000 - miss2.length * 400 - km * 6 +
               (h.caps.indexOf('24h急诊') >= 0 ? 30 : 0) + boost,
        reason: ''
      };
    }).sort(function (a, b) { return b.score - a.score || a.km - b.km; });
  }

  function rankGroups(list) {
    if (state.dataSource === 'real') {
      var top = list.slice(0, 2);
      var rest = list.slice(2).filter(function (r) { return r.score > -90; });
      var low = list.filter(function (r) { return r.score <= -90; });
      return [
        { key: 'first', title: '按情况更对口', sub: '名称或类型与当前情况相关', rows: top },
        { key: 'alt', title: '附近其它医院', sub: '也能去，路程与类型供参考', rows: rest },
        { key: 'no', title: '基层门诊 · 急症先别去', sub: '诊所 / 社区卫生站，突发情况请直接去有急诊的医院', rows: low }
      ].filter(function (g) { return g.rows.length > 0; });
    }
    var full = list.filter(function (r) { return r.full; });
    var partial = list.filter(function (r) { return !r.full && r.hits.length > 0; });
    var none = list.filter(function (r) { return r.hits.length === 0; });
    return [
      { key: 'first', title: '优先考虑', sub: '需要的救治能力都具备', rows: full.slice(0, 2) },
      { key: 'alt', title: '也可以考虑', sub: '稍远，或只具备部分能力', rows: full.slice(2).concat(partial) },
      { key: 'no', title: '这种情况先别去', sub: '缺关键能力，可能要再转一次院', rows: none }
    ].filter(function (g) { return g.rows.length > 0; });
  }

  function whyText(r, sit, key) {
    var m = measure(r.h);
    if (state.dataSource === 'real') {
      var bits = [r.reason];
      if (r.h.address) bits.push('地址：' + r.h.address);
      bits.push('约 ' + m.min + ' 分钟、' + m.km.toFixed(1) + ' km');
      if (key === 'first') bits.unshift('按你选的情况排在这一档');
      if (key === 'no') bits.push('请优先选择有急诊的综合医院');
      return bits.map(function (x) { return esc(x); }).join('　·　');
    }
    if (key === 'first') {
      return '具备 <b>' + esc(r.hits.join('、')) + '</b>，' + esc(sit.label) + '需要的能力这里都有，' +
             '约 ' + m.min + ' 分钟可到。' +
             (r.boost && sit.preferNote ? ' ' + esc(sit.preferNote) + '。' : '') +
             (r.h.note ? ' ' + esc(r.h.note) : '');
    }
    if (key === 'alt') {
      if (r.full) return '能力齐全，只是路程稍远（约 ' + m.min + ' 分钟）。若首选那家排队久，可以换这家。';
      return '有 <b>' + esc(r.hits.join('、')) + '</b>，但缺 ' + esc(r.miss.join('、')) +
             '，到了可能还要再转一次院。' + (r.h.note ? ' ' + esc(r.h.note) : '');
    }
    return '缺 ' + esc(r.miss.join('、')) + '，' + esc(r.h.note || '接不住这类情况，别把时间花在路上。');
  }

  /* ==========================================================
     地图辅助
     ========================================================== */
  function mapHospitals() {
    var sit = byId(NAV_SITUATIONS, state.situation);
    var out = [];
    if (state.hospital) {
      var picked = byId(state.hospitals, state.hospital);
      if (picked) out.push(picked);
    }
    if (sit) {
      rankGroups(evaluate(sit)).forEach(function (g) {
        if (g.key !== 'first') return;
        g.rows.forEach(function (r) {
          if (out.length < 3 && !out.some(function (x) { return x.id === r.h.id; })) out.push(r.h);
        });
      });
    }
    if (!out.length) out = state.hospitals.slice(0, 3);
    return out.slice(0, 3);
  }
  function midPoint(list) {
    var lat = 0, lng = 0;
    list.forEach(function (p) { lat += p.lat; lng += p.lng; });
    return { lat: lat / list.length, lng: lng / list.length };
  }
  function centerOfMap() { return midPoint([state.origin].concat(mapHospitals())); }

  /* 示意图不是地图底图：只表达相对方位，明确标注「非地图」 */
  function schematic(large) {
    var hs = mapHospitals();
    var all = [state.origin].concat(hs);
    var minLat = Math.min.apply(null, all.map(function (p) { return p.lat; }));
    var maxLat = Math.max.apply(null, all.map(function (p) { return p.lat; }));
    var minLng = Math.min.apply(null, all.map(function (p) { return p.lng; }));
    var maxLng = Math.max.apply(null, all.map(function (p) { return p.lng; }));
    var W = large ? 900 : 760, H = large ? 520 : 260, pad = 64;
    var spanLat = Math.max(maxLat - minLat, .02), spanLng = Math.max(maxLng - minLng, .02);
    function pos(p) {
      return {
        x: pad + (p.lng - minLng) / spanLng * (W - pad * 2),
        y: H - pad - (p.lat - minLat) / spanLat * (H - pad * 2)
      };
    }
    var o = pos(state.origin);
    var lines = hs.map(function (h) {
      var p = pos(h);
      return '<line x1="' + o.x.toFixed(1) + '" y1="' + o.y.toFixed(1) + '" x2="' + p.x.toFixed(1) +
             '" y2="' + p.y.toFixed(1) + '" stroke="#EFD6C2" stroke-width="2" stroke-dasharray="6 6"/>';
    }).join('');
    var dots = hs.map(function (h, i) {
      var p = pos(h);
      var d = hospitalKm(h).toFixed(1);
      return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="13" fill="#22845F"/>' +
             '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">' + String.fromCharCode(65 + i) + '</text>' +
             '<text x="' + (p.x + 20).toFixed(1) + '" y="' + (p.y + 4).toFixed(1) + '" fill="#5A483A" font-size="' + (large ? 15 : 13) + 'px">' + esc(h.name.slice(0, 16)) + (hasPrecise() ? (' · ' + d + ' km') : '') + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="位置关系示意图，非地图" style="width:100%;height:100%;display:block">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" rx="22" fill="#FCF6F0"/>' +
      '<path d="M0 ' + (H * .33) + ' Q' + (W / 2) + ' ' + (H * .12) + ' ' + W + ' ' + (H * .36) + '" stroke="#F3EAE1" stroke-width="2" fill="none"/>' +
      '<path d="M0 ' + (H * .7) + ' Q' + (W / 2) + ' ' + (H * .88) + ' ' + W + ' ' + (H * .66) + '" stroke="#F3EAE1" stroke-width="2" fill="none"/>' +
      lines +
      '<circle cx="' + o.x.toFixed(1) + '" cy="' + o.y.toFixed(1) + '" r="16" fill="#C47A48"/>' +
      '<text x="' + o.x.toFixed(1) + '" y="' + (o.y + 4).toFixed(1) + '" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">S</text>' +
      '<text x="' + (o.x + 22).toFixed(1) + '" y="' + (o.y + 4).toFixed(1) + '" fill="#98562F" font-size="' + (large ? 15 : 13) + 'px" font-weight="600">' + (hasPrecise() ? '你在这里' : '城市中心（不是你的位置）') + '</text>' +
      dots +
      '<text x="' + (W - 16) + '" y="' + (H - 16) + '" text-anchor="end" fill="#5A483A" font-size="12px">位置关系示意图 · 非地图</text>' +
      '</svg>';
  }

  function mapStatusText() {
    var s = window.NavMap ? window.NavMap.status() : { hasWebKey: false };
    var base = s.hasWebKey
      ? '地图来自高德地图 · A / B / C 是医院' +
        (hasPrecise() ? '，S 是你的位置' : '；S 目前是城市中心，不是你的精确位置') +
        '。点「放大查看」后可拖动、缩放。'
      : '还没有配置高德 Key，当前是位置关系示意图。填入 Web服务 Key 后这里会变成真实高德地图与路线。';
    return state.farNote ? state.farNote + ' ' + base : base;
  }

  /* 静态图可用级别随「图片尺寸」变化：深圳大图 12–15 被拒、小图 12–14 被拒。
     失败记录按 size 分开，同时记住每个尺寸上次成功的级别，避免每次重新试错。 */
  var BIG_SIZE = '1024*768', BIG_W = 2048, BIG_H = 1536, BIG_DEFAULT_ZOOM = 16;
  var zoomMemo = {};
  function memo(size) {
    if (!zoomMemo[size]) zoomMemo[size] = { failed: {}, good: null };
    return zoomMemo[size];
  }
  function zoomFailed(size, z) { var f = memo(size).failed[z]; return f && Date.now() - f < 60000; }
  function markFailed(size, z) { memo(size).failed[z] = Date.now(); }
  function markGood(size, z) { memo(size).good = z; }
  function clampZoom(z) { return Math.max(4, Math.min(17, z)); }
  /* preferGood=true 只用于「首次打开 / 复位」，避免每次都试错；
     用户主动缩放时必须尊重目标级别，不能被上次成功级别拉回去。 */
  function zoomCandidates(size, z, preferGood) {
    var out = [], m = memo(size);
    var first = preferGood && m.good ? m.good : z;
    [first, z, z - 1, 11, 10, z + 1, 16, 15, 9, 8, 17, 7, 6].forEach(function (v) {
      v = clampZoom(v);
      if (out.indexOf(v) < 0 && !zoomFailed(size, v)) out.push(v);
    });
    return out;
  }
  function zoomInDirection(size, z, dir) {
    var v, list = [];
    if (dir >= 0) { for (v = z; v <= 17; v++) list.push(v); }
    else { for (v = z; v >= 4; v--) list.push(v); }
    for (var i = 0; i < list.length; i++) if (!zoomFailed(size, list[i])) return list[i];
    return null;
  }
  function mergeOpts(a, b) {
    var o = {};
    Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b || {}).forEach(function (k) { o[k] = b[k]; });
    return o;
  }
  function mountStatic(box, opts, imgId, onFail) {
    var size = opts.size || '900*340';
    var base = opts.zoom || memo(size).good || 12;
    var first = memo(size).good || base;
    // 内容没变就不重建：避免每次 renderAll 都重新下载图片造成闪烁与卡顿
    var wanted = window.NavMap.staticUrl(mergeOpts(opts, { zoom: first }));
    var cur = box.querySelector('img');
    if (cur && cur.getAttribute('src') === wanted && cur.naturalWidth > 0) return;
    var list = zoomCandidates(size, base, true), i = 0;
    function attempt() {
      if (i >= list.length) { onFail(); return; }
      var z = list[i++];
      var url = window.NavMap.staticUrl(mergeOpts(opts, { zoom: z }));
      box.innerHTML = '<img id="' + imgId + '" alt="高德静态地图：当前位置与医院" src="' + esc(url) + '">';
      var el = $(imgId);
      if (el) {
        el.addEventListener('load', function () { markGood(size, z); });
        el.addEventListener('error', function () { markFailed(size, z); attempt(); });
      }
    }
    attempt();
  }

  function renderMap() {
    var box = $('mapMini');
    if (!box) return;
    var hs = mapHospitals();
    var shown = isMobileView() ? hs.slice(0, 2) : hs;
    $('mapLegend').innerHTML = '<span class="nav-map-lg is-me"><i>S</i>' + (hasPrecise() ? '你在这里' : '待定位') + '</span>' + shown.map(function (h, i) {
      return '<span class="nav-map-lg"><i>' + String.fromCharCode(65 + i) + '</i>' + esc(h.name.slice(0, 14)) + '</span>';
    }).join('') + (hs.length > shown.length
      ? '<span class="nav-map-lg">等 ' + hs.length + ' 家</span>' : '');
    $('mapStatus').textContent = mapStatusText();
    $('mapTitle').textContent = state.situation
      ? '你在哪 · 推荐医院在哪（' + esc(byId(NAV_SITUATIONS, state.situation).label) + '）'
      : '你在哪 · 附近医院在哪';
    if (window.NavMap && window.NavMap.webKey()) {
      mountStatic(box, {
        center: centerOfMap(), size: '900*340',
        origin: hasPrecise() ? state.origin : null, destinations: hs,
        path: state.routeInfo ? state.routeInfo.path : null
      }, 'mapMiniImg', function () {
        box.innerHTML = schematic(false);
        $('mapStatus').textContent = '高德地图图片没能加载，已切回示意图，功能不受影响。' + (state.farNote ? ' ' + state.farNote : '');
      });
    } else box.innerHTML = schematic(false);
    // 图片被重建后把手上的缩放倍数重新贴回去（不触发任何请求）
    applyMiniTransform();
  }

  /* ==========================================================
     医院现场照片：高德 POI photos，选中医院后按需加载（不拖慢首屏）
     ========================================================== */
  function renderGuidePhotos() {
    var box = $('guidePhotos');
    if (!box) return;
    if (state.dataSource !== 'real') {
      box.innerHTML = '<div class="nav-photo-empty">离线演示模式下不显示现场照片，下面的路线地图与到院动线仍然可用。</div>';
      return;
    }
    var h = byId(state.hospitals, state.hospital);
    if (!h) { box.innerHTML = ''; return; }
    var list = state.photos[h.id];
    // 主列表已带回高德 POI 照片时直接用，零额外请求
    if (list === undefined && h.photos && h.photos.length) {
      state.photos[h.id] = list = h.photos;
    }
    if (list === undefined) {
      if (!state.photoBusy[h.id]) { state.photoBusy[h.id] = true; loadGuidePhotos(h); }
      box.innerHTML = '<div class="nav-photo-empty">正在查找这家医院的现场照片…</div>';
      return;
    }
    if (!list.length) {
      box.innerHTML = '<div class="nav-photo-empty">这家医院在高德地图暂未收录现场照片。下面的路线地图与到院动线仍然可用，到了现场请以指示牌为准。</div>';
      return;
    }
    box.innerHTML = '<div class="nav-photo-grid">' + list.map(function (u, i) {
      return '<button type="button" class="nav-photo-item" data-photo="' + i + '" aria-label="查看现场照片 ' + (i + 1) + '">' +
             '<img src="' + esc(u) + '" alt="' + esc(h.name) + ' 现场照片 ' + (i + 1) + '" loading="lazy"></button>';
    }).join('') + '</div>' +
    '<div class="nav-photo-note">照片来自高德地图 POI 收录，点开可看大图。建筑外观可能已变化，到了现场请以指示牌为准。</div>';
  }
  function loadGuidePhotos(h) {
    if (!h || !window.NavMap || !window.NavMap.photos || !window.NavMap.webKey()) {
      state.photos[h.id] = []; delete state.photoBusy[h.id]; renderGuidePhotos(); return;
    }
    var token = ++photoSeq;
    var adcode = state.cityAdcode || (state.locInfo && state.locInfo.adcode) || '';
    window.NavMap.photos(h.name, adcode).then(function (list) {
      if (token !== photoSeq) { delete state.photoBusy[h.id]; return; }
      state.photos[h.id] = list || [];
      delete state.photoBusy[h.id];
      if (state.hospital === h.id) renderGuidePhotos();
    }).catch(function () {
      if (token !== photoSeq) { delete state.photoBusy[h.id]; return; }
      state.photos[h.id] = [];
      delete state.photoBusy[h.id];
      if (state.hospital === h.id) renderGuidePhotos();
    });
  }
  function closePhoto() {
    $('photoBig').hidden = true;
    $('photoBigImg').removeAttribute('src');
    if ($('mapBig').hidden) document.body.style.overflow = '';
  }

  function renderGuideMap() {
    var box = $('guideMap');
    if (!box) return;
    var h = byId(state.hospitals, state.hospital);
    if (!h) {
      box.innerHTML = '<div class="nav-empty">先在上面点一家医院，这里会出现到这一家的路线地图。</div>';
      return;
    }
    if (window.NavMap && window.NavMap.webKey()) {
      mountStatic(box, {
        center: midPoint([state.origin, h]), size: '900*320', origin: state.origin,
        destinations: [h], path: state.routeInfo ? state.routeInfo.path : null
      }, 'guideImg', function () { box.innerHTML = schematic(false); });
    } else box.innerHTML = schematic(false);
  }

  /* ==========================================================
     可拖拽 / 可缩放的大地图
     预取一张 2048×1536 的高德大图，拖动时只做 CSS transform（零网络请求），
     只有主动缩放 / 复位才重新取图。这样拖动不会卡。
     ========================================================== */
  var bigView = { center: null, zoom: BIG_DEFAULT_ZOOM, panX: 0, panY: 0, scale: 1 };
  function bigMapOptions(z) {
    return {
      center: bigView.center, zoom: z, size: BIG_SIZE,
      origin: hasPrecise() ? state.origin : null, destinations: mapHospitals(),
      path: state.routeInfo ? state.routeInfo.path : null
    };
  }
  function bigTransform(img) {
    img.style.transform = 'translate(-50%,-50%) translate(' + bigView.panX + 'px,' + bigView.panY + 'px) scale(' + bigView.scale + ')';
  }
  function applyBigSrc(img, z, preferGood) {
    var list = zoomCandidates(BIG_SIZE, z, !!preferGood), i = 0;
    function attempt() {
      if (i >= list.length) {
        $('mapBigBody').innerHTML = schematic(true) +
          '<div class="nav-big-tip">这一区域的高德地图暂时不可用，已切回示意图。</div>';
        return;
      }
      var level = list[i++];
      bigView.zoom = level;
      img.onerror = function () { markFailed(BIG_SIZE, level); attempt(); };
      img.onload = function () {
        markGood(BIG_SIZE, level);
        $('mapBigTip').textContent = isMobileView()
          ? '双指缩放 · 单指拖动 · 当前级别 ' + level + ' · 右上角退出'
          : '按住拖动 · 滚轮或双击缩放 · 当前级别 ' + level + ' · 右上角退出';
      };
      img.src = window.NavMap.staticUrl(bigMapOptions(level));
    }
    attempt();
  }
  function panBigTo(x, y, stage, img) {
    var maxX = Math.max(0, (BIG_W - stage.clientWidth) / 2);
    var maxY = Math.max(0, (BIG_H - stage.clientHeight) / 2);
    bigView.panX = Math.max(-maxX, Math.min(maxX, x));
    bigView.panY = Math.max(-maxY, Math.min(maxY, y));
    bigTransform(img);   // 纯 CSS，不发任何请求
  }
  function paintBigMap() {
    var body = $('mapBigBody');
    var tip = isMobileView()
      ? '双指缩放 · 单指拖动 · 右上角退出大地图'
      : '按住拖动 · 滚轮或双击缩放 · 右上角退出大地图';
    body.innerHTML = '<div class="nav-big-stage" id="mapBigStage">' +
      '<img id="mapBigImg" alt="高德地图，可双指缩放、按住拖动"></div>' +
      '<div class="nav-big-tip">' + tip + '</div>';
    var img = $('mapBigImg'), stage = $('mapBigStage');
    if (!img || !stage) return;
    bigTransform(img);
    applyBigSrc(img, bigView.zoom, true);

    /* 鼠标 / 触控板：pointer 拖动 + 滚轮缩放，桌面行为保持不变 */
    var start = null, baseX = 0, baseY = 0;
    stage.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;   // 触摸交给下面的手势
      if (e.button !== undefined && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      baseX = bigView.panX; baseY = bigView.panY;
      stage.classList.add('is-dragging');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stage.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch' || !start) return;
      panBigTo(baseX + e.clientX - start.x, baseY + e.clientY - start.y, stage, img);
    });
    function finish() {
      if (!start) return;
      start = null;
      stage.classList.remove('is-dragging');
      var maxX = Math.max(0, (BIG_W - stage.clientWidth) / 2);
      var maxY = Math.max(0, (BIG_H - stage.clientHeight) / 2);
      if (Math.abs(bigView.panX) >= maxX - 2 || Math.abs(bigView.panY) >= maxY - 2) {
        $('mapBigTip').textContent = '已到地图边缘 · 点「−」缩小可看更远，或「复位」回到起点';
      }
    }
    stage.addEventListener('pointerup', finish);
    stage.addEventListener('pointercancel', finish);
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      var d = e.deltaY < 0 ? 1 : -1;
      setBigZoom(bigView.zoom + d, d);
    }, { passive: false });
    stage.addEventListener('dblclick', function () {
      if (!isMobileView()) setBigZoom(bigView.zoom + 1, 1);
    });

    /* 手机：单指拖动 + 双指缩放，全程只改 CSS transform，零请求、零延迟 */
    var tg = null;
    stage.addEventListener('touchstart', function (e) {
      if (e.touches.length === 2) {
        var m = touchMid(e.touches);
        tg = { mode: 'pinch', d: touchDist(e.touches), scale: bigView.scale,
               mx: m.x, my: m.y, panX: bigView.panX, panY: bigView.panY };
        e.preventDefault();
      } else if (e.touches.length === 1) {
        tg = { mode: 'pan', x: e.touches[0].clientX, y: e.touches[0].clientY,
               panX: bigView.panX, panY: bigView.panY };
      }
    }, { passive: false });
    stage.addEventListener('touchmove', function (e) {
      if (!tg) return;
      e.preventDefault();
      if (tg.mode === 'pinch' && e.touches.length === 2) {
        var m = touchMid(e.touches);
        bigView.scale = clampNum(tg.scale * touchDist(e.touches) / tg.d, 0.6, 3);
        panBigTo(tg.panX + (m.x - tg.mx), tg.panY + (m.y - tg.my), stage, img);
        $('mapBigTip').textContent = '当前放大 ' + Math.round(bigView.scale * 100) + '% · 双指缩放、单指拖动';
      } else if (tg.mode === 'pan' && e.touches.length === 1) {
        panBigTo(tg.panX + e.touches[0].clientX - tg.x,
                 tg.panY + e.touches[0].clientY - tg.y, stage, img);
      }
    }, { passive: false });
    function touchEnd(e) { if (!e.touches.length) tg = null; }
    stage.addEventListener('touchend', touchEnd);
    stage.addEventListener('touchcancel', touchEnd);
  }
  function setBigZoom(z, dir) {
    z = clampZoom(z);
    var target = zoomInDirection(BIG_SIZE, z, dir || 0);
    if (target == null) return;
    // 已在最高 / 最低级别时给明确反馈，不重复请求同一张图
    if (target === bigView.zoom && (target === 17 || target === 4)) {
      $('mapBigTip').textContent = target === 17
        ? '已是最详细级别 · 点「−」可看更远'
        : '已是最远级别 · 点「+」可看得更细';
      return;
    }
    bigView.panX = 0; bigView.panY = 0;
    var img = $('mapBigImg');
    if (img) { bigTransform(img); applyBigSrc(img, target, false); }
    else bigView.zoom = target;
  }
  /* 手机端点 +/− 与复位也只改 CSS 倍数，不重新取图，完全没有等图片的延迟；
     桌面端仍换不同级别的静态图，保持放大后的清晰度。 */
  function stepZoom(dir) {
    if (!isMobileView()) { setBigZoom(bigView.zoom + dir, dir); return; }
    var img = $('mapBigImg');
    if (!img) return;
    bigView.scale = clampNum(bigView.scale + dir * 0.35, 0.6, 3);
    bigTransform(img);
    $('mapBigTip').textContent = '当前放大 ' + Math.round(bigView.scale * 100) + '% · 双指缩放更方便';
  }
  function resetBigZoom() {
    var img = $('mapBigImg');
    bigView.center = centerOfMap();
    bigView.panX = 0; bigView.panY = 0; bigView.scale = 1;
    if (isMobileView()) {
      if (img) bigTransform(img);
      $('mapBigTip').textContent = '已复位 · 双指缩放、单指拖动';
      return;
    }
    bigView.zoom = 13;
    if (img) { bigTransform(img); applyBigSrc(img, memo(BIG_SIZE).good || BIG_DEFAULT_ZOOM, true); }
  }
  function openBigMap() {
    $('mapBig').hidden = false;
    document.body.style.overflow = 'hidden';
    var h = byId(state.hospitals, state.hospital);
    $('mapBigTitle').textContent = '完整地图 · ' + (h ? h.name : (state.cityName || '你在哪，医院在哪'));
    bigView.center = centerOfMap();
    bigView.zoom = memo(BIG_SIZE).good || BIG_DEFAULT_ZOOM;
    bigView.panX = 0; bigView.panY = 0; bigView.scale = 1;
    if (window.NavMap && window.NavMap.webKey()) {
      paintBigMap();
      $('mapBigTip').textContent = isMobileView()
        ? '地图加载中… 加载后双指缩放、单指拖动'
        : '地图加载中… 加载后可按住拖动、滚轮缩放';
    } else {
      $('mapBigBody').innerHTML = schematic(true) +
        '<div class="nav-big-tip">当前是位置关系示意图。配置高德 Web服务 Key 后可显示并拖动真实地图。</div>';
      $('mapBigTip').textContent = '示意图 · 点右上角「退出大地图」回到页面';
    }
  }
  function closeBigMap() {
    $('mapBig').hidden = true;
    document.body.style.overflow = '';
    $('mapBigBody').innerHTML = '';
  }

  /* ==========================================================
     路径规划
     ========================================================== */
  function updateRoute() {
    var token = ++routeSeq;
    state.routeInfo = null;
    state.routeError = '';
    var h = byId(state.hospitals, state.hospital);
    if (!h || !hasPrecise() || !window.NavMap || !window.NavMap.webKey()) { renderAll(); return; }
    state.routeBusy = true;
    renderRouteOverview();
    window.NavMap.route({
      origin: state.origin, destination: { lat: h.lat, lng: h.lng },
      mode: travel().api, city: state.cityName
    }).then(function (r) {
      if (token !== routeSeq) return;
      state.routeInfo = r; state.routeBusy = false; renderAll();
    }).catch(function (e) {
      if (token !== routeSeq) return;
      state.routeError = e.message; state.routeBusy = false;
      renderRouteOverview(); renderMap(); renderGuideMap(); renderShare();
    });
  }
  function renderRouteOverview() {
    var box = $('routeOverview');
    if (!box) return;
    var h = byId(state.hospitals, state.hospital);
    if (!h) {
      box.innerHTML = '<div class="nav-empty">选好情况并点一家医院，这里会给出「怎么去、大概多久」。</div>';
      return;
    }
    if (!hasPrecise()) {
      /* 城市级 / 未定位：城市中心不是用户的位置，任何公里数和分钟数都是编的，一律不给 */
      box.innerHTML = '<div class="nav-route-head"><div><div class="nav-li-t">去 ' + esc(h.name) + '</div>' +
        '<div class="nav-li-d">先确认你在哪个区，才会算距离和用时</div></div>' +
        '<span class="chip">位置未确认</span></div>' +
        '<p class="nav-note mt-3">现在只知道你在' + esc(state.cityName || '这个城市') +
        '。城市中心不代表你的位置，所以这里先不给公里数和分钟数。选一下「所在区」或点「获取我的精确位置」，马上就有真实结果。</p>';
      return;
    }
    var baseMin = state.routeInfo ? state.routeInfo.min : minutes(hospitalKm(h), TRAVELS[0]);
    var src = state.routeInfo ? '高德路径规划' : (window.NavMap && window.NavMap.webKey() ? '正在算路线…' : '按内置距离估算');
    var rows = TRAVELS.map(function (t) {
      var min = Math.max(1, Math.round(baseMin * t.factor));
      var on = t.id === state.travel;
      return '<button type="button" class="nav-travel' + (on ? ' is-on' : '') + '" data-travel="' + t.id + '">' +
        '<span class="nav-travel-n">' + esc(t.name) + '</span>' +
        '<span class="nav-travel-t">约 ' + min + ' 分钟</span>' +
        '<span class="nav-travel-s">' + (on && state.routeInfo ? '高德实时' : '估算') + '</span></button>';
    }).join('');
    var m = measure(h);
    var head = '<div class="nav-route-head"><div><div class="nav-li-t">去 ' + esc(h.name) + '</div>' +
      '<div class="nav-li-d">约 ' + m.km.toFixed(1) + ' km　·　' + esc(src) +
      (state.routeError ? '　·　接口没连上，已用估算' : '') + '</div></div>' +
      '<span class="chip">当前：' + esc(travel().name) + '</span></div>';
    box.innerHTML = head + '<div class="nav-travel-row">' + rows + '</div>' +
      '<p class="nav-note mt-3">点上面任一行可以换出行方式。救护车按驾车时间打折估算；步行 / 公交为粗略估算，不掌握实时路况与床位。</p>';
  }

  /* ==========================================================
     渲染：定位 / 情况 / 结果 / 指引 / 流程 / 分享
     ========================================================== */
  function accuracyText(info) {
    if (info && typeof info.accuracy === 'number') return '定位精度 ±' + info.accuracy + ' 米';
    return info && info.locationLevel === 'city' ? '精度：城市级（按网络位置估算）'
      : (info && info.locationLevel === 'address' ? '精度：地址级' : '精度未知（外部传入或手动选择）');
  }
  function sourceText(info) {
    return {
      'amap-regeo': '高德逆地理编码', 'amap-ip': '网络位置 · 城市级',
      'amap-geocode': '高德地址检索', 'amap-district': '所在区 · 区级', 'saved': '上次记住的位置',
      'offline-fallback': '接口未连通 · 离线估算',
      'offline-region': '离线区域估算', 'browser': '浏览器定位',
      'external': '外部模块传入', 'fallback': '自动降级'
    }[info.source] || '位置信息';
  }
  function renderLoc() {
    var info = state.locInfo;
    $('locName').textContent = info && info.address ? info.address : (info ? info.shortLabel : state.originLabel);
    $('locSub').textContent = !hasPrecise()
      ? (state.cityName || '当前城市') + '　·　还不知道你具体在哪'
      : (state.dataSource === 'real'
          ? (state.cityName || '当前城市') + '　·　附近 ' + state.hospitals.length + ' 家真实医院'
          : (state.cityName || NAV_CITY.name) + '　·　' + state.hospitals.length + ' 家演示医院');
    var modes = {
      demo: { text: '示例起点', warn: false }, manual: { text: '手动选择', warn: false },
      gps: { text: '已定位', warn: false }, ip: { text: '只知道城市', warn: true },
      district: { text: '已定位（区级）', warn: false },
      address: { text: '已定位（地址级）', warn: false },
      fail: { text: '已自动降级', warn: true }, far: { text: '超出演示范围', warn: true }
    };
    var m = modes[state.locMode] || modes.demo;
    if (info && info.degraded) m = { text: '部分降级', warn: true };
    if (coarseGps(info)) m = { text: '位置偏差较大', warn: true };
    $('locState').textContent = state.locating ? '正在确认位置…' : m.text;
    $('locDot').className = 'nav-loc-dot' + (m.warn ? ' is-warn' : '');
    var hint;
    var forgetBtn = $('btnForget');
    if (forgetBtn) forgetBtn.hidden = !(window.NavLocation && window.NavLocation.recall());
    if (state.dataSource !== 'real') {
      hint = '当前为离线演示数据。配置高德 Key 后会自动获取真实位置与附近医院。';
    } else if (info && (info.restored || info.source === 'saved')) {
      hint = '已恢复你上次的位置，附近医院按这里重算。想换位置就选区或输入地址。';
    } else if (coarseGps(info)) {
      hint = '设备给了一个误差约 ±' + (Math.round(info.accuracy / 100) / 10) +
             ' 公里的位置（显示「' + (info.shortLabel || info.address || '') +
             '」），这种 WiFi/IP 估算经常对不上。如果这不是你在的地方，点下面的「这不是我的位置」，再选区 / 输地址，或用手机打开本页定位。';
    } else if (!hasPrecise()) {
      hint = '现在只知道你在' + (state.cityName || '这个城市') +
             '，还不知道具体在哪。点「获取我的精确位置」允许浏览器定位，或选所在区 / 输入小区名——否则下面的距离和时间都不作数。';
    } else if (info && info.locationLevel === 'district') {
      hint = '已按你选的区匹配附近医院。想更准，可再输入街道或小区名。';
    } else {
      hint = '已按这个地点匹配附近医院、路线与地图。';
    }
    $('locHint').textContent = hint;
    var wrong = $('btnLocWrong');
    if (wrong) wrong.hidden = !(info && info.mode === 'gps');
    // 以下节点对用户隐藏，仅保留给程序 / 无障碍 / 回归测试读取
    $('locAddress').textContent = info ? (info.address || '尚未取得街道地址（离线模式）') : '';
    $('locMeta').textContent = info ? accuracyText(info) + '　·　完整地址可直接发给家人或告知 120' : '';
    $('locMsg').textContent = [info && info.message, state.farNote].filter(Boolean).join(' ');
    $('locSrc').innerHTML = info
      ? '<span class="nav-loc-tag">' + esc(sourceText(info)) + '</span>' +
        '<span>坐标系 ' + esc(info.coordSys || 'WGS-84') + '</span>' +
        '<span>' + (state.dataSource === 'real' ? '医院名单来自高德真实数据' : '医院名单为课程演示数据') + '</span>'
      : '';
    renderDiag();
    renderPhone();
  }
  /* ==========================================================
     手机精确定位闭环：手机 GPS 拿坐标 → 复制带坐标的链接 → 电脑打开即用
     零后端、零第三方库，复用已有的 ?lat=&lng=&label= 参数
     ========================================================== */
  /* 公网/线上打开时，手机访问网址就是当前这个在线地址本身；
     只有本机 localhost / 内网 IP 才用局域网网卡地址。 */
  function isOnlineHost() {
    if (!/^https?:$/.test(location.protocol)) return false;
    var h = location.hostname;
    return !(h === 'localhost' || h === '127.0.0.1' ||
      /^192\.168\./.test(h) || /^10\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h));
  }
  /* 在线分享链接必须保留 sharecode，否则服务器返回 403「链接不完整」。
     只清掉本页自定义的 lat/lng/label 等参数，不动分享码。 */
  function onlineUrl() {
    try {
      var u = new URL(location.href);
      var sc = u.searchParams.get('sharecode');
      u.search = ''; u.hash = '';
      if (sc) u.searchParams.set('sharecode', sc);
      return u.toString();
    } catch (e) { return location.href.split('?')[0]; }
  }
  function phoneBase() {
    if (isOnlineHost()) return onlineUrl();
    var n = window.NavNetwork;
    if (!n || !n.ip) return '';
    return 'http://' + n.ip + ':' + (n.port || 5199) + '/navigation.html';
  }
  function phoneUrlList() {
    if (isOnlineHost()) return [onlineUrl()];
    var n = window.NavNetwork || {};
    var ips = n.ips && n.ips.length ? n.ips : (n.ip ? [n.ip] : []);
    return ips.map(function (x) {
      return 'http://' + x + ':' + (n.port || 5199) + '/navigation.html';
    });
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? (okMsg || '已复制') : '复制没成功，请手动选中上面的网址');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制'); }).catch(fallback);
    } else fallback();
  }
  function renderPhone() {
    var box = $('phoneUrl');
    if (!box) return;
    var urls = phoneUrlList();
    var online = isOnlineHost();
    if (!urls.length) {
      box.textContent = '还没启动局域网服务：在文件资源管理器里双击「启动手机访问.bat」（不要在对话里点开，那只会显示文件内容）。';
      $('btnCopyPhone').disabled = true;
      $('phoneHint').textContent = '也可以把本页发布成在线链接，手机用任意网络都能打开。';
    } else {
      box.innerHTML = urls.map(function (u, i) {
        return '<div' + (i ? ' class="nav-phone-alt"' : '') + '>' +
               (i ? '备用 ' + (i + 1) + '：' : '') + esc(u) + '</div>';
      }).join('');
      $('btnCopyPhone').disabled = false;
      $('phoneHint').textContent = online
        ? '这是在线地址（含分享码，别删），手机用 4G/5G 或任意 WiFi 都能直接打开；不需要和电脑连同一个网络。'
        : ((urls.length > 1 ? '有多个网卡地址，手机逐个试哪个能打开。' : '') +
           '手机需与电脑连同一个 WiFi；若打不开，多半是电脑防火墙或校园网隔离。');
      $('phoneHint').textContent += hasPrecise()
        ? ' 当前已有精确位置，点「复制带我位置的链接」可把坐标带到另一台设备。'
        : ' 手机打开网址并允许定位后，点「复制带我位置的链接」发回电脑即可。';
    }
  }

  /* 定位诊断：把真实环境与失败原因摊开给用户看，不再含糊 */
  function renderDiag() {
    var box = $('diagBody');
    if (!box || !window.NavLocation || !window.NavLocation.diagnostics) return;
    var d = window.NavLocation.diagnostics();
    var rows = [];
    var proto = d.protocol === 'file:' ? '双击 HTML（file://）'
      : (d.protocol === 'http:' || d.protocol === 'https:') ? '网址 / localhost' : (d.protocol || '未知');
    rows.push(['打开方式', proto]);
    rows.push(['浏览器定位权限', d.permission === 'granted' ? '已允许'
      : d.permission === 'prompt' ? '还没问过（点上面按钮会弹授权框）'
      : d.permission === 'denied' ? '已拒绝（地址栏小锁里改回允许）' : '尚未查询']);
    rows.push(['浏览器支持定位', d.geolocationSupported ? '支持' : '不支持']);
    rows.push(['安全上下文', d.secureContext ? '是（可以定位）' : '否（会被浏览器拦截）']);
    var g = d.lastGps;
    rows.push(['最近一次设备定位', !g ? '还没发起（点「获取我的精确位置」才会向设备要坐标）'
      : g.ok ? '成功，精度 ±' + Math.round(g.accuracy || 0) + ' 米，用时 ' + g.ms + 'ms'
      : '失败：' + (g.code === 3 ? '设备超时没给坐标' : g.code === 1 ? '权限被拒绝'
        : g.code === 2 ? '位置不可用' : '错误码 ' + g.code) + '，等了 ' + g.ms + 'ms']);
    rows.push(['设备报告的误差', state.locInfo && state.locInfo.accuracy != null
      ? '±' + state.locInfo.accuracy + ' 米' + (accuracyUsable(state.locInfo) ? '（可接受）' : '（超过 2km，不采用）')
      : '无（网络位置或手动指定）']);
    rows.push(['当前定位层级', hasPrecise() ? '精确位置（可算附近医院）'
      : coarseGps(state.locInfo) ? '设备定位但误差过大（不算精确）' : '仅城市级（不算附近）']);

    var tips = [];
    if (d.protocol === 'file:') {
      tips.push('双击 HTML 打开时，部分浏览器不给精确坐标。改成 localhost 更稳：在项目目录运行 <code>python -m http.server 5199</code>，再打开 <code>http://localhost:5199/navigation.html</code>。');
    }
    if (d.permission === 'denied') tips.push('地址栏左侧小锁 → 网站设置 → 位置 → 允许，然后刷新页面。');
    if (g && !g.ok && g.code === 3) {
      tips.push('设备迟迟没给出坐标：笔记本请确认 WiFi 开着、Windows「设置 → 隐私 → 位置」已打开；台式机没有 WiFi 模块时，浏览器通常只能给到城市级。');
    }
    tips.push('最可靠的两种：点「获取我的精确位置」并允许授权；或在下面输入小区 / 路口名，由高德地址检索定位。');
    box.innerHTML = '<dl class="nav-diag-list">' + rows.map(function (r) {
      return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>';
    }).join('') + '</dl><div class="nav-diag-tips"><b>可以试试</b><ul>' +
      tips.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul></div>';
  }

  function renderChoices() {
    $('choiceGrid').innerHTML = NAV_SITUATIONS.map(function (s) {
      return '<button type="button" class="nav-choice' + (state.situation === s.id ? ' is-on' : '') +
             '" data-sit="' + s.id + '" aria-pressed="' + (state.situation === s.id) + '">' +
             icon(s.icon) + '<b>' + esc(s.label) + '</b><span>' + esc(s.sub) + '</span></button>';
    }).join('');
    var sit = byId(NAV_SITUATIONS, state.situation);
    $('sitTipText').textContent = sit ? sit.tip : '先选一个情况，我们再帮你找医院。';
  }
  function hospCard(r, sit, key) {
    var picked = state.hospital === r.h.id;
    var cls = 'nav-hosp' + (key === 'first' ? ' is-first' : '') + (key === 'no' ? ' is-no' : '');
    var certChips = (r.h.certs || []).slice(0, 3).map(function (c) {
      return chip(c.label, 'chip-verified');
    }).join('');
    var listChips = (r.h.listed || []).slice(0, 2).map(function (c) {
      return chip(c.label, 'chip-listed');
    }).join('');
    var typeChips = (r.h.caps || []).slice(0, 4).map(function (c) { return chip(c); }).join('');
    var tags = certChips + listChips + typeChips;
    var evidence = '';
    if (r.h.real) {
      if (r.h.certs && r.h.certs.length) {
        evidence = '<div class="nav-evidence">已核对 · ' + esc(r.h.certs[0].source) + '</div>';
      } else if (r.h.listed && r.h.listed.length) {
        evidence = '<div class="nav-evidence">高德检索收录 · ' + esc(r.h.listed[0].source) + '</div>';
      } else {
        evidence = '<div class="nav-evidence">医院类型依据高德地图分类字段</div>';
      }
    }
    var m = measure(r.h);
    var meta = r.h.real
      ? (r.h.address ? '<div class="nav-hosp-addr">地址：' + esc(r.h.address) + '</div>' : '') +
        (r.h.tel ? '<div class="nav-hosp-addr">电话：<a href="tel:' + esc(r.h.tel.replace(/[^0-9-]/g, '')) + '">' + esc(r.h.tel) + '</a></div>' : '')
      : '';
    return '<div class="' + cls + '">' +
      '<div class="nav-hosp-top"><div class="nav-hosp-name">' + esc(r.h.name) + '</div>' +
      '<div class="nav-hosp-dist">' + (hasPrecise()
        ? m.km.toFixed(1) + ' km · 约 ' + m.min + ' 分钟'
        : '距离未知 · 先定位') + '</div></div>' +
      (r.h.real ? '<div class="nav-hosp-addr">类型：' + esc(r.h.typeShort || '医疗机构') + '</div>' : '') + meta +
      '<div class="nav-tags">' + tags + '</div>' + evidence +
      '<div class="nav-why">' + (sit ? whyText(r, sit, key) : esc(r.reason || '附近医疗机构')) + '</div>' +
      '<div class="nav-hosp-act"><button type="button" class="btn ' +
        (picked ? 'btn-primary' : 'btn-soft') + ' btn-sm" data-pick="' + esc(r.h.id) + '">' +
        (picked ? '正在看这一家' : '看到院指引') + '</button></div></div>';
  }
  /* 未定位时先让用户选区：城市中心不能代表任何人，列一堆市中心医院等于误导 */
  function districtPickerHtml() {
    var cur = (state.locInfo && state.locInfo.district) || '';
    var btns = (state.districts || []).map(function (d) {
      var on = d.name === cur;
      return '<button type="button" class="chip' + (on ? ' is-on' : '') +
             '" data-district="' + esc(d.adcode) + '"' + (on ? ' aria-pressed="true"' : '') +
             '>' + esc(d.name) + '</button>';
    }).join('');
    return '<div class="nav-rank"><i class="nav-rank-bar"></i>你在哪个区？' +
      '<span class="nav-rank-n">选一个，立刻显示这个区的真实医院</span></div>' +
      '<div class="alert alert-warn mb-4">现在只知道你在' + esc(state.cityName || '这个城市') +
      '。网络位置只到城市一级，城市范围的中心点不代表你的位置，所以先不排医院、不算距离。</div>' +
      '<div class="nav-dist-pick">' + btns + '</div>' +
      '<p class="nav-note">点上面的区，或用「获取我的精确位置」、下面输入小区 / 路口名。' +
      '选过一次会记住，下次打开直接是这个区。</p>';
  }

  function renderHosp() {
    var sit = byId(NAV_SITUATIONS, state.situation);
    var real = state.dataSource === 'real';
    if (!hasPrecise() && state.districts && state.districts.length) {
      $('resSub').textContent = '还没有你的精确位置。先选你在哪个区，再按「' +
        (sit ? sit.label : '情况') + '」帮你排医院。';
      $('dataNote').textContent = '医院名称、地址、电话、距离与类型来自高德地图；急症请以 120 调度与医院急诊公告为准。';
      $('hospList').innerHTML = districtPickerHtml();
      return;
    }
    if (!hasPrecise()) {
      $('resSub').textContent = '还没有你的精确位置。下面是' + (state.cityName || '这个城市') +
        '的医院，不是按你的位置排的；距离、路程时间都先不算。';
    } else {
      $('resSub').textContent = sit
        ? (real ? '按「' + sit.label + '」的认证信息与医院类型匹配 ' : '按「' + sit.need.join(' + ') + '」匹配 ') +
          state.hospitals.length + ' 家' + (real ? '高德真实医院' : '演示医院') + '；' + travel().name + '时间为' +
          (state.routeInfo ? '高德路径规划' : '估算') + '。'
        : '先看看附近的医院；选好情况后，会按「能不能接得住」重排。';
    }
    $('dataNote').textContent = real
      ? '医院名称、地址、电话、距离与医院类型来自高德地图；胸痛 / 卒中 / 急救中心等认证信息来自高德认证中心 POI 与公开公布名单，每家医院卡片下标有来源。急症请以 120 调度与医院急诊公告为准。' +
        (state.realError ? '（部分接口未连通：' + state.realError + '）' : '')
      : '医院与能力标签为课程演示数据，请以当地卫健委公布名单和医院实际公告为准。不提供诊断建议，不掌握实时床位与排队情况。';
    if (!sit) {
      var byDist = state.hospitals.map(function (h) {
        var km = hospitalKm(h);
        return { h: h, hits: [], miss: [], km: km, full: false, boost: 0, score: -km,
                 reason: hasPrecise()
                   ? (real ? '附近的' + (h.typeShort || '医疗机构') : '演示医院，选好情况后重排')
                   : '还没定位，暂不按距离排' };
      });
      if (hasPrecise()) byDist.sort(function (a, b) { return a.km - b.km; });
      byDist = byDist.slice(0, 6);
      $('hospList').innerHTML =
        (hasPrecise() ? '' : '<div class="alert alert-warn mb-4">还没拿到你的精确位置，下面这些不是「附近的医院」。先点「获取我的精确位置」，或选所在区 / 输入地址。</div>') +
        '<div class="nav-rank"><i class="nav-rank-bar"></i>' + (hasPrecise() ? '附近的医院' : '这个城市的医院') +
        '<span class="nav-rank-n">' + (hasPrecise()
          ? '共 ' + state.hospitals.length + ' 家，先列最近的 6 家'
          : '共 ' + state.hospitals.length + ' 家，未定位，不按距离排') + '</span></div>' +
        byDist.map(function (r) { return hospCard(r, null, 'first'); }).join('');
      return;
    }
    $('hospList').innerHTML = rankGroups(evaluate(sit)).map(function (g) {
      var head = '<div class="nav-rank"><i class="nav-rank-bar"></i>' + g.title +
                 '<span class="nav-rank-n">' + g.sub + '</span></div>';
      return head + g.rows.slice(0, 8).map(function (r) { return hospCard(r, sit, g.key); }).join('');
    }).join('');
  }
  function renderRoute() {
    var h = byId(state.hospitals, state.hospital);
    if (!h) {
      $('routeSub').textContent = '在上面点一家医院，这里会出现到这一家的地图与具体动线。';
      $('routeList').innerHTML = '<div class="nav-empty">还没选医院。点一下上面任意一家的「看到院指引」就好。</div>';
      $('guideSteps').innerHTML = '';
      return;
    }
    $('routeSub').textContent = h.name + '　·　' +
      (h.real ? '以下为高德真实信息与通用到院提醒。' : '以下为演示信息，到院请以现场指引为准。');
    var items;
    if (h.real) {
      items = [
        { k: '址', t: '医院地址', d: h.address || '高德未收录详细地址，到院前可电话确认。' },
        { k: '话', t: '联系电话', d: h.tel || '高德未收录电话，建议提前在地图 App 查询。' },
        { k: '型', t: '医院类型', d: h.typeShort || '医疗机构' },
        { k: '门', t: '走哪个门 / 车停哪儿', d: '这类现场信息高德不提供。到院前可电话询问「急诊走哪个门、夜间入口在哪、停车场怎么走」，比到了再找省时间。' }
      ];
    } else {
      items = [
        { k: '门', t: '走哪个门', d: h.gate }, { k: '车', t: '车停哪儿', d: h.park },
        { k: '夜', t: '夜间怎么进', d: h.night }, { k: '楼', t: '急诊在哪栋', d: h.where }
      ];
    }
    $('routeList').innerHTML = items.map(function (it) {
      return '<div class="nav-route-item"><span class="nav-route-ic">' + it.k + '</span>' +
             '<div class="nav-flow-body"><b>' + esc(it.t) + '</b><p>' + esc(it.d) + '</p></div></div>';
    }).join('');
    if (state.travel === 'ambulance') {
      $('routeList').insertAdjacentHTML('beforeend',
        '<div class="alert alert-warn mt-3"><span><strong>坐救护车时：</strong>把医院全名和' +
        (h.real ? '详细地址' : '「' + esc(h.gate) + '」') + '直接告诉接线员和随车人员，比只说医院名字更省时间。</span></div>');
    }
    var steps = state.routeInfo && state.routeInfo.instructions.length
      ? state.routeInfo.instructions
      : ['从当前位置出发，按导航前往 ' + h.name,
         '快到时留意急诊入口标识，别绕去门诊楼'];
    $('guideSteps').innerHTML = '<div class="nav-guide-h">路上大致这么走</div>' +
      steps.map(function (s, i) {
        return '<div class="nav-guide-step"><span class="nav-guide-n">' + (i + 1) + '</span><span>' + esc(s) + '</span></div>';
      }).join('') +
      '<p class="nav-note mt-3">' + (state.routeInfo ? '路线文字来自高德路径规划，实际以导航与现场标志为准。' : '未配置 Key 时为大致方向提示，配置后显示高德逐步路线。') + '</p>';
  }

  function buildFlow() {
    var sit = byId(NAV_SITUATIONS, state.situation);
    var base = NAV_FLOWS[state.flow] || NAV_FLOWS.emergency;
    var extra = sit ? (SITUATION_EXTRA[sit.id] || []) : [];
    return { name: base.name, label: (sit ? sit.label + ' · ' : '') + base.name,
             desc: base.desc, steps: extra.concat(base.steps), custom: extra.length };
  }
  function renderFlow() {
    var flow = buildFlow();
    var sit = byId(NAV_SITUATIONS, state.situation);
    $('flowSub').textContent = flow.label + '　·　' + flow.custom + ' 步是照你选的「' +
      (sit ? sit.label : '情况') + '」加进来的，换情况会跟着变。';
    ['emergency', 'outpatient', 'inpatient'].forEach(function (k) {
      var btn = $('btnFlow' + k.charAt(0).toUpperCase() + k.slice(1));
      if (btn) btn.className = 'btn btn-sm ' + (state.flow === k ? 'btn-soft is-on' : 'btn-ghost');
    });
    var key = state.flow + ':' + (sit ? sit.id : 'none');
    $('flowList').innerHTML = flow.steps.map(function (s, i) {
      var done = !!state.checked[key + ':' + i];
      return '<button type="button" class="nav-flow-item' + (done ? ' is-done' : '') +
             (i < flow.custom ? ' is-custom' : '') + '" data-step="' + i + '" aria-pressed="' + done + '">' +
             '<span class="nav-flow-check"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6"/></svg></span><span class="nav-flow-body">' +
             '<span class="nav-flow-t">' + (i + 1) + '. ' + esc(s.t) + (i < flow.custom ? '<em>按情况</em>' : '') + '</span>' +
             '<span class="nav-flow-d">' + esc(s.d) + '</span>' +
             '<span class="nav-flow-bring">要带：' + esc(s.bring) + '</span>' +
             '<span class="nav-flow-pit">别踩的坑：' + esc(s.pit) + '</span>' +
             '</span></button>';
    }).join('');
    var total = flow.steps.length, done = 0;
    for (var i = 0; i < total; i++) if (state.checked[key + ':' + i]) done++;
    var pct = Math.round(done / total * 100);
    $('flowPct').textContent = done + ' / ' + total + '　·　' + pct + '%';
    $('flowBar').style.width = pct + '%';
  }
  function flowKey() {
    var sit = byId(NAV_SITUATIONS, state.situation);
    return state.flow + ':' + (sit ? sit.id : 'none');
  }
  function renderTabs() {
    ['guide', 'flow'].forEach(function (k) {
      var btn = $('tabBtn-' + k), panel = $('tab-' + k), on = state.tab === k;
      if (btn) { btn.className = 'nav-tab' + (on ? ' is-on' : ''); btn.setAttribute('aria-selected', on ? 'true' : 'false'); }
      if (panel) panel.hidden = !on;
    });
  }
  function shareText() {
    var sit = byId(NAV_SITUATIONS, state.situation);
    var h = byId(state.hospitals, state.hospital);
    var flow = buildFlow();
    var lines = ['【去哪就医 · 给家人的一段话】', ''];
    lines.push('情况：' + (sit ? sit.label : '还没选'));
    lines.push('出发点：' + state.originLabel + '（' + travel().name + '）');
    if (state.locInfo && state.locInfo.address) lines.push('详细地址：' + state.locInfo.address);
    lines.push(accuracyText(state.locInfo));
    if (state.farNote) lines.push('说明：' + state.farNote);
    if (h) {
      var m = measure(h);
      lines.push('建议医院：' + h.name);
      lines.push(hasPrecise()
        ? '大概多远：' + m.km.toFixed(1) + ' km，' + travel().name + '约 ' + m.min + ' 分钟' +
          (state.routeInfo ? '（高德路径规划）' : '（估算）')
        : '距离：还没拿到我的精确位置，这段先不算路程');
      if (state.dataSource === 'real') {
        lines.push('医院地址：' + (h.address || '高德未收录'));
        if (h.tel) lines.push('医院电话：' + h.tel);
        if (h.certs && h.certs.length) {
          lines.push('认证信息：' + h.certs.map(function (c) { return c.label; }).join('、') +
                     '（来源：' + h.certs[0].source + '）');
        } else {
          lines.push('医院类型：' + (h.caps || []).join('、') + '（依据高德地图分类字段）');
        }
        if (state.routeInfo && state.routeInfo.instructions.length) lines.push('路线：' + state.routeInfo.instructions[0]);
      } else {
        lines.push('能力标签：' + h.caps.join('、'));
        if (state.routeInfo && state.routeInfo.instructions.length) lines.push('路线：' + state.routeInfo.instructions[0]);
        lines.push('');
        lines.push('到院先找：');
        lines.push('· 门：' + h.gate);
        lines.push('· 停车：' + h.park);
        lines.push('· 夜间：' + h.night);
        lines.push('· 位置：' + h.where);
      }
    } else lines.push('建议医院：还没选，点一下医院卡的「看到院指引」就有了');
    lines.push('');
    lines.push('接下来（' + flow.label + '）：');
    flow.steps.forEach(function (s, i) {
      lines.push((i + 1) + '. ' + s.t + ' — ' + s.d);
      lines.push('   记得带：' + s.bring + '｜注意：' + s.pit);
    });
    lines.push('');
    lines.push('紧急情况请立即拨打 120 求助。这是流程指引，不是诊断建议。');
    lines.push(state.dataSource === 'real'
      ? '医院信息来自高德地图，能力与急诊开设情况请以医院公告为准。'
      : '医院名单与到院动线为课程演示数据，实际以当地公告为准。');
    return lines.join('\n');
  }
  function renderShare() { $('shareText').value = shareText(); }
  /* ==========================================================
     手机端：分步导航（缩短下拉） + 已有详细地址时收起定位工具
     桌面端完全不启用；只切 class，不改 DOM，既有接口与断言都保持不变
     ========================================================== */
  var MOBILE_STEPS = [
    { n: 1, t: '位置', full: '现在在哪' },
    { n: 2, t: '情况', full: '现在什么情况' },
    { n: 3, t: '医院', full: '该去哪一家' },
    { n: 4, t: '到院', full: '到院与流程' },
    { n: 5, t: '家人', full: '发给家人' }
  ];
  var currentStep = 1, stepsBound = false;
  function refreshMobileLayout() {
    document.body.classList.toggle('nav-m-precise', isMobileView() && hasPrecise());
  }
  function setStep(n, noScroll) {
    currentStep = clampNum(n, 1, MOBILE_STEPS.length);
    var nodes = document.querySelectorAll('[data-nav-step]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('is-current', +nodes[i].getAttribute('data-nav-step') === currentStep);
    }
    var bar = $('navStepBar');
    if (bar) {
      var btns = bar.querySelectorAll('button');
      for (var j = 0; j < btns.length; j++) {
        var on = +btns[j].getAttribute('data-step') === currentStep;
        btns[j].classList.toggle('is-on', on);
        btns[j].setAttribute('aria-current', on ? 'step' : 'false');
      }
    }
    $('stepNavText').textContent = '第 ' + currentStep + ' / ' + MOBILE_STEPS.length + ' 步 · ' + MOBILE_STEPS[currentStep - 1].full;
    $('btnStepPrev').disabled = currentStep === 1;
    $('btnStepNext').textContent = currentStep === MOBILE_STEPS.length ? '回到第 1 步' : '下一步';
    if (!noScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
    refreshMobileLayout();
  }
  function initMobileSteps() {
    if (!isMobileView()) return;
    document.body.classList.add('nav-steps-on');
    var bar = $('navStepBar'), nav = $('navStepNav');
    bar.hidden = false; nav.hidden = false;
    bar.innerHTML = MOBILE_STEPS.map(function (s) {
      return '<button type="button" data-step="' + s.n + '">' + s.n + ' ' + esc(s.t) + '</button>';
    }).join('');
    if (!stepsBound) {
      stepsBound = true;
      bar.addEventListener('click', function (e) {
        var b = e.target.closest ? e.target.closest('[data-step]') : null;
        if (b) setStep(+b.getAttribute('data-step'));
      });
      $('btnStepPrev').addEventListener('click', function () { setStep(currentStep - 1); });
      $('btnStepNext').addEventListener('click', function () {
        setStep(currentStep === MOBILE_STEPS.length ? 1 : currentStep + 1);
      });
      $('btnLocTools').addEventListener('click', function () {
        var open = document.body.classList.toggle('nav-m-tools');
        this.textContent = open ? '收起改位置工具' : '位置不对？手动改位置';
        if (open && $('districtField').scrollIntoView) {
          $('districtField').scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      });
    }
    setStep(1, true);
  }
  function bindResize() {
    window.addEventListener('resize', function () {
      if (!isMobileView()) {
        document.body.classList.remove('nav-steps-on', 'nav-m-precise', 'nav-m-tools');
        $('navStepBar').hidden = true; $('navStepNav').hidden = true;
        $('btnLocTools').textContent = '位置不对？手动改位置';
      } else if (!document.body.classList.contains('nav-steps-on')) {
        initMobileSteps();
      }
      refreshMobileLayout();
    });
  }

  function renderAll() {
    renderLoc(); renderChoices(); renderHosp(); renderRouteOverview();
    renderMap(); renderGuidePhotos(); renderGuideMap(); renderRoute(); renderFlow(); renderTabs(); renderShare();
    refreshMobileLayout();
  }

  /* ==========================================================
     真实医院加载
     ========================================================== */
  function loadRealHospitals() {
    if (!window.NavMap || !window.NavMap.webKey()) return;
    var token = ++hospSeq;
    var adcode = state.cityAdcode || (state.locInfo && state.locInfo.adcode) || '';
    window.NavMap.hospitals({ lat: state.origin.lat, lng: state.origin.lng, adcode: adcode,
                              cityOnly: !hasPrecise() })
      .then(function (list) {
        if (token !== hospSeq || !list || !list.length) return;
        state.hospitals = list;
        if (window.NavModule) window.NavModule.hospitals = list;  // 兼容旧约定：仍是数组
        state.dataSource = 'real';
        state.realError = '';
        state.hospital = null;
        var sit = byId(NAV_SITUATIONS, state.situation);
        var sorted = sit ? evaluate(sit) : list.map(function (h) { return { h: h }; });
        state.hospital = sorted.length ? sorted[0].h.id : list[0].id;
        renderAll();
        updateRoute();
      })
      .catch(function (e) {
        if (token !== hospSeq) return;
        state.realError = e.message;
        renderAll();
      });
  }

  /* ==========================================================
     交互
     ========================================================== */
  function setOrigin(o, mode, label, info) {
    state.origin = { lat: o.lat, lng: o.lng };
    state.originLabel = label || o.name;
    state.locMode = mode;
    if (info) state.locInfo = info;
    renderAll();
    updateRoute();
  }
  function setSituation(id) {
    if (!byId(NAV_SITUATIONS, id)) return;
    state.situation = id;
    var sit = byId(NAV_SITUATIONS, id);
    state.flow = sit.flow;
    var list = evaluate(sit);
    var first = state.dataSource === 'real' ? list.slice(0, 2) : list.filter(function (r) { return r.full; }).slice(0, 2);
    if (state.hospital && !first.some(function (r) { return r.h.id === state.hospital; })) state.hospital = null;
    if (!state.hospital && list.length) state.hospital = list[0].h.id;
    state.tab = 'guide';
    renderAll();
    updateRoute();
  }
  function setHospital(id) {
    state.hospital = id;
    state.tab = 'guide';
    renderAll();
    updateRoute();
  }
  function setTravel(v) {
    if (!byId(TRAVELS, v)) return;
    state.travel = v;
    $('travelSel').value = v;
    renderAll();
    updateRoute();
  }
  function setTab(k) { state.tab = k; renderTabs(); }

  /* 地址输入：精确到街道 / 小区 / 路口 */
  function searchAddress() {
    var q = $('addrInput').value.trim();
    var tips = $('addrTips');
    if (!q) { toast('先写个地址、小区或路口名'); return; }
    if (!window.NavLocation || !window.NavLocation.suggest || !window.NavMap.webKey()) {
      tips.hidden = false;
      tips.innerHTML = '<div class="nav-addr-tip is-msg">离线模式下不能检索地址；配置高德 Key 后可用。</div>';
      return;
    }
    tips.hidden = false;
    tips.innerHTML = '<div class="nav-addr-tip is-msg">正在查找…</div>';
    window.NavLocation.suggest(q, state.locInfo && state.locInfo.adcode || state.cityName)
      .then(function (list) {
        if (!list.length) {
          tips.innerHTML = '<div class="nav-addr-tip is-msg">没找到这个地点，换个说法试试，例如「市民中心」「XX 小区」。</div>';
          return;
        }
        tips.innerHTML = list.map(function (t, i) {
          return '<button type="button" class="nav-addr-tip" data-addr="' + i + '">' +
                 '<b>' + esc(t.name) + '</b><span>' + esc(t.district) + '</span></button>';
        }).join('');
        tips._list = list;
      }).catch(function (e) {
        tips.innerHTML = '<div class="nav-addr-tip is-msg">地址检索没连上（' + esc(e.message) + '），可以直接选上面的所在区。</div>';
      });
  }

  $('originSel').innerHTML = '<option value="">正在获取所在区…</option>';
  var districtSeq = 0;
  function loadDistricts(adcode, city) {
    if (!window.NavMap || !window.NavMap.districts || !adcode) return;
    var token = ++districtSeq;
    window.NavMap.districts(adcode).then(function (list) {
      if (token !== districtSeq || !list.length) return;
      state.districts = list;
      state.cityAdcode = adcode;
      var cur = state.locInfo && state.locInfo.district || '';
      $('originSel').innerHTML = '<option value="">选择所在区…</option>' + list.map(function (d) {
        return '<option value="' + esc(d.adcode) + '"' + (d.name === cur ? ' selected' : '') + '>' + esc(d.name) + '</option>';
      }).join('');
    }).catch(function () {
      $('originSel').innerHTML = '<option value="">区列表暂不可用，请用下方地址输入</option>';
    });
  }
  $('originSel').addEventListener('change', function () {
    var code = this.value;
    var d = state.districts.filter(function (x) { return x.adcode === code; })[0];
    if (d) window.NavLocation.setByDistrict(d, state.locInfo && state.locInfo.city || state.cityName);
  });
  $('travelSel').addEventListener('change', function () { setTravel(this.value); });
  $('choiceGrid').addEventListener('click', function (e) {
    var b = e.target.closest('[data-sit]'); if (b) setSituation(b.getAttribute('data-sit'));
  });
  $('hospList').addEventListener('click', function (e) {
    var d = e.target.closest ? e.target.closest('[data-district]') : null;
    if (d) {
      var code = d.getAttribute('data-district');
      var pick = (state.districts || []).filter(function (x) { return x.adcode === code; })[0];
      if (pick && window.NavLocation) {
        window.NavLocation.setByDistrict(pick, (state.locInfo && state.locInfo.city) || state.cityName);
        toast('已按「' + pick.name + '」显示附近医院');
      }
      return;
    }
    var b = e.target.closest('[data-pick]'); if (b) setHospital(b.getAttribute('data-pick'));
  });
  $('routeOverview').addEventListener('click', function (e) {
    var b = e.target.closest('[data-travel]'); if (b) setTravel(b.getAttribute('data-travel'));
  });
  $('flowList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-step]'); if (!b) return;
    var k = flowKey() + ':' + b.getAttribute('data-step');
    state.checked[k] = !state.checked[k];
    renderFlow(); renderShare();
  });
  ['emergency', 'outpatient', 'inpatient'].forEach(function (k) {
    var btn = $('btnFlow' + k.charAt(0).toUpperCase() + k.slice(1));
    if (btn) btn.addEventListener('click', function () { state.flow = k; renderFlow(); renderShare(); });
  });
  $('navTabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (b) setTab(b.getAttribute('data-tab'));
  });
  $('btnFlowJump').addEventListener('click', function () {
    setTab('flow');
    if (document.body.classList.contains('nav-steps-on')) setStep(4);
  });
  $('btnGuideExpand').addEventListener('click', openBigMap);
  $('guidePhotos').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.nav-photo-item') : null;
    if (!btn) return;
    var h = byId(state.hospitals, state.hospital);
    if (!h) return;
    var list = state.photos[h.id] || [];
    var u = list[Number(btn.getAttribute('data-photo'))];
    if (!u) return;
    $('photoBigImg').src = u;
    $('photoCap').textContent = h.name + ' · 照片来自高德地图 POI 收录';
    $('photoBig').hidden = false;
    document.body.style.overflow = 'hidden';
  });
  $('btnPhotoClose').addEventListener('click', closePhoto);
  $('photoBig').addEventListener('click', function (e) { if (e.target === this) closePhoto(); });
  $('btnMapExpand').addEventListener('click', openBigMap);
  $('btnMapClose').addEventListener('click', closeBigMap);
  $('mapBig').addEventListener('click', function (e) { if (e.target === this) closeBigMap(); });
  $('btnZoomIn').addEventListener('click', function () { stepZoom(1); });
  $('btnZoomOut').addEventListener('click', function () { stepZoom(-1); });
  $('btnZoomReset').addEventListener('click', resetBigZoom);
  $('btnAddrSearch').addEventListener('click', searchAddress);
  $('addrInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); searchAddress(); } });
  $('addrTips').addEventListener('click', function (e) {
    var b = e.target.closest('[data-addr]'); if (!b) return;
    var tip = this._list && this._list[+b.getAttribute('data-addr')];
    if (!tip) return;
    window.NavLocation.setByTip(tip);
    this.hidden = true;
    toast('已按这个地址重新计算，附近医院也更新了');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('photoBig').hidden) closePhoto();
    else if (!$('mapBig').hidden) closeBigMap();
  });
  $('btnLocate').addEventListener('click', function () {
    var btn = this, html = btn.innerHTML, settled = false;
    btn.disabled = true; btn.textContent = '定位中…';
    state.locating = true; renderLoc();

    // IP 结果一到（约 300ms）就恢复状态；600ms 兜底。不再让用户盯着等 6 秒
    function finishPrompt() {
      if (settled) return;
      settled = true;
      btn.disabled = false; btn.innerHTML = html;
      state.locating = false; renderLoc();
    }
    setTimeout(finishPrompt, 600);

    var cur = window.NavLocation.current();
    var hasPrecise = cur && cur.mode !== 'fail' && cur.locationLevel !== 'city';

    // ① 立即给可见结果：IP 城市级 <300ms；已有精确位置时不覆盖它
    if (!hasPrecise) {
      window.NavLocation.ipLocate().catch(function () {}).then(function () {
        renderLoc(); finishPrompt();
      });
    }

    // ② 后台尝试浏览器精确定位，成功自动升级到街道级；失败不再重复等一次 IP
    window.NavLocation.locate({ skipIpFallback: true }).then(function (loc) {
      if (loc && loc.locationLevel === 'address' && !loc.degraded) {
        toast('已定位到街道，附近医院与路线都更新好了');
      }
      renderLoc();
    }).catch(function () { renderLoc(); });

    // ③ 后台持续监听（用户手势下可触发授权；真机 WiFi 定位可能要几十秒）
    window.NavLocation.permissionState().then(function (perm) {
      if (perm !== 'denied') return window.NavLocation.watchPrecise();
    }).catch(function () {});
  });
  $('btnForget').addEventListener('click', function () {
    window.NavLocation.forget();
    this.hidden = true;
    toast('已清除本机记住的位置，下次打开会重新定位');
  });
  $('btnLocWrong').addEventListener('click', function () {
    // 设备给的 WiFi/IP 混合定位可能偏几公里，用户可以一键推翻
    window.NavLocation.forget();
    state.locInfo = null;
    window.NavLocation.ipLocate({ force: true }).catch(function () {});
    toast('已清除这个偏差位置。请选所在区、输入地址，或用手机定位');
    var a = $('addrInput'); if (a) a.focus();
  });
  $('btnCopyPhone').addEventListener('click', function () {
    var b = phoneBase();
    if (!b) { toast('先运行「启动手机访问.bat」再刷新本页'); return; }
    copyText(b, '已复制手机访问网址，发到手机打开即可');
  });
  $('btnCopyMyLoc').addEventListener('click', function () {
    // 用页面实际采用的位置（state.locInfo），而不是可能被迟到的 IP 结果覆盖的 current
    var c = state.locInfo && state.locInfo.lat != null
      ? state.locInfo : window.NavLocation.current();
    if (!c || !hasPrecise()) { toast('先拿到精确位置，再复制带坐标的链接'); return; }
    var base = phoneBase() || onlineUrl();
    var u;
    try { u = new URL(base); } catch (e) { u = new URL(location.href); u.search = ''; }
    u.searchParams.set('lat', c.lat.toFixed(6));
    u.searchParams.set('lng', c.lng.toFixed(6));
    u.searchParams.set('label', c.shortLabel || c.address || '我的位置');
    copyText(u.toString(), '已复制带位置的链接，在另一台设备打开即可');
  });
  $('btnCopy').addEventListener('click', function () {
    var text = shareText(), ta = $('shareText');
    function fallback() {
      ta.focus(); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      toast(ok ? '已复制，发给家人就行' : '已经选中文字，长按或按 Ctrl+C 就能复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，发给家人就行'); }).catch(fallback);
    } else fallback();
  });

  /* ---------- URL 参数 ---------- */
  function readParams() {
    var raw = location.search.replace(/^\?/, '') || '';
    var out = {};
    raw.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0]) out[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
    return out;
  }
  var params = readParams();
  if (params.offline === '1') {
    if (window.NavMap) window.NavMap.configure({ provider: 'offline' });
    if (window.NavLocation) window.NavLocation.configure({ provider: 'offline' });
  }
  if (window.NavMap && window.NavMap.webKey() && window.NavLocation) {
    window.NavLocation.configure({ amapKey: window.NavMap.webKey() });
  }

  setOrigin(NAV_CITY.origins[0], 'demo');

  /* 医院名单现在按「当前真实坐标」从高德 place/around 实时拉取，全国通用。
     早期「演示数据只在杭州」的远距离回落会把用户的真实坐标偷偷换成杭州假起点，
     再算出看似合理的假距离 —— 必须去掉，否则就是在骗用户。 */
  /* 粗略定位吸附：设备给的是 WiFi/IP 混合定位（误差几公里）时，落到最近的行政区中心。
     这样「获取我的精确位置」在笔记本上也有可用结果，而不是把某栋楼当用户家。 */
  function nearestDistrict(lat, lng) {
    var best = null, bestKm = Infinity;
    (state.districts || []).forEach(function (d) {
      var ll = String(d.center || '').split(',');
      var dlng = parseFloat(ll[0]), dlat = parseFloat(ll[1]);
      if (!isFinite(dlat) || !isFinite(dlng)) return;
      var km = haversineKm(lat, lng, dlat, dlng);
      if (km < bestKm) { bestKm = km; best = d; }
    });
    return best;
  }
  function haversineKm(a1, o1, a2, o2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (a2 - a1) * rad, dLng = (o2 - o1) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a1 * rad) * Math.cos(a2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function applyLocation(loc) {
    // 已有精确位置时，不被随后返回的城市级 IP 结果覆盖
    if (state.locInfo && (state.locInfo.locationLevel === 'address' ||
        state.locInfo.locationLevel === 'district') && loc.locationLevel === 'city') return;
    var mode = loc.mode === 'fail' ? 'fail' : loc.mode;
    state.farNote = '';
    // 粗略 GPS（>2km）先吸附到最近的区，再算医院与距离
    if (loc.mode === 'gps' && loc.accuracy != null && loc.accuracy > GPS_MAX_ACCURACY_M &&
        state.districts && state.districts.length) {
      var near = nearestDistrict(loc.lat, loc.lng);
      if (near) {
        window.NavLocation.setByDistrict(near, loc.city || state.cityName,
          '设备只给到约 ±' + (Math.round(loc.accuracy / 100) / 10) + ' 公里的粗略位置，已按最近的「' +
          near.name + '」匹配医院。不对的话，直接在上面换一个区或输入小区名。');
        return;
      }
    }
    var compute = { lat: loc.lat, lng: loc.lng };
    var label = loc.shortLabel;
    if (loc.city) state.cityName = [loc.province, loc.city].filter(Boolean).join(' · ') || state.cityName;
    setOrigin(compute, mode, label, loc);
    if (loc.adcode && (loc.locationLevel === 'city' || loc.source === 'amap-ip') &&
        loc.adcode !== state.cityAdcode) {
      state.cityAdcode = loc.adcode;
      loadDistricts(loc.adcode, loc.city);
    }
    loadRealHospitals();
  }
  window.NavLocation.onChange(applyLocation);

  if (params.lat && params.lng && !isNaN(+params.lat) && !isNaN(+params.lng)) {
    window.NavLocation.setManual(+params.lat, +params.lng, params.label || '组员模块传来的位置');
  }
  if (params.situation) setSituation(params.situation);
  if (params.hospital) { state.hospital = params.hospital; }
  if (params.tab) setTab(params.tab);
  renderAll();

  /* 手机端：手势、分步导航、尺寸变化监听（桌面端不启用分步） */
  bindMiniGestures();
  initMobileSteps();
  bindResize();
  if (isMobileView() && params.tab === 'flow') setStep(4, true);

  // 打开页面就自动做 IP 定位（不弹权限框、国内可靠），拿到真实城市后拉真实医院。
  // GPS 只在用户点「重新定位」时才请求。
  if (window.NavMap && window.NavMap.webKey() && window.NavLocation && params.offline !== '1') {
    var saved = window.NavLocation.recall();
    if (saved) {
      // 第二次打开：0 秒恢复到上次选的区 / 街道，不再等任何定位
      window.NavLocation.restoreSaved();
      if (saved.adcode && saved.adcode !== state.cityAdcode) {
        state.cityAdcode = saved.adcode;
        loadDistricts(saved.adcode, saved.city);
      }
    } else {
      // 第一次打开：不到 1 秒给出真实城市，不弹权限框、不等待 GPS
      window.NavLocation.ipLocate().catch(function () { /* 断网时保持演示数据 */ });
    }
    // 后台静默持续监听精确坐标，拿到就自动升级到街道级；失败完全不打扰
    window.NavLocation.permissionState().then(function (perm) {
      if (perm === 'granted') return window.NavLocation.watchPrecise();
    }).catch(function () {});
  }

  /* ---------- 对外接口 ---------- */
  window.NavModule = {
    location: window.NavLocation,
    map: window.NavMap,
    locate: function () { return window.NavLocation.locate(); },
    hospitals: state.hospitals,
    getHospitals: function () { return state.hospitals; },
    getDataSource: function () { return state.dataSource; },
    loadHospitals: loadRealHospitals,
    situations: NAV_SITUATIONS,
    flows: NAV_FLOWS,
    setLocation: function (lat, lng, label) { return window.NavLocation.setManual(lat, lng, label); },
    setSituation: setSituation,
    setHospital: setHospital,
    setTravel: setTravel,
    setTab: setTab,
    openMap: openBigMap,
    setStep: setStep,
    getStep: function () { return currentStep; },
    isMobileView: isMobileView,
    receive: function (o) {
      o = o || {};
      if (o.lat != null && o.lng != null) window.NavLocation.setManual(o.lat, o.lng, o.label || '当前位置');
      if (o.originId) { var orig = byId(NAV_CITY.origins, o.originId); if (orig) setOrigin(orig, 'manual'); }
      if (o.travel) { state.travel = o.travel; $('travelSel').value = o.travel; }
      if (o.situation) setSituation(o.situation);
      if (o.hospital) state.hospital = o.hospital;
      if (o.tab) state.tab = o.tab;
      renderAll(); updateRoute();
    },
    getShareText: shareText,
    refresh: renderAll,
    getFarNote: function () { return state.farNote; },
    hasPrecise: hasPrecise,
    accuracyUsable: accuracyUsable,
    capabilities: window.NavCapability,
    refreshCaps: function () { renderHosp(); },
    forgetLocation: function () { return window.NavLocation.forget(); },
    getDistricts: function () { return state.districts; },
    setDistrict: function (adcode) {
      var d = state.districts.filter(function (x) { return x.adcode === adcode; })[0];
      if (d) return window.NavLocation.setByDistrict(d, state.cityName);
      return Promise.resolve(null);
    }
  };
})();
