#!/usr/bin/env python3
"""Derin Kazı sunucusu: oyunu evdeki Wi-Fi'a sunar ve ortak maden dünyasını tutar.

Açınca telefonun bağlanacağı adresi yazar. Mac, Windows ve Linux'ta çalışır (sadece Python 3 gerekir).
Karakterler sunucuda saklanır: başka bilgisayara geçince data/ klasörünü de taşı.

- Her madenin tek bir ortak seferi vardır: herkes aynı katmanlara vurur.
- Katman patlayınca bonus, o katmana verilen hasar payına göre paylaşılır.
- Maden bitince toplam hasar payına göre ganimet dağılır ve maden yeni seferle baştan açılır.
- Karakterler kullanıcı adıyla saklanır: aynı adla başka cihazdan girilince aynı karakter açılır.
- Kayıtlar data/ klasöründedir. Katman canı kuralları config.json'dadır (oyunla ortak).
"""
import http.server
import json
import math
import os
import secrets
import socket
import socketserver
import threading
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('PORT', '8765'))
DATA = os.environ.get('DATA_DIR', os.path.join(ROOT, 'data'))
PLAYERS = os.path.join(DATA, 'players')
WORLD_FILE = os.path.join(DATA, 'world.json')
FILES = {'/', '/index.html', '/styles.css', '/game.js', '/config.json', '/manifest.webmanifest', '/sw.js'}
ICONS = {'/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png'}
MAX_BODY = 1024 * 1024
PRESENCE_TTL = 15      # saniye: bu kadar ses gelmeyen oyuncu haritadan kalkar
INBOX_MAX = 600        # çevrimdışı oyuncu için bekleyen ödül olayı sınırı
NAME_CHARS = set('abcçdefgğhıijklmnoöpqrsştuüvwxyz0123456789_-')

with open(os.path.join(ROOT, 'config.json'), encoding='utf-8') as f:
    CFG = json.load(f)
MINES = CFG['mines']

lock = threading.RLock()
sessions = {}   # anahtar -> oturum jetonu (en son giren cihaz geçerli)
presence = {}   # anahtar -> {'name', 'pos', 't'}
state = {'dirty': False}


def tr_lower(s):
    return s.replace('İ', 'i').replace('I', 'ı').lower()


def parse_name(raw):
    name = str(raw or '').strip()
    key = tr_lower(name)
    if not 2 <= len(key) <= 16 or any(c not in NAME_CHARS for c in key):
        return None, None
    return name, key


def layer_hp(m, k):
    mine = MINES[m]
    return math.ceil(mine['hp0'] * mine['grow'] ** k * (2 if k == mine['layers'] - 1 else 1))


def fresh_mine(m, inst):
    return {'inst': inst, 'layer': 0, 'hp': layer_hp(m, 0), 'contrib': {}, 'total': {}}


def load_world():
    try:
        with open(WORLD_FILE, encoding='utf-8') as f:
            w = json.load(f)
        if w.get('v') != 2 or len(w.get('mines', [])) != len(MINES):
            raise ValueError('eski dünya biçimi')
        w.setdefault('inbox', {})
        w.setdefault('names', {})
        return w
    except (OSError, ValueError):
        return {'v': 2, 'mines': [fresh_mine(i, 1) for i in range(len(MINES))], 'inbox': {}, 'names': {}}


world = load_world()


