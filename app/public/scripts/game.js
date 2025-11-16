// public/scripts/game.js
const socket = io();

// game / player info
const params = new URLSearchParams(window.location.search);
const code = params.get("code") || localStorage.getItem("gameCode");
const playerId = localStorage.getItem("playerId");
const playerName = localStorage.getItem("playerName");

// Chat elements
const chatInput = document.getElementsByClassName("chat-input")[0];
const chatSend = document.getElementsByClassName("chat-send")[0];
const chatMessages = document.getElementsByClassName("chat-messages")[0];

// Colors to rotate through for player names
const nameColors = [
  "#4caf50", // green
  "#ff9800", // orange
  "#03a9f4", // blue
  "#e91e63", // pink
  "#9c27b0", // purple
  "#fff176", // yellow
  "#f44336"  // red
];

// Store mapping: player name -> color
const playerColors = {};

// Show one chat message in the chat box
function addChatMessage(name, text) {
  // Assign a color if this name doesn't have one yet
  if (!playerColors[name]) {
    const colorIndex = Object.keys(playerColors).length % nameColors.length;
    playerColors[name] = nameColors[colorIndex];
  }

  const color = playerColors[name];

  const div = document.createElement("div");
  div.innerHTML =
    "<span style='color:" + color + "; font-weight:bold;'>" +
    name + ":</span> " + text;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight; // auto-scroll to bottom
}

// Send the current input as a chat message
function sendChatMessage() {
  const text = chatInput.value.trim();
  if (text === "") return;

  socket.emit("chatMessage", {
    code: code,          // game room code from top of file
    name: playerName,    // from localStorage at top of file
    text: text
  });

  chatInput.value = "";
}

// Send when clicking the button
chatSend.addEventListener("click", sendChatMessage);

// Send when pressing Enter inside the input
chatInput.addEventListener("keypress", function (event) {
  if (event.key === "Enter") {
    sendChatMessage();
  }
});

// UI refs
const roundLabel = document.getElementById("roundLabel");
const clock = document.getElementById("clock");
const leftPlayerList = document.getElementById("leftPlayerList");
const questionText = document.getElementById("questionText");
const answerInput = document.getElementById("answerInput");
const submitAnswerBtn = document.getElementById("submitAnswerBtn");
const afterAnswer = document.getElementById("afterAnswer");
const revealArea = document.getElementById("revealArea");
const answersList = document.getElementById("answersList");
const votingArea = document.getElementById("votingArea");
const voteForm = document.getElementById("voteForm");
const submitVoteBtn = document.getElementById("submitVoteBtn");

let roundTimer; // client-side countdown
let remainingMs = 0;

// join game room so server sends updates
socket.emit("joinGameRoom", { code, playerId });

// update players shown in left column
socket.on("updatePlayers", (players) => {
  renderPlayersSide(players);
});

socket.on("chatMessage", (msg) => {
  addChatMessage(msg.name, msg.text);
});

// When a new round begins, server sends question to this client individually
socket.on("roundQuestion", ({ round, question, timeMs }) => {
  // set UI for answering
  roundLabel.textContent = `Round ${round}`;
  revealArea.style.display = "none";
  questionText.textContent = question;
  answerInput.value = "";
  answerInput.disabled = false;
  submitAnswerBtn.disabled = false;
  afterAnswer.style.display = "none";
  document.getElementById("answerArea").style.display = "block";
  remainingMs = timeMs;
  startClientCountdown(timeMs);
});

// Show overall round info
socket.on("roundStartedInfo", ({ round, numPlayers }) => {
  roundLabel.textContent = `Round ${round}`;
});

// when user submits their answer, UI shows waiting
submitAnswerBtn.addEventListener("click", () => {
  const answer = answerInput.value.trim();
  if (!answer) return alert("Please enter an answer.");
  // send to server
  socket.emit("submitAnswer", { code, playerId, answer });
  answerInput.disabled = true;
  submitAnswerBtn.disabled = true;
  document.getElementById("answerArea").style.display = "none";
  afterAnswer.style.display = "block";
});

// server reveals answers + majority and begins voting phase
socket.on("revealAnswers", ({ answers, majority, deliberationTimeMs }) => {
  document.getElementById("answerArea").style.display = "none";
  afterAnswer.style.display = "none";
  revealArea.style.display = "block";
  answersList.innerHTML = "";

  // Show majority suggestion
  if (majority) {
    const maj = document.createElement("p");
    maj.innerHTML = `<strong>Majority answer:</strong> ${majority}`;
    answersList.appendChild(maj);
  }

  // Show answers next to players
  answers.forEach(a => {
    const el = document.createElement("div");
    el.classList.add("answer-entry");
    el.innerHTML = `<strong>${a.name}:</strong> ${a.answer || "<i>(no answer)</i>"}`;
    answersList.appendChild(el);
  });

  // prepare voting UI
  votingArea.style.display = "block";
  voteForm.innerHTML = "";
  answers.forEach(a => {
    // create radio option
    const id = `vote_${a.id}`;
    const r = document.createElement("div");
    r.innerHTML = `<label><input type="radio" name="vote" value="${a.id}" /> ${a.name}</label>`;
    voteForm.appendChild(r);
  });

  // start deliberation countdown
  remainingMs = deliberationTimeMs;
  startClientCountdown(deliberationTimeMs);
});

// Submit vote
submitVoteBtn.addEventListener("click", () => {
  const selected = voteForm.querySelector("input[name='vote']:checked");
  if (!selected) return alert("Pick someone to vote for!");
  const votedForId = selected.value;
  socket.emit("submitVote", { code, voterId: playerId, votedForId });
  submitVoteBtn.disabled = true;
  submitVoteBtn.textContent = "Voted";
});

// show final vote results and highlight cards
socket.on("voteResults", ({ voteCounts, topId, fakerId, players }) => {
  // highlight left sidebar players
  // players is array with points included
  renderPlayersSide(players);

  // highlight cards: green if voted correctly, red if incorrectly — we'll show per-voter feedback
  // Show a summary below answersList
  const result = document.createElement("div");
  result.innerHTML = `<h4>Vote results</h4>
    <p>Player with most votes: ${topId || "nobody"}</p>
    <p>Faker: ${fakerId}</p>`;
  answersList.appendChild(result);

  // reset voting UI
  votingArea.style.display = "none";
  submitVoteBtn.disabled = false;
  submitVoteBtn.textContent = "Submit Vote";
});

// generic error
socket.on("errorMessage", (msg) => alert(msg));

// util: render players in left column (show points)
function renderPlayersSide(players) {
  leftPlayerList.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    li.className = "player-card";
    li.innerHTML = `
      <div class="player-icon"><img src="../assets/icons/${p.avatar}.png" /></div>
      <div class="player-meta"><div class="player-name">${p.name}</div>
      <div class="player-points">${p.points || 0} pts</div></div>
    `;
    leftPlayerList.appendChild(li);
  });
}

// client-side countdown display
function startClientCountdown(ms) {
  clearInterval(roundTimer);
  const end = Date.now() + ms;
  roundTimer = setInterval(() => {
    const rem = Math.max(0, end - Date.now());
    const s = Math.ceil(rem / 1000);
    clock.textContent = `${s}s`;
    if (rem <= 0) {
      clearInterval(roundTimer);
      clock.textContent = "0s";
    }
  }, 200);
}
