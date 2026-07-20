'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Users, Gavel, Dices, Settings, Trophy, UserRoundCog, RotateCcw, Save, History, Sparkles, Plus, Trash2, Maximize2, Wifi, WifiOff, KeyRound, List, Volume2, VolumeX, Copy, LogOut, X, Link2 } from 'lucide-react';

const KEY = 'gochubat-v02';
const UNDO_KEY = 'gochubat-v02-undo';
const PLAYER_SLOT_KEY = 'gochubat-v02-player-slots';
const TOURNAMENT_SLOT_KEY = 'gochubat-v02-tournament-slots';
const ROOM_SESSION_KEY = 'gochubat-online-room-v1';
const ROLES = ['TOP','JUG','MID','ADC','SUP'];
const TIERS = ['챌린저','그랜드마스터','마스터','다이아몬드','에메랄드','플래티넘','골드','실버','브론즈','아이언'];
const DEFAULT_SETTINGS = {
  title: '제3회 관동지방컵', teamCount: 5,
  sound: true, animation: true,
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
  {id:1,name:'정우',tier:'마스터',main:'TOP',sub:'JUG',status:'waiting',excluded:false,inAuction:true},
  {id:2,name:'대현',tier:'챌린저',main:'JUG',sub:'TOP',status:'waiting',excluded:false,inAuction:true},
  {id:3,name:'준휘',tier:'마스터',main:'MID',sub:'ADC',status:'waiting',excluded:false,inAuction:true},
  {id:4,name:'수민',tier:'에메랄드',main:'ADC',sub:'MID',status:'waiting',excluded:false,inAuction:true},
  {id:5,name:'지훈',tier:'마스터',main:'SUP',sub:'JUG',status:'waiting',excluded:false,inAuction:true}
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

function AppShell({active,setActive,settings,children,roomStatus,onOpenRoom,onOpenLobby,onDisconnect,onCopyAdmin,onDeleteRoom}) {
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
    <div className={`room-toolbar ${roomStatus?.connected?'connected':''}`}>
      <div className="room-toolbar-state">
        {roomStatus?.connected?<Wifi size={16}/>:<WifiOff size={16}/>} 
        <b>{roomStatus?.connected?`온라인 방 ${roomStatus.roomCode}`:'로컬 모드'}</b>
        <span>{roomStatus?.connected?'같은 방의 운영자들과 실시간 동기화 중':'현재 기기에만 저장됩니다.'}</span>
      </div>
      <div className="room-toolbar-actions">
        <button onClick={onOpenLobby}><List size={15}/> 방 목록</button>
        {roomStatus?.connected?<>
          <button onClick={onCopyAdmin}><Copy size={15}/> 운영자 링크 복사</button>
          <button className="danger-lite" onClick={onDeleteRoom}><Trash2 size={15}/> 방 삭제</button>
          <button className="danger-lite" onClick={onDisconnect}><LogOut size={15}/> 연결 해제</button>
        </>:<button className="primary-room-btn" onClick={onOpenRoom}><Link2 size={15}/> 온라인 방 연결</button>}
      </div>
    </div>
    <section className="single-content">{children}</section>
  </main>;
}

function RoomDialog({open,onClose,onCreate,onJoin,loading,error,defaultCode=''}){
  const [roomCode,setRoomCode]=useState(defaultCode||'GOCHU1');
  const [adminKey,setAdminKey]=useState('');
  useEffect(()=>{if(open&&defaultCode)setRoomCode(defaultCode)},[open,defaultCode]);
  if(!open)return null;
  return <div className="room-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="room-modal">
      <button className="room-modal-close" onClick={onClose}><X size={20}/></button>
      <div className="room-modal-icon"><KeyRound size={28}/></div>
      <span>ONLINE AUCTION ROOM</span>
      <h2>온라인 운영 방 연결</h2>
      <p>같은 방 코드와 운영 비밀번호를 입력한 사람은 다른 PC에서도 경매를 이어서 조작할 수 있습니다.</p>
      <label><b>방 코드</b><input value={roomCode} maxLength={20} onChange={e=>setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))} placeholder="예: KANTO3"/></label>
      <label><b>운영 비밀번호</b><input type="password" value={adminKey} onChange={e=>setAdminKey(e.target.value)} placeholder="운영자끼리 공유할 비밀번호"/></label>
      {error&&<div className="room-error">{error}</div>}
      <div className="room-modal-actions">
        <button disabled={loading||!roomCode||adminKey.length<4} onClick={()=>onJoin(roomCode,adminKey)}><Wifi size={16}/> 기존 방 접속</button>
        <button className="primary-btn" disabled={loading||!roomCode||adminKey.length<4} onClick={()=>onCreate(roomCode,adminKey)}><Plus size={16}/> 새 방 만들기</button>
      </div>
      <small>운영 비밀번호는 최소 4자입니다. 방마다 데이터가 완전히 분리되어 A조·B조가 동시에 사용할 수 있습니다.</small>
    </section>
  </div>;
}


