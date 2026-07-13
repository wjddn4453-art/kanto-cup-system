'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Users, Gavel, Dices, Settings, Eye, Trophy, Clock3, UserRoundCog, RotateCcw, Save, History, Sparkles, Plus, Trash2, Maximize2, Wifi, WifiOff, KeyRound, List, Volume2, VolumeX } from 'lucide-react';

const KEY = 'gochubat-v02';
const ROLES = ['TOP','JUG','MID','ADC','SUP'];
const TIERS = ['챌린저','그랜드마스터','마스터','다이아몬드','에메랄드','플래티넘','골드','실버','브론즈','아이언'];
const DEFAULT_SETTINGS = {
  title: '제3회 관동지방컵', teamCount: 5, timer: 15,
  resetOnBid: true, sound: true, animation: true,
  bidSteps: [10,20,50,100],
  teamNames: ['1팀','2팀','3팀','4팀','5팀'],
  teamPoints: [1000,1000,1000,1000,1000]
};
const DEFAULT_PLAYERS = [
  {id:1,name:'정우',tier:'마스터',main:'TOP',sub:'JUG',status:'waiting',excluded:false,basePoint:100},
  {id:2,name:'대현',tier:'챌린저',main:'JUG',sub:'TOP',status:'waiting',excluded:false,basePoint:100},
  {id:3,name:'준휘',tier:'마스터',main:'MID',sub:'ADC',status:'waiting',excluded:false,basePoint:100},
  {id:4,name:'수민',tier:'에메랄드',main:'ADC',sub:'MID',status:'waiting',excluded:false,basePoint:100},
  {id:5,name:'지훈',tier:'마스터',main:'SUP',sub:'JUG',status:'waiting',excluded:false,basePoint:100}
];

function makeTeams(settings, old = []) {
  return Array.from({length: settings.teamCount}, (_, i) => ({
    id: old[i]?.id ?? i + 1,
    name: settings.teamNames[i] || `${i+1}팀`,
    points: Number(old[i]?.points ?? settings.teamPoints[i] ?? 1000),
    roster: Array.isArray(old[i]?.roster) ? old[i].roster : [],
    colorIndex: Number(old[i]?.colorIndex ?? i)
  }));
}


function TournamentTitle({title='제3회 관동지방컵'}) {
  const match = String(title).match(/^(제)(\d+)(회)(.*)$/);
  if (!match) return <span className="tournament-title-text">{title}</span>;
  return <span className="tournament-title-text" aria-label={title}>
    <span className="title-prefix">{match[1]}</span>
    <span className="title-number">{match[2]}</span>
    <span className="title-suffix">{match[3]}</span>
    <span className="title-name">{match[4]}</span>
  </span>;
}

function AppShell({active,setActive,settings,children}) {
  const menu = [
    ['auction','경매 화면'],
    ['list','전체목록'],
    ['teams','팀 목록'],
    ['players','선수 관리'],
    ['settings','설정']
  ];
  return <main className="single-shell">
    <header className="single-topbar">
      <div className="single-brand">
        <div className="single-ball"><span>G</span></div>
        <div><small>GOCHUBAT MONSTER DRAFT</small><h1><TournamentTitle title={settings.title}/></h1></div>
      </div>
      <nav className="single-nav">
        {menu.map(([id,label])=><button key={id} className={active===id?'active':''} onClick={()=>setActive(id)}>{label}</button>)}
      </nav>
    </header>
    <section className="single-content">{children}</section>
  </main>;
}
function playUiSound(kind, enabled = true) {
  if (!enabled || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = window.__gochubatAudioContext || new AudioCtx();
    window.__gochubatAudioContext = ctx;
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const patterns = {
      select: [[520, .05, .055], [760, .08, .05]],
      tick: [[760, .025, .025]],
      bid: [[440, .04, .05], [660, .06, .045]],
      sold: [[392, .08, .06], [523, .11, .065], [784, .2, .08]],
      unsold: [[220, .12, .06], [164, .28, .055]],
      result: [[659, .06, .055], [880, .13, .06]],
    };
    const notes = patterns[kind] || patterns.select;
    notes.forEach(([frequency, duration, gain], index) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = kind === 'unsold' ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(frequency, now + index * .045);
      amp.gain.setValueAtTime(0.0001, now + index * .045);
      amp.gain.exponentialRampToValueAtTime(gain, now + index * .045 + .008);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + index * .045 + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(now + index * .045);
      osc.stop(now + index * .045 + duration + .02);
    });
  } catch {}
}

