'use client';

import { useEffect, useMemo, useState } from 'react';
import { Users, Gavel, Dices, Settings, Eye, Trophy, Clock3, UserRoundCog, RotateCcw, Save, History, Sparkles, Plus, Trash2 } from 'lucide-react';

const KEY = 'gochubat-v02';
const ROLES = ['TOP','JUG','MID','ADC','SUP'];
const DEFAULT_SETTINGS = {
  title: '제3회 관동지방컵', teamCount: 5, timer: 15,
  resetOnBid: true, sound: true, animation: true,
  bidSteps: [10,20,50,100],
  teamNames: ['1팀','2팀','3팀','4팀','5팀'],
  teamPoints: [1000,1000,1000,1000,1000]
};
const DEFAULT_PLAYERS = [
  {id:1,name:'정우',tier:'마스터',main:'TOP',sub:'JUG',status:'waiting',excluded:false},
  {id:2,name:'대현',tier:'챌린저',main:'JUG',sub:'TOP',status:'waiting',excluded:false},
  {id:3,name:'준휘',tier:'마스터',main:'MID',sub:'ADC',status:'waiting',excluded:false},
  {id:4,name:'수민',tier:'에메랄드',main:'ADC',sub:'MID',status:'waiting',excluded:false},
  {id:5,name:'지훈',tier:'마스터',main:'SUP',sub:'JUG',status:'waiting',excluded:false}
];

function makeTeams(settings, old = []) {
  return Array.from({length: settings.teamCount}, (_, i) => ({
    id: old[i]?.id ?? i + 1,
    name: settings.teamNames[i] || `${i+1}팀`,
    points: Number(old[i]?.points ?? settings.teamPoints[i] ?? 1000),
    roster: Array.isArray(old[i]?.roster) ? old[i].roster : []
  }));
}

