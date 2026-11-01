// UNO Together browser game
const socket=io();
const $=id=>document.getElementById(id);
let myId=null, roomCode=null, state=null, hand=[], pendingCardIndex=null;
const lobby=$("lobby-screen"), game=$("game-screen");
function showNotice(msg){$("notice").textContent=msg;$("notice").classList.remove("hidden");setTimeout(()=>$("notice").classList.add("hidden"),4200)}
function enterRoom(code){roomCode=code;$("room-code").textContent=code;lobby.classList.add("hidden");game.classList.remove("hidden")}
$("create-form").addEventListener("submit",e=>{e.preventDefault();socket.emit("create-room",{name:$("create-name").value})});
$("join-form").addEventListener("submit",e=>{e.preventDefault();socket.emit("join-room",{name:$("join-name").value,code:$("join-code").value.trim().toUpperCase()})});
socket.on("joined",({code,playerId})=>{myId=playerId;enterRoom(code)});
socket.on("notice",showNotice);
socket.on("state",s=>{state=s;render()});
socket.on("your-hand",h=>{hand=h;renderHand()});
socket.on("chat-update",messages=>renderChat(messages));
$("copy-code").onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);showNotice("Invite code copied! Share it with your players.");}catch{showNotice("Your room code is "+roomCode)}};
$("start-btn").onclick=()=>socket.emit("start-game");
$("new-round-btn").onclick=()=>socket.emit("new-round");
$("draw-btn").onclick=()=>socket.emit("draw-card");
$("uno-btn").onclick=()=>socket.emit("call-uno");
$("chat-form").addEventListener("submit",e=>{e.preventDefault();const input=$("chat-input");if(input.value.trim()){socket.emit("chat-message",{message:input.value});input.value=""}});
function labelCard(c){return c.value==="wild"?"WILD":c.value==="wild4"?"WILD +4":c.value==="draw2"?"+2":c.value==="reverse"?"↔":c.value==="skip"?"⊘":c.value}
function render(){
 if(!state)return;
 $("players").innerHTML=state.players.map(p=>`<div class="player-pill ${state.game?.currentPlayerId===p.id?"active":""}"><b>${esc(p.name)}${p.id===myId?" (you)":""}</b><span class="count">${p.count} cards</span></div>`).join("");
 $("scoreboard").innerHTML=state.players.map(p=>`<div class="score-row"><span>${esc(p.name)}${p.id===myId?" (you)":""}</span><strong>${p.score||0}</strong></div>`).join("");
 const host=state.hostId===myId;
 $("start-btn").classList.toggle("hidden",!(state.status==="lobby"&&host));
 $("new-round-btn").classList.toggle("hidden",!(state.status==="round-over"&&host&&!state.game?.champion));
 $("start-btn").disabled=state.players.length<2;
 if(state.game){
   const c=state.game.topCard;$("top-card").className="card "+c.color;$("top-card").textContent=labelCard(c);
   const active=state.game.currentPlayerId===myId;
   const current=state.players.find(p=>p.id===state.game.currentPlayerId);
   $("turn-label").textContent=state.status==="round-over"?(state.game.champion?`${state.game.champion} wins the game! 🏆`:`${state.game.roundWinner} wins the round!`):active?"Your turn!":`${current?.name||"A player"} is playing…`;
   $("color-label").textContent=`Active color: ${state.game.activeColor.toUpperCase()}${state.game.drawPending?` · Draw ${state.game.drawPending}`:""}`;
   $("draw-btn").disabled=!active||state.status!=="playing";
 }else{$("top-card").className="card";$("top-card").textContent="?";$("turn-label").textContent="Waiting for the host to start";$("color-label").textContent="";}
 if(state.status==="round-over") showNotice(state.game.champion?`${state.game.champion} reached 300 points and wins the game!`:`${state.game.roundWinner} won the round!`);
 renderChat(state.chat||[]);renderHand();
}
function renderHand(){
 if(!state)return;
 const active=state.status==="playing"&&state.game?.currentPlayerId===myId;
 $("hand").innerHTML="";
 hand.forEach((c,i)=>{const b=document.createElement("button");b.className=`hand-card ${c.color}`;b.textContent=labelCard(c);b.disabled=!active;b.title=`${c.color} ${c.value}`;b.onclick=()=>play(i,c);$("hand").appendChild(b)});
 $("uno-btn").disabled=hand.length===0||state.status!=="playing";
}
function play(index,card){
 const top=state.game.topCard;
 const valid=card.color==="wild"||card.color===state.game.activeColor||card.value===top.value;
 if(!valid){showNotice("Play a matching color, number, or wild card.");return}
 if(state.game.drawPending&&card.value!=="draw2"){showNotice("You must draw the pending cards.");return}
 if(card.color==="wild"){pendingCardIndex=index;$("wild-dialog").showModal()}
 else socket.emit("play-card",{index});
}
document.querySelectorAll(".color-choices button").forEach(b=>b.onclick=()=>{socket.emit("play-card",{index:pendingCardIndex,color:b.dataset.color});$("wild-dialog").close()});
function renderChat(messages){$("chat-log").innerHTML=(messages||[]).map(m=>`<div class="chat-msg"><b>${esc(m.name)}</b>${esc(m.message)}</div>`).join("");$("chat-log").scrollTop=$("chat-log").scrollHeight}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