function Auction({
  players,setPlayers,teams,setTeams,settings,recent,setRecent,
  currentPlayerId,setCurrentPlayerId,
  spectatorEvent,setSpectatorEvent,unsoldList,setUnsoldList,onStateChanged
}) {
  const [filter,setFilter]=useState('ALL');
  const [view,setView]=useState('board');
  const [selectedTeam,setSelectedTeam]=useState(null);
  const [priceInput,setPriceInput]=useState('0');
  const [assignModal,setAssignModal]=useState(false);
  const [spinning,setSpinning]=useState(false);
  const [rouletteName,setRouletteName]=useState('룰렛 대기');
  const [rouletteMode,setRouletteMode]=useState('normal');
  const [rouletteItems,setRouletteItems]=useState([]);
  const [rouletteStep,setRouletteStep]=useState(0);
  const [overlay,setOverlay]=useState(null);
  const [stack,setStack]=useState([]);

  const waiting=players.filter(p=>p.status==='waiting');
  const current=players.find(p=>p.id===currentPlayerId);
  const normalPool=players.filter(p=>p.status==='waiting'&&!p.excluded);
  const unsoldPool=players.filter(p=>p.status==='unsold');
  const roulettePool=rouletteMode==='unsold'?unsoldPool:normalPool;
  const filteredPlayers=players.filter(p=>filter==='ALL'||p.main===filter);

  const pushEvent=(event)=>{
    const next={...event,id:Date.now()};
    setSpectatorEvent(next);
    onStateChanged?.({spectatorEvent:next});
    try{
      localStorage.setItem('gochubat-spectator-event',JSON.stringify(next));
      const channel=new BroadcastChannel('gochubat-auction-live');
      channel.postMessage({type:'spectator-event',payload:next});
      channel.close();
    }catch{}
  };

  const snapshot=()=>setStack(s=>[
    ...s.slice(-39),
    JSON.stringify({players,teams,recent,unsoldList,currentPlayerId})
  ]);

  const choosePlayer=(player,openFocus=true)=>{
    if(!player||!['waiting','unsold'].includes(player.status))return;
    setCurrentPlayerId(player.id);
    setRouletteName(player.name);
    setSelectedTeam(null);
    setPriceInput(String(player.basePoint ?? 0));
    playUiSound('select', settings.sound);
    if(openFocus)setView('focus');
    pushEvent({
      type:'player-selected',
      player:{id:player.id,name:player.name,tier:player.tier,main:player.main,sub:player.sub}
    });
  };

  const spinRoulette=(mode='normal')=>{
    if(spinning)return;
    const pool=mode==='unsold'?unsoldPool:normalPool;
    if(!pool.length)return alert(mode==='unsold'?'유찰 매물이 없습니다.':'룰렛에 남은 선수가 없습니다.');

    setRouletteMode(mode);
    setView('board');
    setSpinning(true);
    setRouletteItems(pool);
    setRouletteStep(0);
    playUiSound('select', settings.sound);
    pushEvent({type:'roulette-start',mode});

    let tick=0;
    let delay=62;
    const total=32;
    const run=()=>{
      const preview=pool[tick%pool.length];
      setRouletteStep(tick%pool.length);
      setRouletteName(preview.name);
      setCurrentPlayerId(preview.id);
      if(tick % 2 === 0) playUiSound('tick', settings.sound);
      pushEvent({type:'roulette-preview',name:preview.name,mode});
      tick+=1;
      if(tick>=total){
        const picked=pool[(tick-1)%pool.length];
        setRouletteName(picked.name);
        setCurrentPlayerId(picked.id);
        pushEvent({type:'roulette-result',player:picked,mode});
        playUiSound('result', settings.sound);
        setSpinning(false);
        setTimeout(()=>setView('focus'),650);
        return;
      }
      delay=Math.min(290,62+tick*7.5);
      setTimeout(run,delay);
    };
    run();
  };
  const openAssign=(team)=>{
    if(!current)return alert('먼저 선수를 선택하세요.');
    if(!['waiting','unsold'].includes(current.status))return;
    setSelectedTeam(team.id);
    if(priceInput === '') setPriceInput(String(current.basePoint ?? 0));
    playUiSound('bid', settings.sound);
    setAssignModal(true);
  };

  const confirmAssign=()=>{
    const team=teams.find(t=>t.id===selectedTeam);
    const price=Math.max(0,Number(priceInput)||0);
    if(!current||!team)return;
    if(price>team.points)return alert('팀 보유 포인트보다 낙찰가가 큽니다.');

    snapshot();

    const member={
      id:current.id,
      name:current.name,
      tier:current.tier,
      main:current.main,
      sub:current.sub,
      imageUrl:current.imageUrl||'',
      price
    };

    setTeams(ts=>ts.map(t=>t.id===team.id?{
      ...t,
      points:t.points-price,
      roster:[...t.roster,member]
    }:t));

    setPlayers(ps=>ps.map(p=>p.id===current.id?{
      ...p,
      status:'sold',
      excluded:true,
      soldTeamId:team.id,
      soldPrice:price
    }:p));

    const sale={
      id:Date.now(),
      player:current.name,
      team:team.name,
      teamId:team.id,
      price,
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    };

    setRecent(r=>[sale,...r].slice(0,30));
    setUnsoldList?.(u=>u.filter(x=>x.player!==current.name));
    setOverlay({type:'sold',player:current.name,team:team.name,price});
    playUiSound('sold', settings.sound);
    pushEvent({type:'sold',sale});
    onStateChanged?.({livePrice:price,liveTeamName:team.name,liveTimer:0});

    setAssignModal(false);
    setCurrentPlayerId(null);
    setRouletteName('룰렛 대기');
    setSelectedTeam(null);
    setView('board');
    setTimeout(()=>setOverlay(null),2100);
  };

  const markUnsold=()=>{
    if(!current)return;
    snapshot();
    const entry={
      id:Date.now(),
      player:current.name,
      tier:current.tier,
      main:current.main,
      sub:current.sub,
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    };
    setPlayers(ps=>ps.map(p=>p.id===current.id?{...p,status:'unsold',excluded:true}:p));
    setUnsoldList?.(u=>[entry,...u.filter(x=>x.player!==current.name)].slice(0,30));
    setOverlay({type:'unsold',player:current.name});
    playUiSound('unsold', settings.sound);
    pushEvent({type:'unsold',player:current.name,entry});
    setCurrentPlayerId(null);
    setRouletteName('룰렛 대기');
    setView('board');
    setTimeout(()=>setOverlay(null),1500);
  };

  const undo=()=>{
    const raw=stack.at(-1);
    if(!raw)return;
    const x=JSON.parse(raw);
    setPlayers(x.players);
    setTeams(x.teams);
    setRecent(x.recent);
    setUnsoldList?.(x.unsoldList||[]);
    setCurrentPlayerId(x.currentPlayerId);
    setStack(s=>s.slice(0,-1));
    setView('board');
  };

  const teamHalves=[
    teams.filter((_,i)=>i%2===0),
    teams.filter((_,i)=>i%2===1)
  ];

  const PlayerPortrait=({player,small=false})=>{
    const initials=(player?.name||'?').slice(0,2);
    return player?.imageUrl
      ? <img src={player.imageUrl} alt="" />
      : <div className={small?'portrait-placeholder small':'portrait-placeholder'}>
          <span>{initials}</span>
          {!small&&<i>{player?.main||'?'}</i>}
        </div>;
  };

  const PlayerCard=({player})=>{
    const active=player.id===currentPlayerId&&['waiting','unsold'].includes(player.status);
    const sold=player.status==='sold';
    const unsold=player.status==='unsold';
    const team=teams.find(t=>t.id===player.soldTeamId);
    const roleText=`${player.main}${player.sub&&player.sub!=='없음'?` / ${player.sub}`:''}`;

    return <button
      className={[
        'arena-player-card',
        active?'picked':'',
        sold?'completed':'',
        unsold?'unsold':'',
        spinning&&active?'roulette-flash':''
      ].join(' ')}
      onClick={()=>['waiting','unsold'].includes(player.status)&&choosePlayer(player,true)}
    >
      <div className="premium-card-content">
        <span className="premium-tier">{player.tier}</span>
        <b className="premium-role">{roleText}</b>
        <strong className="premium-name">{player.name}</strong>
      </div>

      <div className="premium-card-status-zone">
        {sold&&<div className="card-stamp sold-stamp">
          <strong>선택 완료</strong>
          <span>{team?.name} · {Number(player.soldPrice||0).toLocaleString()}P</span>
        </div>}

        {unsold&&<div className="card-stamp unsold-stamp">
          <strong>유찰</strong>
        </div>}

        {active&&player.status==='waiting'&&<div className="picked-crown">NEXT PICK</div>}
      </div>
    </button>;
  };

  const TeamPanel=({team,side})=><section
    className={`arena-team-panel palette-${Number(team.colorIndex||0)%8} side-${side} ${selectedTeam===team.id?'team-selected':''}`}
    onClick={()=>view==='focus'&&openAssign(team)}
  >
    <div className="team-panel-copy">
      <span>TEAM</span>
      <h3>{team.name}</h3>
      <strong>{team.points.toLocaleString()}P</strong>
    </div>
    <div className="team-slot-row">
      {Array.from({length:Math.max(5,team.roster.length)},(_,i)=>{
        const member=team.roster[i];
        return <div className={member?'team-mini-card filled':'team-mini-card'} key={i}>
          {member?<>
            <PlayerPortrait player={member} small/>
            <div className="mini-card-copy">
              <b>{member.name}</b>
              <small>{member.main}{member.sub&&member.sub!=='없음'?`/${member.sub}`:''}</small>
              <span>{member.price}P</span>
            </div>
          </>:<i/>}
        </div>;
      })}
    </div>
  </section>;

  return <>
    {overlay&&<div className={`result-overlay arena-result ${overlay.type}`}>
      <div className="arena-result-lines left"/><div className="arena-result-lines right"/>
      <div className="result-card">
        <Sparkles size={35}/>
        <span>{overlay.type==='sold'?'PLAYER ASSIGNED':'UNSOLD PLAYER'}</span>
        <h2>{overlay.player}</h2>
        <p>{overlay.type==='sold'?`${overlay.team} · ${overlay.price.toLocaleString()}P`:'유찰 처리'}</p>
      </div>
    </div>}

    {assignModal&&<div className="assign-modal-backdrop">
      <div className="assign-modal">
        <span>TEAM ASSIGNMENT</span>
        <h2>{teams.find(t=>t.id===selectedTeam)?.name} 배정 완료</h2>
        <p><b>{current?.name}</b> 선수의 낙찰가를 입력해 주세요.</p>
        <div className="assign-price-box">
          <input
            type="number"
            min="0"
            autoFocus
            value={priceInput}
            onChange={e=>setPriceInput(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&confirmAssign()}
          />
          <em>P</em>
        </div>
        <div className="assign-modal-actions">
          <button onClick={()=>setAssignModal(false)}>취소</button>
          <button className="primary-btn" onClick={confirmAssign}>낙찰가 확정 »</button>
        </div>
      </div>
    </div>}

    <div className="draft-arena-shell">
      <header className="arena-toolbar">
        <div className="arena-back toolbar-links"><span>LIVE DRAFT</span><small>선수를 추첨하고 팀을 선택하세요</small></div>
        <div className="arena-title">
          <small>GOCHUBAT DRAFT ARENA</small>
          <h2><TournamentTitle title={settings.title}/></h2>
        </div>
        <div className="arena-roulette-control dual inline-control">
          <div className={`toolbar-reel ${spinning?'is-spinning':'is-idle'}`}>
            {spinning&&<div className="toolbar-reel-track" style={{transform:`translateY(${-rouletteStep*38}px)`}}>
              {rouletteItems.concat(rouletteItems).map((p,i)=><div key={`${p.id}-${i}`}>{p.name}</div>)}
            </div>}
            {!spinning&&<strong className="toolbar-reel-result">{rouletteName}</strong>}
          </div>
          <div>
            <button onClick={()=>spinRoulette('normal')} disabled={spinning||!normalPool.length}>{spinning&&rouletteMode==='normal'?'추첨 중':'일반 룰렛'}</button>
            <button className="unsold-spin" onClick={()=>spinRoulette('unsold')} disabled={spinning||!unsoldPool.length}>{spinning&&rouletteMode==='unsold'?'추첨 중':`유찰 룰렛 ${unsoldPool.length}`}</button>
          </div>
        </div>
      </header>

      <div className="arena-filter-bar">
        {['ALL',...ROLES].map(role=><button
          key={role}
          className={filter===role?'active':''}
          onClick={()=>{setFilter(role);setView('board')}}
        >
          <span>{role}</span>
        </button>)}
        <div className="arena-toolbar-actions">
          {view==='focus'&&<button onClick={()=>setView('board')}>돌아가기</button>}
          <button onClick={undo}>되돌리기</button>
        </div>
      </div>

      {view==='board'?<div className="arena-board-layout">
        <aside className="arena-team-column left">
          {teamHalves[0].map(t=><TeamPanel key={t.id} team={t} side="left"/>)}
        </aside>

        <section className="arena-player-grid">
          {filteredPlayers.map(p=><PlayerCard key={p.id} player={p}/>)}
          {!filteredPlayers.length&&<div className="arena-empty">해당 포지션 선수가 없습니다.</div>}
        </section>

        <aside className="arena-team-column right">
          {teamHalves[1].map(t=><TeamPanel key={t.id} team={t} side="right"/>)}
        </aside>
      </div>:<div className="arena-focus-layout">
        <aside className="arena-team-column left">
          {teamHalves[0].map(t=><TeamPanel key={t.id} team={t} side="left"/>)}
        </aside>

        <section className="focus-player-stage">
          <div className="focus-beam"/>
          <div className="focus-player-card premium-focus-card">
            <div className="premium-card-content">
              <span className="premium-tier">{current?.tier}</span>
              <b className="premium-role">{current?.main}{current?.sub&&current.sub!=='없음'?` / ${current.sub}`:''}</b>
              <strong className="premium-name">{current?.name}</strong>
            </div>
          </div>
          <label className="live-bid-entry">
            <span>현재 입찰가</span>
            <div>
              <input type="number" min="0" value={priceInput} onChange={e=>setPriceInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&selectedTeam)openAssign(teams.find(t=>t.id===selectedTeam))}} />
              <em>P</em>
            </div>
          </label>
          <small>입찰가를 적고 선수를 영입할 팀을 클릭하세요.</small>
          <button className="focus-unsold-btn" onClick={markUnsold}>유찰 처리</button>
        </section>

        <aside className="arena-team-column right">
          {teamHalves[1].map(t=><TeamPanel key={t.id} team={t} side="right"/>)}
        </aside>
      </div>}

      <footer className="arena-status-footer">
        <span>전체 {players.length}명</span>
        <span>대기 {waiting.length}명</span>
        <span>낙찰 {players.filter(p=>p.status==='sold').length}명</span>
        <span>유찰 {players.filter(p=>p.status==='unsold').length}명</span>
      </footer>
    </div>
  </>;
}

