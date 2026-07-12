'use client';

import { useMemo, useState } from 'react';
import {
  Users, Gavel, Dices, Settings, Eye, ShieldCheck,
  Trophy, Coins, Clock3, Radio, UserRoundCog, LogIn
} from 'lucide-react';

const samplePlayers = [
  { id: 1, name: '정우', tier: '마스터', main: 'TOP', sub: 'JUG', status: '대기' },
  { id: 2, name: '대현', tier: '챌린저', main: 'JUG', sub: 'TOP', status: '대기' },
  { id: 3, name: '준휘', tier: '마스터', main: 'MID', sub: 'ADC', status: '대기' },
  { id: 4, name: '수민', tier: '에메랄드', main: 'ADC', sub: 'MID', status: '대기' },
  { id: 5, name: '지훈', tier: '마스터', main: 'SUP', sub: 'JUG', status: '대기' }
];

const sampleTeams = [
  { id: 1, name: '1팀', points: 1000, roster: [] },
  { id: 2, name: '2팀', points: 1000, roster: [] },
  { id: 3, name: '3팀', points: 1000, roster: [] },
  { id: 4, name: '4팀', points: 1000, roster: [] },
  { id: 5, name: '5팀', points: 1000, roster: [] }
];

function BrandMark() {
  return (
    <div className="brand-mark">
      <span className="brand-dot top" />
      <span className="brand-line" />
      <span className="brand-dot bottom" />
    </div>
  );
}

