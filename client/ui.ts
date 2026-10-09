// Arayüz: menü, lobi, HUD, söylem çarkı, brifing, sonuç ekranı, gazete, ayar panelleri.

import { SLOT_LABEL, STACK_CSS, STACK_NAMES, type SlotId } from '../shared/constants';
import type { Gazette, LobbyAction } from '../shared/protocol';
import { TUNE_DEFS, TUNING_DEFAULTS, type Tuning } from '../shared/tuning';
import type { Input } from './input';
import { S, esc, saveSettings } from './state';
import { PAL } from './textures';

export interface UIActions {
  join(name: string): void;
  host(a: LobbyAction): void;
  lock(): void;
  tune(key: keyof Tuning, value: number): void;
  tuneReset(): void;
  volume(v: number): void;
  quality(q: 'low' | 'mid' | 'high'): void;
}

const ROLE_TITLE: Record<string, string> = { legs: 'Bacaklar', head: 'Kafa', handL: 'Sol El', handR: 'Sağ El', body: 'Beden (bacak + kafa)', hands: 'Eller' };

const kb = (s: string): string => `<span class="kbd">${s}</span>`;

const ROLE_HINT: Record<string, string> = {
  legs: `${kb('W')}${kb('A')}${kb('S')}${kb('D')} yürü · ${kb('Fare')} dön · ${kb('Shift')} koş · ${kb('Boşluk')} reverans<br/>Sen sadece yeri görürsün: Kafa yol tarif eder. Masaya çarpma; koşmak kibar toplumda hoş değil.`,
  head: `${kb('Fare')} bak · ${kb('Sol tık')} basılı: ağzı aç · ${kb('Q')} basılı: söylem çarkı (fareyle seç, bırakınca konuş)<br/>Her şeyi sen görürsün ama hiçbir şeye dokunamazsın: arkadaşlarına yön ver, Düşes'in sorularını yanıtla.`,
  body: `${kb('W')}${kb('A')}${kb('S')}${kb('D')} yürü · ${kb('Fare')} dön/bak · ${kb('Shift')} koş · ${kb('Boşluk')} reverans<br/>${kb('Sol tık')} basılı: ağzı aç · ${kb('Q')} basılı: söylem çarkı`,
  hand: `${kb('Fare')} eli oynat · ${kb('W')}${kb('S')} / tekerlek: ileri-geri · ${kb('Sol tık')} basılı: tut · ${kb('Sağ tık')}: tokat (dikkat!)<br/>Ağzın nerede olduğunu göremezsin: Kafa seni yönlendirir. Sıvıyı yavaş taşı.`,
  twohands: `${kb('Q')} sol el · ${kb('E')} sağ el · ${kb('R')} ikisi birden · ${kb('Fare')} oynat · ${kb('W')}${kb('S')} / tekerlek: ileri-geri · ${kb('Sol tık')} tut · ${kb('Sağ tık')} tokat<br/>Ağzın nerede olduğunu göremezsin: Kafa seni yönlendirir. Sıvıyı yavaş taşı.`,
  kid: `${kb('W')}${kb('A')}${kb('S')}${kb('D')} koş · ${kb('Shift')} hızlı koş · Paltoya dön ve hepiniz ${kb('E')} basılı tutun · yakalanan arkadaşın yanında ${kb('E')} ile onu kurtar`,
  spec: `Seyirci: ${kb('←')} ${kb('→')} ile yığın değiştir`,
};

function copyText(text: string): void {
  const done = (): void => undefined;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallback());
  } else fallback();
  function fallback(): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* yoksay */
    }
    ta.remove();
  }
}

export class UI {
  private screen: HTMLElement;
  private hud: HTMLElement;
  private tuningEl: HTMLElement;
  private settingsEl: HTMLElement;
  private wheelKey = '';
  private lastObj = '';
  private bannerT = 0;
  private hudAt = 0;
  tuningOpen = false;
  settingsOpen = false;
  photos = new Map<string, string[]>();