function Players({players,setPlayers}) {
  const [f,setF]=useState({name:'',tier:'마스터',main:'TOP',sub:'없음',basePoint:100});
  const add=()=>{
    if(!f.name.trim())return;
    setPlayers(p=>[...p,{id:Date.now(),...f,status:'waiting',excluded:false,imageUrl:''}]);
    setF({name:'',tier:'마스터',main:'TOP',sub:'없음',basePoint:100});
  };
  return <section className="panel full-panel">
    <div className="panel-title"><div><span>PLAYER DATABASE</span><h2>선수 관리</h2></div><b>{players.length}명</b></div>
    <div className="player-form">
      <input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="선수 이름"/>
      <select value={f.tier} onChange={e=>setF({...f,tier:e.target.value})}>{TIERS.map(t=><option key={t}>{t}</option>)}</select>
      <select value={f.main} onChange={e=>setF({...f,main:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <select value={f.sub} onChange={e=>setF({...f,sub:e.target.value})}><option>없음</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <input type="number" min="0" value={f.basePoint} onChange={e=>setF({...f,basePoint:Number(e.target.value)||0})} placeholder="기본 포인트"/>
      <button className="primary-btn" onClick={add}>선수 추가</button>
    </div>
    <div className="player-table">
      <div className="table-head"><span>선수</span><span>티어</span><span>주라인</span><span>부라인</span><span>기본P</span><span>상태</span><span/></div>
      {players.map(p=><div className="table-row" key={p.id}>
        <b>{p.name}</b><span>{p.tier}</span><span>{p.main}</span><span>{p.sub||'없음'}</span><span>{Number(p.basePoint??100)}P</span>
        <span className={`wait-tag ${p.status}`}>{p.status==='waiting'?'대기':p.status==='sold'?'낙찰':'유찰 매물'}</span>
        <div className="row-actions">
          {p.status!=='waiting'&&<button onClick={()=>setPlayers(ps=>ps.map(x=>x.id===p.id?{...x,status:'waiting',excluded:false,basePoint:100}:x))}>복구</button>}
          <button onClick={()=>setPlayers(ps=>ps.filter(x=>x.id!==p.id))}>삭제</button>
        </div>
      </div>)}
    </div>
  </section>;
}
function FullPlayerList({players,teams,setActive,setCurrentPlayerId}){
  const [filter,setFilter]=useState('ALL');
  const shown=players.filter(p=>filter==='ALL'||p.main===filter);
  const choose=(p)=>{setCurrentPlayerId(p.id);setActive('auction')};
  return <section className="team-list-screen full-list-page">
    <div className="panel-title page-switch-title">
      <div><span>PLAYER DATABASE</span><h2>전체목록</h2></div>
      <div className="page-switch-buttons">
        <button className="active">전체목록</button>
        <button onClick={()=>setActive('teams')}>팀 목록</button>
      </div>
    </div>
    <div className="list-filter-large">{['ALL',...ROLES].map(r=><button key={r} className={filter===r?'active':''} onClick={()=>setFilter(r)}>{r}</button>)}</div>
    <div className="standalone-player-grid">
      {shown.map(p=>{
        const team=teams.find(t=>t.id===p.soldTeamId);
        const roles=`${p.main}${p.sub&&p.sub!=='없음'?` / ${p.sub}`:''}`;
        return <button key={p.id} className={`arena-player-card standalone ${p.status==='sold'?'completed':''} ${p.status==='unsold'?'unsold':''}`} onClick={()=>['waiting','unsold'].includes(p.status)&&choose(p)}>
          <div className="card-topline"><span>{p.tier}</span><b>{roles}</b></div>
          <div className="card-portrait"><div className="portrait-placeholder"><span>{p.name.slice(0,2)}</span></div></div>
          <div className="card-center-name">{p.name}</div>
          <div className="card-base-point">{Number(p.basePoint??100).toLocaleString()}P</div>
          {p.status==='sold'&&<div className="card-stamp"><strong>선택 완료</strong><span>{team?.name} · {p.soldPrice}P</span></div>}
          {p.status==='unsold'&&<div className="card-stamp unsold-stamp"><strong>유찰</strong></div>}
        </button>
      })}
    </div>
  </section>;
}

function TeamList({teams,setActive}){
  return <section className="team-list-screen">
    <div className="panel-title page-switch-title"><div><span>TEAM DATABASE</span><h2>팀 목록</h2></div><div className="page-switch-buttons"><button onClick={()=>setActive('list')}>전체목록</button><button className="active">팀 목록</button></div></div>
    <div className="team-list-grid">
      {teams.map((team,index)=><article className={`team-list-card palette-${Number(team.colorIndex??index)%8}`} key={team.id}>
        <header><div><small>TEAM {String(index+1).padStart(2,'0')}</small><h3>{team.name}</h3></div><strong>{team.points.toLocaleString()}P</strong></header>
        <div className="team-list-members">
          {team.roster.length?team.roster.map(m=><div className="team-list-member" key={`${team.id}-${m.id}`}>
            <div className="mini-avatar">{(m.name||'?').slice(0,2)}</div>
            <div><b>{m.name}</b><small>{m.tier} · {m.main}{m.sub&&m.sub!=='없음'?`/${m.sub}`:''}</small></div>
            <strong>{Number(m.price||0).toLocaleString()}P</strong>
          </div>):<div className="team-list-empty">아직 영입한 선수가 없습니다.</div>}
        </div>
      </article>)}
    </div>
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
  livePrice,liveTeamName,liveTimer,spectatorEvent,unsoldList
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
        <h2><TournamentTitle title={settings.title}/></h2>
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

    <section className="spectator-unsold-section">
      <div className="spectator-section-title"><div><span>UNSOLD PLAYERS</span><h3>유찰 선수</h3></div><b>{unsoldList.length}명</b></div>
      <div className="spectator-unsold-list">
        {unsoldList.length?unsoldList.slice(0,12).map(x=><div className="spectator-unsold-row" key={x.id}><div><b>{x.player}</b><small>{x.tier||''}{x.main?` · ${x.main}/${x.sub}`:''}</small></div><span>{x.time}</span></div>):<div className="watch-empty">현재 유찰된 선수가 없습니다.</div>}
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

function Presentation({settings,teams,players,recent,currentPlayerId,livePrice,liveTeamName,liveTimer,spectatorEvent,unsoldList}){
 const current=players.find(p=>p.id===currentPlayerId);
 const [rName,setRName]=useState('대기 중'); const [rActive,setRActive]=useState(false);
 useEffect(()=>{const e=spectatorEvent;if(!e)return;if(e.type==='roulette-start'){setRActive(true);setRName('추첨 시작')}if(e.type==='roulette-preview'){setRActive(true);setRName(e.name)}if(e.type==='roulette-result'){setRActive(false);setRName(e.player?.name||'결과')}},[spectatorEvent]);
 return <div className="presentation-screen"><header><div><span>GOCHUBAT AUCTION</span><h1>{settings.title}</h1></div><div className="presentation-timer">{liveTimer}</div></header><main><section className="presentation-player"><div className="presentation-role">{current?.main??'?'}</div><div><small>{current?.tier??'선수 없음'}</small><h2>{current?.name??'다음 룰렛 대기'}</h2><p>{current?`${current.main} / ${current.sub}`:'룰렛을 기다리는 중'}</p></div></section><section className="presentation-bid"><span>현재 입찰가</span><strong>{Number(livePrice||0).toLocaleString()}P</strong><p>{liveTeamName||'입찰 팀 없음'}</p></section><section className="presentation-roulette"><div className={rActive?'presentation-wheel active':'presentation-wheel'}><Dices size={40}/></div><strong>{rName}</strong><small>{rActive?'룰렛 진행 중':'다음 추첨 대기'}</small></section></main><footer><div className="presentation-teams">{teams.map(t=><article key={t.id}><header><b>{t.name}</b><strong>{t.points.toLocaleString()}P</strong></header><div>{t.roster.map(m=><span key={`${t.id}-${m.id}`}>{m.name}<i>{m.price}P</i></span>)}</div></article>)}</div><div className="presentation-side"><section><h3>최근 낙찰</h3>{recent.slice(0,5).map(x=><p key={x.id}>{x.player}<b>{x.team} · {x.price}P</b></p>)}</section><section><h3>유찰</h3>{unsoldList.slice(0,5).map(x=><p key={x.id}>{x.player}</p>)}</section></div></footer></div>;
}

export default function Home(){
  const [active,setActive]=useState('auction');
  useEffect(()=>{const fn=()=>setActive('teams');window.addEventListener('go-team-list',fn);return()=>window.removeEventListener('go-team-list',fn)},[]);
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [players,setPlayers]=useState(DEFAULT_PLAYERS);
  const [teams,setTeams]=useState(makeTeams(DEFAULT_SETTINGS));
  const [recent,setRecent]=useState([]);
  const [currentPlayerId,setCurrentPlayerId]=useState(null);
  const [spectatorEvent,setSpectatorEvent]=useState(null);
  const [unsoldList,setUnsoldList]=useState([]);
  const [roomStatus,setRoomStatus]=useState({connected:false,roomCode:'GOCHU1',adminKey:''});
  const [livePrice,setLivePrice]=useState(0);
  const [liveTeamName,setLiveTeamName]=useState('');
  const [liveTimer,setLiveTimer]=useState(DEFAULT_SETTINGS.timer);
  const [ready,setReady]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem(KEY);if(raw){const x=JSON.parse(raw);const s={...DEFAULT_SETTINGS,...x.settings};setSettings(s);setPlayers(x.players||DEFAULT_PLAYERS);setTeams(makeTeams(s,x.teams||[]));setRecent(x.recent||[]);setCurrentPlayerId(x.currentPlayerId??null);}}catch{}setReady(true)},[]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY,JSON.stringify({settings,players,teams,recent,currentPlayerId,unsoldList}));},[ready,settings,players,teams,recent,currentPlayerId,unsoldList]);

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

  const sharedState=()=>({settings,players,teams,recent,unsoldList,currentPlayerId,livePrice,liveTeamName,liveTimer,spectatorEvent});
  const onStateChanged=async(extra={})=>{if(!supabase||!roomStatus.connected||!roomStatus.adminKey)return;await supabase.rpc('update_auction_room',{p_room_code:roomStatus.roomCode,p_admin_key:roomStatus.adminKey,p_state:{...sharedState(),...extra},p_event:extra.spectatorEvent||spectatorEvent||null});};
  useEffect(()=>{if(!supabase||!roomStatus.connected)return;let ch;(async()=>{const {data}=await supabase.from('auction_rooms').select('state').eq('room_code',roomStatus.roomCode).maybeSingle();if(data?.state){const x=data.state;if(x.settings)setSettings(x.settings);if(x.players)setPlayers(x.players);if(x.teams)setTeams(x.teams);if(x.recent)setRecent(x.recent);if(x.unsoldList)setUnsoldList(x.unsoldList);if('currentPlayerId'in x)setCurrentPlayerId(x.currentPlayerId)}ch=supabase.channel('room-'+roomStatus.roomCode).on('postgres_changes',{event:'UPDATE',schema:'public',table:'auction_rooms',filter:`room_code=eq.${roomStatus.roomCode}`},({new:n})=>{const x=n.state||{};if(x.settings)setSettings(x.settings);if(x.players)setPlayers(x.players);if(x.teams)setTeams(x.teams);if(x.recent)setRecent(x.recent);if(x.unsoldList)setUnsoldList(x.unsoldList);if('currentPlayerId'in x)setCurrentPlayerId(x.currentPlayerId);if(x.spectatorEvent)setSpectatorEvent(x.spectatorEvent);if('livePrice'in x)setLivePrice(x.livePrice||0);if('liveTeamName'in x)setLiveTeamName(x.liveTeamName||'');if('liveTimer'in x)setLiveTimer(x.liveTimer)}).subscribe()})();return()=>{if(ch)supabase.removeChannel(ch)}},[roomStatus.connected,roomStatus.roomCode]);

  let view=<Auction players={players} setPlayers={setPlayers} teams={teams} setTeams={setTeams} settings={settings} recent={recent} setRecent={setRecent} currentPlayerId={currentPlayerId} setCurrentPlayerId={setCurrentPlayerId}
      spectatorEvent={spectatorEvent} setSpectatorEvent={setSpectatorEvent} unsoldList={unsoldList} setUnsoldList={setUnsoldList} onStateChanged={onStateChanged}/>;
  if(active==='list')view=<FullPlayerList players={players} teams={teams} setActive={setActive} setCurrentPlayerId={setCurrentPlayerId}/>;
  if(active==='teams')view=<TeamList teams={teams} setActive={setActive}/>;
  if(active==='players')view=<Players players={players} setPlayers={setPlayers}/>;

  if(active==='settings')view=<SettingsView settings={settings} setSettings={setSettings} teams={teams} setTeams={setTeams}/>;
  return <AppShell active={active} setActive={setActive} settings={settings} roomStatus={roomStatus}>{view}</AppShell>;
}