function AppShell({ children, active, setActive }) {
  const menu = [
    ['auction', Gavel, '실시간 경매'],
    ['players', Users, '선수 관리'],
    ['roulette', Dices, '랜덤 룰렛'],
    ['watch', Eye, '관전자 화면'],
    ['settings', Settings, '설정']
  ];

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <BrandMark />
          <div>
            <strong>고추밭</strong>
            <small>AUCTION SYSTEM</small>
          </div>
        </div>

        <nav>
          {menu.map(([id, Icon, label]) => (
            <button
              key={id}
              className={active === id ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <Radio size={16} />
          <div>
            <b>방송 모드</b>
            <small>OBS 전용 화면 준비 중</small>
          </div>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GOCHUBAT TOURNAMENT</span>
            <h1>제3회 관동지방컵</h1>
          </div>
          <div className="top-actions">
            <span className="live-pill"><i /> 준비 중</span>
            <button className="ghost-btn"><UserRoundCog size={17} /> 운영자</button>
          </div>
        </header>
        {children}
      </section>
    </main>
  );
}

function AuctionView({ players, teams }) {
  const [currentId, setCurrentId] = useState(players[0]?.id ?? null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [price, setPrice] = useState(0);
  const current = players.find((p) => p.id === currentId);

  const bid = (amount) => {
    if (!selectedTeam) return;
    setPrice((v) => v + amount);
  };

  return (
    <div className="page-grid">
      <section className="panel auction-stage">
        <div className="panel-title">
          <div><span>LIVE AUCTION</span><h2>현재 경매 선수</h2></div>
          <span className="round-chip">ROUND 01</span>
        </div>

        <div className="player-focus">
          <div className="role-orb">{current?.main ?? '?'}</div>
          <div className="player-copy">
            <span className="tier-tag">{current?.tier ?? '선수 없음'}</span>
            <h3>{current?.name ?? '선수를 선택하세요'}</h3>
            <p>{current ? `${current.main} / ${current.sub}` : '선수 관리에서 등록하세요.'}</p>
          </div>
          <div className="timer-ring">
            <Clock3 size={18} />
            <strong>15</strong>
            <small>SEC</small>
          </div>
        </div>

        <div className="price-board">
          <span>현재 입찰가</span>
          <strong>{price.toLocaleString()} P</strong>
          <p>최고 입찰팀: {selectedTeam ? teams.find((t) => t.id === selectedTeam)?.name : '없음'}</p>
        </div>

        <div className="team-bids">
          {teams.map((team) => (
            <button
              key={team.id}
              onClick={() => setSelectedTeam(team.id)}
              className={selectedTeam === team.id ? 'team-bid selected' : 'team-bid'}
            >
              <span>{team.name}</span>
              <b>{team.points.toLocaleString()} P</b>
            </button>
          ))}
        </div>

        <div className="bid-actions">
          {[10, 20, 50, 100].map((amount) => (
            <button key={amount} onClick={() => bid(amount)}>+{amount}</button>
          ))}
        </div>

        <div className="admin-actions">
          <button className="success-btn"><Trophy size={17} /> 낙찰</button>
          <button className="danger-btn">유찰</button>
          <button>타이머 시작</button>
          <button>선수 상태 수정</button>
        </div>
      </section>

      <aside className="right-stack">
        <section className="panel">
          <div className="panel-title compact">
            <div><span>QUEUE</span><h2>경매 순서</h2></div>
            <b>{players.length}명</b>
          </div>
          <div className="queue-list">
            {players.map((p, index) => (
              <button
                key={p.id}
                className={currentId === p.id ? 'queue-row active' : 'queue-row'}
                onClick={() => setCurrentId(p.id)}
              >
                <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
                <div><b>{p.name}</b><small>{p.tier} · {p.main}/{p.sub}</small></div>
                <span className="status-dot" />
              </button>
            ))}
          </div>
        </section>

        <section className="panel team-overview">
          <div className="panel-title compact">
            <div><span>TEAM STATUS</span><h2>팀 현황</h2></div>
          </div>
          <div className="mini-teams">
            {teams.map((team) => (
              <div className="mini-team" key={team.id}>
                <div><b>{team.name}</b><small>{team.roster.length}명 영입</small></div>
                <strong>{team.points.toLocaleString()}P</strong>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function PlayersView({ players, setPlayers }) {
  const [form, setForm] = useState({ name: '', tier: '', main: 'TOP', sub: 'JUG' });

  const addPlayer = () => {
    if (!form.name.trim() || !form.tier.trim()) return;
    setPlayers((prev) => [...prev, {
      id: Date.now(),
      ...form,
      status: '대기'
    }]);
    setForm({ name: '', tier: '', main: 'TOP', sub: 'JUG' });
  };

  return (
    <section className="panel full-panel">
      <div className="panel-title">
        <div><span>PLAYER DATABASE</span><h2>선수 관리</h2></div>
        <b>{players.length}명 등록</b>
      </div>

      <div className="player-form">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="선수 이름" />
        <input value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })} placeholder="티어" />
        <select value={form.main} onChange={(e) => setForm({ ...form, main: e.target.value })}>
          {['TOP','JUG','MID','ADC','SUP'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <select value={form.sub} onChange={(e) => setForm({ ...form, sub: e.target.value })}>
          {['TOP','JUG','MID','ADC','SUP'].map((r) => <option key={r}>{r}</option>)}
        </select>
        <button className="primary-btn" onClick={addPlayer}>선수 추가</button>
      </div>

      <div className="player-table">
        <div className="table-head"><span>선수</span><span>티어</span><span>주라인</span><span>부라인</span><span>상태</span><span /></div>
        {players.map((p) => (
          <div className="table-row" key={p.id}>
            <b>{p.name}</b><span>{p.tier}</span><span>{p.main}</span><span>{p.sub}</span>
            <span className="wait-tag">{p.status}</span>
            <button onClick={() => setPlayers((prev) => prev.filter((x) => x.id !== p.id))}>삭제</button>
          </div>
        ))}
      </div>
    </section>
  );
}

function RouletteView({ players }) {
  const [excluded, setExcluded] = useState([]);
  const [picked, setPicked] = useState(null);
  const [spinning, setSpinning] = useState(false);

  const eligible = useMemo(() => players.filter((p) => !excluded.includes(p.id)), [players, excluded]);

  const spin = () => {
    if (!eligible.length || spinning) return;
    setSpinning(true);
    setPicked(null);
    setTimeout(() => {
      setPicked(eligible[Math.floor(Math.random() * eligible.length)]);
      setSpinning(false);
    }, 1800);
  };

  return (
    <div className="roulette-layout">
      <section className="panel wheel-panel">
        <div className="panel-title"><div><span>RANDOM PICK</span><h2>랜덤 룰렛</h2></div></div>
        <div className={spinning ? 'wheel spinning' : 'wheel'}>
          <div className="wheel-center"><Dices size={34} /></div>
        </div>
        <div className="picked-name">{spinning ? '추첨 중...' : picked?.name ?? '대기 중'}</div>
        <button className="primary-btn large" onClick={spin}>룰렛 돌리기</button>
      </section>

      <section className="panel">
        <div className="panel-title compact">
          <div><span>ENTRY LIST</span><h2>룰렛 명단</h2></div>
          <b>{eligible.length}명 참가</b>
        </div>
        <div className="roulette-list">
          {players.map((p) => {
            const isExcluded = excluded.includes(p.id);
            return (
              <button
                key={p.id}
                className={isExcluded ? 'roulette-entry excluded' : 'roulette-entry'}
                onClick={() => setExcluded((prev) => isExcluded ? prev.filter((id) => id !== p.id) : [...prev, p.id])}
              >
                <div><b>{p.name}</b><small>{p.tier} · {p.main}</small></div>
                <span>{isExcluded ? '제외됨' : '참가'}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SettingsView({ teams, setTeams }) {
  return (
    <section className="panel full-panel">
      <div className="panel-title"><div><span>AUCTION CONFIG</span><h2>경매 설정</h2></div></div>
      <div className="settings-grid">
        <label><span>대회 이름</span><input defaultValue="제3회 관동지방컵" /></label>
        <label><span>기본 포인트</span><input defaultValue="1000" /></label>
        <label><span>타이머</span><input defaultValue="15초" /></label>
        <label><span>입찰 단위</span><input defaultValue="10, 20, 50, 100" /></label>
      </div>
      <h3 className="section-heading">팀 이름</h3>
      <div className="settings-grid team-setting-grid">
        {teams.map((team, index) => (
          <label key={team.id}>
            <span>{index + 1}번 팀</span>
            <input
              value={team.name}
              onChange={(e) => setTeams((prev) => prev.map((t) => t.id === team.id ? { ...t, name: e.target.value } : t))}
            />
          </label>
        ))}
      </div>
      <button className="primary-btn">설정 저장</button>
    </section>
  );
}

function WatchView() {
  return (
    <section className="panel watch-placeholder">
      <Eye size={42} />
      <span>OBSERVER MODE</span>
      <h2>관전자 전용 화면</h2>
      <p>입찰 버튼 없이 현재 선수, 현재가, 타이머, 팀 현황만 표시되는 화면입니다.</p>
      <button className="primary-btn">관전자 화면 열기</button>
    </section>
  );
}

export default function Home() {
  const [active, setActive] = useState('auction');
  const [players, setPlayers] = useState(samplePlayers);
  const [teams, setTeams] = useState(sampleTeams);

  let view = <AuctionView players={players} teams={teams} />;
  if (active === 'players') view = <PlayersView players={players} setPlayers={setPlayers} />;
  if (active === 'roulette') view = <RouletteView players={players} />;
  if (active === 'settings') view = <SettingsView teams={teams} setTeams={setTeams} />;
  if (active === 'watch') view = <WatchView />;

  return (
    <AppShell active={active} setActive={setActive}>
      {view}
    </AppShell>
  );
}