function AppShell({active,setActive,settings,children}) {
  const menu = [
    ['auction',Gavel,'실시간 경매'],['players',Users,'선수 관리'],
    ['roulette',Dices,'랜덤 룰렛'],['history',History,'최근 낙찰'],
    ['watch',Eye,'관전자 화면'],['settings',Settings,'설정']
  ];
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="logo"><div className="brand-mark">🌶️</div><div><strong>고추밭</strong><small>AUCTION SYSTEM</small></div></div>
      <nav>{menu.map(([id,Icon,label])=><button key={id} className={active===id?'nav-item active':'nav-item'} onClick={()=>setActive(id)}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-card"><UserRoundCog size={17}/><div><b>최고 관리자</b><small>운영자 권한은 다음 단계</small></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><span className="eyebrow">GOCHUBAT TOURNAMENT</span><h1>{settings.title}</h1></div><span className="live-pill"><i/> 준비 중</span></header>
      {children}
    </section>
  </main>;
}

function Auction({
  players,setPlayers,teams,setTeams,settings,recent,setRecent,
  currentPlayerId,setCurrentPlayerId,
  spectatorEvent,setSpectatorEvent
}) {
  const waiting = players.filter(p=>p.status==='waiting');
  const [selectedTeam,setSelectedTeam] = useState(null);
  const [price,setPrice] = useState(0);
  const [timer,setTimer] = useState(settings.timer);
  const [running,setRunning] = useState(false);
  const [stack,setStack] = useState([]);
  const [overlay,setOverlay] = useState(null);
  const [spinning,setSpinning] = useState(false);
  const [rouletteName,setRouletteName] = useState('대기 중');

  const pushSpectatorEvent=(event)=>{
    const next={...event,id:Date.now()};
    setSpectatorEvent(next);
    try{
      localStorage.setItem('gochubat-spectator-event',JSON.stringify(next));
      const channel=new BroadcastChannel('gochubat-auction-live');
      channel.postMessage({type:'spectator-event',payload:next});
      channel.close();
    }catch{}
  };

  const current = players.find(p=>p.id===currentPlayerId);
  const roulettePool = players.filter(
    p=>p.status==='waiting' && !p.excluded && p.id!==currentPlayerId
  );

  useEffect(()=>setTimer(settings.timer),[settings.timer]);
  useEffect(()=>{
    if(!running || timer<=0) return;
    const id=setTimeout(()=>setTimer(v=>v-1),1000);
    return()=>clearTimeout(id);
  },[running,timer]);

  const snap=()=>setStack(s=>[
    ...s.slice(-39),
    JSON.stringify({
      players,teams,recent,currentPlayerId,selectedTeam,price,timer
    })
  ]);

  const selectPlayer=(player)=>{
    setCurrentPlayerId(player?.id ?? null);
    setSelectedTeam(null);
    setPrice(0);
    setTimer(settings.timer);
    setRunning(false);
    if(player){
      pushSpectatorEvent({
        type:'player-selected',
        player:{id:player.id,name:player.name,tier:player.tier,main:player.main,sub:player.sub}
      });
    }
  };

  const spinRoulette=()=>{
    if(spinning) return;
    if(!roulettePool.length) return alert('룰렛에 남은 선수가 없습니다.');

    setSpinning(true);
    pushSpectatorEvent({type:'roulette-start'});
    let tick=0;
    const totalTicks=22;
    const interval=setInterval(()=>{
      const preview=roulettePool[Math.floor(Math.random()*roulettePool.length)];
      setRouletteName(preview.name);
      pushSpectatorEvent({type:'roulette-preview',name:preview.name});
      tick+=1;

      if(tick>=totalTicks){
        clearInterval(interval);
        const picked=roulettePool[Math.floor(Math.random()*roulettePool.length)];
        setRouletteName(picked.name);
        pushSpectatorEvent({
          type:'roulette-result',
          player:{id:picked.id,name:picked.name,tier:picked.tier,main:picked.main,sub:picked.sub}
        });
        selectPlayer(picked);
        setSpinning(false);
      }
    },75);
  };

  const bid=(n)=>{
    if(!current || selectedTeam===null) return alert('룰렛으로 선수와 입찰 팀을 먼저 선택하세요.');
    const team=teams.find(t=>t.id===selectedTeam);
    if(!team) return;
    if(price+n>team.points) return alert('포인트가 부족합니다.');
    snap();
    const nextPrice=price+n;
    setPrice(nextPrice);
    pushSpectatorEvent({
      type:'bid',
      price:nextPrice,
      teamId:team.id,
      teamName:team.name,
      timer:settings.resetOnBid?settings.timer:timer
    });
    if(settings.resetOnBid) setTimer(settings.timer);
  };

  const resetRound=()=>{
    setSelectedTeam(null);
    setPrice(0);
    setTimer(settings.timer);
    setRunning(false);
  };

  const sold=()=>{
    if(!current||selectedTeam===null) return alert('선수와 낙찰 팀을 확인하세요.');
    const team=teams.find(t=>t.id===selectedTeam);
    if(!team) return;
    snap();

    setTeams(ts=>ts.map(t=>t.id===team.id?{
      ...t,
      points:t.points-price,
      roster:[
        ...t.roster,
        {
          id:current.id,
          name:current.name,
          tier:current.tier,
          main:current.main,
          sub:current.sub,
          price
        }
      ]
    }:t));

    setPlayers(ps=>ps.map(p=>p.id===current.id?{
      ...p,status:'sold',excluded:true,soldTeamId:team.id,soldPrice:price
    }:p));

    const sale={
      id:Date.now(),
      player:current.name,
      team:team.name,
      price,
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    };
    setRecent(r=>[sale,...r].slice(0,30));
    setOverlay({type:'sold',...sale});
    pushSpectatorEvent({type:'sold',sale});
    selectPlayer(null);
    setRouletteName('대기 중');
    setTimeout(()=>setOverlay(null),1800);
  };

  const unsold=()=>{
    if(!current) return;
    snap();
    setPlayers(ps=>ps.map(p=>p.id===current.id?{
      ...p,status:'unsold',excluded:true
    }:p));
    setOverlay({type:'unsold',player:current.name});
    pushSpectatorEvent({type:'unsold',player:current.name});
    selectPlayer(null);
    setRouletteName('대기 중');
    setTimeout(()=>setOverlay(null),1300);
  };

  const undo=()=>{
    const raw=stack.at(-1);
    if(!raw) return;
    const x=JSON.parse(raw);
    setPlayers(x.players);
    setTeams(x.teams);
    setRecent(x.recent);
    setCurrentPlayerId(x.currentPlayerId);
    setSelectedTeam(x.selectedTeam);
    setPrice(x.price);
    setTimer(x.timer);
    setRunning(false);
    setStack(s=>s.slice(0,-1));
  };

  return <>{overlay&&
    <div className={`result-overlay ${overlay.type}`}>
      <div className="result-card">
        <Sparkles size={34}/>
        <span>{overlay.type==='sold'?'AUCTION COMPLETE':'UNSOLD'}</span>
        <h2>{overlay.player}</h2>
        <p>{overlay.type==='sold'?`${overlay.team} · ${overlay.price}P 낙찰`:'유찰 처리'}</p>
      </div>
    </div>
  }
    <div className="page-grid">
      <section className="panel auction-stage">
        <div className="panel-title">
          <div><span>LIVE AUCTION</span><h2>현재 경매 선수</h2></div>
          <b>남은 선수 {waiting.length}명</b>
        </div>

        <div className="player-focus">
          <div className="role-orb">{current?.main??'?'}</div>
          <div className="player-copy">
            <span className="tier-tag">{current?.tier??'선수 없음'}</span>
            <h3>{current?.name??'룰렛을 돌려주세요'}</h3>
            <p>{current?`${current.main} / ${current.sub}`:'오른쪽 룰렛에서 다음 선수를 추첨하세요.'}</p>
          </div>
          <div className={timer<=5?'timer-ring danger':'timer-ring'}>
            <Clock3 size={18}/><strong>{timer}</strong><small>SEC</small>
          </div>
        </div>

        <div className="price-board">
          <span>현재 입찰가</span>
          <strong>{price.toLocaleString()} P</strong>
          <p>현재 입찰팀: {selectedTeam?teams.find(t=>t.id===selectedTeam)?.name:'없음'}</p>
        </div>

        <div className="team-bids dynamic">
          {teams.map(t=>
            <button
              key={t.id}
              className={selectedTeam===t.id?'team-bid selected':'team-bid'}
              onClick={()=>setSelectedTeam(t.id)}
            >
              <span>{t.name}</span>
              <b>{t.points.toLocaleString()} P</b>
              <small>{t.roster.length}명 영입</small>
            </button>
          )}
        </div>

        <div className="bid-actions dynamic">
          {settings.bidSteps.map(n=><button key={n} onClick={()=>bid(n)}>+{n}</button>)}
        </div>

        <div className="admin-actions">
          <button className="success-btn" onClick={sold}><Trophy size={17}/> 낙찰</button>
          <button className="danger-btn" onClick={unsold}>유찰</button>
          <button onClick={()=>{
  const next=!running;
  setRunning(next);
  pushSpectatorEvent({type:next?'timer-start':'timer-stop',timer});
}}>{running?'타이머 정지':'타이머 시작'}</button>
          <button onClick={undo}><RotateCcw size={15}/> 되돌리기</button>
        </div>
      </section>

      <aside className="right-stack">
        <section className="panel">
          <div className="panel-title compact">
            <div><span>RANDOM PICK</span><h2>랜덤 룰렛</h2></div>
            <b>{roulettePool.length}명 추첨 가능</b>
          </div>
          <div className="inline-roulette">
            <div className={spinning?'mini-wheel spinning':'mini-wheel'}>
              <Dices size={32}/>
            </div>
            <div className={spinning?'roulette-current spinning-text':'roulette-current'}>
              {rouletteName}
            </div>
            <p>낙찰·유찰 선수와 현재 경매 선수는 자동 제외됩니다.</p>
            <button className="primary-btn" onClick={spinRoulette} disabled={spinning||!roulettePool.length}>
              {spinning?'추첨 중...':'룰렛 돌리기'}
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-title compact">
            <div><span>RECENT SALES</span><h2>최근 낙찰</h2></div>
          </div>
          <div className="recent-list">
            {recent.length?recent.slice(0,5).map(x=>
              <div className="recent-row" key={x.id}>
                <div><b>{x.player}</b><small>{x.team}</small></div>
                <strong>{x.price}P</strong>
              </div>
            ):<div className="empty-state">낙찰 기록 없음</div>}
          </div>
        </section>

        <section className="panel team-rosters-panel">
          <div className="panel-title compact">
            <div><span>TEAM ROSTERS</span><h2>팀별 영입 명단</h2></div>
          </div>
          <div className="team-roster-list">
            {teams.map(t=>
              <details className="team-roster-card" key={t.id} open={t.roster.length>0}>
                <summary>
                  <div>
                    <b>{t.name}</b>
                    <small>{t.roster.length}명 영입</small>
                  </div>
                  <strong>{t.points.toLocaleString()}P</strong>
                </summary>

                <div className="roster-members">
                  {t.roster.length?t.roster.map(member=>
                    <div className="roster-member" key={`${t.id}-${member.id}`}>
                      <div>
                        <b>{member.name}</b>
                        <small>{member.tier||''}{member.main?` · ${member.main}/${member.sub}`:''}</small>
                      </div>
                      <strong>{Number(member.price||0).toLocaleString()}P</strong>
                    </div>
                  ):<div className="empty-roster">아직 영입한 선수가 없습니다.</div>}
                </div>
              </details>
            )}
          </div>
        </section>
      </aside>
    </div>
  </>;
}

function Players({players,setPlayers}) {
  const [f,setF]=useState({name:'',tier:'',main:'TOP',sub:'JUG'});
  const add=()=>{if(!f.name.trim()||!f.tier.trim())return;setPlayers(p=>[...p,{id:Date.now(),...f,status:'waiting',excluded:false}]);setF({name:'',tier:'',main:'TOP',sub:'JUG'});};
  return <section className="panel full-panel"><div className="panel-title"><div><span>PLAYER DATABASE</span><h2>선수 관리</h2></div><b>{players.length}명</b></div>
    <div className="player-form"><input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="선수 이름"/><input value={f.tier} onChange={e=>setF({...f,tier:e.target.value})} placeholder="티어"/><select value={f.main} onChange={e=>setF({...f,main:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select><select value={f.sub} onChange={e=>setF({...f,sub:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select><button className="primary-btn" onClick={add}>선수 추가</button></div>
    <div className="player-table"><div className="table-head"><span>선수</span><span>티어</span><span>주라인</span><span>부라인</span><span>상태</span><span/></div>{players.map(p=><div className="table-row" key={p.id}><b>{p.name}</b><span>{p.tier}</span><span>{p.main}</span><span>{p.sub}</span><span className={`wait-tag ${p.status}`}>{p.status==='waiting'?'대기':p.status==='sold'?'낙찰':'유찰'}</span><div className="row-actions">{p.status!=='waiting'&&<button onClick={()=>setPlayers(ps=>ps.map(x=>x.id===p.id?{...x,status:'waiting',excluded:false}:x))}>복구</button>}<button onClick={()=>setPlayers(ps=>ps.filter(x=>x.id!==p.id))}>삭제</button></div></div>)}</div>
  </section>;
}

function Roulette({players,setPlayers,setActive,setCurrentPlayerId}) {
  const [picked,setPicked]=useState(null);
  const [spinning,setSpinning]=useState(false);
  const eligible=useMemo(()=>players.filter(p=>p.status==='waiting'&&!p.excluded),[players]);

  const spin=()=>{
    if(!eligible.length||spinning)return;
    setSpinning(true);
    setPicked(null);
    setTimeout(()=>{
      const selected=eligible[Math.floor(Math.random()*eligible.length)];
      setPicked(selected);
      setCurrentPlayerId(selected.id);
      setSpinning(false);
    },2000);
  };

  return <div className="roulette-layout">
    <section className="panel wheel-panel">
      <div className="panel-title"><div><span>RANDOM PICK</span><h2>랜덤 룰렛</h2></div></div>
      <div className={spinning?'wheel spinning':'wheel'}><div className="wheel-center"><Dices size={34}/></div></div>
      <div className="picked-name">{spinning?'추첨 중...':picked?.name??'대기 중'}</div>
      <div className="roulette-buttons">
        <button className="primary-btn large" onClick={spin}>룰렛 돌리기</button>
        <button disabled={!picked} onClick={()=>setActive('auction')}>경매 화면으로 이동</button>
      </div>
    </section>

    <section className="panel">
      <div className="panel-title compact">
        <div><span>ENTRY LIST</span><h2>룰렛 명단</h2></div><b>{eligible.length}명 참가</b>
      </div>
      <div className="roulette-list">
        {players.map(p=>{
          const off=p.excluded||p.status!=='waiting';
          return <button
            key={p.id}
            className={off?'roulette-entry excluded':'roulette-entry'}
            onClick={()=>p.status==='waiting'&&setPlayers(ps=>ps.map(x=>x.id===p.id?{...x,excluded:!x.excluded}:x))}
          >
            <div><b>{p.name}</b><small>{p.tier} · {p.main}</small></div>
            <span>{p.status!=='waiting'?'경매 완료':p.excluded?'제외됨':'참가'}</span>
          </button>
        })}
      </div>
    </section>
  </div>;
}

function SettingsView({settings,setSettings,teams,setTeams}) {
  const [d,setD]=useState(settings);
  const [steps,setSteps]=useState(settings.bidSteps.join(','));

  useEffect(()=>{
    setD(settings);
    setSteps(settings.bidSteps.join(','));
  },[settings]);

  const addTeam=()=>{
    const nextIndex=d.teamNames.length;
    setD(x=>({
      ...x,
      teamCount:x.teamCount+1,
      teamNames:[...x.teamNames,`${nextIndex+1}팀`],
      teamPoints:[...x.teamPoints,1000]
    }));
  };

  const removeTeam=(index)=>{
    if(d.teamCount<=2){
      alert('팀은 최소 2팀이 필요합니다.');
      return;
    }

    const teamName=d.teamNames[index]||`${index+1}팀`;
    if(!confirm(`${teamName}을(를) 설정에서 삭제할까요?\n설정 저장 후 해당 위치의 팀 데이터도 제거됩니다.`)) return;

    const names=d.teamNames.filter((_,i)=>i!==index);
    const points=d.teamPoints.filter((_,i)=>i!==index);

    setD(x=>({
      ...x,
      teamCount:x.teamCount-1,
      teamNames:names,
      teamPoints:points
    }));
  };

  const save=()=>{
    const bids=steps
      .split(',')
      .map(x=>Number(x.trim()))
      .filter(x=>Number.isFinite(x)&&x>0);

    if(!bids.length) return alert('입찰 단위를 입력하세요.');
    if(d.teamNames.length<2) return alert('팀은 최소 2팀이 필요합니다.');

    const next={
      ...d,
      teamCount:d.teamNames.length,
      teamNames:d.teamNames.map((name,i)=>name.trim()||`${i+1}팀`),
      teamPoints:d.teamPoints.map(point=>Math.max(0,Number(point)||0)),
      bidSteps:[...new Set(bids)].sort((a,b)=>a-b)
    };

    setSettings(next);
    setTeams(previous=>makeTeams(next,previous));
    alert(`설정 저장 완료 · 현재 ${next.teamCount}팀`);
  };

  const resetTeams=()=>{
    if(!confirm('모든 팀의 포인트와 영입 명단을 시작 설정으로 초기화할까요?')) return;
    setTeams(makeTeams({...d,teamCount:d.teamNames.length},[]));
  };

  return <section className="panel full-panel">
    <div className="panel-title">
      <div><span>AUCTION CONFIG</span><h2>경매 상세 설정</h2></div>
      <b>현재 {d.teamNames.length}팀</b>
    </div>

    <div className="settings-grid settings-grid-no-count">
      <label>
        <span>대회 이름</span>
        <input value={d.title} onChange={e=>setD({...d,title:e.target.value})}/>
      </label>
      <label>
        <span>타이머</span>
        <input type="number" min="3" value={d.timer} onChange={e=>setD({...d,timer:Math.max(3,Number(e.target.value)||3)})}/>
      </label>
      <label>
        <span>입찰 단위</span>
        <input value={steps} onChange={e=>setSteps(e.target.value)} placeholder="10,20,50,100"/>
      </label>
    </div>

    <div className="option-grid">
      <button className={d.resetOnBid?'option-card active':'option-card'} onClick={()=>setD({...d,resetOnBid:!d.resetOnBid})}>
        <Clock3 size={20}/>
        <div><b>입찰 시 타이머 초기화</b><small>{d.resetOnBid?'ON':'OFF'}</small></div>
      </button>
      <button className={d.sound?'option-card active':'option-card'} onClick={()=>setD({...d,sound:!d.sound})}>
        <div><b>효과음</b><small>{d.sound?'ON':'OFF'}</small></div>
      </button>
      <button className={d.animation?'option-card active':'option-card'} onClick={()=>setD({...d,animation:!d.animation})}>
        <Sparkles size={20}/>
        <div><b>애니메이션</b><small>{d.animation?'ON':'OFF'}</small></div>
      </button>
    </div>

    <div className="team-section-header">
      <div>
        <h3>팀별 설정</h3>
        <p>팀 수 제한 없이 필요한 만큼 추가할 수 있습니다. 최소 2팀.</p>
      </div>
      <button className="add-team-btn" onClick={addTeam}>
        <Plus size={16}/> 팀 추가
      </button>
    </div>

    <div className="team-config-list">
      {d.teamNames.map((name,i)=>
        <div className="team-config-row unlimited" key={`team-${i}`}>
          <span className="team-order">{String(i+1).padStart(2,'0')}</span>
          <label>
            <span>팀 이름</span>
            <input value={name} onChange={e=>{
              const a=[...d.teamNames];
              a[i]=e.target.value;
              setD({...d,teamNames:a});
            }}/>
          </label>
          <label>
            <span>시작 포인트</span>
            <input type="number" min="0" value={d.teamPoints[i]} onChange={e=>{
              const a=[...d.teamPoints];
              a[i]=Math.max(0,Number(e.target.value)||0);
              setD({...d,teamPoints:a});
            }}/>
          </label>
          <button
            className="delete-team-btn"
            onClick={()=>removeTeam(i)}
            disabled={d.teamCount<=2}
            title={d.teamCount<=2?'최소 2팀은 유지해야 합니다.':'팀 삭제'}
          >
            <Trash2 size={15}/> 삭제
          </button>
        </div>
      )}
    </div>

    <div className="settings-actions">
      <button onClick={resetTeams}><RotateCcw size={16}/> 팀 초기화</button>
      <button className="primary-btn" onClick={save}><Save size={16}/> 설정 저장</button>
    </div>
  </section>;
}

function HistoryView({recent}) {return <section className="panel full-panel"><div className="panel-title"><div><span>AUCTION HISTORY</span><h2>최근 낙찰</h2></div><b>{recent.length}건</b></div><div className="history-list">{recent.length?recent.map((x,i)=><div className="history-row" key={x.id}><span>{String(i+1).padStart(2,'0')}</span><div><b>{x.player}</b><small>{x.time}</small></div><span>{x.team}</span><strong>{x.price}P</strong></div>):<div className="empty-state large">낙찰 기록 없음</div>}</div></section>}
function Watch({
  settings,teams,players,recent,currentPlayerId,
  livePrice,liveTeamName,liveTimer,spectatorEvent
}) {
  const current=players.find(p=>p.id===currentPlayerId);
  const completed=players.filter(p=>p.status!=='waiting').length;
  const total=players.length;
  const waiting=players.filter(p=>p.status==='waiting').length;

  const [rouletteActive,setRouletteActive]=useState(false);
  const [rouletteDisplay,setRouletteDisplay]=useState('대기 중');
  const [resultOverlay,setResultOverlay]=useState(null);

  useEffect(()=>{
    if(!spectatorEvent) return;

    if(spectatorEvent.type==='roulette-start'){
      setRouletteActive(true);
      setRouletteDisplay('추첨 시작');
    }
    if(spectatorEvent.type==='roulette-preview'){
      setRouletteActive(true);
      setRouletteDisplay(spectatorEvent.name);
    }
    if(spectatorEvent.type==='roulette-result'){
      setRouletteActive(false);
      setRouletteDisplay(spectatorEvent.player?.name||'결과');
    }
    if(spectatorEvent.type==='sold'){
      setResultOverlay({
        type:'sold',
        player:spectatorEvent.sale.player,
        team:spectatorEvent.sale.team,
        price:spectatorEvent.sale.price
      });
      setTimeout(()=>setResultOverlay(null),2200);
    }
    if(spectatorEvent.type==='unsold'){
      setResultOverlay({type:'unsold',player:spectatorEvent.player});
      setTimeout(()=>setResultOverlay(null),1700);
    }
  },[spectatorEvent]);

  return <section className="panel spectator-page">
    {resultOverlay&&
      <div className={`spectator-result-overlay ${resultOverlay.type}`}>
        <div className="spectator-result-card">
          <Sparkles size={42}/>
          <span>{resultOverlay.type==='sold'?'AUCTION COMPLETE':'UNSOLD'}</span>
          <h2>{resultOverlay.player}</h2>
          <p>
            {resultOverlay.type==='sold'
              ?`${resultOverlay.team} · ${Number(resultOverlay.price).toLocaleString()}P 낙찰`
              :'유찰 처리되었습니다.'}
          </p>
        </div>
      </div>
    }

    <header className="spectator-header">
      <div>
        <div className="watch-brand">🌶️ 고추밭 AUCTION</div>
        <h2>{settings.title}</h2>
      </div>
      <div className="spectator-status">
        <span className="status-live-dot"/>
        <b>{rouletteActive?'룰렛 진행 중':current?'입찰 진행 중':'경매 준비'}</b>
      </div>
      <div className="spectator-progress">
        <span>진행률</span>
        <b>{completed} / {total}</b>
        <small>남은 선수 {waiting}명</small>
      </div>
    </header>

    <div className="spectator-main-grid">
      <section className="spectator-current-card">
        <span className="spectator-label">CURRENT PLAYER</span>
        <div className="spectator-player-row">
          <div className="spectator-role-orb">{current?.main??'?'}</div>
          <div>
            <small>{current?.tier??'선수 없음'}</small>
            <h3>{current?.name??'룰렛을 기다리는 중'}</h3>
            <p>{current?`${current.main} / ${current.sub}`:'다음 선수를 추첨해주세요.'}</p>
          </div>
        </div>

        <div className="spectator-price-grid">
          <div>
            <span>현재 입찰가</span>
            <strong>{Number(livePrice||0).toLocaleString()}P</strong>
          </div>
          <div>
            <span>최고 입찰팀</span>
            <strong>{liveTeamName||'없음'}</strong>
          </div>
          <div>
            <span>남은 시간</span>
            <strong className={liveTimer<=5?'danger-time':''}>{liveTimer}초</strong>
          </div>
        </div>
      </section>

      <section className="spectator-roulette-card">
        <span className="spectator-label">RANDOM ROULETTE</span>
        <div className={rouletteActive?'spectator-wheel active':'spectator-wheel'}>
          <Dices size={38}/>
        </div>
        <div className={rouletteActive?'spectator-roulette-name active':'spectator-roulette-name'}>
          {rouletteDisplay}
        </div>
        <p>{rouletteActive?'선수를 추첨하고 있습니다...':'다음 룰렛을 기다리는 중'}</p>
      </section>
    </div>

    <section className="spectator-recent-section">
      <div className="spectator-section-title">
        <div><span>RECENT SALES</span><h3>최근 낙찰</h3></div>
      </div>
      <div className="spectator-recent-list">
        {recent.length?recent.slice(0,5).map(x=>
          <div className="spectator-recent-row" key={x.id}>
            <div><b>{x.player}</b><small>{x.team}</small></div>
            <strong>{Number(x.price).toLocaleString()}P</strong>
          </div>
        ):<div className="watch-empty">아직 낙찰 기록이 없습니다.</div>}
      </div>
    </section>

    <section className="spectator-rosters-section">
      <div className="spectator-section-title">
        <div><span>TEAM ROSTERS</span><h3>팀별 영입 현황</h3></div>
      </div>
      <div className="watch-rosters">
        {teams.map(team=>
          <article className="watch-team-card" key={team.id}>
            <header>
              <div>
                <b>{team.name}</b>
                <small>{team.roster.length}명 영입</small>
              </div>
              <strong>{team.points.toLocaleString()}P</strong>
            </header>

            <div className="watch-team-members">
              {team.roster.length?team.roster.map(member=>
                <div className="watch-member-row" key={`${team.id}-${member.id}`}>
                  <div>
                    <b>{member.name}</b>
                    <small>
                      {member.tier||''}
                      {member.main?` · ${member.main}/${member.sub}`:''}
                    </small>
                  </div>
                  <strong>{Number(member.price||0).toLocaleString()}P</strong>
                </div>
              ):<div className="watch-empty">영입한 선수가 없습니다.</div>}
            </div>
          </article>
        )}
      </div>
    </section>

    <p className="watch-note">
      관전자 화면 · 입찰 및 운영 버튼은 표시되지 않습니다.
    </p>
  </section>;
}

export default function Home(){
  const [active,setActive]=useState('auction');
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [players,setPlayers]=useState(DEFAULT_PLAYERS);
  const [teams,setTeams]=useState(makeTeams(DEFAULT_SETTINGS));
  const [recent,setRecent]=useState([]);
  const [currentPlayerId,setCurrentPlayerId]=useState(null);
  const [spectatorEvent,setSpectatorEvent]=useState(null);
  const [livePrice,setLivePrice]=useState(0);
  const [liveTeamName,setLiveTeamName]=useState('');
  const [liveTimer,setLiveTimer]=useState(DEFAULT_SETTINGS.timer);
  const [ready,setReady]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem(KEY);if(raw){const x=JSON.parse(raw);const s={...DEFAULT_SETTINGS,...x.settings};setSettings(s);setPlayers(x.players||DEFAULT_PLAYERS);setTeams(makeTeams(s,x.teams||[]));setRecent(x.recent||[]);setCurrentPlayerId(x.currentPlayerId??null);}}catch{}setReady(true)},[]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY,JSON.stringify({settings,players,teams,recent,currentPlayerId}));},[ready,settings,players,teams,recent,currentPlayerId]);

  useEffect(()=>{
    const ev=spectatorEvent;
    if(!ev)return;
    if(ev.type==='bid'){
      setLivePrice(ev.price||0);
      setLiveTeamName(ev.teamName||'');
      setLiveTimer(ev.timer??settings.timer);
    }
    if(ev.type==='player-selected' || ev.type==='roulette-result'){
      setLivePrice(0);
      setLiveTeamName('');
      setLiveTimer(settings.timer);
    }
    if(ev.type==='timer-start' || ev.type==='timer-stop'){
      setLiveTimer(ev.timer??liveTimer);
    }
    if(ev.type==='sold' || ev.type==='unsold'){
      setLivePrice(0);
      setLiveTeamName('');
      setLiveTimer(settings.timer);
    }
  },[spectatorEvent,settings.timer]);

  let view=<Auction players={players} setPlayers={setPlayers} teams={teams} setTeams={setTeams} settings={settings} recent={recent} setRecent={setRecent} currentPlayerId={currentPlayerId} setCurrentPlayerId={setCurrentPlayerId}
      spectatorEvent={spectatorEvent} setSpectatorEvent={setSpectatorEvent}/>;
  if(active==='players')view=<Players players={players} setPlayers={setPlayers}/>;
  if(active==='roulette')view=<Roulette players={players} setPlayers={setPlayers} setActive={setActive} setCurrentPlayerId={setCurrentPlayerId}/>;
  if(active==='history')view=<HistoryView recent={recent}/>;
  if(active==='watch')view=<Watch
    settings={settings}
    teams={teams}
    players={players}
    recent={recent}
    currentPlayerId={currentPlayerId}
    livePrice={livePrice}
    liveTeamName={liveTeamName}
    liveTimer={liveTimer}
    spectatorEvent={spectatorEvent}
  />;
  if(active==='settings')view=<SettingsView settings={settings} setSettings={setSettings} teams={teams} setTeams={setTeams}/>;
  return <AppShell active={active} setActive={setActive} settings={settings}>{view}</AppShell>;
}
