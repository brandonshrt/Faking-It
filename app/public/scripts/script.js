// public/script.js
const socket = io();

// Create new game
function createGame() {
  socket.emit("createGame");
}

function goToJoin() {
    window.location.href = "/pages/join.html";
}

// Join existing game
function joinGame() {
  const code = prompt("Enter game code:");
  if (!code) return;
  window.location.href = `setup.html?code=${code.toUpperCase()}`;
}

// Receive game creation confirmation
socket.on("gameCreated", ({ code }) => {
  localStorage.setItem("gameCode", code);
  //console.log("Game created:", code);
  // Redirect to setup page with game code
  window.location.href = "/pages/join.html";
  window.location.href = `/pages/setup.html?code=${code}`;
});

// Handle any server-side errors
socket.on("errorMessage", (msg) => {
  alert(msg);
});
