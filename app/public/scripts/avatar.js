// public/avatar.js
const socket = io();
let selectedAvatar = null;

// Parse the game code from the URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get("code");

function selectAvatar(avatarName) {
  localStorage.setItem("avatar", avatarName);
  selectedAvatar = avatarName;
  document.querySelectorAll(".avatar-option").forEach(opt => opt.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
  document.getElementById("continueBtn").disabled = false;
}

function continueToGame() {
  const playerName = document.getElementById("playerName").value.trim();
  if (!playerName || !selectedAvatar) return alert("Enter a name and pick an avatar first!");

  const playerId = crypto.randomUUID(); // unique per browser
  const player = { name: playerName, avatar: selectedAvatar, id: playerId };

  // Save locally
  localStorage.setItem("playerId", playerId);
  localStorage.setItem("playerName", playerName);
  localStorage.setItem("playerAvatar", selectedAvatar);
  localStorage.setItem("gameCode", gameCode);

  // Join game
  socket.emit("joinGame", { code: gameCode, player });

  // Redirect to create screen (host view)
  window.location.href = `/pages/create.html?code=${gameCode}`;
}

socket.on("errorMessage", (msg) => alert(msg));

socket.on("playerListUpdate", (players) => {
  console.log(players);
});