function RoomLobby({open,onClose,rooms,loading,error,onRefresh,onCreate,onJoin,onDelete,onClone}){
  const [search,setSearch]=useState('');
  if(!open)return null;
  const q=search.trim().toLowerCase();
  const filtered=rooms.filter(r=>!q||r.room_code.toLowerCase().includes(q)||(r.title||'').toLowerCase().includes(q));
  const statusOf=(r)=>{
    const ps=Array.isArray(r.state?.players)?r.state.players.filter(p=>p.inAuction!==false):[];
    if(ps.length&&ps.every(p=>p.status!=='waiting'))return ['종료','done'];
    if(r.state?.currentPlayerId||ps.some(p=>p.status!=='waiting'))return ['경매중','live'];
    return ['대기중','wait'];
  };
  return <div className="room-modal-backdrop room-lobby-backdrop">
    <section className="room-lobby">
      <header><div><span>ONLINE ROOM DIRECTORY</span><h2>경매 방 목록</h2><p>A조·B조·C조처럼 필요한 만큼 독립된 방을 만들어 동시에 운영할 수 있습니다.</p></div><button className="room-modal-close" onClick={onClose}><X size={20}/></button></header>
      <div className="room-lobby-tools"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="방 코드 또는 대회 이름 검색"/><button onClick={onRefresh} disabled={loading}>새로고침</button><button className="primary-btn" onClick={onCreate}><Plus size={16}/> 새 방 만들기</button></div>
      {error&&<div className="room-error">{error}</div>}
      <div className="room-directory">
        {filtered.map(r=>{const [label,cls]=statusOf(r);const st=r.state||{};const playerCount=(st.players||[]).filter(p=>p.inAuction!==false).length;const teamCount=(st.teams||[]).length||st.settings?.teamCount||0;return <article className="room-directory-card" key={r.room_code}>
          <div className="room-code-badge">{r.room_code.slice(0,3)}</div>
          <div className="room-directory-info"><div><b>{r.room_code}</b><span className={`room-state ${cls}`}>{label}</span></div><h3>{r.title||'이름 없는 경매방'}</h3><p>{teamCount}팀 · 선수 {playerCount}명 · 최근 저장 {new Date(r.updated_at).toLocaleString('ko-KR')}</p></div>
          <div className="room-directory-actions"><button className="primary-btn" onClick={()=>onJoin(r.room_code)}>접속</button><button className="room-clone-btn" onClick={()=>onClone(r)}>복제</button><button className="room-delete-btn" onClick={()=>onDelete(r.room_code)}>삭제</button></div>
        </article>})}
        {!loading&&!filtered.length&&<div className="room-directory-empty">표시할 방이 없습니다. 새 방을 만들어주세요.</div>}
        {loading&&<div className="room-directory-empty">방 목록을 불러오는 중...</div>}
      </div>
      <footer><small>접속·삭제는 해당 방의 운영 비밀번호가 필요합니다. 방 데이터는 서로 완전히 분리됩니다.</small></footer>
    </section>
  </div>;
}

