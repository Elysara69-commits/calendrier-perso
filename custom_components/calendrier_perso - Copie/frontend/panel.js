/* Calendrier Perso – panneau latéral Home Assistant (v2.0.0) */
const WS = "calendrier_perso/";
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ymdhm = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const pd = s => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const t = s.length > 10 ? s.slice(11, 16).split(":").map(Number) : [0, 0];
  return new Date(y, m - 1, d, t[0], t[1]);
};
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fr = (d, o) => d.toLocaleDateString("fr-FR", o);
const isoWeek = d => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const n = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - n);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y) / 864e5 + 1) / 7);
};

const NAMES = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];          // index = getDay()
const LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LETTER = ["D", "L", "M", "M", "J", "V", "S"];
const IMP = ["Faible", "Normal", "Important", "Urgent"];
const IMPC = ["#34d399", "#38bdf8", "#fb923c", "#f43f5e"];
const CHN = { ha: ["🏠", "Home Assistant"], alexa: ["🔊", "Alexa"], discord: ["💬", "Discord"], telegram: ["✈️", "Telegram"] };
const VIEWS = [["day", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"], ["agenda", "Agenda"]];
const UNITS = [[1, "minutes"], [60, "heures"], [1440, "jours"], [10080, "semaines"]];

const UI_DEF = {
  theme: "auto", ha_theme: "", bg: "", tx: "", ac: "", img: "", dim: 82,
  view: "month", first: 1, h24: true, hourPx: 52, work_start: 8, work_end: 19,
  weeks: true, weekend: true, holidays: true, colorBy: "calendar", dur: 60, agendaDays: 60,
};

const CSS = `
:host{display:block;height:100%;min-height:100vh;overflow:hidden}
*{box-sizing:border-box}
[hidden]{display:none!important}
.root{--cp-bg:var(--primary-background-color,#fafafa);--cp-card:var(--card-background-color,#fff);--cp-tx:var(--primary-text-color,#212121);--cp-mut:var(--secondary-text-color,#727272);--cp-bd:var(--divider-color,#e0e0e0);--cp-ac:var(--primary-color,#03a9f4);--cp-ac2:var(--cp-ac);--cp-on:#fff;--cp-font:Roboto,"Segoe UI",system-ui,sans-serif;--cp-today:color-mix(in srgb,var(--cp-ac) 14%,transparent);
 position:relative;height:100%;display:flex;color:var(--cp-tx);background:var(--cp-bg) center/cover fixed;font-family:var(--cp-font);font-size:14px;overflow:hidden}
.t-light{--cp-bg:#f2f4f9;--cp-card:#fff;--cp-tx:#18202f;--cp-mut:#667089;--cp-bd:#e0e4ee;--cp-ac:#3b6cf6;--cp-ac2:#3b6cf6;--cp-on:#fff}
.t-dark{--cp-bg:#0d1016;--cp-card:#161a23;--cp-tx:#e7eaf2;--cp-mut:#8a93a8;--cp-bd:#262c3a;--cp-ac:#7b9bff;--cp-ac2:#7b9bff;--cp-on:#0b0f1a}
.t-neon{--cp-bg:#06040f;--cp-card:#0d0920;--cp-tx:#e8f7ff;--cp-mut:#9a90c9;--cp-bd:#2e2062;--cp-ac:#00f0ff;--cp-ac2:#ff2bd6;--cp-on:#04020c;--cp-font:"Rajdhani","Orbitron","Segoe UI",system-ui,sans-serif;--cp-today:color-mix(in srgb,#ff2bd6 15%,transparent);font-size:15px;
 background-image:linear-gradient(rgba(0,240,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,43,214,.035) 1px,transparent 1px);background-size:38px 38px}
button{font:inherit;color:inherit;cursor:pointer}
input,select,textarea{font:inherit;color:inherit;background:color-mix(in srgb,var(--cp-bg) 55%,var(--cp-card));border:1px solid var(--cp-bd);border-radius:8px;padding:8px 10px;width:100%;min-width:0}
input[type=checkbox],input[type=radio]{width:auto;accent-color:var(--cp-ac)}
input[type=color]{padding:2px;height:34px;width:56px}
input:focus,select:focus,textarea:focus,button:focus-visible{outline:2px solid var(--cp-ac);outline-offset:1px}
textarea{resize:vertical}
.btn{border:1px solid var(--cp-bd);background:var(--cp-card);padding:7px 13px;border-radius:9px;transition:border-color .12s,transform .08s}
.btn:hover{border-color:var(--cp-ac)}.btn:active{transform:translateY(1px)}
.pri{background:var(--cp-ac);color:var(--cp-on);border-color:transparent;font-weight:600}
.danger{color:#f43f5e}.ib{width:34px;height:34px;padding:0;display:inline-grid;place-items:center;border-radius:50%;flex:none}
.mut{color:var(--cp-mut)}.wide{width:100%}
.t-neon .btn{border-color:color-mix(in srgb,var(--cp-ac) 45%,transparent);background:linear-gradient(#18113a,#0d0920);box-shadow:0 2px 0 #02010a,0 0 10px color-mix(in srgb,var(--cp-ac) 16%,transparent)}
.t-neon .btn:hover{box-shadow:0 2px 0 #02010a,0 0 18px color-mix(in srgb,var(--cp-ac) 55%,transparent)}
.t-neon .btn:active{transform:translateY(2px);box-shadow:none}
.t-neon .pri{background:linear-gradient(180deg,#6bf8ff,#00c6d6);color:#04020c;border-color:transparent;box-shadow:0 3px 0 #00727c,0 0 18px #00f0ff77}
.t-neon h2,.t-neon h4,.t-neon h3{text-shadow:0 0 10px color-mix(in srgb,var(--cp-ac) 65%,transparent);letter-spacing:.06em}
/* structure */
.rail{width:272px;flex:none;border-right:1px solid var(--cp-bd);background:color-mix(in srgb,var(--cp-card) 90%,transparent);overflow:auto;padding:14px;display:flex;flex-direction:column;gap:18px}
.rail h4{margin:0 0 6px;font-size:.78rem;color:var(--cp-mut);font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column;position:relative}
.bar{display:flex;align-items:center;gap:8px;padding:12px 16px;flex-wrap:wrap}
.bar h2{flex:1;min-width:150px;margin:0 6px;font-size:1.3rem;font-weight:600;text-transform:capitalize;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.search{width:190px}
.seg{display:flex;border:1px solid var(--cp-bd);border-radius:11px;background:var(--cp-card);padding:3px}
.seg button{border:0;background:none;padding:6px 11px;border-radius:8px}.seg button.on{background:var(--cp-ac);color:var(--cp-on);font-weight:600}
.t-neon .seg button.on{box-shadow:0 0 14px var(--cp-ac)}
.body{flex:1;min-height:0;overflow:auto;padding:0 16px 16px;display:flex;flex-direction:column}
.scrim{display:none}
/* mini mois */
.mini .mh{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}.mini .mh b{text-transform:capitalize;font-size:.9rem}
.mg7{display:grid;gap:2px;text-align:center;font-size:.76rem}
.mg7 span{padding:5px 0;border-radius:50%;cursor:pointer;position:relative;aspect-ratio:1;display:grid;place-items:center}
.mg7 span:hover{background:var(--cp-today)}.mg7 .d{color:var(--cp-mut);cursor:default;font-size:.68rem}.mg7 .d:hover{background:none}
.mg7 .o{color:var(--cp-mut);opacity:.55}.mg7 .t{background:var(--cp-ac);color:var(--cp-on);font-weight:700}.mg7 .s{outline:1px solid var(--cp-ac)}
.mg7 .h{color:#f43f5e}.mg7 i{position:absolute;bottom:2px;width:4px;height:4px;border-radius:50%;background:var(--cp-ac2)}
.mg7 .w{color:var(--cp-mut);font-size:.62rem;cursor:default}.mg7 .w:hover{background:none}
.cl{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer}.cl i{width:11px;height:11px;border-radius:3px;flex:none}
.up{display:flex;gap:9px;padding:6px 4px;border-radius:8px;cursor:pointer;align-items:flex-start}.up:hover{background:var(--cp-today)}
.up i{width:4px;align-self:stretch;border-radius:3px;background:var(--c)}.up b{display:block;font-weight:600;font-size:.86rem}.up span{font-size:.76rem;color:var(--cp-mut)}
/* mois */
.mgrid{display:grid;grid-template-columns:var(--wk,0px) repeat(var(--n),minmax(0,1fr));grid-template-rows:auto repeat(6,minmax(96px,1fr));gap:1px;background:var(--cp-bd);border:1px solid var(--cp-bd);border-radius:12px;overflow:hidden;flex:1}
.mgrid>*{background:var(--cp-card)}.mgrid .dow{padding:7px;text-align:center;font-size:.76rem;color:var(--cp-mut);font-weight:600}
.mgrid .wk{display:grid;place-items:center;color:var(--cp-mut);font-size:.7rem}
.cell{padding:4px 5px;overflow:hidden;cursor:pointer;min-width:0}.cell:hover{background:color-mix(in srgb,var(--cp-card) 90%,var(--cp-ac))}
.cell.o{opacity:.55}.cell.t{background:var(--cp-today);box-shadow:inset 0 0 0 1px var(--cp-ac2)}
.t-neon .cell.t{box-shadow:inset 0 0 0 1px var(--cp-ac2),inset 0 0 22px color-mix(in srgb,var(--cp-ac2) 25%,transparent)}
.dn{display:flex;gap:6px;align-items:baseline;font-size:.82rem;min-width:0}.dn span{font-weight:600;padding:1px 5px;border-radius:6px}.dn span:hover{background:var(--cp-today)}
.cell.t .dn span{background:var(--cp-ac2);color:var(--cp-on)}.dn em{font-style:normal;font-size:.68rem;color:#f43f5e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{display:flex;gap:5px;align-items:center;padding:1px 6px;margin-top:2px;border-radius:6px;font-size:.78rem;line-height:1.55;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:color-mix(in srgb,var(--c) 24%,var(--cp-card));border-left:3px solid var(--c)}
.chip b{font-weight:600;font-size:.72rem;opacity:.85}
.chip.ad{background:var(--c);color:#fff;border-left-color:transparent;text-shadow:0 1px 1px rgba(0,0,0,.35)}
.t-neon .chip{box-shadow:0 0 9px color-mix(in srgb,var(--c) 38%,transparent)}
.x{text-decoration:line-through;opacity:.55}.tent{border-left-style:dashed;background-image:repeating-linear-gradient(135deg,transparent 0 6px,rgba(127,127,127,.16) 6px 12px)}.free{opacity:.82;border-left-style:dotted}
.more{font-size:.7rem;color:var(--cp-mut);margin-top:2px;padding-left:4px}
/* grille horaire */
.tg{flex:1;min-height:0;overflow:auto;border:1px solid var(--cp-bd);border-radius:12px;background:var(--cp-card);position:relative}
.tg-top{position:sticky;top:0;z-index:6;background:var(--cp-card);border-bottom:1px solid var(--cp-bd)}
.row7,.tg-in{display:grid;grid-template-columns:54px repeat(var(--n),minmax(0,1fr))}
.dh{padding:8px 4px;text-align:center;cursor:pointer;border-left:1px solid var(--cp-bd)}.dh span{display:block;font-size:.74rem;color:var(--cp-mut)}.dh b{font-size:1.25rem;font-weight:600;display:inline-block;min-width:36px;line-height:36px;border-radius:18px}
.dh.t b{background:var(--cp-ac2);color:var(--cp-on)}.dh em{display:block;font-style:normal;font-size:.66rem;color:#f43f5e;height:12px;overflow:hidden}
.adr>div{min-height:28px;padding:2px 3px;border-left:1px solid var(--cp-bd);border-top:1px solid var(--cp-bd)}.adr .g{font-size:.66rem;color:var(--cp-mut);padding:6px 4px;text-align:right;border-left:0}
.gut{position:relative}.hl{position:absolute;right:6px;transform:translateY(-50%);font-size:.68rem;color:var(--cp-mut)}
.col{position:relative;border-left:1px solid var(--cp-bd);background-image:linear-gradient(var(--cp-bd) 1px,transparent 1px),linear-gradient(color-mix(in srgb,var(--cp-bd) 45%,transparent) 1px,transparent 1px);background-size:100% var(--hp),100% calc(var(--hp)/2);cursor:cell}
.col.t{background-color:var(--cp-today)}.col .wkh{position:absolute;left:0;right:0;background:color-mix(in srgb,var(--cp-ac) 4%,transparent);pointer-events:none}
.blk{position:absolute;border-radius:7px;padding:3px 6px;font-size:.76rem;overflow:hidden;cursor:pointer;background:color-mix(in srgb,var(--c) 26%,var(--cp-card));border-left:3px solid var(--c);line-height:1.25;z-index:2}
.blk b{display:block;font-weight:600}.blk span{font-size:.7rem;opacity:.8}
.t-neon .blk{box-shadow:0 0 11px color-mix(in srgb,var(--c) 42%,transparent)}
.rs{position:absolute;left:0;right:0;bottom:0;height:7px;cursor:ns-resize}
.now{position:absolute;left:0;right:0;height:2px;background:#f43f5e;z-index:4;pointer-events:none}.now:before{content:"";position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:#f43f5e}
.t-neon .now{background:var(--cp-ac2);box-shadow:0 0 10px var(--cp-ac2)}.t-neon .now:before{background:var(--cp-ac2)}
/* année / agenda / recherche */
.yr{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.ym{background:var(--cp-card);border:1px solid var(--cp-bd);border-radius:12px;padding:10px}.ym h5{margin:0 0 6px;text-transform:capitalize;cursor:pointer;font-size:.9rem}
.ag{max-width:760px;width:100%;margin:0 auto}.ag h4{margin:16px 0 6px;font-size:.9rem;text-transform:capitalize;display:flex;gap:8px;align-items:baseline}.ag h4 em{font-style:normal;color:#f43f5e;font-size:.76rem}
.ar{display:flex;gap:12px;align-items:center;background:var(--cp-card);border:1px solid var(--cp-bd);border-left:4px solid var(--c);border-radius:10px;padding:9px 12px;margin-bottom:6px;cursor:pointer}
.ar:hover{border-color:var(--c)}.ar .tm{width:92px;flex:none;font-size:.8rem;color:var(--cp-mut)}.ar b{font-weight:600}.ar small{display:block;color:var(--cp-mut)}
.empty{text-align:center;color:var(--cp-mut);padding:60px 10px}.empty .btn{margin-top:12px}
/* boîtes de dialogue */
dialog{border:1px solid var(--cp-bd);border-radius:16px;background:var(--cp-card);color:var(--cp-tx);padding:0;width:min(580px,96vw);max-height:94vh;font-family:var(--cp-font)}
dialog::backdrop{background:rgba(0,0,0,.55);backdrop-filter:blur(3px)}
.t-neon dialog{border-color:var(--cp-ac);box-shadow:0 0 28px color-mix(in srgb,var(--cp-ac) 40%,transparent)}
.df{padding:18px 20px;display:flex;flex-direction:column;gap:11px;overflow:auto;max-height:94vh}
.df h3{margin:0;font-size:1.1rem}.df label.l{display:block;font-size:.76rem;color:var(--cp-mut);margin-bottom:3px}
.ttl{font-size:1.15rem;font-weight:600;padding:10px}
.r2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.r3{display:grid;grid-template-columns:1.4fr 1fr;gap:10px}
.line{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.imp{display:flex;gap:6px;flex-wrap:wrap}.imp label{cursor:pointer;padding:5px 11px;border:1px solid var(--c);color:var(--c);border-radius:20px;font-size:.82rem}
.imp input{display:none}.imp label:has(input:checked){background:var(--c);color:#06070b;font-weight:700}
.box{border:1px solid var(--cp-bd);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.wd{display:flex;gap:5px}.wd label{width:34px;height:34px;border-radius:50%;border:1px solid var(--cp-bd);display:grid;place-items:center;cursor:pointer}
.wd input{display:none}.wd label:has(input:checked){background:var(--cp-ac);color:var(--cp-on);border-color:transparent}
.rr{display:flex;gap:6px;align-items:center}.rr input{width:80px}.rr select{width:auto}
.sum{font-size:.8rem;color:var(--cp-ac)}.hint{font-size:.78rem;color:var(--cp-mut);margin:2px 0 6px}
.acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:6px}.acts .sp{flex:1}
.chs{display:flex;gap:10px;flex-wrap:wrap}.chs label{display:flex;gap:6px;align-items:center;padding:6px 10px;border:1px solid var(--cp-bd);border-radius:10px;cursor:pointer}
.chs label.off{opacity:.5}
.opt{display:flex;gap:8px;align-items:center;padding:6px 0}
/* réglages */
.setw{position:absolute;inset:0;background:var(--cp-bg);z-index:30;overflow:auto;padding:18px}
.setw.hasimg{background:inherit}
.set{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.sh{display:flex;align-items:center;gap:10px}.sh h2{flex:1;margin:0}
.pills{display:flex;gap:8px;flex-wrap:wrap}
.pill{border:1px solid var(--cp-bd);background:var(--cp-card);border-radius:999px;padding:8px 18px}
.pill.on{background:var(--cp-ac2);color:var(--cp-on);border-color:transparent;box-shadow:0 2px 14px color-mix(in srgb,var(--cp-ac2) 55%,transparent);font-weight:600}
.card{background:var(--cp-card);border:1px solid var(--cp-bd);border-radius:14px;padding:14px 16px}
.t-neon .card{border-color:#2e2062;box-shadow:0 0 16px rgba(0,240,255,.07)}
.ch{display:flex;align-items:center;gap:12px}.ch h3{flex:1;margin:0;font-size:1rem}.ch label{display:flex;gap:6px;align-items:center}
.lst{max-height:300px;overflow:auto;margin:6px 0}.lst label{display:flex;gap:8px;align-items:center;padding:3px 0}
.fld{margin-top:10px}.fld>label{display:block;font-size:.78rem;color:var(--cp-mut);margin-bottom:3px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.tile{border:2px solid var(--cp-bd);border-radius:12px;padding:0;overflow:hidden;background:none;text-align:left}.tile.on{border-color:var(--cp-ac2)}
.tile i{display:block;height:54px}.tile span{display:block;padding:7px 10px;font-size:.84rem}
.calrow{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.foot{position:sticky;bottom:0;background:var(--cp-bg);padding:10px 0;display:flex;gap:10px;justify-content:flex-end;align-items:center}
.toast{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);background:var(--cp-ac);color:var(--cp-on);padding:10px 16px;border-radius:12px;z-index:90;max-width:90%;box-shadow:0 6px 24px rgba(0,0,0,.35)}
.toast.err{background:#f43f5e;color:#fff}
@media(max-width:900px){
 .rail{position:absolute;z-index:40;left:0;top:0;bottom:0;transform:translateX(-102%);transition:transform .2s;background:var(--cp-card);box-shadow:0 0 30px rgba(0,0,0,.4)}
 .rail.open{transform:none}.scrim.open{display:block;position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:39}
 .search{width:100%;order:9}.bar h2{order:3;width:100%;flex-basis:100%;font-size:1.1rem}.r2,.r3{grid-template-columns:1fr}
 .mgrid{grid-template-rows:auto repeat(6,minmax(66px,1fr))}.chip{font-size:.68rem}.setw{padding:10px}
}`;

const TPL = `<style>${CSS}</style>
<div class="root" id="root">
 <aside class="rail" id="rail"></aside>
 <div class="scrim" id="scrim" data-act="rail"></div>
 <section class="main">
  <div class="bar">
   <button class="btn ib" id="b_menu" data-act="menu" title="Menu Home Assistant" hidden>☰</button>
   <button class="btn ib" id="b_rail" data-act="rail" title="Calendriers">🗓</button>
   <button class="btn" data-act="today">Aujourd'hui</button>
   <button class="btn ib" data-act="prev" title="Précédent">‹</button>
   <button class="btn ib" data-act="next" title="Suivant">›</button>
   <h2 id="title"></h2>
   <input id="q" class="search" placeholder="Rechercher…  ( / )" autocomplete="off">
   <div class="seg" id="seg">${VIEWS.map(([v, l]) => `<button data-act="view" data-v="${v}">${l}</button>`).join("")}</div>
   <button class="btn ib" data-act="settings" title="Réglages">⚙</button>
  </div>
  <div class="body" id="body"></div>
  <div class="setw" id="setw" hidden></div>
 </section>
 <dialog id="dlg"><div class="df">
  <h3 id="dt"></h3>
  <input id="f_title" class="ttl" placeholder="Titre" maxlength="200">
  <div class="r3">
   <div><label class="l">Calendrier</label><select id="f_cal"></select></div>
   <div><label class="l">Statut</label><select id="f_stat"><option value="confirmed">Confirmé</option><option value="tentative">Provisoire</option><option value="cancelled">Annulé</option></select></div>
  </div>
  <div><label class="l">Importance</label><div class="imp">${IMP.map((l, i) => `<label style="--c:${IMPC[i]}"><input type="radio" name="imp" value="${i}">${l}</label>`).join("")}</div></div>
  <div class="box">
   <label class="line"><input type="checkbox" id="f_ad"> Toute la journée</label>
   <div class="r2"><div><label class="l">Début</label><div class="line"><input type="date" id="f_sd" style="flex:1"><input type="time" id="f_st" style="width:110px"></div></div>
   <div><label class="l">Fin</label><div class="line"><input type="date" id="f_ed" style="flex:1"><input type="time" id="f_et" style="width:110px"></div></div></div>
   <div id="f_recb" class="line" style="align-items:stretch;flex-direction:column"></div>
  </div>
  <div class="r2"><div><label class="l">Lieu</label><input id="f_loc" placeholder="Adresse, salle…"></div><div><label class="l">Lien</label><input id="f_url" placeholder="https://"></div></div>
  <div><label class="l">Description</label><textarea id="f_desc" rows="3"></textarea></div>
  <div><label class="l">Disponibilité</label><select id="f_busy"><option value="1">Occupé</option><option value="0">Libre</option></select></div>
  <div class="box"><label class="l" style="margin:0">Rappels</label><div id="f_rem"></div>
   <div class="line"><button class="btn" data-act="remAdd" data-rc="form">＋ Ajouter un rappel</button></div>
   <label class="l" style="margin:6px 0 0">Prévenir par</label><div class="chs" id="f_ch"></div></div>
  <div class="acts"><button class="btn danger" id="b_del" data-act="del">Supprimer</button><button class="btn" id="b_dup" data-act="dup">Dupliquer</button><span class="sp"></span><button class="btn" data-act="close">Fermer</button><button class="btn pri" data-act="save">Enregistrer</button></div>
 </div></dialog>
 <dialog id="scope" style="width:min(420px,94vw)"><form method="dialog" class="df">
  <h3 id="sc_t"></h3>
  <label class="opt" id="sc_this"><input type="radio" name="sc" value="this"> Cet événement seulement</label>
  <label class="opt"><input type="radio" name="sc" value="following"> Cet événement et les suivants</label>
  <label class="opt"><input type="radio" name="sc" value="all"> Tous les événements de la série</label>
  <div class="acts"><button class="btn" value="cancel">Annuler</button><button class="btn pri" value="ok">OK</button></div>
 </form></dialog>
 <div class="toast" id="toast" hidden></div>
</div>`;

class CalendrierPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = TPL;
    this.S = { view: "month", cur: sod(new Date()), mini: null, occ: [], hol: {}, up: [], cals: [], calMap: {}, set: {}, draft: null,
      screen: "cal", tab: "general", hidden: new Set(), results: null, notify: [], admin: false, railOpen: false };
    this.ui = { ...UI_DEF };
    this._tok = 0;
    this._clear = new Set();
    try { Object.assign(this.ui, JSON.parse(localStorage.getItem("cp_ui") || "{}")); } catch (e) { /* ignore */ }
    try { this.S.hidden = new Set(JSON.parse(localStorage.getItem("cp_hidden") || "[]")); } catch (e) { /* ignore */ }
    this.S.view = this.ui.view;
    this.S.mini = new Date(this.S.cur.getFullYear(), this.S.cur.getMonth(), 1);
    const sr = this.shadowRoot;
    this.$ = s => sr.querySelector(s);
    sr.addEventListener("click", e => this._click(e));
    sr.addEventListener("change", e => this._change(e));
    sr.addEventListener("input", e => this._input(e));
    sr.addEventListener("dragstart", e => this._dragstart(e));
    sr.addEventListener("dragover", e => { if (this._drag && e.target.closest?.("[data-drop]")) e.preventDefault(); });
    sr.addEventListener("drop", e => this._drop(e));
    sr.addEventListener("pointerdown", e => this._pdown(e));
    sr.addEventListener("scroll", e => { if (e.target.classList?.contains("tg")) this._tgScroll = e.target.scrollTop; }, true);
    this.$("#q").addEventListener("keydown", e => {
      if (e.key === "Enter") this.doSearch();
      if (e.key === "Escape") { e.target.value = ""; this.S.results = null; this.render(); }
    });
    this.$("#dlg").addEventListener("change", e => this._formChange(e));
    this.$("#dlg").addEventListener("input", e => this._formInput(e));
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._boot();
    else if (this._themeSig !== this._sig()) this.applyTheme();
  }
  set narrow(v) { this._narrow = !!v; this.$("#b_menu").hidden = !this._narrow; }
  set panel(_p) {}
  set route(_r) {}
  connectedCallback() {
    this._kd = e => this._key(e);
    window.addEventListener("keydown", this._kd);
    this._clock = setInterval(() => this.updateNow(), 60000);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._kd);
    clearInterval(this._clock);
    if (this._subP) this._subP.then(u => u()).catch(() => {});
  }

  ws(cmd, payload = {}) {
    const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== null && v !== undefined));
    return this._hass.callWS({ type: WS + cmd, ...clean });
  }
  toast(msg, err = false) {
    const t = this.$("#toast");
    t.textContent = msg; t.className = "toast" + (err ? " err" : ""); t.hidden = false;
    clearTimeout(this._tt); this._tt = setTimeout(() => (t.hidden = true), err ? 6000 : 3200);
  }

  async _boot() {
    this.applyTheme();
    try {
      const r = await this.ws("init");
      this.S.set = r.settings; this.S.cals = r.calendars; this.S.notify = r.notify_services; this.S.admin = r.is_admin;
      this.S.calMap = Object.fromEntries(r.calendars.map(c => [c.id, c]));
      this._subP = this._hass.connection.subscribeMessage(() => this.refresh(), { type: WS + "subscribe" });
      await this.load();
    } catch (e) {
      this.$("#body").innerHTML = `<div class="empty">Impossible de charger le calendrier.<br><small>${esc(e.message || e)}</small></div>`;
    }
  }

  async refresh() {
    try {
      const r = await this.ws("init");
      this.S.set = r.settings; this.S.cals = r.calendars; this.S.notify = r.notify_services;
      this.S.calMap = Object.fromEntries(r.calendars.map(c => [c.id, c]));
    } catch (e) { /* ignore */ }
    await this.load();
  }

  /* ---------- thème ---------- */
  _sig() { const t = this._hass?.themes; return `${t?.theme}|${t?.darkMode}|${this.ui.ha_theme}`; }
  applyTheme() {
    const u = this.ui, root = this.$("#root");
    (this._tv || []).forEach(k => root.style.removeProperty(k)); this._tv = [];
    const set = (k, v) => { root.style.setProperty(k, v); this._tv.push(k); };
    root.className = "root t-" + u.theme;
    const dark = u.theme === "auto" ? !!this._hass?.themes?.darkMode : u.theme !== "light";
    root.style.colorScheme = dark ? "dark" : "light";
    if (u.theme === "auto" && u.ha_theme) {
      const th = this._hass?.themes?.themes?.[u.ha_theme];
      if (th) {
        const mode = th.modes ? (dark ? th.modes.dark : th.modes.light) : null;
        const vars = { ...th, ...(mode || {}) }; delete vars.modes;
        Object.entries(vars).forEach(([k, v]) => set("--" + k, String(v)));
      }
    }
    if (u.bg) set("--cp-bg", u.bg);
    if (u.tx) set("--cp-tx", u.tx);
    if (u.ac) { set("--cp-ac", u.ac); set("--cp-ac2", u.ac); }
    if (u.img) {
      const shade = `color-mix(in srgb,var(--cp-bg) ${u.dim}%,transparent)`;
      set("background-image", `linear-gradient(${shade},${shade}),url("${u.img.replace(/"/g, "%22")}")`);
      root.style.backgroundImage = `linear-gradient(${shade},${shade}),url("${u.img.replace(/"/g, "%22")}")`;
      root.style.backgroundSize = "cover";
    } else root.style.removeProperty("background-image");
    this._themeSig = this._sig();
  }
  setUi(k, v) {
    this.ui[k] = v;
    try { localStorage.setItem("cp_ui", JSON.stringify(this.ui)); } catch (e) { /* ignore */ }
    if (["theme", "ha_theme", "bg", "tx", "ac", "img", "dim"].includes(k)) this.applyTheme();
  }

  /* ---------- données ---------- */
  weekStart(d) { return addD(sod(d), -((d.getDay() - this.ui.first + 7) % 7)); }
  range() {
    const S = this.S, c = S.cur;
    let a, b;
    if (S.view === "month") { a = this.weekStart(new Date(c.getFullYear(), c.getMonth(), 1)); b = addD(a, 42); }
    else if (S.view === "week") { a = this.weekStart(c); b = addD(a, 7); }
    else if (S.view === "day") { a = sod(c); b = addD(a, 1); }
    else if (S.view === "year") { a = new Date(c.getFullYear(), 0, 1); b = new Date(c.getFullYear() + 1, 0, 1); }
    else { a = sod(c); b = addD(a, this.ui.agendaDays); }
    const ms = this.weekStart(S.mini), me = addD(ms, 42);
    return [a < ms ? a : ms, b > me ? b : me];
  }
  async load() {
    const tok = ++this._tok, [a, b] = this.range();
    try {
      const [r, u] = await Promise.all([this.ws("events", { start: ymd(a), end: ymd(b) }), this.ws("upcoming", { days: 14 })]);
      if (tok !== this._tok) return;
      this.S.occ = r.events; this.S.up = u.events;
      this.S.hol = Object.fromEntries(r.holidays.map(h => [h.date, h.name]));
      this.render();
    } catch (e) { this.toast(e.message || "Chargement impossible", true); }
  }
  vis() { return this.S.occ.filter(o => !this.S.hidden.has(o.calendar_id)); }
  multi(o) { return !o.all_day && o.start.slice(0, 10) !== o.end.slice(0, 10) && !(o.end.slice(11) === "00:00" && ymd(addD(pd(o.start), 1)) === o.end.slice(0, 10)); }
  idx() {
    const idx = new Map();
    for (const o of this.vis()) {
      const s = pd(o.start), e = pd(o.end);
      let d = sod(s), last = sod(e);
      if (!o.all_day && e > s && e.getHours() === 0 && e.getMinutes() === 0) last = addD(last, -1);
      for (let i = 0; d <= last && i < 62; i++, d = addD(d, 1)) {
        const k = ymd(d); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(o);
      }
    }
    idx.forEach(l => l.sort((x, y) => (y.all_day || this.multi(y)) - (x.all_day || this.multi(x)) || x.start.localeCompare(y.start)));
    return idx;
  }
  col(o) { return this.ui.colorBy === "importance" ? IMPC[o.importance ?? 1] : (this.S.calMap[o.calendar_id]?.color || "#4f8cff"); }
  tm(hhmm) {
    if (this.ui.h24) return hhmm;
    const [h, m] = hhmm.split(":").map(Number);
    return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
  }
  findOcc(id, key) { return [...this.S.occ, ...this.S.up, ...(this.S.results || [])].find(x => x.event_id === id && x.key === key); }

  /* ---------- navigation ---------- */
  go(date, view) {
    const S = this.S;
    if (view && view !== S.view) { S.view = view; this._tgScroll = null; this.setUi("view", view); }
    S.cur = sod(date); S.mini = new Date(S.cur.getFullYear(), S.cur.getMonth(), 1); S.results = null;
    S.screen = "cal"; this.load();
  }
  a_today() { this.go(new Date()); }
  a_prev() { this.nav(-1); }
  a_next() { this.nav(1); }
  nav(n) {
    const c = this.S.cur, v = this.S.view;
    if (v === "month") this.go(new Date(c.getFullYear(), c.getMonth() + n, 1));
    else if (v === "year") this.go(new Date(c.getFullYear() + n, 0, 1));
    else this.go(addD(c, v === "week" ? 7 * n : v === "day" ? n : 7 * n));
  }
  a_view(t) { this.go(this.S.cur, t.dataset.v); }
  a_goDay(t, e) { e.stopPropagation(); this.go(pd(t.dataset.d), "day"); }
  a_goMonth(t) { this.go(pd(t.dataset.d), "month"); }
  a_pick(t) { this.go(pd(t.dataset.d), this.S.view === "year" ? "month" : this.S.view); }
  a_miniPrev() { const m = this.S.mini; this.S.mini = new Date(m.getFullYear(), m.getMonth() - 1, 1); this.load(); }
  a_miniNext() { const m = this.S.mini; this.S.mini = new Date(m.getFullYear(), m.getMonth() + 1, 1); this.load(); }
  a_menu() { this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })); }
  a_rail() { this.S.railOpen = !this.S.railOpen; this.$("#rail").classList.toggle("open", this.S.railOpen); this.$("#scrim").classList.toggle("open", this.S.railOpen); }
  async doSearch() {
    const q = this.$("#q").value.trim();
    if (!q) { this.S.results = null; return this.render(); }
    const r = await this.ws("search", { query: q });
    this.S.results = r.events; this.S.screen = "cal"; this.render();
  }
  _key(e) {
    const t = e.composedPath()[0], tag = t?.tagName;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.$("#dlg").open || this.$("#scope").open) return;
    if (this.S.screen === "settings") { if (e.key === "Escape") this.a_closeSet(); return; }
    const k = e.key.toLowerCase(), map = { j: "day", d: "day", s: "week", w: "week", m: "month", y: "year", a: "agenda" };
    if (map[k]) this.go(this.S.cur, map[k]);
    else if (k === "t") this.a_today();
    else if (k === "n") this.a_new();
    else if (k === "/") { e.preventDefault(); this.$("#q").focus(); }
    else if (e.key === "ArrowLeft") this.nav(-1);
    else if (e.key === "ArrowRight") this.nav(1);
  }

  /* ---------- rendu ---------- */
  render() {
    const S = this.S, u = this.ui;
    this.$("#seg").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.v === S.view && !S.results));
    this.$("#title").textContent = S.results ? `Résultats (${S.results.length})` : this.titleText();
    this.$("#rail").innerHTML = this.railHtml();
    const body = this.$("#body"), keep = this._tgScroll;
    const idx = this.idx();
    let h;
    if (S.results) h = this.listHtml(S.results, "Aucun résultat pour cette recherche.");
    else if (S.view === "month") h = this.monthHtml(idx);
    else if (S.view === "week" || S.view === "day") h = this.gridHtml(idx);
    else if (S.view === "year") h = this.yearHtml(idx);
    else h = this.agendaHtml(idx);
    body.innerHTML = h;
    const tg = this.$(".tg");
    if (tg) {
      const now = new Date(), isToday = ymd(S.cur) === ymd(now) || S.view === "week";
      tg.scrollTop = keep ?? Math.max(0, ((isToday && ymd(now) >= ymd(this.weekStart(S.cur)) ? now.getHours() - 1.5 : u.work_start - 0.5) * u.hourPx));
      this._tgScroll = tg.scrollTop;
    }
    if (S.screen === "settings") this.renderSettings();
    else this.$("#setw").hidden = true;
  }
  titleText() {
    const S = this.S, c = S.cur;
    if (S.view === "month") return fr(c, { month: "long", year: "numeric" });
    if (S.view === "year") return String(c.getFullYear());
    if (S.view === "day") return fr(c, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (S.view === "week") {
      const a = this.weekStart(c), b = addD(a, 6);
      return `${fr(a, { day: "numeric", month: "short" })} – ${fr(b, { day: "numeric", month: "short", year: "numeric" })} · S${isoWeek(addD(a, 3))}`;
    }
    return `Agenda · ${this.ui.agendaDays} jours`;
  }
  dayOrder() { const o = []; for (let i = 0; i < 7; i++) { const d = (this.ui.first + i) % 7; if (this.ui.weekend || (d !== 0 && d !== 6)) o.push(d); } return o; }

  miniHtml(m, nav) {
    const u = this.ui, t = ymd(new Date()), cur = ymd(this.S.cur), order = this.dayOrder(), start = this.weekStart(new Date(m.getFullYear(), m.getMonth(), 1));
    const dots = this._idx || new Map();
    let h = `${nav ? `<div class="mh"><button class="btn ib" data-act="miniPrev">‹</button><b>${fr(m, { month: "long", year: "numeric" })}</b><button class="btn ib" data-act="miniNext">›</button></div>` : ""}`;
    h += `<div class="mg7" style="grid-template-columns:${u.weeks && nav ? "22px " : ""}repeat(${order.length},1fr)">${u.weeks && nav ? `<span class="d"></span>` : ""}${order.map(d => `<span class="d">${LETTER[d]}</span>`).join("")}`;
    for (let w = 0; w < 6; w++) {
      const ws = addD(start, w * 7);
      if (u.weeks && nav) h += `<span class="w">${isoWeek(addD(ws, 3))}</span>`;
      for (let i = 0; i < 7; i++) {
        const d = addD(ws, i); if (!order.includes(d.getDay())) continue;
        const k = ymd(d), has = dots.has(k);
        h += `<span class="${d.getMonth() !== m.getMonth() ? "o" : ""} ${k === t ? "t" : k === cur && nav ? "s" : ""} ${u.holidays && this.S.hol[k] ? "h" : ""}" data-act="${nav ? "pick" : "goDay"}" data-d="${k}">${d.getDate()}${has ? "<i></i>" : ""}</span>`;
      }
    }
    return h + "</div>";
  }
  railHtml() {
    const S = this.S, u = this.ui, today = ymd(new Date());
    this._idx = this.idx();
    const up = S.up.filter(o => !S.hidden.has(o.calendar_id)).slice(0, 8).map(o => {
      const d = o.start.slice(0, 10), lab = d === today ? "Aujourd'hui" : d === ymd(addD(new Date(), 1)) ? "Demain" : fr(pd(d), { weekday: "short", day: "numeric", month: "short" });
      return `<div class="up" style="--c:${this.col(o)}" data-act="open" data-id="${o.event_id}" data-key="${esc(o.key)}"><i></i><div><b>${esc(o.title)}</b><span>${lab}${o.all_day ? "" : " · " + this.tm(o.start.slice(11))}</span></div></div>`;
    }).join("") || `<div class="hint">Rien de prévu dans les 14 prochains jours.</div>`;
    return `<button class="btn pri wide" data-act="new">＋ Nouvel événement</button>
     <div class="mini">${this.miniHtml(S.mini, true)}</div>
     <div><h4>Mes calendriers</h4>${S.cals.map(c => `<label class="cl"><input type="checkbox" data-vis="${c.id}" ${S.hidden.has(c.id) ? "" : "checked"} style="accent-color:${c.color}"><i style="background:${c.color}"></i>${esc(c.name)}</label>`).join("")}
      <label class="cl"><input type="checkbox" data-u="holidays" ${u.holidays ? "checked" : ""}><i style="background:#94a3b8"></i>Jours fériés</label></div>
     <div><h4>À venir</h4>${up}</div>`;
  }

  chip(o) {
    const big = o.all_day || this.multi(o);
    const cls = `chip${big ? " ad" : ""}${o.status === "cancelled" ? " x" : ""}${o.status === "tentative" ? " tent" : ""}${o.busy === false ? " free" : ""}`;
    return `<div class="${cls}" style="--c:${this.col(o)}" draggable="true" data-act="open" data-id="${o.event_id}" data-key="${esc(o.key)}" title="${esc(o.title)}">${big ? "" : `<b>${this.tm(o.start.slice(11))}</b>`}${esc(o.title)}${o.recurring ? " 🔁" : ""}</div>`;
  }
  monthHtml(idx) {
    const S = this.S, u = this.ui, order = this.dayOrder(), t = ymd(new Date()), start = this.weekStart(new Date(S.cur.getFullYear(), S.cur.getMonth(), 1));
    const max = this._narrow ? 2 : 4;
    let h = `<div class="mgrid" style="--n:${order.length};--wk:${u.weeks ? "36px" : "0px"}">${u.weeks ? "<div class=\"dow\"></div>" : ""}${order.map(d => `<div class="dow">${NAMES[d]}</div>`).join("")}`;
    for (let w = 0; w < 6; w++) {
      const ws = addD(start, w * 7);
      if (u.weeks) h += `<div class="wk">${isoWeek(addD(ws, 3))}</div>`;
      for (let i = 0; i < 7; i++) {
        const d = addD(ws, i); if (!order.includes(d.getDay())) continue;
        const k = ymd(d), ev = idx.get(k) || [], hol = u.holidays ? S.hol[k] : "";
        h += `<div class="cell ${d.getMonth() !== S.cur.getMonth() ? "o" : ""} ${k === t ? "t" : ""}" data-act="cellNew" data-d="${k}" data-drop="${k}"><div class="dn"><span data-act="goDay" data-d="${k}">${d.getDate()}</span>${hol ? `<em title="${esc(hol)}">${esc(hol)}</em>` : ""}</div>${ev.slice(0, max).map(o => this.chip(o)).join("")}${ev.length > max ? `<div class="more" data-act="goDay" data-d="${k}">+${ev.length - max} autre(s)</div>` : ""}</div>`;
      }
    }
    return h + "</div>";
  }

  layout(segs) {
    segs.sort((a, b) => a.s - b.s || b.e - a.e);
    const out = []; let cl = [], end = 0;
    const flush = () => { const lanes = []; cl.forEach(g => { let l = lanes.findIndex(x => x <= g.s); if (l < 0) { l = lanes.length; lanes.push(0); } lanes[l] = g.e; g.lane = l; }); cl.forEach(g => (g.n = lanes.length)); out.push(...cl); cl = []; end = 0; };
    for (const g of segs) { if (cl.length && g.s >= end) flush(); cl.push(g); end = Math.max(end, g.e); }
    if (cl.length) flush();
    return out;
  }
  gridHtml(idx) {
    const S = this.S, u = this.ui, hp = u.hourPx, order = this.dayOrder(), t = ymd(new Date());
    const days = S.view === "day" ? [sod(S.cur)] : (() => { const a = this.weekStart(S.cur), l = []; for (let i = 0; i < 7; i++) { const d = addD(a, i); if (order.includes(d.getDay())) l.push(d); } return l; })();
    const n = days.length;
    let h = `<div class="tg" style="--n:${n};--hp:${hp}px"><div class="tg-top"><div class="row7"><div></div>${days.map(d => { const k = ymd(d); return `<div class="dh ${k === t ? "t" : ""}" data-act="goDay" data-d="${k}"><span>${NAMES[d.getDay()]}</span><b>${d.getDate()}</b><em>${u.holidays ? esc(S.hol[k] || "") : ""}</em></div>`; }).join("")}</div>`;
    h += `<div class="row7 adr"><div class="g">journée</div>${days.map(d => { const k = ymd(d); return `<div data-drop="${k}" data-act="cellNew" data-d="${k}">${(idx.get(k) || []).filter(o => o.all_day || this.multi(o)).map(o => this.chip(o)).join("")}</div>`; }).join("")}</div></div>`;
    h += `<div class="tg-in" style="height:${24 * hp}px"><div class="gut">${Array.from({ length: 23 }, (_, i) => `<div class="hl" style="top:${(i + 1) * hp}px">${this.ui.h24 ? pad(i + 1) + ":00" : ((i + 1) % 12 || 12) + (i + 1 < 12 ? " AM" : " PM")}</div>`).join("")}</div>`;
    const nowD = new Date();
    for (const d of days) {
      const k = ymd(d), ds = d.getTime(), de = addD(d, 1).getTime();
      const segs = [];
      for (const o of idx.get(k) || []) {
        if (o.all_day || this.multi(o)) continue;
        const s = pd(o.start).getTime(), e = pd(o.end).getTime();
        let a = (Math.max(s, ds) - ds) / 60000, b = (Math.min(e, de) - ds) / 60000;
        if (b - a < 25) b = a + 25;
        segs.push({ o, s: a, e: Math.min(b, 1440), full: e <= de });
      }
      h += `<div class="col ${k === t ? "t" : ""}" data-act="slot" data-d="${k}" data-drop="${k}" data-grid="1"><div class="wkh" style="top:${u.work_start * hp}px;height:${Math.max(0, u.work_end - u.work_start) * hp}px"></div>`;
      for (const g of this.layout(segs)) {
        const o = g.o, top = g.s * hp / 60, ht = Math.max(18, (g.e - g.s) * hp / 60 - 2);
        h += `<div class="blk${o.status === "cancelled" ? " x" : ""}${o.status === "tentative" ? " tent" : ""}" style="--c:${this.col(o)};top:${top}px;height:${ht}px;left:calc(${g.lane * 100 / g.n}% + 1px);width:calc(${100 / g.n}% - 3px)" draggable="true" data-act="open" data-id="${o.event_id}" data-key="${esc(o.key)}" title="${esc(o.title)}"><b>${esc(o.title)}${o.recurring ? " 🔁" : ""}</b>${ht > 34 ? `<span>${this.tm(o.start.slice(11))} – ${this.tm(o.end.slice(11))}</span>` : ""}${ht > 52 && o.location ? `<span>📍 ${esc(o.location)}</span>` : ""}${g.full ? `<i class="rs"></i>` : ""}</div>`;
      }
      if (k === ymd(nowD)) h += `<div class="now" style="top:${(nowD.getHours() * 60 + nowD.getMinutes()) * hp / 60}px"></div>`;
      h += `</div>`;
    }
    return h + `</div></div>`;
  }
  updateNow() {
    const el = this.$(".now"); if (!el) return;
    const n = new Date(); el.style.top = (n.getHours() * 60 + n.getMinutes()) * this.ui.hourPx / 60 + "px";
  }
  yearHtml() {
    const y = this.S.cur.getFullYear();
    return `<div class="yr">${Array.from({ length: 12 }, (_, m) => { const f = new Date(y, m, 1); return `<div class="ym"><h5 data-act="goMonth" data-d="${ymd(f)}">${fr(f, { month: "long" })}</h5>${this.miniHtml(f, false)}</div>`; }).join("")}</div>`;
  }
  rowHtml(o) {
    const s = pd(o.start), when = o.all_day ? "Toute la journée" : `${this.tm(o.start.slice(11))} – ${this.tm(o.end.slice(11))}`;
    return `<div class="ar ${o.status === "cancelled" ? "x" : ""}" style="--c:${this.col(o)}" data-act="open" data-id="${o.event_id}" data-key="${esc(o.key)}"><div class="tm">${when}</div><div><b>${esc(o.title)}${o.recurring ? " 🔁" : ""}</b>${o.location ? `<small>📍 ${esc(o.location)}</small>` : ""}</div><span class="mut" style="margin-left:auto">${(o.channels || []).map(c => CHN[c]?.[0] || "").join(" ")}</span></div>`;
  }
  agendaHtml(idx) {
    const a = sod(this.S.cur), u = this.ui; let h = "", any = false;
    for (let i = 0; i < u.agendaDays; i++) {
      const k = ymd(addD(a, i)), ev = idx.get(k) || [], hol = u.holidays ? this.S.hol[k] : "";
      if (!ev.length && !hol) continue;
      any = true;
      h += `<h4>${fr(pd(k), { weekday: "long", day: "numeric", month: "long" })}${hol ? `<em>${esc(hol)}</em>` : ""}</h4>${ev.map(o => this.rowHtml(o)).join("")}`;
    }
    return `<div class="ag">${any ? h : `<div class="empty">Rien de prévu sur cette période.<br><button class="btn pri" data-act="new">＋ Créer un événement</button></div>`}</div>`;
  }
  listHtml(list, empty) {
    if (!list.length) return `<div class="empty">${empty}</div>`;
    let last = "", h = "";
    for (const o of list) {
      const k = o.start.slice(0, 10);
      if (k !== last) { h += `<h4>${fr(pd(k), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h4>`; last = k; }
      h += this.rowHtml(o);
    }
    return `<div class="ag">${h}</div>`;
  }

  /* ---------- délégation d'événements ---------- */
  _click(e) {
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const fn = this["a_" + t.dataset.act];
    if (fn) Promise.resolve(fn.call(this, t, e)).catch(err => this.toast(err?.message || String(err), true));
  }
  val(t) {
    if (t.type === "checkbox") return t.checked;
    if (t.dataset.t === "n") return Number(t.value);
    if (t.dataset.t === "b") return t.value === "1";
    return t.value;
  }
  _change(e) {
    const t = e.target, d = t.dataset;
    if (t.closest("#dlg")) return;
    if (t.id === "icsfile") return this.importIcs(t);
    if (d.rc !== undefined && d.ri !== undefined) return this.remChange(t);
    if (d.vis) {
      t.checked ? this.S.hidden.delete(d.vis) : this.S.hidden.add(d.vis);
      localStorage.setItem("cp_hidden", JSON.stringify([...this.S.hidden]));
      return this.render();
    }
    if (d.u) { this.setUi(d.u, this.val(t)); return this.render(); }
    if (d.s) { this.S.draft[d.s] = this.val(t); if (d.s.endsWith("_enabled") || d.s === "notifications_enabled") this.renderSettings(); return; }
    if (d.sl) {
      const l = this.S.draft[d.sl], i = l.indexOf(t.value);
      if (t.checked && i < 0) l.push(t.value); else if (!t.checked && i >= 0) l.splice(i, 1);
      return;
    }
    if (d.cal) {
      const row = t.closest(".calrow");
      return this.ws("calendar/save", { calendar: { id: d.cal, name: row.querySelector("[data-f=name]").value, color: row.querySelector("[data-f=color]").value } })
        .then(r => { this.S.cals = r.calendars; this.S.calMap = Object.fromEntries(r.calendars.map(c => [c.id, c])); this.render(); })
        .catch(err => this.toast(err.message, true));
    }
  }
  _input(e) {
    const t = e.target;
    if (t.dataset.u && (t.type === "color" || t.type === "range")) this.setUi(t.dataset.u, this.val(t));
  }

  /* ---------- rappels (formulaire + réglages) ---------- */
  splitMin(m) { for (const [u] of [...UNITS].reverse()) if (m && m % u === 0) return [m / u, u]; return [m, 1]; }
  remRows(list, ctx) {
    return list.map((m, i) => {
      const [n, u] = this.splitMin(m);
      return `<div class="rr"><input type="number" min="0" value="${n}" data-rc="${ctx}" data-ri="${i}"><select data-rc="${ctx}" data-ri="${i}">${UNITS.map(([v, l]) => `<option value="${v}" ${v === u ? "selected" : ""}>${l}</option>`).join("")}</select><span class="mut">avant</span><button class="btn ib" data-act="remDel" data-rc="${ctx}" data-ri="${i}">✕</button></div>`;
    }).join("") || `<div class="hint">Aucun rappel</div>`;
  }
  remList(ctx) { return ctx === "form" ? this.F.rem : this.S.draft.default_reminders; }
  remChange(t) {
    const row = t.closest(".rr");
    this.remList(t.dataset.rc)[+t.dataset.ri] = Math.max(0, Math.round((+row.querySelector("input").value || 0) * +row.querySelector("select").value));
  }
  remRefresh(ctx) { if (ctx === "form") this.$("#f_rem").innerHTML = this.remRows(this.F.rem, "form"); else this.renderSettings(); }
  a_remAdd(t) { this.remList(t.dataset.rc).push(30); this.remRefresh(t.dataset.rc); }
  a_remDel(t) { this.remList(t.dataset.rc).splice(+t.dataset.ri, 1); this.remRefresh(t.dataset.rc); }

  /* ---------- formulaire d'événement ---------- */
  a_new() { const n = new Date(), c = this.S.cur, same = ymd(c) === ymd(n); this.newAt(new Date(c.getFullYear(), c.getMonth(), c.getDate(), same ? Math.min(n.getHours() + 1, 23) : 9, 0)); }
  a_cellNew(t) { const d = pd(t.dataset.d); this.newAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0)); }
  a_slot(t, e) {
    const r = t.getBoundingClientRect(), mins = Math.max(0, Math.min(1380, Math.floor((e.clientY - r.top) / this.ui.hourPx * 2) * 30)), d = pd(t.dataset.d);
    this.newAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, mins));
  }
  newAt(start) { return this.openForm(null, { start, end: new Date(start.getTime() + this.ui.dur * 60000) }); }
  a_open(t) { const o = this.findOcc(t.dataset.id, t.dataset.key); if (o) return this.openForm(o); }
  a_close() { this.$("#dlg").close(); }

  async openForm(o, def) {
    const S = this.S, $ = id => this.$("#" + id);
    const base = o ? await this.ws("event/get", { event_id: o.event_id }) : null;
    const rec = base?.recurrence ? JSON.parse(JSON.stringify(base.recurrence)) : null;
    this.F = { id: o?.event_id || null, key: o?.key || null, recurring: !!rec, baseRec: JSON.stringify(rec), rec,
      rem: o ? [...(o.reminders || [])] : [...(S.set.default_reminders || [])], ch: o ? [...(o.channels || [])] : [...(S.set.default_channels || [])] };
    const ad = o ? o.all_day : false;
    const s = o ? pd(o.start) : def.start, e = o ? pd(o.end) : def.end;
    $("dt").textContent = o ? "Modifier l'événement" : "Nouvel événement";
    $("f_title").value = o?.title || "";
    $("f_cal").innerHTML = S.cals.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
    $("f_cal").value = o?.calendar_id || S.cals[0]?.id;
    $("f_stat").value = o?.status || "confirmed";
    this.$(`input[name=imp][value="${o?.importance ?? 1}"]`).checked = true;
    $("f_ad").checked = ad;
    $("f_sd").value = ymd(s); $("f_st").value = `${pad(s.getHours())}:${pad(s.getMinutes())}`;
    $("f_ed").value = ymd(e); $("f_et").value = `${pad(e.getHours())}:${pad(e.getMinutes())}`;
    $("f_st").hidden = $("f_et").hidden = ad;
    $("f_loc").value = o?.location || ""; $("f_url").value = o?.url || ""; $("f_desc").value = o?.description || "";
    $("f_busy").value = o?.busy === false ? "0" : "1";
    this.F.dur = e - s;
    $("f_rem").innerHTML = this.remRows(this.F.rem, "form");
    this.renderChannels();
    this.renderRec();
    $("b_del").hidden = !o; $("b_dup").hidden = !o;
    this.$("#dlg").showModal();
    $("f_title").focus();
  }
  renderChannels() {
    this.$("#f_ch").innerHTML = Object.entries(CHN).map(([k, [i, l]]) => {
      const on = this.S.set[k + "_enabled"];
      return `<label class="${on ? "" : "off"}" title="${on ? "" : "Canal désactivé dans les réglages"}"><input type="checkbox" data-fch="${k}" ${this.F.ch.includes(k) ? "checked" : ""}> ${i} ${l}</label>`;
    }).join("");
  }
  formStart() { const v = this.$("#f_sd").value; return v ? pd(v) : new Date(); }
  presetOf(r, s) {
    if (!r) return "";
    if (r.custom) return "CUSTOM";
    const wd = (s.getDay() + 6) % 7, bw = [...(r.byweekday || [])].sort().join(), one = bw === "" || bw === String(wd), n = r.interval || 1;
    if (r.freq === "DAILY" && n === 1) return "DAILY";
    if (r.freq === "WEEKLY" && n === 1 && bw === "0,1,2,3,4") return "WEEKDAYS";
    if (r.freq === "WEEKLY" && one && n === 1) return "WEEKLY";
    if (r.freq === "WEEKLY" && one && n === 2) return "BIWEEKLY";
    if (r.freq === "MONTHLY" && n === 1 && (r.monthly_mode || "day") === "day") return "MONTHLY";
    if (r.freq === "YEARLY" && n === 1) return "YEARLY";
    return "CUSTOM";
  }
  mkRec(preset, s) {
    const wd = (s.getDay() + 6) % 7, old = this.F.rec, end = old?.end || { type: "never" };
    const base = { interval: 1, byweekday: [], monthly_mode: "day", end };
    const map = {
      DAILY: { freq: "DAILY" }, WEEKDAYS: { freq: "WEEKLY", byweekday: [0, 1, 2, 3, 4] }, WEEKLY: { freq: "WEEKLY", byweekday: [wd] },
      BIWEEKLY: { freq: "WEEKLY", interval: 2, byweekday: [wd] }, MONTHLY: { freq: "MONTHLY" }, YEARLY: { freq: "YEARLY" },
      CUSTOM: { custom: true, freq: old?.freq || "WEEKLY", interval: old?.interval || 2, byweekday: old?.byweekday?.length ? old.byweekday : [wd], monthly_mode: old?.monthly_mode || "day" },
    };
    return map[preset] ? { ...base, ...map[preset] } : null;
  }
  renderRec() {
    const r = this.F.rec, s = this.formStart(), nth = Math.ceil(s.getDate() / 7), cur = this.presetOf(r, s);
    const opts = [["", "Ne se répète pas"], ["DAILY", "Tous les jours"], ["WEEKDAYS", "Tous les jours ouvrés (lun. – ven.)"], ["WEEKLY", "Toutes les semaines"], ["BIWEEKLY", "Toutes les 2 semaines"],
      ["MONTHLY", "Tous les mois"], ["YEARLY", "Tous les ans"], ["CUSTOM", "Personnalisée…"]];
    let h = `<div class="line"><span>🔁</span><select id="r_freq" style="flex:1">${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
    if (r) {
      const units = [["DAILY", "jour(s)"], ["WEEKLY", "semaine(s)"], ["MONTHLY", "mois"], ["YEARLY", "an(s)"]];
      h += `<div class="line"><span>Répéter tous les</span><input type="number" id="r_int" min="1" max="99" value="${r.interval || 1}" style="width:72px"><select id="r_unit" style="width:auto">${units.map(([v, l]) => `<option value="${v}" ${r.freq === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
      if (r.freq === "WEEKLY") {
        h += `<div class="line"><span class="mut">Les jours :</span><div class="wd">${Array.from({ length: 7 }, (_, i) => { const js = (this.ui.first + i) % 7, b = (js + 6) % 7; return `<label title="${LONG[js]}"><input type="checkbox" data-wd="${b}" ${(r.byweekday || []).includes(b) ? "checked" : ""}>${LETTER[js]}</label>`; }).join("")}</div></div>`;
      }
      if (r.freq === "MONTHLY") {
        const mm = r.monthly_mode || "day";
        h += [["day", `Le ${s.getDate()} de chaque mois`], ["weekday", `Le ${nth >= 5 ? "dernier" : nth + (nth === 1 ? "er" : "e")} ${LONG[s.getDay()]} du mois`], ["last_day", "Le dernier jour du mois"]]
          .map(([v, l]) => `<label class="opt"><input type="radio" name="r_mm" value="${v}" ${mm === v ? "checked" : ""}> ${l}</label>`).join("");
      }
      const et = r.end?.type || "never";
      h += `<div><label class="l" style="margin:4px 0 0">Fin de la répétition</label>
        <label class="opt"><input type="radio" name="r_end" value="never" ${et === "never" ? "checked" : ""}> Jamais</label>
        <label class="opt"><input type="radio" name="r_end" value="until" ${et === "until" ? "checked" : ""}> Le <input type="date" id="r_until" value="${r.end?.until || ""}" style="width:auto"></label>
        <label class="opt"><input type="radio" name="r_end" value="count" ${et === "count" ? "checked" : ""}> Après <input type="number" id="r_count" min="1" max="999" value="${r.end?.count || 10}" style="width:78px"> fois</label></div>
        <div class="sum">${esc(this.recSummary(r, s))}</div>`;
    }
    this.$("#f_recb").innerHTML = h;
  }
  recSummary(r, s) {
    const n = r.interval || 1;
    let t = { DAILY: n === 1 ? "Tous les jours" : `Tous les ${n} jours`, WEEKLY: n === 1 ? "Toutes les semaines" : `Toutes les ${n} semaines`, MONTHLY: n === 1 ? "Tous les mois" : `Tous les ${n} mois`, YEARLY: n === 1 ? "Tous les ans" : `Tous les ${n} ans` }[r.freq];
    if (r.freq === "WEEKLY") t += " le " + ((r.byweekday?.length ? r.byweekday : [(s.getDay() + 6) % 7]).map(b => LONG[(b + 1) % 7]).join(", "));
    if (r.freq === "MONTHLY") t += { day: ` le ${s.getDate()}`, weekday: ` (même jour de semaine)`, last_day: " le dernier jour" }[r.monthly_mode || "day"];
    if (r.end?.type === "until" && r.end.until) t += `, jusqu'au ${fr(pd(r.end.until), { day: "numeric", month: "long", year: "numeric" })}`;
    if (r.end?.type === "count") t += `, ${r.end.count} fois`;
    return t;
  }
  _formInput() {}
  _formChange(e) {
    const t = e.target, F = this.F, $ = id => this.$("#" + id);
    if (t.dataset.rc !== undefined) return this.remChange(t);
    if (t.dataset.fch) { const i = F.ch.indexOf(t.dataset.fch); t.checked ? i < 0 && F.ch.push(t.dataset.fch) : i >= 0 && F.ch.splice(i, 1); return; }
    if (t.dataset.wd !== undefined) {
      const b = +t.dataset.wd, l = F.rec.byweekday || (F.rec.byweekday = []), i = l.indexOf(b);
      t.checked ? i < 0 && l.push(b) : i >= 0 && l.splice(i, 1); return this.renderRec();
    }
    switch (t.id || t.name) {
      case "f_ad": $("f_st").hidden = $("f_et").hidden = t.checked; break;
      case "f_sd": case "f_st": {
        const sv = $("f_sd").value + "T" + ($("f_st").value || "00:00");
        if ($("f_sd").value) { const e2 = new Date(pd(sv).getTime() + F.dur); $("f_ed").value = ymd(e2); $("f_et").value = `${pad(e2.getHours())}:${pad(e2.getMinutes())}`; }
        if (F.rec) this.renderRec();
        break;
      }
      case "f_ed": case "f_et": {
        const a = pd($("f_sd").value + "T" + ($("f_st").value || "00:00")), b = pd($("f_ed").value + "T" + ($("f_et").value || "00:00"));
        F.dur = Math.max(0, b - a); break;
      }
      case "r_freq": F.rec = this.mkRec(t.value, this.formStart()); this.renderRec(); break;
      case "r_unit": F.rec.freq = t.value; if (t.value === "WEEKLY" && !(F.rec.byweekday || []).length) F.rec.byweekday = [(this.formStart().getDay() + 6) % 7]; this.renderRec(); break;
      case "r_int": F.rec.interval = Math.max(1, +t.value || 1); this.renderRec(); break;
      case "r_mm": F.rec.monthly_mode = t.value; this.renderRec(); break;
      case "r_end": F.rec.end = t.value === "until" ? { type: "until", until: $("r_until").value || ymd(addD(this.formStart(), 90)) } : t.value === "count" ? { type: "count", count: +$("r_count").value || 10 } : { type: "never" }; this.renderRec(); break;
      case "r_until": F.rec.end = { type: "until", until: t.value }; this.renderRec(); break;
      case "r_count": F.rec.end = { type: "count", count: Math.max(1, +t.value || 1) }; this.renderRec(); break;
    }
  }
  askScope(title, { allowThis = true } = {}) {
    return new Promise(res => {
      const d = this.$("#scope");
      this.$("#sc_t").textContent = title;
      this.$("#sc_this").hidden = !allowThis;
      d.querySelector(`input[value="${allowThis ? "this" : "all"}"]`).checked = true;
      d.returnValue = "";
      d.onclose = () => res(d.returnValue === "ok" ? d.querySelector("input[name=sc]:checked").value : null);
      d.showModal();
    });
  }
  async a_save() {
    const F = this.F, $ = id => this.$("#" + id), ad = $("f_ad").checked;
    const title = $("f_title").value.trim();
    if (!title) return this.toast("Le titre est obligatoire", true);
    if (!$("f_sd").value) return this.toast("La date de début est obligatoire", true);
    const sd = $("f_sd").value, ed = $("f_ed").value || sd;
    const start = ad ? sd : `${sd}T${$("f_st").value || "00:00"}`;
    const end = ad ? ed : `${ed}T${$("f_et").value || $("f_st").value || "00:00"}`;
    if (end < start) return this.toast("La fin précède le début", true);
    if (F.rec?.end?.type === "until" && !F.rec.end.until) return this.toast("Choisis la date de fin de répétition", true);
    const ev = { id: F.id, title, calendar_id: $("f_cal").value, status: $("f_stat").value, importance: +this.$("input[name=imp]:checked").value,
      all_day: ad, start, end, location: $("f_loc").value, url: $("f_url").value, description: $("f_desc").value, busy: $("f_busy").value === "1",
      reminders: F.rem, channels: F.ch, recurrence: F.rec };
    let scope = "all", key = null;
    if (F.id && F.recurring) {
      const changed = JSON.stringify(F.rec) !== F.baseRec;
      const sc = await this.askScope("Modifier l'événement récurrent", { allowThis: !changed });
      if (!sc) return;
      scope = sc; key = F.key;
    }
    await this.ws("event/save", { event: ev, scope, key });
    this.$("#dlg").close(); this.toast("Événement enregistré"); await this.load();
  }
  async a_del() {
    const F = this.F; let scope = "all", key = null;
    if (F.recurring) { const sc = await this.askScope("Supprimer l'événement récurrent"); if (!sc) return; scope = sc; key = F.key; }
    else if (!confirm("Supprimer cet événement ?")) return;
    await this.ws("event/delete", { event_id: F.id, scope, key });
    this.$("#dlg").close(); this.toast("Événement supprimé"); await this.load();
  }
  a_dup() {
    Object.assign(this.F, { id: null, key: null, recurring: false });
    this.$("#dt").textContent = "Dupliquer l'événement"; this.$("#f_title").value += " (copie)";
    this.$("#b_del").hidden = this.$("#b_dup").hidden = true;
  }

  /* ---------- glisser-déposer & redimensionnement ---------- */
  _dragstart(e) {
    const el = e.target.closest?.("[data-id]"); if (!el) return;
    const o = this.findOcc(el.dataset.id, el.dataset.key); if (!o) return;
    const blk = e.target.closest(".blk");
    this._drag = { ...o, grab: blk ? (e.clientY - blk.getBoundingClientRect().top) / this.ui.hourPx * 60 : 0 };
    e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", o.event_id);
  }
  async _drop(e) {
    const tgt = e.target.closest?.("[data-drop]"); if (!tgt || !this._drag) return;
    e.preventDefault();
    const o = this._drag; this._drag = null;
    const s = pd(o.start), en = pd(o.end), d0 = pd(tgt.dataset.drop);
    let ns;
    if (tgt.dataset.grid && !o.all_day) {
      const mins = Math.max(0, Math.min(1425, Math.round(((e.clientY - tgt.getBoundingClientRect().top) / this.ui.hourPx * 60 - o.grab) / 15) * 15));
      ns = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, mins);
    } else ns = o.all_day ? d0 : new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), s.getHours(), s.getMinutes());
    if (ns.getTime() === s.getTime()) return;
    const ne = o.all_day ? addD(en, Math.round((ns - s) / 864e5)) : new Date(ns.getTime() + (en - s));
    await this.moveOcc(o, o.all_day ? ymd(ns) : ymdhm(ns), o.all_day ? ymd(ne) : ymdhm(ne));
  }
  async moveOcc(o, start, end) {
    let scope = "all", key = null;
    if (o.recurring) {
      const sc = await this.askScope("Déplacer l'événement récurrent");
      if (!sc) return this.load();
      scope = sc; key = o.key;
    }
    try { await this.ws("event/save", { event: { id: o.event_id, start, end, all_day: o.all_day }, scope, key }); }
    catch (err) { this.toast(err.message, true); }
    await this.load();
  }
  _pdown(e) {
    const h = e.target.closest?.(".rs"); if (!h) return;
    e.preventDefault(); e.stopPropagation();
    const blk = h.closest(".blk"), o = this.findOcc(blk.dataset.id, blk.dataset.key); if (!o) return;
    const hp = this.ui.hourPx, y0 = e.clientY, h0 = blk.offsetHeight;
    blk.draggable = false;
    const mv = ev => { blk.style.height = Math.max(hp / 4, h0 + ev.clientY - y0) + "px"; };
    const up = async ev => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      blk.draggable = true;
      const steps = Math.round((ev.clientY - y0) / hp * 4) * 15, s = pd(o.start), d0 = (pd(o.end) - s) / 60000;
      if (!steps) return;
      await this.moveOcc(o, o.start, ymdhm(new Date(s.getTime() + Math.max(15, d0 + steps) * 60000)));
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  }

  /* ---------- réglages ---------- */
  mkDraft() { const d = JSON.parse(JSON.stringify(this.S.set)); ["discord_webhook", "telegram_token"].forEach(k => (d[k] = "")); return d; }
  a_settings() { this.S.screen = "settings"; this.S.draft = this.mkDraft(); this._clear = new Set(); this.render(); }
  a_closeSet() { this.S.screen = "cal"; this.$("#setw").hidden = true; }
  a_tab(t) { this.S.tab = t.dataset.k; this.renderSettings(); }
  draftPatch() { return JSON.parse(JSON.stringify(this.S.draft)); }
  async a_saveSet() {
    const r = await this.ws("settings/save", { settings: this.draftPatch(), clear: [...this._clear] });
    this.S.set = r.settings; this.S.draft = this.mkDraft(); this._clear = new Set();
    this.toast("Réglages enregistrés ✅"); this.renderSettings();
  }
  async a_test(t) {
    const r = await this.ws("test", { channel: t.dataset.ch, settings: this.draftPatch() });
    const lines = Object.entries(r).map(([, v]) => `${v.ok ? "✅" : "❌"} ${v.info}`).join(" · ");
    this.toast(lines, !Object.values(r).every(v => v.ok));
  }
  async a_tgFind() {
    const r = await this.ws("telegram_chat", { token: this.S.draft.telegram_token });
    this.S.draft.telegram_chat_id = r.chat_id; this.renderSettings(); this.toast(`Chat trouvé : ${r.name || r.chat_id}`);
  }
  a_clearSecret(t) { this._clear.add(t.dataset.k); this.S.set[t.dataset.k + "_set"] = false; this.renderSettings(); this.toast("Sera effacé à l'enregistrement"); }
  async a_calAdd() {
    const r = await this.ws("calendar/save", { calendar: { name: "Nouveau calendrier", color: ["#06b6d4", "#a855f7", "#ef4444", "#84cc16"][this.S.cals.length % 4] } });
    this.S.cals = r.calendars; this.S.calMap = Object.fromEntries(r.calendars.map(c => [c.id, c])); this.render();
  }
  async a_calDel(t) {
    if (!confirm("Supprimer ce calendrier ? Ses événements seront déplacés vers le premier calendrier.")) return;
    const r = await this.ws("calendar/delete", { calendar_id: t.dataset.id });
    this.S.cals = r.calendars; this.S.calMap = Object.fromEntries(r.calendars.map(c => [c.id, c])); await this.load();
  }
  a_theme(t) { this.setUi("theme", t.dataset.th); this.render(); }
  a_uiReset(t) { this.setUi(t.dataset.k, UI_DEF[t.dataset.k]); this.render(); }
  async a_export() {
    const r = await this.ws("ics/export");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([r.ics], { type: "text/calendar" })); a.download = "calendrier.ics"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async importIcs(input) {
    const f = input.files[0]; if (!f) return;
    const r = await this.ws("ics/import", { ics: await f.text(), calendar_id: this.$("#imp_cal").value });
    input.value = ""; this.toast(`${r.count} événement(s) importé(s) sur ${r.found} trouvé(s)`); await this.load();
  }
  async a_sqlite() {
    const r = await this.ws("import_sqlite", { path: this.$("#sqlpath").value });
    this.toast(`${r.count} rendez-vous importé(s) depuis l'ancien add-on`); await this.load();
  }

  renderSettings() {
    const w = this.$("#setw"), keep = w.scrollTop, S = this.S, u = this.ui, d = S.draft;
    if (!d) return;
    const tabs = [["general", "Général"], ["look", "Apparence"], ["rem", "Rappels"], ["notif", "Notifications"], ["cals", "Calendriers"], ["data", "Données"]];
    const dis = S.admin ? "" : "disabled", sel = (k, v, o) => `<select data-u="${k}" ${typeof v === "number" ? 'data-t="n"' : ""}>${o.map(([a, b]) => `<option value="${a}" ${String(v) === String(a) ? "selected" : ""}>${b}</option>`).join("")}</select>`;
    const chk = (k, l) => `<label class="opt"><input type="checkbox" data-u="${k}" ${u[k] ? "checked" : ""}> ${l}</label>`;
    const fld = (l, h) => `<div class="fld"><label>${l}</label>${h}</div>`;
    const sw = (k, l = "Activer") => `<label><input type="checkbox" data-s="${k}" ${d[k] ? "checked" : ""} ${dis}> ${l}</label>`;
    const tst = ch => `<button class="btn" data-act="test" data-ch="${ch}" ${dis}>Tester</button>`;
    const services = S.notify.map(n => "notify." + n);
    const list = (key, items) => `<div class="lst">${[...new Set([...items, ...d[key]])].map(s => `<label><input type="checkbox" data-sl="${key}" value="${s}" ${d[key].includes(s) ? "checked" : ""} ${dis}> ${esc(s)}</label>`).join("") || "<div class=\"hint\">Aucun service trouvé.</div>"}</div>`;
    const secret = (k, ph) => `<input type="password" autocomplete="off" data-s="${k}" ${dis} placeholder="${S.set[k + "_set"] ? "•••• configuré — laisse vide pour conserver" : ph}">${S.set[k + "_set"] ? `<button class="btn" style="margin-top:6px" data-act="clearSecret" data-k="${k}" ${dis}>Effacer la valeur enregistrée</button>` : ""}`;
    let h = "";
    if (S.tab === "general") {
      h = `<div class="card"><div class="ch"><h3>Affichage</h3></div>
        <div class="r2">${fld("Vue par défaut", sel("view", u.view, VIEWS))}${fld("Premier jour de la semaine", sel("first", u.first, [[1, "Lundi"], [0, "Dimanche"], [6, "Samedi"]]))}
        ${fld("Format de l'heure", `<select data-u="h24" data-t="b"><option value="1" ${u.h24 ? "selected" : ""}>24 h</option><option value="0" ${u.h24 ? "" : "selected"}>12 h (AM/PM)</option></select>`)}${fld("Hauteur d'une heure", sel("hourPx", u.hourPx, [[36, "Compacte"], [52, "Normale"], [72, "Aérée"], [96, "Très grande"]]))}
        ${fld("Début des heures de travail", sel("work_start", u.work_start, Array.from({ length: 24 }, (_, i) => [i, pad(i) + ":00"])))}${fld("Fin des heures de travail", sel("work_end", u.work_end, Array.from({ length: 24 }, (_, i) => [i + 1, pad(i + 1) + ":00"])))}
        ${fld("Durée par défaut d'un événement", sel("dur", u.dur, [[15, "15 min"], [30, "30 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"]]))}${fld("Période de l'agenda", sel("agendaDays", u.agendaDays, [[14, "14 jours"], [30, "30 jours"], [60, "60 jours"], [90, "90 jours"]]))}
        ${fld("Couleur des événements selon", sel("colorBy", u.colorBy, [["calendar", "Le calendrier"], ["importance", "L'importance"]]))}</div>
        <div style="margin-top:8px">${chk("weeks", "Afficher les numéros de semaine")}${chk("weekend", "Afficher le week-end")}${chk("holidays", "Afficher les jours fériés (France)")}</div>
        <div class="hint">Ces choix sont enregistrés dans ce navigateur, pour chaque utilisateur.</div></div>
        <div class="card"><h3 style="margin:0 0 6px">Raccourcis clavier</h3><div class="hint">J jour · S semaine · M mois · Y année · A agenda · T aujourd'hui · N nouvel événement · ← → naviguer · / rechercher</div></div>`;
    } else if (S.tab === "look") {
      const th = [["auto", "Thème Home Assistant", "linear-gradient(135deg,var(--primary-color,#03a9f4),var(--card-background-color,#fff))"], ["light", "Clair", "linear-gradient(135deg,#fff,#dbe4ff)"], ["dark", "Sombre", "linear-gradient(135deg,#0d1016,#2a3350)"], ["neon", "Cyberpunk néon", "linear-gradient(135deg,#06040f,#ff2bd6 55%,#00f0ff)"]];
      const themes = Object.keys(this._hass?.themes?.themes || {}).sort();
      const color = (k, l, def) => fld(l, `<div class="line"><input type="color" data-u="${k}" value="${u[k] || def}"><span class="mut">${u[k] ? u[k] : "automatique"}</span>${u[k] ? `<button class="btn" data-act="uiReset" data-k="${k}">Réinitialiser</button>` : ""}</div>`);
      h = `<div class="card"><div class="ch"><h3>Thème de l'interface</h3></div><div class="tiles" style="margin-top:10px">${th.map(([k, l, g]) => `<button class="tile ${u.theme === k ? "on" : ""}" data-act="theme" data-th="${k}"><i style="background:${g}"></i><span>${l}</span></button>`).join("")}</div>
        ${u.theme === "auto" ? fld("Thème personnalisé de Home Assistant (config/themes)", `<select data-u="ha_theme"><option value="">Thème actuellement actif</option>${themes.map(n => `<option ${u.ha_theme === n ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><div class="hint">Les couleurs du thème choisi sont appliquées uniquement à ce panneau, avec son mode clair/sombre.</div>`) : ""}</div>
        <div class="card"><div class="ch"><h3>Couleurs et fond</h3></div><div class="r2">${color("bg", "Couleur de fond", "#101218")}${color("tx", "Couleur du texte", "#e8ebf3")}${color("ac", "Couleur d'accent", "#7b9bff")}</div>
        ${fld("Image de fond (URL ou chemin /local/…)", `<input data-u="img" value="${esc(u.img)}" placeholder="/local/fond.jpg">`)}
        ${u.img ? fld(`Voile sur l'image : ${u.dim} %`, `<input type="range" min="0" max="100" data-u="dim" data-t="n" value="${u.dim}">`) : ""}</div>`;
    } else if (S.tab === "rem") {
      h = `${S.admin ? "" : `<div class="hint">Seul un administrateur peut modifier ces réglages.</div>`}<div class="card"><div class="ch"><h3>Rappels par défaut</h3></div><div class="hint">Appliqués aux nouveaux événements ; modifiables pour chaque événement.</div>
        <div id="d_rem">${this.remRows(d.default_reminders, "draft")}</div><button class="btn" data-act="remAdd" data-rc="draft" ${dis}>＋ Ajouter un rappel</button>
        <div class="fld"><label>Prévenir par défaut sur</label><div class="chs">${Object.entries(CHN).map(([k, [i, l]]) => `<label><input type="checkbox" data-sl="default_channels" value="${k}" ${d.default_channels.includes(k) ? "checked" : ""} ${dis}> ${i} ${l}</label>`).join("")}</div></div>
        ${fld("Heure des rappels pour les événements « toute la journée »", `<input type="time" data-s="allday_time" value="${d.allday_time}" style="width:130px" ${dis}><div class="hint">Un rappel « 1 jour avant » part la veille à cette heure.</div>`)}</div>`;
    } else if (S.tab === "notif") {
      h = `${S.admin ? "" : `<div class="hint">Seul un administrateur peut modifier ces réglages.</div>`}
        <div class="card"><div class="ch"><h3>Notifications</h3>${sw("notifications_enabled", "Activer les notifications")}</div><div class="hint">Reçois tes rappels sur ton téléphone, ton Alexa ou ta messagerie. Choisis un ou plusieurs systèmes ci-dessous.</div></div>
        <div class="card"><div class="ch"><h3>Application Home Assistant (notify)</h3>${sw("ha_enabled")}${tst("ha")}</div><div class="hint">Les téléphones avec l'app Companion apparaissent sous la forme notify.mobile_app_…</div>
          ${list("ha_services", services.filter(s => !s.startsWith("notify.alexa_media")))}${fld("Autre service notify (ex. notify.mon_service)", `<input data-s="ha_custom" value="${esc(d.ha_custom)}" ${dis}>`)}</div>
        <div class="card"><div class="ch"><h3>Alexa (Alexa Media Player)</h3>${sw("alexa_enabled")}${tst("alexa")}</div><div class="hint">Choisis un appareil précis (notify.alexa_media_salon…). Les rappels sont lus à voix haute.</div>
          ${list("alexa_services", services.filter(s => s.startsWith("notify.alexa_media")))}
          <div class="r2">${fld("Mode", `<select data-s="alexa_type" ${dis}><option value="tts" ${d.alexa_type === "tts" ? "selected" : ""}>Parler (tts)</option><option value="announce" ${d.alexa_type === "announce" ? "selected" : ""}>Annonce (announce)</option></select>`)}
          ${fld("Heures silencieuses", `<div class="line"><label><input type="checkbox" data-s="alexa_quiet" ${d.alexa_quiet ? "checked" : ""} ${dis}> de</label><input type="time" data-s="alexa_quiet_start" value="${d.alexa_quiet_start}" style="width:105px" ${dis}> à <input type="time" data-s="alexa_quiet_end" value="${d.alexa_quiet_end}" style="width:105px" ${dis}></div>`)}</div></div>
        <div class="card"><div class="ch"><h3>Discord</h3>${sw("discord_enabled")}${tst("discord")}</div><div class="hint">Salon Discord → Modifier le salon → Intégrations → Webhooks → Nouveau webhook → Copier l'URL.</div>
          ${fld("URL du webhook", secret("discord_webhook", "https://discord.com/api/webhooks/…"))}${fld("Nom affiché", `<input data-s="discord_username" value="${esc(d.discord_username)}" ${dis}>`)}
          ${fld("Mention pour les rappels importants et urgents (optionnel)", `<input data-s="discord_mention" value="${esc(d.discord_mention)}" placeholder="@here  ou  <@123456789>" ${dis}>`)}</div>
        <div class="card"><div class="ch"><h3>Telegram</h3>${sw("telegram_enabled")}${tst("telegram")}</div><div class="hint">1) Crée un bot avec @BotFather et copie son token. 2) Envoie-lui un message depuis ton compte. 3) Clique sur « Trouver mon chat ID ».</div>
          ${fld("Token du bot", secret("telegram_token", "123456:ABC…"))}${fld("Chat ID", `<input data-s="telegram_chat_id" value="${esc(d.telegram_chat_id)}" ${dis}>`)}<div style="margin-top:8px"><button class="btn" data-act="tgFind" ${dis}>Trouver mon chat ID</button></div></div>`;
    } else if (S.tab === "cals") {
      h = `<div class="card"><div class="ch"><h3>Mes calendriers</h3><button class="btn pri" data-act="calAdd">＋ Ajouter</button></div><div class="hint">Un calendrier regroupe des événements et leur donne une couleur (travail, famille, anniversaires…).</div>
        ${S.cals.map(c => `<div class="calrow"><input type="color" data-cal="${c.id}" data-f="color" value="${c.color}"><input data-cal="${c.id}" data-f="name" value="${esc(c.name)}"><button class="btn ib danger" data-act="calDel" data-id="${c.id}" title="Supprimer">🗑</button></div>`).join("")}</div>`;
    } else {
      h = `<div class="card"><div class="ch"><h3>Exporter</h3><button class="btn" data-act="export">Télécharger (.ics)</button></div><div class="hint">Fichier compatible Google Agenda, Outlook, Apple Calendrier. Répétitions, exceptions et rappels inclus.</div></div>
        <div class="card"><div class="ch"><h3>Importer un fichier .ics</h3></div>${fld("Calendrier de destination", `<select id="imp_cal">${S.cals.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select>`)}${fld("Fichier", `<input type="file" id="icsfile" accept=".ics,text/calendar">`)}</div>
        ${S.admin ? `<div class="card"><div class="ch"><h3>Reprendre l'ancien add-on</h3></div><div class="hint">Copie calendar.db de l'add-on vers /config puis lance l'import (le dossier doit être autorisé dans allowlist_external_dirs, /config l'est par défaut).</div>${fld("Chemin de la base", `<div class="line"><input id="sqlpath" value="/config/calendar.db" style="flex:1"><button class="btn" data-act="sqlite">Importer</button></div>`)}</div>` : ""}`;
    }
    const foot = ["rem", "notif"].includes(S.tab) ? `<div class="foot"><button class="btn pri" data-act="saveSet" ${dis}>Enregistrer</button></div>` : "";
    w.hidden = false;
    w.innerHTML = `<div class="set"><div class="sh"><h2>Réglages</h2><button class="btn" data-act="closeSet">Fermer</button></div>
      <div class="pills">${tabs.map(([k, l]) => `<button class="pill ${S.tab === k ? "on" : ""}" data-act="tab" data-k="${k}">${l}</button>`).join("")}</div>${h}${foot}</div>`;
    w.scrollTop = keep;
  }
}

customElements.define("calendrier-perso-panel", CalendrierPanel);
