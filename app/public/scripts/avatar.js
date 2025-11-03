// public/avatar.js
const socket = io();
let selectedAvatar = null;

// Parse the game code from the URL
const urlParams = new URLSearchParams(window.location.search);
const gameCode = urlParams.get("code");

function selectAvatar(avatarName) {
  selectedAvatar = avatarName;
  document.querySelectorAll(".avatar-option").forEach(opt => opt.classList.remove("selected"));
  event.currentTarget.classList.add("selected");
  document.getElementById("continueBtn").disabled = false;
}

function continueToGame() {
  const playerName = document.getElementById("playerName").value.trim();
  if (!playerName || !selectedAvatar) return alert("Enter a name and pick an avatar first!");

  const player = { name: playerName, avatar: selectedAvatar };
  socket.emit("joinGame", { code: gameCode, player });

  // Move to waiting room / game page
  localStorage.setItem("playerName", playerName);
  localStorage.setItem("playerAvatar", selectedAvatar);
  localStorage.setItem("gameCode", gameCode);
  window.location.href = `create.html?code=${gameCode}`;
}

socket.on("errorMessage", (msg) => alert(msg));