  constructor(
    private root: HTMLElement,
    private act: UIActions,
    private input: Input,
  ) {
    this.screen = document.createElement('div');
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.hidden = true;
    this.tuningEl = document.createElement('div');
    this.tuningEl.id = 'tuning';
    this.tuningEl.hidden = true;
    this.settingsEl = document.createElement('div');
    this.settingsEl.id = 'settings';
    this.settingsEl.hidden = true;
    const gear = document.createElement('button');
    gear.id = 'gear';
    gear.className = 'btn ghost small';
    gear.textContent = '⚙ Ayarlar';
    gear.dataset.act = 'settings';
    this.root.append(this.hud, this.screen, this.tuningEl, this.settingsEl, gear);
    this.buildHud();
    this.buildSettings();
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
  }

  // ------------------------------------------------------------ olaylar

  private onClick(e: MouseEvent): void {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el) return;
    const a = el.dataset.act!;
    switch (a) {
      case 'join': {
        const inp = this.root.querySelector<HTMLInputElement>('#nameinp');
        this.act.join((inp?.value ?? '').trim());
        break;
      }
      case 'start':
      case 'solo':
      case 'skip':
      case 'again':
      case 'lobby':
        this.act.host(a);
        break;
      case 'lock':
        this.act.lock();
        break;
      case 'invite':
        copyText(el.dataset.text ?? '');
        el.textContent = 'Kopyalandı!';
        setTimeout(() => (el.textContent = 'Bağlantıyı kopyala'), 1500);
        break;
      case 'report':
        copyText(S.report);
        el.textContent = 'Kopyalandı! Bana yapıştır';
        setTimeout(() => (el.textContent = 'Oturum raporunu kopyala'), 2000);
        break;
      case 'settings':
        this.toggleSettings();
        break;
      case 'tunereset':
        this.act.tuneReset();
        break;
    }
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.dataset.tune) {
      const key = el.dataset.tune as keyof Tuning;
      const v = Number(el.value);
      this.act.tune(key, v);
      const out = this.tuningEl.querySelector<HTMLElement>(`[data-val="${key}"]`);
      if (out) out.textContent = String(Math.round(v * 1000) / 1000);
    } else if (el.dataset.set) {
      switch (el.dataset.set) {
        case 'sens':
          S.settings.sens = Number(el.value);
          break;
        case 'volume':
          S.settings.volume = Number(el.value);
          this.act.volume(S.settings.volume);
          break;
        case 'tts':
          S.settings.tts = el.checked;
          break;
        case 'toggleGrip':
          S.settings.toggleGrip = el.checked;
          break;
        case 'hints':
          S.settings.hints = el.checked;
          break;
        case 'quality':
          S.settings.quality = el.value as 'low' | 'mid' | 'high';
          this.act.quality(S.settings.quality);
          break;
      }
      saveSettings();
    }
  }

  // ------------------------------------------------------------ ekranlar

  setScreen(html: string, cls = ''): void {
    this.screen.className = 'screen ' + cls;
    this.screen.innerHTML = html;
    this.screen.hidden = html === '';
  }

  showMenu(): void {
    this.hud.hidden = true;
    const hostBadge = S.hostToken ? '<div class="muted" style="text-align:center;margin-top:10px">Ev sahibi olarak giriyorsun.</div>' : '';
    this.setScreen(`
      <div class="card narrow">
        <h1 class="title">Trençkot Kontu</h1>
        <p class="sub">Üç-dört kafadar, tek bir soylu.<br/>Sekiz kişi, iki Kont, sıfır utanç.</p>
        <input id="nameinp" type="text" maxlength="16" placeholder="Adın ne, misafir?" value="${esc(S.settings.name)}" autocomplete="off" />
        <div class="row center" style="margin-top:16px"><button class="btn big" data-act="join">Galaya Gir</button></div>
        ${hostBadge}
        <div class="err" id="menuerr">${esc(S.err)}</div>
      </div>`);
    const inp = this.root.querySelector<HTMLInputElement>('#nameinp');
    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.act.join(inp.value.trim());
    });
    inp?.focus();
  }

  renderLobby(): void {
    this.hud.hidden = true;
    const connected = S.players.filter((p) => p.connected);
    const n = connected.length;
    const invite = S.me.host ? S.publicUrl ?? location.origin : '';
    const list = connected
      .map(
        (p) =>
          `<li><span class="dot" style="background:#${PAL.player[p.color % 8]!.toString(16).padStart(6, '0')}"></span>${esc(p.name)}${p.id === S.me.id ? ' <span class="tag">sen</span>' : ''}${p.host ? ' <span class="tag host">ev sahibi</span>' : ''}<span class="muted" style="margin-left:auto">${p.ping ? p.ping + ' ms' : ''}</span></li>`,
      )
      .join('');
    const sizes = n <= 4 ? [n] : [Math.ceil(Math.min(n, 8) / 2), Math.floor(Math.min(n, 8) / 2)];
    const plan = n === 0 ? '' : n === 1 ? 'Tek kişi: hepsi sende (Tab ile rol değiştirirsin).' : sizes.map((s, i) => `<b style="color:${STACK_CSS[i]}">${STACK_NAMES[i]}</b>: ${s} kişi`).join(' · ') + (n > 8 ? ` · ${n - 8} seyirci` : '');
    this.setScreen(`
      <div class="card">
        <h1 class="title" style="font-size:40px">Salon</h1>
        <p class="sub">Bu gece: Karşılama → Akşam Yemeği → Vals</p>
        <div class="grid2">
          <div class="stackbox">
            <h3>Misafirler (${n}/12)</h3>
            <ul class="plist">${list}</ul>
            <p class="muted" style="margin:10px 0 0">${plan}</p>
          </div>
          <div class="stackbox">
            ${
              S.me.host
                ? `<h3>Arkadaşlarını çağır</h3>
                   <div class="invite">${esc(invite)}</div>
                   <div class="row" style="margin-top:8px"><button class="btn small" data-act="invite" data-text="${esc(invite)}">Bağlantıyı kopyala</button></div>
                   <p class="muted">Arkadaşların sadece bu bağlantıyı açar; kurulum yok. Sesli konuşmak için Discord'da her Kont'a ayrı kanal açın.</p>`
                : `<h3>Hazır mısın?</h3><p class="muted">Ev sahibi geceyi başlatınca roller rastgele dağıtılır. Her sahnede roller kayar: herkes her uzvu yönetir.</p>`
            }
            <p class="muted" style="margin-top:12px">Fare ve klavye gerekli. İlk tıkta fare kilitlenir (Esc ile çıkarsın).</p>
          </div>
        </div>
        <div class="row center" style="margin-top:18px">
          ${
            S.me.host
              ? `<button class="btn big" data-act="start" ${n < 1 ? 'disabled' : ''}>Geceyi Başlat</button>
                 <button class="btn ghost" data-act="solo">Tek başıma dene</button>`
              : `<span class="muted">Ev sahibi başlatınca oyun açılır…</span>`
          }
        </div>
      </div>`);
  }

  renderBriefing(): void {
    const sc = S.scene;
    if (!sc) return;
    this.hud.hidden = false;
    const cards: string[] = [];
    for (const a of S.assign) {
      const col = STACK_CSS[a.stack] ?? '#fff';
      const by = new Map<number, string[]>();
      (['legs', 'handL', 'handR', 'head'] as SlotId[]).forEach((s) => {
        const id = a.slots[s];
        if (!id) return;
        const arr = by.get(id) ?? [];
        arr.push(SLOT_LABEL[s]);
        by.set(id, arr);
      });
      const rows = Array.from(by.entries())
        .map(([id, roles]) => {
          const p = S.players.find((x) => x.id === id);
          return `<div class="rc ${id === S.me.id ? 'me' : ''}"><b>${esc(roles.join(' + '))}</b>${esc(p?.name ?? '?')}${id === S.me.id ? ' (sen)' : ''}</div>`;
        })
        .join('');
      cards.push(`<div><h3 style="color:${col}">${esc(STACK_NAMES[a.stack] ?? '')}</h3><div class="rolecard">${rows}</div></div>`);
    }
    const mine = S.myStack >= 0 ? '' : '<p class="muted">Bu gece seyircisin: ← → ile yığın değiştir.</p>';
    this.setScreen(
      `<div class="card" style="max-width:860px">
        <h2>${sc.index + 1}/${sc.total} · ${esc(sc.title)}</h2>
        <p>${esc(sc.intro)}</p>
        <p class="muted">${esc(sc.hint)}</p>
        ${cards.join('')}${mine}
        <div class="countdown" id="cd">8</div>
        ${S.me.host ? '<div class="row center"><button class="btn small ghost" data-act="skip">Hemen başlat</button></div>' : ''}
      </div>`,
      'clear',
    );
  }

  renderResult(): void {
    const r = S.result;
    if (!r) return;
    const rows = r.stacks
      .map((s) => `<tr><td style="color:${STACK_CSS[s.stack]}">${esc(STACK_NAMES[s.stack] ?? '')}</td><td class="${s.success ? 'ok' : 'no'}">${s.success ? 'Başarılı' : 'Olmadı'}</td><td>${s.bursts} patlama</td><td>tepe Şüphe %${s.peak}</td><td><b>${s.score}</b> puan</td></tr>`)
      .join('');
    this.setScreen(
      `<div class="card" style="max-width:820px">
        <h2>${esc(r.title)}: ${r.success ? 'Tamamlandı!' : 'Rezil bir akşam'}</h2>
        ${r.lines.map((l) => `<p style="margin:4px 0">${esc(l)}</p>`).join('')}
        <table class="sc">${rows}</table>
        <p class="muted" style="margin-top:12px">${S.resultNext ? 'Sıradaki sahneye geçiliyor… Roller kayıyor: herkes başka bir uzvu yönetecek.' : 'Gece bitti: gazete hazırlanıyor…'}</p>
        ${S.me.host ? '<div class="row center"><button class="btn small" data-act="skip">Devam</button></div>' : ''}
      </div>`,
      'clear',
    );
    this.input.releaseLock();
  }

  renderNight(g: Gazette): void {
    this.hud.hidden = true;
    this.input.releaseLock();
    // Önce habere uygun fotoğraf; yoksa gecenin kullanılmamış en yeni fotoğrafı (hiç yoksa boş)
    const used = new Set<string>();
    const spare = (): string => {
      for (const list of Array.from(this.photos.values()).reverse()) for (let i = list.length - 1; i >= 0; i--) if (!used.has(list[i]!)) return list[i]!;
      return '';
    };
    const photoFor = (kind?: string): string => {
      if (!kind) return '';
      const list = this.photos.get(kind);
      const pick = list && list.length > 0 ? list[list.length - 1]! : '';
      const ph = pick && !used.has(pick) ? pick : spare();
      if (ph) used.add(ph);
      return ph;
    };
    const hlPhoto = photoFor(g.headline.photo);
    const stories = g.stories
      .map((s) => {
        const ph = photoFor(s.photo);
        return `<div class="story">${ph ? `<div class="photo sp"><img src="${ph}" alt=""/></div>` : ''}<h4>${esc(s.head)}</h4><div class="body">${esc(s.body)}</div></div>`;
      })
      .join('');
    const win = g.scores.find((x) => x.stack === g.winner);
    this.setScreen(
      `<div class="paper">
        <div class="mast"><h1>Sosyete Gazetesi</h1></div>
        <div class="meta"><span>Sayı ${g.issue}</span><span>${esc(g.date)}</span><span>Fiyatı: bir monokl</span></div>
        <div class="hl">${esc(g.headline.head)}</div>
        <div class="lead">
          <div>
            ${hlPhoto ? `<div class="photo"><img src="${hlPhoto}" alt=""/></div><div class="cap">Fotoğraf: olay anının hemen ardından, bir misafirin gözünden.</div>` : '<div class="photo empty">(Fotoğraf makinesi şapkaya takıldı)</div>'}
          </div>
          <div class="body">${esc(g.headline.body)}<div class="box" style="margin-top:12px"><h5>${esc(g.award.title)}</h5>${esc(g.award.text)}</div></div>
        </div>
        <div class="cols">
          ${stories}
          <div class="box"><h5>Gecenin skoru</h5><table>${g.scores
            .map((s) => `<tr><td style="color:#000">${esc(s.name)}${s.stack === g.winner ? ' ★' : ''}</td><td>${s.bursts} patlama</td><td>${s.score}</td></tr>`)
            .join('')}</table>${win ? `<div style="margin-top:6px">Kupa: <b>${esc(win.name)}</b></div>` : ''}</div>
          <div class="box"><h5>Hava durumu</h5>${esc(g.weather)}</div>
          <div class="box"><h5>Küçük ilanlar</h5>${g.ads.map((a) => `<div class="ad">${esc(a)}</div>`).join('')}</div>
        </div>
        <div class="row center" style="margin-top:12px">
          <button class="btn" data-act="report">Oturum raporunu kopyala</button>
          ${S.me.host ? '<button class="btn ghost" style="color:#1a1410;box-shadow:inset 0 0 0 2px #1a1410" data-act="again">Yeni gece</button>' : '<span class="muted" style="color:#3a2f20">Ev sahibi yeni geceyi açınca lobiye döneriz.</span>'}
        </div>
      </div>`,
      '',
    );
  }

  // ------------------------------------------------------------ HUD

  private buildHud(): void {
    this.hud.innerHTML = `
      <div id="hud-tl" class="panel"><div class="scene" id="h-scene"></div><div class="timer" id="h-timer"></div><div id="objs"></div></div>
      <div id="banner" hidden></div>
      <div id="hud-tr"></div>
      <div id="hud-bl" class="panel"><div class="role" id="h-role"></div><div class="hint" id="h-hint"></div></div>
      <div id="hud-br" class="panel"></div>
      <div id="cross"></div>
      <div id="feed"></div>
      <div id="restack" class="panel" hidden></div>
      <div id="wheel" hidden><div class="core" id="w-core"></div><div id="wheelptr"></div></div>
      <div id="netwarn" hidden>Bağlantı koptu, yeniden deneniyor…</div>
      <div id="perf"></div>
      <div id="lockhint" hidden data-act="lock">Oynamak için tıkla<small>Fare kilitlenir · Esc ile çıkarsın</small></div>`;
  }

  showHud(show: boolean): void {
    this.hud.hidden = !show;
  }

  setLocked(locked: boolean): void {
    const el = this.hud.querySelector<HTMLElement>('#lockhint')!;
    el.hidden = locked || (S.phase !== 'playing' && S.phase !== 'briefing');
  }

  feed(text: string, cls: 'bad' | 'good' | 'info'): void {
    const f = this.hud.querySelector<HTMLElement>('#feed')!;
    const d = document.createElement('div');
    d.className = 'f ' + cls;
    d.textContent = text;
    f.appendChild(d);
    while (f.children.length > 5) f.firstElementChild?.remove();
    setTimeout(() => d.remove(), 3600);
  }

  banner(text: string): void {
    const b = this.hud.querySelector<HTMLElement>('#banner')!;
    b.textContent = text;
    b.hidden = false;
    b.style.opacity = '1';
    this.bannerT = performance.now() + 6500;
  }

  onHud(): void {
    this.hudAt = performance.now();
    const h = S.hud;
    if (!h) return;
    // Şüphe çubukları
    const tr = this.hud.querySelector<HTMLElement>('#hud-tr')!;
    tr.innerHTML = h.stacks
      .map((s, i) => {
        const lives = Math.max(0, s.maxBursts - s.bursts);
        const col = STACK_CSS[i] ?? '#fff';
        const mine = i === S.myStack || (S.myStack < 0 && i === S.spectateStack);
        return `<div class="panel susp ${mine ? 'mine' : ''} ${s.susp > 75 ? 'danger' : ''}" style="border-left-color:${col}">
          <div class="nm"><span style="color:${col}">${esc(STACK_NAMES[i] ?? '')}</span><span>${'♥'.repeat(lives)}<span style="opacity:.25">${'♥'.repeat(Math.max(0, s.maxBursts - lives))}</span> · ${s.score}p</span></div>
          <div class="bar"><i style="width:${Math.min(100, s.susp)}%"></i></div>
          <div class="muted" style="font-size:11px">ŞÜPHE ${Math.round(s.susp)}%${s.mode === 'burst' ? ' · PALTO PATLADI' : ''}</div>
        </div>`;
      })
      .join('');
    // hedefler (benim yığınım)
    const mine = h.stacks[S.myStack >= 0 ? S.myStack : S.spectateStack];
    const key = JSON.stringify(mine?.obj ?? []);
    if (key !== this.lastObj) {
      this.lastObj = key;
      this.hud.querySelector<HTMLElement>('#objs')!.innerHTML = (mine?.obj ?? [])
        .map((o) => `<div class="o ${o.done ? 'done' : ''}"><i>${o.done ? '✔' : '◇'}</i><span>${esc(o.text)}</span>${o.prog ? `<em>${esc(o.prog)}</em>` : ''}</div>`)
        .join('');
    }
    // yeniden yığılma paneli
    const rs = this.hud.querySelector<HTMLElement>('#restack')!;
    if (mine && mine.mode === 'burst' && S.inKidMode) {
      rs.hidden = false;
      rs.innerHTML = `<div style="font-size:20px;color:var(--gold2)">PALTO PATLADI!</div>
        <div>Tüm çaylaklar paltoya dönsün ve ${kb('E')} basılı tutsun · yakalananı ${kb('E')} ile kurtar</div>
        <div class="bar"><i style="width:${Math.round(mine.restack * 100)}%"></i></div>`;
    } else rs.hidden = true;
    if (h.banner) this.banner(h.banner);
  }

  /** Her kare. */
  frame(nowMs: number, fps: number, snapRate: number, view: string): void {
    const h = S.hud;
    // zamanlayıcı
    const timer = this.hud.querySelector<HTMLElement>('#h-timer')!;
    if (h && h.time >= 0) {
      const left = Math.max(0, h.time - (nowMs - this.hudAt) / 1000);
      const m = Math.floor(left / 60);
      const s = Math.floor(left % 60);
      timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
      timer.style.color = left < 30 ? 'var(--bad)' : '';
    } else timer.textContent = '';
    if (S.scene) this.hud.querySelector<HTMLElement>('#h-scene')!.textContent = `${S.scene.index + 1}/${S.scene.total} · ${S.scene.title}`;
    // banner solması
    const b = this.hud.querySelector<HTMLElement>('#banner')!;
    if (!b.hidden && nowMs > this.bannerT) {
      b.style.opacity = '0';
      if (nowMs > this.bannerT + 500) b.hidden = true;
    }
    // brifing geri sayımı
    const cd = this.root.querySelector<HTMLElement>('#cd');
    if (cd) cd.textContent = String(Math.max(0, Math.ceil((S.briefingUntil - nowMs) / 1000)));
    // rol kartı
    this.updateRole();
    // Şüphe vinyeti
    const mine = h?.stacks[S.myStack >= 0 ? S.myStack : S.spectateStack];
    const vg = document.getElementById('vignette')!;
    const danger = mine ? Math.max(0, (mine.susp - 50) / 50) : 0;
    vg.style.setProperty('--danger', String(danger));
    vg.className = (view === 'hands' ? 'hands ' : view === 'legs' ? 'legs ' : '') + (danger > 0.05 ? 'danger' : '');
    // çark
    this.updateWheel();
    // rakip bilgisi
    this.hud.querySelector<HTMLElement>('#netwarn')!.hidden = S.connected;
    this.hud.querySelector<HTMLElement>('#perf')!.textContent = `${Math.round(fps)} fps · ${Math.round(S.rtt)} ms · ${snapRate.toFixed(0)} snap/sn`;
    this.hud.querySelector<HTMLElement>('#cross')!.style.display = S.inKidMode || view === 'orbit' ? 'none' : '';
  }

  private updateRole(): void {
    const role = this.hud.querySelector<HTMLElement>('#h-role')!;
    const hint = this.hud.querySelector<HTMLElement>('#h-hint')!;
    const panel = this.hud.querySelector<HTMLElement>('#hud-bl')!;
    panel.hidden = !S.settings.hints;
    if (S.inKidMode) {
      role.textContent = 'Çaylak';
      hint.innerHTML = ROLE_HINT.kid!;
      return;
    }
    if (S.myStack < 0) {
      role.textContent = 'Seyirci';
      hint.innerHTML = ROLE_HINT.spec!;
      return;
    }
    const g = this.input.group;
    let name = ROLE_TITLE[g] ?? g;
    let text = '';
    if (g === 'hands') {
      const both = this.input.twoHanded();
      const ah = this.input.activeHand;
      name = both ? `Eller (aktif: ${ah === 2 ? 'ikisi' : ah === 0 ? 'sol' : 'sağ'})` : S.mySlots.includes('handL') ? 'Sol El' : 'Sağ El';
      text = both ? ROLE_HINT.twohands! : ROLE_HINT.hand!;
    } else text = ROLE_HINT[g] ?? '';
    const multi = this.input.groups().length > 1;
    role.textContent = name;
    hint.innerHTML = text + (multi ? `<br/>${kb('Tab')} rol değiştir (${this.input.groups().map((x) => ROLE_TITLE[x]).join(' / ')})` : '') + `<br/><span class="muted">${kb('H')} ipuçlarını gizle · ${kb('M')} sesi kapat</span>`;
    // kimin kimi yönettiği
    const br = this.hud.querySelector<HTMLElement>('#hud-br')!;
    const a = S.assign.find((x) => x.stack === S.myStack);
    if (a) {
      br.innerHTML =
        `<h3 style="margin:0 0 4px">Yığınım</h3>` +
        (['legs', 'handL', 'handR', 'head'] as SlotId[])
          .map((s) => {
            const p = S.players.find((x) => x.id === a.slots[s]);
            return `<div class="who"><span>${SLOT_LABEL[s]}</span><b>${esc(p?.name ?? '-')}</b></div>`;
          })
          .join('');
    } else br.innerHTML = '';
  }

  // ------------------------------------------------------------ çark

  private updateWheel(): void {
    const w = this.hud.querySelector<HTMLElement>('#wheel')!;
    const open = this.input.wheelOpen;
    w.hidden = !open;
    if (!open) {
      this.wheelKey = '';
      return;
    }
    const data = S.wheel.find((x) => x.stack === S.myStack);
    const key = data ? data.q + '|' + data.phrases.map((p) => p.i).join(',') : '';
    if (key !== this.wheelKey) {
      this.wheelKey = key;
      w.querySelectorAll('.w').forEach((n) => n.remove());
      const core = w.querySelector<HTMLElement>('#w-core')!;
      core.innerHTML = data?.q ? `<div><div class="muted" style="font-size:11px;letter-spacing:.1em">SORU</div><b>${esc(data.q)}</b></div>` : '<span class="muted">Ne söylemeli?</span>';
      (data?.phrases ?? []).forEach((p, k) => {
        const a = (k / 6) * Math.PI * 2;
        const d = document.createElement('div');
        d.className = 'w';
        d.dataset.k = String(k);
        d.style.left = `${Math.sin(a) * 215}px`;
        d.style.top = `${-Math.cos(a) * 150}px`;
        d.textContent = p.text;
        w.appendChild(d);
      });
    }
    w.querySelectorAll<HTMLElement>('.w').forEach((n) => n.classList.toggle('sel', Number(n.dataset.k) === this.input.wheelSel));
    const ptr = w.querySelector<HTMLElement>('#wheelptr')!;
    ptr.style.left = `${this.input.wheelVec.x}px`;
    ptr.style.top = `${this.input.wheelVec.y}px`;
  }

  // ------------------------------------------------------------ paneller

  toggleTuning(force?: boolean): void {
    if (!S.me.host) return;
    this.tuningOpen = force ?? !this.tuningOpen;
    this.tuningEl.hidden = !this.tuningOpen;
    if (this.tuningOpen) {
      this.input.releaseLock();
      this.renderTuning();
    }
  }

  renderTuning(): void {
    let last = '';
    let html = `<h2 style="margin:0 0 4px">Ayarlar (canlı)</h2><div class="muted">Ev sahibi değiştirir, herkese yansır. Oturum raporuna yazılır.</div><div class="row" style="margin:8px 0"><button class="btn small ghost" data-act="tunereset">Varsayılana dön</button></div>`;
    for (const d of TUNE_DEFS) {
      if (d.group !== last) {
        html += `<div class="tg">${esc(d.group)}</div>`;
        last = d.group;
      }
      const v = S.tuning[d.key];
      const changed = Math.abs(v - TUNING_DEFAULTS[d.key]) > 1e-9;
      html += `<div class="tr"><span${changed ? ' style="color:var(--gold2)"' : ''}>${esc(d.label)}</span><span class="v" data-val="${d.key}">${Math.round(v * 1000) / 1000}</span><input type="range" data-tune="${d.key}" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}"/></div>`;
    }
    this.tuningEl.innerHTML = html;
  }

  toggleSettings(): void {
    this.settingsOpen = !this.settingsOpen;
    this.settingsEl.hidden = !this.settingsOpen;
    if (this.settingsOpen) this.input.releaseLock();
  }

  private buildSettings(): void {
    const s = S.settings;
    this.settingsEl.innerHTML = `
      <h3>Ayarlar</h3>
      <label>Fare hassasiyeti<input type="range" data-set="sens" min="0.3" max="2.5" step="0.05" value="${s.sens}"/></label>
      <label>Ses<input type="range" data-set="volume" min="0" max="1" step="0.05" value="${s.volume}"/></label>
      <label><span><input type="checkbox" data-set="tts" ${s.tts ? 'checked' : ''}/> Konuşan NPC sesleri (tarayıcı TTS)</span></label>
      <label><span><input type="checkbox" data-set="toggleGrip" ${s.toggleGrip ? 'checked' : ''}/> Tutma: bas-bırak yerine aç/kapa</span></label>
      <label><span><input type="checkbox" data-set="hints" ${s.hints ? 'checked' : ''}/> Kontrol ipuçlarını göster</span></label>
      <label>Grafik kalitesi<select data-set="quality"><option value="low">Düşük</option><option value="mid">Orta</option><option value="high">Yüksek</option></select></label>`;
    const sel = this.settingsEl.querySelector<HTMLSelectElement>('select')!;
    sel.value = s.quality;
  }
}
