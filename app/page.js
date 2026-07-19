'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Users, Gavel, Dices, Settings, Eye, Trophy, Clock3, UserRoundCog, RotateCcw, Save, History, Sparkles, Plus, Trash2, Maximize2, Wifi, WifiOff, KeyRound, List, Volume2, VolumeX } from 'lucide-react';

const KEY = 'gochubat-v02';
const UNDO_KEY = 'gochubat-v02-undo';
const PLAYER_SLOT_KEY = 'gochubat-v02-player-slots';
const TOURNAMENT_SLOT_KEY = 'gochubat-v02-tournament-slots';
const ROLES = ['TOP','JUG','MID','ADC','SUP'];
const TIERS = ['챌린저','그랜드마스터','마스터','다이아몬드','에메랄드','플래티넘','골드','실버','브론즈','아이언'];
const DEFAULT_SETTINGS = {
  title: '제3회 관동지방컵', teamCount: 5, timer: 15,
  resetOnBid: true, sound: true, animation: true,
  bidSteps: [10,20,50,100],
  teamNames: ['1팀','2팀','3팀','4팀','5팀'],
  teamPoints: [1000,1000,1000,1000,1000]
};

const TIER_SCORE = {'챌린저':1000,'그랜드마스터':900,'마스터':800,'다이아몬드':700,'에메랄드':600,'플래티넘':500,'골드':400,'실버':300,'브론즈':200,'아이언':100};
function secureRandomIndex(length){
  if(length<=1) return 0;
  try{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%length;}catch{return Math.floor(Math.random()*length)}
}
function shuffled(list){
  const a=[...list];
  for(let i=a.length-1;i>0;i--){const j=secureRandomIndex(i+1);[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function averageTier(roster=[]){
  if(!roster.length)return '미정';
  const avg=roster.reduce((sum,p)=>sum+(TIER_SCORE[p.tier]||0),0)/roster.length;
  return Object.entries(TIER_SCORE).sort((a,b)=>Math.abs(a[1]-avg)-Math.abs(b[1]-avg))[0]?.[0]||'미정';
}

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
    ['pinball','핀볼'],
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
  spectatorEvent,setSpectatorEvent,unsoldList,setUnsoldList,onStateChanged,
  undoStack,setUndoStack,auctionLog,setAuctionLog
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

  const snapshot=(label='작업')=>{
    const snap={label,at:Date.now(),players,teams,recent,unsoldList,currentPlayerId,auctionLog};
    setUndoStack(s=>[...s.slice(-39),snap]);
  };

  const choosePlayer=(player,openFocus=true)=>{
    if(!player||!['waiting','unsold'].includes(player.status))return;
    setCurrentPlayerId(player.id);
    setRouletteName(player.name);
    setSelectedTeam(null);
    setPriceInput('');
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

    const picked=pool[secureRandomIndex(pool.length)];
    const previewOrder=shuffled(pool);
    setRouletteMode(mode);
    setView('board');
    setSpinning(true);
    setRouletteItems(previewOrder);
    setRouletteStep(0);
    playUiSound('select', settings.sound);
    pushEvent({type:'roulette-start',mode});

    let tick=0;
    const total=Math.max(26, previewOrder.length*5);
    const run=()=>{
      const preview=tick===total-1?picked:previewOrder[secureRandomIndex(previewOrder.length)];
      setRouletteStep(tick%previewOrder.length);
      setRouletteName(preview.name);
      setCurrentPlayerId(preview.id);
      if(tick%2===0)playUiSound('tick',settings.sound);
      pushEvent({type:'roulette-preview',name:preview.name,mode});
      tick+=1;
      if(tick>=total){
        setRouletteName(picked.name);
        setCurrentPlayerId(picked.id);
        pushEvent({type:'roulette-result',player:picked,mode});
        playUiSound('result',settings.sound);
        setSpinning(false);
        setTimeout(()=>setView('focus'),650);
        return;
      }
      const delay=Math.min(300,55+tick*8.5);
      setTimeout(run,delay);
    };
    run();
  };
  const openAssign=(team)=>{
    if(!current)return alert('먼저 선수를 선택하세요.');
    if(!['waiting','unsold'].includes(current.status))return;
    setSelectedTeam(team.id);
    if(priceInput === '') setPriceInput('0');
    playUiSound('bid', settings.sound);
    setAssignModal(true);
  };

  const confirmAssign=()=>{
    const team=teams.find(t=>t.id===selectedTeam);
    const price=Math.max(0,Number(priceInput)||0);
    if(!current||!team)return;
    if(price>team.points)return alert('팀 보유 포인트보다 낙찰가가 큽니다.');

    snapshot(`${current.name} 낙찰`);

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
    setAuctionLog(l=>[{id:Date.now()+1,type:'sold',text:`${current.name} → ${team.name} ${price.toLocaleString()}P 낙찰`,time:sale.time},...l].slice(0,100));
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
    snapshot(`${current.name} 유찰`);
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
    setAuctionLog(l=>[{id:Date.now()+2,type:'unsold',text:`${current.name} 유찰`,time:entry.time},...l].slice(0,100));
    setOverlay({type:'unsold',player:current.name});
    playUiSound('unsold', settings.sound);
    pushEvent({type:'unsold',player:current.name,entry});
    setCurrentPlayerId(null);
    setRouletteName('룰렛 대기');
    setView('board');
    setTimeout(()=>setOverlay(null),1500);
  };

  const undo=()=>{
    const x=undoStack.at(-1);
    if(!x)return alert('되돌릴 작업이 없습니다.');
    setPlayers(x.players);
    setTeams(x.teams);
    setRecent(x.recent);
    setUnsoldList?.(x.unsoldList||[]);
    setCurrentPlayerId(x.currentPlayerId);
    setAuctionLog(x.auctionLog||[]);
    setUndoStack(s=>s.slice(0,-1));
    setAuctionLog(l=>[{id:Date.now(),type:'undo',text:`되돌리기 · ${x.label||'마지막 작업'}`,time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})},...l].slice(0,100));
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
    title={`${team.name} · 평균 ${averageTier(team.roster)} · ${team.roster.length}명 · ${team.points.toLocaleString()}P`}
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

      <section className="auction-log-panel">
        <header><div><span>AUCTION LOG</span><h3>경매 로그</h3></div><b>{auctionLog.length}건</b></header>
        <div>{auctionLog.slice(0,8).map(x=><p key={x.id}><span>{x.time}</span><b>{x.text}</b></p>)}{!auctionLog.length&&<small>아직 기록이 없습니다.</small>}</div>
      </section>

      <footer className="arena-status-footer">
        <span>전체 {players.length}명</span>
        <span>대기 {waiting.length}명</span>
        <span>낙찰 {players.filter(p=>p.status==='sold').length}명</span>
        <span>유찰 {players.filter(p=>p.status==='unsold').length}명</span>
      </footer>
    </div>
  </>;
}

function Players({players,setPlayers,savePlayerSlot,loadPlayerSlot,playerSlots}) {
  const [f,setF]=useState({name:'',tier:'마스터',main:'TOP',sub:'없음'});
  const add=()=>{
    if(!f.name.trim())return;
    setPlayers(p=>[...p,{id:Date.now(),...f,status:'waiting',excluded:false,imageUrl:''}]);
    setF({name:'',tier:'마스터',main:'TOP',sub:'없음'});
  };
  const [slotName,setSlotName]=useState('제3회 관동지방컵 명단');
  return <section className="panel full-panel">
    <div className="panel-title"><div><span>PLAYER DATABASE</span><h2>선수 관리</h2></div><b>{players.length}명</b></div>
    <div className="slot-toolbar"><input value={slotName} onChange={e=>setSlotName(e.target.value)} placeholder="명단 슬롯 이름"/><button onClick={()=>savePlayerSlot(slotName)}>명단 저장</button><select onChange={e=>e.target.value&&loadPlayerSlot(e.target.value)} defaultValue=""><option value="">저장 명단 불러오기</option>{playerSlots.map(x=><option key={x.name} value={x.name}>{x.name} · {x.players.length}명</option>)}</select></div>
    <div className="player-form">
      <input value={f.name} onChange={e=>setF({...f,name:e.target.value})} placeholder="선수 이름"/>
      <select value={f.tier} onChange={e=>setF({...f,tier:e.target.value})}>{TIERS.map(t=><option key={t}>{t}</option>)}</select>
      <select value={f.main} onChange={e=>setF({...f,main:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <select value={f.sub} onChange={e=>setF({...f,sub:e.target.value})}><option>없음</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <button className="primary-btn" onClick={add}>선수 추가</button>
    </div>
    <div className="player-table">
      <div className="table-head"><span>선수</span><span>티어</span><span>주라인</span><span>부라인</span><span>상태</span><span/></div>
      {players.map(p=><div className="table-row" key={p.id}>
        <b>{p.name}</b><span>{p.tier}</span><span>{p.main}</span><span>{p.sub||'없음'}</span>
        <span className={`wait-tag ${p.status}`}>{p.status==='waiting'?'대기':p.status==='sold'?'낙찰':'유찰 매물'}</span>
        <div className="row-actions">
          {p.status!=='waiting'&&<button onClick={()=>setPlayers(ps=>ps.map(x=>x.id===p.id?{...x,status:'waiting',excluded:false}:x))}>복구</button>}
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
          <div className="premium-card-content">
            <span className="premium-tier">{p.tier}</span>
            <b className="premium-role">{roles}</b>
            <strong className="premium-name">{p.name}</strong>
          </div>
          <div className="premium-card-status-zone">
            {p.status==='sold'&&<div className="card-stamp sold-stamp"><strong>선택 완료</strong><span>{team?.name} · {Number(p.soldPrice||0).toLocaleString()}P</span></div>}
            {p.status==='unsold'&&<div className="card-stamp unsold-stamp"><strong>유찰</strong></div>}
          </div>
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
        <header><div><small>TEAM {String(index+1).padStart(2,'0')} · 평균 {averageTier(team.roster)}</small><h3>{team.name}</h3></div><strong>{team.points.toLocaleString()}P</strong></header>
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

function SettingsView({settings,setSettings,teams,setTeams,onResetAll}) {
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

  const [slotName,setSlotName]=useState('제3회 관동지방컵 명단');
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
      <button onClick={resetTeams}><RotateCcw size={16}/> 팀 초기화</button><button className="danger-btn" onClick={onResetAll}><Trash2 size={16}/> 전체 초기화</button>
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


const DEFAULT_PINBALL = {
  participants: '정우, 승호, 준표, 창용, 지훈',
  selectedMap: 'classic',
  mapNames: {
    classic: '클래식 레이스',
    zigzag: '지그재그 협곡',
    spinner: '회전문 난투',
    maze: '미로 탈출',
    chaos: '대혼돈 구역'
  },
  winnerMode: 'first',
  cameraMode: 'auto',
  speed: 1
};

const PB_MAPS = {
  classic: { height: 2100, obstacles: [
    ['line',120,210,520,270],['line',680,210,280,270],['peggrid',180,420,9,5,58,54],
    ['line',80,820,400,900],['line',720,820,400,900],['spinner',400,1080,180],
    ['peggrid',150,1280,10,5,56,54],['line',90,1670,330,1730],['line',710,1670,470,1730]
  ]},
  zigzag: { height: 2350, obstacles: [
    ['line',80,240,610,400],['line',720,520,190,680],['line',80,800,610,960],
    ['spinner',400,1120,160],['line',720,1300,190,1460],['line',80,1580,610,1740],
    ['peggrid',160,1850,9,4,60,56]
  ]},
  spinner: { height: 2300, obstacles: [
    ['spinner',400,350,210],['spinner',250,760,150],['spinner',550,760,150],
    ['peggrid',150,980,10,5,56,54],['spinner',400,1450,220],
    ['line',80,1780,350,1840],['line',720,1780,450,1840]
  ]},
  maze: { height: 2500, obstacles: [
    ['line',80,260,570,260],['line',720,470,230,470],['line',80,680,540,680],
    ['line',720,890,270,890],['line',80,1100,520,1100],['line',720,1310,300,1310],
    ['spinner',400,1540,145],['peggrid',150,1740,10,5,56,56],
    ['line',90,2160,330,2210],['line',710,2160,470,2210]
  ]},
  chaos: { height: 2700, obstacles: [
    ['peggrid',145,260,10,6,57,52],['spinner',240,720,140],['spinner',560,720,140],
    ['line',70,1010,590,1090],['line',730,1180,210,1260],['peggrid',150,1390,10,6,56,52],
    ['spinner',400,1840,230],['line',80,2110,350,2190],['line',720,2110,450,2190],
    ['peggrid',180,2320,9,4,58,52]
  ]}
};

function Pinball({config,setConfig}) {
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const rafRef = useRef(null);
  const [running,setRunning]=useState(false);
  const [paused,setPaused]=useState(false);
  const [rankings,setRankings]=useState([]);
  const [leader,setLeader]=useState('대기 중');
  const [status,setStatus]=useState('이름을 입력하고 시작하세요.');
  const [editingMap,setEditingMap]=useState(false);

  const names=useMemo(()=>String(config.participants||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).slice(0,40),[config.participants]);
  const map=PB_MAPS[config.selectedMap]||PB_MAPS.classic;

  const updateConfig=(patch)=>setConfig(c=>({...c,...patch}));
  const shuffleNames=()=>updateConfig({participants:shuffled(names).join(', ')});
  const resetRace=()=>{
    cancelAnimationFrame(rafRef.current);
    simRef.current=null; setRunning(false); setPaused(false); setRankings([]); setLeader('대기 중'); setStatus('초기화되었습니다.');
    const c=canvasRef.current;if(c){const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);drawPreview(ctx,c,map,config.mapNames[config.selectedMap]);}
  };

  useEffect(()=>{
    const c=canvasRef.current;if(!c)return;
    c.width=800;c.height=760;
    const ctx=c.getContext('2d');drawPreview(ctx,c,map,config.mapNames[config.selectedMap]);
    return()=>cancelAnimationFrame(rafRef.current);
  },[config.selectedMap,config.mapNames]);

  function drawPreview(ctx,c,m,title){
    ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#080a10';ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='#d6b96b';ctx.font='700 22px sans-serif';ctx.fillText(title||'핀볼 맵',28,38);
    ctx.fillStyle='#777';ctx.font='14px sans-serif';ctx.fillText('시작하면 선두 공을 따라 카메라가 이동합니다.',28,62);
    const scale=.27, oy=90;
    drawMap(ctx,m,scale,oy,0);
  }

  function drawMap(ctx,m,scale,oy,cameraY){
    ctx.save();ctx.translate(0,oy-cameraY*scale);
    ctx.strokeStyle='#c8a95e';ctx.lineWidth=5;ctx.fillStyle='#c8a95e';
    ctx.beginPath();ctx.moveTo(36*scale,0);ctx.lineTo(36*scale,m.height*scale);ctx.stroke();
    ctx.beginPath();ctx.moveTo(764*scale,0);ctx.lineTo(764*scale,m.height*scale);ctx.stroke();
    for(const o of m.obstacles){
      if(o[0]==='line'){ctx.lineWidth=11;ctx.beginPath();ctx.moveTo(o[1]*scale,o[2]*scale);ctx.lineTo(o[3]*scale,o[4]*scale);ctx.stroke();}
      if(o[0]==='spinner'){ctx.lineWidth=13;ctx.save();ctx.translate(o[1]*scale,o[2]*scale);ctx.rotate((performance.now()/900)%(Math.PI*2));ctx.beginPath();ctx.moveTo(-o[3]*scale,0);ctx.lineTo(o[3]*scale,0);ctx.stroke();ctx.restore();}
      if(o[0]==='peggrid')for(let r=0;r<o[4];r++)for(let col=0;col<o[3];col++){const x=(o[1]+col*o[5]+(r%2?o[5]/2:0))*scale,y=(o[2]+r*o[6])*scale;ctx.beginPath();ctx.arc(x,y,8*scale,0,Math.PI*2);ctx.fill();}
    }
    ctx.strokeStyle='#f2d889';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(80*scale,(m.height-90)*scale);ctx.lineTo(720*scale,(m.height-90)*scale);ctx.stroke();
    ctx.restore();
  }

  const startRace=()=>{
    if(names.length<2)return alert('참가자를 2명 이상 입력하세요.');
    resetRace();
    const c=canvasRef.current,ctx=c.getContext('2d');
    const palette=['#ff7d7d','#e8ff72','#72efb3','#78a9f5','#d67af5','#ffad66','#6de1e8','#f58ac5','#a8e06f','#f6d365'];
    const balls=shuffled(names).map((name,i)=>({name,x:120+(i%(Math.min(8,names.length)))*72+Math.random()*18,y:80-Math.floor(i/8)*42,vx:(Math.random()-.5)*2,vy:0,r:18,color:palette[i%palette.length],done:false,finish:0}));
    simRef.current={balls,rank:[],cameraY:0,last:performance.now(),spinner:0,paused:false};setRunning(true);setPaused(false);setRankings([]);setStatus('레이스 진행 중');

    const frame=(now)=>{
      const s=simRef.current;if(!s)return;
      const dt=Math.min(.028,(now-s.last)/1000)*(config.speed||1);s.last=now;
      if(!s.paused){
        s.spinner+=dt*1.3;
        for(const b of s.balls.filter(x=>!x.done)){
          b.vy+=520*dt;b.x+=b.vx*60*dt;b.y+=b.vy*dt;
          if(b.x-b.r<42){b.x=42+b.r;b.vx=Math.max(0,b.vx)*.08}
          if(b.x+b.r>758){b.x=758-b.r;b.vx=Math.min(0,b.vx)*.08}
          collideObstacles(b,map,s.spinner);
          if(b.y>map.height-85){b.done=true;b.finish=now;s.rank.push(b.name);setRankings([...s.rank]);}
        }
        const alive=s.balls.filter(x=>!x.done);
        // 공끼리는 서로 통과하도록 두어 충돌 시 밀쳐지거나 속도가 바뀌지 않게 합니다.
        const lead=alive.sort((a,b)=>b.y-a.y)[0];
        if(lead){setLeader(lead.name);const target=Math.max(0,lead.y-360);s.cameraY+=(target-s.cameraY)*.055;}
        if(!alive.length){setRunning(false);const winner=config.winnerMode==='last'?s.rank[s.rank.length-1]:s.rank[0];setStatus(`당첨: ${winner}`);drawScene(ctx,c,s,map,config);return;}
      }
      drawScene(ctx,c,s,map,config);rafRef.current=requestAnimationFrame(frame);
    };
    rafRef.current=requestAnimationFrame(frame);
  };

  const winner = rankings.length===names.length ? (config.winnerMode==='last'?rankings[rankings.length-1]:rankings[0]) : null;

  return <section className="pinball-page">
    <div className="pinball-toolbar card">
      <div><span className="eyebrow">PINBALL RANDOM RACE</span><h2>{config.mapNames[config.selectedMap]}</h2><p>실제 물리 움직임과 도착 순서로 결과가 결정됩니다.</p></div>
      <div className="pinball-actions"><button onClick={shuffleNames}>이름 섞기</button><button onClick={()=>setPaused(p=>{const next=!p;if(simRef.current)simRef.current.paused=next;return next})} disabled={!running}>{paused?'재개':'일시정지'}</button><button onClick={resetRace}>초기화</button><button className="primary" onClick={startRace}>시작</button></div>
    </div>

    <div className="pinball-grid">
      <div className="pinball-stage-wrap">
        <canvas ref={canvasRef} className="pinball-canvas" aria-label="실시간 핀볼 레이스 맵"/>
        <div className="pinball-camera-chip">자동 카메라 · 선두 추적: <b>{leader}</b></div>
      </div>
      <aside className="pinball-side">
        <div className="card pinball-rank-card"><div className="section-head"><h3>실시간 골인 순위</h3><span>{rankings.length}/{names.length}</span></div>
          <ol>{Array.from({length:names.length},(_,i)=><li key={i} className={rankings[i]?'done':''}><b>{i+1}</b><span>{rankings[i]||'진행 중'}</span></li>)}</ol>
          <div className="pinball-result" aria-live="polite">{winner?`당첨자 · ${winner}`:status}</div>
        </div>
        <div className="card pinball-controls">
          <label>참가자 이름<textarea value={config.participants} onChange={e=>updateConfig({participants:e.target.value})} placeholder="정우, 승호, 준표"/></label>
          <label>맵 선택<select value={config.selectedMap} onChange={e=>updateConfig({selectedMap:e.target.value})}>{Object.keys(PB_MAPS).map(id=><option key={id} value={id}>{config.mapNames[id]}</option>)}</select></label>
          <button className="map-name-toggle" onClick={()=>setEditingMap(v=>!v)}>맵 이름 설정</button>
          {editingMap&&<div className="map-name-editor">{Object.keys(PB_MAPS).map(id=><label key={id}>{id}<input value={config.mapNames[id]} onChange={e=>setConfig(c=>({...c,mapNames:{...c.mapNames,[id]:e.target.value}}))}/></label>)}</div>}
          <fieldset><legend>당첨 기준</legend><label><input type="radio" checked={config.winnerMode==='first'} onChange={()=>updateConfig({winnerMode:'first'})}/> 첫 번째 골인</label><label><input type="radio" checked={config.winnerMode==='last'} onChange={()=>updateConfig({winnerMode:'last'})}/> 마지막 골인</label></fieldset>
          <label>속도<select value={config.speed} onChange={e=>updateConfig({speed:Number(e.target.value)})}><option value={.75}>느림</option><option value={1}>보통</option><option value={1.35}>빠름</option></select></label>
        </div>
      </aside>
    </div>
  </section>;
}

function collideObstacles(b,map,angle){for(const o of map.obstacles){if(o[0]==='line')collideLine(b,o[1],o[2],o[3],o[4]);if(o[0]==='spinner'){const ca=Math.cos(angle),sa=Math.sin(angle),len=o[3],x1=o[1]-ca*len,y1=o[2]-sa*len,x2=o[1]+ca*len,y2=o[2]+sa*len;collideLine(b,x1,y1,x2,y2,true)}if(o[0]==='peggrid')for(let r=0;r<o[4];r++)for(let c=0;c<o[3];c++)collidePeg(b,o[1]+c*o[5]+(r%2?o[5]/2:0),o[2]+r*o[6],9);}}
function collidePeg(b,x,y,r){const dx=b.x-x,dy=b.y-y,d=Math.hypot(dx,dy),min=b.r+r;if(!d||d>=min)return;const nx=dx/d,ny=dy/d;b.x=x+nx*min;b.y=y+ny*min;const dot=b.vx*nx+b.vy*ny;b.vx=(b.vx-2*dot*nx)*.84+(Math.random()-.5)*.5;b.vy=(b.vy-2*dot*ny)*.84;}
function collideLine(b,x1,y1,x2,y2,boost=false){const vx=x2-x1,vy=y2-y1,l2=vx*vx+vy*vy;let t=((b.x-x1)*vx+(b.y-y1)*vy)/l2;t=Math.max(0,Math.min(1,t));const px=x1+t*vx,py=y1+t*vy,dx=b.x-px,dy=b.y-py,d=Math.hypot(dx,dy);if(!d||d>=b.r+7)return;const nx=dx/d,ny=dy/d;b.x=px+nx*(b.r+7);b.y=py+ny*(b.r+7);const dot=b.vx*nx+b.vy*ny;b.vx=(b.vx-2*dot*nx)*.82+(boost?(Math.random()-.5)*1.5:0);b.vy=(b.vy-2*dot*ny)*.82;}
function drawScene(ctx,c,s,map,config){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#080a10';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#d6b96b';ctx.font='700 21px sans-serif';ctx.fillText(config.mapNames[config.selectedMap],24,32);ctx.fillStyle='#8e8e8e';ctx.font='13px sans-serif';ctx.fillText(`선두 추적 · ${s.balls.filter(x=>!x.done).sort((a,b)=>b.y-a.y)[0]?.name||'완료'}`,24,54);ctx.save();ctx.translate(0,72-s.cameraY);ctx.strokeStyle='#c8a95e';ctx.fillStyle='#c8a95e';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(38,0);ctx.lineTo(38,map.height);ctx.stroke();ctx.beginPath();ctx.moveTo(762,0);ctx.lineTo(762,map.height);ctx.stroke();for(const o of map.obstacles){if(o[0]==='line'){ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(o[1],o[2]);ctx.lineTo(o[3],o[4]);ctx.stroke()}if(o[0]==='spinner'){ctx.lineWidth=14;ctx.save();ctx.translate(o[1],o[2]);ctx.rotate(s.spinner);ctx.beginPath();ctx.moveTo(-o[3],0);ctx.lineTo(o[3],0);ctx.stroke();ctx.restore()}if(o[0]==='peggrid')for(let r=0;r<o[4];r++)for(let col=0;col<o[3];col++){ctx.beginPath();ctx.arc(o[1]+col*o[5]+(r%2?o[5]/2:0),o[2]+r*o[6],9,0,Math.PI*2);ctx.fill()}}ctx.strokeStyle='#f2d889';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(80,map.height-90);ctx.lineTo(720,map.height-90);ctx.stroke();for(const b of s.balls.filter(x=>!x.done)){ctx.fillStyle=b.color;ctx.strokeStyle='#111';ctx.lineWidth=3;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle=b.color;ctx.font='700 15px sans-serif';ctx.textAlign='center';ctx.fillText(b.name,b.x,b.y+b.r+18)}ctx.restore();}

export default function Home(){
  const [active,setActive]=useState('auction');
  const [pinballConfig,setPinballConfig]=useState(DEFAULT_PINBALL);
  useEffect(()=>{const fn=()=>setActive('teams');window.addEventListener('go-team-list',fn);return()=>window.removeEventListener('go-team-list',fn)},[]);
  const [settings,setSettings]=useState(DEFAULT_SETTINGS);
  const [players,setPlayers]=useState(DEFAULT_PLAYERS);
  const [teams,setTeams]=useState(makeTeams(DEFAULT_SETTINGS));
  const [recent,setRecent]=useState([]);
  const [auctionLog,setAuctionLog]=useState([]);
  const [undoStack,setUndoStack]=useState([]);
  const [playerSlots,setPlayerSlots]=useState([]);
  const [currentPlayerId,setCurrentPlayerId]=useState(null);
  const [spectatorEvent,setSpectatorEvent]=useState(null);
  const [unsoldList,setUnsoldList]=useState([]);
  const [roomStatus,setRoomStatus]=useState({connected:false,roomCode:'GOCHU1',adminKey:''});
  const [livePrice,setLivePrice]=useState(0);
  const [liveTeamName,setLiveTeamName]=useState('');
  const [liveTimer,setLiveTimer]=useState(DEFAULT_SETTINGS.timer);
  const [ready,setReady]=useState(false);
  useEffect(()=>{try{const raw=localStorage.getItem(KEY);if(raw){const x=JSON.parse(raw);const s={...DEFAULT_SETTINGS,...x.settings};setSettings(s);if(x.pinballConfig)setPinballConfig({...DEFAULT_PINBALL,...x.pinballConfig,mapNames:{...DEFAULT_PINBALL.mapNames,...(x.pinballConfig.mapNames||{})}});setPlayers(x.players||DEFAULT_PLAYERS);setTeams(makeTeams(s,x.teams||[]));setRecent(x.recent||[]);setAuctionLog(x.auctionLog||[]);setCurrentPlayerId(x.currentPlayerId??null);const u=localStorage.getItem(UNDO_KEY);if(u)setUndoStack(JSON.parse(u));const ps=localStorage.getItem(PLAYER_SLOT_KEY);if(ps)setPlayerSlots(JSON.parse(ps));}}catch{}setReady(true)},[]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY,JSON.stringify({settings,players,teams,recent,auctionLog,currentPlayerId,unsoldList,pinballConfig}));localStorage.setItem(UNDO_KEY,JSON.stringify(undoStack));localStorage.setItem(PLAYER_SLOT_KEY,JSON.stringify(playerSlots));},[ready,settings,players,teams,recent,auctionLog,currentPlayerId,unsoldList,undoStack,playerSlots,pinballConfig]);

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

  const savePlayerSlot=(name)=>{const n=(name||'새 명단').trim();const next=[{name:n,players:players.map(({soldTeamId,soldPrice,...p})=>({...p,status:'waiting',excluded:false})) ,savedAt:Date.now()},...playerSlots.filter(x=>x.name!==n)].slice(0,20);setPlayerSlots(next);alert(`명단 저장 완료: ${n}`)};
  const loadPlayerSlot=(name)=>{const slot=playerSlots.find(x=>x.name===name);if(!slot)return;if(!confirm(`${name} 명단을 불러오면 현재 선수 목록이 교체됩니다. 계속할까요?`))return;setPlayers(slot.players.map(p=>({...p,status:'waiting',excluded:false,soldTeamId:null,soldPrice:null})));setTeams(makeTeams(settings));setRecent([]);setAuctionLog([]);setUnsoldList([]);setCurrentPlayerId(null)};
  const resetAll=()=>{if(!confirm('정말 전체 초기화할까요? 선수 상태, 팀 배정, 포인트, 유찰, 로그가 모두 초기화됩니다.'))return;setPlayers(DEFAULT_PLAYERS);setTeams(makeTeams(settings));setRecent([]);setAuctionLog([]);setUnsoldList([]);setCurrentPlayerId(null);setUndoStack([])};

  const sharedState=()=>({settings,players,teams,recent,unsoldList,currentPlayerId,livePrice,liveTeamName,liveTimer,spectatorEvent});
  const onStateChanged=async(extra={})=>{if(!supabase||!roomStatus.connected||!roomStatus.adminKey)return;await supabase.rpc('update_auction_room',{p_room_code:roomStatus.roomCode,p_admin_key:roomStatus.adminKey,p_state:{...sharedState(),...extra},p_event:extra.spectatorEvent||spectatorEvent||null});};
  useEffect(()=>{if(!supabase||!roomStatus.connected)return;let ch;(async()=>{const {data}=await supabase.from('auction_rooms').select('state').eq('room_code',roomStatus.roomCode).maybeSingle();if(data?.state){const x=data.state;if(x.settings)setSettings(x.settings);if(x.players)setPlayers(x.players);if(x.teams)setTeams(x.teams);if(x.recent)setRecent(x.recent);if(x.unsoldList)setUnsoldList(x.unsoldList);if('currentPlayerId'in x)setCurrentPlayerId(x.currentPlayerId)}ch=supabase.channel('room-'+roomStatus.roomCode).on('postgres_changes',{event:'UPDATE',schema:'public',table:'auction_rooms',filter:`room_code=eq.${roomStatus.roomCode}`},({new:n})=>{const x=n.state||{};if(x.settings)setSettings(x.settings);if(x.players)setPlayers(x.players);if(x.teams)setTeams(x.teams);if(x.recent)setRecent(x.recent);if(x.unsoldList)setUnsoldList(x.unsoldList);if('currentPlayerId'in x)setCurrentPlayerId(x.currentPlayerId);if(x.spectatorEvent)setSpectatorEvent(x.spectatorEvent);if('livePrice'in x)setLivePrice(x.livePrice||0);if('liveTeamName'in x)setLiveTeamName(x.liveTeamName||'');if('liveTimer'in x)setLiveTimer(x.liveTimer)}).subscribe()})();return()=>{if(ch)supabase.removeChannel(ch)}},[roomStatus.connected,roomStatus.roomCode]);

  let view=<Auction players={players} setPlayers={setPlayers} teams={teams} setTeams={setTeams} settings={settings} recent={recent} setRecent={setRecent} currentPlayerId={currentPlayerId} setCurrentPlayerId={setCurrentPlayerId}
      spectatorEvent={spectatorEvent} setSpectatorEvent={setSpectatorEvent} unsoldList={unsoldList} setUnsoldList={setUnsoldList} onStateChanged={onStateChanged} undoStack={undoStack} setUndoStack={setUndoStack} auctionLog={auctionLog} setAuctionLog={setAuctionLog}/>;
  if(active==='pinball')view=<Pinball config={pinballConfig} setConfig={setPinballConfig}/>;
  if(active==='list')view=<FullPlayerList players={players} teams={teams} setActive={setActive} setCurrentPlayerId={setCurrentPlayerId}/>;
  if(active==='teams')view=<TeamList teams={teams} setActive={setActive}/>;
  if(active==='players')view=<Players players={players} setPlayers={setPlayers} savePlayerSlot={savePlayerSlot} loadPlayerSlot={loadPlayerSlot} playerSlots={playerSlots}/>;

  if(active==='settings')view=<SettingsView settings={settings} setSettings={setSettings} teams={teams} setTeams={setTeams} onResetAll={resetAll}/>;
  return <AppShell active={active} setActive={setActive} settings={settings} roomStatus={roomStatus}>{view}</AppShell>;
}