function WatchConnection({roomCode,status,error}){
  return <div className="watch-connection-badge">
    {status==='connected'?<Wifi size={15}/>:<WifiOff size={15}/>} 
    <b>{status==='connected'?`${roomCode} 실시간 관전`:'관전자 연결 중'}</b>
    {error&&<span>{error}</span>}
  </div>;
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
  undoStack,setUndoStack,auctionLog,setAuctionLog,readOnly=false
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
  const [roulettePreviewId,setRoulettePreviewId]=useState(null);
  const spectatorRunRef=useRef(0);


  const auctionPlayers=players.filter(p=>p.inAuction!==false);
  const waiting=auctionPlayers.filter(p=>p.status==='waiting');
  const current=auctionPlayers.find(p=>p.id===currentPlayerId);
  const normalPool=auctionPlayers.filter(p=>p.status==='waiting'&&!p.excluded);
  const unsoldPool=auctionPlayers.filter(p=>p.status==='unsold');
  const roulettePool=rouletteMode==='unsold'?unsoldPool:normalPool;
  const filteredPlayers=auctionPlayers.filter(p=>filter==='ALL'||p.main===filter);

  useEffect(()=>{
    if(spinning)return;
    if(current)setRouletteName(current.name);
    else if(rouletteName!=='룰렛 대기')setRouletteName('룰렛 대기');
  },[currentPlayerId,current?.name,spinning]);

  useEffect(()=>{
    if(!readOnly||!spectatorEvent)return;
    const e=spectatorEvent;
    if(e.type==='roulette-start'){
      const runId=++spectatorRunRef.current;
      const timeline=Array.isArray(e.timeline)?e.timeline:[];
      setView('board');
      setSpinning(true);
      setRouletteMode(e.mode||'normal');
      setRouletteItems(timeline.map(x=>({id:x.id,name:x.name})));
      setRouletteStep(0);
      let i=0;
      const step=()=>{
        if(runId!==spectatorRunRef.current)return;
        if(i>=timeline.length){
          const picked=e.picked;
          if(picked){setRouletteName(picked.name);setRoulettePreviewId(picked.id);}
          setSpinning(false);
          setTimeout(()=>{if(runId===spectatorRunRef.current)setView('focus')},450);
          return;
        }
        const item=timeline[i];
        setRouletteName(item.name);
        setRoulettePreviewId(item.id);
        setRouletteStep(i);
        const delay=Math.max(45,Number(item.delay)||90);
        i+=1;
        setTimeout(step,delay);
      };
      step();
      return;
    }
    if(e.type==='roulette-result'){
      ++spectatorRunRef.current;
      setSpinning(false);
      setRouletteName(e.player?.name||'결과');
      setRoulettePreviewId(e.player?.id||null);
      setView('focus');
      return;
    }
    if(e.type==='player-selected'){
      setRouletteName(e.player?.name||'선수 선택');
      setRoulettePreviewId(e.player?.id||null);
      setView('focus');
      return;
    }
    if(e.type==='sold'){
      ++spectatorRunRef.current;
      setSpinning(false);
      setOverlay({type:'sold',player:e.sale?.player||'',team:e.sale?.team||'',price:Number(e.sale?.price||0)});
      setTimeout(()=>setOverlay(null),2500);
      return;
    }
    if(e.type==='unsold'){
      ++spectatorRunRef.current;
      setSpinning(false);
      setOverlay({type:'unsold',player:e.player||''});
      setTimeout(()=>setOverlay(null),2100);
    }
  },[readOnly,spectatorEvent]);

  const pushEvent=(event)=>{
    const next={...event,id:Date.now()};
    setSpectatorEvent(next);
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
    setRoulettePreviewId(player.id);
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
    const total=Math.max(26, previewOrder.length*5);
    const timeline=[];
    for(let i=0;i<total;i++){
      const preview=i===total-1?picked:previewOrder[secureRandomIndex(previewOrder.length)];
      timeline.push({id:preview.id,name:preview.name,delay:Math.min(300,55+(i+1)*8.5)});
    }
    setRouletteItems(previewOrder);
    setRouletteStep(0);
    setRoulettePreviewId(null);
    playUiSound('select', settings.sound);
    pushEvent({type:'roulette-start',mode,timeline,picked:{id:picked.id,name:picked.name,tier:picked.tier,main:picked.main,sub:picked.sub}});

    let tick=0;
    const run=()=>{
      const preview=timeline[tick];
      setRouletteStep(tick%Math.max(1,previewOrder.length));
      setRouletteName(preview.name);
      setRoulettePreviewId(preview.id);
      if(tick%2===0)playUiSound('tick',settings.sound);
      tick+=1;
      if(tick>=timeline.length){
        setRouletteName(picked.name);
        setRoulettePreviewId(picked.id);
        setCurrentPlayerId(picked.id);
        pushEvent({type:'roulette-result',player:picked,mode});
        playUiSound('result',settings.sound);
        setSpinning(false);
        setTimeout(()=>setView('focus'),650);
        return;
      }
      setTimeout(run,Math.max(45,Number(preview.delay)||90));
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
    // 전체 상태는 상위 실시간 동기화 효과에서 최신 React 상태로 전송됩니다.

    setAssignModal(false);
    setCurrentPlayerId(null);
    setRoulettePreviewId(null);
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
    setRoulettePreviewId(null);
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

  const resetAuction=()=>{
    if(!confirm('경매 진행 상태를 초기화할까요? 선수 명단은 유지되고 팀 배정, 포인트, 유찰, 낙찰 기록과 로그가 초기화됩니다.'))return;
    setPlayers(ps=>ps.map(p=>({...p,status:'waiting',excluded:false,soldTeamId:null,soldPrice:null})));
    setTeams(makeTeams(settings));
    setRecent([]);
    setUnsoldList?.([]);
    setCurrentPlayerId(null);
    setAuctionLog([]);
    setUndoStack([]);
    setSelectedTeam(null);
    setPriceInput('0');
    setRouletteName('룰렛 대기');
    setView('board');
    pushEvent({type:'reset'});
  };

  const clearAuctionLog=()=>{
    if(!auctionLog.length)return;
    if(!confirm('경매 로그를 모두 삭제할까요? 낙찰 결과와 팀 배정은 그대로 유지됩니다.'))return;
    setAuctionLog([]);
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
    const active=(player.id===(spinning?roulettePreviewId:currentPlayerId))&&['waiting','unsold'].includes(player.status);
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
          <button onClick={undo}>되돌리기</button><button className="danger-soft" onClick={resetAuction}>초기화</button>
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
        <header><div><span>AUCTION LOG</span><h3>경매 로그</h3></div><div className="auction-log-head-actions"><b>{auctionLog.length}건</b><button type="button" onClick={clearAuctionLog} disabled={!auctionLog.length}>로그 삭제</button></div></header>
        <div>{auctionLog.slice(0,8).map(x=><p key={x.id}><span>{x.time}</span><b>{x.text}</b></p>)}{!auctionLog.length&&<small>아직 기록이 없습니다.</small>}</div>
      </section>

      <footer className="arena-status-footer">
        <span>경매 명단 {auctionPlayers.length}명</span>
        <span>대기 {waiting.length}명</span>
        <span>낙찰 {auctionPlayers.filter(p=>p.status==='sold').length}명</span>
        <span>유찰 {auctionPlayers.filter(p=>p.status==='unsold').length}명</span>
      </footer>
    </div>
  </>;
}

function Players({players,setPlayers,savePlayerSlot,loadPlayerSlot,playerSlots,onApplyAuctionSelection,onRecoverPlayer}) {
  const [f,setF]=useState({name:'',tier:'마스터',main:'TOP',sub:'없음'});
  const [slotName,setSlotName]=useState('제3회 관동지방컵 명단');
  const [search,setSearch]=useState('');
  const [selectionFilter,setSelectionFilter]=useState('ALL');
  const [draftSelection,setDraftSelection]=useState(()=>new Set(players.filter(p=>p.inAuction!==false).map(p=>p.id)));
  const importRef=useRef(null);
  const exportPlayers=()=>{
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),players},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gochubat-players-${Date.now()}.json`;a.click();URL.revokeObjectURL(url);
  };
  const importPlayers=async(file)=>{
    try{const raw=JSON.parse(await file.text());const list=Array.isArray(raw)?raw:raw.players;if(!Array.isArray(list))throw new Error();if(!confirm(`${list.length}명의 선수 명단을 불러와 현재 목록을 교체할까요?`))return;setPlayers(list.map((p,i)=>({id:p.id||Date.now()+i,name:String(p.name||'선수'),tier:TIERS.includes(p.tier)?p.tier:'마스터',main:ROLES.includes(p.main)?p.main:'TOP',sub:ROLES.includes(p.sub)?p.sub:'없음',status:'waiting',excluded:false,inAuction:p.inAuction!==false,imageUrl:p.imageUrl||''})));}catch{alert('올바른 선수 명단 JSON 파일이 아닙니다.')}finally{if(importRef.current)importRef.current.value='';}
  };

  useEffect(()=>{
    setDraftSelection(new Set(players.filter(p=>p.inAuction!==false).map(p=>p.id)));
  },[players]);

  const add=()=>{
    if(!f.name.trim())return;
    setPlayers(p=>[...p,{id:Date.now(),...f,name:f.name.trim(),status:'waiting',excluded:false,inAuction:false,imageUrl:''}]);
    setF({name:'',tier:'마스터',main:'TOP',sub:'없음'});
  };

  const committedIds=new Set(players.filter(p=>p.inAuction!==false).map(p=>p.id));
  const changed=players.some(p=>draftSelection.has(p.id)!==committedIds.has(p.id));
  const selectedCount=draftSelection.size;
  const toggle=(id)=>setDraftSelection(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next});
  const selectAll=()=>setDraftSelection(new Set(players.map(p=>p.id)));
  const clearAll=()=>setDraftSelection(new Set());
  const apply=()=>onApplyAuctionSelection?.([...draftSelection]);
  const normalized=search.trim().toLowerCase();
  const visible=players.filter(p=>{
    const matchSearch=!normalized||p.name.toLowerCase().includes(normalized)||p.tier.toLowerCase().includes(normalized)||p.main.toLowerCase().includes(normalized)||(p.sub||'').toLowerCase().includes(normalized);
    const selected=draftSelection.has(p.id);
    const matchFilter=selectionFilter==='ALL'||(selectionFilter==='SELECTED'&&selected)||(selectionFilter==='UNSELECTED'&&!selected);
    return matchSearch&&matchFilter;
  });

  return <section className="panel full-panel">
    <div className="panel-title"><div><span>PLAYER DATABASE</span><h2>선수 관리</h2></div><b>{players.length}명 등록</b></div>
    <div className="slot-toolbar"><input value={slotName} onChange={e=>setSlotName(e.target.value)} placeholder="명단 슬롯 이름"/><button onClick={()=>savePlayerSlot(slotName)}>명단 저장</button><select onChange={e=>e.target.value&&loadPlayerSlot(e.target.value)} defaultValue=""><option value="">저장 명단 불러오기</option>{playerSlots.map(x=><option key={x.name} value={x.name}>{x.name} · {x.players.length}명</option>)}</select><button onClick={exportPlayers}>JSON 내보내기</button><button onClick={()=>importRef.current?.click()}>JSON 불러오기</button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={e=>e.target.files?.[0]&&importPlayers(e.target.files[0])}/></div>
    <div className="player-form">
      <input value={f.name} onChange={e=>setF({...f,name:e.target.value})} onKeyDown={e=>e.key==='Enter'&&add()} placeholder="선수 이름"/>
      <select value={f.tier} onChange={e=>setF({...f,tier:e.target.value})}>{TIERS.map(t=><option key={t}>{t}</option>)}</select>
      <select value={f.main} onChange={e=>setF({...f,main:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <select value={f.sub} onChange={e=>setF({...f,sub:e.target.value})}><option>없음</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select>
      <button className="primary-btn" onClick={add}>선수 추가</button>
    </div>

    <div className="auction-selection-panel">
      <div className="auction-selection-top">
        <div><span>AUCTION ENTRY</span><h3>이번 경매 참가 선수 선택</h3><small>체크한 선수만 경매 화면과 전체목록에 표시됩니다.</small></div>
        <strong>{selectedCount}명 선택 / {players.length}명 등록</strong>
      </div>
      <div className="auction-selection-controls">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="선수 이름·티어·라인 검색"/>
        <div className="selection-filter-buttons">
          <button className={selectionFilter==='ALL'?'active':''} onClick={()=>setSelectionFilter('ALL')}>전체</button>
          <button className={selectionFilter==='SELECTED'?'active':''} onClick={()=>setSelectionFilter('SELECTED')}>선택됨</button>
          <button className={selectionFilter==='UNSELECTED'?'active':''} onClick={()=>setSelectionFilter('UNSELECTED')}>선택 안 됨</button>
        </div>
        <button onClick={selectAll}>전체 선택</button>
        <button onClick={clearAll}>전체 해제</button>
      </div>
      {changed&&<div className="selection-change-notice"><span>선수 선택이 변경되었습니다.</span><button className="primary-btn" onClick={apply}>선택 선수 경매에 적용</button></div>}
    </div>

    <div className="player-table selectable-player-table">
      <div className="table-head"><span>참가</span><span>선수</span><span>티어</span><span>주라인</span><span>부라인</span><span>상태</span><span/></div>
      {visible.map(p=><div className={`table-row ${draftSelection.has(p.id)?'selected-for-auction':'not-selected'}`} key={p.id}>
        <label className="auction-entry-check"><input type="checkbox" checked={draftSelection.has(p.id)} onChange={()=>toggle(p.id)}/><span/></label>
        <b>{p.name}</b><span>{p.tier}</span><span>{p.main}</span><span>{p.sub||'없음'}</span>
        <span className={`wait-tag ${p.status}`}>{p.status==='waiting'?'대기':p.status==='sold'?'낙찰':'유찰 매물'}</span>
        <div className="row-actions">
          {p.status!=='waiting'&&<button onClick={()=>onRecoverPlayer?.(p)}>복구</button>}
          <button onClick={()=>{if(confirm(`${p.name} 선수를 삭제할까요?`))setPlayers(ps=>ps.filter(x=>x.id!==p.id))}}>삭제</button>
        </div>
      </div>)}
      {!visible.length&&<div className="selection-empty">조건에 맞는 선수가 없습니다.</div>}
    </div>
  </section>;
}
function FullPlayerList({players,teams,setActive,setCurrentPlayerId}){
  const [filter,setFilter]=useState('ALL');
  const auctionPlayers=players.filter(p=>p.inAuction!==false);
  const shown=auctionPlayers.filter(p=>filter==='ALL'||p.main===filter);
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
        <span>입찰 단위</span>
        <input value={steps} onChange={e=>setSteps(e.target.value)} placeholder="10,20,50,100"/>
      </label>
    </div>

    <div className="option-grid">
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
  livePrice,liveTeamName,spectatorEvent,unsoldList
}) {
  const current=players.find(p=>p.id===currentPlayerId);
  const activePlayers=players.filter(p=>p.inAuction!==false);
  const completed=activePlayers.filter(p=>p.status!=='waiting').length;
  const total=activePlayers.length;
  const waiting=activePlayers.filter(p=>p.status==='waiting').length;

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

function Presentation({settings,teams,players,recent,currentPlayerId,livePrice,liveTeamName,spectatorEvent,unsoldList}){
 const current=players.find(p=>p.id===currentPlayerId);
 const [rName,setRName]=useState('대기 중'); const [rActive,setRActive]=useState(false);
 useEffect(()=>{const e=spectatorEvent;if(!e)return;if(e.type==='roulette-start'){setRActive(true);setRName('추첨 시작')}if(e.type==='roulette-preview'){setRActive(true);setRName(e.name)}if(e.type==='roulette-result'){setRActive(false);setRName(e.player?.name||'결과')}},[spectatorEvent]);
 return <div className="presentation-screen"><header><div><span>GOCHUBAT AUCTION</span><h1>{settings.title}</h1></div></header><main><section className="presentation-player"><div className="presentation-role">{current?.main??'?'}</div><div><small>{current?.tier??'선수 없음'}</small><h2>{current?.name??'다음 룰렛 대기'}</h2><p>{current?`${current.main} / ${current.sub}`:'룰렛을 기다리는 중'}</p></div></section><section className="presentation-bid"><span>현재 입찰가</span><strong>{Number(livePrice||0).toLocaleString()}P</strong><p>{liveTeamName||'입찰 팀 없음'}</p></section><section className="presentation-roulette"><div className={rActive?'presentation-wheel active':'presentation-wheel'}><Dices size={40}/></div><strong>{rName}</strong><small>{rActive?'룰렛 진행 중':'다음 추첨 대기'}</small></section></main><footer><div className="presentation-teams">{teams.map(t=><article key={t.id}><header><b>{t.name}</b><strong>{t.points.toLocaleString()}P</strong></header><div>{t.roster.map(m=><span key={`${t.id}-${m.id}`}>{m.name}<i>{m.price}P</i></span>)}</div></article>)}</div><div className="presentation-side"><section><h3>최근 낙찰</h3>{recent.slice(0,5).map(x=><p key={x.id}>{x.player}<b>{x.team} · {x.price}P</b></p>)}</section><section><h3>유찰</h3>{unsoldList.slice(0,5).map(x=><p key={x.id}>{x.player}</p>)}</section></div></footer></div>;
}


export default function Home(){
  const [active,setActive]=useState('auction');
  const [roomDialog,setRoomDialog]=useState(false);
  const [roomLobby,setRoomLobby]=useState(false);
  const [roomList,setRoomList]=useState([]);
  const [roomListBusy,setRoomListBusy]=useState(false);
  const [roomListError,setRoomListError]=useState('');
  const [requestedRoomCode,setRequestedRoomCode]=useState('');
  const [roomBusy,setRoomBusy]=useState(false);
  const [roomError,setRoomError]=useState('');
  const [syncError,setSyncError]=useState('');
  const applyingRemoteRef=useRef(false);
  const syncReadyRef=useRef(false);
  const clientIdRef=useRef(`client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const syncSeqRef=useRef(0);
  const latestSharedStateRef=useRef(null);
  const pendingSyncRef=useRef(null);
  const syncWritingRef=useRef(false);
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
  const [roomStatus,setRoomStatus]=useState({connected:false,roomCode:'',adminKey:'',role:'local'});
  const [livePrice,setLivePrice]=useState(0);
  const [liveTeamName,setLiveTeamName]=useState('');
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const roomFromUrl=(params.get('room')||'').toUpperCase();
    try{
      const saved=JSON.parse(sessionStorage.getItem(ROOM_SESSION_KEY)||'null');
      if(saved?.roomCode&&saved?.adminKey)setRoomStatus({connected:true,roomCode:saved.roomCode,adminKey:saved.adminKey,role:'admin'});
      else if(roomFromUrl){setRequestedRoomCode(roomFromUrl);setRoomDialog(true);}
      else setRoomLobby(true);
    }catch{}
    try{const raw=localStorage.getItem(KEY);if(raw){const x=JSON.parse(raw);const st={...DEFAULT_SETTINGS,...x.settings};setSettings(st);setPlayers((x.players||DEFAULT_PLAYERS).map(p=>({...p,inAuction:p.inAuction!==false})));setTeams(makeTeams(st,x.teams||[]));setRecent(x.recent||[]);setAuctionLog(x.auctionLog||[]);setCurrentPlayerId(x.currentPlayerId??null);setUnsoldList(x.unsoldList||[]);const u=localStorage.getItem(UNDO_KEY);if(u)setUndoStack(JSON.parse(u));const ps=localStorage.getItem(PLAYER_SLOT_KEY);if(ps)setPlayerSlots(JSON.parse(ps));}}catch{}
    setReady(true)
  },[]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY,JSON.stringify({settings,players,teams,recent,auctionLog,currentPlayerId,unsoldList}));localStorage.setItem(UNDO_KEY,JSON.stringify(undoStack));localStorage.setItem(PLAYER_SLOT_KEY,JSON.stringify(playerSlots));},[ready,settings,players,teams,recent,auctionLog,currentPlayerId,unsoldList,undoStack,playerSlots]);

  const savePlayerSlot=(name)=>{const n=(name||'새 명단').trim();const next=[{name:n,players:players.map(({soldTeamId,soldPrice,...p})=>({...p,status:'waiting',excluded:false})) ,savedAt:Date.now()},...playerSlots.filter(x=>x.name!==n)].slice(0,20);setPlayerSlots(next);alert(`명단 저장 완료: ${n}`)};
  const loadPlayerSlot=(name)=>{const slot=playerSlots.find(x=>x.name===name);if(!slot)return;if(!confirm(`${name} 명단을 불러오면 현재 선수 목록이 교체됩니다. 계속할까요?`))return;setPlayers(slot.players.map(p=>({...p,inAuction:p.inAuction!==false,status:'waiting',excluded:false,soldTeamId:null,soldPrice:null})));setTeams(makeTeams(settings));setRecent([]);setAuctionLog([]);setUnsoldList([]);setCurrentPlayerId(null)};
  const resetAll=()=>{if(!confirm('정말 전체 초기화할까요? 선수 상태, 팀 배정, 포인트, 유찰, 로그가 모두 초기화됩니다.'))return;setPlayers(DEFAULT_PLAYERS);setTeams(makeTeams(settings));setRecent([]);setAuctionLog([]);setUnsoldList([]);setCurrentPlayerId(null);setUndoStack([])};

  const recoverPlayer=(player)=>{
    if(!player||player.status==='waiting')return;
    const wasSold=player.status==='sold';
    const message=wasSold
      ? `${player.name} 선수의 낙찰을 복구할까요?\n팀 명단에서 제거되고 사용한 포인트도 반환됩니다.`
      : `${player.name} 선수의 유찰 상태를 복구할까요?`;
    if(!confirm(message))return;

    setTeams(ts=>ts.map(team=>{
      const removed=team.roster.filter(member=>member.id===player.id);
      if(!removed.length)return team;
      const refund=removed.reduce((sum,member)=>sum+Math.max(0,Number(member.price)||0),0);
      return {...team,points:team.points+refund,roster:team.roster.filter(member=>member.id!==player.id)};
    }));
    setPlayers(ps=>ps.map(p=>p.id===player.id?{
      ...p,status:'waiting',excluded:false,soldTeamId:null,soldPrice:null
    }:p));
    setRecent(rs=>rs.filter(item=>item.player!==player.name));
    setUnsoldList(us=>us.filter(item=>item.player!==player.name));
    setCurrentPlayerId(id=>id===player.id?null:id);
    setAuctionLog(log=>[{
      id:Date.now(),type:'restore',
      text:`선수 관리 복구 · ${player.name}${wasSold?' 낙찰 취소 및 포인트 반환':' 유찰 취소'}`,
      time:new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})
    },...log].slice(0,100));
  };

  const applyAuctionSelection=(selectedIds=[])=>{
    const selected=new Set(selectedIds);
    const changedPlayers=players.filter(p=>selected.has(p.id)!==(p.inAuction!==false));
    if(!changedPlayers.length)return;
    const hasProgress=players.some(p=>p.status!=='waiting')||teams.some(t=>t.roster.length)||recent.length||unsoldList.length;
    if(hasProgress){const ok=confirm('경매가 진행된 상태에서 참가 명단을 바꾸면 현재 낙찰·유찰·팀 배정·포인트·로그가 초기화됩니다. 계속할까요?');if(!ok)return;}
    setPlayers(ps=>ps.map(p=>({...p,inAuction:selected.has(p.id),status:'waiting',excluded:false,soldTeamId:null,soldPrice:null})));
    if(hasProgress){setTeams(makeTeams(settings));setRecent([]);setAuctionLog([]);setUnsoldList([]);setCurrentPlayerId(null);setUndoStack([])}
    alert(`경매 명단 적용 완료: ${selected.size}명`);
  };

  const sharedState=()=>({settings,players,teams,recent,auctionLog,unsoldList,currentPlayerId,livePrice,liveTeamName,spectatorEvent});
  latestSharedStateRef.current=sharedState();

  const applyRemoteState=(x={})=>{
    // 내가 방금 보낸 오래된 응답이 다시 들어와 최신 로컬 상태를 덮는 문제를 막습니다.
    if(roomStatus.role==='admin'&&x?._syncClient===clientIdRef.current)return;
    applyingRemoteRef.current=true;
    if(x.settings)setSettings(x.settings);if(x.players)setPlayers(x.players);if(x.teams)setTeams(x.teams);if(x.recent)setRecent(x.recent);if(x.auctionLog)setAuctionLog(x.auctionLog);if(x.unsoldList)setUnsoldList(x.unsoldList);if('currentPlayerId'in x)setCurrentPlayerId(x.currentPlayerId);if('spectatorEvent'in x)setSpectatorEvent(x.spectatorEvent);if('livePrice'in x)setLivePrice(x.livePrice||0);if('liveTeamName'in x)setLiveTeamName(x.liveTeamName||'');
    setTimeout(()=>{applyingRemoteRef.current=false},120);
  };

  const flushSyncQueue=async()=>{
    if(syncWritingRef.current)return;
    syncWritingRef.current=true;
    try{
      while(pendingSyncRef.current){
        const payload=pendingSyncRef.current;
        pendingSyncRef.current=null;
        const {error}=await supabase.rpc('update_auction_room',{
          p_room_code:roomStatus.roomCode,
          p_admin_key:roomStatus.adminKey,
          p_state:payload,
          p_event:payload.spectatorEvent||null
        });
        if(error){setSyncError(error.message||'동기화 실패');break;}
        setSyncError('');
      }
    } finally {
      syncWritingRef.current=false;
      if(pendingSyncRef.current)flushSyncQueue();
    }
  };

  const onStateChanged=(extra={})=>{
    if(!supabase||!roomStatus.connected||roomStatus.role!=='admin'||!roomStatus.adminKey)return;
    const seq=++syncSeqRef.current;
    pendingSyncRef.current={
      ...(latestSharedStateRef.current||sharedState()),
      ...extra,
      _syncClient:clientIdRef.current,
      _syncSeq:seq,
      _syncAt:Date.now()
    };
    flushSyncQueue();
  };

  useEffect(()=>{
    if(!supabase||!roomStatus.connected)return;
    let ch;let alive=true;syncReadyRef.current=false;setSyncError('');
    (async()=>{
      const {data,error}=await supabase.from('auction_rooms').select('state').eq('room_code',roomStatus.roomCode).maybeSingle();
      if(!alive)return;
      if(error||!data){setSyncError('온라인 방을 불러오지 못했습니다.');return;}
      applyRemoteState(data.state||{});syncReadyRef.current=true;
      ch=supabase.channel(`room-${roomStatus.roomCode}-${Math.random()}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'auction_rooms',filter:`room_code=eq.${roomStatus.roomCode}`},({new:n})=>applyRemoteState(n.state||{})).subscribe(status=>{if(status==='CHANNEL_ERROR')setSyncError('실시간 연결이 끊겼습니다.')});
    })();
    return()=>{alive=false;syncReadyRef.current=false;if(ch)supabase.removeChannel(ch)};
  },[roomStatus.connected,roomStatus.roomCode]);

  useEffect(()=>{
    if(!ready||!supabase||!roomStatus.connected||roomStatus.role!=='admin'||!roomStatus.adminKey||!syncReadyRef.current||applyingRemoteRef.current)return;
    const timer=setTimeout(()=>onStateChanged(),80);
    return()=>clearTimeout(timer);
  },[ready,roomStatus.connected,roomStatus.role,roomStatus.roomCode,roomStatus.adminKey,settings,players,teams,recent,auctionLog,unsoldList,currentPlayerId,livePrice,liveTeamName,spectatorEvent]);

  const fetchRooms=async()=>{
    if(!supabase){setRoomListError('Supabase 환경 변수가 설정되지 않았습니다.');return;}
    setRoomListBusy(true);setRoomListError('');
    const {data,error}=await supabase.from('auction_rooms').select('room_code,state,updated_at').order('updated_at',{ascending:false});
    setRoomListBusy(false);
    if(error){setRoomListError(error.message||'방 목록을 불러오지 못했습니다.');return;}
    setRoomList((data||[]).map(r=>({...r,title:r.state?.settings?.title||r.room_code})));
  };
  useEffect(()=>{if(roomLobby)fetchRooms()},[roomLobby]);
  const lobbyJoin=async(code)=>{const key=prompt(`${code} 방 운영 비밀번호를 입력하세요.`,'');if(!key)return;await joinRoom(code,key);};
  const lobbyDelete=async(code)=>{const key=prompt(`${code} 방을 삭제하려면 운영 비밀번호를 입력하세요.`,'');if(!key)return;if(!confirm(`${code} 방과 저장된 경매 데이터를 완전히 삭제할까요?`))return;const {error}=await supabase.rpc('delete_auction_room',{p_room_code:code,p_admin_key:key});if(error)return alert(error.message||'방 삭제에 실패했습니다.');if(roomStatus.roomCode===code){sessionStorage.removeItem(ROOM_SESSION_KEY);setRoomStatus({connected:false,roomCode:'',adminKey:'',role:'local'});}await fetchRooms();};
  const lobbyClone=async(room)=>{const code=(prompt('복제할 새 방 코드를 입력하세요.','')||'').trim().toUpperCase().replace(/[^A-Z0-9_-]/g,'');if(!code)return;const key=prompt('새 방에서 사용할 운영 비밀번호를 입력하세요.','');if(!key||key.length<4)return alert('운영 비밀번호는 최소 4자입니다.');const src=room.state||{};const clone={...src,settings:{...(src.settings||DEFAULT_SETTINGS),title:`${src.settings?.title||room.room_code} 복사본`},players:(src.players||[]).map(p=>({...p,status:'waiting',excluded:false,soldTeamId:null,soldPrice:null})),teams:makeTeams(src.settings||DEFAULT_SETTINGS),recent:[],auctionLog:[],unsoldList:[],currentPlayerId:null,livePrice:0,liveTeamName:'',spectatorEvent:null};const {error}=await supabase.rpc('create_auction_room',{p_room_code:code,p_admin_key:key,p_state:clone});if(error)return alert(error.message?.includes('duplicate')?'이미 존재하는 방 코드입니다.':error.message);alert(`${code} 방으로 템플릿을 복제했습니다.`);await fetchRooms();};

  const createRoom=async(code,key)=>{
    if(!supabase)return setRoomError('Supabase 환경 변수가 설정되지 않았습니다.');
    setRoomBusy(true);setRoomError('');
    const roomCode=code.trim().toUpperCase();
    const {error}=await supabase.rpc('create_auction_room',{p_room_code:roomCode,p_admin_key:key,p_state:sharedState()});
    setRoomBusy(false);
    if(error){setRoomError(error.message?.includes('duplicate')?'이미 존재하는 방 코드입니다. 기존 방 접속을 눌러주세요.':error.message);return;}
    const next={connected:true,roomCode,adminKey:key,role:'admin'};setRoomStatus(next);sessionStorage.setItem(ROOM_SESSION_KEY,JSON.stringify({roomCode,adminKey:key}));setRoomDialog(false);setRoomLobby(false);
  };
  const joinRoom=async(code,key)=>{
    if(!supabase)return setRoomError('Supabase 환경 변수가 설정되지 않았습니다.');
    setRoomBusy(true);setRoomError('');const roomCode=code.trim().toUpperCase();
    const {data,error}=await supabase.rpc('verify_auction_room',{p_room_code:roomCode,p_admin_key:key});
    setRoomBusy(false);
    if(error){setRoomError(error.message);return;}if(!data){setRoomError('방 코드 또는 운영 비밀번호가 올바르지 않습니다.');return;}
    const next={connected:true,roomCode,adminKey:key,role:'admin'};setRoomStatus(next);sessionStorage.setItem(ROOM_SESSION_KEY,JSON.stringify({roomCode,adminKey:key}));setRoomDialog(false);setRoomLobby(false);
  };
  const disconnectRoom=()=>{if(!confirm('온라인 방 연결을 해제하고 로컬 모드로 돌아갈까요? 방 데이터는 삭제되지 않습니다.'))return;sessionStorage.removeItem(ROOM_SESSION_KEY);setRoomStatus({connected:false,roomCode:'',adminKey:'',role:'local'});syncReadyRef.current=false;};
  const deleteRoom=async()=>{
    if(!roomStatus.connected||!roomStatus.adminKey)return;
    const typed=prompt(`방 ${roomStatus.roomCode}을 완전히 삭제합니다. 확인을 위해 방 코드를 입력하세요.`,'');
    if((typed||'').trim().toUpperCase()!==roomStatus.roomCode)return alert('방 코드가 일치하지 않아 삭제를 취소했습니다.');
    const {error}=await supabase.rpc('delete_auction_room',{p_room_code:roomStatus.roomCode,p_admin_key:roomStatus.adminKey});
    if(error)return alert(error.message||'방 삭제에 실패했습니다.');
    sessionStorage.removeItem(ROOM_SESSION_KEY);
    setRoomStatus({connected:false,roomCode:'',adminKey:'',role:'local'});
    syncReadyRef.current=false;
    alert('온라인 방이 삭제되었습니다. 같은 방 코드로 새 방을 만들 수 있습니다.');
  };
  const copyText=async(text,msg)=>{try{await navigator.clipboard.writeText(text);alert(msg)}catch{prompt('아래 주소를 복사하세요.',text)}};
  const adminUrl=()=>`${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomStatus.roomCode)}`;

  let view=<Auction players={players} setPlayers={setPlayers} teams={teams} setTeams={setTeams} settings={settings} recent={recent} setRecent={setRecent} currentPlayerId={currentPlayerId} setCurrentPlayerId={setCurrentPlayerId}
      spectatorEvent={spectatorEvent} setSpectatorEvent={setSpectatorEvent} unsoldList={unsoldList} setUnsoldList={setUnsoldList} onStateChanged={onStateChanged} undoStack={undoStack} setUndoStack={setUndoStack} auctionLog={auctionLog} setAuctionLog={setAuctionLog}/>;
  if(active==='list')view=<FullPlayerList players={players} teams={teams} setActive={setActive} setCurrentPlayerId={setCurrentPlayerId}/>;
  if(active==='teams')view=<TeamList teams={teams} setActive={setActive}/>;
  if(active==='players')view=<Players players={players} setPlayers={setPlayers} savePlayerSlot={savePlayerSlot} loadPlayerSlot={loadPlayerSlot} playerSlots={playerSlots} onApplyAuctionSelection={applyAuctionSelection} onRecoverPlayer={recoverPlayer}/>;
  if(active==='settings')view=<SettingsView settings={settings} setSettings={setSettings} teams={teams} setTeams={setTeams} onResetAll={resetAll}/>;
  return <>
    <AppShell active={active} setActive={setActive} settings={settings} roomStatus={roomStatus} onOpenRoom={()=>{setRoomError('');setRoomDialog(true)}} onOpenLobby={()=>setRoomLobby(true)} onDisconnect={disconnectRoom} onDeleteRoom={deleteRoom} onCopyAdmin={()=>copyText(adminUrl(),'운영자 접속 주소를 복사했습니다. 비밀번호는 따로 전달하세요.')}>{view}</AppShell>
    <RoomLobby open={roomLobby} onClose={()=>setRoomLobby(false)} rooms={roomList} loading={roomListBusy} error={roomListError} onRefresh={fetchRooms} onCreate={()=>{setRoomLobby(false);setRoomError('');setRoomDialog(true)}} onJoin={lobbyJoin} onDelete={lobbyDelete} onClone={lobbyClone}/>
    <RoomDialog open={roomDialog} onClose={()=>setRoomDialog(false)} onCreate={createRoom} onJoin={joinRoom} loading={roomBusy} error={roomError} defaultCode={requestedRoomCode}/>
    {syncError&&roomStatus.connected&&<div className="sync-error-toast">{syncError}</div>}
  </>;
}

