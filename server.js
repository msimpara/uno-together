const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));
app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.js"));
});

const rooms = new Map();
const COLORS = ["red", "yellow", "green", "blue"];
const SPECIALS = ["skip", "reverse", "draw2"];
const makeId = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const shuffle = a => { for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; };

function makeDeck() {
  const d = [];
  for (const color of COLORS) {
    d.push({color, value:"0"});
    for (let n=1;n<=9;n++) { d.push({color,value:String(n)},{color,value:String(n)}); }
    for (const value of SPECIALS) d.push({color,value},{color,value});
  }
  for (let i=0;i<4;i++) d.push({color:"wild",value:"wild"},{color:"wild",value:"wild4"});
  return shuffle(d);
}
function drawCards(game, player, count=1) {
  for (let i=0;i<count;i++) {
    if (!game.deck.length) {
      const top = game.discard.pop();
      game.deck = shuffle(game.discard);
      game.discard = [top];
    }
    if (game.deck.length) player.hand.push(game.deck.pop());
  }
}
function publicState(room) {
  const g=room.game;
  return {
    code:room.code, status:room.status, hostId:room.hostId,
    players:room.players.map(p=>({id:p.id,name:p.name, count:p.hand.length, score:p.score||0})),
    game:g ? {
      currentPlayerId:g.players[g.turn]?.id,
      direction:g.direction,
      topCard:g.discard[g.discard.length-1],
      activeColor:g.activeColor,
      hands:g.players.map(p=>({id:p.id,cards:p.hand.length})),
      scores:g.players.map(p=>({id:p.id,name:p.name,score:p.score||0})),
      roundWinner:g.roundWinner || null,
      champion:g.champion || null,
      drawPending:g.drawPending || 0
    } : null,
    chat:room.chat.slice(-50)
  };
}
function sendRoom(room) {
  io.to(room.code).emit("state", publicState(room));
  room.players.forEach(p => io.to(p.id).emit("your-hand", room.game ? room.game.players.find(x=>x.id===p.id)?.hand || [] : []));
}
function emitError(socket,msg) { socket.emit("notice",msg); }
function nextTurn(g, steps=1) { g.turn=(g.turn + g.direction*steps + g.players.length*2)%g.players.length; }
function startGame(room) {
  const players=room.players.map(p=>({...p,hand:[],score:p.score||0}));
  const g={players,deck:makeDeck(),discard:[],turn:0,direction:1,activeColor:null,drawPending:0,roundWinner:null,champion:null,unoCalled:new Set()};
  players.forEach(p=>drawCards(g,p,7));
  let first=g.deck.pop();
  while(first.color==="wild") { g.deck.unshift(first); first=g.deck.pop(); }
  g.discard.push(first); g.activeColor=first.color;
  if(first.value==="skip") nextTurn(g,1);
  if(first.value==="reverse" && players.length>2) g.direction=-1;
  if(first.value==="draw2") { g.drawPending=2; nextTurn(g,1); }
  room.game=g; room.status="playing"; sendRoom(room);
}
function cardMatches(card, top, activeColor) {
  return card.color==="wild" || card.color===activeColor || card.value===top.value;
}
function scoreHand(hand) {
  return hand.reduce((s,c)=>s+(c.color==="wild"?50:["skip","reverse","draw2"].includes(c.value)?20:Number(c.value)),0);
}
function finishRound(room, winner) {
  const g=room.game; g.roundWinner=winner.name;
  const points=g.players.filter(p=>p.id!==winner.id).reduce((s,p)=>s+scoreHand(p.hand),0);
  winner.score=(winner.score||0)+points;
  const champion=g.players.find(p=>p.score>=300);
  if(champion) g.champion=champion.name;
  room.status="round-over";
}
io.on("connection", socket => {
  socket.on("create-room", ({name}) => {
    const code=makeId();
    const player={id:socket.id,name:String(name||"Player").trim().slice(0,18)||"Player",hand:[],score:0};
    const room={code,hostId:socket.id,players:[player],status:"lobby",game:null,chat:[]};
    rooms.set(code,room); socket.join(code); socket.data.room=code;
    socket.emit("joined",{code,playerId:socket.id}); sendRoom(room);
  });
  socket.on("join-room", ({code,name}) => {
    const room=rooms.get(String(code||"").toUpperCase());
    if(!room) return emitError(socket,"Room not found. Check the code and try again.");
    if(room.status!=="lobby") return emitError(socket,"That game has already started.");
    if(room.players.length>=10) return emitError(socket,"This room is full (10 players maximum).");
    const player={id:socket.id,name:String(name||"Player").trim().slice(0,18)||"Player",hand:[],score:0};
    room.players.push(player); socket.join(room.code); socket.data.room=room.code;
    socket.emit("joined",{code:room.code,playerId:socket.id}); sendRoom(room);
  });
  socket.on("start-game",()=>{
    const room=rooms.get(socket.data.room);
    if(!room || room.hostId!==socket.id) return emitError(socket,"Only the room host can start the game.");
    if(room.players.length<2) return emitError(socket,"Invite at least one more player first.");
    if(room.status!=="lobby" && room.status!=="round-over") return;
    startGame(room);
  });
  socket.on("play-card",({index,color})=>{
    const room=rooms.get(socket.data.room), g=room?.game;
    if(!room||room.status!=="playing"||!g) return;
    const p=g.players[g.turn];
    if(p.id!==socket.id) return emitError(socket,"It's not your turn.");
    const card=p.hand[index], top=g.discard[g.discard.length-1];
    if(!card) return;
    if(g.drawPending && card.value!=="draw2") return emitError(socket,"You must draw the pending cards.");
    if(!cardMatches(card,top,g.activeColor)) return emitError(socket,"That card doesn't match the color or number.");
    if(card.color==="wild" && !COLORS.includes(color)) return emitError(socket,"Choose a color for your wild card.");
    p.hand.splice(index,1); g.discard.push(card);
    if(card.color==="wild") g.activeColor=color; else g.activeColor=card.color;
    if(p.hand.length===1 && !g.unoCalled.has(p.id)) p.unoDeadline=Date.now()+7000;
    else p.unoDeadline=null;
    if(p.hand.length===0) { finishRound(room,p); sendRoom(room); return; }
    if(card.value==="reverse") {
      if(g.players.length===2) nextTurn(g,1);
      else g.direction*=-1;
    } else if(card.value==="skip") nextTurn(g,1);
    else if(card.value==="draw2") { g.drawPending+=2; nextTurn(g,1); }
    else if(card.value==="wild4") { g.drawPending+=4; nextTurn(g,1); }
    else nextTurn(g,1);
    sendRoom(room);
  });
  socket.on("draw-card",()=>{
    const room=rooms.get(socket.data.room),g=room?.game;
    if(!room||room.status!=="playing"||!g) return;
    const p=g.players[g.turn];
    if(p.id!==socket.id) return emitError(socket,"It's not your turn.");
    const amount=g.drawPending||1; drawCards(g,p,amount); g.drawPending=0; nextTurn(g,1); sendRoom(room);
  });
  socket.on("call-uno",()=>{
    const room=rooms.get(socket.data.room),g=room?.game;
    const p=g?.players.find(x=>x.id===socket.id);
    if(p) { g.unoCalled.add(p.id); p.unoDeadline=null; sendRoom(room); }
  });
  socket.on("catch-uno",({playerId})=>{
    const room=rooms.get(socket.data.room),g=room?.game;
    const p=g?.players.find(x=>x.id===playerId);
    if(p && p.hand.length===1 && p.unoDeadline && Date.now()<=p.unoDeadline) {
      drawCards(g,p,2); p.unoDeadline=null; sendRoom(room);
    }
  });
  socket.on("chat-message",({message})=>{
    const room=rooms.get(socket.data.room);
    if(!room) return;
    const p=room.players.find(x=>x.id===socket.id);
    const msg=String(message||"").trim().slice(0,240);
    if(!p||!msg) return;
    room.chat.push({name:p.name,message:msg,at:Date.now()});
    room.chat=room.chat.slice(-100); io.to(room.code).emit("chat-update",room.chat.slice(-50));
  });
  socket.on("new-round",()=>{
    const room=rooms.get(socket.data.room);
    if(!room||room.hostId!==socket.id||room.status!=="round-over") return;
    startGame(room);
  });
  socket.on("disconnect",()=>{
    const code=socket.data.room,room=rooms.get(code);
    if(!room) return;
    room.players=room.players.filter(p=>p.id!==socket.id);
    if(room.game) room.game.players=room.game.players.filter(p=>p.id!==socket.id);
    if(room.hostId===socket.id && room.players.length) room.hostId=room.players[0].id;
    if(room.players.length===0) rooms.delete(code);
    else { if(room.game && room.game.players.length<2) room.status="lobby"; sendRoom(room); }
  });
});
server.listen(PORT,()=>console.log(`UNO server listening on ${PORT}`));