def write_json(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(text)
    os.replace(tmp, path)


def saver():
    while True:
        time.sleep(2)
        with lock:
            if not state['dirty']:
                continue
            text = json.dumps(world, ensure_ascii=False)
            state['dirty'] = False
        write_json(WORLD_FILE, text)


def player_path(key):
    return os.path.join(PLAYERS, key.encode('utf-8').hex() + '.json')


def read_player(key):
    try:
        with open(player_path(key), encoding='utf-8') as f:
            return json.load(f).get('save')
    except (OSError, ValueError):
        return None


def write_player(key, name, save):
    write_json(player_path(key), json.dumps({'name': name, 'save': save, 't': time.time()}, ensure_ascii=False))


def push(key, ev):
    box = world['inbox'].setdefault(key, [])
    box.append(ev)
    if len(box) > INBOX_MAX:
        del box[:len(box) - INBOX_MAX]
    state['dirty'] = True


def take(key):
    box = world['inbox'].pop(key, [])
    if box:
        state['dirty'] = True
    return box


def break_layer(m):
    """Katman patladı: bonus payı dağıt; son katmansa maden biter, ganimet dağılır, maden yeniden açılır."""
    mine = world['mines'][m]
    inst, k = mine['inst'], mine['layer']
    tot = sum(mine['contrib'].values())
    n = len(mine['contrib'])
    for key, v in mine['contrib'].items():
        push(key, {'type': 'break', 'm': m, 'i': inst, 'k': k, 'share': v / tot if tot else 0, 'n': n})
    mine['contrib'] = {}
    mine['layer'] = k + 1
    if mine['layer'] < MINES[m]['layers']:
        mine['hp'] = layer_hp(m, mine['layer'])
        return
    tt = sum(mine['total'].values())
    nt = len(mine['total'])
    for key, v in mine['total'].items():
        push(key, {'type': 'clear', 'm': m, 'i': inst, 'share': v / tt if tt else 0, 'n': nt})
    world['mines'][m] = fresh_mine(m, inst + 1)


def apply_hits(key, hits):
    for h in hits[:400]:
        try:
            m = int(h['m'])
            dmg = float(h['dmg'])
        except (KeyError, TypeError, ValueError):
            continue
        if not 0 <= m < len(MINES) or not dmg > 0 or not math.isfinite(dmg):
            continue
        mine = world['mines'][m]
        if h.get('i') != mine['inst']:
            continue               # başka bir sefere (bitmiş madene) ait vuruş
        carry = bool(h.get('c'))   # çevrimdışı toplu hasar: katmanları delip geçer
        k = h.get('k')
        if not carry and isinstance(k, (int, float)) and abs(k - mine['layer']) > 1:
            continue
        E = dmg
        while E > 0:
            hp = mine['hp']
            dealt = min(E, hp)
            mine['contrib'][key] = mine['contrib'].get(key, 0) + dealt
            mine['total'][key] = mine['total'].get(key, 0) + dealt
            state['dirty'] = True
            if E < hp:
                mine['hp'] = hp - E
                break
            E = E - hp if carry else 0
            inst = mine['inst']
            break_layer(m)
            mine = world['mines'][m]
            if mine['inst'] != inst:
                break              # maden bitti: kalan güç yeni sefere geçmez


def world_view(key):
    out = []
    for m in world['mines']:
        c, t = m['contrib'], m['total']
        tot, tt = sum(c.values()), sum(t.values())
        out.append({'inst': m['inst'], 'layer': m['layer'], 'hp': m['hp'], 'n': len(c),
                    'my': c.get(key, 0) / tot if tot else 0, 'myTotal': t.get(key, 0) / tt if tt else 0})
    return {'mines': out}


def players_view(key):
    now = time.time()
    return [{'key': k, 'name': p['name'], 'pos': p.get('pos', {})}
            for k, p in presence.items() if k != key and now - p['t'] < PRESENCE_TTL]


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.webmanifest': 'application/manifest+json',
        '.js': 'text/javascript',
        '.json': 'application/json',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def clean_path(self):
        return self.path.split('?', 1)[0].split('#', 1)[0]

    def do_GET(self):
        path = self.clean_path()
        if path == '/api/hello':
            self.send_json({'ok': True, 'v': 2})
            return
        if path not in FILES and path not in ICONS:
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        if self.clean_path() not in FILES and self.clean_path() not in ICONS:
            self.send_error(404)
            return
        super().do_HEAD()

    def do_POST(self):
        path = self.clean_path()
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if n > MAX_BODY:
                self.send_json({'error': 'buyuk'}, 413)
                return
            body = json.loads(self.rfile.read(n) or b'{}')
            if not isinstance(body, dict):
                raise ValueError
        except (ValueError, OSError):
            self.send_json({'error': 'bozuk'}, 400)
            return
        if path == '/api/login':
            self.login(body)
        elif path == '/api/sync':
            self.sync(body)
        elif path == '/api/save':
            self.save(body)
        else:
            self.send_error(404)

    def end_headers(self):
        # Güncellemeler telefona hemen gelsin
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, *args):
        pass

    def send_json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def auth(self, body):
        key = body.get('key')
        with lock:
            cur = sessions.get(key)
        if cur is None:
            return None, 'relogin'          # sunucu yeniden başlamış: sessizce tekrar gir
        if cur != body.get('token'):
            return None, 'session'          # aynı karakter başka cihazda açılmış
        return key, None

    def login(self, body):
        name, key = parse_name(body.get('name'))
        if not key:
            self.send_json({'error': 'ad'}, 400)
            return
        save = read_player(key)
        token = secrets.token_hex(12)
        with lock:
            sessions[key] = token
            display = world['names'].get(key) or name
            world['names'][key] = display
            state['dirty'] = True
            resp = {'ok': True, 'name': display, 'key': key, 'token': token, 'save': save,
                    'world': world_view(key), 'players': players_view(key), 'events': take(key)}
        self.send_json(resp)

    def sync(self, body):
        key, err = self.auth(body)
        if err:
            self.send_json({'error': err}, 409 if err == 'session' else 401)
            return
        with lock:
            p = presence.setdefault(key, {'name': world['names'].get(key, key)})
            pos = body.get('pos')
            p['pos'] = pos if isinstance(pos, dict) else {}
            p['t'] = time.time()
            hits = body.get('hits')
            if isinstance(hits, list) and hits:
                apply_hits(key, hits)
            resp = {'world': world_view(key), 'players': players_view(key), 'events': take(key)}
            name = world['names'].get(key, key)
        save = body.get('save')
        if isinstance(save, dict):
            write_player(key, name, save)
        self.send_json(resp)

    def save(self, body):
        key, err = self.auth(body)
        if err:
            self.send_json({'error': err}, 409 if err == 'session' else 401)
            return
        save = body.get('save')
        if isinstance(save, dict):
            with lock:
                name = world['names'].get(key, key)
                presence.pop(key, None)       # uygulamadan çıktı: haritadan kalksın
            write_player(key, name, save)
        self.send_json({'ok': True})


def lan_ip():
    """Evdeki ağdaki adres (telefon buna bağlanır). Hiçbir yere veri gönderilmez."""
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('10.255.255.255', 1))
        return probe.getsockname()[0]
    except OSError:
        return '127.0.0.1'
    finally:
        probe.close()


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


if __name__ == '__main__':
    threading.Thread(target=saver, daemon=True).start()
    with Server(('0.0.0.0', PORT), Handler) as httpd:
        host = socket.gethostname().split('.')[0]
        print(f'Derin Kazı yayında (kayıtlar: {DATA})', flush=True)
        print(f'  Bu bilgisayarda: http://localhost:{PORT}', flush=True)
        print(f'  Telefonda:       http://{lan_ip()}:{PORT}   (ya da http://{host}.local:{PORT})', flush=True)
        print('  Kapatmak için bu pencereyi kapat.', flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            with lock:
                text = json.dumps(world, ensure_ascii=False)
            write_json(WORLD_FILE, text)
